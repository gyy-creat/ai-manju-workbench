/**
 * 场景 / 环境：从原文推测七要素（地点·时间·天气·光线·色调·氛围·陈设）。
 *
 * 设计要点：
 * 1. 推测一定要「敢留白」——原文没写的一律不进推断值，转成「待确认问题」问使用者，
 *    而不是让模型编一个看起来合理但其实错的环境（错的环境会连带把光线、色调、情绪全带偏）。
 * 2. 本地规则链（没有 key / 选「只走本地」）也要能用：靠词表命中地点与时间，
 *    命不中的字段全部进问题列表。
 * 3. 场景名是分镜「场景」列的取值源，所以 name 必须短、稳定、可复用（如「灵堂·夜」）。
 */
import { SCENE_TIMES, SCENE_WEATHERS, uid } from './schema.js'

/** 地点词表：keys 命中即认定该地点；越靠前优先级越高（先匹配长词） */
export const PLACE_LIB = [
  { id: 'lingtang', place: '灵堂', keys: ['灵堂', '祠堂', '葬礼', '出殡', '棺材', '遗像', '白事', '守灵'], light: '冷白日光灯 + 两支烛火', tone: '灰白压抑', ambience: '香灰味、纸钱、压低的抽泣声', props: ['棺材', '遗像', '白菊', '挽联', '长明烛'] },
  { id: 'bedroom', place: '卧室', keys: ['卧室', '床上', '被窝', '睡衣', '床头', '枕边'], light: '床头暖光', tone: '暖黄私密', ambience: '布料摩擦声、窗外隐约车声', props: ['床', '床头灯', '窗帘', '衣柜'] },
  { id: 'living', place: '客厅', keys: ['客厅', '沙发', '茶几', '电视'], light: '顶灯偏暖', tone: '日常暖调', ambience: '电视声、挂钟走针', props: ['沙发', '茶几', '电视', '落地窗'] },
  { id: 'office', place: '办公室', keys: ['办公室', '工位', '办公桌', '会议室', '会议室'], light: '冷白格栅灯', tone: '冷灰商务', ambience: '键盘声、空调低频', props: ['办公桌', '电脑', '百叶窗', '文件柜'] },
  { id: 'hospital', place: '医院', keys: ['医院', '病房', '护士站', '手术室', '急诊'], light: '惨白荧光灯', tone: '苍白病态', ambience: '消毒水味、仪器滴答', props: ['病床', '输液架', '监护仪', '走廊长椅'] },
  { id: 'street', place: '街道', keys: ['街道', '马路', '路口', '巷子', '胡同', '天桥'], light: '路灯 + 车灯', tone: '冷调夜色', ambience: '车流、风声、远处人声', props: ['路灯', '斑马线', '广告牌', '垃圾桶'] },
  { id: 'restaurant', place: '餐厅', keys: ['餐厅', '饭店', '火锅店', '包间', '食堂'], light: '暖黄吊灯', tone: '暖调烟火', ambience: '碗筷声、油烟、人声嘈杂', props: ['餐桌', '餐具', '吊灯', '玻璃门'] },
  { id: 'bar', place: '酒吧', keys: ['酒吧', '酒局', '吧台', '夜店'], light: '霓虹 + 射灯', tone: '霓虹冷艳', ambience: '低频音乐、冰块碰杯', props: ['吧台', '酒瓶', '卡座', '射灯'] },
  { id: 'car', place: '车内', keys: ['车里', '车内', '副驾', '后座', '驾驶座'], light: '仪表盘微光 + 窗外流光', tone: '冷调幽闭', ambience: '引擎声、雨刷、封闭空间回声', props: ['方向盘', '座椅', '后视镜', '车窗'] },
  { id: 'elevator', place: '电梯', keys: ['电梯', '轿厢'], light: '顶部白灯', tone: '冷白逼仄', ambience: '钢缆声、呼吸声被放大', props: ['镜面墙', '楼层灯', '扶手'] },
  { id: 'rooftop', place: '天台', keys: ['天台', '楼顶', '屋顶'], light: '月光 + 城市灯海', tone: '冷蓝天幕', ambience: '风声、远处车流', props: ['水塔', '铁栏杆', '排风管'] },
  { id: 'school', place: '学校', keys: ['学校', '教室', '操场', '走廊', '宿舍'], light: '日光灯 / 自然光', tone: '明亮清透', ambience: '朗读声、铃声、脚步声', props: ['课桌', '黑板', '窗', '书包'] },
  { id: 'court', place: '法庭', keys: ['法庭', '法院', '审判'], light: '高顶冷光', tone: '庄重冷灰', ambience: '木槌声、翻卷宗声', props: ['审判台', '旁听席', '国徽'] },
  { id: 'wedding', place: '婚礼现场', keys: ['婚礼', '婚宴', '喜宴', '新娘'], light: '暖白追光', tone: '暖金喜庆', ambience: '礼乐、掌声、花香', props: ['花门', '红毯', '香槟塔'] },
  { id: 'kitchen', place: '厨房', keys: ['厨房', '灶台', '锅里'], light: '灶火 + 顶灯', tone: '暖调生活', ambience: '油爆声、抽油烟机', props: ['灶台', '菜刀', '碗柜'] },
  { id: 'bathroom', place: '浴室', keys: ['浴室', '卫生间', '洗手间', '镜子前'], light: '镜前灯', tone: '湿冷反光', ambience: '水声、瓷砖回声', props: ['洗手台', '镜子', '浴帘'] },
  { id: 'stairs', place: '楼道', keys: ['楼道', '楼梯', '走廊尽头'], light: '声控灯 + 窗缝光', tone: '阴冷半暗', ambience: '脚步回声、风声', props: ['扶手', '旧灯', '配电箱'] },
  { id: 'garage', place: '地下车库', keys: ['地下车库', '停车场', '车库'], light: '白色荧光灯管', tone: '冷白空旷', ambience: '滴水声、脚步回声', props: ['立柱', '车位线', '管道'] },
  { id: 'park', place: '公园', keys: ['公园', '长椅', '湖边', '小树林'], light: '自然光 / 路灯', tone: '清淡自然', ambience: '鸟鸣、树叶声', props: ['长椅', '树', '路灯'] },
  { id: 'seaside', place: '海边', keys: ['海边', '沙滩', '码头', '海边'], light: '天光 + 水面反光', tone: '冷蓝开阔', ambience: '浪声、海风', props: ['礁石', '护栏', '远处船灯'] },
  { id: 'palace', place: '宫殿', keys: ['宫殿', '大殿', '寝殿', '御书房', '王府'], light: '烛火 + 高窗天光', tone: '沉金古旧', ambience: '衣料窸窣、更漏声', props: ['屏风', '香炉', '帷幔', '金砖地'] },
  { id: 'inn', place: '客栈', keys: ['客栈', '酒楼', '茶楼'], light: '油灯 + 灯笼', tone: '暖褐旧调', ambience: '酒客喧哗、算盘声', props: ['木桌', '酒坛', '灯笼'] },
]

