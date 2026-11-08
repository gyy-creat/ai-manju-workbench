/**
 * 生视频模型注册表：先选模型，再按该模型的语法生成视频提示词。
 *
 * 生图和生视频是两套语法：
 * - 生图要「一张静止画面的完整描述」；
 * - 生视频要「这一镜里发生了什么变化」，主体 + 动作 + 运镜 + 时长，且必须锁住不动的部分。
 *
 * 而且各家视频模型写法差得远：可灵吃中文描述 + 运镜词；Runway 要英文镜头语言；
 * 海螺要求在句首用【】标运镜；即梦/Seedance 吃图 + 中文短语 + 时长参数；
 * Hailuo/Luma 对负面词的态度也不一样。混着喂，出来的就是慢动作 PPT。
 */

export const VIDEO_FAMILIES = {
  keling: {
    label: '可灵式',
    desc: '中文描述「主体 + 动作 + 环境」，运镜写在句子里，负面单独给',
  },
  jimeng: {
    label: '即梦 / Seedance 式',
    desc: '中文短语 + 首帧图，运镜与时长写在末尾参数位',
  },
  english: {
    label: '英文镜头语言式',
    desc: '英文一句话讲清「谁在做什么 + 镜头怎么动」，不写参数',
  },
  bracket: {
    label: '方括号运镜式',
    desc: '句首用【运镜】标记机位运动，正文写动作，负向词单独列',
  },
  cnmotion: {
    label: '中文动作流式',
    desc: '连续中文短句按时间顺序写动作变化，不写镜头术语之外的参数',
  },
}

