import React, { useEffect, useRef, useState } from 'react'
import { Tag } from '../ui.jsx'

const MAX = 4

/** 兼容旧数据：字符串 / 数组都归一成数组 */
function asList(v) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : []
  return arr.map((x) => String(x || '').trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, MAX)
}

/**
 * 已下载 skill 的规则选择器（可多选）。
 * value = skills.json 里的 id 数组。选中的 skill 文档会被拼到 AI 定向的 system 末尾。
 */
export default function SkillSelect({ value, onChange, label = '规则' }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const picked = asList(value)

  useEffect(() => {
    let dead = false
    fetch('/api/skills/installed')
      .then((r) => r.json())
      .then((j) => {
        if (!dead && j.ok) setItems(j.items || [])
      })
      .catch(() => {})
    return () => {
      dead = true
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const byId = new Map(items.map((x) => [x.id, x]))
  // 用 ref 兜住最新选择：连续快速点击时，闭包里的 picked 还是旧值，会互相覆盖
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  const toggle = (id) => {
    const cur = pickedRef.current
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, MAX)
    pickedRef.current = next
    onChange(next)
  }
  // 实际注入的字节：每份按份数均分（单份上限 4000），再和文档长度取小
  const perFor = (k) => Math.max(800, Math.min(4000, Math.floor(11000 / Math.max(1, k))))
  const inject = picked.reduce((sum, id) => sum + Math.min(byId.get(id)?.docChars || 0, perFor(picked.length)), 0)

  return (
    <div className="sk-pick" ref={boxRef}>
      {label ? <span className="sk-pick-l">{label}</span> : null}
      <button
        type="button"
        className={`sk-pick-btn ${picked.length ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="可以同时挂多个 skill 的规则"
      >
        {picked.length ? `已挂 ${picked.length} 份规则` : items.length ? '不挂 skill 规则' : '还没有下载 skill'}
        <i>{open ? '▴' : '▾'}</i>
      </button>
      {picked.slice(0, 2).map((id) => (
        <span className="sk-chip" key={id} title={id}>
          {byId.get(id)?.fullName || id}
          <b
            onClick={(e) => {
              e.stopPropagation()
              toggle(id)
            }}
          >
            ×
          </b>
        </span>
      ))}
      {picked.length > 2 && <span className="sk-chip more">+{picked.length - 2}</span>}
      {picked.length > 1 && <Tag level="accent">注入约 {inject} 字</Tag>}
      {open && (
        <div className="sk-pick-doc sk-pick-list">
          <div className="sk-pick-doc-h">
            最多挂 {MAX} 份 · 冲突时按勾选顺序，前面优先
          </div>
          {!items.length && <div className="sk-pick-doc-b">去「设置 → Skill」下载一个再来</div>}
          {items.map((x) => {
            const on = picked.includes(x.id)
            return (
              <button
                type="button"
                key={x.id}
                className={`sk-item ${on ? 'on' : ''}`}
                onClick={() => toggle(x.id)}
              >
                <span className="sk-item-box">{on ? '✓' : ''}</span>
                <span className="sk-item-main">
                  <b>{x.fullName}</b>
                  <span>
                    {x.hasDoc ? `${x.docFile} · ${x.docChars} 字` : '没找到文档'}
                    {on && byId.get(x.id)?.preview ? ` · ${x.preview.slice(0, 40)}…` : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
