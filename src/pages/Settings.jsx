import React, { useRef } from 'react'
import { useProject } from '../lib/store.jsx'
import { PLATFORMS, STYLES } from '../lib/schema'
import { Btn, Panel, Kv } from '../ui.jsx'
import AiPanel from '../components/AiPanel.jsx'

export default function Settings({ notify }) {
  const { project, actions, apiOk, saveState } = useProject()
  const fileRef = useRef(null)

  const importJson = async (file) => {
    try {
      const text = await file.text()
      actions.replaceProject(JSON.parse(text))
      notify?.('项目已导入并写盘')
    } catch {
      notify?.('导入失败：JSON 格式不对')
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.meta.title || '项目'}_project.json`
    a.click()
  }

  const resetSeed = async () => {
    const seed = await fetch('/seed.json').then((r) => r.json())
    actions.replaceProject(seed)
    notify?.('已恢复示例项目')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Panel title="项目与台账">
        <div className="kvs">
          <Kv k="剧名" v={project.meta.title || '未命名'} />
          <Kv k="平台" v={PLATFORMS[project.meta.platform]?.name} />
          <Kv k="画风" v={STYLES[project.meta.style]?.name} />
          <Kv k="创建时间" v={new Date(project.meta.createdAt).toLocaleString('zh-CN')} />
          <Kv k="最近修改" v={new Date(project.meta.updatedAt).toLocaleString('zh-CN')} />
          <Kv k="台账文件" v="data/scripts/ 下按剧本 id 命名的 json" />
          <Kv k="保存状态" v={saveState} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn size="sm" onClick={exportJson}>导出 project.json</Btn>
          <Btn size="sm" onClick={() => fileRef.current?.click()}>导入 project.json</Btn>
          <Btn size="sm" variant="ghost" onClick={resetSeed}>恢复示例数据</Btn>
          <Btn
            size="sm"
            variant="ghost danger"
            onClick={() => { if (confirm('清空当前项目（保留在导出文件里才可恢复）？')) actions.replaceProject({}) }}
          >
            清空项目
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && importJson(e.target.files[0])}
          />
        </div>
      </Panel>

      <AiPanel notify={notify} />

      <Panel title="运行环境">
        <Kv k="形态" v="本地 Web 单页（Vite + React）" />
        <Kv k="启动" v="双击桌面「AI漫剧工作台」快捷方式 → 浏览器打开 127.0.0.1:5273" />
        <Kv k="API" v={apiOk ? '在线（/api/script 读写磁盘）' : '离线（仅浏览器缓存）'} />
        <Kv k="接入模式" v="内部 AI 接口可选接入（/api/ai 代理），未配置 key 时全部走本地规则" />
        <Kv k="数据位置" v="data/library.json + data/scripts/ ｜ 导出 exports/" />
        <Kv k="隐私" v="除主动配置的模型端点外，全部本地" />
      </Panel>
    </div>
  )
}
