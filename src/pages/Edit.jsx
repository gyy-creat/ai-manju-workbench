import React, { useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { platform, totalDur } from '../lib/schema'
import { buildSRT, download } from '../lib/exporters'
import { Btn, Panel, Tag, Kv } from '../ui.jsx'

export default function Edit({ notify }) {
  const { project } = useProject()
  const pf = platform(project)
  const [epId, setEpId] = useState(project.episodes[0]?.id || null)
  const ep = project.episodes.find((e) => e.id === epId) || project.episodes[0]
  const dur = ep ? ep.shots.reduce((n, s) => n + (Number(s.dur) || 0), 0) : 0
  const maxDur = Math.max(dur, 1)
  const srt = buildSRT(project, ep?.no)

  return (
    <div>
      <div className="toolbar">
        <div className="links">
          {project.episodes.map((e) => (
            <span key={e.id} className={`chip ${ep?.id === e.id ? 'on' : ''}`} onClick={() => setEpId(e.id)}>第{e.no}集</span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <Btn size="sm" onClick={() => { download(`字幕_第${ep?.no}集.srt`, srt); notify?.('SRT 已导出') }}>导出本集 SRT</Btn>
      </div>

      <Panel title={`时间轴 · 第${ep?.no}集 · ${dur.toFixed(1)}s`}>
        <div style={{ display: 'flex', height: 46, gap: 1, background: 'var(--panel-3)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
          {(ep?.shots || []).map((s) => {
            const w = ((Number(s.dur) || 0) / maxDur) * 100
            const inten = Number(s.intensity) || 3
            const color = inten >= 5 ? '#8b2f2f' : inten >= 4 ? '#7a5a22' : inten >= 3 ? '#3c4a63' : '#2a3242'
            return (
              <div
                key={s.id}
                title={`镜${s.no} ${s.size} ${s.dur}s｜${s.dialogue || s.desc || ''}`}
                style={{ width: `${w}%`, background: color, borderRight: '1px solid rgba(0,0,0,.32)', fontSize: 9.5, color: '#f4f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {w > 4 ? s.no : ''}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 10.5 }} className="dim">
          <span>■ 强度≤2</span><span style={{ color: '#3c4a63' }}>■ 3</span><span style={{ color: '#7a5a22' }}>■ 4</span><span style={{ color: '#8b2f2f' }}>■ 5</span>
          <span style={{ marginLeft: 'auto' }}>平台区间 {pf.episodeSec[0]}–{pf.episodeSec[1]}s</span>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Panel title="导出参数（照抄）">
          <Kv k="分辨率" v={`${pf.width}×${pf.height}（${pf.ratio}）`} />
          <Kv k="帧率" v={`${pf.fps}fps`} />
          <Kv k="编码" v="H.264 / 码率 8–12 Mbps / 关键帧 2s" />
          <Kv k="音频" v="AAC 192kbps / 48kHz / 立体声" />
          <Kv k="字幕" v={`字号 ≥ ${pf.ratio === '9:16' ? 48 : 42}px，距底 ≥ 220px（避开平台 UI）`} />
          <Kv k="片头片尾" v="≤1.5s，无长片头（完播率杀手）" />
          <div className="hr" />
          <div className="dim" style={{ fontSize: 11 }}>{pf.notes}</div>
        </Panel>

        <Panel
          title={`字幕预览（${(srt.match(/\n\n/g) || []).length || 0} 条）`}
          extra={<Btn size="sm" variant="ghost" onClick={() => download(`字幕_第${ep?.no}集.srt`, srt)}>下载 SRT</Btn>}
        >
          <div className="pre" style={{ maxHeight: 260, overflow: 'auto' }}>{srt || '（本集没有台词）'}</div>
        </Panel>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Panel title="剪辑顺序（按镜号走）">
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            {(ep?.shots || []).map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11.5 }}>
                <span className="dim mono" style={{ width: 26 }}>{s.no}</span>
                <span className="muted" style={{ width: 88 }}>{s.size}·{s.move}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc || s.action || '（空）'}</span>
                <span className="dim">{s.dur}s</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="粗剪检查">
          {[
            { ok: dur >= pf.episodeSec[0], t: `总时长 ≥ ${pf.episodeSec[0]}s` },
            { ok: dur <= pf.episodeSec[1] + 8, t: `总时长 ≤ ${pf.episodeSec[1]}s` },
            { ok: (ep?.shots[0] && Number(ep.shots[0].dur) <= pf.hookSec + 0.5) || false, t: `首镜 ≤ ${pf.hookSec}s 钩子窗口` },
            { ok: (ep?.shots || []).slice(-1)[0]?.intensity >= 4, t: '末镜情绪 ≥4（钩住下一集）' },
            { ok: (ep?.shots || []).every((s) => Number(s.dur) > 0), t: '每镜都有时长' },
            { ok: new Set((ep?.shots || []).map((s) => s.size)).size >= 3, t: '景别 ≥3 种（有节奏）' },
          ].map((x) => (
            <div key={x.t} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
              <Tag level={x.ok ? 'ok' : 'warn'}>{x.ok ? '✓' : '待改'}</Tag>
              <span style={{ fontSize: 11.5 }}>{x.t}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="dim" style={{ fontSize: 11, marginTop: 12 }}>
        全项目合计 {totalDur(project).toFixed(1)}s ｜ 关键帧 {project.episodes.reduce((n, e) => n + e.shots.length, 0)} 张 ｜ 缺失素材见「资产库」
      </div>
    </div>
  )
}
