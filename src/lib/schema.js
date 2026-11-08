// 数据模型 / 预设 / 字段定义
import { emptyVoiceProfile } from './voice.js'
import { DEFAULT_MODEL_ID, modelById } from './imageModels.js'

export const APP_NAME = 'AI漫剧工作台'

export const PLATFORMS = {
  douyin: {
    id: 'douyin',
    name: '抖音 / 快手',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    episodeSec: [60, 90],
    hookSec: 3,
    voiceRate: [4.2, 6.4], // 字/秒，口播语速区间
    shotSec: [1.2, 6],
    notes: '前 3 秒必须抛冲突；单集 60–90s；竖屏满屏，字幕距底 ≥ 220px',
  },
  hongguo: {
    id: 'hongguo',
    name: '红果短剧',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    episodeSec: [60, 90],
    hookSec: 3,
    voiceRate: [4.0, 6.0],
    shotSec: [1.2, 6],
    notes: '节奏可略缓于抖音；单集 60–90s；结尾留钩子接下一集',
  },
  bilibili: {
    id: 'bilibili',
    name: 'B站 / 横屏',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    episodeSec: [120, 300],
    hookSec: 5,
    voiceRate: [3.8, 5.6],
    shotSec: [1.5, 8],
    notes: '横屏 16:9；可做 2–5 分钟；允许更长铺垫',
  },
  reelshort: {
    id: 'reelshort',
    name: '出海 ReelShort',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    episodeSec: [60, 90],
    hookSec: 3,
    voiceRate: [4.0, 6.0],
    shotSec: [1.2, 6],
    notes: '竖屏 + 英文字幕工作流；台词需留英文排版余量',
  },
}

/**
 * 画风库。内置 28 条，按 group 分组；自定义画风由 /api/styles 拉回来后用
 * registerStyles() 追加进同一个表——所以全站所有 STYLES[id] / Object.values(STYLES)
 * 都自动包含自定义项，页面不用改。
 *
 * 每条：id（稳定标识，别改）/ name / group / anchor（正向锚定词）/ negative / note
 * 自定义画风的 id 统一以 cs_ 开头，normalizeProject 靠这个前缀判断「暂未注册」而不是当脏数据重置。
 */
export const STYLE_GROUPS = [
  { id: 'guoman', name: '国漫 · 中式' },
  { id: 'japan', name: '日系' },
  { id: 'west', name: '欧美' },
  { id: 'real', name: '写实 · 电影' },
  { id: 'stylized', name: '风格化' },
  { id: 'custom', name: '自定义' },
]

