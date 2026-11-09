import React, { useEffect, useMemo, useState } from 'react'
import { useProject } from './lib/store.jsx'
import { runChecks, RULE_PAGE } from './lib/checks'
import { platform, styleOf, totalDur, totalShots } from './lib/schema'
import { buildPackage, download } from './lib/exporters'
import OnboardingBar from './components/OnboardingBar.jsx'
import Home from './pages/Home.jsx'
import Novel from './pages/Novel.jsx'
import Overview from './pages/Overview.jsx'
import Story from './pages/Story.jsx'
import Characters from './pages/Characters.jsx'
import Scenes from './pages/Scenes.jsx'
import Shots from './pages/Shots.jsx'
import Prompts from './pages/Prompts.jsx'
import VideoPrompts from './pages/VideoPrompts.jsx'
import Voice from './pages/Voice.jsx'
import Assets from './pages/Assets.jsx'
import Export from './pages/Export.jsx'
import Settings from './pages/Settings.jsx'
import { Btn, Empty, Icon } from './ui.jsx'
import SettingsDrawer from './components/SettingsDrawer.jsx'
import { loadStyles } from './lib/styles.js'
import { loadPrefs, applyPrefs } from './lib/uiPrefs.js'

const NAV = [
  {
    group: '内容线',
    items: [
      { id: 'novel', label: '导入本集文本', idx: '＋' },
      { id: 'overview', label: '总览', idx: '00' },
      { id: 'story', label: '剧本 / 分集', idx: '01' },
      { id: 'characters', label: '主要角色', idx: '02' },
      { id: 'scenes', label: '场景环境', idx: '02b' },
      { id: 'shots', label: '分镜脚本', idx: '03' },
    ],
  },
  {
    group: '生产',
    items: [
      { id: 'prompts', label: '生图', idx: '04' },
      { id: 'voice', label: '配音 / 口型', idx: '05' },
      { id: 'video', label: '生视频', idx: '06' },
    ],
  },
  {
    group: '质检与交付',
    items: [
      { id: 'assets', label: '资产库', idx: '07' },
      { id: 'export', label: '导出交付', idx: '08' },
    ],
  },
  // 设置不进导航：入口固定在侧栏左下角（抽屉），完整设置页从抽屉里的按钮进
]

const PAGES = {
  overview: Overview,
  novel: Novel,
  story: Story,
  characters: Characters,
  scenes: Scenes,
  shots: Shots,
  prompts: Prompts,
  video: VideoPrompts,
  voice: Voice,
  assets: Assets,
  export: Export,
  settings: Settings,
}

const TITLES = {
  ...Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))),
  settings: '完整设置页',
}
const NUM = new Intl.NumberFormat('zh-CN')

