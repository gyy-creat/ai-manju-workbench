import React, { useState } from 'react'
import { Icon } from '../ui.jsx'

export const LS_ONBOARD = 'mjw:onboard:v1'

const STEPS = [
  { n: '1', t: '导入本集文本', d: '贴一集正文，自动切分镜', go: 'novel' },
  { n: '2', t: '主要角色', d: '补参考图与音色，脸不漂', go: 'characters' },
  { n: '3', t: '复制提示词', d: '生图 / 生视频两页各复制一次', go: 'prompts' },
  { n: '4', t: '导出交付', d: '9 件成品，下载或存盘', go: 'export' },
]

export default function OnboardingBar({ go }) {
  const [closed, setClosed] = useState(() => localStorage.getItem(LS_ONBOARD) === '1')
  if (closed) return null

  const done = () => {
    localStorage.setItem(LS_ONBOARD, '1')
    setClosed(true)
  }

  return (
    <div className="onboard">
      <div className="onboard-head">
        <Icon name="spark" size={14} />
        <b>四步做完一集</b>
        <span className="dim">点任一步直接过去；这条只在第一次出现，之后在「设置 → 帮助」里能再看</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="onboard-x" onClick={done} title="知道了，不再显示">×</button>
      </div>
      <div className="onboard-steps">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            className="onboard-step"
            onClick={() => { go(s.go); done() }}
          >
            <i>{s.n}</i>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