export const VIDEO_MODELS = [
  {
    id: 'keling-16',
    name: '可灵 1.6',
    vendor: '快手',
    family: 'keling',
    durRange: [5, 10],
    ratio: '9:16',
    params: '模式=专业；时长 {dur}s；比例 {ar}',
    refMode: 'first',
    note: '首帧图 + 中文描述，运镜词（推/拉/摇/移/跟/升降）直接写在句子里效果最好',
  },
  {
    id: 'jimeng-sd',
    name: '即梦 Seedance 3.0',
    vendor: '字节',
    family: 'jimeng',
    durRange: [5, 10],
    ratio: '9:16',
    params: '--dur {dur} --ratio {ar} --fps {fps}',
    refMode: 'first-last',
    note: '吃首帧/尾帧两张图，描述里不要再复述画面内容，只写「怎么动」',
  },
  {
    id: 'runway-gen4',
    name: 'Runway Gen-4',
    vendor: 'Runway',
    family: 'english',
    durRange: [5, 10],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first',
    note: '英文一句话 + 镜头动词（dolly in / pan left / handheld），越短越稳',
  },
  {
    id: 'pika-2',
    name: 'Pika 2.2',
    vendor: 'Pika',
    family: 'english',
    durRange: [3, 10],
    ratio: '9:16',
    params: '-d {dur} -ar {ar} -motion 2',
    refMode: 'first',
    note: '英文短句 + -motion 控制动态幅度，动作太多会糊',
  },
  {
    id: 'hailuo-02',
    name: '海螺 02',
    vendor: 'MiniMax',
    family: 'bracket',
    durRange: [6, 10],
    ratio: '9:16',
    params: '时长 {dur}s · {ar}',
    refMode: 'first-last',
    note: '句首【推近】【横移】这类方括号指令识别度最高，正文只写动作变化',
  },
  {
    id: 'hunyuan-video',
    name: '混元视频',
    vendor: '腾讯',
    family: 'cnmotion',
    durRange: [5, 10],
    ratio: '9:16',
    params: '时长 {dur}s · 分辨率 720p',
    refMode: 'first',
    note: '中文动作流，按「先…接着…最后…」写时间顺序，模型会照着推进',
  },
  {
    id: 'wan-video',
    name: '通义万相视频',
    vendor: '阿里',
    family: 'cnmotion',
    durRange: [5, 10],
    ratio: '9:16',
    params: '时长 {dur}s · 比例 {ar}',
    refMode: 'first',
    note: '中文描述 + 首帧，负面词有效，可写「画面不要抖动」这类约束',
  },
  {
    id: 'vidu-q1',
    name: 'Vidu Q1',
    vendor: '生数',
    family: 'jimeng',
    durRange: [4, 8],
    ratio: '9:16',
    params: '时长 {dur}s · 比例 {ar} · 运动幅度 auto',
    refMode: 'first-last',
    note: '首尾帧一致性强，适合「只变表情不变机位」的对白镜',
  },
  {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    vendor: 'Luma',
    family: 'english',
    durRange: [5, 9],
    ratio: '9:16',
    params: 'duration {dur}s · {ar} · loop off',
    refMode: 'first-last',
    note: '英文 + 首尾帧，镜头动词写清方向，模型对「slow dolly」最敏感',
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    vendor: 'OpenAI',
    family: 'english',
    durRange: [5, 20],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first',
    note: '英文长句，可以写镜头、光线、表演三层，越长越容易跑题，控制在 3 句内',
  },
  {
    id: 'veo-3',
    name: 'Veo 3',
    vendor: 'Google',
    family: 'english',
    durRange: [5, 8],
    ratio: '9:16',
    params: 'duration {dur}s · {ar} · 原生音频',
    refMode: 'first-last',
    note: '一句英文写动作与镜头，还能出同期声；8 秒是上限',
  },
  {
    id: 'veo-31',
    name: 'Veo 3.1',
    vendor: 'Google',
    family: 'english',
    durRange: [4, 8],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first-last',
    note: '支持首尾帧与镜头延展，英文里写清「from … to …」',
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    vendor: 'OpenAI',
    family: 'english',
    durRange: [5, 20],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first',
    note: '长镜头与物理遮挡最稳；按时间顺序写发生了什么',
  },
  {
    id: 'sora-2-pro',
    name: 'Sora 2 Pro',
    vendor: 'OpenAI',
    family: 'english',
    durRange: [5, 20],
    ratio: '9:16',
    params: 'duration {dur}s · {ar} · 1080p',
    refMode: 'first',
    note: '同 Sora 2，细节与稳定性更强；描述里点明主体数量',
  },
  {
    id: 'runway-gen45',
    name: 'Runway Gen-4.5',
    vendor: 'Runway',
    family: 'english',
    durRange: [5, 10],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first',
    note: '运镜更准：camera move 与 subject motion 分开写两句',
  },
  {
    id: 'kling-25',
    name: '可灵 2.5 Turbo',
    vendor: '快手',
    family: 'keling',
    durRange: [5, 10],
    ratio: '9:16',
    params: '模式=专业；时长 {dur}s；比例 {ar}',
    refMode: 'first-last',
    note: '首尾帧最稳，中文写「从…到…」，运镜词放句子中间',
  },
  {
    id: 'kling-21',
    name: '可灵 2.1',
    vendor: '快手',
    family: 'keling',
    durRange: [5, 10],
    ratio: '9:16',
    params: '模式=专业；时长 {dur}s；比例 {ar}',
    refMode: 'first',
    note: '动作幅度大时用「快速/缓慢」明确速度',
  },
  {
    id: 'seedance-pro',
    name: '即梦 Seedance 1.0 Pro',
    vendor: '字节',
    family: 'jimeng',
    durRange: [5, 10],
    ratio: '9:16',
    params: '--dur {dur} --ratio {ar} --fps {fps}',
    refMode: 'first-last',
    note: '吃首尾帧两张图；只写怎么动，不复述画面',
  },
  {
    id: 'vidu-q2',
    name: 'Vidu Q2',
    vendor: '生数科技',
    family: 'jimeng',
    durRange: [4, 8],
    ratio: '9:16',
    params: '--duration {dur} --ratio {ar}',
    refMode: 'first-last',
    note: '多主体一致性优于同代，人物多时点明谁做什么',
  },
  {
    id: 'pixverse-v4',
    name: 'PixVerse V4',
    vendor: '爱诗科技',
    family: 'english',
    durRange: [5, 8],
    ratio: '9:16',
    params: 'duration {dur}s · {ar} · motion 2',
    refMode: 'first',
    note: '英文短句 + 明确 motion 强度；过快容易糊',
  },
  {
    id: 'luma-ray3',
    name: 'Luma Ray 3',
    vendor: 'Luma',
    family: 'english',
    durRange: [5, 10],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first-last',
    note: '镜头运动自然，英文里写 camera 与 light 的变化',
  },
  {
    id: 'wan-22',
    name: '通义万相 2.2',
    vendor: '阿里',
    family: 'cnmotion',
    durRange: [5, 5],
    ratio: '9:16',
    params: '分辨率 720p · 时长 {dur}s · 比例 {ar}',
    refMode: 'first',
    note: '固定 5 秒；中文动作流写「起初…接着…最后定住」',
  },
  {
    id: 'cogvideox',
    name: 'CogVideoX',
    vendor: '智谱',
    family: 'cnmotion',
    durRange: [5, 10],
    ratio: '9:16',
    params: '--num_frames {frames} --fps {fps}',
    refMode: 'first',
    note: '开源可本地跑；动作幅度别太大，中文短句更稳',
  },
  {
    id: 'stepvideo',
    name: 'Step-Video',
    vendor: '阶跃星辰',
    family: 'cnmotion',
    durRange: [5, 10],
    ratio: '9:16',
    params: '--duration {dur} --resolution 768p',
    refMode: 'first',
    note: '中文动作流；场景与人物分开描述再连起来',
  },
  {
    id: 'hailuo-02-pro',
    name: '海螺 02 Pro',
    vendor: 'MiniMax',
    family: 'bracket',
    durRange: [6, 10],
    ratio: '9:16',
    params: 'duration {dur}s · {ar}',
    refMode: 'first-last',
    note: '句首方括号写运镜；首尾帧给两张图最准',
  },
  {
    id: 'mochi-1',
    name: 'Genmo Mochi 1',
    vendor: 'Genmo',
    family: 'english',
    durRange: [5, 6],
    ratio: '9:16',
    params: '--width {w} --height {h} --frames {frames}',
    refMode: 'first',
    note: '开源；动作以人物表演为主，少写复杂运镜',
  },
  {
    id: 'ltx-video',
    name: 'LTX-Video',
    vendor: 'Lightricks',
    family: 'english',
    durRange: [3, 10],
    ratio: '9:16',
    params: '--width {w} --height {h} --frames {frames} --fps {fps}',
    refMode: 'first',
    note: '本地生成快；分辨率别超 768p，英文短语即可',
  },
]

