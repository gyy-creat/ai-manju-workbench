// 导出：Markdown 投产包 / 分镜 CSV / 提示词 CSV / SRT / 素材清单 / 配音清单
import { platform, styleOf, totalDur, totalShots, cn } from './schema.js'
import { buildPrompt, buildFramePair, shotRefs } from './prompts.js'
import { runChecks } from './checks.js'
import { resolveVoice, voiceLine, voiceLock, presetOf, voiceDisplayLabel } from './voice.js'
import { buildVideoPrompt } from './prompts.js'
import { videoModelById } from './videoModels.js'
import { buildComfyTasks, buildAssetTasks, hashWorkflow } from './comfy.js'
import { COMFY_RUN_SCRIPT, comfyReadme } from './comfyRun.js'

const pad = (n, w = 2) => String(n).padStart(w, '0')
const stamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function shotName(ep, shot) {
  return `S${pad(ep.no)}E${pad(ep.no)}_SH${pad(shot.no)}_v01.png`
}

export function buildStoryboardCSV(project) {
  const head = ['集', '镜号', '景别', '机位', '运镜', '场景', '画面', '角色', '服装号', '道具', '说话人', '台词', '情绪', '强度', '时长(s)', '动作', '配音提示', '素材名']
  const rows = [head]
  project.episodes.forEach((ep) => {
    ep.shots.forEach((sh) => {
      rows.push([ep.no, sh.no, sh.size, sh.angle, sh.move, sh.scene, sh.desc, sh.chars, sh.outfit, sh.props, sh.speaker, sh.dialogue, sh.emotion, sh.intensity, sh.dur, sh.action, sh.vo, shotName(ep, sh)])
    })
  })
  return toCSV(rows)
}

export function buildPromptCSV(project, modelId) {
  const mode = project.meta && project.meta.promptMode === 'pair' ? 'pair' : 'single'
  const rows = mode === 'pair'
    ? [['集', '镜号', '帧', '生图模型', '语法族', '提示词', '负面词', '参数', '来源', '参考图', '中文说明']]
    : [['集', '镜号', '生图模型', '语法族', '提示词', '负面词', '参数', '来源', '中文说明']]
  project.episodes.forEach((ep) => {
    ep.shots.forEach((sh) => {
      const p = buildPrompt(project, ep, sh, modelId)
      const ai = sh.promptAI && sh.promptAI.modelId === p.modelId ? sh.promptAI : null
      if (mode === 'pair') {
        const fp = buildFramePair(project, ep, sh, modelId)
        const refTxt = (fp.refs || []).map((r, i) => `${['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][i] || i + 1}${r.label}=${r.path}`).join('；')
        const src = ai && ai.mode === 'pair' ? 'AI 定向' : '模板版'
        const firstTxt = ai && ai.mode === 'pair' ? ai.first || ai.prompt : fp.first.full
        const lastTxt = ai && ai.mode === 'pair' ? ai.last || '' : fp.last.full
        const neg = ai && ai.mode === 'pair' ? ai.negative : fp.first.negative
        const par = ai && ai.mode === 'pair' ? ai.params : fp.first.params
        rows.push([ep.no, sh.no, '首帧', p.modelName, p.familyLabel, firstTxt, neg, par, src, refTxt, fp.bridge])
        rows.push([ep.no, sh.no, '尾帧', p.modelName, p.familyLabel, lastTxt, neg, par, src, refTxt, fp.bridge])
        return
      }
      rows.push([
        ep.no,
        sh.no,
        p.modelName,
        p.familyLabel,
        ai ? ai.prompt : p.full,
        ai ? ai.negative : p.negative,
        (ai && ai.params) || p.params,
        ai ? 'AI 定向' : '模板版',
        p.cnVersion,
      ])
    })
  })
  return toCSV(rows)
}

/**
 * 提示词 TXT。modelId 决定语法；某一镜若已由 AI 按同一模型定向重写过，
 * 优先导出 AI 版并标出来源，否则导出模板版。
 */
