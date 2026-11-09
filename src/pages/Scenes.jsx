import React, { useEffect, useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { SCENE_FIELDS, SCENE_TIMES, SCENE_WEATHERS, SCENE_TONES, styleOf } from '../lib/schema'
import { describeScene, scenePromptLine } from '../lib/scenes.js'
import { Btn, Field, Text, Area, Sel, Panel, Tag, Empty, Modal } from '../ui.jsx'

/** 每个字段的默认选项（AI 没给定制问句时用它，保证 open 里的每一项都能被点掉） */
const OPTIONS = {
  time: SCENE_TIMES,
  weather: SCENE_WEATHERS,
  tone: SCENE_TONES,
  light: ['冷白荧光灯', '暖黄室内灯', '烛火 + 顶灯', '月光 + 环境光', '霓虹 + 射灯', '自然散射日光'],
  place: ['卧室', '客厅', '办公室', '楼道', '街道', '车内'],
  ambience: ['安静得能听见呼吸', '人声嘈杂', '空旷回声', '湿冷压抑'],
  props: [],
}

const FIELD_LABEL = Object.fromEntries(SCENE_FIELDS.map((f) => [f.k, f.label]))
const FROM_LABEL = { ai: '模型推测', local: '本地推测', manual: '手动录入' }

/** 一集的原文：优先用导入的那段，没有就用分镜的场景+描述拼 */
function sourceOf(ep) {
  const t = String(ep?.sourceText || '').trim()
  if (t) return t
  return (ep?.shots || [])
    .map((s) => [s.scene, s.desc].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('。')
}

export default function Scenes() {
  const { notify, project, actions } = useProject()
  const [epPick, setEpPick] = useState('all')
  const [aiReady, setAiReady] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState(null) // { engine, ms, warning, asked }
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [custom, setCustom] = useState({}) // qkey -> 自定义输入
  const [answered, setAnswered] = useState({}) // qkey -> true（点过就不再列）

  const scenes = Array.isArray(project.scenes) ? project.scenes : []
  const st = styleOf(project)

  const epOptions = useMemo(
    () => [{ value: 'all', label: `全部 ${project.episodes.length} 集` }].concat(
      project.episodes.map((e) => ({ value: e.id, label: `第 ${e.no} 集 · ${e.title || '未命名'}` }))
    ),
    [project.episodes]
  )

  const pickedEps = epPick === 'all' ? project.episodes : project.episodes.filter((e) => e.id === epPick)
  const text = pickedEps.map(sourceOf).filter(Boolean).join('\n\n')
  const chars = text.replace(/\s/g, '').length

  // 待确认：两路合并 ——
  // ① 模型/本地推测明确抛出的问题（模型自己也没把握，哪怕它先填了个值，也要让人点一下）；
  // ② 场景卡上 open 里还空着的字段（落过盘，刷新还在，回答过就消失）。
  const pending = useMemo(() => {
    const byName = new Map(scenes.map((s) => [s.name, s]))
    const rows = []
    const seen = new Set()
    const push = (sc, field, q) => {
      const key = `${sc.name}::${field}`
      if (seen.has(key) || answered[key]) return
      seen.add(key)
      const cur = field === 'props' ? (sc.props || []).join('、') : String(sc[field] || '').trim()
      rows.push({
        key,
        sceneId: sc.id,
        sceneName: sc.name,
        field,
        cur,
        q: q?.q || `「${sc.name}」的${FIELD_LABEL[field] || field}还没定，用哪个？`,
        why: q?.why || '',
        options: (q?.options?.length ? q.options : OPTIONS[field] || []).slice(0, 5),
      })
    }
    ;(last?.asked || []).forEach((q) => {
      const sc = byName.get(q.sceneName) || scenes.find((s) => s.id === q.sceneId)
      if (sc) push(sc, q.field, q)
    })
    scenes.forEach((sc) => {
      ;(sc.open || []).forEach((field) => {
        const filled = field === 'props' ? (sc.props || []).length : String(sc[field] || '').trim()
        if (filled) return
        push(sc, field, null)
      })
    })
    return rows
  }, [scenes, last, answered])

  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => r.json())
      .then((j) => setAiReady(Boolean(j?.config?.hasKey)))
      .catch(() => {})
  }, [])

  const derive = async () => {
    if (busy) return
    if (chars < 20) {
      setErr('原文太少：先去「导入本集文本」贴一段，或在 02 页把这一集的原文写上。也可以直接用分镜里的场景描述兜底。')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/scenes/derive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          styleName: st?.name || '',
          characters: project.characters.map((c) => c.name).filter(Boolean),
          existing: scenes.map((s) => ({ name: s.name })),
          epIds: pickedEps.map((e) => e.id),
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '推测失败')
      actions.mergeScenes(j.scenes || [])
      setLast({ engine: j.engine, ms: j.ms, warning: j.warning, asked: j.questions || [] })
      const qn = (j.questions || []).length
      notify(`推测出 ${(j.scenes || []).length} 个场景` + (qn ? ` · ${qn} 条要确认` : ' · 没有疑问项'))
    } catch (e) {
      setErr(String(e?.message || e).slice(0, 300))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (sc) => {
    setEditId(sc.id)
    setDraft({ ...sc, propsText: (sc.props || []).join('、') })
  }

  const saveEdit = () => {
    if (!draft) return
    const props = String(draft.propsText || '')
      .split(/[、,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10)
    const patch = {
      name: String(draft.name || '').trim() || '未命名场景',
      place: draft.place || '',
      time: draft.time || '',
      weather: draft.weather || '',
      light: draft.light || '',
      tone: draft.tone || '',
      ambience: draft.ambience || '',
      props,
      from: 'manual',
    }
    // 手填过的字段都算已确认
    const still = (draft.open || []).filter((f) => (f === 'props' ? !props.length : !String(patch[f] || '').trim()))
    patch.open = still
    patch.confidence = still.length ? draft.confidence : 'high'
    patch.desc = describeScene({ ...draft, ...patch })
    actions.updateScene(editId, patch)
    setEditId(null)
    setDraft(null)
    notify('场景已保存')
  }

  const answer = (row, value) => {
    actions.answerScene(row.sceneId, row.field, value)
    setAnswered((m) => ({ ...m, [row.key]: true }))
    setCustom((m) => ({ ...m, [row.key]: '' }))
    notify(`${row.sceneName} · ${FIELD_LABEL[row.field] || row.field} → ${value}`)
  }

  return (
    <div className="grid-main">
      <div>
        <Panel
          title="从原文推测场景"
          extra={<span className="dim" style={{ fontSize: 11.5 }}>{chars ? `原文 ${chars} 字` : '还没原文'}</span>}
        >
          <div className="row">
            <Field label="取自" hint="一整本还是只看某一集">
              <Sel value={epPick} onChange={setEpPick} options={epOptions} />
            </Field>
          </div>
          <div className="gen-line">
            <span>
              画风 {st?.name || '国漫厚涂'}（跟项目设置走）｜ 已有 {scenes.length} 个场景
              {pending.length ? ` · ${pending.length} 项待确认` : ''}
            </span>
          </div>
          {!aiReady && (
            <div className="ai-gate">
              未接入 AI：场景推测只由模型完成。先在「设置 → AI 接入」填 baseUrl / 模型名 / key。
            </div>
          )}
          <Btn variant="primary" icon="spark" onClick={derive} disabled={busy || !aiReady} style={{ width: '100%' }}>
            {busy ? '推测中…（模型可能要十几秒）' : '从原文推测场景'}
          </Btn>
          {err && (
            <div className="dim" style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 8, lineHeight: 1.7 }}>
              {err}
            </div>
          )}
          {last && (
            <div className="dim" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.8 }}>
              引擎 {last.engine === 'llm' ? '模型' : '模型（未标注）'}
              {last.ms ? ` · ${(last.ms / 1000).toFixed(1)}s` : ''}
              {last.warning ? ` · ${last.warning}` : ''}
              {last.asked?.length ? ` · 提了 ${last.asked.length} 个问题` : ''}
            </div>
          )}
          <div className="dim" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.9 }}>
            原文没写清的环境不会硬猜 —— 缺的字段会进右侧「要确认」，点一下就补上，场景名与描述会跟着重算。
          </div>
        </Panel>

        <Panel
          title={`场景卡（${scenes.length}）`}
          style={{ marginTop: 14 }}
          extra={
            <Btn size="sm" icon="plus" onClick={() => { const id = actions.addScene({ name: '新场景' }); setEditId(id); setTimeout(() => {
              const sc = (project.scenes || []).find((x) => x.id === id)
              setDraft({ ...(sc || { name: '新场景' }), propsText: '' })
            }, 0) }}>
              补一条
            </Btn>
          }
        >
          {!scenes.length ? (
            <Empty icon="image">还没有场景。先在上面点「从原文推测场景」。</Empty>
          ) : (
            <div className="sc-grid">
              {scenes.map((sc) => {
                const opens = (sc.open || []).filter((f) =>
                  f === 'props' ? !(sc.props || []).length : !String(sc[f] || '').trim()
                )
                return (
                  <div className="sc-card" key={sc.id}>
                    <div className="sc-head">
                      <b title={sc.desc || ''}>{sc.name}</b>
                      <span className={`tag ${sc.confidence === 'high' ? 'accent' : ''}`}>
                        {FROM_LABEL[sc.from] || sc.from}
                      </span>
                    </div>
                    <div className="sc-kv">
                      {SCENE_FIELDS.map((f) => {
                        const v = f.k === 'props' ? (sc.props || []).join('、') : sc[f.k]
                        return (
                          <div className="sc-row" key={f.k}>
                            <i>{f.label}</i>
                            <span className={v ? '' : 'missing'}>{v || '待确认'}</span>
                          </div>
                        )
                      })}
                    </div>
                    {opens.length ? <Tag level="warn">待确认 {opens.length} 项</Tag> : null}
                    <div className="sc-acts">
                      <Btn size="sm" onClick={() => openEdit(sc)}>编辑</Btn>
                      <Btn
                        size="sm"
                        onClick={() => {
                          if (!confirm(`删除场景「${sc.name}」？`)) return
                          actions.removeScene(sc.id)
                          notify('已删除')
                        }}
                      >
                        删除
                      </Btn>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <div>
        <Panel title={`要确认（${pending.length}）`}>
          {!pending.length ? (
            <div className="dim" style={{ fontSize: 12, lineHeight: 1.9 }}>
              没有悬着的疑问。场景七要素都定下来了，可以直接进分镜和提示词。
            </div>
          ) : (
            <div className="sc-qs">
              {pending.map((row) => (
                <div className="sc-q" key={row.key}>
                  <div className="sc-q-t">{row.q}</div>
                  {row.why ? <div className="sc-q-w">{row.why}</div> : null}
                  {row.cur ? <div className="sc-q-w">现在填的是「{row.cur}」，点一个就是改主意</div> : null}
                  <div className="sc-q-o">
                    {row.options.map((o) => (
                      <button type="button" key={o} className="sc-chip" onClick={() => answer(row, o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                  <div className="sc-q-in">
                    <Text
                      value={custom[row.key] || ''}
                      placeholder="都不对？自己写一个，回车确认"
                      onChange={(e) => setCustom((m) => ({ ...m, [row.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const v = String(custom[row.key] || '').trim()
                        if (v) answer(row, v)
                      }}
                    />
                    <Btn
                      size="sm"
                      onClick={() => {
                        const v = String(custom[row.key] || '').trim()
                        if (v) answer(row, v)
                      }}
                    >
                      确定
                    </Btn>
                  </div>
                  <div className="sc-q-s">场景：{row.sceneName}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="怎么用" style={{ marginTop: 14 }}>
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.95 }}>
            1. 场景名会被写进 04 页的「场景」列，同名即同一场景 —— 名字要短且稳定。
            <br />
            2. 05 / 06 页生成提示词时，场景的光线、色调、陈设会作为环境段拼进提示词。
            <br />
            3. 模型会把没写清的字段抛成问题，点一下就能定下来，不猜。
          </div>
        </Panel>
      </div>

      <Modal
        open={!!editId}
        title="编辑场景"
        desc="场景名请保持「地点·时间」的写法，它同时是分镜里的场景标识"
        onClose={() => {
          setEditId(null)
          setDraft(null)
        }}
        footer={
          <>
            <Btn onClick={() => { setEditId(null); setDraft(null) }}>取消</Btn>
            <Btn variant="primary" onClick={saveEdit}>保存</Btn>
          </>
        }
        width={620}
      >
        {draft && (
          <>
            <div className="row">
              <Field label="场景名">
                <Text value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="灵堂·夜" />
              </Field>
              <Field label="地点">
                <Text value={draft.place || ''} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="苏家老宅灵堂" />
              </Field>
            </div>
            <div className="row">
              <Field label="时间">
                <Sel
                  value={draft.time || ''}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  options={[{ value: '', label: '未定' }].concat(SCENE_TIMES.map((x) => ({ value: x, label: x })))}
                />
              </Field>
              <Field label="天气">
                <Sel
                  value={draft.weather || ''}
                  onChange={(e) => setDraft({ ...draft, weather: e.target.value })}
                  options={[{ value: '', label: '未定' }].concat(SCENE_WEATHERS.map((x) => ({ value: x, label: x })))}
                />
              </Field>
            </div>
            <Field label="光线" hint="写主光源，别写「明亮/昏暗」">
              <Text value={draft.light || ''} onChange={(e) => setDraft({ ...draft, light: e.target.value })} placeholder="冷白日光灯 + 两支烛火" />
            </Field>
            <Field label="色调">
              <Text value={draft.tone || ''} onChange={(e) => setDraft({ ...draft, tone: e.target.value })} placeholder="灰白压抑" />
            </Field>
            <Field label="氛围">
              <Text value={draft.ambience || ''} onChange={(e) => setDraft({ ...draft, ambience: e.target.value })} placeholder="香灰味、纸钱、压低的抽泣声" />
            </Field>
            <Field label="陈设" hint="用、分隔，最多 10 个">
              <Text value={draft.propsText || ''} onChange={(e) => setDraft({ ...draft, propsText: e.target.value })} placeholder="棺材、遗像、白菊" />
            </Field>
            <Field label="描述（进提示词的那句）" hint="留空会自动按七要素拼">
              <Area rows={3} value={draft.desc || ''} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder={describeScene(draft)} />
            </Field>
          </>
        )}
      </Modal>
    </div>
  )
}
