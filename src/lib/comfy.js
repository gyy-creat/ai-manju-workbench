/**
 * ComfyUI 对接（一期：导出可直接执行的任务包）
 *
 * 设计取舍，三条：
 * 1. 占位符写在 workflow JSON 的文本里（`"{{prompt}}"`），不绑定节点 id。
 *    API 格式的 key 是 "3" / "6" 这种节点号，用户重搭一遍就变了，按 id 绑定必然失效。
 * 2. 文本类变量（prompt / negative / seed / width / height / filename_prefix）在导出时就填好；
 *    图片类（{{image}} / {{image2}}）留到运行时再填 —— 参考图得先 POST /upload/image 换成
 *    ComfyUI 认识的文件名，这个动作只能在跑图那台机器上做。
 * 3. 任务包 = 一个 comfy-tasks.json + 一个 comfy-run.mjs。脚本只依赖 node 内置，
 *    可以整个拷到出图机跑，关掉浏览器也照跑。
 */
import { buildPrompt, buildFramePair, shotRefs, buildAssetPrompt } from './prompts.js'
import { buildVideoPrompt } from './prompts.js'
import { modelById } from './imageModels.js'
import { videoModelById, clampVideoDur } from './videoModels.js'
import { platform } from './schema.js'

/** 任务包里认得的占位符 */
export const COMFY_VARS = [
  { k: 'prompt', d: '正向提示词（生图用 AI 版优先，其次模板版）' },
  { k: 'negative', d: '负向词' },
  { k: 'seed', d: '种子（同一个角色同一集固定，重跑不变）' },
  { k: 'width', d: '宽（按平台竖屏比例算）' },
  { k: 'height', d: '高' },
  { k: 'filename_prefix', d: '输出文件前缀，形如 sc_xxx_ep1_s01，方便按镜号回收' },
  { k: 'image', d: '参考图 1（运行脚本会先上传再填名字）' },
  { k: 'image2', d: '参考图 2（首尾帧的第二张）' },
]

export const IMAGE_VARS = ['image', 'image2']

/** 值往 JSON 字符串里塞之前要转义，否则引号一多整份 JSON 就废了 */
function esc(v) {
  return JSON.stringify(String(v ?? '')).slice(1, -1)
}

/**
 * 把 {{var}} 替换成真实值。
 * skip 里的变量原样保留（图片要等运行时上传）。
 */
export function fillWorkflow(wf, vars, skip = IMAGE_VARS) {
  let s = JSON.stringify(wf)
  for (const [k, v] of Object.entries(vars || {})) {
    if (skip.includes(k)) continue
    s = s.split(`{{${k}}}`).join(esc(v))
  }
  return JSON.parse(s)
}

/** 找出 workflow 里用了哪些占位符 —— 用来提示用户「还差哪个没写」 */
export function placeholdersOf(wf) {
  const s = JSON.stringify(wf)
  const found = new Set()
  for (const m of s.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) found.add(m[1])
  return [...found].sort()
}

