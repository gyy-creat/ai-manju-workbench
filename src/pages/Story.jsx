import React, { useEffect, useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { platform, beatIntensity, beatBaseline } from '../lib/schema'
import { splitSentences, autoAnchors, anchorTypeOf, ANCHOR_TYPES } from '../lib/splitter.js'
import { Btn, Field, Text, Area, Sel, Panel, Tag, Kv } from '../ui.jsx'

/** 锚点类型 → Tag 色档 */
const ANCHOR_TONE = {
  钩子: 'accent',
  冲突: 'warn',
  反转: 'accent',
  打脸: 'ok',
  爽点: 'ok',
  悬念: 'accent',
  情绪: 'info',
}

const BEAT_TYPES = [
  '开局钩子',
  '身份揭穿',
  '冲突升级',
  '压迫升级',
  '第一次打脸',
  '反转铺垫',
  '反转',
  '高潮打脸',
  '爽点释放',
  '情绪爆发',
  '新悬念',
  '收尾钩子',
]

/** 文案若有台账里的老拍型，把它补进选项，免得 Select 回落到第一项 */
const beatOptions = (t) => (t && !BEAT_TYPES.includes(t) ? [t, ...BEAT_TYPES] : BEAT_TYPES)


/** 节拍强度曲线：实际节拍 vs 教科书基线，一眼看哪儿塌、哪儿爆 */
function BeatCurve({ beats }) {
  const n = beats.length
  if (!n) return null
  const base = beatBaseline(n)
  const act = beats.map(beatIntensity)
  const diffs = act.map((v, i) => v - (base[i] || 0))
  const W = Math.max(340, n * 72)
  const H = 108
  const padX = 30
  const padY = 18
  const x = (i) => (n === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (n - 1))
  const y = (v) => H - padY - ((v - 1) / 4) * (H - padY * 2)
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lowIdx = diffs.reduce((m, d, i) => (d < diffs[m] ? i : m), 0)
  const highIdx = diffs.reduce((m, d, i) => (d > diffs[m] ? i : m), 0)
  const low = diffs[lowIdx]
  const high = diffs[highIdx]
  return (
    <div className="beat-curve">
      <div className="beat-curve-legend">
        <span><i />本集节拍</span>
        <span><i className="dash" />教科书基线</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="节拍强度对比曲线">
        {[2, 3, 4, 5].map((v) => (
          <line key={v} x1={padX - 10} x2={W - padX + 10} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
        ))}
        {[1, 3, 5].map((v) => (
          <text key={v} x={2} y={y(v) + 3} fontSize="9" fill="var(--paper-4)">{v}</text>
        ))}
        <polygon
          points={`${act.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(n - 1)},${H - padY} ${x(0)},${H - padY}`}
          fill="var(--vermilion)"
          opacity=".09"
        />
        <path d={line(base)} fill="none" stroke="var(--paper-4)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={line(act)} fill="none" stroke="var(--vermilion)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {act.map((v, i) => (
          <g key={i}>
            {diffs[i] < 0 ? <circle cx={x(i)} cy={y(v)} r="7.5" fill="var(--warn)" opacity=".14" /> : null}
            <circle cx={x(i)} cy={y(v)} r="3.4" fill={diffs[i] < 0 ? 'var(--warn)' : 'var(--vermilion)'} />
            <text x={x(i)} y={H - 3} fontSize="9.5" textAnchor="middle" fill="var(--paper-4)">{i + 1}</text>
          </g>
        ))}
      </svg>
      <div className="beat-verdict">
        {low <= -2 ? (
          <>第 <b>{lowIdx + 1}</b> 拍「{beats[lowIdx].t}」比基线低 <b>{Math.abs(low)}</b> 档 —— 明显塌点，这里必须补一次冲突或反转。</>
        ) : low === -1 ? (
          <>第 <b>{lowIdx + 1}</b> 拍「{beats[lowIdx].t}」低于基线 1 档 —— 还能看，加一句反转台词或缩短这一拍更稳。</>
        ) : (
          <>没有低于基线的拍，中段没有泄力。</>
        )}{' '}
        {high >= 2 ? (
          <>第 <b>{highIdx + 1}</b> 拍「{beats[highIdx].t}」高出基线 <b>{high}</b> 档 —— 爆点够。</>
        ) : high === 1 ? (
          <>第 <b>{highIdx + 1}</b> 拍略高于基线 1 档。</>
        ) : null}
        {high - low >= 2 ? <> 峰谷落差 <b>{high - low}</b> 档{high - low >= 3 && low > -2 ? '，起伏够抓人' : low <= -2 ? '，落差够但低的那头先修' : ''}。</> : null}
      </div>
    </div>
  )
}

export default function Story({ go }) {
  const { project, actions, notify } = useProject()
  const pf = platform(project)
  const [sel, setSel] = useState(project.episodes[0]?.id || null)
  const ep = project.episodes.find((e) => e.id === sel) || project.episodes[0]

  const upd = (patch) => ep && actions.updateEpisode(ep.id, patch)
  const dur = ep ? ep.shots.reduce((n, s) => n + (Number(s.dur) || 0), 0) : 0
  const peak = ep ? Math.max(0, ...ep.shots.map((s) => Number(s.intensity) || 0)) : 0
  const lines = ep ? ep.shots.filter((s) => s.dialogue).length : 0

  // ── 原文与锚点 ──
  const src = ep?.sourceText || ''
  const anchors = ep?.anchors || []
  const srcSents = useMemo(() => splitSentences(src), [src])
  const srcChars = src.replace(/\s/g, '').length
  const [srcDraft, setSrcDraft] = useState(src)
  useEffect(() => { setSrcDraft(src) }, [ep?.id, src])

  const applySource = () => {
    if (!ep || !srcDraft.trim()) return
    const sents = splitSentences(srcDraft)
    actions.setEpisodeSource(ep.id, srcDraft)
    const next = autoAnchors(sents)
    actions.setEpisodeAnchors(ep.id, next)
    notify?.(`原文已存入（${sents.length} 句），自动标了 ${next.length} 个锚点`)
  }

  /** 这句话落到第几镜：拿句子前 12 字去 desc / dialogue 里找 */
  const shotOf = (sentence) => {
    if (!ep) return 0
    const key = String(sentence || '').replace(/[「」“”『』，。！？、；：\s]/g, '').slice(0, 12)
    if (key.length < 4) return 0
    const hit = ep.shots.find((s) => {
      const hay = `${s.desc || ''}${s.dialogue || ''}${s.action || ''}`.replace(/[「」“”『』，。！？、；：\s]/g, '')
      return hay.includes(key)
    })
    return hit ? hit.no : 0
  }

  return (
    <div className="cols">
      <div className="list-panel">
        <div className="list-head">
          <span style={{ flex: 1 }}>分集 · {project.episodes.length}</span>
          <Btn size="sm" variant="ghost" onClick={() => { actions.addEpisode(); setSel(null) }}>＋</Btn>
        </div>
        {project.episodes.map((e) => (
          <div key={e.id} className={`list-item ${ep?.id === e.id ? 'active' : ''}`} style={{ paddingRight: 26 }} onClick={() => setSel(e.id)}>
            <span className="n">{String(e.no).padStart(2, '0')}</span>
            <span className="t">{e.title}</span>
            <span className="dim" style={{ fontSize: 10 }}>{e.shots.length}镜</span>
            <button
              type="button"
              className="li-del"
              title="删掉这一集"
              onClick={(ev) => {
                ev.stopPropagation()
                if (project.episodes.length <= 1) {
                  notify?.('至少留一集；整部剧本不要了请回剧本库删')
                  return
                }
                if (!confirm(`删掉第 ${e.no} 集「${e.title || '无标题'}」？这一集的 ${e.shots.length} 个镜头会一起删掉，不可恢复。`)) return
                const rest = project.episodes.filter((x) => x.id !== e.id)
                if (ep?.id === e.id) setSel(rest[0]?.id || null)
                actions.removeEpisode(e.id)
                notify?.(`已删掉第 ${e.no} 集`)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {!project.episodes.length && <div className="empty">还没有分集</div>}
      </div>

      <div>
        {ep ? (
          <>
            <Panel title={`第 ${ep.no} 集 · 集纲`}>
              <div className="row">
                <Field label="集标题">
                  <Text value={ep.title} onChange={(v) => upd({ title: v })} />
                </Field>
                <Field label="钩子类型">
                  <Sel value={ep.hookType} onChange={(v) => upd({ hookType: v })} options={['冲突开场', '身份反转', '误会开场', '结果前置', '悬念倒叙']} />
                </Field>
              </div>
              <Field label={`前 ${pf.hookSec} 秒钩子（一句话，必须带冲突词）`}>
                <Text value={ep.hook} onChange={(v) => upd({ hook: v })} placeholder="例：她把离婚协议拍在桌上，他却笑着按住了她的手腕" />
              </Field>
              <Field label="本集梗概（3 句话讲完）">
                <Area rows={3} value={ep.summary} onChange={(v) => upd({ summary: v })} />
              </Field>
            </Panel>

            <Panel
              title="本集原文 · 锚点"
              style={{ marginTop: 12 }}
              extra={
                <span className="dim" style={{ fontSize: 10 }}>
                  {srcSents.length ? `${srcChars} 字 · ${srcSents.length} 句 · 锚点 ${anchors.length} 个` : '还没挂原文'}
                </span>
              }
            >
              {!srcSents.length ? (
                <>
                  <Field label="这一集的原文">
                    <Area rows={6} value={srcDraft} onChange={setSrcDraft} placeholder="粘贴这一集的原文…" />
                  </Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn size="sm" variant="primary" onClick={applySource} disabled={!srcDraft.trim()}>
                      存入并自动标锚点
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => go('novel')} title="去「导入本集文本」页挑这一集的正文">
                      去导入本集文本 →
                    </Btn>
                  </div>
                </>
              ) : (
                <>
                  <div className="src-bar">
                    <Btn
                      size="sm"
                      onClick={() => {
                        const next = autoAnchors(srcSents)
                        actions.setEpisodeAnchors(ep.id, next)
                        notify?.(`识别出 ${next.length} 个锚点`)
                      }}
                    >
                      重新识别锚点
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setSrcDraft(src); }}>编辑原文</Btn>
                    <Btn
                      size="sm"
                      variant="ghost danger"
                      onClick={() => {
                        if (!confirm('清空这一集的原文与全部锚点？原文可再贴，锚点要重标。')) return
                        actions.setEpisodeSource(ep.id, '')
                        setSrcDraft('')
                      }}
                    >
                      清空
                    </Btn>
                  </div>
                  {srcDraft !== src && (
                    <div style={{ marginBottom: 8 }}>
                      <Field label="改完记得存">
                        <Area rows={6} value={srcDraft} onChange={setSrcDraft} />
                      </Field>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn size="sm" variant="primary" onClick={applySource}>保存原文</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setSrcDraft(src)}>取消</Btn>
                      </div>
                    </div>
                  )}
                  <div className="src-list">
                    {srcSents.map((s, i) => {
                      const a = anchors.find((x) => x.sid === i)
                      const shot = shotOf(s)
                      return (
                        <div
                          key={i}
                          className={`src-line${a ? ' is-anchor' : ''}${shot ? ' has-shot' : ''}`}
                          onClick={() => actions.toggleAnchor(ep.id, i, anchorTypeOf(s, i, srcSents.length) || '冲突')}
                          title={a ? `锚点：${a.type}（再点取消）` : '点一下标成锚点'}
                        >
                          <span className="sid">{i + 1}</span>
                          <span className="stxt">{s}</span>
                          {a && <Tag level={ANCHOR_TONE[a.type] || 'accent'}>{a.type}</Tag>}
                          {shot > 0 && <span className="sshot">镜 {shot}</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </Panel>

            <Panel title="节拍表" style={{ marginTop: 12 }}>
              <BeatCurve beats={ep.beats || []} />
              {(ep.beats || []).map((b, i) => (
                <div key={b.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 66 }}>
                    <Sel
                      className="beat-int"
                      value={String(beatIntensity(b))}
                      onChange={(v) => upd({ beats: ep.beats.map((x) => (x.id === b.id ? { ...x, intensity: Number(v) } : x)) })}
                      options={['1', '2', '3', '4', '5']}
                      title="强度 1–5"
                    />
                  </div>
                  <div style={{ width: 136 }}>
                    <Sel
                      value={b.t}
                      onChange={(v) => {
                        const next = ep.beats.map((x) => (x.id === b.id ? { ...x, t: v } : x))
                        upd({ beats: next })
                      }}
                      options={beatOptions(b.t)}
                    />
                  </div>
                  <Text
                    value={b.text}
                    onChange={(v) => upd({ beats: ep.beats.map((x) => (x.id === b.id ? { ...x, text: v } : x)) })}
                    placeholder="这一拍发生什么（谁对谁做了什么，结果是什么）"
                  />
                  <Btn size="sm" variant="ghost danger" onClick={() => upd({ beats: ep.beats.filter((x) => x.id !== b.id) })}>×</Btn>
                </div>
              ))}
              <Btn
                size="sm"
                onClick={() =>
                  upd({
                    beats: [
                      ...(ep.beats || []),
                      { id: `bt_${Math.random().toString(36).slice(2, 7)}`, t: '冲突升级', text: '', intensity: 3 },
                    ],
                  })
                }
              >
                ＋ 加一拍
              </Btn>
            </Panel>

            <Panel title="未解悬念" style={{ marginTop: 12 }}>
              <Field label="未解悬念">
                <Area
                  rows={2}
                  value={(ep.cliffhangers || []).join('\n')}
                  onChange={(v) => upd({ cliffhangers: v.split('\n').map((x) => x.trim()).filter(Boolean) })}
                  placeholder="她到底记不记得那一晚\n那个电话是谁打的"
                />
              </Field>
            </Panel>
          </>
        ) : (
          <div className="empty">左栏新建分集</div>
        )}
      </div>

      <div>
        <Panel title="本集体检">
          <Kv k="镜数" v={`${ep?.shots.length || 0} 镜`} />
          <Kv k="总时长" v={`${dur.toFixed(1)}s / 平台 ${pf.episodeSec[0]}–${pf.episodeSec[1]}s`} />
          <Kv k="台词镜" v={`${lines} 条`} />
          <Kv k="情绪峰值" v={`${peak} / 5`} />
          <Kv k="悬念" v={`${ep?.cliffhangers?.length || 0} 条`} />
          <div className="hr" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tag level={dur >= pf.episodeSec[0] && dur <= pf.episodeSec[1] ? 'ok' : 'warn'}>
              {dur >= pf.episodeSec[0] && dur <= pf.episodeSec[1] ? '时长合规' : '时长待调'}
            </Tag>
            <Tag level={peak >= 4 ? 'ok' : 'warn'}>{peak >= 4 ? '有爆点' : '缺爆点'}</Tag>
            <Tag level={ep?.hook ? 'ok' : 'err'}>{ep?.hook ? '有钩子' : '缺钩子'}</Tag>
          </div>
          {ep && (
            <Btn size="sm" variant="primary" style={{ marginTop: 12 }} onClick={() => go('shots')}>
              去写这一集的分镜 →
            </Btn>
          )}
        </Panel>
      </div>
    </div>
  )
}
