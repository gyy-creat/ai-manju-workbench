/**
 * 长文本自动分集：把整本 / 多章正文切成「一集一份」，切点优先落在爆点句上。
 *
 * 为什么不用「每 N 字硬切」：硬切会把一句对白、甚至一个引号切成两半，
 * 后半集开头就是半句话，生成出来的镜头全废。而且凑巧切在平淡的过渡段上，
 * 这一集就没有钩子，观众第 3 秒就走了。
 *
 * 所以这里做两件事：
 *   1. 按引号配对切句（引号内的句号不切，和 api.mjs 的 splitSentences 同口径）；
 *   2. 在 [min, max] 字数窗口里挑「爆点分最高、离目标字数最近」的句子当断点。
 */

const CLOSER = { '「': '」', '“': '”', '『': '』', '‘': '’', '（': '）', '《': '》' }

/** 按引号配对切句；引号内的句号不断句 */
export function splitSentences(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n')
  const out = []
  let buf = ''
  const stack = []
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    buf += ch
    if (CLOSER[ch]) { stack.push(CLOSER[ch]); continue }
    if (stack.length && ch === stack[stack.length - 1]) { stack.pop(); continue }
    if (stack.length) continue
    if (ch === '\n') {
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
      continue
    }
    if ('。！？!?…；;'.includes(ch)) {
      // 连续标点（「？！」「……」）不重复切
      const nxt = src[i + 1]
      if (nxt && '。！？!?…；;'.includes(nxt)) continue
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 爆点词表：强 3 / 中 2，弱信号（对白、感叹、突然）另算 1 */
const BOOM_STRONG = /(杀|血|死|尸|滚|砸|撕|抢|夺|逼|退婚|休书|逐出|滚出|断亲|断指|烧|砍|捅|刀|枪|毒|绑架|威胁|扇|耳光|绝交|撕票|家破|灭门)/
const BOOM_MID = /(凭什么|不配|算账|敢|别想|翻脸|跪下|认错|欺|辱|警告|最后|再也|绝不|从此|冷笑|咬牙|咬牙|恨|叛|骗|瞒|偷|抢走|夺走|滚蛋|滚开|谁给|轮不到|轮得到|有你|没你)/
const BOOM_WEAK = /(突然|猛地|竟然|原来|居然|没想到|没想到|竟然|瞬间|一下|忽然)/

/** 单句爆点分（0–6）：强 3 + 中 2 + 弱 1，对白额外 +1，感叹/反问 +1 */
export function boomScore(sentence) {
  const s = String(sentence || '')
  let n = 0
  if (BOOM_STRONG.test(s)) n += 3
  if (BOOM_MID.test(s)) n += 2
  if (BOOM_WEAK.test(s)) n += 1
  if (/[「“『]/.test(s)) n += 1
  if (/[！!]/.test(s) || /[？?]/.test(s)) n += 1
  return Math.min(n, 6)
}

/** 场次标题行：第X场 / 场景 / 时间地点式短行 / 1. 2. 开头的编号行 */
const SCENE_LINE = /^\s*(第\s*[一二三四五六七八九十百\d]+\s*[场幕]|场景\s*[\d一二三四五六七八九十]+|INT\.|EXT\.|\d+\s*[.、]\s*\S)/i
export function countScenes(sentences) {
  return sentences.filter((s) => SCENE_LINE.test(s)).length
}

/**
 * 密度分级：口径是「每 10 句里有几个爆点句」（爆点句 = 单句 ≥4 分）。
 * 短剧写成色一般是 1.5 以上；纯过渡 / 大段景物描写通常不到 0.5。
 */
export function levelOf(density) {
  if (density >= 1.5) return { id: 'S', label: 'S · 一路爆', level: 'ok' }
  if (density >= 1.0) return { id: 'A', label: 'A · 够抓人', level: 'accent' }
  if (density >= 0.5) return { id: 'B', label: 'B · 偏平，要加戏', level: 'warn' }
  return { id: 'C', label: 'C · 过渡段，别单独成集', level: 'err' }
}

const clip = (s, n) => {
  const t = String(s || '').replace(/^[\s「“『]+|[\s」”』]+$/g, '')
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/**
 * 切分正文。
 * @param {string} text 整本 / 多章正文
 * @param {{targetChars?:number, minChars?:number, maxChars?:number, maxEpisodes?:number}} opts
 *        targetChars 每集目标字数（默认 1500，约等于 60–90 秒竖屏漫剧的戏量）
 */
export function splitEpisodes(text, opts = {}) {
  const target = Math.max(400, Math.min(6000, Number(opts.targetChars) || 1500))
  const min = Math.max(300, Math.round(Number(opts.minChars) || target * 0.5))
  const max = Math.max(min + 200, Math.round(Number(opts.maxChars) || target * 1.35))
  const maxEpisodes = Math.max(1, Math.min(30, Number(opts.maxEpisodes) || 12))

  const sents = splitSentences(text)
  const items = sents.map((s) => ({ s, n: s.replace(/\s/g, '').length, boom: boomScore(s) }))
  const totalChars = items.reduce((m, x) => m + x.n, 0)

  if (!items.length || totalChars < min) {
    return {
      episodes: [],
      stats: { chars: totalChars, sents: items.length, boomCount: 0, tooShort: true },
    }
  }

  const chunks = []
  let i = 0
  while (i < items.length && chunks.length < maxEpisodes) {
    let acc = 0
    let j = i
    let best = -1
    let bestScore = -Infinity
    while (j < items.length) {
      acc += items[j].n
      if (acc > max) break
      if (acc >= min) {
        // 越接近目标字数越好；爆点分越高越好（爆点权重更大）
        const dist = Math.abs(acc - target) / target
        const score = items[j].boom * 3 - dist * 4
        if (score > bestScore) { bestScore = score; best = j }
      }
      j++
    }
    // 窗口内没有合格切点（比如单句就超长）：退化成按句数硬切，但绝不切句子
    const end = best >= 0 ? best : Math.min(j - 1, items.length - 1)
    chunks.push(items.slice(i, end + 1))
    i = end + 1
  }
  // 超出集数上限时，剩下的并进最后一集（不丢字）
  if (i < items.length) chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(items.slice(i))

  // 尾巴太短并进前一集
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    const lastChars = last.reduce((m, x) => m + x.n, 0)
    if (lastChars < min) {
      chunks[chunks.length - 2] = chunks[chunks.length - 2].concat(last)
      chunks.pop()
    }
  }

  const episodes = chunks.map(makeSeg)

  const boomCount = items.filter((x) => x.boom >= 4).length
  return {
    episodes,
    stats: {
      chars: totalChars,
      sents: items.length,
      boomCount,
      eps: episodes.length,
      avgChars: Math.round(totalChars / Math.max(1, episodes.length)),
      levelCount: episodes.reduce((m, e) => ({ ...m, [e.level]: (m[e.level] || 0) + 1 }), {}),
    },
  }
}

/** 把一组句子做成一张分集卡 —— splitEpisodes 与 splitManual 共用同一口径，两条路算出来的数字才可比 */
function makeSeg(chunk, idx) {
  const text2 = chunk.map((x) => x.s).join('\n')
  const chars = chunk.reduce((m, x) => m + x.n, 0)
  const boomSum = chunk.reduce((m, x) => m + x.boom, 0)
  const bursts = chunk.filter((x) => x.boom >= 4)
  // 口径：每 10 句里有几个爆点句
  const dense = chunk.length ? (bursts.length / chunk.length) * 10 : 0
  const lv = levelOf(dense)
  // 钩子取全段最强句；标题取开头几句里最强的——标题要指向「观众第一眼看到的那句」
  const strongest = chunk.reduce((a, b) => (b.boom > a.boom ? b : a), chunk[0])
  const opening = chunk.slice(0, Math.min(5, chunk.length))
  const lead = opening.reduce((a, b) => (b.boom > a.boom ? b : a), opening[0])
  // 标题再往前找一句「像戏的」：开头 12 句里第一句带火气的，别拿「雨下了一整夜」当剧名
  const open12 = chunk.slice(0, Math.min(12, chunk.length))
  const titleSent = open12.find((x) => x.boom >= 2) || open12.find((x) => /[「“『"]/.test(x.s)) || lead
  return {
    id: `seg_${idx + 1}`,
    no: idx + 1,
    text: text2,
    chars,
    sents: chunk.length,
    booms: bursts.length,
    boomSum,
    density: Math.round(dense * 10) / 10,
    level: lv.id,
    levelLabel: lv.label,
    levelTone: lv.level,
    hook: clip(strongest.s, 60),
    title: clip(titleSent.s.replace(/[。！？!?…；;，,、]+$/g, ''), 16),
    head: clip(chunk[0].s, 40),
    scenes: countScenes(chunk.map((x) => x.s)),
    estShots: Math.max(8, Math.min(40, Math.round(chars / 75))),
  }
}

/* ─────────────────────────── 原文锚点 ─────────────────────────── */

/** 锚点类型：写分镜时靠它决定这一句要不要单独给一镜、给几秒 */
export const ANCHOR_TYPES = [
  { id: '钩子', hint: '第一镜要用它，前 3 秒抓人' },
  { id: '冲突', hint: '有人被逼到墙角，反应镜头给足' },
  { id: '反转', hint: '信息翻面，观众预期被打破' },
  { id: '打脸', hint: '之前被压的一方拿回场子' },
  { id: '爽点', hint: '情绪释放，别剪太快，让观众爽完' },
  { id: '悬念', hint: '抛出没答的问题，留到下一集' },
  { id: '情绪', hint: '没有事件，只有情绪落点，给特写' },
]

const A_HOOK = /(退婚|休书|逐出|滚|别想|凭什么|不配|算账|跪下|敢|最后|再也|从此)/
const A_TWIST = /(原来|竟然|居然|其实|没想到|谁知|不料|却是|反而|才发现)/
const A_FACE = /(跪下|认错|求我|打脸|谁给|轮不到|打脸|耳光|扇|跪下)/
const A_SWEET = /(值多少|价|赚|拿回|还回来|还清|翻身|第一笔|写下|签下|亮出|摆上|算账|压回去|轮到我|该我了)/
const A_SUSP = /(谁|为什么|怎么会|到底|不知道|没告诉|藏着|账本|秘密|为什么)/
const A_CONF = /(打|砸|撕|抢|夺|逼|砍|捅|刀|血|死|绑|威胁|辱|欺)/

/**
 * 给一句话判锚点类型；判不出来返回 null（不是每句都该标锚点）。
 * 顺序有讲究：反转/打脸优先于冲突 —— 「原来他早就算好了」是反转，不是打架。
 */
export function anchorTypeOf(sentence, index = 0, total = 1) {
  const s = String(sentence || '')
  if (!s.trim()) return null
  if (/[？?]/.test(s) && A_SUSP.test(s)) return '悬念'
  if (A_TWIST.test(s)) return '反转'
  if (A_FACE.test(s)) return '打脸'
  if (index === 0 && boomScore(s) >= 3) return '钩子'
  if (index === total - 1 && A_SUSP.test(s)) return '悬念'
  if (A_CONF.test(s)) return '冲突'
  if (A_SWEET.test(s)) return '爽点'
  if (A_HOOK.test(s)) return '冲突'
  if (/[「“『]/.test(s) && /[！!]/.test(s)) return '情绪'
  return null
}

/** 自动挑锚点：强类型（钩子/反转/打脸/爽点/悬念）判出来就收，弱类型（冲突/情绪）才看爆点分 */
export function autoAnchors(sentences, opts = {}) {
  const min = Number(opts.min) || 3
  const STRONG = new Set(['钩子', '反转', '打脸', '爽点', '悬念'])
  const total = sentences.length
  const out = []
  sentences.forEach((s, i) => {
    const type = anchorTypeOf(s, i, total)
    if (!type) return
    if (STRONG.has(type) || boomScore(s) >= min) out.push({ sid: i, type })
  })
  return out
}

/* ─────────────────────────── 手动分集 ─────────────────────────── */

const HEADING = /^\s*(第\s*[一二三四五六七八九十百零\d]+\s*[章节回幕集]|chapter\s*\d+|\d+\s*[.、]\s*\S)/i

/**
 * 手动分集：不靠算法猜，按用户自己给的规矩切。
 * @param {string} text
 * @param {{mode?:'marker'|'heading', marker?:string}} opts
 *        marker 模式：正文里出现分隔行（默认 ---）就切一刀；heading 模式：碰到「第X章 / 第X节 / Chapter N」就切一刀
 */
export function splitManual(text, opts = {}) {
  const mode = opts.mode === 'heading' ? 'heading' : 'marker'
  const marker = String(opts.marker || '---').trim() || '---'
  const src = String(text || '').replace(/\r\n?/g, '\n')

  /** 每块记一下它的章节标题 —— heading 模式下拿它当集标题，比从正文里挑句子准 */
  const blocks = []
  if (mode === 'marker') {
    const re = new RegExp(`^\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*$`, 'm')
    src.split(re).forEach((t) => blocks.push({ text: t, heading: '' }))
  } else {
    let buf = []
    let head = ''
    src.split('\n').forEach((line) => {
      if (HEADING.test(line) && buf.join('\n').trim()) {
        blocks.push({ text: buf.join('\n'), heading: head })
        buf = [line]
        head = line.trim()
      } else {
        if (!buf.length && HEADING.test(line)) head = line.trim()
        buf.push(line)
      }
    })
    if (buf.join('\n').trim()) blocks.push({ text: buf.join('\n'), heading: head })
  }

  const cleaned = blocks.map((b) => ({ text: String(b.text || '').trim(), heading: b.heading })).filter((b) => b.text)
  if (!cleaned.length) {
    return { episodes: [], stats: { chars: 0, sents: 0, boomCount: 0, mode, tooShort: true } }
  }

  const episodes = cleaned.map((blk, idx) => {
    const sents = splitSentences(blk.text)
    const items = sents.map((s) => ({ s, n: s.replace(/\s/g, '').length, boom: boomScore(s) }))
    const seg = makeSeg(items.length ? items : [{ s: blk.text, n: blk.text.length, boom: 0 }], idx)
    if (blk.heading) seg.title = clip(blk.heading, 16)
    return seg
  })

  const totalChars = episodes.reduce((m, e) => m + e.chars, 0)
  const boomCount = episodes.reduce((m, e) => m + e.booms, 0)
  return {
    episodes,
    stats: {
      chars: totalChars,
      sents: episodes.reduce((m, e) => m + e.sents, 0),
      boomCount,
      eps: episodes.length,
      avgChars: Math.round(totalChars / Math.max(1, episodes.length)),
      levelCount: episodes.reduce((m, e) => ({ ...m, [e.level]: (m[e.level] || 0) + 1 }), {}),
      mode,
    },
  }
}