export const DEFAULT_VIDEO_MODEL_ID = 'keling-16'

export function videoModelById(id) {
  return VIDEO_MODELS.find((m) => m.id === id) || VIDEO_MODELS[0]
}

export function videoFamilyOf(id) {
  const m = videoModelById(id)
  return VIDEO_FAMILIES[m.family] || VIDEO_FAMILIES.keling
}

/** 把 {dur} {ar} {fps} {w} {h} {frames} 占位换成实际值 */
export function fillVideoParams(modelId, { dur = 5, ar = '9:16', fps = 24 } = {}) {
  const m = videoModelById(modelId)
  // 竖屏给 720p 档的宽高；方/横按比例换，避免出现 1080x1080 这种本地跑不动的尺寸
  const base = 720
  let w = base
  let h = base
  if (ar === '9:16') {
    w = 720
    h = 1280
  } else if (ar === '16:9') {
    w = 1280
    h = 720
  } else if (ar === '4:3') {
    w = 960
    h = 720
  } else if (ar === '3:4') {
    w = 720
    h = 960
  }
  const frames = Math.max(1, Math.round(Number(dur) * Number(fps)))
  return String(m.params || '')
    .replace(/\{dur\}/g, String(dur))
    .replace(/\{ar\}/g, ar)
    .replace(/\{fps\}/g, String(fps))
    .replace(/\{w\}/g, String(w))
    .replace(/\{h\}/g, String(h))
    .replace(/\{frames\}/g, String(frames))
}

