// =========================================================
// 音色档案：把一个「音色名」升级成一套可复现的参数
//
// 设计前提（改之前先读）：
//   1. characters[].voice 仍然是唯一真源（短标签，列表与导出都用它）；
//      voiceProfile 是叠加在它上面的细节，缺哪个字段就从 voice 里推。
//   2. 一致性靠「同一个角色永远是同一套参数」+「两个角色不许撞参数」，
//      不是靠每次都重新描述一遍音色。
//   3. 这里不引任何依赖、不发请求，纯函数，可被 api.mjs 之外的任何地方复用。
// =========================================================

// 说话人档位：音色 = 性别 + 年龄 + 基频 + 音质 + 语速 + 口音 + 情绪基线 + 气息
export const VOICE_PRESETS = [
  {
    id: 'boy-bright',
    label: '少年男·清亮偏薄',
    gender: '男', age: '少年', pitch: '偏高', timbre: '清亮', rate: '中快',
    accent: '标准普通话', emotion: '爽', breath: '干净无气声',
    tool: '讯飞超拟人', voiceId: 'x4_lingxiaoxuan', params: 'speed=1.06, pitch=+3, emotion=cheerful',
  },
  {
    id: 'young-male-low',
    label: '青年男·低沉沙哑',
    gender: '男', age: '青年', pitch: '低', timbre: '沙哑', rate: '中慢',
    accent: '标准普通话', emotion: '压制', breath: '尾字带气声',
    tool: '讯飞超拟人', voiceId: 'x4_yezi', params: 'speed=0.92, pitch=-4, emotion=serious',
  },
  {
    id: 'young-male-clear',
    label: '青年男·清亮干净',
    gender: '男', age: '青年', pitch: '中', timbre: '清亮', rate: '中',
    accent: '标准普通话', emotion: '平', breath: '干净无气声',
    tool: 'Edge TTS', voiceId: 'zh-CN-YunxiNeural', params: 'rate=-4%, pitch=+0Hz',
  },
  {
    id: 'mid-male-solid',
    label: '中年男·浑厚温润',
    gender: '男', age: '中年', pitch: '低', timbre: '温润', rate: '中慢',
    accent: '标准普通话', emotion: '稳', breath: '胸腔共鸣',
    tool: '讯飞超拟人', voiceId: 'x4_pengfei', params: 'speed=0.94, pitch=-3, emotion=neutral',
  },
  {
    id: 'old-male-dry',
    label: '老年男·干哑沧桑',
    gender: '男', age: '老年', pitch: '低', timbre: '干哑', rate: '慢',
    accent: '轻北方口音', emotion: '沧桑', breath: '气声重、句尾落',
    tool: '讯飞超拟人', voiceId: 'x4_laoma', params: 'speed=0.86, pitch=-6, breathiness=0.35',
  },
  {
    id: 'young-female-cold',
    label: '青年女·冷清倔强',
    gender: '女', age: '青年', pitch: '中', timbre: '清冷', rate: '中慢',
    accent: '标准普通话', emotion: '克制', breath: '几乎无气声',
    tool: '讯飞超拟人', voiceId: 'x4_xiaoyi', params: 'speed=0.95, pitch=-2, emotion=serious',
  },
  {
    id: 'young-female-sweet',
    label: '青年女·清甜',
    gender: '女', age: '青年', pitch: '偏高', timbre: '清亮', rate: '中快',
    accent: '标准普通话', emotion: '心动', breath: '轻气声',
    tool: 'Edge TTS', voiceId: 'zh-CN-XiaoxiaoNeural', params: 'rate=+4%, pitch=+2Hz',
  },
  {
    id: 'girl-fragile',
    label: '少女·脆弱气声',
    gender: '女', age: '少年', pitch: '高', timbre: '气声', rate: '中',
    accent: '标准普通话', emotion: '委屈', breath: '气声多、抖',
    tool: 'CosyVoice', voiceId: '中文女-温柔', params: 'speed=0.98, breathiness=0.5',
  },
  {
    id: 'female-magnetic',
    label: '御姐·磁性压迫',
    gender: '女', age: '青年', pitch: '低', timbre: '磁性', rate: '中慢',
    accent: '标准普通话', emotion: '嘲讽', breath: '喉音、尾音上扬',
    tool: '讯飞超拟人', voiceId: 'x4_lingyue', params: 'speed=0.9, pitch=-5, emotion=calm',
  },
  {
    id: 'villain-sharp',
    label: '疯批反派·尖利金属',
    gender: '中性', age: '青年', pitch: '偏高', timbre: '金属', rate: '快',
    accent: '标准普通话', emotion: '狂', breath: '撕裂感',
    tool: 'GPT-SoVITS', voiceId: 'villain_v1', params: 'speed=1.12, pitch=+4, emotion=angry',
  },
  {
    id: 'narrator-calm',
    label: '旁白·冷静旁观',
    gender: '中性', age: '中年', pitch: '中', timbre: '温润', rate: '中',
    accent: '标准普通话', emotion: '旁观', breath: '平稳',
    tool: 'Edge TTS', voiceId: 'zh-CN-YunjianNeural', params: 'rate=-4%, pitch=-1Hz',
  },
  {
    id: 'crowd-rough',
    label: '群演·颗粒嘈杂',
    gender: '中性', age: '青年', pitch: '中', timbre: '颗粒', rate: '快',
    accent: '方言可有', emotion: '随意', breath: '嘈杂',
    tool: '本地规则占位', voiceId: '', params: 'speed=1.05',
  },
]