/** 时间词（按 key 长度降序匹配，避免「夜」先吃掉「深夜」） */
const TIME_KEYS = [
  ['凌晨', ['凌晨', '子夜', '半夜三更', '天快亮']],
  ['深夜', ['深夜', '半夜', '夜里两点', '午夜']],
  ['夜', ['晚上', '入夜', '天黑', '夜色', '夜里', '夜晚', '灯还亮着']],
  ['傍晚', ['傍晚', '黄昏', '夕阳', '天色暗下来', '暮色']],
  ['白天', ['白天', '中午', '正午', '上午', '下午', '阳光']],
  ['清晨', ['清晨', '一大早', '天亮', '破晓', '早晨']],
]

const WEATHER_KEYS = [
  ['雨', ['下雨', '雨声', '细雨', '暴雨', '雨点', '淋湿', '雨刷', '屋檐滴水']],
  ['雪', ['下雪', '雪', '积雪', '飘雪']],
  ['雾', ['雾', '白茫茫']],
  ['风', ['刮风', '大风', '风很大', '风声']],
  ['阴', ['阴天', '阴沉', '乌云']],
  ['晴', ['晴', '大太阳', '阳光很好']],
]

/** 有明确光源描写时不再追问光线 */
const LIGHT_KEYS = ['日光灯', '吊灯', '台灯', '床头灯', '壁灯', '落地灯', '灯管', '顶灯', '路灯', '车灯', '车头灯', '手机屏幕', '屏幕光', '烛火', '烛光', '蜡烛', '月光', '霓虹', '火把', '灯笼', '阳光', '天光', '昏黄', '惨白']

