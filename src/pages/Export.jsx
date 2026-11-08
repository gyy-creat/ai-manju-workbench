import React, { useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { runChecks } from '../lib/checks'
import { buildPackage, deleteFromExports, download, saveToExports } from '../lib/exporters'
import { Btn, Panel, Tag } from '../ui.jsx'

const USE_RULES = [
  [/投产包/, '一份讲完全流程，给导演 / 客户看'],
  [/分镜/, 'Excel 打开，可当场记表'],
  [/提示词包.*\.txt$/, '整段贴生图工具，逐镜复制'],
  [/提示词包.*\.csv$/, '给批量脚本跑，含模型与参数列'],
  [/字幕/, '剪映 / PR 直接导入'],
  [/视频提示词.*\.txt$/, '整段贴视频工具，逐镜复制'],
  [/视频提示词.*\.csv$/, '批量跑视频工具，含时长与参考图模式'],
  [/配音/, '按说话人分配 TTS 音色，含字/秒'],
  [/素材/, '对账缺哪张关键帧'],
]
const fileUse = (name) => (USE_RULES.find(([re]) => re.test(name)) || [])[1] || ''

export default function Export({ notify }) {
  const { project, actions } = useProject()
  const checks = useMemo(() => runChecks(project), [project])
  const all = useMemo(() => buildPackage(project, checks), [project, checks])
  const skip = project.meta?.exportSkip || []
  const files = all.filter((f) => !skip.includes(f.key))
  const [saved, setSaved] = useState({})

  const kb = (s) => (new TextEncoder().encode(s).length / 1024).toFixed(1)

  const saveOne = async (f) => {
    try {
      const r = await saveToExports(f.name, f.content)
      if (r.ok) {
        setSaved((s) => ({ ...s, [f.key]: r.file }))
        notify?.(`已写入 ${r.file}`)
      } else notify?.(r.error || '写入失败')
    } catch (e) {
      notify?.('写入失败：' + e.message)
    }
  }

  const saveAll = async () => {
    for (const f of files) await saveOne(f)
    notify?.(`${files.length} 件已写入 exports/`)
  }

  // 从投产包里去掉一件：记进 meta.exportSkip（存 key，换文件名/时间戳都不影响）。
  // 如果这份之前已经落盘过，顺手把磁盘上那份删掉——不然「删了」但文件还在 exports/ 里。
  const drop = async (f) => {
    if (!window.confirm(`从投产包里去掉「${f.label}」？\n\n之后导出不会再生成这一件；随时可以点右上「恢复」加回来。`)) return
    actions.setExportSkip([...skip, f.key])
    const disk = saved[f.key]
    if (disk) {
      const r = await deleteFromExports(disk.split(/[\\/]/).pop())
      setSaved((s) => {
        const n = { ...s }
        delete n[f.key]
        return n
      })
      notify?.(r.ok ? `已去掉「${f.label}」，并删掉已落盘的那份` : `已去掉「${f.label}」（磁盘那份没删掉：${r.error || '未知原因'}）`)
    } else {
      notify?.(`已去掉「${f.label}」`)
    }
  }

  const restore = () => {
    actions.setExportSkip([])
    notify?.('投产包恢复成完整 9 件')
  }

  return (
    <div>
      <div className="toolbar">
        <Tag level={checks.errors ? 'err' : 'ok'}>
          交付门槛：error {checks.errors} / warn {checks.warns} / 分数 {checks.score}
        </Tag>
        <span style={{ flex: 1 }} />
        <Btn size="sm" onClick={saveAll} disabled={!files.length}>全部另存到 exports/</Btn>
        <Btn size="sm" variant="primary" disabled={!files.length} onClick={() => files.forEach((f, i) => setTimeout(() => download(f.name, f.content), i * 250))}>
          全部下载
        </Btn>
      </div>

      <Panel
        title={`投产包（${files.length} 件）`}
        extra={
          skip.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag level="warn">已去掉 {skip.length} 件</Tag>
              <Btn size="sm" variant="ghost" onClick={restore}>恢复</Btn>
            </div>
          ) : null
        }
      >
        {files.map((f) => (
          <div key={f.key} className="file-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 11.5 }}>{f.name}</div>
              <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>{fileUse(f.name)}</div>
            </div>
            <span className="dim" style={{ fontSize: 10.5 }}>{kb(f.content)} KB</span>
            <Btn size="sm" variant="ghost" onClick={() => download(f.name, f.content)}>下载</Btn>
            <Btn size="sm" variant="ghost" onClick={() => saveOne(f)}>写入 exports/</Btn>
            {saved[f.key] && <Tag level="ok">已落盘</Tag>}
            <button type="button" className="file-del" title={`从投产包里去掉「${f.label}」`} onClick={() => drop(f)}>×</button>
          </div>
        ))}
        {!files.length && <div className="dim" style={{ fontSize: 12, padding: '10px 0' }}>9 件全被去掉了，点右上「恢复」加回来。</div>}
      </Panel>

    </div>
  )
}
