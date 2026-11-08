import React, { useEffect, useMemo, useState } from 'react'
import { Btn, Tag } from '../ui.jsx'

const SORTS = [
  { id: 'stars', label: 'Star' },
  { id: 'downloads', label: '下载量' },
]

/** 20800 → 2.1 万 */
function fmt(n) {
  const v = Number(n) || 0
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')} 万`
  return String(v)
}

export default function SkillPanel({ notify }) {
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ fetchedAt: '', source: '', warning: '' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sort, setSort] = useState('stars')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function load(refresh) {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setErr('')
    try {
      const r = await fetch(`/api/skills${refresh ? '?refresh=1' : ''}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '拉取失败')
      setItems(j.items || [])
      setMeta({ fetchedAt: j.fetchedAt || '', source: j.source || '', warning: j.warning || '' })
      if (refresh) notify?.('已从 GitHub 刷新榜单')
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function install(it) {
    setBusy(it.fullName)
    try {
      const r = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: it.fullName }),
      })
      const j = await r.json()
      if (!j.ok) {
        notify?.(j.error || '下载失败')
        return
      }
      setItems((list) =>
        list.map((x) =>
          x.fullName === it.fullName
            ? { ...x, installed: true, installedAt: new Date().toISOString(), localPath: j.dir, installMode: j.mode, downloads: j.downloads || x.downloads }
            : x,
        ),
      )
      notify?.(`已下载 ${it.name}（${j.mode === 'repo' ? '整包' : '说明文档'}）`)
    } catch (e) {
      notify?.(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  async function remove(it) {
    if (!window.confirm(`删掉本地这份 ${it.name}？`)) return
    setBusy(it.fullName)
    try {
      const r = await fetch('/api/skills/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: it.fullName }),
      })
      const j = await r.json()
      if (!j.ok) {
        notify?.(j.error || '删除失败')
        return
      }
      setItems((list) =>
        list.map((x) => (x.fullName === it.fullName ? { ...x, installed: false, localPath: '', installMode: '' } : x)),
      )
      notify?.(`已删除 ${it.name}`)
    } catch (e) {
      notify?.(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  function copyPath(p) {
    if (!p) return
    navigator.clipboard?.writeText(p)
    notify?.('路径已复制')
  }

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const list = items.filter((it) => {
      if (!kw) return true
      return `${it.fullName} ${it.desc} ${it.topics.join(' ')}`.toLowerCase().includes(kw)
    })
    return [...list].sort((a, b) =>
      sort === 'downloads' ? b.downloads - a.downloads || b.stars - a.stars : b.stars - a.stars,
    )
  }, [items, q, sort])

  const done = items.filter((x) => x.installed).length
  const when = meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString('zh-CN', { hour12: false }) : '还没拉过'

  return (
    <>
      <div className="drawer-sec">
        <h4>Skill 市场</h4>
        <div className="sk-tools">
          <input
            className="sk-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜漫剧 / 分镜 / storyboard…"
          />
          <span className="sk-sort">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip ${sort === s.id ? 'on' : ''}`}
                onClick={() => setSort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </span>
          <Btn size="sm" variant="ghost" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? '刷新中…' : '刷新榜单'}
          </Btn>
        </div>
        <div className="sk-meta">
          <Tag>{items.length} 个</Tag>
          <Tag level="ok">已下载 {done}</Tag>
          <span className="dim">榜单更新：{when}</span>
        </div>
        {meta.warning ? <div className="sk-warn">{meta.warning}</div> : null}
        {err ? <div className="sk-warn">{err}</div> : null}
      </div>

      <div className="drawer-sec">
        <div className="sk-list">
          {loading && <div className="sk-empty">正在从 GitHub 拉榜单…</div>}
          {!loading && !shown.length && <div className="sk-empty">没有匹配的仓库</div>}
          {shown.map((it, i) => (
            <div className={`sk-row ${it.installed ? 'is-on' : ''}`} key={it.fullName}>
              <span className="sk-rank">{i + 1}</span>
              <div className="sk-main">
                <div className="sk-title">
                  <button type="button" className="sk-name" onClick={() => window.open(it.url, '_blank')}>
                    {it.name}
                  </button>
                  <em>{it.owner}</em>
                  {it.installed ? <Tag level="ok">已下载</Tag> : null}
                </div>
                <div className="sk-desc">{it.desc || '（这个仓库没写简介）'}</div>
                {it.installed && it.localPath ? (
                  <button type="button" className="sk-path" onClick={() => copyPath(it.localPath)}>
                    {it.localPath}
                  </button>
                ) : null}
              </div>
              <div className="sk-nums">
                <i title="Star 数">★ {fmt(it.stars)}</i>
                <i title="Fork 数">⑂ {fmt(it.forks)}</i>
                <i title="Release 资产下载合计；没有 Release 就是 0">↓ {fmt(it.downloads)}</i>
              </div>
              <div className="sk-act">
                {it.installed ? (
                  <Btn size="sm" variant="ghost" onClick={() => remove(it)} disabled={busy === it.fullName}>
                    {busy === it.fullName ? '…' : '删除'}
                  </Btn>
                ) : (
                  <Btn size="sm" variant="primary" onClick={() => install(it)} disabled={busy === it.fullName}>
                    {busy === it.fullName ? '下载中…' : '下载'}
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
