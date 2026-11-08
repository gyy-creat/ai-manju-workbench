/**
 * comfy-run.mjs 的源码模板。
 * 导出时把 TASKS 换成实际任务数组，用户拿到的是一个自包含、零依赖的脚本，
 * 拷到跑图那台机器上 `node comfy-run.mjs` 就能跑。
 */

export const COMFY_RUN_SCRIPT = String.raw`#!/usr/bin/env node
/**
 * ComfyUI 任务包执行器 —— 由「AI 漫剧工作台」导出，零依赖，node 18+ 可直接跑。
 *
 * 用法：
 *   node comfy-run.mjs                        # 跑全部
 *   node comfy-run.mjs --url http://192.168.1.9:8188
 *   node comfy-run.mjs --out ./renders         # 输出目录（默认 ./renders）
 *   node comfy-run.mjs --only 1,2              # 只跑第 1、2 集
 *   node comfy-run.mjs --from sc_x_ep1_s07     # 从这个任务开始（断点续跑另一种写法）
 *   node comfy-run.mjs --dry                   # 只打印要提交什么，不真跑
 *   node comfy-run.mjs --gap 300               # 每个任务之间歇 300ms，给显卡喘气
 *
 * 断点：每跑完一个任务就写 ./renders/_progress.json，重跑时自动跳过已完成的。
 * 失败：单个任务最多重试 1 次，仍失败就记进 _progress.json 的 failed，继续跑下一个。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 注意：不能写 new URL(import.meta.url).pathname —— 中文路径会被 URL 编码成 %E9%A1%B9%E7%9B%AE，路径就废了
const here = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const arg = (k, d = '') => {
  const i = argv.indexOf('--' + k)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const has = (k) => argv.includes('--' + k)

// 任务包文件名带剧名（退婚那天_comfy-tasks.json），所以自动找：
// 先认标准名 comfy-tasks.json，再认本目录里唯一一个 *comfy-tasks.json，也可以用 --bundle 指定。
const pickBundle = () => {
  for (const std of ['comfy-tasks.json', 'comfy-assets.json']) {
    const exact = path.join(here, std)
    if (fs.existsSync(exact)) return exact
  }
  const hit = fs.readdirSync(here).filter((f) => /comfy-(tasks|assets)\.json$/i.test(f))
  if (hit.length === 1) return path.join(here, hit[0])
  if (hit.length > 1) {
    console.error('目录里有 ' + hit.length + ' 个任务包（*comfy-tasks.json / *comfy-assets.json），用 --bundle 指定一个：')
    hit.forEach((f) => console.error('  ' + f))
    process.exit(1)
  }
  return ''
}
const BUNDLE = arg('bundle', '') ? path.resolve(arg('bundle', '')) : pickBundle()
if (!BUNDLE || !fs.existsSync(BUNDLE)) {
  console.error('找不到 *comfy-tasks.json —— 把它和本脚本放在同一个目录，或用 --bundle 指定。')
  process.exit(1)
}

const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'))
const BASE = (arg('url', bundle.comfyUrl || 'http://127.0.0.1:8188')).replace(/\/+$/, '')
const OUT = path.resolve(arg('out', 'renders'))
const GAP = Number(arg('gap', 250)) || 0
const DRY = has('dry')
const ONLY = arg('only', '')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter(Boolean)
const FROM = arg('from', '')

const PROGRESS = path.join(OUT, '_progress.json')
fs.mkdirSync(OUT, { recursive: true })
const progress = fs.existsSync(PROGRESS)
  ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))
  : { done: {}, failed: {}, startedAt: new Date().toISOString() }
const saveProgress = () => fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

async function api(p, init) {
  const r = await fetch(BASE + p, init)
  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch {
    /* 非 JSON 就当错误信息用 */
  }
  if (!r.ok) {
    const detail = j?.node_errors ? JSON.stringify(j.node_errors).slice(0, 600) : text.slice(0, 400)
    throw new Error('HTTP ' + r.status + ' ' + detail)
  }
  return j
}

// 1×1 透明 PNG：某镜没有参考图时顶上去。
// 不能留空——LoadImage 拿到空字符串，ComfyUI 会直接 400「value not in list」。
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** 参考图先塞进 ComfyUI 的 input 目录，拿回它认识的文件名 */
async function uploadImage(localPath, label) {
  let buf = BLANK_PNG
  let fileName = '_blank_1x1.png'
  if (localPath) {
    const abs = path.isAbsolute(localPath)
      ? localPath
      : fs.existsSync(path.join(here, localPath))
        ? path.join(here, localPath)
        : path.resolve(localPath)
    if (fs.existsSync(abs)) {
      buf = fs.readFileSync(abs)
      fileName = path.basename(abs)
    } else {
      console.log('    ⚠ ' + (label || '') + ' 参考图找不到（' + localPath + '），用占位图顶上')
    }
  } else {
    console.log('    ⚠ ' + (label || '') + ' 没有参考图，用占位图顶上（工作流里的 LoadImage 要它才能跑）')
  }
  const fd = new FormData()
  fd.append('image', new Blob([buf]), fileName)
  fd.append('overwrite', 'true')
  fd.append('type', 'input')
  const j = await api('/upload/image', { method: 'POST', body: fd })
  return j.subfolder ? j.subfolder + '/' + j.name : j.name
}

/** 把 task 里剩下的 {{image}} / {{image2}} 换成上传后的名字 */
function injectImages(task, names) {
  let s = JSON.stringify(task)
  for (const [k, v] of Object.entries(names)) {
    s = s.split('{{' + k + '}}').join(JSON.stringify(String(v || '')).slice(1, -1))
  }
  return JSON.parse(s)
}

async function submit(task) {
  const j = await api('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: task, client_id: 'manju-workbench' }),
  })
  return j.prompt_id
}

async function waitDone(promptId, timeoutMs = 30 * 60 * 1000) {
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < timeoutMs) {
    const h = await api('/history/' + promptId)
    const rec = h[promptId]
    if (rec) {
      if (rec.status?.status_str === 'error') throw new Error('ComfyUI 执行报错（看 ComfyUI 控制台）')
      if (rec.status?.completed || rec.outputs) return rec.outputs || {}
    }
    const q = await api('/queue').catch(() => null)
    if (q) {
      const running = (q.queue_running || []).length
      const pending = (q.queue_pending || []).length
      const tag = running + '/' + pending
      if (tag !== last) {
        last = tag
        if (pending > 0) console.log('    队列：运行 ' + running + ' · 等待 ' + pending)
      }
    }
    await sleep(1500)
  }
  throw new Error('超时（30 分钟还没出结果）')
}

async function download(outputs, dir) {
  const saved = []
  for (const node of Object.values(outputs)) {
    for (const arr of Object.values(node || {})) {
      if (!Array.isArray(arr)) continue
      for (const f of arr) {
        if (!f || !f.filename) continue
        const u =
          BASE +
          '/view?filename=' +
          encodeURIComponent(f.filename) +
          '&subfolder=' +
          encodeURIComponent(f.subfolder || '') +
          '&type=' +
          encodeURIComponent(f.type || 'output')
        const r = await fetch(u)
        if (!r.ok) continue
        const buf = Buffer.from(await r.arrayBuffer())
        const p = path.join(dir, f.filename)
        fs.writeFileSync(p, buf)
        saved.push(p)
      }
    }
  }
  return saved
}

const tasks = bundle.tasks || []
let list = tasks
if (ONLY.length) list = list.filter((t) => ONLY.includes(t.id) || ONLY.includes(t.jobId) || ONLY.includes(t.epNo))
if (FROM) {
  const i = list.findIndex((t) => t.id === FROM)
  if (i >= 0) list = list.slice(i)
}
const todo = DRY ? list : list.filter((t) => !progress.done[t.id])

console.log('ComfyUI：' + BASE)
console.log('任务：共 ' + tasks.length + ' 个，待跑 ' + todo.length + ' 个' + (DRY ? '（dry run）' : ''))
console.log('输出：' + OUT)
console.log('')

let ok = 0
let bad = 0
for (let i = 0; i < todo.length; i++) {
  const t = todo[i]
  const head = '[' + (i + 1) + '/' + todo.length + '] ' + t.id
  if (DRY) {
    const s = JSON.stringify(t.task)
    console.log(head + '  ' + s.length + ' 字节' + (t.vars.image ? '  参考图 ' + t.vars.image : ''))
    continue
  }
  const where = Number.isInteger(t.epNo) && t.epNo > 0 ? '第' + t.epNo + '集 镜' + (t.shotNo ?? '-') : '资产 ' + (t.kind || '')
  console.log(head + '  ' + where + '  ' + now())
  let attempt = 0
  let finished = false
  while (attempt < 2 && !finished) {
    attempt++
    try {
      const names = {}
      names.image = await uploadImage(t.vars.image, t.id + " 参考图")
      if (t.vars.image2) names.image2 = await uploadImage(t.vars.image2, t.id + " 参考图2")
      const task = injectImages(t.task, names)
      const pid = await submit(task)
      console.log('    prompt_id ' + pid)
      const outs = await waitDone(pid)
      const sub = Number.isInteger(t.epNo) && t.epNo > 0 ? 'ep' + t.epNo : 'assets'
      const dir = path.join(OUT, sub)
      fs.mkdirSync(dir, { recursive: true })
      const files = await download(outs, dir)
      progress.done[t.id] = { at: new Date().toISOString(), files, promptId: pid }
      delete progress.failed[t.id]
      saveProgress()
      ok++
      finished = true
      console.log('    ✓ ' + files.length + ' 个文件 → ' + path.relative(process.cwd(), dir))
    } catch (e) {
      console.log('    ✗ ' + e.message + (attempt < 2 ? '（重试一次）' : ''))
      if (attempt >= 2) {
        progress.failed[t.id] = { at: new Date().toISOString(), error: e.message }
        saveProgress()
        bad++
      }
    }
  }
  if (GAP) await sleep(GAP)
}

console.log('')
console.log('完成 ' + ok + ' 个' + (bad ? '，失败 ' + bad + ' 个（重跑会自动重试）' : '') + '。')
console.log('把 ' + OUT + ' 整个目录拷回工作台，在「导出交付」页点「回收渲染结果」就会按镜号入库。')
if (bad) process.exitCode = 1
`

