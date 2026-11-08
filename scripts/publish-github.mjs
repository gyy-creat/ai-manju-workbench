// 把仓库推到 GitHub，并把桌面版 zip 挂到 Release。
//
// 凭据只从本机读，绝不进对话、不进 git：
//   1) 环境变量 GITHUB_TOKEN
//   2) E:/ai项目/.secrets/github.md 里写一行  token: ghp_xxx
//   3) E:/ai项目/.secrets/github.md 里写一行  owner: 你的用户名
//
// 用法：
//   node scripts/publish-github.mjs                    # 按 .secrets 里的 owner/repo 推
//   node scripts/publish-github.mjs --owner foo --repo ai-manju-workbench
//   node scripts/publish-github.mjs --dry                # 只体检，不发请求
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SECRET = 'E:/ai项目/.secrets/github.md'
const API = 'https://api.github.com'

const argv = process.argv.slice(2)
const flag = (name, def = '') => {
  const i = argv.indexOf('--' + name)
  return i >= 0 ? argv[i + 1] ?? def : def
}
const has = (name) => argv.includes('--' + name)

function readSecrets() {
  const out = {}
  if (!fs.existsSync(SECRET)) return out
  for (const line of fs.readFileSync(SECRET, 'utf8').split('\n')) {
    const m = line.match(/^\s*(token|owner|repo)\s*[:=]\s*(\S+)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const sec = readSecrets()
const token = process.env.GITHUB_TOKEN || sec.token || ''
const owner = flag('owner', sec.owner || '')
const repo = flag('repo', sec.repo || 'ai-manju-workbench')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const ver = pkg.version
const zipRel = `exports/app/AI漫剧工作台-${ver}-win-x64.zip`
const zipAbs = path.join(root, zipRel)

if (has('dry')) {
  console.log('token:', token ? `有（${token.slice(0, 4)}…${token.slice(-4)}）` : '没有')
  console.log('owner:', owner || '（缺）')
  console.log('repo :', repo)
  console.log('版本 :', ver)
  console.log('zip  :', fs.existsSync(zipAbs) ? `${zipRel} ${(fs.statSync(zipAbs).size / 1048576).toFixed(1)}MB` : '（缺）')
  console.log('git  :', fs.existsSync(path.join(root, '.git')) ? '已初始化' : '（缺）')
  console.log('\n要真正发：在 ' + SECRET + ' 写两行（owner / token），然后不带 --dry 再跑一次。')
  process.exit(0)
}

if (!token) {
  console.error(`缺 token。在 ${SECRET} 里写一行：\n  token: ghp_xxxxxxxx\n（Fine-grained token 勾 Public 仓库的 Contents: Read and write；Classic token 勾 repo 即可）`)
  process.exit(1)
}
if (!owner) {
  console.error(`缺 owner。在 ${SECRET} 里写一行：\n  owner: 你的 GitHub 用户名`)
  process.exit(1)
}

const gh = (p, opts = {}) =>
  fetch(API + p, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ai-manju-workbench-publish',
      ...(opts.headers || {}),
    },
  })

// ── 1. 仓库是否存在，没有就建 ──
let r = await gh(`/repos/${owner}/${repo}`)
if (r.status === 404) {
  console.log(`建仓库 ${owner}/${repo} …`)
  r = await gh('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repo,
      description: pkg.description,
      homepage: `https://github.com/${owner}/${repo}`,
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      license_template: 'mit',
    }),
  })
  if (!r.ok) {
    console.error('建仓库失败', r.status, (await r.text()).slice(0, 400))
    process.exit(1)
  }
  console.log('  已创建')
} else if (r.ok) {
  const j = await r.json()
  console.log(`仓库已存在：${j.full_name}（${j.visibility}）`)
} else {
  console.error('查仓库失败', r.status, (await r.text()).slice(0, 300))
  process.exit(1)
}

// ── 2. 把占位 beihesan 换成真实 owner（只改本地文件，改动随后一起提交） ──
for (const f of ['package.json', 'README.md']) {
  const p = path.join(root, f)
  if (!fs.existsSync(p)) continue
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('beihesan')) continue
  s = s.replaceAll('beihesan', owner)
  fs.writeFileSync(p, s)
  console.log(`  ${f}：beihesan → ${owner}`)
}

// ── 3. push ──
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
const run = (label, ...a) => {
  try {
    const out = git(...a)
    console.log(`  ${label} ✓ ${out.trim().split('\n')[0] || ''}`)
    return out
  } catch (e) {
    console.error(`  ${label} ✗\n${(e.stderr || e.stdout || e.message || '').toString().slice(0, 600)}`)
    return null
  }
}

console.log('提交并推送 …')
run('add', 'add', '-A')
try {
  git('commit', '-q', '-m', `chore: 指向 ${owner}/${repo}`)
  console.log('  commit ✓')
} catch {
  console.log('  commit 跳过（没有新改动）')
}
const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
run('push', 'push', '--set-upstream', remoteUrl, 'main:main', '--force')

// 远端地址不留 token
try {
  git('remote', 'set-url', 'origin', `https://github.com/${owner}/${repo}.git`)
} catch {}

// ── 4. Release + 附件 ──
if (!fs.existsSync(zipAbs)) {
  console.log(`\n跳过 Release：${zipRel} 不存在（先跑 node scripts/zip-utf8.mjs）`)
  process.exit(0)
}
const tag = `v${ver}`
const notesPath = path.join(root, '.github', `RELEASE-${ver}.md`)
const body = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : `AI 漫剧工作台 ${ver}`

let rel = await gh(`/repos/${owner}/${repo}/releases/tags/${tag}`)
if (rel.status === 404) {
  console.log(`建 Release ${tag} …`)
  rel = await gh(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: `AI 漫剧工作台 ${ver}`, body, draft: false, prerelease: false }),
  })
  if (!rel.ok) {
    console.error('建 Release 失败', rel.status, (await rel.text()).slice(0, 400))
    process.exit(1)
  }
}
const relJson = await rel.json()
console.log(`  Release: ${relJson.html_url}`)

const assetName = path.basename(zipAbs)
const existing = (relJson.assets || []).find((a) => a.name === assetName)
if (existing) {
  console.log(`  附件已存在，先删旧的上传新的 …`)
  await gh(`/repos/${owner}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' })
}

const buf = fs.readFileSync(zipAbs)
console.log(`上传 ${assetName}（${(buf.length / 1048576).toFixed(1)}MB）…`)
const up = await fetch(`https://uploads.github.com/repos/${owner}/${repo}/releases/${relJson.id}/assets?name=${encodeURIComponent(assetName)}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/zip',
    'Content-Length': String(buf.length),
    'User-Agent': 'ai-manju-workbench-publish',
  },
  body: buf,
})
if (!up.ok) {
  console.error('上传失败', up.status, (await up.text()).slice(0, 400))
  process.exit(1)
}
const asset = await up.json()
console.log(`  ✓ ${(asset.size / 1048576).toFixed(1)}MB  ${asset.browser_download_url}`)
console.log(`\n完成：https://github.com/${owner}/${repo}`)