const RAW_STYLES = [
  // ── 国漫 · 中式 ───────────────────────────────
  {
    id: 'guoman-houtu',
    name: '国漫厚涂',
    group: 'guoman',
    anchor:
      'cinematic Chinese guoman illustration, thick-paint semi-realistic rendering, dramatic volumetric lighting, rich skin texture, film grain, high detail',
    negative: 'flat cel shading, chibi proportions, low contrast, 3d render plastic skin, muddy colors',
    note: '默认。脸好看、光打得住，适合权谋、复仇、年代戏。',
  },
  {
    id: 'guoman-cel',
    name: '国漫赛璐璐',
    group: 'guoman',
    anchor:
      'chinese guoman cel animation still, clean ink outline, two-tone flat shading with hard shadow edge, saturated colors, dynamic composition',
    negative: 'thick paint, soft airbrush, blurry lineart, photorealistic skin',
    note: '比厚涂便宜、出图稳，动起来最像「漫剧」。',
  },
  {
    id: 'ink-wash',
    name: '水墨写意',
    group: 'guoman',
    anchor:
      'chinese ink wash painting, expressive brush strokes, xuan paper texture, negative space composition, muted indigo and ink tones, poetic atmosphere',
    negative: 'photorealistic, hard 3d render, neon colors, dense clutter',
    note: '氛围戏、闪回、片头好用；人脸细节弱，别放特写情绪。',
  },
  {
    id: 'gongbi',
    name: '工笔重彩',
    group: 'guoman',
    anchor:
      'chinese gongbi fine-brush painting, precise thin outlines, layered mineral pigments, gold accents, symmetrical decorative composition, silk texture',
    negative: 'loose sketch, thick impasto, photorealistic, 3d render',
    note: '宫廷、宅斗、婚服特写。',
  },
  {
    id: 'gufeng-illu',
    name: '古风插画',
    group: 'guoman',
    anchor:
      'chinese fantasy illustration, elegant lineart with soft color wash, hanfu costume detail, misty layered background, warm rim light, painterly finish',
    negative: 'modern clothing, flat cartoon, harsh flash lighting',
    note: '仙侠、古偶、女性向封面。',
  },
  {
    id: 'wuxia-ink',
    name: '武侠墨线',
    group: 'guoman',
    anchor:
      'wuxia comic ink lineart, bold black brush lines, high contrast chiaroscuro, speed lines, dramatic silhouette against misty background',
    negative: 'pastel colors, soft gradient, cute proportions, low contrast',
    note: '打戏、追杀、独白。',
  },

  // ── 日系 ─────────────────────────────────────
  {
    id: 'cel-shade',
    name: '日系赛璐璐',
    group: 'japan',
    anchor: 'japanese anime cel shading, clean lineart, crisp flat colors, soft rim light, 2d animation keyframe',
    negative: 'thick paint, photorealistic skin, heavy grain, muddy colors',
    note: '通用日漫底，兼容性最好。',
  },
  {
    id: 'anime-thick',
    name: '日系厚涂',
    group: 'japan',
    anchor:
      'japanese anime style thick paint illustration, painterly shading, glossy highlights on hair and eyes, soft bloom, detailed costume',
    negative: 'flat cel shading, rough sketch, muddy colors, low detail',
    note: '海报感强，适合封面与高潮帧。',
  },
  {
    id: 'kyoani',
    name: '京阿尼风',
    group: 'japan',
    anchor:
      'kyoto animation style, soft gradient shading, delicate hair strands, gentle bloom lighting, expressive glossy eyes, clean uniform design',
    negative: 'harsh shadows, grimdark, heavy grain, thick impasto',
    note: '日常、校园、治愈。',
  },
  {
    id: 'shinkai',
    name: '新海诚风',
    group: 'japan',
    anchor:
      'makoto shinkai style, hyper detailed sky with lens flare, saturated sunset gradient, volumetric cloud, glowing city lights, romantic atmosphere',
    negative: 'flat background, dull colors, low detail sky, dark muddy palette',
    note: '天空、雨后、重逢。背景比人更值钱。',
  },
  {
    id: 'shoujo',
    name: '少女漫',
    group: 'japan',
    anchor:
      'shoujo manga style, sparkling large eyes, delicate long lashes, screentone floral background, soft pastel palette, romantic close-up',
    negative: 'harsh realism, gritty texture, dark palette, muscular anatomy',
    note: '心动特写、眼神戏。',
  },
  {
    id: 'shonen',
    name: '热血少年漫',
    group: 'japan',
    anchor:
      'shonen manga style, dynamic action pose, bold speed lines, high contrast shadow, sweat and impact effects, aggressive perspective',
    negative: 'static pose, pastel softness, minimal detail, low contrast',
    note: '打脸、爆发、宣言。',
  },
  {
    id: 'retro-90s',
    name: '90 年代复古赛璐璐',
    group: 'japan',
    anchor:
      '1990s retro anime cel, visible film grain, slightly desaturated palette, hand painted backgrounds, soft chromatic aberration, vhs artifacts',
    negative: 'modern digital crispness, neon colors, ultra sharp lineart',
    note: '回忆线、怀旧滤镜。',
  },

  // ── 欧美 ─────────────────────────────────────
  {
    id: 'west-comic',
    name: '美式漫画',
    group: 'west',
    anchor:
      'american comic book illustration, heavy inked outlines, cross-hatching shadow, bold primary colors, dramatic low angle, halftone texture',
    negative: 'anime style, pastel soft shading, thin lineart, flat lighting',
    note: '硬汉、黑帮、超英。',
  },
  {
    id: 'pixar-3d',
    name: '皮克斯 3D',
    group: 'west',
    anchor:
      'pixar style 3d animation, stylized appealing character design, subsurface scattering skin, cinematic global illumination, expressive big eyes',
    negative: 'flat 2d, cel shading, lineart, realistic proportions',
    note: '合家欢、萌宠、喜剧节奏。',
  },
  {
    id: 'disney-3d',
    name: '迪士尼 3D',
    group: 'west',
    anchor:
      'disney style 3d animation, soft rounded features, warm golden lighting, rich fabric simulation, fairy tale color grading',
    negative: 'gritty realism, harsh contrast, anime style, flat cel',
    note: '童话、歌舞、公主向。',
  },
  {
    id: 'west-lineart',
    name: '欧美线稿',
    group: 'west',
    anchor:
      'european bande dessinee lineart, clean uniform ink line, flat muted color fills, architectural detail, clear silhouette',
    negative: 'heavy paint, blurry edges, neon palette, chibi style',
    note: '悬疑、探案，冷感强。',
  },
  {
    id: 'steampunk',
    name: '蒸汽朋克',
    group: 'west',
    anchor:
      'steampunk illustration, brass and copper mechanical details, victorian costume, gaslight warm glow, smoke haze, rivets and gears',
    negative: 'clean modern setting, minimal detail, neon cyberpunk',
    note: '齿轮、怀表、黄铜质感。',
  },

  // ── 写实 · 电影 ───────────────────────────────
  {
    id: 'cine-real',
    name: '电影写实',
    group: 'real',
    anchor:
      'cinematic photorealistic still, shot on 35mm, shallow depth of field, natural skin texture, motivated practical lighting, filmic color grade',
    negative: 'cartoon, anime, illustration, plastic skin, oversaturated',
    note: '真人感最强，也最容易「AI 味」。配参考图才稳。',
  },
  {
    id: 'hk-film',
    name: '港片胶片',
    group: 'real',
    anchor:
      '1990s hong kong cinema film still, tungsten and neon mixed lighting, heavy film grain, teal and amber grade, wet street reflection',
    negative: 'digital clean look, flat lighting, cartoon, low grain',
    note: '夜雨、霓虹、街头对峙。',
  },
  {
    id: 'bw-sketch',
    name: '黑白素描',
    group: 'real',
    anchor:
      'black and white graphite sketch, cross-hatched shadow, paper fiber texture, high contrast, expressive rough strokes',
    negative: 'color, digital painting, smooth gradient, 3d render',
    note: '回忆、独白、低成本占位。',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    group: 'real',
    anchor:
      'cyberpunk scene, neon magenta and cyan rim light, rain slicked surface, holographic signage, volumetric fog, high tech low life',
    negative: 'daylight pastoral, pastel softness, vintage film grain',
    note: '未来都市、义体、霓虹夜。',
  },

  // ── 风格化 ───────────────────────────────────
  {
    id: 'render-3d',
    name: '3D 渲染',
    group: 'stylized',
    anchor: 'stylized 3d animated film still, subsurface skin, cinematic global illumination, pixar-like proportions',
    negative: 'flat 2d, cel shading, lineart, sketch',
    note: '通用 3D 底，中性不挑题材。',
  },
  {
    id: 'clay',
    name: '黏土定格',
    group: 'stylized',
    anchor:
      'claymation stop motion still, handmade plasticine texture, visible fingerprint, miniature set with warm practical light, tilt shift depth',
    negative: 'photorealistic, digital smooth surface, anime style',
    note: '轻喜剧、旁白科普。',
  },
  {
    id: 'lowpoly',
    name: '低多边形',
    group: 'stylized',
    anchor:
      'low poly 3d render, faceted geometry, flat shaded polygons, minimal gradient background, isometric framing',
    negative: 'detailed texture, photorealistic, soft shading, high poly',
    note: '概念图、数据感画面。',
  },
  {
    id: 'pixel',
    name: '像素风',
    group: 'stylized',
    anchor:
      'pixel art, 32 bit limited palette, dithered shading, crisp pixel edges, side scrolling game background',
    negative: 'smooth gradient, anti-aliasing, photorealistic, 3d render',
    note: '游戏化、彩蛋、梗图。',
  },
  {
    id: 'watercolor',
    name: '水彩绘本',
    group: 'stylized',
    anchor:
      'watercolor storybook illustration, wet on wet bleeding, visible paper grain, soft limited palette, hand lettered feel',
    negative: 'digital vector, harsh outline, neon saturated color, 3d render',
    note: '治愈、亲子、回忆杀。',
  },
  {
    id: 'oil',
    name: '古典油画',
    group: 'stylized',
    anchor:
      'classical oil painting, chiaroscuro lighting, visible canvas weave and brushstroke, rich earth pigments, dramatic single light source',
    negative: 'flat digital color, anime style, neon lighting, smooth gradient',
    note: '史诗、宿命、片头。',
  },
  {
    id: 'manhua-flat',
    name: '条漫扁平',
    group: 'stylized',
    anchor: 'chinese webtoon flat illustration, bold shapes, strong screentone, high contrast, clean composition',
    negative: 'photorealistic, heavy 3d lighting, cluttered detail',
    note: '快手竖屏原生观感，加载最省。',
  },
]