/** 一份可直接读的说明，和脚本一起导出 */
export function comfyReadme(bundle) {
  const wf = bundle.workflowFile || 'workflow_api.json'
  return `# ComfyUI 任务包

- 剧本：${bundle.title || '未命名'}
- 任务数：${(bundle.tasks || []).length}
- 工作流：${wf}（hash ${bundle.workflowHash || '-'}）
- 生成时间：${bundle.createdAt || '-'}

## 怎么用

1. 把这三个文件放进同一个目录：\`comfy-tasks.json\`、\`comfy-run.mjs\`、参考图（如果有，路径见任务里的 \`vars.image\`）
2. 装好 ComfyUI 并启动，确认浏览器能打开它的地址
3. 在这个目录里跑：

\`\`\`bash
node comfy-run.mjs --url http://127.0.0.1:8188
\`\`\`

4. 跑完把 \`renders/\` 整个目录拷回工作台的 \`renders/\` 下，回「导出交付」页点「回收渲染结果」

## skill 规则

- 随包规则：${(bundle.skills || []).map((s) => s.fullName).join('、') || '（本包没有随带 skill 规则）'}
- 每个 prompt 已经按你选的目标生成模型语法写好，**一般不需要再动 prompt**
- 只有工作流里带 LLM / 文本节点（例如让模型自己扩写提示词）时，才把同目录 skill-rules.md 的正文贴进那个节点的 system
- 规则文件只是随包存档，执行脚本不会读它

## 工作流要求

- 必须是 ComfyUI 的 **API 格式**（菜单里 Export (API)，不是 Save）
- 要替换的位置写成占位符，例如：

\`\`\`json
"inputs": { "text": "{{prompt}}", "clip": ["1", 0] }
\`\`\`

认得的占位符：\`{{prompt}}\` \`{{negative}}\` \`{{seed}}\` \`{{width}}\` \`{{height}}\` \`{{filename_prefix}}\` \`{{image}}\` \`{{image2}}\`

- 图片类占位符要放在 \`LoadImage\` 的 \`image\` 字段里，脚本运行时会先上传再填名字
- 输出节点建议用 \`SaveImage\`（图片）或 \`VHS_VideoCombine\`（视频），脚本会把 outputs 里所有带 filename 的东西都下下来
`
}
