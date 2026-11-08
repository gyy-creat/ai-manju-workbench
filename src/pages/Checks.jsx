import React, { useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { runChecks, RULES } from '../lib/checks'
import { platform } from '../lib/schema'
import { buildMarkdown, download, saveToExports } from '../lib/exporters'
import { Btn, Panel, Tag, Stat } from '../ui.jsx'

const RULE_PAGE = {
  rate: 'voice',
  density: 'shots',
  suspense: 'story',
  hook: 'story',
  multi: 'shots',
  emotion: 'shots',
}

export default function Checks({ checks: passed, go }) {
  const { project, notify } = useProject()
  const checks = useMemo(() => runChecks(project), [project])
  const pf = platform(project)
  const [filter, setFilter] = useState('all')

  const list = checks.issues.filter((i) => (filter === 'all' ? true : i.level === filter))
  const byRule = (id) => checks.issues.filter((i) => i.rule === id)

  return (
    <div>
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat k="机检分" v={checks.score} unit="/100" />
        <Stat k="error" v={checks.errors} />
        <Stat k="warn" v={checks.warns} />
        <Stat k="info" v={checks.infos} />
        <Stat k="检查镜头" v={project.episodes.reduce((n, e) => n + e.shots.length, 0)} unit="镜" />
        <Stat k="语速区间" v={`${pf.voiceRate[0]}–${pf.voiceRate[1]}`} unit="字/秒" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {RULES.map((r) => {
          const n = byRule(r.id).length
          return (
            <div key={r.id} className="card" style={{ padding: '10px 12px', borderColor: n ? '#4a3a17' : '#234a2b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12.5 }}>{r.name}</span>
                <Tag level={n ? 'warn' : 'ok'}>{n ? `${n} 处` : '通过'}</Tag>
              </div>
              <div className="dim" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.6 }}>{r.desc}</div>
            </div>
          )
        })}
      </div>

      <div className="toolbar">
        <div className="links">
          {[
            ['all', `全部 ${checks.issues.length}`],
            ['error', `error ${checks.errors}`],
            ['warn', `warn ${checks.warns}`],
            ['info', `info ${checks.infos}`],
          ].map(([k, label]) => (
            <span key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <Btn size="sm" onClick={() => { download(`机检报告_${Date.now()}.md`, buildMarkdown(project, checks)); notify?.('报告已导出') }}>导出报告</Btn>
        <Btn size="sm" onClick={() => go('edit')}>去调整节奏 →</Btn>
      </div>

      <Panel title="问题清单" extra={<span className="dim" style={{ fontSize: 10 }}>点规则名跳转到对应编辑页</span>}>
        {list.map((i, k) => (
          <div key={k} className="issue">
            <span className="lv">
              <Tag level={i.level === 'error' ? 'err' : i.level === 'warn' ? 'warn' : 'info'}>{i.rule}</Tag>
            </span>
            <div className="body">
              <div style={{ fontSize: 12.5 }}>{i.msg}</div>
              <div className="where">
                {i.where} ·{' '}
                <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => go(RULE_PAGE[i.rule] || 'shots')}>
                  去修 →
                </span>
              </div>
            </div>
          </div>
        ))}
        {!list.length && <div className="muted" style={{ padding: 12 }}>该级别没有问题。</div>}
      </Panel>
    </div>
  )
}
