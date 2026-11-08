/**
 * 自定义画风的拉取与保存。
 *
 * 内置 28 条在 schema.js 的 STYLES 里；这里负责把后端 data/styles.json 里的自定义项
 * registerStyles() 进同一张表，让全站的 STYLES[id] 与 Object.values(STYLES) 自动包含它们。
 * 保存/删除后广播 mjw:styles，App 顶层收一次 setState 触发重渲染（注册是原地改对象，React 看不见）。
 */

import { registerStyles, unregisterStyle } from './schema.js'

const emit = () => {
  try {
    window.dispatchEvent(new CustomEvent('mjw:styles'))
  } catch {}
}

export async function loadStyles() {
  try {
    const r = await fetch('/api/styles')
    const j = await r.json()
    const list = Array.isArray(j?.custom) ? j.custom : []
    registerStyles(list)
    emit()
    return list
  } catch {
    return []
  }
}

export async function saveStyle(body) {
  const r = await fetch('/api/styles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const j = await r.json()
  if (!j?.ok) throw new Error(j?.error || '保存失败')
  registerStyles([j.style])
  emit()
  return j
}

export async function deleteStyle(id) {
  const r = await fetch('/api/styles/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const j = await r.json()
  if (!j?.ok) throw new Error(j?.error || '删除失败')
  unregisterStyle(id)
  emit()
  return j
}
