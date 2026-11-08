// Skill 市场：从 GitHub 搜索 AI 漫剧相关的开源 skill，按 Star / 下载量排行，
// 支持一键下载到本地（小仓库整包、大仓库只取说明文档）。
//
// 这一份是**唯一实现**：工作台的 `/api/skills/*` 与命令行 `mjw-skills` 都调它，
// 避免两套口径（榜单排序、过滤规则、落盘位置）慢慢跑偏。
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const pexec = promisify(execFile)

const GH_API = 'https://api.github.com'
const CACHE_MS = 24 * 3600 * 1000

// 这几组查询合起来覆盖中英文的漫剧 / 短剧 / 分镜 skill 生态
export const SKILL_QUERIES = [
  '漫剧',
  '短剧 skill',
  'comic drama skill',
  'manju skill',
  'ai comic storyboard',
  '分镜 skill',
  'novel to comic',
]

// 搜索结果里的噪音（弹幕客户端、CMS、社区公告之类）靠这两个正则过滤
export const SKILL_KEEP = /漫剧|短剧|分镜|漫画|动漫|comic|drama|storyboard|manga|anime|skill|提示词|剧本|manju/i
export const SKILL_NOISE = /弹幕|番剧源|内容管理系统|CMS|社区|爱好者|破解|种子|汉化|播放器|下载器/i

const DOC_ORDER = ['SKILL.md', 'skill.md', 'README.zh-CN.md', 'README.zh.md', 'README.md', 'readme.md']
export const MAX_DOC_CHARS = 6000
export const MAX_DOCS = 4

/** 默认的原子写：临时文件 + rename，断电不会留下半个 JSON */
async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  const text = JSON.stringify(data, null, 2)
  const fh = await fs.open(tmp, 'w')
  try {
    await fh.writeFile(text, 'utf8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  try {
    await fs.rename(tmp, file)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw e
  }
}

