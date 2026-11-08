import React, { useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { Btn, Field, Text, Area, Panel, Tag } from '../ui.jsx'

const SCORE_ITEMS = [
  { key: 'logline', label: '一句话讲清冲突', test: (t) => (t.logline || '').length >= 15 },
  { key: 'memory', label: '有差异化记忆点', test: (t) => (t.memory || '').length >= 6 },
  { key: 'audience', label: '人群明确（P/E/T）', test: (t) => (t.audience || '').length >= 4 },
]

export default function Topics() {
  const { project, actions, notify } = useProject()
  const [sel, setSel] = useState(project.topics[0]?.id || null)
  const cur = project.topics.find((t) => t.id === sel) || project.topics[0]

  const upd = (patch) => cur && actions.updateTopic(cur.id, patch)

  return (
    <div className="cols">
      <div className="list-panel">
        <div className="list-head">
          <span style={{ flex: 1 }}>选题池 · {project.topics.length}</span>
          <Btn size="sm" variant="ghost" onClick={() => actions.addTopic()}>＋</Btn>
        </div>
        {project.topics.map((t) => (
          <div key={t.id} className={`list-item ${cur?.id === t.id ? 'active' : ''}`} onClick={() => setSel(t.id)}>
            <span className="n">{t.genre ? t.genre.slice(0, 2) : '—'}</span>
            <span className="t">{t.title}</span>
            <button
              type="button"
              className="li-del"
              title="删掉这条选题"
              onClick={(ev) => {
                ev.stopPropagation()
                if (!confirm(`删掉选题「${t.title || '无标题'}」？不可恢复。`)) return
                const rest = project.topics.filter((x) => x.id !== t.id)
                if (cur?.id === t.id) setSel(rest[0]?.id || null)
                actions.removeTopic(t.id)
                notify?.('选题已删掉')
              }}
            >
              ×
            </button>
          </div>
        ))}
        {!project.topics.length && <div className="empty">还没有选题<br />点右上 ＋ 新建</div>}
      </div>

      <div>
        {cur ? (
          <Panel title="选题卡">
            <Field label="标题">
              <Text value={cur.title} onChange={(v) => upd({ title: v })} />
            </Field>
            <div className="row">
              <Field label="赛道 / 类型">
                <Text value={cur.genre} onChange={(v) => upd({ genre: v })} placeholder="都市复仇 / 玄幻逆袭 / 校园甜宠" />
              </Field>
              <Field label="人群（P/E/T）">
                <Text value={cur.audience} onChange={(v) => upd({ audience: v })} placeholder="P3 小镇青年 · E2 憋屈释放 · T4 深夜" />
              </Field>
            </div>
            <Field label="Logline（一句话讲清冲突）">
              <Area rows={3} value={cur.logline} onChange={(v) => upd({ logline: v })} />
            </Field>
            <Field label="差异化记忆点（一句话能被复述的那个点）">
              <Text value={cur.memory} onChange={(v) => upd({ memory: v })} placeholder="例：他每次说谎，尸体就会多一具" />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="danger" onClick={() => { actions.removeTopic(cur.id); setSel(null) }}>删除选题</Btn>
            </div>
          </Panel>
        ) : (
          <div className="empty">选一个选题，或新建</div>
        )}
      </div>

      <div>
        <Panel title="爆款自检">
          {cur ? (
            <>
              {SCORE_ITEMS.map((it) => {
                const ok = it.test(cur)
                return (
                  <div key={it.key} style={{ display: 'flex', gap: 8, padding: '5px 0', alignItems: 'center' }}>
                    <Tag level={ok ? 'ok' : 'warn'}>{ok ? '✓' : '缺'}</Tag>
                    <span style={{ fontSize: 12 }}>{it.label}</span>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="muted">无选题</div>
          )}
        </Panel>
      </div>
    </div>
  )
}
