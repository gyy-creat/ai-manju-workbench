import React, { useEffect, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { photoSrc } from '../lib/media.js'
import { platform, SIZES, MOVES, ANGLES, EMOTIONS } from '../lib/schema'
import { Btn, Sel, Text, Num, Area, Tag, Modal } from '../ui.jsx'

// 默认只显示「决定画面和台词」的列。机位 / 运镜 / 道具 / 动作 / 配音 平时不填也不影响出图，
// 收起来能让表格一眼看得懂；需要时点工具栏「列」展开，选过的记在 localStorage。
const OPTIONAL_COLS = ['angle', 'move', 'props', 'action', 'vo']
const LS_COLS = 'mjw:shots:extracols'

const COLS = [
  { k: 'no', label: '镜', w: 34 },
  // ComfyUI 回收回来的成品缩略图：有就显示，没有就是一条横线
  { k: 'render', label: '图', w: 46, type: 'render' },
  { k: 'size', label: '景别', w: 82, type: 'sel', opts: SIZES },
  { k: 'angle', label: '机位', w: 74, type: 'sel', opts: ANGLES },
  { k: 'move', label: '运镜', w: 70, type: 'sel', opts: MOVES },
  { k: 'scene', label: '场景（可选库）', w: 124, type: 'text' },
  { k: 'desc', label: '画面（出图主体描述）', w: 240, type: 'area' },
  { k: 'chars', label: '角色', w: 92, type: 'text' },
  { k: 'outfit', label: '服装号', w: 70, type: 'text' },
  { k: 'props', label: '道具', w: 86, type: 'text' },
  { k: 'speaker', label: '说话人', w: 80, type: 'text' },
  { k: 'dialogue', label: '台词', w: 190, type: 'area' },
  { k: 'emotion', label: '情绪', w: 88, type: 'sel', opts: EMOTIONS },
  { k: 'intensity', label: '强度', w: 62, type: 'num' },
  { k: 'dur', label: '时长', w: 62, type: 'num' },
  { k: 'action', label: '动作（一镜≤2个）', w: 170, type: 'text' },
  { k: 'vo', label: '配音提示', w: 110, type: 'text' },
]

export default function Shots() {
  const { project, actions, notify } = useProject()
  const pf = platform(project)
  const [epId, setEpId] = useState(project.episodes[0]?.id || null)
  const [extra, setExtra] = useState(() => localStorage.getItem(LS_COLS) === '1')
  const cols = COLS.filter((c) => extra || !OPTIONAL_COLS.includes(c.k))
  // 场景库：资产库里 kind=scene 的图，名字就是分镜里填的场景
  const [sceneFor, setSceneFor] = useState(null)
  const ep = project.episodes.find((e) => e.id === epId) || project.episodes[0]
  const dur = ep ? ep.shots.reduce((n, s) => n + (Number(s.dur) || 0), 0) : 0
  const pct = Math.min(100, (dur / pf.episodeSec[1]) * 100)

  const sceneLib = (project.assetImages || []).filter((a) => a.kind === 'scene')
  // 03b 页推测出来的场景台账，名字就是分镜场景列的取值
  const sceneCards = project.scenes || []
  const sceneNameOf = (a) => String(a.name || '').trim() || ''

  const applyScene = (a) => {
    if (!ep || !sceneFor) return
    let name = sceneNameOf(a)
    if (!name) {
      // 没名字就顺手给它起一个，否则分镜里出现一张无名场景，后面根本对不上
      const draft = `场景 ${sceneLib.findIndex((x) => x.id === a.id) + 1}`
      actions.updateAssetImage(a.id, { name: draft })
      name = draft
    }
    actions.updateShot(ep.id, sceneFor, { scene: name })
    notify(`场景 → ${name}`)
    setSceneFor(null)
  }

  // 一行里「画面」「台词」两个多行框等高：先归零再取最大内容高度，写完再统一刷
  const syncRow = (tr) => {
    if (!tr) return
    const boxes = [...tr.querySelectorAll('textarea.auto-grow')]
    if (!boxes.length) return
    boxes.forEach((b) => { b.style.height = 'auto' })
    const h = Math.max(...boxes.map((b) => b.scrollHeight))
    boxes.forEach((b) => { b.style.height = `${h}px` })
  }

  const syncAll = () => {
    document.querySelectorAll('.shots-table tbody tr').forEach((tr) => syncRow(tr))
  }

  const shotFingerprint = ep
    ? ep.shots.map((s) => `${s.id}:${(s.desc || '').length}:${(s.dialogue || '').length}`).join('|')
    : ''

  useEffect(() => {
    const t = requestAnimationFrame(syncAll)
    const onResize = () => syncAll()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epId, shotFingerprint])

  // 复制本镜到剪贴板（TSV 一行，粘进 Excel / 飞书表能自动分列）
  const copyShot = async (sh) => {
    // 复制时带全列：收起只是不显示，不能让隐藏列的数据丢失
    const line = COLS.map((c) => String(sh[c.k] ?? '').replace(/\s*\n\s*/g, ' ⏎ ')).join('\t')
    try {
      await navigator.clipboard.writeText(line)
      notify(`第 ${sh.no} 镜已复制到剪贴板`)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = line
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      notify(`第 ${sh.no} 镜已复制到剪贴板`)
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div className="links">
          {project.episodes.map((e) => (
            <span key={e.id} className={`chip ${ep?.id === e.id ? 'on' : ''}`} onClick={() => setEpId(e.id)}>
              第{e.no}集 · {e.shots.length}镜
            </span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <Tag level={dur >= pf.episodeSec[0] && dur <= pf.episodeSec[1] ? 'ok' : 'warn'}>
          合计 {dur.toFixed(1)}s / {pf.episodeSec[0]}–{pf.episodeSec[1]}s
        </Tag>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => {
            const v = !extra
            setExtra(v)
            localStorage.setItem(LS_COLS, v ? '1' : '0')
          }}
        >
          {extra ? '收起次要列' : '更多列'}
        </Btn>
        <Btn size="sm" onClick={() => actions.addShot(ep.id)}>＋ 加镜</Btn>
      </div>

      <div style={{ height: 4, background: 'var(--panel-3)', borderRadius: 2, marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: dur > pf.episodeSec[1] ? 'var(--err)' : 'var(--accent)' }} />
      </div>

      {ep ? (
        <div className="shots-wrap">
          <table className="shots-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.k} style={{ width: c.w, minWidth: c.w }}>{c.label}</th>
                ))}
                <th style={{ width: 92 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {ep.shots.map((sh) => (
                <tr key={sh.id}>
                  {cols.map((c) => {
                    const v = sh[c.k]
                    const onChange = (val) => actions.updateShot(ep.id, sh.id, { [c.k]: val })
                    return (
                      <td key={c.k} style={{ width: c.w, minWidth: c.w }}>
                        {c.k === 'no' ? (
                          <div className="no">{sh.no}</div>
                        ) : c.type === 'render' ? (
                          (sh.renders || []).length ? (
                            <button
                              type="button"
                              className="cell-render"
                              title={`${sh.renders.length} 个成品 · 点开看大图`}
                              onClick={() => window.open(photoSrc(sh.renders[0].path), '_blank')}
                            >
                              <img src={photoSrc(sh.renders[0].path)} alt="" />
                            </button>
                          ) : (
                            <span className="dim" style={{ fontSize: 11 }}>—</span>
                          )
                        ) : c.type === 'sel' ? (
                          <Sel value={v} onChange={onChange} options={c.opts} />
                        ) : c.type === 'num' ? (
                          <Num
                            value={v}
                            onChange={onChange}
                            min={0}
                            step={c.k === 'dur' ? 0.5 : 1}
                            style={
                              c.k === 'dur' || c.k === 'intensity'
                                ? { paddingLeft: 4, paddingRight: 2 }
                                : undefined
                            }
                          />
                        ) : c.k === 'scene' ? (
                          <div className="scene-cell">
                            <Text value={v} onChange={onChange} list="shot-scene-names" />
                            <button
                              type="button"
                              className="scene-pick"
                              title="从场景库选一张已上传的场景图"
                              onClick={() => setSceneFor(sh.id)}
                            >
                              库
                            </button>
                          </div>
                        ) : c.type === 'area' ? (
                          <Area
                            rows={1}
                            value={v}
                            onChange={onChange}
                            className="auto-grow"
                            onInput={(e) => syncRow(e.currentTarget.closest('tr'))}
                          />
                        ) : (
                          <Text value={v} onChange={onChange} />
                        )}
                      </td>
                    )
                  })}
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <Btn size="sm" variant="ghost" onClick={() => actions.moveShot(ep.id, sh.id, -1)} title="上移">↑</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => actions.moveShot(ep.id, sh.id, 1)} title="下移">↓</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => copyShot(sh)} title="复制本镜到剪贴板">⧉</Btn>
                      <Btn size="sm" variant="ghost danger" onClick={() => actions.removeShot(ep.id, sh.id)} title="删除">×</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">先在「剧本 / 分集」建一集</div>
      )}

      <datalist id="shot-scene-names">
        {sceneCards.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>

      <Modal
        open={!!sceneFor}
        title="从场景库选一个场景"
        desc="场景台账（03b 页推测）或资产库里的场景图，选中的名字会写进这一镜的「场景」"
        onClose={() => setSceneFor(null)}
        width={760}
      >
        {sceneCards.length ? (
          <div className="scene-ledger">
            {sceneCards.map((sc) => (
              <button
                key={sc.id}
                type="button"
                className="scene-ledger-item"
                title={sc.desc || ''}
                onClick={() => {
                  if (!ep || !sceneFor) return
                  actions.updateShot(ep.id, sceneFor, { scene: sc.name })
                  notify(`场景 → ${sc.name}`)
                  setSceneFor(null)
                }}
              >
                <b>{sc.name}</b>
                <span>{[sc.light, sc.tone].filter(Boolean).join('，') || sc.place || ''}</span>
              </button>
            ))}
          </div>
        ) : null}
        {sceneLib.length ? (
          <div className="scene-lib">
            {sceneLib.map((a) => {
              const nm = sceneNameOf(a)
              return (
                <button key={a.id} type="button" className="scene-card" onClick={() => applyScene(a)}>
                  {photoSrc(a.path) ? (
                    <img src={photoSrc(a.path)} alt={nm || '场景'} />
                  ) : (
                    <div className="ph">还没图</div>
                  )}
                  <span className={`scene-name ${nm ? '' : 'unnamed'}`}>{nm || '未命名（选中后自动编号）'}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="empty">
            <div style={{ marginBottom: 10 }}>资产库还没有场景图。</div>
            <Btn size="sm" onClick={() => { window.location.hash = '#/assets' }}>去资产库上传场景</Btn>
          </div>
        )}
      </Modal>

      <div className="grid-stats" style={{ marginTop: 14 }}>
        <div className="stat"><div className="k">镜头数</div><div className="v">{ep?.shots.length || 0}<small>镜</small></div></div>
        <div className="stat"><div className="k">平均镜长</div><div className="v">{(ep?.shots.length ? dur / ep.shots.length : 0).toFixed(2)}<small>s</small></div></div>
        <div className="stat"><div className="k">台词镜</div><div className="v">{ep?.shots.filter((s) => s.dialogue).length || 0}<small>条</small></div></div>
        <div className="stat"><div className="k">景别种类</div><div className="v">{new Set((ep?.shots || []).map((s) => s.size)).size}<small>/7</small></div></div>
        <div className="stat"><div className="k">情绪峰值</div><div className="v">{Math.max(0, ...(ep?.shots || []).map((s) => Number(s.intensity) || 0))}<small>/5</small></div></div>
      </div>
    </div>
  )
}