// 兼容旧 VOICES 里的短名（api.mjs 与历史台账都用这套）
const ALIAS = {
  '青年男声·低沉': 'young-male-low',
  '青年男声·清亮': 'young-male-clear',
  '少年音': 'boy-bright',
  '御姐音': 'female-magnetic',
  '少女音': 'girl-fragile',
  '磁性大叔音': 'mid-male-solid',
  '疯批反派音': 'villain-sharp',
  '旁白·冷静': 'narrator-calm',
  '冷清女声·倔强': 'young-female-cold',
  '老年男声·沙哑': 'old-male-dry',
  '少年男声·清亮': 'boy-bright',
  '少女女声·脆弱': 'girl-fragile',
  '旁白·中性': 'narrator-calm',
}

export const VOICE_FIELDS = ['gender', 'age', 'pitch', 'timbre', 'rate', 'accent', 'emotion', 'breath']
export const VOICE_TECH_FIELDS = ['tool', 'voiceId', 'refAudio', 'refText', 'seed', 'params']

export const VOICE_ENUMS = {
  gender: ['男', '女', '中性'],
  age: ['少年', '青年', '中年', '老年'],
  pitch: ['低', '中', '偏高', '高'],
  timbre: ['清亮', '清冷', '温润', '沙哑', '干哑', '气声', '磁性', '金属', '颗粒'],
  rate: ['慢', '中慢', '中', '中快', '快'],
  emotion: ['平', '压制', '克制', '稳', '爽', '心动', '委屈', '嘲讽', '狂', '沧桑', '旁观', '随意'],
}

/** 找到角色 voice 指向的自定义音色（list 是 project.voices） */
export function customOf(voices, key) {
  const k = String(key || '')
  if (!k) return null
  return (voices || []).find((v) => v.id === k || `${v.seq || ''} · ${v.name || ''}` === k || v.name === k) || null
}

/** 音色显示名：自定义给「V1 · 冷嗓低哑」，预设给它的 label */
export function voiceDisplayLabel(voice, voices) {
  const c = customOf(voices, voice)
  if (c) return `${c.seq || ''}${c.seq ? ' · ' : ''}${c.name || '未命名音色'}`
  return presetOf(voice).label
}

export function emptyVoiceProfile() {
  return {
    presetId: '',
    gender: '', age: '', pitch: '', timbre: '', rate: '', accent: '', emotion: '', breath: '',
    tool: '', voiceId: '', refAudio: '', refText: '', seed: '', params: '',
  }
}

