// 提示词拼装（五件套：主体 + 场景 + 风格 + 镜头 + 负面 + 参数）
// 语法按「生图模型」分族输出，见 src/lib/imageModels.js
import { platform, styleOf, SIZE_EN, MOVE_EN, ANGLE_EN, outfitOf } from './schema.js'
import {
  videoModelById,
  videoFamilyOf,
  fillVideoParams,
  clampVideoDur,
  videoRefModeOf,
  DEFAULT_VIDEO_MODEL_ID,
} from './videoModels.js'
import { DEFAULT_MODEL_ID, modelById, fillParams, familyOf, refCapOf } from './imageModels.js'


// ── 资产生成（05 页上半：先把角色的图备齐，再谈镜头）────────────────
// 版式词按 kind 分开写死，因为「主视图」和「表情表」要的是两种完全不同的构图，
// 让模型自己理解「四视图」通常只会给你四张脸。

const ASSET_LAYOUT_EN = {
  main: 'full body character reference, standing straight facing the camera, neutral relaxed pose, entire figure inside the frame, plain light grey background',
  ortho: 'character turnaround sheet, four views of the SAME character side by side: front view, three-quarter view, side view, back view, identical costume, hairstyle and face in all four, evenly spaced, plain light grey background',
  expr: 'expression sheet, six head-and-shoulders studies of the SAME face arranged in a 2 by 3 grid: calm, angry, sad, surprised, sneering, blank, identical lighting, plain light grey background',
  acc: 'single prop on a plain background, product photograph, soft even light, subtle shadow, no hands, no people, centered',
  outfit: 'costume flat lay, the outfit laid out front and back, neatly arranged, plain background, even light, no person',
}

const ASSET_LAYOUT_CN = {
  main: '全身主视图，正面站立、姿势自然、整个人在画面里，浅灰纯色背景',
  ortho: '四视图角色设定图，同一个角色并排四格：正面、四分之三侧、正侧、背面，四格里的服装发型脸完全一致，间距均匀，浅灰纯色背景',
  expr: '表情设定图，同一张脸六个头部特写排成 2×3 网格：平静、愤怒、悲伤、惊讶、冷笑、面无表情，光线统一，浅灰纯色背景',
  acc: '单件配饰特写，产品级静物摄影，柔光、淡投影，画面里没有手也没有人，居中',
  outfit: '这套服装的平铺图，正反面都摊开、摆放整齐，纯色背景、均匀光，画面里没有人',
}

/** 每种素材的推荐比例（不同模型族共用） */
export const ASSET_RATIO = { main: '3:4', ortho: '16:9', expr: '1:1', acc: '1:1', outfit: '3:4' }

export const ASSET_PX = {
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 896, height: 1152 },
  '16:9': { width: 1344, height: 768 },
}

