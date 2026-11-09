import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { PLATFORMS, STYLES, cn } from '../lib/schema'
import SkillSelect from '../components/SkillSelect.jsx'
import { Btn, Field, Area, Num, Sel, Text, Panel, Tag, Kv } from '../ui.jsx'

// 生成结果只在组件 state 里的话，切到 03/04 看一眼再回来就没了，
// 用户会以为「白生成了」——所以按剧名存一份草稿，回来还能接着写。
const STASH_KEY = 'mjw:novel:stash:v1'
const readStash = (title) => {
  try {
    const v = JSON.parse(localStorage.getItem(STASH_KEY) || 'null')
    if (!v || v.title !== (title || '')) return null
    return v
  } catch {
    return null
  }
}

export default function Novel({ go }) {
  const { notify, project, actions } = useProject()
  const _stash = readStash(project.meta?.title)
  const [text, setText] = useState('')
  const [target, setTarget] = useState('new')
  const [aiReady, setAiReady] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(_stash?.result || null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => r.json())
      .then((j) => setAiReady(Boolean(j?.config?.hasKey)))
      .catch(() => {})
  }, [])
  const [segTarget, setSegTarget] = useState(1500)
  const [segs, setSegs] = useState(_stash?.segs || null)
  const [segBusy, setSegBusy] = useState(false)
  const [segDone, setSegDone] = useState(0)
  const [seqRunning, setSeqRunning] = useState(false)

  useEffect(() => {
    try {
      if (!result && !segs) {
        localStorage.removeItem(STASH_KEY)
        return
      }
      localStorage.setItem(
        STASH_KEY,
        JSON.stringify({ title: project.meta?.title || '', at: Date.now(), result, segs })
      )
    } catch {
      /* 存不下就算了，不影响主流程 */
    }
  }, [result, segs, project.meta?.title])
  const seqRef = useRef(false)
  const fileRef = useRef(null)

  const chars = useMemo(() => cn(text).length, [text])
  const platform = project.meta.platform
  const pf = PLATFORMS[platform] || PLATFORMS.douyin
  const st = STYLES[project.meta.style] || Object.values(STYLES)[0]
  const nextNo = (project.episodes?.length || 0) + 1

  /**
   * 镜头数不再手填：按这一集的正文量推算，并被平台时长两头夹住。
   * 口径与自动分集里的 estShots 一致 —— 1 镜 ≈ 75 字正文；
   * 下限 = 每集时长下限 ÷ 6 秒（抖音/快手 ≥ 10），上限 = 每集时长上限 ÷ 3 秒（一镜少于 3 秒观众看不清）。
   */
  const shotPlan = useMemo(() => {
    const minSec = pf.episodeSec?.[0] || 60
    const maxSec = pf.episodeSec?.[1] || 90
    const minShots = Math.max(10, Math.ceil(minSec / 6))
    const maxShots = Math.min(40, Math.max(minShots + 4, Math.ceil(maxSec / 3)))
    const fitChars = maxSec * 16 // 90s × 16 字/秒 ≈ 1440 字，超过就不是一集的量
    const byChars = Math.round(chars / 75)
    const n = chars < 60 ? 0 : Math.max(minShots, Math.min(maxShots, byChars))
    return { n, minShots, maxShots, fitChars, over: chars > fitChars * 1.15 }
  }, [chars, pf])

  const lastEp = (project.episodes || []).find((e) => e.no === nextNo - 1)
  /**
   * 新建剧本只带一个空壳集（没原文、不超过 1 镜）。
   * 第一次导入就该覆盖它 —— 否则第一部片子永远是「第 1 集空着，戏从第 2 集开始」。
   */
  const blankOnly =
    (project.episodes?.length || 0) === 1 &&
    !(project.episodes[0].sourceText || '') &&
    (project.episodes[0].shots?.length || 0) <= 1
  const defaultTarget = blankOnly ? project.episodes[0].id : 'new'
  const targetVal = target || defaultTarget
  const epOptions = [
    ...(blankOnly ? [{ value: project.episodes[0].id, label: '覆盖第 1 集 · 这是新建剧本的空壳集' }] : []),
    { value: 'new', label: `接续：新建第 ${nextNo} 集${lastEp ? `（承接第 ${lastEp.no} 集）` : ''}` },
    ...(project.episodes || []).map((e) => ({ value: e.id, label: `覆盖第 ${e.no} 集 · ${e.title || '（无标题）'}` })),
  ]

  const pickFile = async (file) => {
    if (!file) return
    try {
      const raw = await file.text()
      setText(raw)
      notify?.(`已读入 ${file.name}（${cn(raw).length} 字）`)
    } catch {
      setError('文件读取失败，换 .txt 试试')
    }
  }

  /** 取某一集的上一集，用来做「承接」上下文 */
  const prevOf = (no) => {
    const p = (project.episodes || []).find((e) => e.no === no - 1)
    if (!p) return null
    return {
      no: p.no,
      title: p.title,
      hook: p.hook,
      summary: p.summary,
      cliffhangers: p.cliffhangers || [],
    }
  }

  const genBody = (text2, shots, prev) =>
    JSON.stringify({
      text: text2,
      title: project.meta.title,
      platform,
      style: project.meta.style,
      episodes: 1,
      shotsPerEp: shots,
      skillIds: project.meta?.skillNovel || [],
      prev,
      platformName: pf.name,
      styleName: st.name,
      episodeSec: `${pf.episodeSec[0]}–${pf.episodeSec[1]}`,
    })

  const generate = async () => {
    setError('')
    setResult(null)
    if (chars < 30) {
      setError('正文太短，至少粘几百字进来')
      return
    }
    setBusy(true)
    try {
      const targetEp = target === 'new' ? null : project.episodes.find((e) => e.id === target)
      const prev = prevOf(targetEp ? targetEp.no : nextNo)
      const r = await fetch('/api/novel/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: genBody(text, shotPlan.n, prev),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '生成失败')
      setResult(j)
      adopt(j)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const adopt = (res = result) => {
    const ep = res?.project?.episodes?.[0]
    if (!ep) return
    const replacing = target !== 'new'
    const oldNo = replacing ? project.episodes.find((e) => e.id === target)?.no : nextNo
    actions.importEpisode({ ...ep, text: ep.text || text }, { targetId: replacing ? target : '' })
    flushNow()
    notify?.(`${replacing ? `第 ${oldNo} 集已替换` : `已写入第 ${nextNo} 集`} · ${ep.shots?.length || 0} 镜`)
    go('shots')
  }

  /** 按爆点把整段正文切成多集（纯本地，秒出，不调模型） */
  const doSplit = async () => {
    setError('')
    if (chars < 300) {
      setError(`正文太少（${chars} 字），至少 300 字再分集`)
      return
    }
    setSegBusy(true)
    try {
      const r = await fetch('/api/novel/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          targetChars: segTarget,
          platformName: pf.name,
          styleName: st.name,
          episodeSec: `${pf.episodeSec[0]}–${pf.episodeSec[1]}`,
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '分集失败')
      setSegs({ episodes: j.segments, stats: j.stats })
      setSegDone(0)
      notify?.(`AI 已分 ${j.stats.eps} 集 · ${j.stats.chars} 字 · ${j.stats.boomCount} 处爆点`)
    } catch (e) {
      setSegs(null)
      setError(String(e?.message || e))
    } finally {
      setSegBusy(false)
    }
  }

  /** 逐集生成镜头（串行；模型慢，串着发免得并发打爆接口） */
  const genAll = async () => {
    if (!segs?.episodes?.length) return
    setSegBusy(true)
    setSegDone(0)
    const next = segs.episodes.map((s) => ({ ...s, gen: null, genErr: '' }))
    for (let i = 0; i < next.length; i++) {
      const s = next[i]
      try {
        const r = await fetch('/api/novel/outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: s.text,
            title: s.title || project.meta.title,
            platform,
            style: project.meta.style,
            episodes: 1,
            shotsPerEp: segShots(s),
            platformName: pf.name,
            styleName: st.name,
            episodeSec: `${pf.episodeSec[0]}–${pf.episodeSec[1]}`,
          }),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error || '生成失败')
        const ep = j.project?.episodes?.[0]
        next[i] = { ...s, gen: { engine: j.engine, ep, chs: j.project?.characters || [], chars: j.stats?.chars || s.chars } }
      } catch (e) {
        next[i] = { ...s, genErr: String(e?.message || e) }
      }
      setSegs({ ...segs, episodes: [...next] })
      setSegDone(i + 1)
    }
    setSegBusy(false)
    notify?.(`${next.filter((x) => x.gen).length} / ${next.length} 集已出镜头`)
  }

  /** 每集按它的实际字数推镜头数（1 镜 ≈ 75 字正文），并夹在 8–40 */
  const segShots = (s) => Math.max(8, Math.min(40, Math.round((s.chars || 1500) / 75)))

  const readySegs = (segs?.episodes || []).filter((s) => s.gen?.ep)

  /**
   * 按顺接续：生成一集 → 立刻写盘 → 拿这一集当「上一集」去生成下一集。
   * 不是「全部生成完再一起写」——中途出错或用户喊停时，已经写好的集不会丢。
   */
  const genSequential = async () => {
    if (!segs?.episodes?.length) return
    seqRef.current = true
    setSeqRunning(true)
    let cursor = nextNo
    let prev = prevOf(nextNo)
    const list = segs.episodes.map((s) => ({ ...s, written: false }))
    setSegs({ ...segs, episodes: [...list] })
    for (let i = 0; i < list.length; i++) {
      if (!seqRef.current) break
      const s = list[i]
      setSegDone(i + 1)
      try {
        const r = await fetch('/api/novel/outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: genBody(s.text, segShots(s), prev),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error || '生成失败')
        const ep = j.project?.episodes?.[0]
        if (!ep) throw new Error('模型没有返回这一集')
        actions.importEpisodes([{ ...ep, text: ep.text || s.text, characters: j.project?.characters || [] }])
        await flushNow()
        list[i] = { ...s, gen: { engine: j.engine, ep, chs: j.project?.characters || [] }, genErr: '', written: true, writtenNo: cursor }
        setSegs({ ...segs, episodes: [...list] })
        prev = { no: cursor, title: ep.title, hook: ep.hook, summary: ep.summary, cliffhangers: ep.cliffhangers || [] }
        notify?.(`第 ${cursor} 集已接续写入（${ep.shots?.length || 0} 镜）`)
        cursor += 1
      } catch (e) {
        list[i] = { ...s, genErr: String(e?.message || e) }
        setSegs({ ...segs, episodes: [...list] })
        // 出错就停：继续往下写会变成缺集，集号对不上
        break
      }
    }
    seqRef.current = false
    setSeqRunning(false)
    setSegDone(0)
  }

  /** mutate 是 setProject 的 updater：调用后要等 React 跑完一次更新，pendingRef 才有值。
   *  用 setTimeout 而不是 requestAnimationFrame —— headless / 后台标签页的 rAF 会被节流甚至不触发。 */
  const flushNow = async () => {
    const tick = () => new Promise((r) => setTimeout(r, 40))
    await tick()
    await actions.flushSave?.()
    await tick()
    await actions.flushSave?.()
    // 兜底：flushSave 依赖 pendingRef 的时序，接续场景下可能已错过；直接按 localStorage 快照（mutate 里同步写的）落盘
    try {
      let id = localStorage.getItem('mjw:active:v1') || ''
      try {
        const j = JSON.parse(id)
        if (typeof j === 'string') id = j
      } catch {
        /* 存的是纯字符串 */
      }
      const raw = id ? localStorage.getItem(`mjw:script:${id}`) : null
      if (id && raw) {
        await fetch('/api/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, project: JSON.parse(raw) }),
        })
      }
    } catch {
      /* 网络失败就等 30 秒心跳 */
    }
  }

  const stopSequential = () => {
    seqRef.current = false
    notify?.('已停止接续，已写入的集保留')
  }

  const adoptAll = () => {
    const list = readySegs
    if (!list.length) {
      notify?.('还没有生成完的集——先点「生成这 N 集的镜头」')
      return
    }
    const shellId = blankOnly ? project.episodes[0].id : ''
    const from = blankOnly ? 1 : nextNo
    const to = from + list.length - 1
    if (!confirm(`把 ${list.length} 集写进第 ${from}–${to} 集？${blankOnly ? '现有的空壳第 1 集会被覆盖。' : `现有 ${project.episodes.length} 集不动，新集追加在后面。`}`)) return
    /* 逐集写入，不用「先删空壳集再批量 push」：那条路上只要 readySegs 为空，
       就会把唯一一集删掉，剧本被兜底成 1 集 1 镜的空壳，看着像「写入没生效」。
       现在第一集走 targetId 覆盖（集号保持 1），其余由 importEpisode 追加。 */
    list.forEach((s, i) => {
      const ep = s.gen?.ep
      if (!ep) return
      actions.importEpisode(
        { ...ep, text: s.text || ep.text || '', characters: s.gen.chs || [] },
        { targetId: i === 0 && shellId ? shellId : '' },
      )
    })
    flushNow()
    notify?.(`已写入第 ${from}–${to} 集`)
    go('shots')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14, alignItems: 'start' }}>
      <Panel
        title="正文"
        extra={
          <span className="dim" style={{ fontSize: 11 }}>
            {chars > 0 ? `${chars} 字` : ''}
          </span>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Btn size="sm" icon="folder" onClick={() => fileRef.current?.click()}>
            导入 .txt
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => { setText(''); setResult(null); setSegs(null); setError('') }}>
            清空
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.text,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && pickFile(e.target.files[0])}
          />
        </div>
        <Area
          rows={20}
          value={text}
          onChange={setText}
          placeholder={'粘贴这一集的正文。'}
        />
      </Panel>

      <div>
        {!aiReady && (
          <div className="ai-gate">
            未接入 AI：分集、分镜、提示词全部由模型生成。先在「设置 → AI 接入」填 baseUrl / 模型名 / key。
          </div>
        )}
        <Panel
          title="AI 分集"
          extra={segs ? <Tag level="accent">{segs.stats.eps} 集</Tag> : null}
        >
          <Field label="每集目标字数（给模型的范围，±40%）">
            <Num value={segTarget} onChange={setSegTarget} min={600} max={5000} step={100} />
          </Field>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.8, margin: '2px 0 10px' }}>
            模型只决定切点，每集正文逐字取自原文，不改写一个字。
          </div>
          <Btn icon="scissors" onClick={doSplit} disabled={segBusy || chars < 300 || !aiReady} style={{ width: '100%' }}>
            {segBusy ? '模型正在分集…' : segs ? '重新分集' : '让 AI 按剧情分集'}
          </Btn>

          {segs && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
                <Tag>{segs.stats.chars} 字</Tag>
                <Tag>{segs.stats.sents} 句</Tag>
                <Tag level="warn">{segs.stats.boomCount} 处爆点</Tag>
                <Tag>平均 {segs.stats.avgChars} 字 / 集</Tag>
              </div>
              <div className="seg-list">
                {segs.episodes.map((s) => (
                  <div key={s.id} className={`seg-card ${s.level === 'C' ? 'is-flat' : ''}`}>
                    <div className="seg-head">
                      <b>第 {s.no} 集</b>
                      <Tag level={s.levelTone}>{s.level}</Tag>
                      <span className="dim">{s.chars} 字 · 约 {segShots(s)} 镜 · {s.booms} 爆点 · 密度 {s.density}</span>
                      {s.written && <Tag level="ok">已写入第 {s.writtenNo || s.no} 集</Tag>}
                      {!s.written && s.gen && <Tag level="ok">{s.gen.ep?.shots?.length || 0} 镜已出</Tag>}
                      {s.genErr && <Tag level="err">失败</Tag>}
                    </div>
                    <div className="seg-title">{s.title}</div>
                    <div className="seg-hook">钩子：{s.hook}</div>
                    {s.genErr && <div className="seg-err">{s.genErr}</div>}
                  </div>
                ))}
              </div>
              {segBusy && (
                <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
                  正在生成第 {Math.min(segDone + 1, segs.episodes.length)} / {segs.episodes.length} 集…
                </div>
              )}
              {seqRunning && (
                <div className="dim" style={{ fontSize: 11, marginTop: 8, color: 'var(--vermilion-2)' }}>
                  正在按顺接续：第 {Math.min(segDone, segs.episodes.length)} / {segs.episodes.length} 集已写入，每写完一集立刻落盘…
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Btn icon="spark" onClick={genAll} disabled={segBusy || seqRunning}>
                  {readySegs.length ? '重新生成全部镜头' : `生成这 ${segs.episodes.length} 集的镜头`}
                </Btn>
                <Btn
                  icon={seqRunning ? 'x' : 'arrow'}
                  variant={seqRunning ? 'ghost' : 'primary'}
                  onClick={seqRunning ? stopSequential : genSequential}
                  disabled={segBusy || !!readySegs.filter((s) => s.written).length}
                  title="生成一集就写一集，下一集拿上一集的钩子当承接；中途停止已写入的集保留"
                >
                  {seqRunning ? '停止接续' : `按顺接续（第 ${nextNo} 集起，写一集续一集）`}
                </Btn>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" icon="check" onClick={adoptAll} disabled={segBusy || seqRunning}>
                  一次写入 {readySegs.length || 0} 集（第 {blankOnly ? 1 : nextNo}–
                  {(blankOnly ? 1 : nextNo) + Math.max(0, readySegs.length - 1)} 集）
                </Btn>
              </div>
            </>
          )}
          {error && (
            <div className="dim" style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 8, lineHeight: 1.7 }}>
              {error}
            </div>
          )}
        </Panel>

        <Panel title="单集生成" style={{ marginTop: 14 }}>
          <Field label="写进哪一集">
            <Sel value={targetVal} onChange={setTarget} options={epOptions} />
          </Field>
          <div className="row">
            <Field
              label="镜头数（自动）"
              style={{ maxWidth: 112, flex: 'none' }}
            >
              <div className="ro-shot">
                <b>{shotPlan.n || '—'}</b>
                <span>镜</span>
              </div>
            </Field>
          </div>
          <div className="gen-line">
            <span>
              平台 {pf.name} · {pf.ratio} · {pf.episodeSec[0]}–{pf.episodeSec[1]}s / 集 · 语速 {pf.voiceRate[0]}–{pf.voiceRate[1]} 字/秒
              ｜画风 {st.name}（跟项目设置走）
            </span>
            <SkillSelect
              label=""
              value={project.meta?.skillNovel || []}
              onChange={(v) => actions.setMeta({ skillNovel: v })}
            />
          </div>
          {shotPlan.over && (
            <div style={{ fontSize: 11, color: 'var(--warn)', lineHeight: 1.8, marginBottom: 10 }}>
              这段 {chars} 字够 {Math.max(2, Math.round(chars / shotPlan.fitChars))} 集的量，单集只出到 {shotPlan.maxShots} 镜。
              先用右边「自动分集」切开，再用「按顺接续」一集一集写。
            </div>
          )}
          <Btn variant="primary" icon="spark" onClick={generate} disabled={busy || !aiReady} style={{ width: '100%' }}>
            {busy ? '生成中…（模型可能要几十秒）' : '生成这一集的镜头'}
          </Btn>
          {error && (
            <div className="dim" style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 8, lineHeight: 1.7 }}>
              {error}
            </div>
          )}
        </Panel>

      </div>
    </div>
  )
}
