import React, { useEffect, useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { buildComfyBundle, buildComfyAssetBundle, download, saveToExports } from '../lib/exporters'
import { Btn, Panel, Sel, Tag, Field, Text } from '../ui.jsx'
import { COMFY_VARS } from '../lib/comfy.js'
import SkillSelect from './SkillSelect.jsx'

/**
 * ComfyUI 任务包（一期）
 *
 * 这里只做四件事：挂工作流、探地址、导出任务包、回收渲染结果。
 * 真正的跑图在 comfy-run.mjs 里做 —— 浏览器管不了几十分钟的长任务，
 * 关掉页面就该继续跑，所以那一半交给脚本。
 */
export default function ComfyPanel({ notify, kind = 'image' }) {
  const { project, actions } = useProject()
  const [wfId, setWfId] = useState('')
  const [list, setList] = useState([])
  const [url, setUrl] = useState('')
  const [cfgFrom, setCfgFrom] = useState('')
  const [probe, setProbe] = useState(null)
  const [busy, setBusy] = useState('')
  const [collected, setCollected] = useState(null)
  // 05 页一个面板管两种任务：镜头（ep{N}/）与角色资产（assets/）。生视频页只有镜头。
  const [scope, setScope] = useState('shots')
  // 规则跟着「生图 / 生视频」页的 meta 走：同一件事不该在两处各选一次
  const metaSkill = kind === 'video' ? project.meta?.skillVideo : project.meta?.skillPrompt
  const [skillIds, setSkillIds] = useState(Array.isArray(metaSkill) ? metaSkill : [])
  const fileRef = useRef(null)

  const loadList = async () => {
    const j = await fetch('/api/comfy/workflows').then((r) => r.json()).catch(() => null)
    const items = j?.items || []
    setList(items)
    if (!wfId && items.length) setWfId(items[0].id)
    return items
  }

  useEffect(() => {
    // 地址与默认工作流存在 设置 → ComfyUI 里，页面只做「就地覆盖」。
    // 之前每个面板各自手填地址，换个页面就得重填一次，还容易填错端口。
    const boot = async () => {
      try {
        const j = await fetch('/api/comfy/config').then((r) => r.json())
        if (j?.ok && j.config) {
          setUrl((prev) => prev || j.config.url || '')
          setCfgFrom(j.config.url || '')
          if (j.config.workflowId) setWfId((prev) => prev || j.config.workflowId)
        }
      } catch {
        /* 读不到就用空地址，用户手填 */
      }
      await loadList()
    }
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = list.find((x) => x.id === wfId) || null

  const uploadWf = async (file) => {
    if (!file) return
    setBusy('读文件')
    try {
      const txt = await file.text()
      let wf = null
      try {
        wf = JSON.parse(txt)
      } catch {
        notify?.('这不是合法 JSON')
        return
      }
      const j = await fetch('/api/comfy/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name.replace(/\.json$/i, ''), workflow: wf }),
      }).then((r) => r.json())
      if (!j?.ok) {
        notify?.(j?.error || '工作流没存进去')
        return
      }
      notify?.(j.warning || `已存工作流 ${j.id}：${j.nodes} 个节点，${j.placeholders.length} 个占位符`)
      await loadList()
      setWfId(j.id)
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    setBusy('探测')
    try {
      const j = await fetch('/api/comfy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).then((r) => r.json())
      setProbe(j)
      notify?.(j.ok ? `连上了：${j.version || j.base} ${j.device || ''}`.trim() : j.error)
    } finally {
      setBusy('')
    }
  }

  const exportBundle = async () => {
    if (!cur) {
      notify?.('先挂一份工作流')
      return
    }
    setBusy('导出')
    try {
      const wfj = await fetch(`/api/comfy/workflows?id=${encodeURIComponent(cur.id)}`)
        .then((r) => r.json())
        .catch(() => null)
      // 列表接口不返回工作流正文，这里从 data/workflows 里直接读一份
      const wf = wfj?.workflow || null
      if (!wf) {
        notify?.('读不到工作流正文——重新上传一次这份 JSON')
        return
      }
      // 选中了 skill 就把正文取来随包带上：任务包多一件 skill-rules.md
      let skills = []
      if (skillIds.length) {
        const dj = await fetch('/api/skills/docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: skillIds }),
        })
          .then((r) => r.json())
          .catch(() => null)
        skills = dj?.docs || []
        if (!skills.length) notify?.('skill 正文没读到，任务包不带规则文件')
      }
      const files =
        scope === 'assets'
          ? buildComfyAssetBundle(project, wf, { comfyUrl: url, workflowId: cur.id, skills })
          : buildComfyBundle(project, wf, { kind, comfyUrl: url, workflowId: cur.id, skills })
      for (const f of files) {
        download(f.name, f.content)
        await saveToExports(f.name, f.content).catch(() => null)
      }
      notify?.(`任务包已导出 ${files.length} 个文件，写进 exports/ 了`)
    } finally {
      setBusy('')
    }
  }

  const collect = async () => {
    setBusy('回收')
    try {
      const j = await fetch('/api/comfy/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json())
      if (!j?.ok) {
        notify?.(j?.error || '回收失败')
        return
      }
      if (!j.count) {
        notify?.(j.hint || 'renders/ 下还没有东西')
        setCollected({ count: 0, applied: 0 })
        return
      }
      let applied = 0
      let appliedAssets = 0
      for (const it of j.items) {
        if (!it.assetJobId) continue
        actions.updateAssetJob(it.assetJobId, { render: it.path, at: it.at })
        appliedAssets++
      }
      const byEp = new Map()
      for (const it of j.items) {
        if (!it.shotNo) continue
        if (!byEp.has(it.epNo)) byEp.set(it.epNo, new Map())
        const m = byEp.get(it.epNo)
        if (!m.has(it.shotNo)) m.set(it.shotNo, [])
        m.get(it.shotNo).push(it)
      }
      for (const ep of project.episodes || []) {
        const m = byEp.get(ep.no)
        if (!m) continue
        for (const shot of ep.shots || []) {
          const hits = m.get(shot.no)
          if (!hits?.length) continue
          const renders = hits.map((h) => ({
            path: h.path,
            kind: h.kind,
            workflowHash: cur?.id ? String(cur.id) : '',
            at: h.at,
          }))
          actions.updateShot(ep.id, shot.id, { renders })
          applied++
        }
      }
      setCollected({ count: j.count, applied, appliedAssets, unmatched: j.unmatched })
      const parts = []
      if (applied) parts.push(`${applied} 个镜头`)
      if (appliedAssets) parts.push(`${appliedAssets} 条资产`)
      notify?.(`回收 ${j.count} 个文件，落到 ${parts.join(' / ') || '0 处'}`)
    } finally {
      setBusy('')
    }
  }

  const placeholders = cur?.placeholders || []
  const missing = COMFY_VARS.filter((v) => !placeholders.includes(v.k)).map((v) => v.k)
  const totalShots = (project.episodes || []).reduce((n, e) => n + (e.shots || []).length, 0)
  const doneShots = (project.episodes || []).reduce((n, e) => n + (e.shots || []).filter((s) => (s.renders || []).length).length, 0)
  const assetJobs = project.assetJobs || []
  const doneAssets = assetJobs.filter((x) => x.render).length

  return (
    <>
      <Panel
        title="ComfyUI 任务包"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {scope === 'assets'
              ? assetJobs.length > 0 && <Tag level={doneAssets ? 'ok' : 'warn'}>{doneAssets}/{assetJobs.length} 张资产已出</Tag>
              : doneShots > 0 && <Tag level="ok">{doneShots}/{totalShots} 镜已出图</Tag>}
            <Btn size="sm" variant="ghost" onClick={collect} disabled={!!busy}>
              回收渲染结果
            </Btn>
          </div>
        }
      >
        {kind === 'image' && (
          <div className="links" style={{ marginBottom: 10 }}>
            <span className={`chip ${scope === 'shots' ? 'on' : ''}`} onClick={() => setScope('shots')}>
              镜头提示词
            </span>
            <span className={`chip ${scope === 'assets' ? 'on' : ''}`} onClick={() => setScope('assets')}>
              角色资产
            </span>
            <span className="dim" style={{ fontSize: 10.5, marginLeft: 4 }}>
              {scope === 'assets'
                ? `${assetJobs.length} 条资产任务，成品落在 renders/assets/`
                : `${totalShots} 镜，成品落在 renders/ep{N}/`}
            </span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
          <Field label="工作流" hint={cur ? `${cur.nodes} 个节点 · ${placeholders.length} 个占位符` : '还没挂工作流'}>
            <Sel
              value={wfId}
              onChange={setWfId}
              options={list.length ? list.map((w) => ({ value: w.id, label: w.id })) : [{ value: '', label: '（还没有工作流——点右边选文件）' }]}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => uploadWf(e.target.files?.[0])} />
          <Btn size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            选工作流 JSON
          </Btn>
          <span className="dim" style={{ fontSize: 11 }}>必须是 ComfyUI 菜单里 Export (API) 导出的那份</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label="ComfyUI 地址">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Text value={url} onChange={setUrl} placeholder="http://127.0.0.1:8188" />
                {url && url !== cfgFrom && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    title="把当前地址写进「设置 → ComfyUI」，以后不用再填"
                    onClick={async () => {
                      const j = await fetch('/api/comfy/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                      }).then((r) => r.json())
                      if (j.ok) {
                        setCfgFrom(j.config.url)
                        notify?.('地址已存为默认')
                      } else notify?.(j.error || '保存失败')
                    }}
                  >
                    存为默认
                  </Btn>
                )}
              </div>
            </Field>
          </div>
          <Btn size="sm" onClick={test} disabled={!!busy}>
            {busy === '探测' ? '探测中…' : '测试连通'}
          </Btn>
          <SkillSelect
            label=""
            value={skillIds}
            onChange={(v) => {
              setSkillIds(v)
              actions.setMeta(kind === 'video' ? { skillVideo: v } : { skillPrompt: v })
            }}
          />
          <Btn size="sm" onClick={exportBundle} disabled={!!busy || !cur}>
            {busy === '导出' ? '导出中…' : '导出任务包'}
          </Btn>
        </div>

        {probe && (
          <div style={{ fontSize: 11.5, marginBottom: 8, color: probe.ok ? 'var(--ok)' : 'var(--err)' }}>
            {probe.ok ? `✓ ${probe.version} · ${probe.device} · ${probe.ms}ms` : `✗ ${probe.error}`}
          </div>
        )}

        {cur && missing.length > 0 && (
          <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>
            这份工作流里没写这些占位符：{missing.join(' / ')} —— 不写就不会被替换，每一镜都会是同一张。
          </div>
        )}

        <div className="dim" style={{ fontSize: 11, lineHeight: 1.75 }}>
          跑法：把导出的 <span className="mono">*comfy-tasks.json</span>、<span className="mono">comfy-run.mjs</span> 放同一目录，
          在跑图那台机器上 <span className="mono">node comfy-run.mjs --url {url}</span>；
          跑完把 <span className="mono">renders/</span> 拷回项目根目录，点右上「回收渲染结果」。
        </div>

        {collected && (
          <div style={{ fontSize: 11.5, marginTop: 8 }}>
            上次回收：{collected.count} 个文件，落到 {collected.applied} 个镜头
            {collected.unmatched ? `（${collected.unmatched} 个文件名里没有 _s镜号，没法自动对）` : ''}。
          </div>
        )}
      </Panel>
    </>
  )
}
