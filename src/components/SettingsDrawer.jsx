import React, { useEffect, useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { PLATFORMS, STYLES, platform, styleOf, stylesByGroup } from '../lib/schema'
import { saveStyle, deleteStyle } from '../lib/styles.js'
import { THEMES, FONTS, SCALES, AUTOSAVE_SECS, loadPrefs, savePrefs, applyPrefs } from '../lib/uiPrefs.js'
import { Btn, Field, Text, Area, Sel, Tag } from '../ui.jsx'
import AiPanel from './AiPanel.jsx'
import SkillPanel from './SkillPanel.jsx'
import { LS_ONBOARD } from './OnboardingBar.jsx'

const TABS = [
  { id: 'look', label: '外观' },
  { id: 'ai', label: 'AI 接入' },
  { id: 'store', label: '存储' },
  { id: 'proj', label: '项目' },
  { id: 'style', label: '画风' },
  { id: 'skill', label: 'Skill' },
  { id: 'comfy', label: 'ComfyUI' },
  { id: 'help', label: '帮助' },
]

/** 一行路径：标签 + 等宽值 + 复制 */
function PathRow({ k, v, onCopy }) {
  return (
    <div className="path-row">
      <span className="pk">{k}</span>
      <span className="pv" title={v}>{v}</span>
      <button type="button" className="opt" style={{ padding: '2px 7px', fontSize: 11 }} onClick={() => onCopy?.(v)}>
        复制
      </button>
    </div>
  )
}

/**
 * 设置抽屉：从侧栏左下角打开，盖在左侧。
 * 外观（主题/字体/密度）走 localStorage，改了立刻生效；
 * AI 接入走 /api/ai 代理；存储位置写 settings.json，重启生效。
 */
export default function SettingsDrawer({ open, onClose, notify }) {
  const { project, actions, apiOk } = useProject()
  const [tab, setTab] = useState('look')
  const [prefs, setPrefs] = useState(loadPrefs())
  const [store, setStore] = useState(null)
  const [dataInput, setDataInput] = useState('')
  const [storeMsg, setStoreMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [sf, setSf] = useState({ name: '', anchor: '', negative: '', note: '' })
  const [sfBusy, setSfBusy] = useState(false)
  const [cf, setCf] = useState({ url: '', workflowId: '', autoCollect: false, timeoutMs: 20000 })
  const [cfFile, setCfFile] = useState('')
  const [cfList, setCfList] = useState([])
  const [cfBusy, setCfBusy] = useState(false)
  const [cfMsg, setCfMsg] = useState('')
  const [cfProbe, setCfProbe] = useState(null)

  const pf = project ? platform(project) : null
  const st = project ? styleOf(project) : null

  // 打开时把已保存的偏好再应用一次（防止别处改过 html 属性）
  useEffect(() => {
    if (open) setPrefs(applyPrefs(loadPrefs()))
  }, [open])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const loadStore = async () => {
    try {
      const r = await fetch('/api/settings')
      const j = await r.json()
      if (j?.ok) {
        setStore(j)
        setDataInput(j.dataDir)
      }
    } catch {
      setStoreMsg('读取失败：后端没起来？')
    }
  }

  useEffect(() => {
    if (open && tab === 'store' && !store) loadStore()
    if (open && tab === 'comfy') loadComfy()
  }, [open, tab, store])

  const update = (p) => {
    const next = applyPrefs({ ...prefs, ...p })
    setPrefs(next)
    savePrefs(next)
  }

  const loadComfy = async () => {
    try {
      const [c, w] = await Promise.all([
        fetch('/api/comfy/config').then((r) => r.json()),
        fetch('/api/comfy/workflows').then((r) => r.json()),
      ])
      if (c?.ok) setCf({ ...c.config, file: c.file })
      if (w?.ok) setCfList(w.items || [])
    } catch {
      setCfMsg('读取失败：后端没起来？')
    }
  }

  const saveComfy = async (patch = {}) => {
    setCfBusy(true)
    setCfMsg('')
    try {
      const r = await fetch('/api/comfy/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cf.url, workflowId: cf.workflowId, autoCollect: cf.autoCollect, timeoutMs: cf.timeoutMs, ...patch }),
      })
      const j = await r.json()
      if (!j.ok) {
        setCfMsg(j.error || '保存失败')
        return
      }
      setCf({ ...j.config, file: j.file })
      setCfMsg('已保存')
      notify?.('ComfyUI 配置已保存')
    } catch (e) {
      setCfMsg('保存失败：' + String(e.message || e))
    } finally {
      setCfBusy(false)
    }
  }

  const probeComfy = async () => {
    setCfBusy(true)
    setCfProbe(null)
    try {
      const j = await fetch('/api/comfy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cf.url }),
      }).then((r) => r.json())
      setCfProbe(j)
    } catch (e) {
      setCfProbe({ ok: false, error: String(e.message || e) })
    } finally {
      setCfBusy(false)
    }
  }

  const uploadComfyWf = async (file) => {
    if (!file) return
    setCfBusy(true)
    setCfMsg('')
    try {
      const text = await file.text()
      let wf
      try {
        wf = JSON.parse(text)
      } catch {
        setCfMsg('这个文件不是合法 JSON')
        return
      }
      const id = String(file.name).replace(/\.json$/i, '')
      const j = await fetch('/api/comfy/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workflow: wf }),
      }).then((r) => r.json())
      if (!j.ok) {
        setCfMsg(j.error || '上传失败')
        return
      }
      setCfMsg('已导入 ' + j.id + (j.warning ? '：' + j.warning : ''))
      if (!cf.workflowId) await saveComfy({ workflowId: j.id })
      await loadComfy()
    } catch (e) {
      setCfMsg('上传失败：' + String(e.message || e))
    } finally {
      setCfBusy(false)
    }
  }

  const delComfyWf = async (id) => {
    if (!window.confirm('删掉工作流「' + id + '」？')) return
    const j = await fetch('/api/comfy/workflows/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then((r) => r.json())
    if (j.ok) {
      if (cf.workflowId === id) await saveComfy({ workflowId: '' })
      await loadComfy()
      notify?.('工作流已删除')
    } else notify?.(j.error || '删除失败')
  }

  const submitStyle = async () => {
    setSfBusy(true)
    try {
      const j = await saveStyle(sf)
      setSf({ name: '', anchor: '', negative: '', note: '' })
      if (project) actions.setMeta?.({ style: j.style.id })
      notify?.(j.updated ? `已更新画风：${j.style.name}` : `已新建画风：${j.style.name}`)
    } catch (e) {
      notify?.(String(e?.message || e))
    } finally {
      setSfBusy(false)
    }
  }

  const removeStyle = async (id, name) => {
    if (!window.confirm(`删掉自定义画风「${name}」？正在用它的剧本会退回国漫厚涂。`)) return
    try {
      await deleteStyle(id)
      if (project?.meta?.style === id) actions.setMeta?.({ style: 'guoman-houtu' })
      notify?.(`已删除画风：${name}`)
    } catch (e) {
      notify?.(String(e?.message || e))
    }
  }

  const copy = async (v) => {
    try {
      await navigator.clipboard.writeText(v)
      notify?.('已复制：' + v)
    } catch {
      notify?.('复制失败，手动选中吧')
    }
  }

  const saveDataDir = async () => {
    setBusy(true)
    setStoreMsg('')
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: dataInput.trim() }),
      })
      const j = await r.json()
      if (!j?.ok) throw new Error(j?.error || '保存失败')
      setStoreMsg(
        `已写入 settings.json：${j.dataDir}${j.fresh ? '（新目录已建空台账）' : ''}。重启工作台后生效；原目录数据不会自动搬过去。`,
      )
      setStore((s) => ({ ...(s || {}), dataDir: j.dataDir, needRestart: true }))
      notify?.('存储位置已保存，重启后生效')
    } catch (e) {
      setStoreMsg('保存失败：' + String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    if (!project) return null
    return {
      episodes: project.episodes.length,
      shots: project.episodes.reduce((n, e) => n + e.shots.length, 0),
      chars: project.characters.length,
      assets: project.assets.length,
    }
  }, [project])

  if (!open) return null

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="设置">
        <div className="drawer-head">
          <h2>设置</h2>
          <span className="dim" style={{ fontSize: 11 }}>偏好只存本机</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="drawer-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`drawer-tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'look' && (
            <>
              <div className="drawer-sec">
                <h4>主题颜色</h4>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`theme-swatch ${prefs.theme === t.id ? 'on' : ''}`}
                      onClick={() => update({ theme: t.id })}
                      title={t.desc}
                    >
                      <i style={{ background: t.swatch }} />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="drawer-sec">
                <h4>字体</h4>
                <div className="opt-row">
                  {FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`opt ${prefs.font === f.id ? 'on' : ''}`}
                      onClick={() => update({ font: f.id })}
                      title={f.desc}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="drawer-sec">
                <h4>界面密度</h4>
                <div className="opt-row">
                  {SCALES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`opt ${prefs.scale === s.id ? 'on' : ''}`}
                      onClick={() => update({ scale: s.id })}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="drawer-sec">
                <h4>恢复默认</h4>
                <Btn size="sm" onClick={() => update({ theme: 'ink', font: 'system', scale: 'm', autosave: true, autosaveSec: 30 })}>
                  回到墨纸朱砂 · 标准 · 30s 自动保存
                </Btn>
              </div>
            </>
          )}

          {tab === 'ai' && (
            <>
              <AiPanel notify={notify} compact />
            </>
          )}

          {tab === 'store' && (
            <>
              <div className="drawer-sec">
                <h4>自动保存</h4>
                <div className="opt-row">
                  <button
                    type="button"
                    className={`opt ${prefs.autosave !== false ? 'on' : ''}`}
                    onClick={() => update({ autosave: true })}
                  >
                    开启
                  </button>
                  <button
                    type="button"
                    className={`opt ${prefs.autosave === false ? 'on' : ''}`}
                    onClick={() => update({ autosave: false })}
                  >
                    关闭
                  </button>
                </div>
                <div className="opt-row" style={{ marginTop: 8 }}>
                  {AUTOSAVE_SECS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`opt ${Number(prefs.autosaveSec) === a.id ? 'on' : ''}`}
                      onClick={() => update({ autosaveSec: a.id })}
                      title={a.desc || ''}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="drawer-sec">
                <h4>当前路径</h4>
                {store ? (
                  <>
                    <PathRow k="项目根" v={store.root} onCopy={copy} />
                    <PathRow k="台账数据" v={store.dataDir} onCopy={copy} />
                    <PathRow k="剧本文件" v={store.scriptsDir} onCopy={copy} />
                    <PathRow k="投产导出" v={store.exportsDir} onCopy={copy} />
                    <PathRow k="上传素材" v={store.uploadDir} onCopy={copy} />
                    <PathRow k="配置文件" v={store.settingsFile} onCopy={copy} />
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Tag level={apiOk ? 'ok' : 'warn'}>{apiOk ? '后端已连上' : '后端离线'}</Tag>
                      <Tag>{store.scripts} 个剧本</Tag>
                      {store.custom && <Tag level="accent">自定义目录</Tag>}
                    </div>
                  </>
                ) : (
                  <div className="dim" style={{ fontSize: 12 }}>正在读取…</div>
                )}
              </div>

              <div className="drawer-sec">
                <h4>修改台账数据目录</h4>
                <Field label="dataDir（相对项目根或绝对路径，留空恢复默认 data/）">
                  <Text value={dataInput} onChange={setDataInput} placeholder="data 或 D:/漫剧台账" />
                </Field>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <Btn size="sm" variant="primary" onClick={saveDataDir} disabled={busy}>
                    保存
                  </Btn>
                  <Btn size="sm" onClick={() => setDataInput(store?.defaultDataDir || '')}>
                    填默认值
                  </Btn>
                  <span className="dim" style={{ fontSize: 11 }}>改完要重启工作台（关掉黑窗再双击快捷方式）</span>
                </div>
                {storeMsg && (
                  <div className="dim" style={{ fontSize: 11, lineHeight: 1.75, marginTop: 8, color: 'var(--warn)' }}>
                    {storeMsg}
                  </div>
                )}
              </div>

              <div className="drawer-sec">
                <h4>导出与素材</h4>
              </div>
            </>
          )}

          {tab === 'proj' && (
            <>
              <div className="drawer-sec">
                <h4>当前剧本</h4>
                {project ? (
                  <>
                    <Field label="剧名">
                      <Text value={project.meta.title} onChange={(v) => actions.setMeta({ title: v })} />
                    </Field>
                    <div className="row">
                      <Field label="目标平台">
                        <Sel
                          value={project.meta.platform}
                          onChange={(v) => actions.setMeta({ platform: v })}
                          options={Object.values(PLATFORMS).map((p) => p.name)}
                          map={Object.values(PLATFORMS)}
                        />
                      </Field>
                      <Field label="画风锚">
                        <Sel
                          value={project.meta.style}
                          onChange={(v) => actions.setMeta({ style: v })}
                          options={Object.values(STYLES).map((s) => s.name)}
                          map={Object.values(STYLES)}
                        />
                      </Field>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <Tag>{pf?.name || '—'}</Tag>
                      <Tag>{pf ? `${pf.ratio} · ${pf.width}×${pf.height}` : '—'}</Tag>
                      <Tag>{st?.name || '—'}画风</Tag>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {stats && (
                        <>
                          <span className="dim" style={{ fontSize: 11.5 }}>{stats.episodes} 集 · {stats.shots} 镜</span>
                          <span className="dim" style={{ fontSize: 11.5 }}>{stats.chars} 角色</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="dim" style={{ fontSize: 12 }}>还没打开剧本，去剧本库选一个。</div>
                )}
              </div>
            </>
          )}

          {tab === 'comfy' && (
            <>
              <div className="drawer-sec">
                <h4>ComfyUI 地址</h4>
                <Field label="地址">
                  <Text value={cf.url} onChange={(v) => setCf({ ...cf, url: v })} placeholder="http://127.0.0.1:8188" />
                </Field>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <Btn size="sm" onClick={() => saveComfy()} disabled={cfBusy}>
                    {cfBusy ? '处理中…' : '保存'}
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={probeComfy} disabled={cfBusy}>
                    测试连通
                  </Btn>
                </div>
                {cfProbe && (
                  <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.7 }}>
                    {cfProbe.ok ? (
                      <span style={{ color: 'var(--ok)' }}>
                        连上了 · {cfProbe.ms}ms{cfProbe.version ? ` · ComfyUI ${cfProbe.version}` : ''}
                        {cfProbe.device ? ` · ${cfProbe.device}` : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--err)' }}>没连上：{cfProbe.error}</span>
                    )}
                  </div>
                )}
                {cfMsg && <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{cfMsg}</div>}
              </div>

              <div className="drawer-sec">
                <h4>出图工作流</h4>
                <Field label="默认工作流">
                  <Sel
                    value={cf.workflowId}
                    onChange={(v) => saveComfy({ workflowId: v })}
                    options={[{ value: '', label: cfList.length ? '不指定（每次在页面里选）' : '还没有导入工作流' }].concat(
                      cfList.map((w) => ({ value: w.id, label: `${w.id}　${w.nodes || 0} 节点` }))
                    )}
                  />
                </Field>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <label className="btn sm ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    选工作流 JSON
                    <input
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        uploadComfyWf(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                {cfList.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {cfList.map((w) => (
                      <div className="kv" key={w.id} style={{ alignItems: 'center' }}>
                        <span className="k" style={{ width: 168, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.id}</span>
                        <span className="v" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="dim" style={{ fontSize: 11 }}>{w.nodes || 0} 节点 · {(w.placeholders || []).length} 占位符</span>
                          <button type="button" className="li-del" onClick={() => delComfyWf(w.id)} title="删除这个工作流">×</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="dim" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 8 }}>
                  从 ComfyUI 菜单里的 Workflow → Export (API) 导出的那份才认；画布格式（带 nodes / links）会被拒绝。
                </div>
              </div>

              <div className="drawer-sec">
                <h4>跑完之后</h4>
                <div className="kv">
                  <span className="k">自动回收</span>
                  <span className="v">
                    <Btn size="sm" variant={cf.autoCollect ? 'solid' : 'ghost'} onClick={() => saveComfy({ autoCollect: !cf.autoCollect })}>
                      {cf.autoCollect ? '开' : '关'}
                    </Btn>
                  </span>
                </div>
                <div className="dim" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 8 }}>
                  打开后，导出任务包时会把「回收」这一步也写进 README 的提示里。实际的图仍然要等脚本跑完，回「生图 / 生视频」页点一次「回收渲染结果」。
                </div>
                <div className="kv" style={{ marginTop: 8 }}>
                  <span className="k">配置文件</span>
                  <span className="v" style={{ fontSize: 11 }}>{cf.file || 'data/comfy.json'}</span>
                </div>
              </div>
            </>
          )}

          {tab === 'skill' && <SkillPanel notify={notify} />}

          {tab === 'help' && (
            <>
              <div className="drawer-sec">
                <h4>新手引导</h4>
                <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 8 }}>
                  那条「四步做完一集」的提示只在第一次出现。想再看一次，点下面这个按钮，然后回总览或任意页就能看到。
                </div>
                <Btn
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem(LS_ONBOARD)
                    notify?.('已重新打开新手引导，回任意页面就能看到')
                  }}
                >
                  再看一次新手引导
                </Btn>
              </div>

              <div className="drawer-sec">
                <h4>清掉本地提示偏好</h4>
                <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 8 }}>
                  会把这些一次性的小提示全部恢复成「没看过」：新手引导、AI 对话的隐私提示、分镜表列显示。
                </div>
                <Btn
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem(LS_ONBOARD)
                    localStorage.removeItem('mjw:chat:privacy-acked')
                    localStorage.removeItem('mjw:shots:extracols')
                    notify?.('已清空提示偏好，刷新页面后重新出现')
                  }}
                >
                  清空提示偏好
                </Btn>
              </div>

              <div className="drawer-sec">
                <h4>快捷键</h4>
                <div className="kv"><span className="k">Esc</span><span className="v">关闭这个抽屉 / 弹窗</span></div>
                <div className="kv"><span className="k">Ctrl + V</span><span className="v">在参考图 / 服装图的框里直接粘贴图片</span></div>
                <div className="kv"><span className="k">Enter</span><span className="v">AI 对话框里发送（Shift + Enter 换行）</span></div>
              </div>
            </>
          )}

          {tab === 'style' && (
            <>
              <div className="drawer-sec">
                <h4>当前画风</h4>
                <div className="style-now">
                  <b>{st?.name || '—'}</b>
                  <span>{st?.note || st?.anchor || '—'}</span>
                </div>
              </div>

              {stylesByGroup().map((g) => (
                <div className="drawer-sec" key={g.id}>
                  <h4>
                    {g.name} <span className="dim" style={{ fontWeight: 400 }}>{g.items.length}</span>
                  </h4>
                  <div className="style-grid">
                    {g.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`style-card ${project?.meta?.style === s.id ? 'on' : ''}`}
                        onClick={() => project && actions.setMeta?.({ style: s.id })}
                        title={s.anchor || ''}
                      >
                        <b>{s.name}</b>
                        <span>{s.note || (s.anchor || '').slice(0, 34) + '…'}</span>
                        {s.custom && (
                          <em
                            className="style-del"
                            title="删掉这条自定义画风"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeStyle(s.id, s.name)
                            }}
                          >
                            ×
                          </em>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="drawer-sec">
                <h4>新建自定义画风</h4>
                <Field label="画风名（≤24 字）">
                  <Text value={sf.name} onChange={(v) => setSf({ ...sf, name: v })} placeholder="例：青绿山水 · 冷调" />
                </Field>
                <Field label="正向锚定词（英文串最好，≤600 字）">
                  <Area
                    value={sf.anchor}
                    onChange={(v) => setSf({ ...sf, anchor: v })}
                    rows={3}
                    placeholder="chinese blue-green landscape, cold palette, mineral pigment, misty layered mountain, matte finish"
                  />
                </Field>
                <Field label="负向词（可空）">
                  <Area
                    value={sf.negative}
                    onChange={(v) => setSf({ ...sf, negative: v })}
                    rows={2}
                    placeholder="warm orange grade, photorealistic, heavy grain"
                  />
                </Field>
                <Field label="一句话备注（给自己看的）">
                  <Text value={sf.note} onChange={(v) => setSf({ ...sf, note: v })} placeholder="例：山水空镜与片头用" />
                </Field>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <Btn size="sm" variant="primary" onClick={submitStyle} disabled={sfBusy}>
                    {sfBusy ? '保存中…' : '保存并切到这条'}
                  </Btn>
                  <span className="dim" style={{ fontSize: 11 }}>存在 data/styles.json，所有剧本共用</span>
                </div>
              </div>

            </>
          )}
        </div>
      </aside>
    </>
  )
}