/** 从音色名反推预设；推不出来时给一套中性默认，保证永远有完整参数 */
export function presetOf(voice) {
  const v = String(voice || '').trim()
  const byId = VOICE_PRESETS.find((p) => p.id === v)
  if (byId) return byId
  const byLabel = VOICE_PRESETS.find((p) => p.label === v)
  if (byLabel) return byLabel
  if (ALIAS[v]) return VOICE_PRESETS.find((p) => p.id === ALIAS[v])
  // 关键词兜底：整套预设里找匹配字数最多的
  let best = null
  let bestScore = 0
  for (const p of VOICE_PRESETS) {
    let score = 0
    for (const k of ['男', '女', '少年', '青年', '中年', '老年', '低沉', '清亮', '沙哑', '磁性', '御姐', '少女', '旁白', '反派']) {
      if (v.includes(k) && (p.label.includes(k) || p[pickKeyFor(k)] === k)) score += 1
    }
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return best || VOICE_PRESETS.find((p) => p.id === 'narrator-calm')
}

function pickKeyFor(word) {
  if (['男', '女', '中性'].includes(word)) return 'gender'
  if (['少年', '青年', '中年', '老年'].includes(word)) return 'age'
  if (['清亮', '清冷', '温润', '沙哑', '磁性', '气声', '金属', '颗粒'].includes(word)) return 'timbre'
  return 'label'
}

/**
 * 合并出这个角色真正生效的音色档案：
 * 显式写过的字段优先，其余从预设补齐 —— 所以任何旧台账都能直接拿到完整参数。
 */
export function resolveVoice(character, voices) {
  const ch = character || {}
  // 自定义音色（V1 · 名字）优先当 preset 用：字段名与预设一一对应
  const preset = customOf(voices, ch.voice) || presetOf(ch.voice) || VOICE_PRESETS[0]
  const own = ch.voiceProfile || {}
  const out = { ...emptyVoiceProfile() }
  for (const k of ['gender', 'age', 'pitch', 'timbre', 'rate', 'accent', 'emotion', 'breath']) {
    out[k] = own[k] || preset[k] || ''
  }
  for (const k of ['tool', 'voiceId', 'params']) {
    out[k] = own[k] || preset[k] || ''
  }
  out.presetId = own.presetId || preset.id
  out.refAudio = own.refAudio || ''
  out.refText = own.refText || ''
  out.seed = own.seed || ch.seed || ''
  return out
}

/** 短标签：列表、表格里一眼能认出来的那一串 */
export function voiceTag(character, voices) {
  if (!character) return '未建档'
  if (!character.voice) return '未设置'
  const v = resolveVoice(character, voices)
  return [v.gender, v.age, v.pitch, v.timbre].filter(Boolean).join('·')
}

/** 完整一行：给配音员看的自然语言描述 */
export function voiceLine(character, voices) {
  const v = resolveVoice(character, voices)
  const bits = [
    `${v.gender}声`,
    `${v.age}感`,
    `基频${v.pitch}`,
    `音质${v.timbre}`,
    `语速${v.rate}`,
    v.accent && `口音${v.accent}`,
    v.emotion && `情绪基线${v.emotion}`,
    v.breath,
  ].filter(Boolean)
  return bits.join('，')
}

/** 给 TTS / 声音克隆工具的锁定串：换集不许改这串 */
export function voiceLock(character, voices) {
  if (!character) return ''
  const v = resolveVoice(character, voices)
  const lines = [
    `角色：${character.name || '未命名'}（${character.role || '—'}）`,
    `音色：${character.voice || '未设置'}`,
    `描述：${voiceLine(character, voices)}`,
    `工具：${v.tool || '（未指定）'}`,
  ]
  if (v.voiceId) lines.push(`voice_id：${v.voiceId}`)
  if (v.params) lines.push(`参数：${v.params}`)
  if (v.seed) lines.push(`seed：${v.seed}`)
  if (v.refAudio) lines.push(`参考音频：${v.refAudio}`)
  if (v.refText) lines.push(`参考文本：${v.refText}`)
  return lines.join('\n')
}

/** 撞音色检测：两个角色的生效参数完全一致 = 观众听不出区别，必须改 */
export function voiceConflicts(characters = [], voices = []) {
  const map = new Map()
  for (const c of characters) {
    if (!c.voice) continue
    const v = resolveVoice(c, voices)
    const key = [v.gender, v.age, v.pitch, v.timbre, v.rate].join('|')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(c)
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, names: list.map((c) => c.name), tag: voiceTag(list[0], voices) }))
}

/** 音色缺失清单：一致性检查用 */
export function voiceRisks(characters = [], voices = []) {
  const risks = []
  const noVoice = characters.filter((c) => !c.voice)
  if (noVoice.length) risks.push({ level: 'err', text: `${noVoice.map((c) => c.name).join('、')} 没有音色——配音时临时挑会串声` })
  const noTech = characters.filter((c) => c.voice && !resolveVoice(c, voices).voiceId && !resolveVoice(c, voices).refAudio)
  if (noTech.length) {
    risks.push({
      level: 'warn',
      text: `${noTech.map((c) => c.name).join('、')} 只写了音色名，没填 voice_id / 参考音频——换一台机器就会重挑`,
    })
  }
  const conflicts = voiceConflicts(characters, voices)
  for (const c of conflicts) {
    risks.push({ level: 'err', text: `${c.names.join(' 与 ')} 音色完全相同（${c.tag}），观众分不出谁在说话` })
  }
  const noSeed = characters.filter((c) => c.voice && !resolveVoice(c, voices).seed)
  if (noSeed.length && noSeed.length < characters.length) {
    risks.push({ level: 'info', text: `${noSeed.map((c) => c.name).join('、')} 没绑 seed，克隆音色每次重建会有细微漂移` })
  }
  return risks
}

/** 一行参数摘要：给 06 页自定义音色列表用 */
export function voiceSummary(v) {
  const o = v || {}
  return [o.gender, o.age, '基频' + (o.pitch || '—'), o.timbre || '—', '语速' + (o.rate || '—')]
    .filter(Boolean)
    .join('·')
}

export const VOICE_TOOLS = ['讯飞超拟人', 'Edge TTS', 'CosyVoice', 'GPT-SoVITS', '剪映朗读', 'ElevenLabs', '本地规则占位']
