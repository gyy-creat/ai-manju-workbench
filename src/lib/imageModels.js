/**
 * 生图模型注册表：先选模型，再按该模型的语法生成提示词。
 *
 * 为什么要这一层：同样是「沈砚在工棚里抬头看」这一镜，
 * MJ 要「英文长句 + --ar 9:16 --style raw」，
 * SD 要「tag 堆叠 + 独立 Negative 框 + (face:1.2) 权重」，
 * FLUX 不吃负向词（得把要求写进正向句），
 * 即梦/星流要全中文短语，DALL·E 要一句大白话指令。
 * 拿一套串喂所有模型，等于让模型自己猜语法——出图质量就是这么掉的。
 */

export const IMAGE_FAMILIES = {
  mj: {
    label: 'MJ 参数式',
    desc: '英文自然语言长句，指令参数写在最后（--ar / --style / --v）',
  },
  sd: {
    label: 'SD tag 式',
    desc: '英文短标签逗号堆叠，权重用括号，负向词单独放 Negative 框',
  },
  natural: {
    label: '自然语言式',
    desc: '一整段连贯英文描述，不认指令参数，多半也不吃负向词',
  },
  cn: {
    label: '中文自然句',
    desc: '全中文短语，比例与清晰度写在描述里',
  },
  chat: {
    label: '对话指令式',
    desc: '直接对模型说话，用文字提要求代替参数',
  },
}

