import React, { useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { platform, cn } from '../lib/schema'
import { buildVoiceCSV, download, copyText , copyWith } from '../lib/exporters'
import {
  voiceTag,
  voiceLine,
  voiceLock,
  voiceRisks,
  resolveVoice,
  voiceDisplayLabel,
  voiceSummary,
  customOf,
  presetOf,
  VOICE_PRESETS,
  VOICE_ENUMS,
  VOICE_TOOLS,
} from '../lib/voice.js'
import { Btn, Panel, Tag, Sel } from '../ui.jsx'

const NAMED = ['gender', 'age', 'pitch', 'timbre', 'rate', 'emotion']
const NAMED_LABEL = {
  gender: '性别',
  age: '年龄感',
  pitch: '基频',
  timbre: '音质',
  rate: '语速',
  emotion: '情绪基线',
}

function VoiceCard({ v, onPatch, onRemove }) {
  return (
    <div className="vc-card">
      <div className="vc-head">
        <span className="vc-seq">{v.seq || 'V—'}</span>
        <input
          className="vc-name"
          value={v.name}
          placeholder="音色名"
          maxLength={20}
          onChange={(e) => onPatch({ name: e.target.value.slice(0, 20) })}
        />
        <button type="button" className="li-del vc-del" title="删掉这条音色" onClick={onRemove}>
          ×
        </button>
      </div>

      <div className="vc-grid">
        {NAMED.map((k) => (
          <label key={k} className="vc-field">
            <span>{NAMED_LABEL[k]}</span>
            <Sel
              value={v[k] || ''}
              options={['', ...(VOICE_ENUMS[k] || [])]}
              onChange={(x) => onPatch({ [k]: x })}
            />
          </label>
        ))}
        <label className="vc-field">
          <span>口音</span>
          <input type="text" value={v.accent || ''} placeholder="标准普通话" onChange={(e) => onPatch({ accent: e.target.value })} />
        </label>
        <label className="vc-field">
          <span>气息</span>
          <input type="text" value={v.breath || ''} placeholder="尾字带气声" onChange={(e) => onPatch({ breath: e.target.value })} />
        </label>
      </div>

      <div className="vc-grid vc-grid-2">
        <label className="vc-field">
          <span>TTS 工具</span>
          <Sel value={v.tool || ''} options={['', ...VOICE_TOOLS]} onChange={(x) => onPatch({ tool: x })} />
        </label>
        <label className="vc-field">
          <span>voice_id</span>
          <input type="text" value={v.voiceId || ''} placeholder="x4_yezi" onChange={(e) => onPatch({ voiceId: e.target.value })} />
        </label>
        <label className="vc-field">
          <span>参数</span>
          <input type="text" value={v.params || ''} placeholder="speed=0.92, pitch=-4" onChange={(e) => onPatch({ params: e.target.value })} />
        </label>
        <label className="vc-field">
          <span>音色 seed</span>
          <input type="text" value={v.seed || ''} placeholder="克隆时锁这一串" onChange={(e) => onPatch({ seed: e.target.value })} />
        </label>
        <label className="vc-field">
          <span>参考音频</span>
          <input type="text" value={v.refAudio || ''} placeholder="uploads/ref/xxx.wav" onChange={(e) => onPatch({ refAudio: e.target.value })} />
        </label>
        <label className="vc-field">
          <span>参考文本</span>
          <input type="text" value={v.refText || ''} placeholder="样本里说的那句话" onChange={(e) => onPatch({ refText: e.target.value })} />
        </label>
      </div>

      <label className="vc-field vc-note">
        <span>备注</span>
        <input type="text" value={v.note || ''} placeholder="给谁用、听感一句话" onChange={(e) => onPatch({ note: e.target.value })} />
      </label>
    </div>
  )
}

export default function Voice({ notify }) {
  const { project, actions } = useProject()
  const pf = platform(project)
  const [epId, setEpId] = useState(project.episodes[0]?.id || null)
  const ep = project.episodes.find((e) => e.id === epId) || project.episodes[0]
  const rows = (ep?.shots || []).filter((s) => s.dialogue && String(s.dialogue).trim())
  const totalChars = rows.reduce((n, s) => n + cn(s.dialogue).length, 0)
  const totalDur = rows.reduce((n, s) => n + (Number(s.dur) || 0), 0)
  const voices = project.voices || []
  const rateState = (rate) => {
    const [lo, hi] = pf.voiceRate
    if (rate > hi + 0.6) return { cls: 'err', txt: '过快' }
    if (rate < lo - 0.8) return { cls: 'warn', txt: '过慢' }
    return { cls: 'ok', txt: '合规' }
  }

  const risks = voiceRisks(project.characters, voices)
  const cross = risks.filter((r) => r.text.includes('完全相同'))
  // 先列下面「自定义音色」里建的（V1 · 名字），再列 12 档预设
  const voiceOptions = [
    ...voices.map((v) => (v.seq && v.name ? `${v.seq} · ${v.name}` : v.name || v.id)),
    ...VOICE_PRESETS.map((p) => p.label),
  ]

  return (
    <div>
      <div className="toolbar">
        <div className="links">
          {project.episodes.map((e) => (
            <span key={e.id} className={`chip ${ep?.id === e.id ? 'on' : ''}`} onClick={() => setEpId(e.id)}>第{e.no}集</span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <Tag>台词 {rows.length} 条 · {totalChars} 字 · {totalDur.toFixed(1)}s</Tag>
        <Btn size="sm" variant="primary" onClick={() => { download(`配音清单_${Date.now()}.csv`, buildVoiceCSV(project)); notify?.('配音清单已导出') }}>导出配音清单</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 322px', gap: 14 }}>
        <Panel title="台词与语速">
          <div className="shots-wrap" style={{ border: 'none', background: 'transparent' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>镜</th>
                  <th style={{ width: 90 }}>说话人</th>
                  <th>台词</th>
                  <th style={{ width: 52 }}>字数</th>
                  <th style={{ width: 62 }}>时长</th>
                  <th style={{ width: 62 }}>字/秒</th>
                  <th style={{ width: 88 }}>情绪</th>
                  <th style={{ width: 168 }}>音色</th>
                  <th style={{ width: 60 }}>状态</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const n = cn(s.dialogue).length
                  const rate = n / (Number(s.dur) || 1)
                  const st = rateState(rate)
                  const ch = project.characters.find((c) => c.name === s.speaker)
                  const isCustom = ch && ch.voice && ch.voice.startsWith('V')
                  return (
                    <tr key={s.id}>
                      <td className="no" style={{ textAlign: 'center', color: 'var(--dim)' }}>{s.no}</td>
                      <td>
                        <Sel
                          value={s.speaker}
                          onChange={(v) => actions.updateShot(ep.id, s.id, { speaker: v })}
                          options={['', ...project.characters.map((c) => c.name)]}
                        />
                      </td>
                      <td style={{ fontSize: 12.5 }}>{s.dialogue}</td>
                      <td className="mono">{n}</td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={s.dur}
                          onChange={(e) => actions.updateShot(ep.id, s.id, { dur: Number(e.target.value) })}
                          style={{ width: 62, paddingLeft: 4, paddingRight: 2 }}
                        />
                      </td>
                      <td className="mono" style={{ color: st.cls === 'ok' ? 'var(--ok)' : st.cls === 'err' ? 'var(--err)' : 'var(--warn)' }}>
                        {rate.toFixed(1)}
                      </td>
                      <td className="muted">{s.emotion}</td>
                      <td title={ch ? voiceLine(ch, voices) : ''}>
                        {s.speaker && ch ? (
                          <Sel
                            value={customOf(voices, ch.voice) ? voiceDisplayLabel(ch.voice, voices) : presetOf(ch.voice).label}
                            onChange={(v) => {
                              actions.updateCharacter(ch.id, { voice: v })
                              notify?.(`${ch.name} 的音色改成 ${v}`)
                            }}
                            options={voiceOptions}
                          />
                        ) : (
                          <span className="dim" style={{ fontSize: 11 }}>
                            {s.speaker ? '未建档' : '旁白·冷静旁观'}
                          </span>
                        )}
                      </td>
                      <td><Tag level={st.cls}>{st.txt}</Tag></td>
                      <td>
                        <button
                          type="button"
                          className="row-del"
                          title="清空这一镜的台词（镜头还在，去分镜脚本可以重填）"
                          onClick={() => {
                            actions.updateShot(ep.id, s.id, { dialogue: '', speaker: '', emotion: '平静' })
                            notify?.('台词已清空')
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && (
                  <tr><td colSpan={10}><div className="empty">本集还没有台词，去分镜里填台词列</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div>
          <Panel
            title="音色表与一致性"
            extra={
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  copyText(project.characters.map((c) => voiceLock(c, voices)).join('\n\n'))
                  notify?.('全部角色的音色锁定串已复制')
                }}
              >
                复制锁定串
              </Btn>
            }
          >
            {project.characters.map((c) => {
              const v = resolveVoice(c, voices)
              const tech = [v.tool || '未选工具', v.voiceId || '无 voice_id', v.refAudio ? '有样本' : '无样本']
              const mine = risks.filter((r) => r.text.includes(c.name) && !r.text.includes('完全相同'))
              return (
                <div key={c.id} className="vt-row">
                  <div className="vt-head">
                    <span style={{ fontSize: 12 }}>{c.name}</span>
                    <Tag level={c.voice ? 'ok' : 'err'}>{voiceTag(c, voices)}</Tag>
                  </div>
                  <Sel
                    value={c.voice || ''}
                    options={['', ...voiceOptions]}
                    onChange={(x) => actions.updateCharacter(c.id, { voice: x })}
                  />
                  <div className="dim" style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.6 }}>
                    {tech.join(' · ')}
                    {v.seed ? ` · seed ${v.seed}` : ''}
                  </div>
                  {mine.map((r, i) => (
                    <div key={i} style={{ fontSize: 10.5, marginTop: 2, color: r.level === 'err' ? 'var(--err)' : r.level === 'warn' ? 'var(--warn)' : 'var(--paper-4)' }}>
                      {r.text}
                    </div>
                  ))}
                </div>
              )
            })}
            {!project.characters.length && <div className="muted">无角色</div>}

            {cross.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, padding: '5px 0', alignItems: 'flex-start', borderTop: i === 0 ? '1px solid var(--line)' : 'none' }}>
                <Tag level={r.level === 'err' ? 'err' : r.level === 'warn' ? 'warn' : 'info'}>撞音色</Tag>
                <span style={{ fontSize: 11, lineHeight: 1.6 }}>{r.text}</span>
              </div>
            ))}
            {!risks.length && (
              <div className="dim" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
                ✓ 每个角色都有独立音色与可复现参数。
              </div>
            )}
          </Panel>

          <Panel title="本集台词" style={{ marginTop: 12 }}>
            <Btn size="sm" onClick={() => {
              const t = rows.map((s) => `${s.speaker || '旁白'}：${s.dialogue}`).join('\n')
              copyWith(t, '本集台词已复制，可直接贴 TTS', notify)
            }}>复制本集台词</Btn>
          </Panel>
        </div>
      </div>

      <Panel
        title="自定义音色"
        style={{ marginTop: 14 }}
        extra={
          <span className="links">
            <Tag>{voices.length} 档</Tag>
            <Btn size="sm" onClick={() => { actions.addVoice(); notify?.('新建了一档音色') }}>＋ 新建音色</Btn>
            <Btn
              size="sm"
              variant="ghost"
              disabled={!voices.length}
              onClick={() => {
                copyText(voices.map((v) => `${voiceDisplayLabel(v.id, voices)}\n${voiceSummary(v)}\n工具 ${v.tool || '—'} ｜ voice_id ${v.voiceId || '—'} ｜ ${v.params || '—'}`).join('\n\n'))
                notify?.('自定义音色清单已复制')
              }}
            >
              复制清单
            </Btn>
          </span>
        }
      >
        {voices.length ? (
          <div className="vc-list">
            {voices.map((v) => (
              <VoiceCard
                key={v.id}
                v={v}
                onPatch={(patch) => actions.updateVoice(v.id, patch)}
                onRemove={() => {
                  const used = project.characters.filter((c) => c.voice === voiceDisplayLabel(v.id, voices)).map((c) => c.name)
                  const msg = used.length
                    ? `「${voiceDisplayLabel(v.id, voices)}」正被 ${used.join('、')} 使用，删掉后这些角色会失去音色绑定。继续？`
                    : `删掉音色「${voiceDisplayLabel(v.id, voices)}」？`
                  if (window.confirm(msg)) {
                    actions.removeVoice(v.id)
                    notify?.('音色已删除')
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="muted">还没有自定义音色。新建后可以逐项调参数，按 V1、V2 编号，直接派给角色。</div>
        )}
      </Panel>
    </div>
  )
}