/** 太泛的地点：命中也要追问具体是哪 */
const VAGUE_PLACES = ['房间', '屋子里', '里面', '门口', '大厅', '走廊', '车里', '楼梯', '外面']

const norm = (s) => String(s || '').replace(/\s+/g, '')

function findPlace(text) {
  const t = norm(text)
  for (const p of PLACE_LIB) {
    for (const k of p.keys) {
      if (t.includes(norm(k))) return { p, key: k }
    }
  }
  return null
}

function findTime(text) {
  const t = norm(text)
  for (const name of SCENE_TIMES) {
    const hit = TIME_KEYS.find((x) => x[0] === name)
    if (hit && hit[1].some((k) => t.includes(norm(k)))) return name
  }
  // 兜底：更松的时间词
  for (const [name, keys] of TIME_KEYS) {
    if (keys.some((k) => t.includes(norm(k)))) return name
  }
  return ''
}

function findWeather(text) {
  const t = norm(text)
  for (const [name, keys] of WEATHER_KEYS) {
    if (keys.some((k) => t.includes(norm(k)))) return name
  }
  return ''
}

function hasLightWord(text) {
  const t = norm(text)
  return LIGHT_KEYS.some((k) => t.includes(norm(k)))
}

/** 把原文切成句子（保留标点，用于就近取时间/天气） */
function sentences(text) {
  return String(text || '')
    .split(/(?<=[。！？；\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 时间 → 光线默认值（只在原文没写光源时使用，且会标成「推断」） */
function lightForTime(time) {
  if (time === '夜' || time === '深夜' || time === '凌晨') return '夜间人工光（灯 / 屏幕 / 窗光）'
  if (time === '傍晚') return '低角度暖光 + 长影'
  if (time === '清晨') return '清冷晨光 + 薄雾感'
  if (time === '白天') return '自然散射日光'
  return ''
}

function toneForTime(time, place) {
  if (time === '夜' || time === '深夜' || time === '凌晨') return '冷调夜色'
  if (time === '傍晚') return '暖橙余晖'
  if (time === '清晨') return '清冷薄雾'
  return place?.tone || ''
}

/**
 * 本地规则推测：从原文里抽场景。
 * @returns {{scenes: Array, questions: Array}}
 */
export function deriveScenesLocal(text, opts = {}) {
  const sents = sentences(text)
  if (!sents.length) return { scenes: [], questions: [] }

  // place → 聚合
  const bucket = new Map()
  sents.forEach((s, i) => {
    const hit = findPlace(s)
    if (!hit) return
    const key = hit.p.place
    const cur =
      bucket.get(key) ||
      {
        p: hit.p,
        place: hit.p.place,
        keyWord: hit.key,
        firstIdx: i,
        time: '',
        weather: '',
        light: '',
        props: new Set(),
        ambience: hit.p.ambience || '',
        vague: VAGUE_PLACES.some((v) => norm(s).includes(norm(v))),
      }
    // 时间/天气：优先本句，其次前后各一句
    if (!cur.time) cur.time = findTime(s) || findTime(sents[i - 1] || '') || findTime(sents[i + 1] || '')
    if (!cur.weather) cur.weather = findWeather(s) || findWeather(sents[i - 1] || '') || findWeather(sents[i + 1] || '')
    if (!cur.light && (hasLightWord(s) || /灯|烛|火光|月光/.test(norm(s)))) {
      const hitLights = LIGHT_KEYS.filter((k) => norm(s).includes(norm(k)))
      if (!hitLights.length) {
        // 兜底：抓「XX灯」这种具体灯名（格栅灯 / 声控灯 / 车头灯…），不要漏掉原文已经写明的光源
        const m = norm(s).match(/([\u4e00-\u9fa5]{2,4}灯)/)
        if (m) hitLights.push(m[1])
      }
      if (hitLights.length) cur.light = hitLights.slice(0, 2).join(' + ')
    }
    ;(hit.p.props || []).forEach((x) => cur.props.add(x))
    bucket.set(key, cur)
  })

  const scenes = []
  const questions = []
  ;[...bucket.values()]
    .sort((a, b) => a.firstIdx - b.firstIdx)
    .forEach((cur, idx) => {
      const name = cur.time ? `${cur.place}·${cur.time}` : cur.place
      const sc = {
        id: uid('sc'),
        name,
        place: cur.place,
        time: cur.time,
        weather: cur.weather,
        light: cur.light || lightForTime(cur.time),
        tone: toneForTime(cur.time, cur.p),
        ambience: cur.ambience,
        props: [...cur.props],
        desc: '',
        from: 'local',
        confidence: cur.time ? 'mid' : 'low',
        open: [],
        epIds: opts.epIds || [],
      }
      sc.desc = describeScene(sc)

      // 待确认：时间缺失是硬伤（光线/色调全靠它）
      if (!cur.time) {
        sc.open.push('time')
        questions.push({
          id: uid('q'),
          sceneId: sc.id,
          field: 'time',
          q: `「${cur.place}」这场戏发生在什么时候？原文没写清时间。`,
          why: '时间决定光线、色调和整场的情绪基调',
          options: ['清晨', '白天', '傍晚', '夜', '深夜'],
        })
      }
      // 室外场景才追问天气
      const outdoor = ['街道', '天台', '公园', '海边', '地下车库', '楼道']
      if (!cur.weather && outdoor.includes(cur.place)) {
        sc.open.push('weather')
        questions.push({
          id: uid('q'),
          sceneId: sc.id,
          field: 'weather',
          q: `「${cur.place}」这场是什么天气？`,
          why: '室外天气会直接影响画面湿度和光的质感',
          options: ['晴', '阴', '雨', '雪', '雾'],
        })
      }
      if (!cur.light) {
        sc.open.push('light')
        questions.push({
          id: uid('q'),
          sceneId: sc.id,
          field: 'light',
          q: `「${cur.place}」的主光源怎么定？`,
          why: '主光源定了，画面的明暗和色温才不会每一镜都跳',
          options: [lightForTime(cur.time) || '自然散射日光', '暖黄室内灯', '冷白荧光灯', '月光 + 环境光'].filter(Boolean),
        })
      }
      scenes.push(sc)
    })

  return { scenes, questions }
}

/** 一句话场景描述（进提示词用的那种，可读、可复制） */
export function describeScene(sc) {
  if (!sc) return ''
  const bits = []
  if (sc.place) bits.push(sc.place)
  if (sc.time) bits.push(sc.time)
  if (sc.weather) bits.push(sc.weather)
  if (sc.light) bits.push(sc.light)
  if (sc.tone) bits.push(sc.tone + '调')
  const props = (sc.props || []).filter(Boolean)
  if (props.length) bits.push('陈设：' + props.slice(0, 5).join('、'))
  if (sc.ambience) bits.push('氛围：' + sc.ambience)
  return bits.join('，')
}

/** 供 05/06 页提示词拼接：紧凑一行 */
export function scenePromptLine(sc) {
  if (!sc) return ''
  const bits = [sc.place, sc.time, sc.weather, sc.light, sc.tone].filter(Boolean)
  const props = (sc.props || []).filter(Boolean)
  return bits.join('·') + (props.length ? '｜陈设 ' + props.slice(0, 6).join('、') : '')
}

/**
 * AI 定向用的对话消息。
 * 让模型只做「读原文 + 归纳」，缺的字段一律抛问题，不许编。
 */
export function buildSceneMessages(text, opts = {}) {
  const styleName = opts.styleName || '国漫厚涂'
  const sys = `你是漫剧的场景美术指导，负责把剧本原文里的环境信息归纳成「场景卡」，交给后续生图/生视频使用。

【输出格式】只输出一个 JSON 对象，不要解释、不要 markdown 代码块：
{
  "scenes": [
    {
      "name": "灵堂·夜",
      "place": "苏家老宅灵堂",
      "time": "夜",
      "weather": "",
      "light": "冷白日光灯 + 两支烛火",
      "tone": "灰白压抑",
      "ambience": "香灰味、纸钱、压低的抽泣声",
      "props": ["棺材", "遗像", "白菊"],
      "desc": "一句话把上面要素连起来的场景描述",
      "from": "原文",
      "confidence": "high",
      "open": []
    }
  ],
  "questions": [
    {
      "sceneId": "对应 scenes 里某个 name（用 name 指代即可）",
      "field": "time | weather | light | place | tone",
      "q": "要问使用者的一句话，必须具体、一句话只问一个字段",
      "why": "为什么这个字段必须确认（一句话）",
      "options": ["选项1", "选项2", "选项3"]
    }
  ]
}

【硬规则】
1. 只写原文能支撑的内容。原文没写的字段留空字符串，并且必须为它生成一条 question —— 绝对不要用「常见设定」去猜。
   猜错环境的代价是整场戏的光线、色调、情绪全错，比留空严重得多。
2. name 必须短且稳定，格式「地点·时间」（如「灵堂·夜」「办公室·白天」），最多 8 个字；它会被直接写进分镜的「场景」列并作为资产名，所以同类场景必须复用同一个 name。
3. time 只能取：${SCENE_TIMES.join(' / ')}；weather 只能取：${SCENE_WEATHERS.join(' / ')}。
4. light 写主光源（灯的种类 / 自然光 / 月光），不要写「明亮」「昏暗」这种形容词。
5. tone 写色调 + 情绪（如「冷灰压抑」「暖黄怀旧」），两到四个字到六个字。
6. props 只写原文出现过的陈设，3–6 个，不要凑数。
7. questions 最多 6 条，按「不问就会拍错」的优先级排序；options 给 2–4 个，第一个是最可能的值。
8. 画风是「${styleName}」，desc 里不要出现与画风冲突的写实摄影词。

【已有场景（不要重复新建）】
${(opts.existing || []).map((s) => s.name).filter(Boolean).join('、') || '（暂无）'}`

  const usr = `【原文】
${String(text || '').slice(0, 12000)}

【已知角色】${(opts.characters || []).join('、') || '（未提供）'}

请归纳出这场戏涉及的所有场景，缺信息的一律抛问题。`

  return [
    { role: 'system', content: sys },
    { role: 'user', content: usr },
  ]
}

/** 把模型返回的 scenes/questions 规整成内部结构 */
export function normalizeSceneResult(data, opts = {}) {
  const list = Array.isArray(data?.scenes) ? data.scenes : []
  const scenes = []
  const byName = new Map()

  list.forEach((raw) => {
    const name = String(raw?.name || raw?.place || '').trim() || '未命名场景'
    const sc = {
      id: uid('sc'),
      name,
      place: String(raw?.place || name.split('·')[0] || '').trim(),
      time: SCENE_TIMES.includes(raw?.time) ? raw.time : String(raw?.time || '').trim(),
      weather: SCENE_WEATHERS.includes(raw?.weather) ? raw.weather : String(raw?.weather || '').trim(),
      light: String(raw?.light || '').trim(),
      tone: String(raw?.tone || '').trim(),
      ambience: String(raw?.ambience || '').trim(),
      props: (Array.isArray(raw?.props) ? raw.props : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8),
      desc: String(raw?.desc || '').trim(),
      from: 'ai',
      confidence: ['high', 'mid', 'low'].includes(raw?.confidence) ? raw.confidence : 'mid',
      open: (Array.isArray(raw?.open) ? raw.open : []).map(String),
      epIds: opts.epIds || [],
    }
    if (!sc.desc) sc.desc = describeScene(sc)
    scenes.push(sc)
    byName.set(name, sc.id)
  })

  const questions = (Array.isArray(data?.questions) ? data.questions : [])
    .map((q) => {
      const wantName = String(q?.sceneId || '').trim()
      const sid = byName.get(wantName) || scenes[0]?.id || ''
      const sceneName = (scenes.find((x) => x.id === sid) || {}).name || wantName
      const field = ['time', 'weather', 'light', 'tone', 'place', 'name', 'props', 'ambience'].includes(q?.field) ? q.field : 'light'
      const options = (Array.isArray(q?.options) ? q.options : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4)
      return {
        id: uid('q'),
        sceneId: sid,
        sceneName,
        field,
        q: String(q?.q || '').trim(),
        why: String(q?.why || '').trim(),
        options,
      }
    })
    .filter((q) => q.q && q.sceneId)

  return { scenes, questions }
}

/** 回答一个问题：返回该场景的 patch（调用方负责写回） */
export function applyAnswer(scene, question, value) {
  const v = String(value || '').trim()
  if (!scene || !question || !v) return null
  const patch = { [question.field]: v }
  if (question.field === 'place') {
    patch.name = scene.time ? `${v}·${scene.time}` : v
  }
  if (question.field === 'time') {
    patch.name = scene.place ? `${scene.place}·${v}` : scene.name
    if (!scene.light) patch.light = ''
  }
  patch.open = (scene.open || []).filter((f) => f !== question.field)
  patch.confidence = patch.open.length ? scene.confidence : 'high'
  return patch
}