export const IMAGE_MODELS = [
  {
    id: 'mj-v7',
    name: 'Midjourney v7',
    vendor: 'Midjourney',
    family: 'mj',
    ratio: '--ar {ar}',
    params: '--ar {ar} --style raw --v 7',
    negMode: 'no',
    note: '英文长句为主，参数一律放最后；--no 只放短词',
  },
  {
    id: 'mj-niji6',
    name: 'Midjourney Niji 6',
    vendor: 'Midjourney',
    family: 'mj',
    ratio: '--ar {ar}',
    params: '--ar {ar} --niji 6 --style expressive',
    negMode: 'no',
    note: '二次元专线，国漫厚涂建议加 --style expressive',
  },
  {
    id: 'sd-webui',
    name: 'SD WebUI / SDXL',
    vendor: 'Stability',
    family: 'sd',
    ratio: 'Size {w}x{h}',
    params: 'Steps: 30, CFG: 7, Sampler: DPM++ 2M Karras, Size: {w}x{h}, Seed: {seed}',
    negMode: 'field',
    note: 'tag 堆叠 + 权重括号；负面词必须填进 Negative prompt 框',
  },
  {
    id: 'sd-pony',
    name: 'Pony Diffusion V6 XL',
    vendor: '社区模型',
    family: 'sd',
    ratio: 'Size {w}x{h}',
    params: 'Steps: 28, CFG: 7, Sampler: Euler a, Size: {w}x{h}, Seed: {seed}',
    negMode: 'field',
    note: '开头要带 score_9, score_8_up 质量串，风格词放后段',
  },
  {
    id: 'flux',
    name: 'FLUX.1 dev',
    vendor: 'Black Forest',
    family: 'natural',
    ratio: 'vertical {ar} composition',
    params: 'guidance 3.5 · steps 28 · 竖版 {ar}',
    negMode: 'inline',
    note: '不认 --参数也不吃负向词，负向要求必须改写进正向句',
  },
  {
    id: 'sd3',
    name: 'Stable Diffusion 3.5',
    vendor: 'Stability',
    family: 'natural',
    ratio: 'vertical {ar} aspect',
    params: 'steps 30 · CFG 4.5 · 竖版 {ar}',
    negMode: 'field',
    note: 'SD3 吃自然语言，别再堆 tag；负面词时长句无效',
  },
  {
    id: 'jimeng',
    name: '即梦 Seedream 4.0',
    vendor: '字节',
    family: 'cn',
    ratio: '比例 {ar}',
    params: '比例 {ar} · 清晰度 2K',
    negMode: 'field',
    note: '全中文短语，别夹英文 tag；反向词单独填',
  },
  {
    id: 'wanxiang',
    name: '通义万相 Qwen-Image',
    vendor: '阿里',
    family: 'cn',
    ratio: '画面比例 {ar}',
    params: '比例 {ar} · 风格强度 中',
    negMode: 'field',
    note: '支持中文长描述，人物动作要写具体',
  },
  {
    id: 'keling',
    name: '可灵图像',
    vendor: '快手',
    family: 'cn',
    ratio: '比例 {ar}',
    params: '比例 {ar} · 参考图强度 0.6',
    negMode: 'field',
    note: '有参考图时锁角色，提示词里只写「做动作 + 换场景」',
  },
  {
    id: 'hunyuan',
    name: '混元生图',
    vendor: '腾讯',
    family: 'cn',
    ratio: '比例 {ar}',
    params: '比例 {ar}',
    negMode: 'field',
    note: '中文短语，画风词要前置',
  },
  {
    id: 'dalle3',
    name: 'DALL·E 3 / GPT-Image',
    vendor: 'OpenAI',
    family: 'chat',
    ratio: '竖屏 {ar}',
    params: '无参数，直接对话',
    negMode: 'inline',
    note: '当人说话：一句话说清画面，末尾提「不要出现任何文字」',
  },
  {
    id: 'banana',
    name: 'Nano Banana（Gemini 生图）',
    vendor: 'Google',
    family: 'chat',
    ratio: '竖屏 {ar}',
    params: '无参数，直接对话 / 带参考图改图',
    negMode: 'inline',
    note: '擅长「拿这张改编」，多角色同框时点明谁在左谁在右',
  },
  {
    id: 'flux-11pro',
    name: 'FLUX 1.1 Pro',
    vendor: 'Black Forest Labs',
    family: 'natural',
    ratio: 'vertical {ar} composition',
    params: 'guidance 3.5 · steps 28 · 竖版 {ar}',
    negMode: 'inline',
    note: '句子式描述，不认负向词；写清光线与材质比堆词有效',
  },
  {
    id: 'flux-kontext',
    name: 'FLUX.1 Kontext',
    vendor: 'Black Forest Labs',
    family: 'natural',
    ratio: '保持原图 {ar}',
    params: 'guidance 2.5 · steps 28 · 编辑模式',
    negMode: 'inline',
    note: '改图专用：把「把 A 换成 B」写成一句话，别堆形容词',
  },
  {
    id: 'sd35',
    name: 'Stable Diffusion 3.5 Large',
    vendor: 'Stability AI',
    family: 'sd',
    ratio: 'Size {w}x{h}',
    params: 'Steps: 28, CFG: 4.5, Sampler: DPM++ 2M, Size: {w}x{h}, Seed: {seed}',
    negMode: 'field',
    note: 'CFG 别超过 5，太高画面发硬；负面词进 Negative 框',
  },
  {
    id: 'sdxl',
    name: 'SDXL 1.0',
    vendor: 'Stability AI',
    family: 'sd',
    ratio: 'Size {w}x{h}',
    params: 'Steps: 30, CFG: 7, Sampler: DPM++ 2M Karras, Size: {w}x{h}, Seed: {seed}',
    negMode: 'field',
    note: '生态最大，可挂 IPAdapter / ControlNet；tag 用逗号分隔',
  },
  {
    id: 'playground-v25',
    name: 'Playground v2.5',
    vendor: 'Playground',
    family: 'sd',
    ratio: 'Size {w}x{h}',
    params: 'Steps: 30, CFG: 7, Size: {w}x{h}, Seed: {seed}',
    negMode: 'field',
    note: '审美偏清爽，中式古风要加重服饰与建筑描述',
  },
  {
    id: 'ideogram-3',
    name: 'Ideogram 3.0',
    vendor: 'Ideogram',
    family: 'natural',
    ratio: '--ar {ar}',
    params: '--ar {ar} --style AUTO --magic true',
    negMode: 'inline',
    note: '画面里要出现的汉字直接加引号写，它比别的模型更能写对字',
  },
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    vendor: 'Recraft',
    family: 'natural',
    ratio: '--ar {ar}',
    params: '--ar {ar} --style realistic',
    negMode: 'inline',
    note: '线条与矢量感强，适合定妆图与图标式元素',
  },
  {
    id: 'firefly-4',
    name: 'Firefly Image 4',
    vendor: 'Adobe',
    family: 'natural',
    ratio: '--ar {ar}',
    params: '--ar {ar} --style photo',
    negMode: 'inline',
    note: '写实与光照稳，风格化弱；商业稿可直接用',
  },
  {
    id: 'luma-photon',
    name: 'Luma Photon',
    vendor: 'Luma',
    family: 'natural',
    ratio: '--ar {ar}',
    params: '--ar {ar} --enhance',
    negMode: 'inline',
    note: '短句即可，过长描述反而掉质量',
  },
  {
    id: 'grok-aurora',
    name: 'Grok Aurora',
    vendor: 'xAI',
    family: 'chat',
    ratio: '竖屏 {ar}',
    params: '无参数，直接描述',
    negMode: 'inline',
    note: '对话式提要求；写实人像强，二次元偏弱',
  },
  {
    id: 'gpt-image',
    name: 'GPT Image 1',
    vendor: 'OpenAI',
    family: 'chat',
    ratio: '竖屏 {ar}',
    params: 'size {w}x{h} · quality high',
    negMode: 'inline',
    note: '指令式：先说用途再说画面；要改图就传图并说明改哪里',
  },
  {
    id: 'seedream3',
    name: '即梦 Seedream 3.0',
    vendor: '字节跳动',
    family: 'cn',
    ratio: '比例 {ar}',
    params: '比例 {ar} · 清晰度 2K',
    negMode: 'field',
    note: '中文短语，逗号分隔；别夹英文长句',
  },
  {
    id: 'kolors',
    name: '可图 Kolors 2.0',
    vendor: '快手',
    family: 'cn',
    ratio: '尺寸 {w}×{h}',
    params: '尺寸 {w}×{h} · 中文提示词',
    negMode: 'field',
    note: '中文人像强，服饰与材质描述要具体',
  },
  {
    id: 'hunyuan-image3',
    name: '混元图像 3.0',
    vendor: '腾讯',
    family: 'cn',
    ratio: '尺寸 {w}×{h}',
    params: '尺寸 {w}×{h} · 中文提示词',
    negMode: 'field',
    note: '国风与建筑细节好；多角色要点明位置',
  },
  {
    id: 'qwen-image',
    name: 'Qwen-Image',
    vendor: '阿里通义',
    family: 'cn',
    ratio: '尺寸 {w}×{h}',
    params: '尺寸 {w}×{h} · 中文提示词',
    negMode: 'field',
    note: '开源可本地跑；中文字形准确度较高',
  },
  {
    id: 'cogview4',
    name: 'CogView-4',
    vendor: '智谱',
    family: 'cn',
    ratio: '尺寸 {w}×{h}',
    params: '尺寸 {w}×{h} · 中文提示词',
    negMode: 'field',
    note: '中文理解好，画面里带字时写清字号与位置',
  },
  {
    id: 'step1x',
    name: 'Step-1X',
    vendor: '阶跃星辰',
    family: 'cn',
    ratio: '尺寸 {w}×{h}',
    params: '尺寸 {w}×{h} · 中文提示词',
    negMode: 'field',
    note: '写实与国漫都行；提示词按「谁 + 在做什么 + 在哪」写',
  },
]

