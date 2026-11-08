import React, { useMemo, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { PLATFORMS, STYLES } from '../lib/schema'
import { Btn, Empty, Field, Icon, Modal, Seg, Text, Area, Tag, Ring } from '../ui.jsx'

const COVER = {
  'guoman-houtu': 'linear-gradient(150deg,#2a1a10 0%,#6d3f1c 46%,#c4883a 100%)',
  'cel-shade': 'linear-gradient(150deg,#101a30 0%,#2d4d84 55%,#7fb0e6 100%)',
  'manhua-flat': 'linear-gradient(150deg,#221432 0%,#55307d 52%,#a06fd6 100%)',
  'render-3d': 'linear-gradient(150deg,#0d2129 0%,#22606b 55%,#63bcc2 100%)',
}

const PLATFORM_OPTIONS = Object.values(PLATFORMS).map((p) => ({
  value: p.id,
  label: p.name,
  desc: `${p.ratio} · ${p.width}×${p.height} · 单集 ${p.episodeSec[0]}–${p.episodeSec[1]}s`,
}))

// 每次渲染现算：自定义画风是运行时注册进 STYLES 的，写成模块级常量会漏。
const styleOptions = () =>
  Object.values(STYLES).map((s) => ({
    value: s.id,
    label: s.name,
    desc: `${s.custom ? '自定义 · ' : ''}${(s.note || s.anchor || '').slice(0, 40)}${(s.note || s.anchor || '').length > 40 ? '…' : ''}`,
  }))

function timeAgo(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const d = Date.now() - t
  if (d < 60e3) return '刚刚'
  if (d < 3600e3) return `${Math.floor(d / 60e3)} 分钟前`
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} 小时前`
  if (d < 7 * 86400e3) return `${Math.floor(d / 86400e3)} 天前`
  return new Date(t).toLocaleDateString('zh-CN')
}

function ScriptCard({ s, active, onOpen, onRename, onDuplicate, onDelete }) {
  const [menu, setMenu] = useState(false)
  const pf = PLATFORMS[s.platform] || PLATFORMS.douyin
  const st = STYLES[s.style] || STYLES['guoman-houtu']
  const hasScore = typeof s.score === 'number'
  const tone = !hasScore ? 'none' : s.score >= 90 ? 'ok' : s.score >= 75 ? 'warn' : 'err'
  return (
    <article className={`script-card ${active ? 'is-active' : ''}`}>
      <div className="cover" style={{ background: COVER[s.style] || COVER['guoman-houtu'] }} onClick={() => onOpen(s.id)}>
        <div className="cover-grid" />
        <div className="cover-top">
          <span className="cover-pf">{pf.name}</span>
          <span className={`cover-score ${tone}`} title={hasScore ? `机检 ${Math.round(s.score)} 分` : '尚未机检'}>
            {hasScore ? Math.round(s.score) : '—'}
          </span>
        </div>
        <div className="cover-shade" />
        <div className="cover-title">
          <h3 title={s.title}>{s.title}</h3>
          <div className="cover-tags">
            <span>{st.name}</span>
            <span>{pf.ratio}</span>
            {active && <span className="live">当前打开</span>}
          </div>
        </div>
      </div>

      <div className="card-body">
        <p className={`logline ${s.logline ? '' : 'is-empty'}`}>{s.logline || '还没有一句话定位 —— 打开后补一句就能跑通全链路'}</p>
        <div className="card-metrics">
          <div>
            <b>{s.episodes ?? 0}</b>
            <span>集</span>
          </div>
          <div>
            <b>{s.shots ?? 0}</b>
            <span>镜</span>
          </div>
          <div>
            <b>{s.duration ?? 0}</b>
            <span>秒</span>
          </div>
          <div>
            <b>{s.chars ?? 0}</b>
            <span>角色</span>
          </div>
        </div>
        {s.errors > 0 && (
          <div className="card-alert">
            <Icon name="alert" size={13} /> {s.errors} 个硬伤 / {s.warns || 0} 条提醒
          </div>
        )}
      </div>

      <div className="card-foot">
        <span className="stamp">
          <Icon name="clock" size={12} /> {timeAgo(s.updatedAt)}
        </span>
        <div className="foot-actions">
          <Btn size="sm" variant="ghost" icon="arrow" onClick={() => onOpen(s.id)}>
            打开
          </Btn>
          <div className="more-wrap">
            <button type="button" className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="更多">
              <Icon name="more" size={15} />
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <button type="button" onClick={() => { setMenu(false); onRename(s) }}>
                  <Icon name="edit" size={14} /> 重命名
                </button>
                <button type="button" onClick={() => { setMenu(false); onDuplicate(s.id) }}>
                  <Icon name="copy" size={14} /> 复制剧本
                </button>
                <button type="button" className="danger" onClick={() => { setMenu(false); onDelete(s) }}>
                  <Icon name="trash" size={14} /> 删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function Home({ go }) {
  const {
    scripts,
    activeId,
    openScript,
    createScript,
    loadDemo,
    renameScript,
    duplicateScript,
    deleteScript,
  } = useProject()

  const [q, setQ] = useState('')
  const [pfFilter, setPfFilter] = useState('all')
  const [newOpen, setNewOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', logline: '', platform: 'douyin', style: 'guoman-houtu' })
  const [confirm, setConfirm] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [busy, setBusy] = useState(false)

  const stats = useMemo(() => {
    const n = scripts.length
    const eps = scripts.reduce((a, s) => a + (s.episodes || 0), 0)
    const shots = scripts.reduce((a, s) => a + (s.shots || 0), 0)
    const scored = scripts.filter((s) => typeof s.score === 'number')
    const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length) : 0
    return { n, eps, shots, avg }
  }, [scripts])

  const list = useMemo(() => {
    const key = q.trim().toLowerCase()
    return scripts
      .filter((s) => (pfFilter === 'all' ? true : s.platform === pfFilter))
      .filter((s) => (!key ? true : `${s.title} ${s.logline || ''}`.toLowerCase().includes(key)))
  }, [scripts, q, pfFilter])

  const onOpen = async (id) => {
    await openScript(id)
    go('overview')
  }

  const submitNew = async () => {
    if (!draft.title.trim() || busy) return
    setBusy(true)
    const id = await createScript({ ...draft, title: draft.title.trim() })
    setBusy(false)
    setNewOpen(false)
    setDraft({ title: '', logline: '', platform: 'douyin', style: 'guoman-houtu' })
    if (id) go('overview')
  }

  return (
    <div className="home">
      <header className="home-hero">
        <div className="hero-text">
          <div className="eyebrow">
            <Icon name="layers" size={13} /> 多剧本台账 · 每部独立隔离
          </div>
          <h1>剧本库</h1>
          <p>一部漫剧一个剧本，从选题到成片全链路留痕；切换剧本即切换整套台账，互不串味。</p>
        </div>
        <div className="hero-actions">
          <Btn variant="primary" icon="plus" onClick={() => setNewOpen(true)}>
            新建剧本
          </Btn>
          {scripts.length === 0 && (
            <Btn variant="ghost" icon="spark" onClick={loadDemo}>
              载入示例剧本
            </Btn>
          )}
        </div>
      </header>

      <div className="home-stats">
        <div className="hs">
          <span>剧本总数</span>
          <b>{stats.n}</b>
        </div>
        <div className="hs">
          <span>累计集数</span>
          <b>{stats.eps}</b>
        </div>
        <div className="hs">
          <span>累计分镜</span>
          <b>{stats.shots}</b>
        </div>
        <div className="hs">
          <span>平均机检分</span>
          <b className={stats.avg >= 90 ? 'ok' : stats.avg >= 75 ? 'warn' : ''}>{stats.avg || '—'}</b>
        </div>
      </div>

      <div className="home-bar">
        <div className="search">
          <Icon name="search" size={15} />
          <input placeholder="搜索剧本名 / 定位" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filter-chips">
          <button type="button" className={`chip ${pfFilter === 'all' ? 'on' : ''}`} onClick={() => setPfFilter('all')}>
            全部
          </button>
          {Object.values(PLATFORMS).map((p) => (
            <button
              type="button"
              key={p.id}
              className={`chip ${pfFilter === p.id ? 'on' : ''}`}
              onClick={() => setPfFilter(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="home-empty">
          <Empty
            icon="film"
            action={
              <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 4 }}>
                <Btn variant="primary" icon="plus" onClick={() => setNewOpen(true)}>
                  新建第一部剧本
                </Btn>
                {scripts.length === 0 && (
                  <Btn icon="spark" onClick={loadDemo}>
                    载入示例剧本
                  </Btn>
                )}
              </div>
            }
          >
            {scripts.length === 0
              ? '还没有剧本。新建一部，或先载入示例看看完整链路长什么样。'
              : '没有匹配的剧本，换个关键词或切回「全部」。'}
          </Empty>
        </div>
      ) : (
        <div className="script-grid">
          <button type="button" className="new-card" onClick={() => setNewOpen(true)}>
            <span className="new-ic">
              <Icon name="plus" size={22} />
            </span>
            <b>新建剧本</b>
            <small>平台 / 画风 / 定位三步开局</small>
          </button>
          {list.map((s) => (
            <ScriptCard
              key={s.id}
              s={s}
              active={s.id === activeId}
              onOpen={onOpen}
              onRename={(x) => setRenaming({ id: x.id, title: x.title })}
              onDuplicate={duplicateScript}
              onDelete={(x) => setConfirm(x)}
            />
          ))}
        </div>
      )}

      <Modal
        open={newOpen}
        title="新建剧本"
        desc="一次只建一本书的台账：平台与画风决定后面的参数和锚定词，建好后还能在项目设置里改。"
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setNewOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" icon="plus" disabled={!draft.title.trim() || busy} onClick={submitNew}>
              {busy ? '创建中…' : '创建剧本'}
            </Btn>
          </>
        }
      >
        <Field label="剧名">
          <Text
            autoFocus
            placeholder="例：退婚那天，我亮了榫"
            value={draft.title}
            onChange={(v) => setDraft({ ...draft, title: v })}
          />
        </Field>
        <Field label="一句话定位">
          <Area
            rows={2}
            placeholder="打脸流：被退婚的木匠学徒，用一手榫卯在豪门宴上当众翻盘。"
            value={draft.logline}
            onChange={(v) => setDraft({ ...draft, logline: v })}
          />
        </Field>
        <Field label="发布平台">
          <Seg value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v })} options={PLATFORM_OPTIONS} columns={2} />
        </Field>
        <Field label="画风">
          <Seg value={draft.style} onChange={(v) => setDraft({ ...draft, style: v })} options={styleOptions()} columns={2} />
        </Field>
        <div className="hint-block">
          <Icon name="layers" size={13} /> 新剧本自带第 1 集 + 1 个空镜，角色、选题、资产都从零开始，不与其它剧本共享。
        </div>
      </Modal>

      <Modal
        open={!!renaming}
        title="重命名剧本"
        onClose={() => setRenaming(null)}
        width={460}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRenaming(null)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              onClick={async () => {
                await renameScript(renaming.id, renaming.title)
                setRenaming(null)
              }}
            >
              保存
            </Btn>
          </>
        }
      >
        <Field label="剧名">
          <Text autoFocus value={renaming?.title || ''} onChange={(v) => setRenaming({ ...renaming, title: v })} />
        </Field>
      </Modal>

      <Modal
        open={!!confirm}
        title="删除剧本"
        desc="剧本文件、分镜、角色与资产记录会一起从磁盘移除，导出过的文件不受影响。"
        onClose={() => setConfirm(null)}
        width={460}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirm(null)}>
              取消
            </Btn>
            <Btn
              variant="danger"
              icon="trash"
              onClick={async () => {
                const id = confirm.id
                setConfirm(null)
                await deleteScript(id)
              }}
            >
              确认删除
            </Btn>
          </>
        }
      >
        <p className="confirm-line">
          确定删除 <b>{confirm?.title}</b>？该剧本有 {confirm?.episodes ?? 0} 集 / {confirm?.shots ?? 0} 镜。
        </p>
      </Modal>
    </div>
  )
}