export const STYLES = Object.fromEntries(RAW_STYLES.map((s) => [s.id, s]))

/** 把自定义画风塞进同一张表（启动时、保存后各调一次）。 */
export function registerStyles(list) {
  ;(list || []).forEach((s) => {
    if (s && s.id && !STYLES[s.id]) STYLES[s.id] = { ...s, custom: true }
  })
}

/** 删掉一条自定义画风（内置的删不掉）。 */
export function unregisterStyle(id) {
  if (STYLES[id]?.custom) delete STYLES[id]
}

export function isCustomStyleId(id) {
  return /^cs_/.test(String(id || ''))
}

/** 分组后的画风列表，供设置抽屉与主页下拉用。 */
export function stylesByGroup() {
  return STYLE_GROUPS.map((g) => ({
    ...g,
    items: Object.values(STYLES).filter((s) => (s.group || 'stylized') === g.id),
  })).filter((g) => g.items.length)
}

export const SIZES = ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写']
export const MOVES = ['固定', '推', '拉', '摇', '移', '跟', '升', '降', '手持', '环绕']
export const ANGLES = ['平视', '仰视', '俯视', '过肩', '主观', '斜角']
export const EMOTIONS = ['平静', '压抑', '紧张', '愤怒', '恐惧', '委屈', '嘲讽', '爽', '心动', '崩溃', '决绝', '反转震撼']
/**
 * 角色定位预设：最后一行「自定义」选中后手填。
 * 旧台账里的「主角 / 对手 / 助攻 / 导师」不在预设里，界面按「自定义」显示原值，
 * 不静默改写数据——这几个词当年是给 AI 生成用的，直接映射成「男主/女主」会猜错性别。
 */