export const DEFAULT_MODEL_ID = 'mj-v7'

/**
 * 多参生图（参考图 / 首尾帧）能力表。
 * max = 一次能塞几张参考图；mode 决定提示词里怎么写这件事。
 */
export const REF_CAPS = {
  'mj-v7': { max: 3, mode: 'cref', note: '用 --cref 锁人（2–3 张最稳）、--sref 锁风格；参考图先传，参数放最后' },
  'mj-niji6': { max: 3, mode: 'cref', note: 'niji 走 --cref + --niji 6，二次元脸部建议 --cw 100' },
  'sd-webui': { max: 0, mode: 'none', note: '原生不吃参考图，要 IPAdapter / ControlNet 插件；只能靠 seed + 文字锚定' },
  'sd-pony': { max: 0, mode: 'none', note: '同 SD：参考图需 IPAdapter，纯文生图靠 score 串与固定 seed' },
  flux: { max: 0, mode: 'none', note: 'FLUX.1 dev 文生图不吃参考图；换脸用 Kontext 版做局部改图' },
  sd3: { max: 0, mode: 'none', note: 'SD3 可挂 IPAdapter，但官方文生图不认图；一致性靠 seed' },
  jimeng: { max: 4, mode: 'index', note: '即梦支持 1–4 张参考图，上传后按「参考图① ②」顺序点名用途' },
  wanxiang: { max: 3, mode: 'index', note: '万相参考图最多 3 张，人物图放第一张' },
  keling: { max: 3, mode: 'index', note: '可灵首尾帧模式给两张图最准（首帧 + 尾帧），人脸图另挂参考' },
  hunyuan: { max: 3, mode: 'index', note: '混元同框多角色时，参考图顺序要和画面描述里的左右一致' },
  dalle3: { max: 0, mode: 'none', note: 'DALL·E 3 不吃参考图，锁人只能靠文字锚定 + 固定构图' },
  banana: { max: 6, mode: 'index', note: 'Nano Banana 多图融合最强，可一次挂 5–6 张并直接说「把图 1 的脸放到图 2 的姿势」' },
  'flux-11pro': { max: 0, mode: 'none', note: 'FLUX 1.1 Pro 文生图不吃参考图，改图请换 Kontext' },
  'flux-kontext': { max: 2, mode: 'index', note: 'Kontext 专做改图：挂 1 张原图 + 一句话说改哪里，别写整段画面' },
  sd35: { max: 0, mode: 'none', note: 'SD3.5 官方不认图，需 IPAdapter；一致性靠 seed' },
  sdxl: { max: 0, mode: 'none', note: 'SDXL 靠 IPAdapter / ControlNet 挂图，纯文生图不认' },
  'playground-v25': { max: 0, mode: 'none', note: 'Playground 不认参考图，锁人只能靠文字锚定' },
  'ideogram-3': { max: 1, mode: 'index', note: 'Ideogram 3 支持 1 张参考图，主要用来定色调与版式' },
  'recraft-v3': { max: 0, mode: 'none', note: 'Recraft 以文字为主，不挂参考图' },
  'firefly-4': { max: 1, mode: 'index', note: 'Firefly 可读 1 张风格参考图' },
  'luma-photon': { max: 1, mode: 'index', note: 'Photon 支持 1 张参考图做风格或主体参考' },
  'grok-aurora': { max: 1, mode: 'index', note: '对话里附 1 张图说「参照这张的脸」' },
  'gpt-image': { max: 3, mode: 'index', note: 'GPT Image 可带多张图编辑，说清「用图 1 的脸 + 图 2 的姿势」' },
  seedream3: { max: 2, mode: 'index', note: 'Seedream 3 支持 2 张参考图，人物放第一张' },
  kolors: { max: 3, mode: 'index', note: '可图最多 3 张参考图，人脸图放第一张' },
  'hunyuan-image3': { max: 3, mode: 'index', note: '混元 3 最多 3 张，顺序与画面左右一致' },
  'qwen-image': { max: 3, mode: 'index', note: 'Qwen-Image 支持多图编辑，最多 3 张' },
  cogview4: { max: 1, mode: 'index', note: 'CogView-4 支持 1 张参考图' },
  step1x: { max: 1, mode: 'index', note: 'Step-1X 支持 1 张参考图' },
}

