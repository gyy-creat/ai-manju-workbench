import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { platform, styleOf, lenLabel } from '../lib/schema'
import { buildVideoPrompt, shotOutfit } from '../lib/prompts.js'
import {
  VIDEO_MODELS,
  videoModelById,
  videoFamilyOf,
  clampVideoDur,
  videoRefModeOf,
  DEFAULT_VIDEO_MODEL_ID,
} from '../lib/videoModels.js'
import ComfyPanel from '../components/ComfyPanel.jsx'
import SkillSelect from '../components/SkillSelect.jsx'
import { Btn, Panel, Tag, Sel, Empty } from '../ui.jsx'
import { copyText } from '../lib/exporters.js'

const MODES = [
  { id: 't2v', label: '文生视频' },
  { id: 'i2v', label: '图生视频（首帧）' },
  { id: 'flf', label: '首尾帧' },
]

const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : [])

export default function VideoPrompts({ notify }) {
  const { project, actions } = useProject()
  const pf = platform(project)
  const st = styleOf(project)
  const [epId, setEpId] = useState(project.episodes[0]?.id || null)
  const ep = project.episodes.find((e) => e.id === epId) || project.episodes[0]
  const shots = ep?.shots || []
  const [shotId, setShotId] = useState(shots[0]?.id || null)
  const shot = shots.find((s) => s.id === shotId) || shots[0]

  const modelId = project.meta?.videoModel || DEFAULT_VIDEO_MODEL_ID
  const model = videoModelById(modelId)
  const fam = videoFamilyOf(modelId)
  const skillIds = asList(project.meta?.skillVideo)
  const [mode, setMode] = useState('i2v')
  const [view, setView] = useState('local')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const ctlRef = useRef(null)

  useEffect(() => {
    if (!shots.find((s) => s.id === shotId)) setShotId(shots[0]?.id || null)
  }, [epId])

  const v = useMemo(
    () => (ep && shot ? buildVideoPrompt(project, ep, shot, modelId) : null),
    [project, ep, shot, modelId]
  )
  const outfit = shot ? shotOutfit(project, shot) : null

  const aiRaw = shot?.promptVideoAI || null
  const sameModel = Boolean(aiRaw) && aiRaw.modelId === modelId
  const sameSkill = Boolean(aiRaw) && JSON.stringify(asList(aiRaw.skillIds)) === JSON.stringify(skillIds)
  const ai = sameModel && sameSkill ? aiRaw : null
  const stale = sameModel && !sameSkill

  const showAi = view === 'ai' && Boolean(ai)
  const text = showAi ? ai.prompt : v?.full || ''
  const negative = showAi ? ai.negative : v?.negative || ''
  const params = showAi ? ai.params || v?.params : v?.params || ''

  const push = (body, label) => {
    copyText(body)
      .then(() => notify?.(label))
      .catch((e) => notify?.(`复制失败：${e.message}——手动选中提示词复制`))
  }

  const setModel = (name) => {
    const m = VIDEO_MODELS.find((x) => x.name === name)
    if (m) {
      actions.setMeta({ videoModel: m.id })
      setView('local')
    }
  }

  const draftsOf = (list) =>
    list.map((s) => {
      const r = buildVideoPrompt(project, ep, s, modelId)
      const o = shotOutfit(project, s)
      return {
        no: s.no,
        size: s.size,
        angle: s.angle,
        move: s.move,
        scene: s.scene,
        desc: s.desc,
        action: s.action,
        actionEn: s.actionEn || '',
        chars: s.chars,
        outfit: o.cn,
        props: s.props,
        emotion: s.emotion,
        intensity: s.intensity,
        dialogue: s.dialogue,
        dur: s.dur,
        localDraft: r.full,
        localNegative: r.negative,
        localParams: r.params,
      }
    })

  const stopAi = () => {
    try {
      ctlRef.current?.abort()
    } catch {
      /* noop */
    }
  }

  const runAi = async (list, skillOverride) => {
    if (!list.length || busy) return
    const useSkills = skillOverride !== undefined ? asList(skillOverride) : skillIds
    const t0 = Date.now()
    setBusy(true)
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 250)
    const ctl = new AbortController()
    ctlRef.current = ctl
    try {
      const r = await fetch('/api/prompt/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          mode: 'video',
          videoModelId: modelId,
          dur: clampVideoDur(modelId, list[0]?.dur),
          width: 1080,
          height: 1920,
          fps: pf.fps,
          styleName: st.name,
          styleAnchor: st.anchor,
          skillIds: useSkills,
          shots: draftsOf(list),
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '生成失败')
      const byNo = new Map((j.prompts || []).map((p) => [Number(p.no), p]))
      let n = 0
      list.forEach((s) => {
        const hit = byNo.get(Number(s.no))
        if (!hit) return
        n++
        actions.updateShot(ep.id, s.id, {
          promptVideoAI: {
            modelId,
            skillIds: useSkills,
            prompt: hit.prompt,
            negative: hit.negative || '',
            params: hit.params || '',
            at: Date.now(),
          },
        })
      })
      setView('ai')
      notify?.(`已按 ${j.modelName} 语法重写 ${n} 镜视频提示词（${Math.round((Date.now() - t0) / 1000)} 秒）`)
    } catch (err) {
      if (err?.name === 'AbortError') notify?.('已停止，已生成的镜保留')
      else notify?.(String(err.message || err))
    } finally {
      clearInterval(timer)
      ctlRef.current = null
      setBusy(false)
      setElapsed(0)
    }
  }

  const copyOne = () => {
    const parts = [`# 镜${shot.no}｜${model.name}｜${fam.label}${showAi ? '｜AI 定向' : '｜模板版'}`, text]
    if (negative) parts.push('', `负面：${negative}`)
    parts.push('', `参数：${params}`, `参考图：${v.refLine}`)
    push(parts.join('\n'), `镜${shot.no} 的视频提示词已复制`)
  }

  const copyAll = () => {
    const body = shots
      .map((s) => {
        const r = buildVideoPrompt(project, ep, s, modelId)
        const a = s.promptVideoAI
        const useAi =
          a && a.modelId === modelId && JSON.stringify(asList(a.skillIds)) === JSON.stringify(skillIds)
        const t = useAi ? a.prompt : r.full
        const neg = useAi ? a.negative : r.negative
        return [
          `【镜${s.no}】${model.name}${useAi ? ' · AI 定向' : ' · 模板版'}`,
          t,
          neg ? `负面：${neg}` : '',
          `参数：${useAi ? a.params || r.params : r.params}`,
        ]
          .filter(Boolean)
          .join('\n')
      })
      .join('\n\n')
    push(body, `本集 ${shots.length} 镜已复制`)
  }

  if (!ep || !shot) {
    return <Empty icon="film">还没有分镜——先去 04 分镜脚本写几镜，再回来生成视频提示词</Empty>
  }

  return (
    <>
      <div>
      <div className="toolbar">
        <div className="links">
          <Sel value={model.name} onChange={setModel} options={VIDEO_MODELS.map((m) => m.name)} />
          <Tag>{fam.label}</Tag>
          <SkillSelect
            label="规则"
            value={skillIds}
            onChange={(vv) => {
              actions.setMeta({ skillVideo: vv })
              runAi(shots, vv)
            }}
          />
        </div>
        <div className="links">
          {busy ? (
            <Btn size="sm" variant="ghost" onClick={stopAi}>
              生成中 {elapsed}s · {shots.length} 镜 · 点此停止
            </Btn>
          ) : (
            <>
              <Btn size="sm" onClick={() => runAi([shot])}>AI 定向 · 本镜</Btn>
              <Btn size="sm" onClick={() => runAi(shots)}>AI 定向 · 本集</Btn>
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={copyOne}>复制本镜</Btn>
          <Btn size="sm" variant="ghost" onClick={copyAll}>复制本集</Btn>
        </div>
      </div>

      <div className="toolbar">
        <div className="links">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${mode === m.id ? 'on' : ''}`}
              onClick={() => setMode(m.id)}
              disabled={m.id === 'flf' && videoRefModeOf(modelId) !== 'first-last'}
              title={m.id === 'flf' && videoRefModeOf(modelId) !== 'first-last' ? `${model.name} 不支持尾帧` : ''}
            >
              {m.label}
            </button>
          ))}
          {ai ? (
            <>
              <span className="sep" />
              <button type="button" className={`chip ${view === 'local' ? 'on' : ''}`} onClick={() => setView('local')}>
                模板版
              </button>
              <button type="button" className={`chip ${view === 'ai' ? 'on' : ''}`} onClick={() => setView('ai')}>
                AI 版
              </button>
            </>
          ) : null}
        </div>
        <div className="links dim" style={{ fontSize: 11 }}>
          {ep.title || `第${ep.no}集`} · {shots.length} 镜
        </div>
      </div>

      {stale ? (
        <div className="skill-stale">
          <span>规则换了，这一镜的 AI 版还是旧规则写的。</span>
          <Btn size="sm" variant="ghost" onClick={() => runAi([shot])}>按新规则重生成</Btn>
          <Btn size="sm" variant="ghost" onClick={() => runAi(shots)}>整集</Btn>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <Panel title="镜头" extra={<span className="dim">{shots.length}</span>}>
            <div className="shot-list">
              {shots.map((s) => {
                const a = s.promptVideoAI
                const tagged =
                  a && a.modelId === modelId && JSON.stringify(asList(a.skillIds)) === JSON.stringify(skillIds)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`shot-row ${s.id === shot.id ? 'on' : ''}`}
                    onClick={() => setShotId(s.id)}
                  >
                    <span className="no">{s.no}</span>
                    <span className="t">{s.desc || s.action || '（还没写画面）'}</span>
                    {tagged ? <span className="ai">AI</span> : <span className="d">{s.dur}s</span>}
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>

        <div>
          <Panel
            title={`镜 ${shot.no} · 视频提示词`}
            extra={
              <span className="links">
                <Tag>{v.dur}s</Tag>
                <Tag level={showAi ? 'ok' : ''}>{showAi ? `AI 定向 · ${model.name}` : `模板版 · ${model.name}`}</Tag>
              </span>
            }
          >
            <div className="vp-box">
              <div className="vp-text">{text}</div>
              <div className="vp-foot">
                <Tag>{fam.label}</Tag>
                <Tag level="info">{lenLabel(text)}</Tag>
                <span className="spacer" />
                <Btn size="sm" variant="ghost" onClick={() => push(text, '正向提示词已复制')}>复制正向</Btn>
              </div>
            </div>

            {negative ? (
              <div className="vp-box neg">
                <div className="vp-text">{negative}</div>
                <div className="vp-foot">
                  <Tag level="warn">负面词</Tag>
                  <span className="spacer" />
                  <Btn size="sm" variant="ghost" onClick={() => push(negative, '负面词已复制')}>复制负面</Btn>
                </div>
              </div>
            ) : (
              <div className="dim" style={{ fontSize: 11, marginBottom: 10 }}>
                {model.name} 不吃负面词，约束已经写进正向句里。
              </div>
            )}

            <div className="vp-kv">
              <div><span>参数</span><b>{params}</b></div>
              <div>
                <span>时长</span>
                <b>
                  {v.dur}s（该模型 {v.durRange[0]}–{v.durRange[1]}s）
                  {Number(shot.dur) !== v.dur ? (
                    <em className="vp-warn">分镜写的是 {shot.dur}s，超出区间会被拉到 {v.dur}s</em>
                  ) : null}
                </b>
              </div>
              <div><span>参考图</span><b>{v.refLine}</b></div>
              {outfit?.cn ? <div><span>服装</span><b>{outfit.cn}</b></div> : null}
              {fam.label.includes('英文') ? (
                <div>
                  <span>英文动作</span>
                  <input
                    className="vp-action"
                    value={shot.actionEn || ''}
                    placeholder="如 he lifts his head — 英文族会用它替换中文动作"
                    onChange={(e) => actions.updateShot(ep.id, shot.id, { actionEn: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid-2">
        <Panel title="视频模型" extra={<Tag>{VIDEO_MODELS.length}</Tag>}>
          <div className="vp-kv">
            <div><span>当前</span><b>{model.name} · {model.vendor}</b></div>
            <div><span>语法族</span><b>{fam.label}</b></div>
            <div><span>支持时长</span><b>{model.durRange[0]}–{model.durRange[1]} 秒</b></div>
            <div><span>参考图</span><b>{videoRefModeOf(modelId) === 'first-last' ? '首帧 + 尾帧' : '首帧'}</b></div>
            <div><span>参数模板</span><b>{model.params}</b></div>
          </div>
          <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>{model.note}</div>
        </Panel>

        <Panel title="平台与画风">
          <div className="vp-kv">
            <div><span>平台</span><b>{pf.name}</b></div>
            <div><span>集时长</span><b>{pf.episodeSec[0]}–{pf.episodeSec[1]} 秒</b></div>
            <div><span>帧率</span><b>{pf.fps} fps</b></div>
            <div><span>画风</span><b>{st.name}</b></div>
            <div><span>规则</span><b>{skillIds.length ? `已挂 ${skillIds.length} 份` : '不挂'}</b></div>
          </div>
          <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>
            单镜超过 {model.durRange[1]} 秒会被截到上限，长镜头请拆成两镜。
          </div>
        </Panel>
      </div>
    </div>

    <ComfyPanel notify={notify} kind="video" />
    </>
  )
}
