import React, { useMemo } from 'react'
import { useProject } from '../lib/store.jsx'
import { runChecks } from '../lib/checks'
import { platform, styleOf, totalDur } from '../lib/schema'
import { Btn, Panel, Tag } from '../ui.jsx'
import ChatPanel from '../components/ChatPanel.jsx'

export default function Overview({ go }) {
  const { project } = useProject()
  const pf = platform(project)
  const st = styleOf(project)
  const checks = useMemo(() => runChecks(project), [project])

  const shots = project.episodes.flatMap((e) => e.shots)
  const withPrompt = shots.filter((s) => s.desc && s.size && s.chars).length
  const withVideo = shots.filter((s) => s.desc && s.action).length
  const voiced = shots.filter((s) => s.dialogue && s.speaker).length
  const assetsMissing = shots.filter((s) => !(project.assets || []).find((a) => a.ep === project.episodes.find((e) => e.shots.includes(s))?.no && a.shot === s.no)).length

  const steps = [
    { id: 'topics', label: '选题', done: project.topics.length > 0, info: `${project.topics.length} 个选题` },
    { id: 'characters', label: '主要角色', done: project.characters.length > 0 && project.characters.every((c) => c.anchor), info: `${project.characters.filter((c) => c.anchor).length}/${project.characters.length} 已锚定` },
    { id: 'story', label: '剧本 / 分集', done: project.episodes.length > 0 && project.episodes.every((e) => e.hook), info: `${project.episodes.filter((e) => e.hook).length}/${project.episodes.length} 集有钩子` },
    { id: 'shots', label: '分镜脚本', done: shots.length > 0, info: `${withPrompt}/${shots.length} 镜可出图` },
    { id: 'prompts', label: '生图', done: shots.length > 0 && withPrompt === shots.length, info: `${withPrompt} 条可复制` },
    { id: 'video', label: '生视频', done: shots.length > 0 && withVideo === shots.length, info: `${withVideo} 条可复制` },
    { id: 'voice', label: '配音 / 口型', done: voiced > 0, info: `${voiced} 条台词` },
    { id: 'edit', label: '剪辑成片', done: totalDur(project) >= pf.episodeSec[0] * project.episodes.length * 0.5, info: `${totalDur(project).toFixed(0)}s 素材` },
    { id: 'checks', label: '六项机检', done: checks.errors === 0, info: checks.errors ? `${checks.errors} 条要修` : '全通过' },
    { id: 'assets', label: '资产库', done: assetsMissing === 0, info: assetsMissing ? `待补 ${assetsMissing} 张关键帧` : '关键帧齐了' },
    { id: 'export', label: '导出交付', done: false, info: '9 件成品' },
  ]

  // 「下一步」= 流水线里第一个没做完的；全做完就回到分镜页继续打磨
  const nextStep = steps.find((s) => !s.done && s.id !== 'export') || { id: 'shots', label: '分镜脚本' }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Panel title="项目定位" className="ov-focus">
          <h1 className="ov-title">{project.meta.title}</h1>
          <div className="muted" style={{ marginBottom: 12, lineHeight: 1.7 }}>
            {project.meta.logline || '（还没写 logline——一句话讲清核心冲突）'}
          </div>
          <div className="links" style={{ marginBottom: 12 }}>
            <Tag level="accent">{pf.name}</Tag>
            <Tag>{pf.ratio} · {pf.width}×{pf.height} · {pf.fps}fps</Tag>
            <Tag>{st.name}</Tag>
            {project.meta.tags
              ? project.meta.tags.split(/[,，\s]+/).filter(Boolean).map((t) => <Tag key={t}>{t}</Tag>)
              : <Tag level="warn">未打标签</Tag>}
          </div>
          <div className="kv"><span className="k">目标受众</span><span className="v">{project.meta.audience || '—'}</span></div>
          <div className="kv"><span className="k">平台约束</span><span className="v">{pf.notes}</span></div>
          <div className="kv"><span className="k">单集区间</span><span className="v">{pf.episodeSec[0]}–{pf.episodeSec[1]}s ｜ 钩子窗口 {pf.hookSec}s ｜ 语速 {pf.voiceRate[0]}–{pf.voiceRate[1]} 字/秒</span></div>
          <div className="ov-actions">
            <Btn variant="primary" size="sm" onClick={() => go(nextStep.id)}>下一步 · {nextStep.label}</Btn>
            <Btn size="sm" variant="ghost" onClick={() => window.dispatchEvent(new Event('mjw:open-settings'))}>改项目设置</Btn>
          </div>
        </Panel>

        <ChatPanel project={project} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Panel title="流水线进度">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>
            {steps.map((s) => (
              <div
                key={s.id}
                onClick={() => go(s.id)}
                className="flow-step"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: s.done ? 'var(--ok)' : 'var(--dim)' }}>{s.done ? '●' : '○'}</span>
                  <span style={{ fontSize: 12.5 }}>{s.label}</span>
                </div>
                <div className="dim" style={{ fontSize: 10.5, marginTop: 3 }}>{s.info}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

    </div>
  )
}