/** 稳定 seed：同一镜重复导出不变，换镜就换 */
export function seedOfShot(shot, ep) {
  const raw = `${ep?.id || ''}|${shot?.id || ''}|${shot?.no || 0}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 2147483647
}

/** 竖屏尺寸：平台比例决定，1080 宽为准 */
export function sizeOfPlatform(pf) {
  const [w, h] = String(pf?.ratio || '9:16').split(':').map(Number)
  if (!w || !h) return { width: 1080, height: 1920 }
  return w >= h ? { width: Math.round((1080 * w) / h / 2) * 2, height: 1080 } : { width: 1080, height: Math.round((1080 * h) / w / 2) * 2 }
}

/** 一镜的变量表 */
export function varsForShot(project, ep, shot, opts = {}) {
  const kind = opts.kind === 'video' ? 'video' : 'image'
  const pf = platform(project)
  const { width, height } = sizeOfPlatform(pf)
  let prompt = ''
  let negative = ''
  let image = ''
  let image2 = ''

  if (kind === 'video') {
    const vm = videoModelById(opts.modelId || project.meta?.videoModel)
    const ai = shot.promptVideoAI && shot.promptVideoAI.modelId === vm.id ? shot.promptVideoAI : null
    const tpl = buildVideoPrompt(project, ep, shot, vm.id)
    prompt = ai?.prompt || tpl.full
    negative = ai?.negative || tpl.negative
    const refs = shotRefs(project, shot)
    image = refs[0]?.path || ''
    image2 = tpl.refMode === 'first-last' ? refs[1]?.path || '' : ''
  } else {
    const m = modelById(opts.modelId || project.meta?.imageModel)
    const ai = shot.promptAI && shot.promptAI.modelId === m.id ? shot.promptAI : null
    if (ai?.first || ai?.last) {
      prompt = ai.first || ''
      negative = ai.negative || ''
      image2 = ''
    } else {
      const tpl = buildPrompt(project, ep, shot, m.id, { refs: shotRefs(project, shot) })
      prompt = ai?.prompt || tpl.full
      negative = ai?.negative || tpl.negative
    }
    const pair = buildFramePair(project, ep, shot, m.id)
    image = pair?.refs?.[0]?.path || ''
    image2 = pair?.refs?.[1]?.path || ''
  }

  return {
    prompt,
    negative,
    seed: seedOfShot(shot, ep),
    width,
    height,
    filename_prefix: `${project.meta?.id || 'sc'}_ep${ep?.no || 1}_s${String(shot?.no || 1).padStart(2, '0')}`,
    image,
    image2,
    dur: kind === 'video' ? clampVideoDur(opts.modelId || project.meta?.videoModel, shot?.dur) : shot?.dur,
  }
}

/**
 * 生成任务清单。每个任务自带完整 vars，脚本只负责上传图 + 填图 + 提交。
 */
export function buildComfyTasks(project, wf, opts = {}) {
  const kind = opts.kind === 'video' ? 'video' : 'image'
  const only = Array.isArray(opts.episodes) && opts.episodes.length ? new Set(opts.episodes) : null
  const tasks = []
  for (const ep of project.episodes || []) {
    if (only && !only.has(ep.no)) continue
    for (const shot of ep.shots || []) {
      const vars = varsForShot(project, ep, shot, { ...opts, kind })
      tasks.push({
        id: `${vars.filename_prefix}`,
        epNo: ep.no,
        shotNo: shot.no,
        vars,
        task: fillWorkflow(wf, vars),
      })
    }
  }
  return tasks
}

/** 简易 hash，用来标「这条是哪个版本的 workflow 跑的」 */
/**
 * 资产任务：主视图 / 四视图 / 表情 / 配饰 / 服装。
 * 跟镜头任务的区别只有一个 —— 没有 ep/shot，主体是角色或它的服装配饰。
 * 文件名前缀带 jobId，回收时按它认回具体那一条。
 */
export function buildAssetTasks(project, wf, opts = {}) {
  const jobs = Array.isArray(opts.jobs) && opts.jobs.length ? opts.jobs : project.assetJobs || []
  const modelId = opts.modelId || project.meta?.imageModel
  const tasks = []
  for (const job of jobs) {
    const p = buildAssetPrompt(project, job, modelId)
    const vars = {
      prompt: String(job.prompt || '').trim() || p.full,
      negative: String(job.negative || '').trim() || p.negative,
      seed: Number(job.seed) || p.seed || 1,
      width: p.width,
      height: p.height,
      filename_prefix: `asset_${job.kind}_${p.charSlug}_${job.id}`,
      image: job.image || '',
      image2: job.image2 || '',
      dur: 0,
    }
    tasks.push({ id: vars.filename_prefix, jobId: job.id, kind: job.kind, vars, task: fillWorkflow(wf, vars) })
  }
  return tasks
}

export function hashWorkflow(wf) {
  const s = JSON.stringify(wf)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