const slug = (s) =>
  String(s || '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '')
    .slice(0, 12) || 'char'

/**
 * 一条资产任务的提示词：主体（角色或服装/配饰）+ 版式 + 画风，按模型语法输出。
 * 返回 {full, negative, params, ratio, width, height, kind, modelId, modelName, family, seed}
 */
export function buildAssetPrompt(project, job, modelId) {
  const mid = modelId || project?.meta?.imageModel || DEFAULT_MODEL_ID
  const m = modelById(mid)
  const fam = m.family
  const kind = job?.kind || 'main'
  const ratio = ASSET_RATIO[kind] || '3:4'
  const px = ASSET_PX[ratio] || ASSET_PX['3:4']
  const st = styleOf(project)
  const ch = (project?.characters || []).find((c) => c.id === job?.charId) || null
  const outfit = ch && job?.outfitId ? (ch.outfits || []).find((o) => o.id === job.outfitId) || null : null

  const seed = Number(job?.seed) || Number(ch?.seed) || 0
  const en = ASSET_LAYOUT_EN[kind] || ASSET_LAYOUT_EN.main
  const cnw = ASSET_LAYOUT_CN[kind] || ASSET_LAYOUT_CN.main

  // 主体：配饰/服装不是「人」，别把角色锚定词塞进去
  let sufEn = ''
  let sufCn = ''
  if (kind === 'acc') {
    const prop = (ch && (ch.prop || '').trim()) || ''
    sufEn = prop ? `the signature accessory: ${prop}` : 'the signature accessory of this character'
    sufCn = prop ? `角色的标志性配饰：${prop}` : '这个角色的标志性配饰'
  } else if (kind === 'outfit') {
    const on = outfit ? `${outfit.seq || ''} ${outfit.name || ''}`.trim() : job?.name || '登场的这套服装'
    sufEn = outfit?.anchor ? `the costume: ${outfit.anchor}` : `the costume: ${on}`
    sufCn = `这套服装：${on}${outfit?.scene ? `（${outfit.scene}）` : ''}`
  } else if (ch) {
    sufEn = ch.random ? `random background passerby, ${ch.anchor || ch.look || ''}, face not fixed` : ch.anchor || ch.look || ch.name || 'the character'
    sufCn = ch.random ? `随机路人（${ch.look || ''}）` : charCnText(ch)
  } else {
    sufEn = 'the character'
    sufCn = '这个角色'
  }

  const negBase =
    kind === 'acc' || kind === 'outfit'
      ? 'person, people, hands, face, text, watermark, logo, clutter, busy background'
      : 'extra fingers, deformed face, extra limbs, text, watermark, logo, blurry, lowres, cropped head, duplic ate faces'
  const negCn = kind === 'acc' || kind === 'outfit'
    ? '人物、手、脸、文字、水印、logo、杂乱背景'
    : '多手多指、脸部变形、多余肢体、文字、水印、logo、模糊、头部被裁、重复的脸'

  // fillParams 返回的是 { params, ratio } 对象，这里要的是那行参数字符串
  const paramText = fillParams(mid, { ar: ratio, ...px, seed }).params
  let full = ''
  let negative = ''
  if (fam === 'mj') {
    // MJ 的参数（--ar / --style raw / --v 7）全部拼在句末，负向词只能是 --no 短词
    full = [sufEn, en, st.anchor, paramText].filter(Boolean).join(', ')
    negative = `--no text, watermark, logo, extra fingers, deformed face, blurry, lowres`
  } else if (fam === 'sd') {
    const lead = mid === 'sd-pony' ? 'score_9, score_8_up, score_7_up, source_anime, ' : 'masterpiece, best quality, '
    full = `${lead}${sufEn}, ${en}, ${st.anchor}, (${en.split(',')[0]}:1.2)`
    negative = `${negBase}, ${st.negative || ''}`.replace(/,\s*$/, '')
  } else if (fam === 'natural') {
    full = `${en} of ${sufEn}, ${st.anchor}, clean frame without any text or watermark`
    negative = negBase
  } else if (fam === 'cn') {
    full = `${sufCn}，${cnw}，${st.name ? `${st.name}画风` : ''}，${st.anchor}，${ratio === '16:9' ? '横屏' : ratio === '1:1' ? '方图' : '竖屏'} ${ratio}`
    negative = negCn
  } else {
    full = `帮我画一张${ratio}的图：${sufCn}。${cnw}。画风是${st.name}。画面里不要出现任何文字、水印或牌子。`
    negative = ''
  }

  return {
    full,
    negative,
    params: paramText,
    ratio,
    width: px.width,
    height: px.height,
    kind,
    modelId: m.id,
    modelName: m.name,
    family: fam,
    seed,
    charSlug: slug(ch?.name || job?.charName || job?.name),
  }
}

/** 一条资产任务的标准文件名前缀（脚本据此把图认回任务） */
export function assetPrefix(project, job, kind) {
  const p = buildAssetPrompt(project, job, project?.meta?.imageModel)
  return `asset_${kind}_${p.charSlug}_${String(job?.id || '').replace(/[^\w-]/g, '')}`
}

export function resolveChars(project, chars) {
  const raw = String(chars || '').trim()
  if (!raw) return []
  const byName = (n) => project.characters.find((c) => c.name === n)
  // 先按逗号/顿号/斜杠切；某段整段就是一个角色名时不再用空格拆（否则「路人甲」会被拆成「路人」+「甲」）
  const names = []
  raw
    .split(/[,，、/\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((seg) => {
      if (byName(seg)) return names.push(seg)
      seg.split(/\s+/).filter(Boolean).forEach((x) => names.push(x))
    })
  return names.map((n) => byName(n) || { name: n, anchor: '', look: '' })
}

/** 中文模型用：只要中文外貌字段，不带英文 anchor（否则中文串里夹一段英文，模型会跑偏） */
export function charCnText(c) {
  return [c.look, c.face, c.hair].filter(Boolean).join('，') || '同参考图'
}

export function charAnchorText(c) {
  if (c.random) {
    // 随机路人：不写名字、不锁 seed，让模型每次换一张脸
    return ['random background passerby', c.anchor || c.look, 'face not fixed, varies each generation, no consistent identity']
      .filter(Boolean)
      .join(', ')
  }
  return [c.name, c.anchor || c.look, c.hair, c.outfit, c.face].filter(Boolean).join(' ')
}

/**
 * 把 shot.outfit 里的服装号（O2）展开成那套服装卡的内容。
 * 换了场景换了衣服，只改这个号，不用重写主体描述——这是服装序列号存在的理由。
 */
export function shotOutfit(project, shot) {
  const codes = String(shot.outfit || '').trim()
  if (!codes) return { cn: '', en: '', items: [] }
  const chars = resolveChars(project, shot.chars)
  const items = chars
    .map((c) => {
      const full = project.characters.find((x) => x.name === c.name)
      const o = outfitOf(full, codes)
      return o ? { name: c.name, o } : null
    })
    .filter(Boolean)
  if (!items.length) return { cn: '', en: '', items: [] }
  return {
    cn: items
      .map(({ name, o }) => `${name} 服装 ${o.seq}（${o.name || '未命名'}${o.scene ? `，${o.scene}` : ''}）`)
      .join('；'),
    en: items.map(({ o }) => `outfit ${o.seq}: ${o.anchor || o.name}`).join('; '),
    items: items.map(({ name, o }) => ({ name, seq: o.seq, label: o.name || '未命名', scene: o.scene || '' })),
  }
}

const NEG_SHORT = ['text', 'watermark', 'logo', 'extra fingers', 'lowres', 'blurry']

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

/**
 * 一镜要喂给模型的参考图（多参生图）。
 * 顺序即优先级：角色脸 → 服装 → 场景。切换「首尾帧」时两张图共用这一套。
 */
export function shotRefs(project, shot) {
  const refs = []
  const chars = resolveChars(project, shot.chars)
  chars.forEach((c) => {
    const full = project.characters.find((x) => x.name === c.name)
    const list = full
      ? (Array.isArray(full.refImages) && full.refImages.length ? full.refImages : full.refImage ? [full.refImage] : [])
      : []
    if (list[0]) refs.push({ role: 'char', label: `${c.name} 面部与发型（锁脸）`, path: list[0] })
    if (list[1]) refs.push({ role: 'charFace2', label: `${c.name} 表情 / 侧面参考`, path: list[1] })
  })
  const outfit = shotOutfit(project, shot)
  outfit.items.forEach((it) => {
    const full = project.characters.find((x) => x.name === it.name)
    const o = full && Array.isArray(full.outfits) ? full.outfits.find((x) => x.seq === it.seq) : null
    if (o && o.refImage) refs.push({ role: 'outfit', label: `${it.name} 服装 ${it.seq}（锁衣服）`, path: o.refImage })
  })
  const sc = (project.assetImages || []).find((a) => a.kind === 'scene' && a.name && a.name === shot.scene)
  if (sc && sc.path) refs.push({ role: 'scene', label: `场景 ${sc.name}（锁背景）`, path: sc.path })
  return refs
}

/**
 * 多参绑定说明：这个模型能不能吃参考图、按什么顺序喂、写成什么话。
 * index 族直接拼进 prompt；cref 族（MJ）只能给命令行提示；none 族老实说吃不了。
 */
export function refLineOf(refs, modelId) {
  const cap = refCapOf(modelId)
  const m = modelById(modelId)
  if (!refs.length) return { text: '', cap, used: [] }
  const used = refs.slice(0, Math.max(cap.max, 0))
  if (!cap.max) {
    return {
      text: `〔多参〕${m.name} 不吃参考图 —— ${cap.note}。这一镜的一致性只能靠 seed 与文字锚定串，别把图片地址写进 prompt。`,
      cap,
      used: [],
    }
  }
  const list = used.map((r, i) => `${CIRCLED[i]}${r.label}`).join('；')
  if (cap.mode === 'cref') {
    return {
      text: `〔多参·${used.length} 张〕${list}。命令里加 --cref <${CIRCLED[0]}那张图地址> --cw 100${used.length > 1 ? `，再叠 --sref <${CIRCLED[used.length - 1]}那张>` : ''}`,
      cap,
      used,
    }
  }
  return {
    text: `参考图${list.replace(/；/g, '；参考图')}`,
    cap,
    used,
  }
}

/** 中文描述拆成短语，给 tag 式模型用 */
const toPhrases = (v) =>
  String(v || '')
    .split(/[，,。；;、…]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * 生成某一镜的提示词，语法由生图模型决定。
 * @param modelId 生图模型 id（不传则取 project.meta.imageModel，再退回默认 MJ v7）
 */
export function buildPrompt(project, ep, shot, modelId, opts = {}) {
  // 场景台账里有这张卡，就把主光源和色调并进 scene 段 ——
  // 否则同一个场景在不同镜头里的明暗会各写各的，剪到一条片子上一眼就穿。
  const _sceneCard = (project.scenes || []).find(
    (x) => String(x.name || '').trim() === String(shot.scene || '').trim()
  )
  if (_sceneCard) {
    const _env = [_sceneCard.light, _sceneCard.tone].filter(Boolean).join('，')
    if (_env) shot = { ...shot, scene: shot.scene + '｜' + _env }
  }
  const mid = modelId || (project.meta && project.meta.imageModel) || DEFAULT_MODEL_ID
  const m = modelById(mid)
  const fam = m.family
  const refs = opts.refs || shotRefs(project, shot)
  const refInfo = refLineOf(refs, mid)

  const pf = platform(project)
  const st = styleOf(project)
  const chars = resolveChars(project, shot.chars)
  const subject = chars.length
    ? chars.map((c) => `[${charAnchorText(c)}]`).join(' + ')
    : 'main character, consistent design'
  const outfit = shotOutfit(project, shot)
  const { params } = fillParams(mid, {
    ar: pf.ratio,
    w: pf.width,
    h: pf.height,
    seed: (chars[0] && chars[0].seed) || '',
  })

  const action = shot.desc || shot.action || ''
  const shotLine = [ANGLE_EN[shot.angle], SIZE_EN[shot.size], MOVE_EN[shot.move]].filter(Boolean).join(', ')
  const negFull = [st.negative, 'text', 'watermark', 'logo', 'extra fingers', 'deformed hands', 'face inconsistency', 'multiple panels', 'lowres', 'blurry']
    .filter(Boolean)
    .join(', ')

  let full = ''
  let negative = ''
  let note = m.note

  if (fam === 'mj') {
    full = [subject, outfit.en, action, shot.scene ? `scene: ${shot.scene}` : '', shot.props ? `props: ${shot.props}` : '', shotLine, st.anchor, params]
      .filter(Boolean)
      .join(', ')
    negative = `--no ${NEG_SHORT.join(', ')}`
    note = `${m.note}｜负向词只能以 --no 短词形式附在末尾`
  } else if (fam === 'sd') {
    const quality = m.id === 'sd-pony'
      ? 'score_9, score_8_up, score_7_up, source_anime'
      : 'masterpiece, best quality, highly detailed'
    const faceTags = chars.map((c) => `(${charAnchorText(c)}:1.2)`)
    const body = [
      ...faceTags,
      outfit.en ? `(${outfit.en}:1.15)` : '',
      ...toPhrases(action).slice(0, 4),
      ...toPhrases(shot.scene).slice(0, 2),
      ...toPhrases(shot.props).slice(0, 2),
      shot.emotion ? `${shot.emotion}` : '',
      ANGLE_EN[shot.angle],
      SIZE_EN[shot.size],
      MOVE_EN[shot.move],
      st.anchor,
    ].filter(Boolean)
    full = [quality, ...body].join(', ')
    negative = negFull
    note = `${m.note}｜中文片段建议译成英文 tag，效果更稳`
  } else if (fam === 'natural') {
    const sizeEn = SIZE_EN[shot.size] || ''
    full = [
      `${sizeEn} shot of ${subject}`,
      action ? `, ${action}` : '',
      outfit.en ? `, wearing ${outfit.en}` : '',
      shot.scene ? `, in ${shot.scene}` : '',
      shot.props ? `, with ${shot.props}` : '',
      `, ${shot.emotion || 'tense'} mood, ${shotLine}`,
      `, vertical ${pf.ratio} composition`,
      `, ${st.anchor}`,
      ', clean frame without any text, watermark or extra limbs',
    ].join('')
    negative = negFull
    note = `${m.note}｜上面的正面句已把负向要求改写进去；主体串里若有中文片段，建议先译成英文再喂`
  } else if (fam === 'cn') {
    const who = chars.length
      ? chars
          .map((c) => {
            const fit = outfit.items.find((x) => x.name === c.name)
            const wear = fit ? `穿 ${fit.seq} ${fit.label}` : c.outfit || ''
            if (c.random) return `随机路人（${c.look || '路人'}，不锁脸，每次可换脸）`
            return `${c.name}（${charCnText(c)}${wear ? `，${wear}` : ''}）`
          })
          .join('、')
      : '主角（同参考图）'
    full = [
      who,
      ...toPhrases(action),
      ...toPhrases(shot.scene),
      ...toPhrases(shot.props),
      `${shot.size}${shot.angle}${shot.move}`,
      shot.emotion ? `${shot.emotion}的情绪，强度 ${shot.intensity}/5` : '',
      `${st.name}画风`,
      st.anchor,
      `竖屏 ${pf.ratio}`,
    ].filter(Boolean).join('，')
    negative = '文字，水印，logo，多余手指，脸部崩坏，画面拼接，模糊，低清晰度'
    note = `${m.note}｜已按中文模型改写，不要夹英文 tag`
  } else {
    // chat：直接对人说话
    const who = chars.length
      ? chars
          .map((c) => {
            const fit = outfit.items.find((x) => x.name === c.name)
            const wear = fit ? `穿 ${fit.seq} ${fit.label}` : c.outfit || ''
            if (c.random) return `一名随机路人（${c.look || '路人'}，不锁脸，每次可以换一张脸）`
            return `${c.name}${wear ? `（${wear}）` : ''}`
          })
          .join('、')
      : '主角'
    full = [
      `帮我画一张竖屏 ${pf.ratio} 的画面：${action || '（待补画面）'}。`,
      `人物是${who}`,
      shot.scene ? `，场景在${shot.scene}` : '',
      `，${shot.size}${shot.angle}镜头，${shot.emotion || '紧张'}的情绪`,
      `，${st.name}画风，${st.anchor}`,
      '。画面里不要出现任何文字、水印或牌子，不要多出手指或重复的肢体。',
    ].join('')
    negative = '（对话型模型无负向框：上面的限制句已经写进指令里）'
    note = `${m.note}｜这是给对话窗口用的指令，不是 tag 串`
  }

  // 多参：index 族（即梦 / 万相 / 可灵 / 混元 / Banana）把「参考图①…」直接拼进正向串最有效；
  // MJ 只能靠命令行参数，单独给一段说明；none 族老实说吃不了。
  let refInline = ''
  if (refInfo.cap.max && refInfo.cap.mode === 'index' && refInfo.text) {
    refInline = fam === 'cn' || fam === 'chat' ? refInfo.text : refInfo.text
    full = fam === 'cn' ? `${full}，${refInline}` : `${full} ${refInline}`
  }

  const cnVersion = [
    `主体：${chars.length ? chars.map((c) => (c.random ? `随机路人（${c.look || '路人'}，不锁脸，每次可换脸）` : `${c.name}（${c.look || c.anchor || '同参考图'}）`)).join('、') : '主角（同参考图）'}`,
    `画面：${action || '（待补画面描述）'}`,
    ...(outfit.cn ? [`服装：${outfit.cn}`] : []),
    `场景：${shot.scene || '（待补）'}`,
    `镜头：${shot.angle}·${shot.size}·${shot.move}`,
    `情绪：${shot.emotion}（强度 ${shot.intensity}/5）`,
    `风格：${st.name}，${st.anchor}`,
    `负面：${fam === 'mj' ? NEG_SHORT.join('，') : fam === 'cn' ? '文字，水印，多余手指，脸部崩坏' : '见 Negative prompt'}`,
    `参数：${params}`,
    ...(refInfo.text ? [`多参：${refInfo.text}`] : []),
  ].join('\n')

  return {
    full,
    negative,
    params,
    cnVersion,
    subject,
    styleName: st.name,
    modelId: mid,
    modelName: m.name,
    family: fam,
    familyLabel: familyOf(mid).label,
    negMode: m.negMode,
    note,
    refs: refInfo.used,
    refAll: refs,
    refLine: refInfo.text,
    refCap: refInfo.cap,
    refInline,
  }
}

/** 动作链最后一段：尾帧该停在哪儿 */
export function tailOf(shot) {
  const chain = String(shot.action || '')
    .split(/→|；|;|然后|接着|随后|再|又/)
    .map((s) => s.trim())
    .filter(Boolean)
  return chain.length ? chain[chain.length - 1] : ''
}

/**
 * 首尾帧（多参生图）：同一镜出两张图 —— 首帧是本镜起势，尾帧是收势。
 * 两张图必须共用同一套参考图与 seed，只让「姿态 / 表情」这一维度变化，
 * 否则首尾帧插值会换脸、换背景。
 */
export function buildFramePair(project, ep, shot, modelId, opts = {}) {
  const mid = modelId || (project.meta && project.meta.imageModel) || DEFAULT_MODEL_ID
  const m = modelById(mid)
  const enFam = m.family === 'mj' || m.family === 'sd' || m.family === 'natural'
  const refs = opts.refs || shotRefs(project, shot)
  const tail = tailOf(shot)
  const headDesc = shot.desc || shot.action || ''
  // 帧标记必须和语法族同语言：英文串里夹中文括号会污染 MJ/SD 的解析
  const headMark = enFam ? ' (starting pose of this shot)' : '（本镜起势）'
  const tailMark = enFam
    ? ' (ending pose — same framing and light, the action completed, body settled, only posture and expression changed)'
    : tail
      ? `（本镜收势：${tail}）`
      : '（同一构图，动作已完成的静止定势）'
  const tailDesc = `${headDesc}${tailMark}`

  const first = buildPrompt(project, ep, { ...shot, desc: `${headDesc}${headMark}` }, mid, { refs })
  const last = buildPrompt(project, ep, { ...shot, desc: tailDesc }, mid, { refs })

  // 中文版：不管当前选的是哪一族模型，都按中文族（即梦）的语法另出一套串——
  // 中文模型看不懂 --ar 这类参数，也不吃负向框，硬塞英文标记会跑偏。
  const CN_PROXY_ID = 'jimeng'
  const cnHead = `${headDesc}（本镜起势：动作还没开始，人物是发力前的姿势）`
  const cnTail = tail
    ? `${headDesc}（本镜收势：${tail}；机位、景别、光线方向、服装、背景与首帧完全一致）`
    : `${headDesc}（本镜收势：动作已完成，静止定势；机位、景别、光线方向、服装、背景与首帧完全一致）`
  const cnOf = (descText) => {
    const r = buildPrompt(project, ep, { ...shot, desc: descText }, CN_PROXY_ID, { refs })
    return `${r.full}\n参数：${r.params}｜负面：${r.negative}`
  }
  const firstCn = cnOf(cnHead)
  const lastCn = cnOf(cnTail)

  const bridge = [
    `从首帧到尾帧只变「${tail || '动作与表情'}」`,
    '机位、景别、光线方向、服装、背景陈设全部锁死',
    `两张图共用同一 seed（${(resolveChars(project, shot.chars)[0] || {}).seed || '见角色卡'}）与同一套参考图`,
  ].join('；')

  return {
    mode: 'pair',
    modelId: mid,
    modelName: first.modelName,
    family: first.family,
    familyLabel: first.familyLabel,
    refs: first.refAll,
    refLine: first.refLine,
    refCap: first.refCap,
    first,
    last,
    firstCn,
    lastCn,
    bridge,
    cnVersion: [
      `【首帧】${first.cnVersion}`,
      '',
      `【尾帧】${last.cnVersion}`,
      '',
      `【帧间桥接】${bridge}`,
    ].join('\n'),
  }
}

// 视频（图生视频）提示词：运动幅度 + 首尾帧说明
// 英文视频模型不吃中文动作句，用高频动作词表拼英文短语；
// 词组是按出现顺序取的，最多两个动作——再多模型会挑一个随手做。
// 主体动作词表：只收「人做了什么」，不收镜头运动（横移 / 俯拍 / 升起 属于 move，不进这里）
// 顺序有意义：先匹配到的先取；一句话最多取两个动词，写多了模型会随手挑一个。
const ACTION_EN = [
  [/按住|压住|按在|压在|按住不放/, "presses it down"],
  [/推到|推向|递到|放到|拍在|搁在|立在|摆在|放在/, "sets it down"],
  [/推回|塞回|收回|抽回/, "pushes it back"],
  [/捡起|拾起|拿起|抓起|抽出|取出|掏出/, "picks it up"],
  [/翻开|翻到|掀开|打开|摊开/, "opens it"],
  [/合上|盖上|扣上|收起/, "closes it"],
  [/扫落|扫到地上|打翻|拂落|扫下去/, "sweeps it off the table"],
  [/拍桌|砸|捶|重重放下/, "slams a hand on the table"],
  [/拂过|摸过|滑过|掠过|抚过/, "brushes a hand along it"],
  [/掩鼻|捂住鼻|捂嘴|遮住脸/, "covers the mouth and nose"],
  [/抬眼|抬起眼|抬眸|抬眼时/, "lifts the eyes"],
  [/抬头|仰起头|仰头/, "lifts the head"],
  [/低头|垂下眼|垂眼|垂下头/, "lowers the eyes"],
  [/转头|回头|扭头/, "turns the head"],
  [/转身/, "turns around"],
  [/后退|退后|退开|退半步|退了一步/, "steps back"],
  [/上前|走近|靠近|逼近|跨上前|走上/, "steps forward"],
  [/跪下|下跪|跪了|跪在地/, "kneels down"],
  [/站起|起身|站直|站定|站起来/, "straightens up"],
  [/坐下|落座/, "sits down"],
  [/握拳|攥紧|捏紧|扣紧|抓住|揪住|攥|紧攥/, "tightens the grip"],
  [/抬手|举手|伸出手|伸手|伸手把/, "raises a hand"],
  [/举起|高高举起|朝天/, "raises it up"],
  [/揭下|扯下|摘下|撕下|一把揭/, "pulls it off"],
  [/挂上|挂到|钉上/, "hangs it up"],
  [/落泪|流泪|哭|眼眶/, "tears up"],
  [/冷笑|嗤笑|笑了一下|勾了下嘴角|笑出声/, "gives a cold half-smile"],
  [/咬牙|咬住|咬紧/, "clenches the jaw"],
  [/颤抖|发抖/, "trembles"],
  [/推开|推门|推开门/, "pushes the door open"],
  [/撕碎|扯碎|撕/, "tears the paper apart"],
  [/扔|摔|甩开|甩/, "throws it down"],
  [/递出|递|交出/, "hands it over"],
  [/接过|接下/, "takes it"],
  [/指向|指着|点在|点了点|指了/, "points at it"],
  [/看向|望向|盯着|注视|视线转向|目光/, "looks straight ahead"],
  [/睁大眼|瞪/, "widens the eyes"],
  [/俯身|弯下腰|倾身|压低身子/, "leans in"],
  [/喘|呼吸/, "breathes heavily"],
  [/倒下|倒地/, "collapses"],
  [/跑|奔跑|冲出去/, "runs forward"],
  [/走开|离去|离开|走出|走到|走进/, "walks over"],
  [/挡住|拦住|挡在|拦住去路/, "blocks the way"],
  [/吞|咽下/, "swallows hard"],
  [/愣|怔|呆住|僵住/, "freezes for a beat"],
]
const STYLE_GROUP_EN = {
  guoman: 'Chinese manhua illustration style, thick painterly shading',
  japan: 'Japanese anime style, clean linework',
  west: 'Western comic style, bold ink',
  real: 'cinematic realistic style, film lighting',
  stylized: 'stylized illustration style',
  custom: 'consistent illustration style',
}

function actionEn(action) {
  const hits = []
  for (const [re, en] of ACTION_EN) {
    if (re.test(action)) {
      hits.push(en)
      if (hits.length >= 2) break
    }
  }
  return hits.length ? hits.join(', then ') : 'moves with a small, restrained gesture'
}

export function buildVideoPrompt(project, ep, shot, modelId) {
  // 场景台账里有这张卡，就把主光源和色调并进 scene 段 ——
  // 否则同一个场景在不同镜头里的明暗会各写各的，剪到一条片子上一眼就穿。
  const _sceneCard = (project.scenes || []).find(
    (x) => String(x.name || '').trim() === String(shot.scene || '').trim()
  )
  if (_sceneCard) {
    const _env = [_sceneCard.light, _sceneCard.tone].filter(Boolean).join('，')
    if (_env) shot = { ...shot, scene: shot.scene + '｜' + _env }
  }
  const pf = platform(project)
  const st = styleOf(project)
  const mid = modelId || project.meta?.videoModel || DEFAULT_VIDEO_MODEL_ID
  const m = videoModelById(mid)
  const fam = m.family
  const dur = clampVideoDur(mid, shot.dur)
  const outfit = shotOutfit(project, shot)
  const chars = resolveChars(project, shot.chars)
  const action = shot.action || shot.desc || '本镜没有写动作'
  const moveCn = shot.move && shot.move !== '固定' ? `${shot.move}镜` : '不动'
  const moveEn = MOVE_EN[shot.move] || 'static camera'
  const sizeEn = SIZE_EN[shot.size] || 'medium shot'
  const angleEn = ANGLE_EN[shot.angle] || 'eye level'
  const scale = (Number(shot.intensity) || 3) >= 4 ? '大' : '小'
  const whoEn = chars.length
    ? chars.map((c) => (c.random ? 'a background passerby' : `${c.name} (${c.look || 'same as reference'})`)).join(' and ')
    : 'the subject'
  const whoCn = chars.length ? chars.map((c) => (c.random ? '一名过路的人' : c.name)).join('、') : '画面主体'
  const scene = shot.scene || '同一场景'
  const sceneEn = /[\u4e00-\u9fa5]/.test(scene) ? 'the same interior as the reference frame' : scene
  const styleEn = STYLE_GROUP_EN[st.group] || STYLE_GROUP_EN.stylized
  // 英文族：动作句里只要有中文，就换成动作词表拼出的英文短语
  const actionEnText =
    shot.actionEn && String(shot.actionEn).trim()
      ? String(shot.actionEn).trim()
      : /[\u4e00-\u9fa5]/.test(action)
        ? actionEn(action)
        : action
  const faceLock = '锁定面部与服装，不换人，不加字幕与文字'
  const params = fillVideoParams(mid, { dur, ar: m.ratio || '9:16', fps: pf.fps })

  let full = ''
  if (fam === 'keling') {
    full = `${whoCn}在${scene}，${action}。镜头${moveCn}，动作幅度${scale}，${dur} 秒。${outfit.cn ? `穿着${outfit.cn}。` : ''}${faceLock}，保持${st.name}画风。`
  } else if (fam === 'jimeng') {
    full = `${whoCn}，${action}；机位${shot.move || '固定'}，幅度${scale}，时长 ${dur} 秒。${faceLock}。`
  } else if (fam === 'english') {
    full = `${whoEn}, ${actionEnText}, ${sceneEn}. ${sizeEn}, ${angleEn}, ${moveEn}, motion ${scale === '大' ? 'clear and readable' : 'subtle'}, ${dur} seconds, ${styleEn}, consistent face and wardrobe, no text on screen.`
  } else if (fam === 'bracket') {
    full = `【${shot.move || '固定'}】${whoCn}，${action}。${outfit.cn ? `穿着${outfit.cn}。` : ''}${dur} 秒，幅度${scale}，${faceLock}。`
  } else {
    const beats = String(action)
      .split(/→|；|;|然后|接着|随后/)
      .map((x) => x.trim())
      .filter(Boolean)
    const flow = beats.length > 1 ? beats.join('，接着') : action
    full = `${whoCn}在${scene}，先是静止，接着${flow}，最后定住。镜头${moveCn}，全程 ${dur} 秒，${faceLock}。`
  }

  const negative =
    fam === 'english' ? '' : '画面模糊、脸部变形、多手多指、字幕水印、镜头抖动过大、人物突变'
  const refLine =
    videoRefModeOf(mid) === 'first-last'
      ? `首帧用 05 页镜${shot.no} 的图；尾帧用「${action}」的收势再出一张（同 seed、同服装）`
      : `首帧用 05 页镜${shot.no} 的图（同 seed、同服装）`

  return {
    full,
    negative,
    params,
    cnVersion: full,
    modelId: mid,
    modelName: m.name,
    family: fam,
    familyLabel: videoFamilyOf(mid).label,
    dur,
    durRange: m.durRange,
    refMode: videoRefModeOf(mid),
    refLine,
    note: m.note,
  }
}
