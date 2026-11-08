import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Icon, Panel, Sel, Tag } from '../ui.jsx'

const LS_PREFIX = 'mjw:chat:'
const LS_STATS = 'mjw:chatstats:'
const LS_MODEL = 'mjw:chatmodel'
const LS_ACK = 'mjw:chat:privacy-acked'
const LS_CTX = 'mjw:chatctx:'

// 资料快照的指针（ctxId + 上次发送时的剧本版本），跨切页 / 刷新都保留，
// 这样同一份内容在整台机器上只上传一次
function loadCtx(sid) {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CTX + sid) || 'null')
    if (v && typeof v.id === 'string') return { id: v.id, at: String(v.at || '') }
  } catch {
    /* ignore */
  }
  return { id: '', at: '' }
}

function activeScriptId() {
  try {
    const raw = localStorage.getItem('mjw:active:v1')
    if (!raw) return 'draft'
    const v = JSON.parse(raw)
    return typeof v === 'string' && v ? v : 'draft'
  } catch {
    return 'draft'
  }
}

const EMPTY_STATS = { rounds: 0, prompt: 0, completion: 0, total: 0, cached: 0, ms: 0 }

const fmtTok = (n) => {
  const v = Number(n) || 0
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return String(v)
}

function loadStats(sid) {
  try {
    const raw = localStorage.getItem(LS_STATS + sid)
    const o = raw ? JSON.parse(raw) : null
    if (!o || typeof o !== 'object') return { ...EMPTY_STATS }
    return {
      rounds: Number(o.rounds) || 0,
      prompt: Number(o.prompt) || 0,
      completion: Number(o.completion) || 0,
      total: Number(o.total) || 0,
      cached: Number(o.cached) || 0,
      ms: Number(o.ms) || 0,
    }
  } catch {
    return { ...EMPTY_STATS }
  }
}