export const refCapOf = (modelId) => REF_CAPS[modelById(modelId).id] || { max: 0, mode: 'none', note: '' }

export const modelById = (id) => IMAGE_MODELS.find((m) => m.id === id) || IMAGE_MODELS[0]

export const familyOf = (id) => IMAGE_FAMILIES[modelById(id).family]

/** 把 {ar} {w} {h} {seed} 换成真值 */
export function fillParams(modelId, { ar = '9:16', w = 1080, h = 1920, seed = '' } = {}) {
  const m = modelById(modelId)
  const sub = (s) => String(s || '').replace(/\{ar\}/g, ar).replace(/\{w\}/g, w).replace(/\{h\}/g, h).replace(/\{seed\}/g, seed || '随机')
  return { params: sub(m.params), ratio: sub(m.ratio) }
}

/** 喂给 LLM 的语法规范（越具体，模型越不会退回「套话式 prompt」） */
export function modelSpecText(modelId, ctx = {}) {
  const m = modelById(modelId)
  const { ar = '9:16', w = 1080, h = 1920 } = ctx
  const head = `目标生图模型：${m.name}（${m.vendor}），语法族：${IMAGE_FAMILIES[m.family].label}。`

  const rules = {
    mj: [
      '输出一段英文，用逗号分隔的连贯描述，从主体写到环境再写光线与质感，不要用 tag 堆砌。',
      `末尾必须带参数：${m.params.replace('{ar}', ar)}`,
      '负向不要写成 Negative prompt 字段，只能以 `--no text, watermark, extra fingers` 这种短词列表附在最后。',
      '不要出现中文，不要出现「提示词：」这类前缀。',
    ],
    sd: [
      '输出英文 tag 串：短词、逗号分隔、小写优先，禁止整句长描述。',
      '顺序：质量词 → 主体与外貌 → 动作 → 服装 → 场景 → 镜头 → 光线 → 画风。',
      '重要项用权重括号，例如 (face:1.2)、(detailed eyes:1.1)，权重不超过 1.3。',
      '负向词单独输出，用逗号分隔的短词，不要写进正向串。',
      m.id === 'sd-pony'
        ? '开头必须是 score_9, score_8_up, score_7_up, source_anime 质量串。'
        : '开头可带 masterpiece, best quality, highly detailed。',
    ],
    natural: [
      '输出一整段连贯英文，像在向画师描述画面：主体 → 动作 → 服装 → 场景 → 光线 → 镜头 → 画风。',
      '不要写 --ar 之类的指令参数，也不要写 tag 堆叠。',
      `构图要求写进句子：vertical ${ar} composition。`,
      '这个模型不吃负向词，把「不要文字、不要水印、不要多余手指」改写成正向约束句，例如 clean frame without any text。',
    ],
    cn: [
      '输出全中文，短语之间用逗号分隔，读起来像在跟美术说画面。',
      '顺序：主体外貌与服装 → 动作与表情 → 场景 → 光线氛围 → 镜头景别 → 画风。',
      `结尾写「竖屏 ${ar}」与清晰度要求。`,
      '不要夹英文 tag，不要出现 --参数。',
      '负向词单独输出中文短词。',
    ],
    chat: [
      '输出一段可以直接发给对话型模型的指令，用中文自然语言，一到三句话。',
      '先说要什么画面（主体、动作、服装、场景、光线、景别、画风），再用一句话说限制（不要出现任何文字、水印、多人肢体错乱）。',
      '不要写任何参数，不要写 tag，不要分行列点。',
      '如果镜头里有多个角色，点明谁在左谁在右、谁在前谁在后。',
    ],
  }[m.family]

  return [head, ...rules.map((r, i) => `${i + 1}. ${r}`)].join('\n')
}