function ScriptSwitcher({ go, route }) {
  const { scripts, activeId, project, openScript, flushSave } = useProject()
  const [open, setOpen] = useState(false)
  const current = scripts.find((s) => s.id === activeId)
  const title = project?.meta?.title || current?.title || '未打开剧本'

  return (
    <div className="switcher">
      <button
        type="button"
        className={`switch-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="切换剧本"
      >
        <span className="switch-ic">
          <Icon name="film" size={15} />
        </span>
        <span className="switch-body">
          <b>{title}</b>
          <small>
            {current ? `${current.episodes || 0} 集 · ${current.shots || 0} 镜` : '点此选择剧本'}
          </small>
        </span>
        <Icon name="down" size={14} className={`switch-caret ${open ? 'up' : ''}`} />
      </button>

      {open && (
        <div className="switch-pop" onMouseLeave={() => setOpen(false)}>
          <div className="pop-head">
            <span>剧本库</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setOpen(false)
                flushSave()
                go('home')
              }}
            >
              管理全部 <Icon name="arrow" size={12} />
            </button>
          </div>
          <div className="pop-list">
            {scripts.length === 0 && <div className="pop-empty">还没有剧本</div>}
            {scripts.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`pop-item ${s.id === activeId ? 'on' : ''}`}
                onClick={async () => {
                  setOpen(false)
                  if (s.id === activeId && project) return go('overview')
                  flushSave()
                  await openScript(s.id)
                  go('overview')
                }}
              >
                <span className="pop-dot" />
                <span className="pop-title">{s.title}</span>
                <span className="pop-meta">
                  {s.episodes || 0} 集 · {Math.round(s.score || 0)} 分
                </span>
              </button>
            ))}
          </div>
          <div className="pop-foot">
            <Btn size="sm" variant="primary" icon="plus" onClick={() => { setOpen(false); go('home') }}>
              新建 / 管理剧本
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const { project, scripts, saveState, apiOk, toast, notify, ready, flushSave, autoSave, autoNext, setAutoSave } =
    useProject()
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, '') || 'home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 自定义画风是运行时注册进 STYLES 的普通对象，React 看不见；用一个版本号逼它重渲染
  const [, setStyleRev] = useState(0)

  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#\/?/, '') || 'home')
    const onOpen = () => setSettingsOpen(true)
    window.addEventListener('hashchange', onHash)
    const bumpStyles = () => setStyleRev((n) => n + 1)
    window.addEventListener('mjw:styles', bumpStyles)
    loadStyles()
    window.addEventListener('mjw:open-settings', onOpen)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('mjw:open-settings', onOpen)
    }
  }, [])

  const go = (id) => {
    if (route !== 'home' && id === 'home') flushSave()
    location.hash = `#/${id}`
    setRoute(id)
  }

  const checks = useMemo(() => (project ? runChecks(project) : null), [project])
  const isHome = route === 'home'
  const Page = PAGES[route] || Overview
  const pf = project ? platform(project) : null
  const st = project ? styleOf(project) : null

  // 机检错误改成导航上的红点：哪一步有 error 就在那一步标出来，不再单开一页去查
  const alertOf = (id) => {
    if (!project || !checks) return null
    const mine = checks.issues.filter((i) => (RULE_PAGE[i.rule] || 'shots') === id)
    const e = mine.filter((i) => i.level === 'error').length
    if (!e) return null
    return { cls: 'err', n: e, tip: `${e} 条 error 待修` }
  }

  const badgeFor = (id) => {
    if (!project) return null
    if (id === 'story') return { text: project.episodes.length, cls: '' }
    if (id === 'shots') return { text: totalShots(project), cls: '' }
    if (id === 'characters') return { text: project.characters.length, cls: '' }
    return null
  }

  const quickExport = () => {
    const files = buildPackage(project, checks)
    files.forEach((f, i) => setTimeout(() => download(f.name, f.content), i * 300))
  }

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-mark">漫</div>
        <div className="boot-text">正在读取剧本库…</div>
      </div>
    )
  }

  return (
    <div className={`app ${isHome ? 'is-home' : ''}`}>
      {!isHome && (
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">漫</div>
            <div className="brand-text">
              <h1>AI 漫剧工作台</h1>
              <div className="sub">
                {pf?.name} · {st?.name}
              </div>
            </div>
          </div>

          <ScriptSwitcher go={go} route={route} />

          <button type="button" className={`lib-entry ${isHome ? 'on' : ''}`} onClick={() => go('home')}>
            <Icon name="grid" size={15} />
            <span>剧本库</span>
            <span className="badge">{scripts.length}</span>
          </button>

          <nav className="nav-scroll">
            {NAV.map((g) => (
              <div className="nav-group" key={g.group}>
                <div className="lab">{g.group}</div>
                {g.items.map((it) => {
                  const b = badgeFor(it.id)
                  const a = alertOf(it.id)
                  return (
                    <button
                      type="button"
                      key={it.id}
                      className={`nav-item ${it.id === 'overview' ? 'is-home' : ''} ${route === it.id ? 'active' : ''}`}
                      onClick={() => go(it.id)}
                    >
                      <span className="idx">{it.id === 'overview' ? <Icon name="home" size={14} /> : it.idx}</span>
                      <span className="nav-label">{it.label}</span>
                      {a ? <span className={`nav-alert ${a.cls}`} title={a.tip}>{a.n}</span> : b && <span className={`badge ${b.cls}`}>{b.text}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <button type="button" className="side-settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="gear" size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>设置</span>
            <span className="dim" style={{ fontSize: 10.5 }}>外观 · AI · 存储</span>
          </button>

          <div className="side-foot">
            <button
              type="button"
              className={`autosave-row${autoSave.on ? ' on' : ''}`}
              onClick={() => setAutoSave({ on: !autoSave.on })}
              title={autoSave.on ? '点一下关掉自动保存（改动只留在本地缓存，切剧本或关页面时才写盘）' : '点一下打开自动保存'}
            >
              <span className="as-dot" />
              <span className="as-label">自动保存</span>
              <span className="as-sec">{autoSave.on ? `${autoSave.sec}s` : '关'}</span>
              <span className="as-switch" aria-hidden="true"><i /></span>
            </button>
            <div className="autosave-hint">
              {autoSave.on
                ? saveState.startsWith('待保存')
                  ? `${autoNext || autoSave.sec}s 后写盘`
                  : `下次检查 ${autoNext || autoSave.sec}s`
                : '改动只存本地缓存'}
            </div>
            <div className="dot-row">
              <span className={`dot ${apiOk ? 'ok' : 'err'}`} />
              {apiOk ? '磁盘台账：data/scripts/' : 'API 离线：仅本地缓存'}
            </div>
            <div>{saveState}</div>
          </div>
        </aside>
      )}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} notify={toast} />

      <div className="main">
        {!isHome && (
          <header className="topbar">
            <div className="crumb">
              <button type="button" className="crumb-link" onClick={() => go('home')}>
                剧本库
              </button>
              <Icon name="chevron" size={13} />
              <span className="crumb-current">{project?.meta?.title || '未打开剧本'}</span>
            </div>
            <span className="top-sep" />
            <div className="title">{TITLES[route] || ''}</div>
            <div className="meta">
              {project ? `${project.episodes.length} 集 / ${NUM.format(totalShots(project))} 镜 / ${totalDur(project).toFixed(1)}s` : '—'}
            </div>
            <div className="spacer" />
            <span className="save-state">{saveState}</span>
            <button
              type="button"
              className="top-settings"
              title="设置（外观 · AI · 存储）"
              aria-label="设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="gear" size={14} />
            </button>
            {project && (
              <Btn size="sm" icon="play" onClick={quickExport}>
                一键投产包
              </Btn>
            )}
          </header>
        )}

        <main className={`content ${isHome ? 'home-content' : ''}`}>
          {isHome ? (
            <Home go={go} />
          ) : project ? (
            <>
              <OnboardingBar go={go} />
              <Page go={go} checks={checks} notify={notify} />
            </>
          ) : (
            <div className="no-script">
              <Empty
                icon="film"
                action={
                  <Btn variant="primary" icon="grid" onClick={() => go('home')}>
                    去剧本库选择
                  </Btn>
                }
              >
                当前没有打开的剧本。先到剧本库挑一部，或新建一部开始。
              </Empty>
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div className="toast">
          <Icon name="check" size={14} />
          {toast}
        </div>
      )}
    </div>
  )
}