export default function ChatPanel({ project }) {
  const sid = useMemo(activeScriptId, [])
  const [msgs, setMsgs] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState(null)
  const [stats, setStats] = useState(() => loadStats(sid))
  const [last, setLast] = useState(null)
  const [models, setModels] = useState([])
  // 资料快照：只在剧本内容变化时才把整本台账发给服务端，否则只带 ctxId
  const ctxRef = useRef(loadCtx(sid))
  const rememberCtx = (v) => {
    ctxRef.current = v
    try {
      localStorage.setItem(LS_CTX + sid, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }
  const [acked, setAcked] = useState(() => {
    try {
      return localStorage.getItem(LS_ACK) === '1'
    } catch {
      return false
    }
  })
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(LS_MODEL) || ''
    } catch {
      return ''
    }
  })
  const bodyRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + sid)
      const arr = raw ? JSON.parse(raw) : []
      if (Array.isArray(arr)) {
        setMsgs(arr.filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-40))
      }
    } catch {
      setMsgs([])
    }
    setStats(loadStats(sid))
  }, [sid])

  useEffect(() => {
    try {
      localStorage.setItem(LS_PREFIX + sid, JSON.stringify(msgs.slice(-40)))
    } catch {
      /* 存不下就算了 */
    }
  }, [msgs, sid])

  useEffect(() => {
    try {
      localStorage.setItem(LS_STATS + sid, JSON.stringify(stats))
    } catch {
      /* 同上 */
    }
  }, [stats, sid])

  // 拉当前端点能用的模型
  useEffect(() => {
    let alive = true
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j) return
        const list = Array.isArray(j.models) ? j.models.filter(Boolean) : []
        setModels(list)
        setModel((cur) => {
          if (cur && list.includes(cur)) return cur
          if (cur && !list.length) return cur
          return j.current || list[0] || ''
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    try {
      if (model) localStorage.setItem(LS_MODEL, model)
    } catch {
      /* ignore */
    }
  }, [model])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy, err])

  async function send() {
    const q = draft.trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user', content: q }]
    setMsgs(next)
    setDraft('')
    setBusy(true)
    setErr('')
    try {
      const at = String(project?.meta?.updatedAt || '')
      const reuse = Boolean(ctxRef.current.id) && ctxRef.current.at === at
      const ask = (useCtx) =>
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: next.slice(-16),
            model: model || undefined,
            ...(useCtx ? { ctxId: ctxRef.current.id } : { project }),
          }),
        })
      let r = await ask(reuse)
      let j = await r.json()
      // 服务端缓存被挤掉了：退回把整本台账重发一次
      if (!j.ok && reuse) {
        rememberCtx({ id: '', at: '' })
        r = await ask(false)
        j = await r.json()
      }
      if (!j.ok) {
        setErr(j.error || '调用失败')
        return
      }
      if (j.ctxId) rememberCtx({ id: j.ctxId, at })
      setMsgs([...next, { role: 'assistant', content: j.reply || '（空回复）' }])
      setInfo({
        chars: j.contextChars,
        ms: j.ms,
        model: j.model,
        truncated: j.truncated,
        sentTo: j.sentTo,
        ctxReuse: Boolean(j.ctxReuse),
      })
      const s = j.stats || {}
      setLast({ ...s, model: j.model, ms: j.ms })
      setStats((p) => ({
        rounds: p.rounds + 1,
        prompt: p.prompt + (Number(s.prompt) || 0),
        completion: p.completion + (Number(s.completion) || 0),
        total: p.total + (Number(s.total) || 0),
        cached: p.cached + (Number(s.cached) || 0),
        ms: p.ms + (Number(j.ms) || 0),
      }))
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function clearAll() {
    setMsgs([])
    setErr('')
    setInfo(null)
    setLast(null)
    setStats({ ...EMPTY_STATS })
  }

  const avgTps = stats.ms > 0 && stats.completion > 0 ? Math.round((stats.completion / (stats.ms / 1000)) * 10) / 10 : 0
  const hitRate = stats.prompt > 0 ? Math.round((stats.cached / stats.prompt) * 100) : 0
  // 本地模型 / mock 端点几毫秒就回，算出来的 tok/s 会离谱，不显示
  const showTps = (v) => {
    const n = Number(v) || 0
    return n > 0 && n < 1000 ? n : 0
  }
  const showSecs = (ms) => {
    const n = Number(ms) || 0
    return n >= 100 ? (n / 1000).toFixed(1) + 's' : ''
  }

  function noteOk() {
    setAcked(true)
    try {
      localStorage.setItem(LS_ACK, '1')
    } catch {
      /* ignore */
    }
  }

  const extra = (
    <span className="chat-extra">
      {info?.sentTo && <Tag>{info.sentTo}</Tag>}
      {info && <Tag>{info.ctxReuse ? '资料复用' : '资料已更新'} · {info.chars} 字</Tag>}
      {(msgs.length > 0 || stats.rounds > 0) && (
        <Btn size="sm" variant="ghost" onClick={clearAll}>
          清空
        </Btn>
      )}
    </span>
  )

  const modelOptions = useMemo(() => {
    const list = [...models]
    if (model && !list.includes(model)) list.unshift(model)
    return list.length ? list : [model || '未配置']
  }, [models, model])

  return (
    <Panel title="AI 对话" extra={extra} className="chat-panel">
      <div className="chat-body" ref={bodyRef}>
        {!acked && (
          <div className="chat-note">
            <div className="chat-note-t">剧本会整段发出去</div>
            <div className="chat-note-b">每次提问都会把项目定位、角色卡、分集大纲和导入的原文一起发给你配置的模型端点。不想外发的内容先删掉再问。</div>
            <Btn size="sm" variant="ghost" onClick={noteOk}>
              知道了
            </Btn>
          </div>
        )}
        {!msgs.length && <div className="chat-empty">问剧本里的事。</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`chat-row ${m.role === 'user' ? 'me' : 'ai'}`}>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="chat-row ai">
            <div className="chat-bubble chat-thinking">思考中…</div>
          </div>
        )}
        {err && <div className="chat-err">{err}</div>}
      </div>

      <div className="chat-in">
        <textarea
          className="chat-area"
          rows={2}
          value={draft}
          placeholder="问它剧本里的事…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <Btn variant="primary" size="sm" onClick={send} disabled={busy || !draft.trim()}>
          {busy ? '…' : '发送'}
        </Btn>
      </div>

      <div className="chat-foot">
        <span className="cf" title={`本次会话累计 ${fmtTok(stats.total)} tokens`}>
          <Icon name="refresh" size={11} />
          {stats.rounds} 轮 · {fmtTok(stats.total)} tok
        </span>
        <span className={`cf ${hitRate ? 'ok' : ''}`} title={`缓存命中 ${fmtTok(stats.cached)} / 输入 ${fmtTok(stats.prompt)} tokens`}>
          <Icon name="layers" size={11} />
          命中 {hitRate}%
        </span>
        {last && showSecs(last.ms) && (
          <span className="cf" title="上一轮耗时与输出 token">
            <Icon name="clock" size={11} />
            {showSecs(last.ms)}
            {showTps(last.tps) > 0 && <em> · {showTps(last.tps)} tok/s</em>}
          </span>
        )}
        <Sel className="cf-model" value={model} onChange={setModel} options={modelOptions} title="本次对话用哪个模型（不改全局配置）" />
      </div>
    </Panel>
  )
}