async function atomicRead(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function skillIdOf(fullName) {
  return String(fullName || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '__')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

/**
 * @param {object} opts
 * @param {string} opts.rootDir   仓库根（skills/ 落在这里）
 * @param {string} opts.dataDir   数据目录（skills.json 落在这里）
 * @param {string} [opts.home]    只给 skills/ 与 skills.json 一个统一根（CLI 用它）
 */
export function createSkillHub({ rootDir, dataDir, home, readJson, writeJson, token } = {}) {
  const base = home ? path.resolve(home) : path.resolve(rootDir || '.')
  const skillsDir = path.join(base, 'skills')
  const skillsFile = path.join(home ? base : path.resolve(dataDir || path.join(base, 'data')), 'skills.json')
  const read = readJson || atomicRead
  const write = writeJson || atomicWrite

  async function ghGet(p, { timeout = 15000 } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ai-manju-workbench' }
    const tk = token || process.env.GITHUB_TOKEN
    if (tk) headers.Authorization = `Bearer ${tk}`
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeout)
    try {
      const r = await fetch(`${GH_API}${p}`, { headers, signal: ctl.signal })
      const j = await r.json().catch(() => null)
      return { status: r.status, j }
    } finally {
      clearTimeout(timer)
    }
  }

  function normalizeRepo(it) {
    const fullName = String(it.full_name || '')
    if (!fullName.includes('/')) return null
    return {
      id: skillIdOf(fullName),
      fullName,
      owner: String(it.owner?.login || fullName.split('/')[0]),
      name: String(it.name || fullName.split('/')[1] || ''),
      desc: String(it.description || '').slice(0, 220),
      url: String(it.html_url || ''),
      stars: Number(it.stargazers_count) || 0,
      forks: Number(it.forks_count) || 0,
      issues: Number(it.open_issues_count) || 0,
      lang: String(it.language || ''),
      license: String(it.license?.spdx_id || ''),
      topics: Array.isArray(it.topics) ? it.topics.slice(0, 6) : [],
      sizeKb: Number(it.size) || 0,
      pushedAt: String(it.pushed_at || ''),
      createdAt: String(it.created_at || ''),
      defaultBranch: String(it.default_branch || 'main'),
      downloads: 0,
    }
  }

  // GitHub 没有仓库级下载计数，只能汇总 Release 资产
  async function fetchDownloads(fullName) {
    const r = await ghGet(`/repos/${fullName}/releases?per_page=10`)
    if (r.status !== 200 || !Array.isArray(r.j)) return 0
    let n = 0
    for (const rel of r.j) for (const a of rel.assets || []) n += Number(a.download_count) || 0
    return n
  }

  async function loadSkills() {
    const cur = await read(skillsFile, null)
    const base0 = { version: 1, fetchedAt: '', items: [], installed: {} }
    const sm = cur && typeof cur === 'object' ? { ...base0, ...cur } : base0
    if (!sm.installed || typeof sm.installed !== 'object') sm.installed = {}
    if (!Array.isArray(sm.items)) sm.items = []
    return sm
  }

  async function saveSkills(sm) {
    await write(skillsFile, { version: 1, fetchedAt: sm.fetchedAt, items: sm.items, installed: sm.installed })
  }

  /** 拉榜单。7 组查询各取 star 前 15 → 两层过滤 → 去重 → 取前 60 → 给前 12 补下载量 */
  async function refreshSkills({ queries = SKILL_QUERIES, limit = 60, downloadTop = 12 } = {}) {
    const bucket = new Map()
    let okCount = 0
    let lastErr = ''
    for (const q of queries) {
      const r = await ghGet(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`)
      if (r.status !== 200) {
        lastErr = r.j?.message || `HTTP ${r.status}`
        continue
      }
      okCount++
      for (const it of r.j.items || []) {
        const sk = normalizeRepo(it)
        if (!sk) continue
        const hay = `${sk.name} ${sk.desc} ${sk.topics.join(' ')}`
        if (!SKILL_KEEP.test(hay)) continue
        if (SKILL_NOISE.test(`${sk.desc} ${sk.topics.join(' ')}`)) continue
        if (/\.github$/i.test(sk.name)) continue
        if (!bucket.has(sk.fullName)) bucket.set(sk.fullName, sk)
      }
    }
    if (!okCount) throw new Error(lastErr || 'GitHub 搜索失败')
    const items = [...bucket.values()].sort((a, b) => b.stars - a.stars).slice(0, limit)
    // 只抓星数靠前的几个，免得一次刷新把匿名额度（60/小时）吃光
    for (const it of items.slice(0, downloadTop)) {
      try {
        it.downloads = await fetchDownloads(it.fullName)
      } catch {
        /* 单个失败忽略 */
      }
    }
    return items
  }

  async function pickSkillFiles(fullName, branch) {
    const r = await ghGet(`/repos/${fullName}/contents/?ref=${encodeURIComponent(branch || 'main')}`)
    if (r.status !== 200 || !Array.isArray(r.j)) return []
    const names = r.j.filter((x) => x.type === 'file').map((x) => x.name)
    const picked = DOC_ORDER.filter((n) => names.includes(n))
    const extra = names
      .filter((n) => /\.md$/i.test(n) && !picked.includes(n) && n.length < 60)
      .sort((x, y) => x.localeCompare(y))
      .slice(0, 4)
    return [...picked, ...extra].slice(0, 6)
  }

  /** 已下载 skill 的规则文档正文（最多 6000 字），找不到返回 null */
  async function loadSkillDoc(id) {
    const key = String(id || '').trim()
    if (!key) return null
    const sm = await loadSkills()
    const rec = sm.installed[key]
    if (!rec) return null
    const dir = rec.dir || path.join(skillsDir, key)
    let file = ''
    for (const n of DOC_ORDER) {
      const p = path.join(dir, n)
      const st = await fs.stat(p).catch(() => null)
      if (st?.isFile()) {
        file = p
        break
      }
    }
    // 整包仓库常把 skill 放在子目录（xxx/sd-asset-engine/SKILL.md），往下找一层
    if (!file) {
      const tops = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const t of tops) {
        if (!t.isDirectory() || t.name.startsWith('_') || t.name === 'node_modules') continue
        for (const n of DOC_ORDER) {
          const p = path.join(dir, t.name, n)
          const st = await fs.stat(p).catch(() => null)
          if (st?.isFile()) {
            file = p
            break
          }
        }
        if (file) break
      }
    }
    if (!file) return null
    const text = String(await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n').trim()
    return {
      id: key,
      fullName: rec.fullName || key,
      file: path.relative(dir, file) || path.basename(file),
      chars: text.length,
      text: text.slice(0, MAX_DOC_CHARS),
      truncated: text.length > MAX_DOC_CHARS,
    }
  }

  /** 批量读（去重、最多 4 份、读不到的跳过） */
  async function loadSkillDocs(ids) {
    const list = (Array.isArray(ids) ? ids : [ids])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, MAX_DOCS)
    const out = []
    for (const id of list) {
      const d = await loadSkillDoc(id)
      if (d) out.push(d)
    }
    return out
  }

  /**
   * 下载到 skills/<id>/。
   * 小于 8MB 的仓库整包下（zip → tar 解压 → 把内层目录提上来）；
   * 更大的只取说明文档，避免为了一份规则拖几十 MB。
   */
  async function downloadSkill(fullName, item) {
    const safeId = skillIdOf(fullName)
    if (!safeId) throw new Error('仓库名不合法')
    const dir = path.join(skillsDir, safeId)
    // 重装等于覆盖：先清空，免得上一版残留混进来
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true })

    const branch = item?.defaultBranch || 'main'
    const sizeKb = Number(item?.sizeKb) || 0
    let mode = 'docs'
    const files = []

    if (sizeKb > 0 && sizeKb <= 8000) {
      const zipUrl = `https://codeload.github.com/${fullName}/zip/refs/heads/${encodeURIComponent(branch)}`
      const tmpZip = path.join(dir, '_repo.zip')
      try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 60000)
        const r = await fetch(zipUrl, { signal: ctl.signal })
        clearTimeout(timer)
        if (r.ok) {
          await fs.writeFile(tmpZip, Buffer.from(await r.arrayBuffer()))
          await pexec('tar', ['-xf', tmpZip, '-C', dir], { timeout: 60000, windowsHide: true })
          const entries = await fs.readdir(dir, { withFileTypes: true })
          const top = entries.find((e) => e.isDirectory() && e.name !== '.' && !e.name.startsWith('_'))
          if (top) {
            const inner = path.join(dir, top.name)
            for (const e of await fs.readdir(inner)) {
              await fs.rename(path.join(inner, e), path.join(dir, e))
            }
            await fs.rm(inner, { recursive: true, force: true })
          }
          mode = 'repo'
        }
      } catch {
        /* 整包失败就退回只取文档 */
      } finally {
        await fs.rm(tmpZip, { force: true })
      }
    }

    if (mode === 'docs') {
      const picked = await pickSkillFiles(fullName, branch)
      if (!picked.length) throw new Error('这个仓库根目录没有 SKILL.md 或 README.md')
      for (const n of picked) {
        const r = await ghGet(`/repos/${fullName}/contents/${encodeURIComponent(n)}?ref=${encodeURIComponent(branch)}`)
        if (r.status !== 200 || !r.j?.content) continue
        await fs.writeFile(path.join(dir, n), Buffer.from(String(r.j.content), 'base64').toString('utf8'))
        files.push(n)
      }
      if (!files.length) throw new Error('说明文档拉取失败')
    } else {
      files.push(...(await fs.readdir(dir)).slice(0, 30))
    }

    await fs.writeFile(
      path.join(dir, '_skill.json'),
      JSON.stringify(
        {
          fullName,
          url: item?.url || `https://github.com/${fullName}`,
          stars: item?.stars ?? null,
          branch,
          mode,
          files,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
    return { dir, mode, files }
  }

  /** 装（或重装）一个仓库，并把安装记录写进 skills.json */
  async function installSkill(fullName, item) {
    const id = skillIdOf(fullName)
    let meta = item
    if (!meta) {
      const r = await ghGet(`/repos/${fullName}`)
      if (r.status !== 200) throw new Error('仓库不存在或无法访问')
      meta = normalizeRepo(r.j)
    }
    const res = await downloadSkill(fullName, meta)
    let downloads = meta?.downloads || 0
    if (!downloads) {
      downloads = await fetchDownloads(fullName).catch(() => 0)
    }
    const sm = await loadSkills()
    sm.installed[id] = {
      fullName,
      dir: res.dir,
      mode: res.mode,
      at: new Date().toISOString(),
      stars: meta?.stars ?? null,
      downloads,
    }
    await saveSkills(sm)
    return { id, ...res, downloads }
  }

  async function removeSkill(fullName) {
    const id = skillIdOf(fullName)
    const sm = await loadSkills()
    const rec = sm.installed[id]
    await fs.rm(rec?.dir || path.join(skillsDir, id), { recursive: true, force: true })
    if (rec) {
      delete sm.installed[id]
      await saveSkills(sm)
      return true
    }
    return false
  }

  /** 榜单：走 24 小时缓存，refresh 才真打 GitHub */
  async function listSkills({ refresh = false, force = false } = {}) {
    const sm = await loadSkills()
    const fresh = sm.fetchedAt && Date.now() - Date.parse(sm.fetchedAt) < CACHE_MS
    let items = sm.items
    let source = 'cache'
    let warning = ''
    if (refresh || !fresh || force) {
      try {
        items = await refreshSkills()
        sm.items = items
        sm.fetchedAt = new Date().toISOString()
        await saveSkills(sm)
        source = 'github'
      } catch (e) {
        warning = String(e && e.message ? e.message : e)
        source = items.length ? 'cache' : 'empty'
      }
    }
    return {
      items: items.map((it) => ({
        ...it,
        installed: !!sm.installed[it.id],
        installedAt: sm.installed[it.id]?.at || '',
        localPath: sm.installed[it.id]?.dir || '',
        installMode: sm.installed[it.id]?.mode || '',
      })),
      fetchedAt: sm.fetchedAt,
      source,
      warning,
    }
  }

  return {
    skillsDir,
    skillsFile,
    ghGet,
    loadSkills,
    saveSkills,
    refreshSkills,
    pickSkillFiles,
    fetchDownloads,
    loadSkillDoc,
    loadSkillDocs,
    downloadSkill,
    installSkill,
    removeSkill,
    listSkills,
    skillIdOf,
  }
}