export const ROLE_PRESETS = [
  '男主',
  '女主',
  '男配',
  '女配',
  '兄弟',
  '妹妹',
  '姐姐',
  '学长',
  '学姐',
  '学妹',
  '学弟',
  '同学',
  '群演',
  '路人',
]
export const ROLE_CUSTOM = '自定义'
export const ROLES = ROLE_PRESETS

export const SIZE_EN = {
  大远景: 'extreme long shot', 远景: 'long shot', 全景: 'full shot', 中景: 'medium shot',
  近景: 'medium close-up', 特写: 'close-up', 大特写: 'extreme close-up',
}
export const MOVE_EN = {
  固定: 'static camera', 推: 'push in', 拉: 'pull out', 摇: 'pan', 移: 'tracking shot',
  跟: 'follow shot', 升: 'crane up', 降: 'crane down', 手持: 'handheld camera', 环绕: 'orbit shot',
}
export const ANGLE_EN = {
  平视: 'eye level', 仰视: 'low angle', 俯视: 'high angle', 过肩: 'over-the-shoulder', 主观: 'POV', 斜角: 'dutch angle',
}

export const HOOK_WORDS = ['却', '竟然', '竟然还', '退婚', '撕', '砸', '抢', '打脸', '真相', '死', '背叛', '凭什么', '因为', '不肯', '逼', '跪', '血', '离婚', '滚', '废物', '羞辱', '反转', '当场']

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 8)}`

export function emptyShot(no = 1) {
  return {
    id: uid('sh'),
    no,
    size: '中景',
    angle: '平视',
    move: '固定',
    scene: '',
    desc: '',
    chars: '',
    // 服装序列号：填角色服装卡的号（O1/O2…），提示词会自动展开成那套的服装描述
    outfit: '',
    props: '',
    speaker: '',
    dialogue: '',
    vo: '',
    emotion: '紧张',
    intensity: 3,
    action: '',
    actionEn: '',
    dur: 3,
    // AI 按所选生图模型重写后的提示词：{modelId, prompt, negative, params, at}
    promptAI: null,
    promptVideoAI: null,
    // ComfyUI 跑回来的成品：[{ path, kind: 'image'|'video', workflowHash, at }]
    // 只存相对路径（renders/xxx.png），文件在 renders/ 目录里，跟 uploads/ 分开
    renders: [],
  }
}

/** 服装卡序列号：O1 / O2 / O3…（跨集引用就写这个号） */
export function outfitSeq(index) {
  return `O${index + 1}`
}

export function nextOutfitSeq(list) {
  const used = (Array.isArray(list) ? list : [])
    .map((o) => Number(String(o?.seq || '').replace(/[^\d]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0)
  return outfitSeq(used.length ? Math.max(...used) : (list?.length || 0))
}

/** 按序列号找服装卡：shot.outfit 里可能写「O2」或「O2, O1」，只取本角色命中的那套 */
export function outfitOf(character, code) {
  const want = String(code || '').toUpperCase().match(/O\d+/g) || []
  if (!character || !want.length) return null
  const list = Array.isArray(character.outfits) ? character.outfits : []
  return list.find((o) => want.includes(String(o.seq || '').toUpperCase())) || null
}

export function emptyOutfit(seq) {
  return {
    id: uid('of'),
    seq: seq || 'O1',
    name: '',
    scene: '',
    anchor: '',
    refImage: '',
    notes: '',
  }
}

/** 参考图归一：refImages 为准，refImage 同步成首张；老数据只有 refImage 也能升上来 */
export function normalizeRefImages(c) {
  const list = (Array.isArray(c?.refImages) ? c.refImages : []).map((x) => String(x || '').trim()).filter(Boolean)
  const main = String(c?.refImage || '').trim()
  if (main && !list.includes(main)) list.unshift(main)
  const uniq = [...new Set(list)]
  return { refImages: uniq, refImage: uniq[0] || '' }
}

export function emptyCharacter(name = '') {
  return {
    id: uid('ch'),
    name: name || '新角色',
    role: '男主',
    // 随机路人：不锁脸、不锁 seed、不需要参考图。提示词里会被写成「随机路人」
    random: false,
    age: '',
    look: '',
    outfit: '',
    // 多场景服装库：outfit 是「当前主服装」的一句话描述，outfits 是带序列号的服装卡
    outfits: [],
    anchor: '',
    face: '',
    hair: '',
    prop: '',
    seed: '',
    refImage: '',
    // 一个角色可以有多张参考图（主视图 / 表情表 / 配饰 / 侧面 …）
    // refImage 永远是 refImages[0] 的镜像，让导出、机检、旧代码只认一个字段也不会错
    refImages: [],
    voice: '青年男·低沉沙哑',
    // 音色细节：voice 是短标签（真源），voiceProfile 是叠在上面的参数，
    // 缺字段一律从 voice 推（见 src/lib/voice.js 的 resolveVoice）
    voiceProfile: emptyVoiceProfile(),
    notes: '',
  }
}

/**
 * 随机路人：一张脸都不要锁的角色。
 * 每次出图都可以换长相，所以它不参与 anchor / seed / 参考图这套一致性机制。
 * 随机池只决定「这一版长什么样」，用户点「重掷」可以换一版。
 */
export const PASSERBY_POOL = [
  { cn: '挑担货郎，肩背布囊，裤脚沾泥', en: 'a travelling peddler with a shoulder pole and cloth bundle, mud on his trousers' },
  { cn: '挎篮妇人，鬓角微乱，蓝布包头', en: 'a market woman with a basket on her arm, hair slightly loose, blue cloth headscarf' },
  { cn: '短打脚夫，膀大腰圆，赤着半边膀子', en: 'a burly porter in a short jacket, one shoulder bare' },
  { cn: '跑堂小厮，肩上搭着白巾', en: 'a young waiter with a white towel over one shoulder' },
  { cn: '算命瞎子，拄竹杖，松垮长衫', en: 'a blind fortune teller with a bamboo cane and a loose long gown' },
  { cn: '衙门差役，腰挎短刀，皂衣束带', en: 'a yamen constable in black uniform with a short blade at the waist' },
  { cn: '卖糖老汉，佝偻着背，手上全是糖稀', en: 'a hunched old candy vendor, hands sticky with syrup' },
  { cn: '绣娘，指尖缠着彩线，素色衣裙', en: 'an embroideress with coloured threads wound around her fingertips, plain dress' },
  { cn: '茶楼掌柜，围裙油亮，袖口卷起', en: 'a teahouse keeper with a grease-shined apron, sleeves rolled up' },
  { cn: '邻家少年，背着书箱，衣角磨白', en: 'a neighbourhood youth with a book chest on his back, worn hem' },
  { cn: '更夫，提着灯笼，肩上搭着梆子', en: 'a night watchman carrying a lantern, wooden clapper over his shoulder' },
  { cn: '洗衣妇，袖口湿透，蹲在石阶上', en: 'a washerwoman with wet sleeves crouching on the stone steps' },
]

const PASSERBY_NUMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']

const PICK_AGE = ['二十出头', '三十上下', '四十来岁', '五十多岁', '花甲之年']
const PICK_FACE = ['圆脸', '长脸', '方脸', '瓜子脸', '瘦削脸', '棱角分明的脸']
const PICK_HAIR = ['束发', '乱发', '包头巾', '戴斗笠', '头发花白', '短打鬓角']

const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)]

/**
 * 造一个随机路人。seq 只影响名字（路人 1 / 路人 2 …）。
 * 想换长相就再造一个，或调 rerollPasserby 重掷同一张卡的字段。
 */
export function randomPasserby(seq = 1) {
  const p = pickOf(PASSERBY_POOL)
  return {
    ...emptyCharacter(`路人${PASSERBY_NUMS[seq - 1] || seq}`),
    role: '路人',
    random: true,
    age: pickOf(PICK_AGE),
    look: p.cn,
    anchor: p.en,
    face: pickOf(PICK_FACE),
    hair: pickOf(PICK_HAIR),
    outfit: p.cn.split('，').slice(1).join('，') || p.cn,
    seed: '',
    refImage: '',
    refImages: [],
    outfits: [],
    voice: '群演·颗粒嘈杂',
    notes: '随机路人：不锁脸、不锁 seed、不用参考图，每次出图可以换一张脸；要固定就把「随机」关掉。',
  }
}

/** 重掷一张随机路人的外形字段（保留 id / 名字 / 音色） */
export function rerollPasserby(c) {
  const p = pickOf(PASSERBY_POOL)
  return {
    ...c,
    age: pickOf(PICK_AGE),
    look: p.cn,
    anchor: p.en,
    face: pickOf(PICK_FACE),
    hair: pickOf(PICK_HAIR),
    outfit: p.cn.split('，').slice(1).join('，') || p.cn,
  }
}

/** 每拍的情绪强度（1–5）：按拍型给默认档，用户可在节拍表里改 */
export const BEAT_INTENSITY = {
  开局钩子: 4,
  身份揭穿: 5,
  冲突升级: 3,
  第一次打脸: 5,
  反转: 5,
  爽点释放: 4,
  新悬念: 3,
  收尾钩子: 4,
  // 旧台账与自由写法里的常见拍型，一并给档位，免得曲线被压成一条平线
  反转铺垫: 4,
  高潮打脸: 5,
  二次打脸: 5,
  压迫升级: 3,
  情绪爆发: 5,
  结尾钩子: 4,
  开场: 4,
  收尾: 4,
}

export const beatIntensity = (b) => {
  const v = Number(b?.intensity)
  if (v >= 1 && v <= 5) return v
  return BEAT_INTENSITY[b?.t] || 3
}

/**
 * 理想节奏基线（教科书曲线）：开局先给一记、中段沉下去蓄力、反转/打脸最尖、收尾留钩。
 * 拍数变化时返回对应长度的基准，用于跟实际节拍做对比。
 */
export function beatBaseline(n) {
  if (n <= 0) return []
  const base5 = [4, 3, 5, 4, 4]
  const base6 = [4, 3, 4, 5, 4, 4]
  const base7 = [4, 3, 4, 5, 4, 3, 4]
  if (n <= 5) return base5.slice(0, n)
  if (n === 6) return base6
  if (n === 7) return base7
  // 更多拍：在 5 拍基准上按位置插值，首尾对齐，中间保证一次峰一次谷
  const out = []
  for (let i = 0; i < n; i += 1) {
    const pos = (i / (n - 1)) * (base5.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(base5.length - 1, lo + 1)
    out.push(Math.round(base5[lo] + (base5[hi] - base5[lo]) * (pos - lo)))
  }
  return out
}

export function emptyEpisode(index = 1) {
  return {
    id: uid('ep'),
    no: index,
    title: `第${index}集`,
    hook: '',
    hookType: '冲突开场',
    summary: '',
    cliffhangers: [],
    beats: [{ id: uid('bt'), t: '开局钩子', text: '', intensity: 4 }],
    shots: [emptyShot(1)],
    /** 这一集对应的原文段落（导入或手贴时落下来，用于对稿与锚点标注） */
    sourceText: '',
    /** 故事锚点：{ sid: 句索引, type: 锚点类型 }，sid 对应 splitSentences(sourceText) 的下标 */
    anchors: [],
  }
}

/** 资产库的一张图：人物视图 / 表情 / 配饰 / 场景 / 道具，统一形状 */
// ---- 自定义音色：比 12 档预设更细，可命名，按 V1/V2 编号 ----
export function emptyCustomVoice(name = '') {
  return {
    id: uid('cv'),
    seq: '',
    name,
    gender: '', age: '', pitch: '', timbre: '', rate: '', accent: '', emotion: '', breath: '',
    tool: '', voiceId: '', params: '', refAudio: '', refText: '', seed: '',
    note: '',
    createdAt: new Date().toISOString(),
  }
}

/** 序号：V1、V2…（不随删除跳号，删除后由 normalize 重排） */
export const voiceSeq = (i) => `V${i + 1}`

/** 显示名：`V1 · 冷嗓低哑`（角色 voice 字段存的就是这串） */
export const voiceTitle = (v) => (v ? `${v.seq || ''}${v.seq ? ' · ' : ''}${v.name || '未命名音色'}` : '')

/** 按 id / 显示名 / 纯名字找自定义音色 */
export function findVoice(list, key) {
  const k = String(key || '')
  if (!k) return null
  return (list || []).find((v) => v.id === k || voiceTitle(v) === k || v.name === k) || null
}

// 资产生成任务：05 生图页要「先出图再谈镜头」的那批图
// kind 决定版式（主视图 / 四视图 / 表情表 / 配饰 / 服装），不是素材库的分类
/** 场景时间档（场景卡与问题选项共用一套枚举，避免两处写不一致） */
export const SCENE_TIMES = ['清晨', '白天', '傍晚', '夜', '深夜', '凌晨']
export const SCENE_WEATHERS = ['晴', '阴', '雨', '雪', '雾', '风']
export const SCENE_TONES = ['冷灰压抑', '暖黄怀旧', '霓虹冷艳', '苍白病态', '阴湿森冷', '明亮轻快', '暖调烟火', '沉金古旧']
/** 场景卡上展示的字段（问题里 field 也用这些 key） */
export const SCENE_FIELDS = [
  { k: 'place', label: '地点' },
  { k: 'time', label: '时间' },
  { k: 'weather', label: '天气' },
  { k: 'light', label: '光线' },
  { k: 'tone', label: '色调' },
  { k: 'ambience', label: '氛围' },
  { k: 'props', label: '陈设' },
]

export function emptyScene(patch = {}) {
  return {
    id: uid('sc'),
    name: '',
    place: '',
    time: '',
    weather: '',
    light: '',
    tone: '',
    ambience: '',
    props: [],
    desc: '',
    from: 'manual',
    confidence: 'low',
    open: [],
    epIds: [],
    at: new Date().toISOString(),
    ...patch,
  }
}

export const ASSET_JOB_KINDS = [
  { id: 'main', label: '主视图', hint: '全身正面站姿，定装定脸' },
  { id: 'ortho', label: '四视图', hint: '正面 / 四分之三 / 侧面 / 背面，同一角色并排' },
  { id: 'expr', label: '表情', hint: '一格一个表情，六格一张' },
  { id: 'acc', label: '配饰', hint: '角色身上的标志物，单品特写' },
  { id: 'outfit', label: '服装', hint: '一套服装平铺图，对应服装号' },
]

export const assetJobKindOf = (id) => ASSET_JOB_KINDS.find((k) => k.id === id) || ASSET_JOB_KINDS[0]

export function emptyAssetJob(kind = 'main', patch = {}) {
  return {
    id: uid('aj'),
    kind: assetJobKindOf(kind).id,
    charId: '',
    charName: '',
    outfitId: '',
    outfitSeq: '',
    name: '',
    prompt: '',
    negative: '',
    params: '',
    image: '',
    image2: '',
    seed: 0,
    render: '',
    at: '',
    ...patch,
  }
}

export function emptyAssetImage(kind = 'view') {
  return {
    id: uid('im'),
    kind,
    name: '',
    charId: '',
    charName: '',
    scene: '',
    ep: '',
    path: '',
    notes: '',
    createdAt: new Date().toISOString(),
  }
}

export function emptyProject() {
  return {
    meta: {
      title: '未命名漫剧',
      platform: 'douyin',
      style: 'guoman-houtu',
      // 生图模型：决定提示词按哪套语法拼（见 src/lib/imageModels.js）
      imageModel: DEFAULT_MODEL_ID,
      videoModel: 'keling-16',
      // 提示词模式：single = 每镜一条；pair = 首尾帧两条（多参生图，给图生视频当首尾帧用）
      promptMode: 'single',
      // 挂哪些已下载 skill 的规则文档（skills.json 里的 id 数组，空数组 = 不挂，最多 4 份）
      skillPrompt: [],
      skillNovel: [],
      skillVideo: [],
      // 投产包里被手动排掉的件（存 key：package / storyboard / promptCsv / …），空数组 = 9 件全导
      exportSkip: [],
      logline: '',
      audience: '',
      tags: '',
      // 乐观锁版本号：每次成功写盘 +1。客户端保存时带它，服务端发现 < 磁盘当前值即拒绝（409），
      // 防止旧标签页 / 第二个窗口的过期快照把别人的改动覆盖掉。
      rev: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    topics: [],
    characters: [],
    episodes: [],
    assets: [],
    assetImages: [],
    assetNames: {},
    assetJobs: [],
    voices: [],
    scenes: [],
  }
}

export function normalizeProject(raw) {
  const base = emptyProject()
  if (!raw || typeof raw !== 'object') return base
  const p = { ...base, ...raw }
  p.meta = { ...base.meta, ...(raw.meta || {}) }
  if (!PLATFORMS[p.meta.platform]) p.meta.platform = 'douyin'
  // 自定义画风（cs_ 前缀）可能还没从 /api/styles 拉回来，先留着，别当脏数据重置
  if (!STYLES[p.meta.style] && !isCustomStyleId(p.meta.style)) p.meta.style = 'guoman-houtu'
  p.meta.imageModel = modelById(p.meta.imageModel).id
  p.meta.videoModel = typeof p.meta.videoModel === 'string' && p.meta.videoModel ? p.meta.videoModel : 'keling-16'
  p.meta.promptMode = p.meta.promptMode === 'pair' ? 'pair' : 'single'
  // 投产包排除清单：只留已知的 9 个 key，脏数据一律丢掉
  const EXPORT_KEYS = ['package', 'storyboard', 'promptCsv', 'promptTxt', 'videoCsv', 'videoTxt', 'srt', 'voice', 'asset']
  p.meta.exportSkip = Array.isArray(p.meta.exportSkip) ? [...new Set(p.meta.exportSkip.map(String))].filter((k) => EXPORT_KEYS.includes(k)) : []
  const asSkills = (v) => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : []
    return arr.map((x) => String(x || '').trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4)
  }
  p.meta.skillPrompt = asSkills(raw.meta?.skillPrompt)
  p.meta.skillNovel = asSkills(raw.meta?.skillNovel)
  p.meta.skillVideo = asSkills(raw.meta?.skillVideo)
  p.meta.rev = Number(raw.meta?.rev) >= 1 ? Math.floor(Number(raw.meta.rev)) : 1
  p.topics = Array.isArray(raw.topics) ? raw.topics : []
  p.characters = Array.isArray(raw.characters)
    ? raw.characters.map((c) => {
        const base = emptyCharacter()
        return {
          ...base,
          ...c,
          ...normalizeRefImages(c),
          voiceProfile: { ...base.voiceProfile, ...((c && c.voiceProfile) || {}) },
          outfits: (Array.isArray(c?.outfits) ? c.outfits : []).map((o, i) => ({
            ...emptyOutfit(outfitSeq(i)),
            ...o,
            seq: (o && String(o.seq || '').trim()) || outfitSeq(i),
          })),
        }
      })
    : []
  p.episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e, i) => ({
        ...emptyEpisode(i + 1),
        ...e,
        cliffhangers: Array.isArray(e.cliffhangers) ? e.cliffhangers : [],
        beats: (Array.isArray(e.beats) && e.beats.length ? e.beats : [{ id: uid('bt'), t: '开局钩子', text: '' }]).map((b) => ({
          ...b,
          intensity: Number(b?.intensity) >= 1 && Number(b?.intensity) <= 5 ? Number(b.intensity) : BEAT_INTENSITY[b?.t] || 3,
        })),
        shots: Array.isArray(e.shots) && e.shots.length
          ? e.shots.map((s) => ({
              ...emptyShot(1),
              ...s,
              renders: (Array.isArray(s?.renders) ? s.renders : [])
                .map((r) => ({
                  path: String(r?.path || ''),
                  kind: r?.kind === 'video' ? 'video' : 'image',
                  workflowHash: String(r?.workflowHash || ''),
                  at: String(r?.at || ''),
                }))
                .filter((r) => r.path),
            }))
          : [emptyShot(1)],
        sourceText: typeof e.sourceText === 'string' ? e.sourceText : '',
        anchors: (Array.isArray(e.anchors) ? e.anchors : [])
          .map((a) => ({ sid: Number(a && a.sid), type: String((a && a.type) || '冲突') }))
          .filter((a) => Number.isInteger(a.sid) && a.sid >= 0),
      }))
    : []
  p.assets = Array.isArray(raw.assets) ? raw.assets : []
  p.assetJobs = (Array.isArray(raw.assetJobs) ? raw.assetJobs : [])
    .map((a) => ({
      ...emptyAssetJob(a && a.kind),
      ...a,
      kind: assetJobKindOf(a && a.kind).id,
      charId: String((a && a.charId) || ''),
      charName: String((a && a.charName) || ''),
      name: String((a && a.name) || ''),
      prompt: String((a && a.prompt) || ''),
      negative: String((a && a.negative) || ''),
      params: String((a && a.params) || ''),
      image: String((a && a.image) || ''),
      image2: String((a && a.image2) || ''),
      render: String((a && a.render) || ''),
      seed: Number.isFinite(Number(a && a.seed)) ? Math.floor(Number(a.seed)) : 0,
    }))
    .filter((a) => a.id)

  p.assetImages = (Array.isArray(raw.assetImages) ? raw.assetImages : []).map((a) => ({
    ...emptyAssetImage(a && a.kind),
    ...a,
  }))
  // 自定义音色：seq 按数组顺序重排（V1、V2…），名字截 20 字，空壳丢掉
  p.voices = (Array.isArray(raw.voices) ? raw.voices : [])
  p.scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const base = emptyScene()
      const props = Array.isArray(x.props) ? x.props : typeof x.props === 'string' ? String(x.props).split(/[、,，]/) : []
      return {
        ...base,
        ...x,
        name: String(x.name || x.place || '未命名场景').trim(),
        props: props.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 10),
        open: (Array.isArray(x.open) ? x.open : []).map(String),
        epIds: (Array.isArray(x.epIds) ? x.epIds : []).map(String),
      }
    })
    .map((v, i) => ({
      ...emptyCustomVoice(v && v.name ? String(v.name).slice(0, 20) : ''),
      ...v,
      seq: voiceSeq(i),
      createdAt: (v && v.createdAt) || new Date().toISOString(),
    }))
    .filter((v) => v.name || v.gender || v.timbre || v.voiceId)

  // 素材自定义名：键是图片路径（自动汇总卡也能改名，改名不动物理文件）
  const an = raw.assetNames && typeof raw.assetNames === 'object' && !Array.isArray(raw.assetNames) ? raw.assetNames : {}
  p.assetNames = Object.fromEntries(
    Object.entries(an)
      .filter(([k, v]) => typeof k === 'string' && k && typeof v === 'string' && v.trim())
      .map(([k, v]) => [k, v.trim().slice(0, 40)]),
  )
  return p
}

export const platform = (p) => PLATFORMS[p.meta.platform] || PLATFORMS.douyin
export const styleOf = (p) => {
  const s = STYLES[p?.meta?.style]
  if (s) return s
  // 未注册的自定义画风：给个占位，保证提示词里至少有画风名，不炸
  if (isCustomStyleId(p?.meta?.style)) return { id: p.meta.style, name: '自定义画风（未同步）', anchor: '', negative: '', note: '在设置 → 画风里重新选一次即可' }
  return STYLES['guoman-houtu']
}
export const totalShots = (p) => p.episodes.reduce((n, e) => n + e.shots.length, 0)
export const totalDur = (p) => p.episodes.reduce((n, e) => n + e.shots.reduce((m, s) => m + (Number(s.dur) || 0), 0), 0)
/** 英文按词数、中文按字数——提示词的字数标签两种语言都要能看 */
export const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length
export const lenLabel = (s) => {
  const t = String(s || '')
  const han = (t.match(/[\u4e00-\u9fa5]/g) || []).length
  const ascii = (t.match(/[A-Za-z]/g) || []).length
  return ascii > han * 2 ? `${wordCount(t)} 词` : `${han} 字`
}

export const cn = (s) => String(s || '').replace(/[\s，。！？、；：""''（）《》…—~·,.!?;:'"()\[\]]/g, '')
