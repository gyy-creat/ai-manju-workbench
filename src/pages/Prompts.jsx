import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { buildPrompt, buildFramePair, shotOutfit, shotRefs, buildAssetPrompt } from '../lib/prompts'
import { platform, styleOf, ASSET_JOB_KINDS, assetJobKindOf } from '../lib/schema'
import {
  IMAGE_MODELS,
  IMAGE_FAMILIES,
  DEFAULT_MODEL_ID,
  modelById,
  refCapOf,
} from '../lib/imageModels'
import { copyWith } from '../lib/exporters'
import ComfyPanel from '../components/ComfyPanel.jsx'
import { Btn, Panel, Tag, Sel } from '../ui.jsx'
import { photoSrc } from '../lib/media.js'
import SkillSelect from '../components/SkillSelect.jsx'

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

/** 某镜 AI 版当时挂的 skill 快照；老数据没有这个字段就当空数组 */
function aiRaw0(shot) {
  const a = shot?.promptAI
  if (!a) return []
  return Array.isArray(a.skillIds) ? a.skillIds : []
}

export default function Prompts({ notify }) {
  const { project, actions } = useProject()
  const pf = platform(project)
  const st = styleOf(project)
  const [ajFilter, setAjFilter] = useState('all')

  const modelId = project.meta.imageModel || DEFAULT_MODEL_ID
  const jobs = project.assetJobs || []
  const jobsDone = jobs.filter((j) => j.render).length
  const shownJobs = ajFilter === 'all' ? jobs : jobs.filter((j) => j.kind === ajFilter)
  const model = modelById(modelId)
  const fam = IMAGE_FAMILIES[model.family]
  const refCap = refCapOf(modelId)
  const mode = project.meta.promptMode === 'pair' ? 'pair' : 'single'

  const [epId, setEpId] = useState(project.episodes[0]?.id || null)
  const ep = project.episodes.find((e) => e.id === epId) || project.episodes[0]
  const [shotId, setShotId] = useState(ep?.shots[0]?.id || null)
  const shot = ep?.shots.find((s) => s.id === shotId) || ep?.shots[0]
  const [lang, setLang] = useState('en')
  const [view, setView] = useState('local') // local | ai
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const ctlRef = useRef(null)
  const stopAi = () => {
    try {
      ctlRef.current?.abort()
    } catch {}
  }

  const p = useMemo(
    () => (ep && shot ? buildPrompt(project, ep, shot, modelId) : null),
    [project, ep, shot, modelId],
  )
  const pair = useMemo(
    () => (ep && shot ? buildFramePair(project, ep, shot, modelId) : null),
    [project, ep, shot, modelId],
  )
  const refs = useMemo(() => (shot ? shotRefs(project, shot) : []), [project, shot])

  // AI 版只在「它是当前这个模型生成的」时才算数——换了模型要重新定向
  const skillIds = project.meta?.skillPrompt || []
  const sameSkill = JSON.stringify(aiRaw0(shot) || []) === JSON.stringify(skillIds)
  const aiRaw = shot?.promptAI && shot.promptAI.modelId === modelId ? shot.promptAI : null
  const aiModeOk = aiRaw && (aiRaw.mode === 'pair') === (mode === 'pair')
  // 换了 skill 规则，旧的 AI 版就不再算数——否则界面还显示上一套规则写的东西
  const ai = aiModeOk && sameSkill ? aiRaw : null
  const staleSkill = aiModeOk && !sameSkill
  const showAi = view === 'ai' && !!ai

  const push = (msg) => notify?.(msg)
  const [aiReady, setAiReady] = useState(false)
  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => r.json())
      .then((j) => setAiReady(Boolean(j?.config?.hasKey)))
      .catch(() => {})
  }, [])
  const setMode = (m) => {
    actions.setMeta({ promptMode: m })
    setView('local')
  }

  /** 把镜头整理成后端要的草稿：本地模板版一并带上，让模型在正确语法上改 */
  const draftsOf = (shots) =>
    shots.map((s) => {
      const local = buildPrompt(project, ep, s, modelId)
      const lp = buildFramePair(project, ep, s, modelId)
      return {
        no: s.no,
        size: s.size,
        angle: s.angle,
        move: s.move,
        scene: s.scene,
        desc: s.desc,
        action: s.action,
        chars: local.subject,
        outfit: shotOutfit(project, s).cn,
        props: s.props,
        emotion: s.emotion,
        intensity: s.intensity,
        dialogue: s.dialogue,
        dur: s.dur,
        localDraft: local.full,
        localFirst: lp.first.full,
        localLast: lp.last.full,
        localBridge: lp.bridge,
      }
    })

  const runAi = async (shots, skillOverride) => {
    if (!shots.length) return
    const useSkills = skillOverride !== undefined ? skillOverride : project.meta?.skillPrompt || []
    setBusy(true)
    setElapsed(0)
    const t0 = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 250)
    const ctl = new AbortController()
    ctlRef.current = ctl
    try {
      const r = await fetch('/api/prompt/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          modelId,
          mode,
          skillIds: useSkills,
          ratio: pf.ratio,
          width: pf.width,
          height: pf.height,
          styleName: st.name,
          styleAnchor: st.anchor,
          shots: draftsOf(shots),
        }),
      })
      const j = await r.json()
      if (!j.ok) {
        push(j.error || '定向生成失败')
        return
      }
      const at = new Date().toISOString()
      const byNo = new Map(j.prompts.map((x) => [x.no, x]))
      let n = 0
      shots.forEach((s) => {
        const hit = byNo.get(s.no)
        if (!hit) return
        n += 1
        actions.updateShot(ep.id, s.id, {
          promptAI: {
            modelId,
            mode,
            skillIds: useSkills,
            prompt: hit.prompt || '',
            first: hit.first || '',
            last: hit.last || '',
            bridge: hit.bridge || '',
            negative: hit.negative,
            params: hit.params,
            at,
          },
        })
      })
      setView('ai')
      push(
        `${model.name} 定向生成 ${n}/${shots.length} 条${j.missing ? `（模型漏了 ${j.missing} 镜，已保留模板版）` : ''} · ${(j.ms / 1000).toFixed(1)}s`,
      )
    } catch (err) {
      if (err?.name === 'AbortError') push('已停止，已生成的镜保留')
      else push(String(err.message || err))
    } finally {
      clearInterval(timer)
      ctlRef.current = null
      setBusy(false)
      setElapsed(0)
    }
  }

  const singlePrompt = showAi
    ? ai.prompt
    : lang === 'en'
      ? p?.full
      : p?.cnVersion
  const singleNeg = showAi ? ai.negative : p?.negative

  const firstText = showAi
    ? ai.first || ai.prompt
    : lang === 'cn'
      ? pair?.firstCn
      : pair?.first.full
  const lastText = showAi
    ? ai.last || ''
    : lang === 'cn'
      ? pair?.lastCn
      : pair?.last.full
  const bridgeText = showAi ? ai.bridge || pair?.bridge : pair?.bridge
  /** pair 模式的中文版是另生成的串（按中文族语法），面板提示要说清它是什么 */

  return (
    <>
    <div className="cols">
      <div className="list-panel">
        <div className="list-head"><span style={{ flex: 1 }}>镜头索引</span></div>
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {project.episodes.map((e) => (
            <div key={e.id}>
              <div className="list-head" style={{ background: 'var(--panel-2)', fontSize: 10, padding: '5px 10px' }}>第{e.no}集</div>
              {e.shots.map((s) => {
                // 规则换了也不算数：左栏的 AI 标记要和右栏的判定同一套标准
                const tagged =
                  s.promptAI &&
                  s.promptAI.modelId === modelId &&
                  JSON.stringify(aiRaw0(s)) === JSON.stringify(skillIds)
                return (
                  <div
                    key={s.id}
                    className={`list-item ${shot?.id === s.id ? 'active' : ''}`}
                    onClick={() => { setEpId(e.id); setShotId(s.id); setView('local') }}
                  >
                    <span className="n">{s.no}</span>
                    <span className="t">{s.size} · {s.desc?.slice(0, 10) || '（空）'}</span>
                    {tagged && <span className="dim" style={{ fontSize: 9.5, color: 'var(--malachite)' }}>AI</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="toolbar">
          <span className="dim" style={{ fontSize: 11 }}>生图模型</span>
          <Sel
            value={model.name}
            onChange={(name) => {
              const hit = IMAGE_MODELS.find((m) => m.name === name)
              if (hit) actions.setMeta({ imageModel: hit.id })
              setView('local')
            }}
            options={IMAGE_MODELS.map((m) => m.name)}
            style={{ width: 208 }}
          />
          <Tag level="accent">{fam.label}</Tag>
          <span style={{ width: 10 }} />
          <SkillSelect
            label="规则"
            value={project.meta?.skillPrompt || []}
            onChange={(v) => {
              actions.setMeta({ skillPrompt: v })
              if (aiReady) runAi(ep?.shots || [], v)
            }}
          />
          <span style={{ flex: 1 }} />
          {busy ? (
            <Btn size="sm" variant="ghost" onClick={stopAi}>
              生成中 {elapsed}s · {ep?.shots?.length || 0} 镜 · 点此停止
            </Btn>
          ) : (
            <>
              <Btn size="sm" onClick={() => runAi([shot])}>AI 定向 · 本镜</Btn>
              <Btn size="sm" onClick={() => runAi(ep?.shots || [])}>AI 定向 · 本集</Btn>
            </>
          )}
        </div>

        {staleSkill && (
          <div className="skill-stale">
            <span>规则已换，上一套规则写的 AI 版不再显示（现在是模板版）</span>
            <Btn size="sm" disabled={busy} onClick={() => runAi([shot])}>按新规则重生成</Btn>
            <Btn size="sm" disabled={busy} onClick={() => runAi(ep?.shots || [])}>整集</Btn>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: -4 }}>
          <div className="links">
            <span className={`chip ${mode === 'single' ? 'on' : ''}`} onClick={() => setMode('single')}>单帧</span>
            <span className={`chip ${mode === 'pair' ? 'on' : ''}`} onClick={() => setMode('pair')}>首尾帧 · 多参</span>
            <span style={{ width: 8 }} />
            {ai && (
              <>
                <span className={`chip ${!showAi ? 'on' : ''}`} onClick={() => setView('local')}>模板版</span>
                <span className={`chip ${showAi ? 'on' : ''}`} onClick={() => setView('ai')}>AI 版</span>
                <span className="dim" style={{ fontSize: 10.5 }}>AI 版由 {model.name} 语法重写 · {String(ai.at).slice(5, 16).replace('T', ' ')}</span>
              </>
            )}
            {!ai && (
              <>
                <span className={`chip ${lang === 'en' ? 'on' : ''}`} onClick={() => setLang('en')}>英文提示词</span>
                <span className={`chip ${lang === 'cn' ? 'on' : ''}`} onClick={() => setLang('cn')}>中文提示词</span>
              </>
            )}
          </div>
          <span style={{ flex: 1 }} />
          {mode === 'pair' ? (
            <>
              <Btn size="sm" onClick={() => copyWith(firstText || '', '首帧提示词已复制', notify)}>复制首帧</Btn>
              <Btn size="sm" onClick={() => copyWith(lastText || '', '尾帧提示词已复制', notify)}>复制尾帧</Btn>
            </>
          ) : (
            <>
              <Btn size="sm" onClick={() => copyWith(singlePrompt || '', '已复制当前提示词', notify)}>复制提示词</Btn>
              <Btn size="sm" onClick={() => copyWith(p?.cnVersion || '', '中文说明已复制', notify)}>复制中文</Btn>
            </>
          )}
        </div>

        {!p ? (
          <div className="empty">还没有镜头</div>
        ) : mode === 'pair' ? (
          <>
            <Panel
              title={`第${ep.no}集 镜${shot.no}｜首帧 · 起势`}
              extra={<Tag level={showAi ? 'ok' : ''}>{showAi ? `AI 定向 · ${model.name}` : `模板版 · ${model.name}`}</Tag>}
            >
              <div className="pre" style={{ fontSize: 12, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{firstText}</div>
            </Panel>

            <Panel title={`第${ep.no}集 镜${shot.no}｜尾帧 · 收势`} style={{ marginTop: 12 }}>
              <div className="pre" style={{ fontSize: 12, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{lastText}</div>
            </Panel>

            <Panel title="帧间桥接（喂给首尾帧生成）" style={{ marginTop: 12 }}>
              <div className="pre" style={{ whiteSpace: 'pre-wrap' }}>{bridgeText}</div>
            </Panel>

            <Panel title="负面词（两张共用）" style={{ marginTop: 12 }}>
              <div className="pre">{showAi ? ai.negative : pair.first.negative || '（该模型无负向框，要求已写进正向提示词）'}</div>
            </Panel>
          </>
        ) : (
          <>
            <Panel
              title={`第${ep.no}集 镜${shot.no}｜${shot.size}·${shot.angle}·${shot.move}·${shot.dur}s`}
              extra={<Tag level={showAi ? 'ok' : ''}>{showAi ? `AI 定向 · ${model.name}` : `模板版 · ${model.name}`}</Tag>}
            >
              <div className="pre" style={{ fontSize: 12, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{singlePrompt}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag level="accent">主体：{p.subject.slice(0, 42) || '—'}…</Tag>
                <Tag>镜像族：{p.familyLabel}</Tag>
              </div>
            </Panel>

            <Panel title={showAi ? '负面词（AI 版按该模型语法处理）' : '负面词（跟着画风与模型走）'} style={{ marginTop: 12 }}>
              <div className="pre">{singleNeg || '（该模型无负向框，要求已写进正向提示词）'}</div>
            </Panel>
          </>
        )}

        {p && (
          <>
            <Panel title={`多参参考图（${refs.length} 张 · ${model.name} 最多吃 ${refCap.max || 0} 张）`} style={{ marginTop: 12 }}>
              {refs.length ? (
                <>
                  <div className="ref-strip">
                    {refs.map((r, i) => (
                      <div key={`${r.role}-${i}`} className={`ref-mini ${i < refCap.max ? '' : 'over'}`} title={r.path}>
                        {photoSrc(r.path) ? (
                          <img src={photoSrc(r.path)} alt={r.label} />
                        ) : (
                          <div className="ph">无图</div>
                        )}
                        <span className="idx">{CIRCLED[i] || i + 1}</span>
                        <span className="lab">{r.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pre" style={{ marginTop: 8 }}>{pair.refLine || p.refLine}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <Btn size="sm" onClick={() => copyWith((pair.refLine || p.refLine) || '', '多参说明已复制', notify)}>复制多参说明</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { window.location.hash = '#/characters' }}>去角色卡补图</Btn>
                  </div>
                </>
              ) : (
                <div className="empty" style={{ padding: '10px 0' }}>
                  这一镜还没有可用参考图 —— 去角色卡上传三视图，或给场景传一张空镜。
                </div>
              )}
            </Panel>

          </>
        )}
      </div>

      <div>
        <Panel title="模型 · 平台 · 画风">
          <div className="kv"><span className="k">生图模型</span><span className="v">{model.name} · {model.vendor}</span></div>
          <div className="kv"><span className="k">语法族</span><span className="v">{fam.label}　{p?.params || '—'}</span></div>
          <div className="kv"><span className="k">提示词模式</span><span className="v">{mode === 'pair' ? '首尾帧 · 多参' : '单帧'}</span></div>
          <div className="kv"><span className="k">多参能力</span><span className="v">{refCap.max ? `最多 ${refCap.max} 张` : '不吃参考图'}</span></div>
          <div className="kv"><span className="k">平台</span><span className="v">{pf.name} · {pf.ratio} · {pf.width}×{pf.height} · {pf.fps}fps</span></div>
          <div className="kv"><span className="k">画风</span><span className="v">{st.name}</span></div>
          <div className="pre" style={{ marginTop: 6 }}>{st.anchor}</div>
        </Panel>

        <Panel title="本镜缺口" style={{ marginTop: 12 }}>
          {shot ? (
            [
              { ok: !!shot.desc, t: '画面描述' },
              { ok: !!shot.chars, t: '角色' },
              { ok: !!shot.scene, t: '场景' },
              { ok: Number(shot.dur) > 0, t: '时长' },
              { ok: (shot.chars || '').split(/[,，、\s]+/).filter(Boolean).every((n) => project.characters.some((c) => c.name === n)), t: '角色已建档' },
              { ok: !!shot.action, t: '动作（尾帧要它才有收势）' },
            ].map((x) => (
              <div key={x.t} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                <Tag level={x.ok ? 'ok' : 'warn'}>{x.ok ? '✓' : '缺'}</Tag>
                <span style={{ fontSize: 11.5 }}>{x.t}</span>
              </div>
            ))
          ) : (
            <div className="muted">—</div>
          )}
        </Panel>
      </div>
    </div>

    <Panel
      title="资产生成（主视图 / 四视图 / 表情 / 配饰 / 服装）"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {jobs.length > 0 && (
            <Tag level={jobsDone ? 'ok' : 'warn'}>
              {jobsDone}/{jobs.length} 已出图
            </Tag>
          )}
          <Btn
            size="sm"
            onClick={() => {
              const n = actions.seedAssetJobs?.()
              notify?.(n ? `补齐 ${n} 条资产任务` : '角色卡能出的图都已经有任务了')
            }}
          >
            补齐全部角色
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => actions.addAssetJob?.('main')}>
            ＋ 一条
          </Btn>
        </div>
      }
    >
      <div className="links" style={{ marginBottom: 8 }}>
        <span className={`chip ${ajFilter === 'all' ? 'on' : ''}`} onClick={() => setAjFilter('all')}>
          全部 {jobs.length}
        </span>
        {ASSET_JOB_KINDS.map((k) => {
          const n = jobs.filter((j) => j.kind === k.id).length
          if (!n) return null
          return (
            <span key={k.id} className={`chip ${ajFilter === k.id ? 'on' : ''}`} onClick={() => setAjFilter(k.id)}>
              {k.label} {n}
            </span>
          )
        })}
      </div>

      {shownJobs.length ? (
        <div className="aj-list">
          {shownJobs.map((j) => {
            const k = assetJobKindOf(j.kind)
            const p = buildAssetPrompt(project, j, modelId)
            return (
              <div className="aj-row" key={j.id}>
                <div className="aj-main">
                  <div className="aj-head">
                    <span className="aj-kind">{k.label}</span>
                    <input
                      className="aj-name"
                      value={j.name || ''}
                      placeholder={`${j.charName || '角色'} · ${k.label}`}
                      onChange={(e) => actions.updateAssetJob?.(j.id, { name: e.target.value })}
                    />
                    <span className="dim" style={{ fontSize: 10.5 }}>{j.charName || '—'}</span>
                  </div>
                  <div className="aj-prompt">{p.full}</div>
                </div>
                <div className="aj-side">
                  {j.render ? (
                    <img className="aj-thumb" src={photoSrc(j.render)} alt={k.label} />
                  ) : (
                    <div className="aj-thumb ph">未生成</div>
                  )}
                  <div className="aj-acts">
                    <Btn size="sm" variant="ghost" onClick={() => copyWith(p.full, `${k.label}提示词已复制`, notify)}>
                      复制
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      disabled={!j.render}
                      onClick={() => {
                        actions.adoptAssetRender?.(j.id, 'ref')
                        notify?.('已设成这个角色的参考图')
                      }}
                    >
                      设为参考图
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      disabled={!j.render}
                      onClick={() => {
                        actions.adoptAssetRender?.(j.id, 'asset')
                        notify?.('已存进素材库')
                      }}
                    >
                      存素材
                    </Btn>
                    <button
                      type="button"
                      className="li-del"
                      title="删掉这条任务（已生成的图不删）"
                      onClick={() => {
                        if (window.confirm(`删掉「${j.name || k.label}」这条任务？`)) actions.removeAssetJob?.(j.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty">还没有资产任务 —— 点右上「补齐全部角色」，会按角色卡自动建主视图 / 四视图 / 表情 / 配饰 / 服装</div>
      )}
    </Panel>

    <ComfyPanel notify={notify} kind="image" />
    </>
  )
}
