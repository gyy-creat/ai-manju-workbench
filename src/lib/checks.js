// 六项机检：对白语速 / 视觉变化密度 / 悬念上限 / 钩子 / 一镜多动作 / 情绪强度
import { platform, cn, HOOK_WORDS, SIZES } from './schema.js'

const bigrams = (s) => {
  const t = cn(s)
  const out = new Set()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0
  let inter = 0
  a.forEach((x) => b.has(x) && inter++)
  return inter / (a.size + b.size - inter)
}

export const RULES = [
  { id: 'rate', name: '对白语速', desc: '每镜台词字数 ÷ 时长，落在平台口播区间' },
  { id: 'density', name: '视觉变化密度', desc: '连续 3 镜景别/机位/场景全同 → 动态漫显呆' },
  { id: 'suspense', name: '悬念上限', desc: '单集未解悬念 ≤ 3 条' },
  { id: 'hook', name: '钩子', desc: '前 3 秒有冲突词、首镜不超窗口、集间首句不重复' },
  { id: 'multi', name: '一镜多动作', desc: '单镜动作链 ≤ 2 个，超了拆镜' },
  { id: 'emotion', name: '情绪强度', desc: '开局 ≥3、峰值 ≥4、结尾 ≥4、不连续平' },
]

export function runChecks(project) {
  const pf = platform(project)
  const issues = []
  const push = (rule, level, msg, where) => {
    issues.push({ rule, level, msg, where })
  }
  const charNames = new Set(project.characters.map((c) => c.name))

  project.episodes.forEach((ep) => {
    const label = `第${ep.no}集`
    const shots = ep.shots || []
    const epDur = shots.reduce((n, s) => n + (Number(s.dur) || 0), 0)

    // 1 对白语速
    shots.forEach((sh) => {
      const text = cn(sh.dialogue)
      const dur = Number(sh.dur) || 0
      if (!text) return
      if (dur <= 0) {
        push('rate', 'error', `${label} 镜${sh.no} 有台词但时长为 0`, `${label}·镜${sh.no}`)
        return
      }
      const rate = text.length / dur
      const [lo, hi] = pf.voiceRate
      if (rate > hi + 0.6)
        push('rate', 'warn', `镜${sh.no}：${text.length}字/${dur}s = ${rate.toFixed(1)} 字/秒，快于上限 ${hi}，口型与字幕都跟不上`, `${label}·镜${sh.no}`)
      else if (rate < lo - 0.8)
        push('rate', 'warn', `镜${sh.no}：${rate.toFixed(1)} 字/秒，慢于下限 ${lo}，画面会拖；补动作或缩时长`, `${label}·镜${sh.no}`)
    })

    // 2 视觉变化密度
    let sameRun = 1
    for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1]
      const b = shots[i]
      const same = a.size === b.size && a.angle === b.angle && a.scene === b.scene
      if (same) {
        sameRun++
        if (sameRun === 3)
          push('density', 'warn', `镜${b.no} 起连续 3 镜景别/机位/场景全同，建议换景别或插入空镜`, `${label}·镜${b.no}`)
      } else sameRun = 1
    }

    // 3 悬念上限
    if ((ep.cliffhangers || []).length > 3)
      push('suspense', 'warn', `${label} 未解悬念 ${ep.cliffhangers.length} 条，超过 3 条观众记不住，合并或后移`, label)

    // 4 钩子
    const first = shots[0]
    if (!ep.hook || cn(ep.hook).length < 8) push('hook', 'error', `${label} 缺一句话钩子（≥8 字，讲清冲突）`, label)
    if (first && (Number(first.dur) || 0) > pf.hookSec + 0.5)
      push('hook', 'warn', `首镜 ${first.dur}s 超出 ${pf.hookSec}s 钩子窗口，前 3 秒必须有冲突`, `${label}·镜1`)
    const hookText = `${first?.dialogue || ''} ${first?.desc || ''} ${ep.hook || ''}`
    if (!HOOK_WORDS.some((w) => hookText.includes(w)))
      push('hook', 'warn', `前 3 秒没出现冲突/悬念词（如 却/竟然/退婚/撕/打脸/真相）`, `${label}·镜1`)

    // 5 一镜多动作 + 单镜时长 + 角色引用
    shots.forEach((sh) => {
      const acts = String(sh.action || '')
        .split(/[→；;]|然后|接着|随后|再|又/)
        .map((x) => x.trim())
        .filter(Boolean)
      if (acts.length > 2)
        push('multi', 'warn', `镜${sh.no} 含 ${acts.length} 个动作（${acts.join(' → ')}），AI 视频会崩，拆成 ${acts.length} 镜`, `${label}·镜${sh.no}`)

      const d = Number(sh.dur) || 0
      if (d > 0 && (d < pf.shotSec[0] || d > pf.shotSec[1]))
        push('density', 'info', `镜${sh.no} 时长 ${d}s 超出建议区间 ${pf.shotSec[0]}–${pf.shotSec[1]}s`, `${label}·镜${sh.no}`)

      if (sh.chars) {
        sh.chars
          .split(/[,，、/\s]+/)
          .filter(Boolean)
          .forEach((n) => {
            if (!charNames.has(n))
              push('hook', 'info', `镜${sh.no} 引用了未建档角色「${n}」，一致性锚定会缺词`, `${label}·镜${sh.no}`)
          })
      }
      if (sh.size && !SIZES.includes(sh.size))
        push('density', 'info', `镜${sh.no} 景别「${sh.size}」不在标准集内`, `${label}·镜${sh.no}`)
    })

    // 6 情绪强度
    if (shots.length) {
      const inten = shots.map((s) => Number(s.intensity) || 0)
      if (inten[0] < 3) push('emotion', 'warn', `首镜情绪强度 ${inten[0]}，开局太温，建议 ≥3`, `${label}·镜1`)
      const peak = Math.max(...inten)
      if (peak < 4) push('emotion', 'warn', `${label} 情绪峰值仅 ${peak}，没有爆点`, label)
      const last = inten[inten.length - 1]
      if (last < 4) push('emotion', 'warn', `结尾情绪强度 ${last}，钩子没顶上去，建议 ≥4`, `${label}·末镜`)
      let run = 1
      for (let i = 1; i < inten.length; i++) {
        if (inten[i] === inten[i - 1]) {
          run++
          if (run === 3) push('emotion', 'warn', `镜${shots[i].no} 起连续 3 镜情绪强度都是 ${inten[i]}，节奏平`, `${label}·镜${shots[i].no}`)
        } else run = 1
      }
    }

    // 时长总量
    const [minT, maxT] = pf.episodeSec
    if (epDur > maxT + 8) push('rate', 'warn', `${label} 总时长 ${epDur.toFixed(1)}s，超出平台上限 ${maxT}s（抖音完播率会掉）`, label)
    if (epDur > 0 && epDur < minT - 15) push('rate', 'info', `${label} 总时长 ${epDur.toFixed(1)}s，偏短（平台区间 ${minT}–${maxT}s）`, label)
  })

  // 集间首句查重
  const firsts = project.episodes.map((ep) => ({ no: ep.no, text: ep.shots?.[0]?.dialogue || ep.hook || '' }))
  for (let i = 0; i < firsts.length; i++) {
    for (let j = i + 1; j < firsts.length; j++) {
      const s = jaccard(bigrams(firsts[i].text), bigrams(firsts[j].text))
      if (s > 0.5)
        push('hook', 'warn', `第${firsts[i].no}集与第${firsts[j].no}集首句相似度 ${(s * 100).toFixed(0)}%，钩子重复`, `第${firsts[i].no}集/第${firsts[j].no}集`)
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  const infos = issues.filter((i) => i.level === 'info').length
  const score = Math.max(0, 100 - errors * 12 - warns * 4 - infos * 1)

  return { issues, errors, warns, infos, score, checkedAt: new Date().toISOString() }
}