/** 该模型能不能吃尾帧 */
export function videoRefModeOf(modelId) {
  return videoModelById(modelId).refMode || 'first'
}

/** 把镜头时长夹到模型支持区间 */
export function clampVideoDur(modelId, dur) {
  const [lo, hi] = videoModelById(modelId).durRange || [5, 10]
  const d = Math.round(Number(dur) || lo)
  return Math.max(lo, Math.min(hi, d))
}

export function videoModelSpecText(modelId, ctx = {}) {
  const m = videoModelById(modelId)
  const fam = m.family
  const { dur = 5, ar = m.ratio || '9:16', fps = 24 } = ctx
  const isEn = fam === 'english'

  const head = [
    `目标生视频模型：${m.name}（${m.vendor}），语法族：${VIDEO_FAMILIES[fam].label}。`,
    '视频提示词不是画面描述，是这个镜头里「从第 0 秒到最后一秒发生了什么变化」。',
    '观众要看见动作真的发生了：人怎么起势、身体哪个部位在动、道具怎么被带动、镜头怎么跟、最后停在哪里。',
  ].join('\n')

  const checklist = [
    '每条提示词必须落齐这七样，缺一样都算不合格：',
    '① 主体：谁 + 外观锚定（脸、发型、体型）+ 服装号，不要写「一个男人」「女主」；',
    '② 场景：具体在什么地方，有哪两三件能认出来的陈设；',
    '③ 景别 + 机位：特写 / 近景 / 中景 / 全景 / 远景，平视 / 俯拍 / 仰拍 / 过肩；',
    '④ 运镜：方向 + 幅度（推近 / 拉远 / 横移 / 跟拍 / 升降 / 环绕 / 机位不动，快或慢）；',
    '⑤ 动作分解：起势 → 过程（一到两个具体动作，说清手、肩、头、眼怎么动）→ 收势定住；',
    '⑥ 道具交互：手里的东西怎么被拿起 / 压住 / 递出 / 摔下，被带动的东西有什么物理反应；',
    '⑦ 情绪：脸上和眼里在演什么（压抑 / 咬牙 / 冷笑 / 发怔），强度 1–5 对应幅度大小。',
    '最后一段写锁定项：面部与服装不换、机位景别光线不变、不加字幕与文字。',
  ].join('\n')

  const lengthRule = isEn
    ? '长度：每条正文 50–110 个英文词（不含参数与锁定短句）。低于 45 词基本只是「一句话剧情」，模型只会给你一张会动的照片。'
    : '长度：每条正文 110–170 个汉字（不含锁定句）。低于 90 字基本只是「一句话剧情」，模型只会给你一张会动的照片。'

  const byFam = {
    keling: [
      '写法：中文自然句，两到三句连成一段，不要分行、不要用符号列表。',
      '第一句交代「谁在什么地方、正在做什么」，第二句写动作怎么推进（身体部位 + 道具反应），第三句写镜头怎么动 + 时长，最后一句锁定。',
      '示例（照这个信息密度写）：「沈砚半跪在工棚的长条案前，右手把那张湿透的退婚书从木板上揭起来，指腹压住纸角来回抹平，纸边的水痕被推成一道浅沟；他肩膀绷了一下，抬眼看门外，下颌线收紧。镜头从中景缓慢推近到近景，推到脸前停住，全程 5 秒，动作幅度大但节奏稳。锁定面部与服装，不换人，机位与光线不变，不加字幕与文字。」',
    ],
    jimeng: [
      '写法：中文短语，配合首帧图使用。不要在描述里复述首帧已有的画面（图里已经有了），只写「怎么动」。',
      '结构：`主体 + 动作分解（起 → 中 → 止）；机位 + 运镜方向与幅度 + 时长`，末尾锁定。参数行用 `--dur N --ratio 9:16 --fps N`。',
      '示例：「沈砚，右手把湿透的退婚书从木板上揭起，指腹压住纸角来回抹平，随后抬眼看门外、下颌收紧；机位从中景推近到近景，推到脸前停住，幅度大节奏稳，时长 5 秒。锁定面部与服装，机位与光线不变，不加字幕与文字。」',
    ],
    english: [
      '写法：一整段英文，两句到三句，不要写任何参数符号。',
      '结构：subject with appearance, action in three beats (start / middle / settle), location with two recognizable props. shot size, angle, camera move with speed, N seconds, style, consistency clause, no text on screen.',
      '动作必须落到身体部位与道具：fingers press / shoulders tighten / jaw clenches / lifts his head / the paper edge buckles。一到两个主动作，不要罗列三个以上。主体用英文外观描述（如 27-year-old Chinese man, thin build, worn dark workwear），不要写中文名。',
      '固定收尾：consistent face and wardrobe, steady framing and lighting, no text on screen。不输出 negative 字段，所有限制写进正向句。',
      '示例（照这个信息密度写）：A 27-year-old Chinese man in worn dark workwear kneels at a long wooden bench, lifts a soaked paper from the board with his right hand, presses his thumb along the wet edge and smooths it flat, the paper edge buckling into a shallow crease; his shoulders tighten and he raises his eyes toward the door, jaw clenching. Medium shot pushing in slowly to a close-up, stopping at his face, five seconds, Chinese manhua illustration style with thick painterly shading, consistent face and wardrobe, steady framing and lighting, no text on screen.',
    ],
    bracket: [
      '写法：句首用方括号标运镜（【推近】【拉远】【横移】【跟拍】【升降】【环绕】【机位固定】），正文写两到三句动作分解与时长，结尾锁定。',
      '示例：「【缓慢推近】沈砚半跪在工棚长案前，右手把湿透的退婚书从木板上揭起，指腹压住纸角来回抹平，纸边被推出一道浅沟；肩膀绷紧，抬眼看门外，下颌线收紧。5 秒，幅度大节奏稳，锁定面部与服装，机位与光线不变，不加字幕与文字。」',
    ],
    cnmotion: [
      '写法：中文动作流，按时间顺序推进，用「起初…，接着…，最后…」把三拍写全，镜头运动写在句末。',
      '示例：「沈砚起初半跪在工棚长案前低着头，接着右手把湿透的退婚书从木板上揭起、指腹压住纸角来回抹平，纸边被推出一道浅沟，最后抬眼看门外、下颌收紧定住。镜头从中景缓慢推近到近景，全程 5 秒，动作幅度大但不抢节奏，锁定面部与服装，机位与光线不变，不加字幕与文字。」',
    ],
  }

  const bad = isEn
    ? '反例（这种长度直接判不合格）：A man looks at the door, 5 seconds, cinematic. —— 没有外观、没有动作分解、没有机位运镜、没有道具，模型只会给你一张会动的照片。'
    : '反例（这种长度直接判不合格）：「沈砚抬头看向门外，镜头推近，5 秒。」—— 没有场景、没有动作分解、没有道具、没有情绪，模型只会给你一张会动的照片。'

  return [
    head,
    '',
    checklist,
    '',
    lengthRule,
    '',
    ...(byFam[fam] || byFam.keling),
    '',
    bad,
    '',
    ctx.durLine ||
      `时长：该模型支持 ${m.durRange[0]}–${m.durRange[1]} 秒，本条按 ${dur} 秒写；动作量要与时长匹配——3 秒只够一个动作，8 秒要写两到三个动作接续，不能把一个动作拉长充数。`,
    `画面比例 ${ar}，${fps}fps。`,
    m.refMode === 'first-last'
      ? '该模型吃首帧 + 尾帧两张图：尾帧提示词要写「收势」状态（动作做完、身体停住、表情落定），且机位、景别、光线、服装、背景与首帧完全一致，只允许姿态与表情变化。'
      : '该模型只吃首帧一张图：提示词写从首帧开始往后发生的变化，不要描述首帧已经有的内容。',
  ].join('\n')
}