export function buildPromptTXT(project, modelId) {
  const mode = project.meta && project.meta.promptMode === 'pair' ? 'pair' : 'single'
  const lines = []
  const first = buildPrompt(project, project.episodes[0] || { shots: [] }, project.episodes[0]?.shots[0] || {}, modelId)
  lines.push(`# 提示词包｜生图模型：${first.modelName}（${first.familyLabel}）｜模式：${mode === 'pair' ? '首尾帧 · 多参' : '单帧'}`)
  lines.push(`# 参数：${first.params}`)
  lines.push('')
  project.episodes.forEach((ep) => {
    lines.push(`# ${/^第\s*\d+\s*集/.test(String(ep.title || '')) ? '' : `第${ep.no}集 `}${ep.title || `第${ep.no}集`}`)
    ep.shots.forEach((sh) => {
      const p = buildPrompt(project, ep, sh, modelId)
      const aiRaw = sh.promptAI && sh.promptAI.modelId === p.modelId ? sh.promptAI : null
      const ai = aiRaw && (aiRaw.mode === 'pair') === (mode === 'pair') ? aiRaw : null
      if (mode === 'pair') {
        const fp = buildFramePair(project, ep, sh, modelId)
        lines.push(`\n## 镜${sh.no}｜${sh.size}·${sh.angle}·${sh.move}｜${sh.dur}s｜${ai ? 'AI 定向' : '模板版'}`)
        lines.push(`【首帧】${ai && ai.mode === 'pair' ? ai.first || ai.prompt : fp.first.full}`)
        lines.push(`【尾帧】${ai && ai.mode === 'pair' ? ai.last || '' : fp.last.full}`)
        lines.push(`【桥接】${ai && ai.mode === 'pair' ? ai.bridge || fp.bridge : fp.bridge}`)
        lines.push(`【负面】${ai && ai.mode === 'pair' ? ai.negative : fp.first.negative}`)
        lines.push(`【参数】${(ai && ai.mode === 'pair' && ai.params) || fp.first.params}`)
        if (fp.refs && fp.refs.length) {
          lines.push(`【参考图】${fp.refs.map((r, i) => `${['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][i] || i + 1}${r.label} → ${r.path}`).join('；')}`)
        }
        if (fp.refLine) lines.push(`【多参】${fp.refLine}`)
        return
      }
      lines.push(`\n## 镜${sh.no}｜${sh.size}·${sh.angle}·${sh.move}｜${sh.dur}s｜${ai ? 'AI 定向' : '模板版'}`)
      lines.push(ai ? ai.prompt : p.full)
      lines.push(ai ? ai.negative : p.negative)
      lines.push((ai && ai.params) || p.params)
      if (p.refLine) lines.push(`# 多参：${p.refLine}`)
    })
    lines.push('')
  })
  return lines.join('\n')
}

export function buildSRT(project, epNo) {
  const eps = project.episodes.filter((e) => !epNo || e.no === epNo)
  const out = []
  let idx = 1
  const fmt = (ms) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const r = Math.floor(ms % 1000)
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`
  }
  eps.forEach((ep) => {
    let t = 0
    ep.shots.forEach((sh) => {
      const d = (Number(sh.dur) || 0) * 1000
      if (sh.dialogue && String(sh.dialogue).trim()) {
        out.push(`${idx++}\n${fmt(t)} --> ${fmt(t + d - 40)}\n${sh.dialogue}\n`)
      }
      t += d
    })
  })
  return out.join('\n')
}

export function buildAssetCSV(project) {
  const rows = [['素材名', '类型', '关联角色', '场景', '关联集', '关联镜', '状态', '存放路径']]
  const alias = project.assetNames || {}
  // 一、素材库：人物视图 / 表情 / 配饰 / 场景 / 道具 / 服装
  project.characters.forEach((c) => {
    const refs = Array.isArray(c.refImages) && c.refImages.length ? c.refImages : c.refImage ? [c.refImage] : []
    refs.forEach((path, i) => {
      const def = `${c.name} · ${i === 0 ? '主视图' : `参考图 ${i + 1}`}`
      rows.push([alias[path] || def, '三视图', c.name, '', '', '', '已有', path])
    })
    ;(c.outfits || []).forEach((o) => {
      if (o.refImage) rows.push([`${c.name} 服装 ${o.seq}${o.name ? ` · ${o.name}` : ''}`, '服装', c.name, o.scene || '', '', '', '已有', o.refImage])
    })
  })
  ;(project.assetImages || []).forEach((a) => {
    rows.push([a.name || '未命名', KIND_LABEL[a.kind] || a.kind, a.charName || '', a.scene || '', a.ep || '', '', a.path ? '已有' : '缺失', a.path || ''])
  })
  // 二、关键帧对账
  project.episodes.forEach((ep) => {
    ep.shots.forEach((sh) => {
      const found = (project.assets || []).find((a) => a.ep === ep.no && a.shot === sh.no)
      rows.push([shotName(ep, sh), '关键帧', '', '', ep.no, sh.no, found ? found.status || '已有' : '缺失', found?.path || `assets/S${pad(ep.no)}/`])
    })
  })
  return toCSV(rows)
}

const KIND_LABEL = { view: '三视图', expression: '表情', accessory: '配饰', scene: '场景', prop: '道具', outfit: '服装' }

export function buildVoiceCSV(project) {
  const rows = [
    ['集', '镜号', '说话人', '台词', '字数', '时长(s)', '字/秒', '情绪', '音色', '听感', '工具', 'voice_id', '参数', '配音提示'],
  ]
  project.episodes.forEach((ep) => {
    ep.shots.forEach((sh) => {
      const n = cn(sh.dialogue).length
      if (!n) return
      const ch = project.characters.find((c) => c.name === sh.speaker)
      const v = ch ? resolveVoice(ch, project.voices) : null
      rows.push([
        ep.no,
        sh.no,
        sh.speaker,
        sh.dialogue,
        n,
        sh.dur,
        (n / (Number(sh.dur) || 1)).toFixed(1),
        sh.emotion,
        ch ? voiceDisplayLabel(ch.voice, project.voices) : '',
        ch ? voiceLine(ch, project.voices) : '',
        v?.tool || '',
        v?.voiceId || '',
        v?.params || '',
        sh.vo || (ch ? `${ch.name}（${voiceDisplayLabel(ch.voice, project.voices)}）` : ''),
      ])
    })
  })
  return toCSV(rows)
}

export function buildMarkdown(project, checks) {
  const pf = platform(project)
  const st = styleOf(project)
  const c = checks || runChecks(project)
  const L = []
  L.push(`# ${project.meta.title}｜AI漫剧投产包`)
  L.push(``)
  L.push(`> 平台：${pf.name}（${pf.ratio} / ${pf.width}×${pf.height} / ${pf.fps}fps）　画风：${st.name}　生成时间：${new Date().toLocaleString('zh-CN')}`)
  L.push(``)
  L.push(`- Logline：${project.meta.logline || '（待补）'}`)
  L.push(`- 目标受众：${project.meta.audience || '（待补）'}`)
  L.push(`- 标签：${project.meta.tags || '（待补）'}`)
  L.push(`- 体量：${project.episodes.length} 集 / ${totalShots(project)} 镜 / ${totalDur(project).toFixed(1)} 秒`)
  L.push(`- 机检：${c.score} 分（error ${c.errors} / warn ${c.warns} / info ${c.infos}）`)
  L.push(``)

  if (project.topics.length) {
    L.push(`## 一、选题`)
    project.topics.forEach((t) => {
      L.push(`### ${t.title || '未命名选题'}`)
      L.push(`- 类型：${t.genre || '—'}｜人群：${t.audience || '—'}｜记忆点：${t.memory || '—'}`)
      L.push(`- Logline：${t.logline || '—'}`)
      L.push(``)
    })
  }

  L.push(`## 二、角色一致性锚定`)
  project.characters.forEach((ch) => {
    L.push(`### ${ch.name}（${ch.role}${ch.random ? ' · 随机路人：不锁脸不锁 seed' : ''}）`)
    L.push(`- 外貌：${ch.look || '—'}`)
    L.push(`- 服装：${ch.outfit || '—'}`)
    L.push(`- 锚定词：\`${ch.anchor || (ch.random ? '（随机路人，不需要锚定词）' : '（必填：一句话锁脸锁装）')}\``)
    const refList = Array.isArray(ch.refImages) && ch.refImages.length ? ch.refImages : ch.refImage ? [ch.refImage] : []
    L.push(`- 种子：${ch.seed || '（待定）'}｜音色：${ch.voice ? voiceDisplayLabel(ch.voice, project.voices) : '—'}`)
    L.push(`- 参考图（${refList.length} 张）：${refList.length ? refList.join('、') : '（待定）'}`)
    if (Array.isArray(ch.outfits) && ch.outfits.length) {
      L.push(
        `- 服装序列：${ch.outfits
          .map((o) => `${o.seq} ${o.name || '未命名'}${o.scene ? `（${o.scene}）` : ''}`)
          .join('｜')}`,
      )
      ch.outfits.forEach((o) => {
        if (o.anchor) L.push(`  - ${o.seq} 英文：\`${o.anchor}\``)
      })
    }
    if (ch.voice) {
      const v = resolveVoice(ch, project.voices)
      L.push(`- 音色细节：${voiceLine(ch, project.voices)}`)
      L.push(`- 配音锁定：${[v.tool, v.voiceId, v.params].filter(Boolean).join(' / ') || '（未指定工具与 voice_id）'}` + (v.seed ? `｜seed ${v.seed}` : ''))
      if (v.refAudio) L.push(`- 参考音频：${v.refAudio}${v.refText ? `（文本：${v.refText}）` : '（缺参考文本，zero-shot 克隆会漂）'}`)
    }
    L.push(``)
  })

  L.push(`## 三、分集剧本与分镜`)
  project.episodes.forEach((ep) => {
    const dur = ep.shots.reduce((n, s) => n + (Number(s.dur) || 0), 0)
    L.push(`### 第${ep.no}集 ${ep.title}｜${dur.toFixed(1)}s`)
    L.push(`- 钩子（前 3 秒）：${ep.hook || '（缺）'}`)
    L.push(`- 梗概：${ep.summary || '—'}`)
    if (ep.cliffhangers.length) L.push(`- 未解悬念：${ep.cliffhangers.join('；')}`)
    L.push(``)
    L.push(`| 镜 | 景别 | 机位 | 运镜 | 场景 | 画面 | 角色 | 台词 | 情绪 | 强度 | 时长 | 动作 |`)
    L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|`)
    ep.shots.forEach((sh) => {
      L.push(`| ${sh.no} | ${sh.size} | ${sh.angle} | ${sh.move} | ${sh.scene} | ${sh.desc} | ${sh.chars} | ${sh.speaker}:${sh.dialogue} | ${sh.emotion} | ${sh.intensity} | ${sh.dur}s | ${sh.action} |`)
    })
    L.push(``)
  })

  L.push(`## 四、生图提示词包`)
  project.episodes.forEach((ep) => {
    ep.shots.forEach((sh) => {
      const p = buildPrompt(project, ep, sh)
      L.push(`**第${ep.no}集 镜${sh.no}**（${sh.size}·${sh.angle}·${sh.move}）`)
      L.push('```')
      L.push(p.full)
      L.push(p.negative)
      L.push(p.params)
      L.push('```')
    })
  })

  L.push(`## 五、机检报告`)
  L.push(`| 级别 | 规则 | 位置 | 说明 |`)
  L.push(`|---|---|---|---|`)
  c.issues.forEach((i) => L.push(`| ${i.level} | ${i.rule} | ${i.where} | ${i.msg} |`))
  if (!c.issues.length) L.push(`| ok | — | — | 六项机检全通过 |`)

  L.push(``)
  L.push(`## 六、剪辑与发布`)
  L.push(`- 输出：${pf.width}×${pf.height} / ${pf.fps}fps / H.264 / 码率 8–12Mbps / AAC 192kbps`)
  L.push(`- 字幕：${pf.ratio} 竖屏，字号 ≥ 48px，距底 ≥ 220px（避开平台 UI）`)
  L.push(`- 平台备注：${pf.notes}`)
  return L.join('\n')
}

// 视频提示词包：每镜一行，带 AI 定向标记（AI 版存在且模型、规则都还对得上才算数）
export function buildVideoPromptCSV(project, modelId) {
  const mid = modelId || project.meta?.videoModel || 'keling-16'
  const vm = videoModelById(mid)
  const skillIds = JSON.stringify(project.meta?.skillVideo || [])
  const rows = [['集', '镜号', '视频模型', '语法族', '模式', '提示词', '负面词', '参数', '来源', '分镜时长', '参考图模式']]
  for (const ep of project.episodes || []) {
    for (const sh of ep.shots || []) {
      const ai = sh.promptVideoAI
      const okAi = ai && ai.modelId === mid && JSON.stringify(ai.skillIds || []) === skillIds
      const r = buildVideoPrompt(project, ep, sh, mid)
      rows.push([
        ep.no,
        sh.no,
        vm.name,
        r.familyLabel,
        r.refMode === 'first-last' ? '首帧+尾帧' : '首帧',
        okAi ? ai.prompt : r.full,
        okAi ? ai.negative ?? '' : r.negative,
        okAi ? ai.params ?? '' : r.params,
        okAi ? 'AI 定向' : '模板版',
        sh.dur,
        r.refMode === 'first-last' ? '首帧+尾帧' : '首帧',
      ])
    }
  }
  return toCSV(rows)
}

export function buildVideoPromptTXT(project, modelId) {
  const mid = modelId || project.meta?.videoModel || 'keling-16'
  const vm = videoModelById(mid)
  const skillIds = JSON.stringify(project.meta?.skillVideo || [])
  const head = `# 视频提示词包｜模型：${vm.name}（${vm.durRange[0]}–${vm.durRange[1]} 秒 · ${vm.refMode === 'first-last' ? '首帧+尾帧' : '首帧'}）\n`
  const body = []
  for (const ep of project.episodes || []) {
    body.push(`\n## 第 ${ep.no} 集 ${ep.title || ''}`)
    for (const sh of ep.shots || []) {
      const ai = sh.promptVideoAI
      const okAi = ai && ai.modelId === mid && JSON.stringify(ai.skillIds || []) === skillIds
      const r = buildVideoPrompt(project, ep, sh, mid)
      const tag = okAi ? 'AI 定向' : '模板版'
      body.push(`\n[镜 ${sh.no} · ${sh.dur}s · ${tag}]`)
      body.push(okAi ? ai.prompt : r.full)
      const neg = okAi ? ai.negative : r.negative
      if (neg) body.push(`负面：${neg}`)
      const par = okAi ? ai.params : r.params
      if (par) body.push(`参数：${par}`)
    }
  }
  return head + body.join('\n') + '\n'
}

export function buildPackage(project, checks) {
  const s = stamp()
  const safe = (project.meta.title || '漫剧').replace(/[\\/:*?"<>|\s]/g, '_')
  // key 是稳定标识：文件名里带时间戳，没法当「这件要不要导出」的开关用。
  // 台账里被排掉的件记在 meta.exportSkip（存 key 不存文件名），改名、换时间戳都不影响。
  return [
    { key: 'package', label: '投产包', name: `${safe}_投产包_${s}.md`, content: buildMarkdown(project, checks) },
    { key: 'storyboard', label: '分镜表', name: `${safe}_分镜表_${s}.csv`, content: buildStoryboardCSV(project) },
    { key: 'promptCsv', label: '提示词包（CSV）', name: `${safe}_提示词包_${s}.csv`, content: buildPromptCSV(project) },
    { key: 'promptTxt', label: '提示词包（TXT）', name: `${safe}_提示词包_${s}.txt`, content: buildPromptTXT(project) },
    { key: 'videoCsv', label: '视频提示词（CSV）', name: `${safe}_视频提示词_${s}.csv`, content: buildVideoPromptCSV(project) },
    { key: 'videoTxt', label: '视频提示词（TXT）', name: `${safe}_视频提示词_${s}.txt`, content: buildVideoPromptTXT(project) },
    { key: 'srt', label: '字幕', name: `${safe}_字幕_${s}.srt`, content: buildSRT(project) },
    { key: 'voice', label: '配音清单', name: `${safe}_配音清单_${s}.csv`, content: buildVoiceCSV(project) },
    { key: 'asset', label: '素材清单', name: `${safe}_素材清单_${s}.csv`, content: buildAssetCSV(project) },
  ]
}

export function download(name, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function deleteFromExports(name) {
  const r = await fetch('/api/export/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return r.json()
}

export async function saveToExports(name, content) {
  const r = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  })
  return r.json()
}

function legacyCopy(s) {
  const ta = document.createElement('textarea')
  ta.value = s
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  if (!ok) throw new Error('浏览器拒绝了剪贴板写入')
  return true
}

// 复制 + 提示：成功报成功，失败报失败。别再用 `copyText(x); notify('已复制')`——那样剪贴板空着也说成功。
export function copyWith(text, label, notify) {
  return copyText(text)
    .then(() => notify?.(label))
    .catch((e) => notify?.(`复制失败：${e.message}——手动选中文本复制`))
}

// 复制文本：优先 navigator.clipboard，被拒（非安全上下文 / 无权限 / headless）时回落到 execCommand。
// 两者都失败才抛错——调用方要能分清「复制成功」和「复制了个寂寞」。
export function copyText(text) {
  const s = String(text ?? '')
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(s).catch(() => legacyCopy(s))
  }
  try {
    return Promise.resolve(legacyCopy(s))
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * ComfyUI 任务包（一期）：三件东西，一起下载、一起存进 exports/。
 * - comfy-tasks.json  每镜一份填好变量的 API 格式 workflow
 * - comfy-run.mjs     零依赖执行器，拷到跑图那台机器 node 直接跑
 * - README.md         怎么用、工作流要怎么写占位符
 * 任务包不进 buildPackage 的 9 件：它依赖用户选中的工作流，不是「每部剧都该有」的东西。
 */
// 选中的 skill 规则：随包带一份 markdown，ComfyUI 侧的 LLM/文本节点要用时直接贴
function skillRulesFile(skills) {
  const list = Array.isArray(skills) ? skills.filter((s) => s && s.text) : []
  if (!list.length) return null
  const head = [
    '# skill 规则（随任务包存档）',
    '',
    '这些是你在工作台「设置 → Skill」里下载、并在生成旁选中的规则。',
    '每个 prompt 已经按目标生成模型语法重写过，**一般不需要再动**；',
    '只有工作流里带 LLM / 文本节点时，才把下面的正文贴进那个节点的 system。',
    '',
    list.map((s, i) => '- ' + (i + 1) + '. ' + s.fullName + ' · ' + s.file + '（' + (s.text || '').length + ' 字' + (s.truncated ? '，截断到 6000' : '') + '）').join('\n'),
    '',
  ].join('\n')
  const body = list
    .map((s, i) => '\n---\n\n## ' + (i + 1) + '/' + list.length + ' · ' + s.fullName + ' · ' + s.file + '\n\n' + s.text + '\n')
    .join('')
  return head + body
}

export function buildComfyAssetBundle(project, wf, opts = {}) {
  const tasks = buildAssetTasks(project, wf, opts)
  const safe = (project.meta?.title || '漫剧').replace(/[\\/:*?"<>|\s]/g, '_')
  const bundle = {
    version: 1,
    scope: 'assets',
    title: project.meta?.title || '',
    scriptId: project.meta?.id || '',
    kind: 'image',
    modelId: project.meta?.imageModel || '',
    comfyUrl: String(opts.comfyUrl || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
    workflowId: opts.workflowId || '',
    workflowHash: hashWorkflow(wf),
    createdAt: new Date().toISOString(),
    count: tasks.length,
    skills: (opts.skills || []).map((s) => ({ fullName: s.fullName, file: s.file, chars: (s.text || '').length })),
    tasks,
  }
  const rules = skillRulesFile(opts.skills)
  return [
    {
      key: 'comfyAssetTasks',
      label: 'ComfyUI 资产任务包',
      name: `${safe}_comfy-assets.json`,
      content: JSON.stringify(bundle, null, 1),
    },
    { key: 'comfyRunAssets', label: 'ComfyUI 执行脚本', name: 'comfy-run.mjs', content: COMFY_RUN_SCRIPT },
    { key: 'comfyAssetsReadme', label: '任务包说明', name: 'README-comfy.md', content: comfyReadme(bundle) },
    ...(rules ? [{ key: 'comfyAssetsSkills', label: 'Skill 规则', name: safe + '_skill-rules.md', content: rules }] : []),
  ]
}

export function buildComfyBundle(project, wf, opts = {}) {
  const kind = opts.kind === 'video' ? 'video' : 'image'
  const rules = skillRulesFile(opts.skills)
  const tasks = buildComfyTasks(project, wf, opts)
  const safe = (project.meta?.title || '漫剧').replace(/[\\/:*?"<>|\s]/g, '_')
  const bundle = {
    version: 1,
    title: project.meta?.title || '',
    scriptId: project.meta?.id || '',
    kind,
    modelId: kind === 'video' ? project.meta?.videoModel || '' : project.meta?.imageModel || '',
    comfyUrl: String(opts.comfyUrl || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
    workflowId: opts.workflowId || '',
    workflowHash: hashWorkflow(wf),
    createdAt: new Date().toISOString(),
    count: tasks.length,
    skills: (opts.skills || []).map((s) => ({ fullName: s.fullName, file: s.file, chars: (s.text || '').length })),
    tasks,
  }
  return [
    {
      key: 'comfyTasks',
      label: 'ComfyUI 任务包接口',
      name: `${safe}_comfy-tasks.json`,
      content: JSON.stringify(bundle, null, 1),
    },
    {
      key: 'comfyRun',
      label: 'ComfyUI 执行脚本',
      name: 'comfy-run.mjs',
      content: COMFY_RUN_SCRIPT,
    },
    {
      key: 'comfyReadme',
      label: 'ComfyUI 任务包说明',
      name: 'README-comfy.md',
      content: comfyReadme(bundle),
    },
    ...(rules ? [{ key: 'comfySkills', label: 'Skill 规则', name: safe + '_skill-rules.md', content: rules }] : []),
  ]
}
