import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeProject, emptyProject, emptyShot, emptyEpisode, emptyCharacter, emptyAssetImage, emptyAssetJob, emptyScene, ASSET_JOB_KINDS, emptyCustomVoice, voiceSeq, voiceTitle, uid } from './schema.js'
import { describeScene } from './scenes.js'
import { runChecks } from './checks.js'
import { autoSaveOf, loadPrefs, savePrefs } from './uiPrefs.js'
import { autoAnchors, splitSentences } from './splitter.js'

/** 写入某一集时顺手标一遍锚点：句子级、纯本地，不联网 */
const autoA = (text) => {
  const sents = splitSentences(String(text || ''))
  return sents.length ? autoAnchors(sents) : []
}

const LS_LIB = 'mjw:library:v1'
const LS_ACTIVE = 'mjw:active:v1'
const LS_SCRIPT = (id) => `mjw:script:${id}`
const Ctx = createContext(null)

export const newScriptId = () => `sc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function summaryOf(p) {
  const checks = runChecks(p)
  const episodes = p.episodes || []
  return {
    title: p.meta?.title || '未命名漫剧',
    platform: p.meta?.platform || 'douyin',
    style: p.meta?.style || 'guoman-houtu',
    logline: p.meta?.logline || '',
    episodes: episodes.length,
    shots: episodes.reduce((n, e) => n + (e.shots?.length || 0), 0),
    duration: Math.round(episodes.reduce((n, e) => n + (e.shots || []).reduce((m, s) => m + (Number(s.dur) || 0), 0), 0) * 10) / 10,
    chars: (p.characters || []).length,
    score: checks.score,
    errors: checks.errors,
    warns: checks.warns,
    updatedAt: p.meta?.updatedAt || new Date().toISOString(),
  }
}

export function ProjectProvider({ children }) {
  const [library, setLibrary] = useState({ activeId: null, scripts: [] })
  const [project, setProject] = useState(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState('已就绪')
  const [apiOk, setApiOk] = useState(true)
  const [toast, setToast] = useState(null)
  // pendingRef：有「已改但还没落盘」的内容时非空。自动保存开关关掉后它就一直挂着，
  // 直到手动保存 / 切剧本 / 关页面才写盘。
  const pendingRef = useRef(null)
  const [autoCfg, setAutoCfg] = useState(() => autoSaveOf(loadPrefs()))
  const [autoNext, setAutoNext] = useState(0)
  const beatRef = useRef(Date.now())
  const autoRef = useRef(autoCfg)
  const postRef = useRef(null)
  const libTimer = useRef(null)
  const activeRef = useRef(null)
  const projectRef = useRef(null)

  const notify = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  const setActiveRef = (p) => {
    projectRef.current = p
  }

  const postScript = async (id, p, s) => {
    try {
      setSaveState('保存中…')
      const r = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, project: p, summary: s }),
      })
      const j = await r.json()
      if (j && j.conflict) {
        // 过期写入被服务端拒绝：用磁盘最新版覆盖本地，丢弃本次改动（单人本地工具，
        // 冲突=自己开多窗口，丢弃并提示最可靠，绝不静默覆盖别人的改动）。
        if (j.project) {
          const fresh = normalizeProject(j.project)
          setProject(fresh)
          setActiveRef(fresh)
          try {
            localStorage.setItem(LS_SCRIPT(id), JSON.stringify(fresh))
          } catch {}
        }
        setSaveState('已加载最新版本（你的改动未写入）')
        notify('检测到其他窗口刚保存过，已加载最新版本，本次改动未写入')
        return
      }
      if (!j.ok) throw new Error(j.error)
      // 服务端回写新 rev，本地内存 / 缓存同步对齐，但不标脏、不触发再次保存。
      const newRev = Number(j.rev) >= 1 ? Number(j.rev) : undefined
      if (newRev !== undefined) {
        setProject((prev) => (prev && prev.meta ? { ...prev, meta: { ...prev.meta, rev: newRev } } : prev))
        setActiveRef((prev) => (prev && prev.meta ? { ...prev, meta: { ...prev.meta, rev: newRev } } : prev))
        try {
          const raw = localStorage.getItem(LS_SCRIPT(id))
          if (raw) {
            const lp = JSON.parse(raw)
            if (lp && lp.meta) {
              lp.meta.rev = newRev
              localStorage.setItem(LS_SCRIPT(id), JSON.stringify(lp))
            }
          }
        } catch {}
      }
      setSaveState(`已保存 ${new Date().toLocaleTimeString('zh-CN')}`)
    } catch {
      setSaveState('已存本地缓存（磁盘写入失败）')
    }
  }

  postRef.current = postScript
  autoRef.current = autoCfg

  const writeLibrary = (lib, { persist = true } = {}) => {
    setLibrary(lib)
    try {
      localStorage.setItem(LS_LIB, JSON.stringify(lib))
    } catch {}
    if (!persist) return
    if (libTimer.current) clearTimeout(libTimer.current)
    libTimer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ library: lib }),
        })
        if (!r.ok) throw new Error('bad status')
      } catch {
        setApiOk(false)
      }
    }, 320)
  }

  const openScript = async (id) => {
    if (!id) return false
    // 切换前先把旧剧本的待写内容落盘，避免 activeRef 换掉后 flushSave 写错 id
    await flushSave()
    setLoading(true)
    let p = null
    try {
      const r = await fetch(`/api/script?id=${encodeURIComponent(id)}`)
      const j = await r.json()
      if (j?.project) p = j.project
    } catch {
      setApiOk(false)
    }
    if (!p) {
      try {
        const raw = localStorage.getItem(LS_SCRIPT(id))
        if (raw) p = JSON.parse(raw)
      } catch {}
    }
    if (p) {
      let norm = normalizeProject(p)
      // 磁盘版本比本机缓存新时以磁盘为准，否则把磁盘版写回缓存。
      // 不这么做的话，另一个窗口 / 旧标签页里的副本会被自动保存心跳写回磁盘，
      // 表现为「删掉的角色、剧集在刷新后又回来了」。
      try {
        const rawLocal = localStorage.getItem(LS_SCRIPT(id))
        if (rawLocal) {
          const local = normalizeProject(JSON.parse(rawLocal))
          // rev 优先：本地 rev 更高说明本机有更新内容（离线编辑过），以本地为准；
          // 否则以磁盘为准并把磁盘版写回缓存，避免旧副本被自动保存心跳写回磁盘。
          const lr = Number(local?.meta?.rev) || 1
          const sr = Number(norm?.meta?.rev) || 1
          if (lr > sr) norm = local
          else localStorage.setItem(LS_SCRIPT(id), JSON.stringify(norm))
        }
      } catch {}
      setProject(norm)
      setActiveRef(norm)
    }
    activeRef.current = id
    try {
      localStorage.setItem(LS_ACTIVE, id)
    } catch {}
    setLibrary((lib) => ({ ...lib, activeId: id }))
    setLoading(false)
    return !!p
  }

  // 立即把待写内容落盘（不管自动保存是否开启）。
  // 返回 Promise，调用方可 await 以保证切换剧本 / 关页面之前写完。
  const flushSave = async () => {
    const pend = pendingRef.current
    beatRef.current = Date.now()
    setAutoNext(autoCfg.on ? autoCfg.sec : 0)
    if (!pend) return
    pendingRef.current = null
    await postScript(pend.id, pend.p, pend.s)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      let lib = null
      try {
        const r = await fetch('/api/library')
        const j = await r.json()
        if (j?.library) lib = j.library
      } catch {
        if (alive) setApiOk(false)
      }
      if (!lib) {
        try {
          const raw = localStorage.getItem(LS_LIB)
          if (raw) lib = JSON.parse(raw)
        } catch {}
      }
      if (!alive) return
      const safeLib = {
        activeId: lib?.activeId || null,
        scripts: Array.isArray(lib?.scripts) ? lib.scripts : [],
      }
      setLibrary(safeLib)
      // 库里缺机检分的条目（例如从旧单项目迁移来的）补算一次，避免主页显示 0 分
      if (safeLib.scripts.some((s) => typeof s.score !== 'number')) {
        const next = { ...safeLib, scripts: [...safeLib.scripts] }
        await Promise.all(
          safeLib.scripts
            .filter((s) => typeof s.score !== 'number')
            .map(async (s) => {
              try {
                const r = await fetch(`/api/script?id=${encodeURIComponent(s.id)}`)
                const j = await r.json()
                if (!j?.project) return
                const sum = summaryOf(normalizeProject(j.project))
                const i = next.scripts.findIndex((x) => x.id === s.id)
                if (i >= 0) next.scripts[i] = { ...next.scripts[i], ...sum, id: s.id }
              } catch {}
            }),
        )
        if (alive) writeLibrary(next)
      }
      let want = null
      try {
        want = localStorage.getItem(LS_ACTIVE)
      } catch {}
      const target = safeLib.scripts.some((s) => s.id === want) ? want : safeLib.activeId
      if (target && safeLib.scripts.some((s) => s.id === target)) await openScript(target)
      if (!alive) return
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 页面关闭或刷新时，把还没落盘的最后一次修改写下去。
  // 只在「确实有未落盘改动」时才写——否则会把别处已删除的剧本重新写回磁盘。
  useEffect(() => {
    const onUnload = () => {
      if (!pendingRef.current) return
      pendingRef.current = null
      const id = activeRef.current
      const p = projectRef.current
      if (!id || !p) return
      try {
        localStorage.setItem(LS_SCRIPT(id), JSON.stringify(p))
      } catch {}
      try {
        const body = new Blob([JSON.stringify({ id, project: p, summary: summaryOf(p) })], { type: 'application/json' })
        navigator.sendBeacon?.('/api/script', body)
      } catch {}
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // 自动保存心跳：每秒刷新倒计时；归零且存在未落盘改动时写盘一次。
  useEffect(() => {
    if (!autoCfg.on) {
      setAutoNext(0)
      return
    }
    beatRef.current = Date.now()
    setAutoNext(autoCfg.sec)
    const iv = setInterval(() => {
      const left = autoCfg.sec - Math.floor((Date.now() - beatRef.current) / 1000)
      if (left > 0) {
        setAutoNext(left)
        return
      }
      beatRef.current = Date.now()
      setAutoNext(autoCfg.sec)
      const pend = pendingRef.current
      if (pend) {
        pendingRef.current = null
        postRef.current?.(pend.id, pend.p, pend.s)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [autoCfg.on, autoCfg.sec])

  // 设置抽屉改了自动保存 → savePrefs 广播 mjw:prefs，这里立刻跟，不用刷新页面。
  useEffect(() => {
    const onPrefs = (e) => {
      const next = autoSaveOf(e?.detail)
      autoRef.current = next
      setAutoCfg(next)
    }
    window.addEventListener('mjw:prefs', onPrefs)
    return () => window.removeEventListener('mjw:prefs', onPrefs)
  }, [])

  // 手动改自动保存（侧栏开关 / 设置抽屉都走这里，写回 localStorage）
  const setAutoSave = (patch = {}) => {
    const prefs = loadPrefs()
    const next = autoSaveOf({ ...prefs, autosave: patch.on ?? prefs.autosave, autosaveSec: patch.sec ?? prefs.autosaveSec })
    savePrefs({ ...prefs, autosave: next.on, autosaveSec: next.sec })
    setAutoCfg(next)
    autoRef.current = next
    if (!next.on) setAutoNext(0)
    beatRef.current = Date.now()
    if (pendingRef.current) setSaveState(next.on ? `待保存 · ${next.sec} 秒后落盘` : '待保存 · 自动保存已关')
  }

  // 只认 fn 对 draft 的原地修改，忽略返回值
  // （否则 Object.assign(p.meta, patch) 这类返回子对象，会把整个 project 写成一个 meta）
  const mutate = (fn) => {
    setProject((prev) => {
      if (!prev) return prev
      const draft = JSON.parse(JSON.stringify(prev))
      if (typeof fn === 'function') fn(draft)
      else Object.assign(draft, fn)
      draft.meta = { ...draft.meta, updatedAt: new Date().toISOString() }
      setActiveRef(draft)
      const id = activeRef.current
      if (id) {
        const s = summaryOf(draft)
        try {
          localStorage.setItem(LS_SCRIPT(id), JSON.stringify(draft))
        } catch {}
        setLibrary((lib) => ({
          ...lib,
          scripts: lib.scripts.map((x) => (x.id === id ? { ...x, ...s, id } : x)),
        }))
        // 只标脏，真正写盘交给自动保存定时器（或手动保存）。
        // localStorage 上面已经同步写过了，所以就算浏览器崩了也不丢内容。
        pendingRef.current = { id, p: draft, s }
      }
      return draft
    })
    const cfg = autoRef.current
    setSaveState(cfg.on ? `待保存 · ${cfg.sec} 秒后落盘` : '待保存 · 自动保存已关')
  }

  const createFromProject = async (p, cfg = {}) => {
    const id = cfg.id || newScriptId()
    const proj = normalizeProject(p)
    if (cfg.title) proj.meta = { ...proj.meta, title: cfg.title }
    if (cfg.platform) proj.meta = { ...proj.meta, platform: cfg.platform }
    if (cfg.style) proj.meta = { ...proj.meta, style: cfg.style }
    if (cfg.logline !== undefined) proj.meta = { ...proj.meta, logline: cfg.logline }
    proj.meta = { ...proj.meta, createdAt: proj.meta.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
    const s = summaryOf(proj)
    const entry = { id, createdAt: proj.meta.createdAt, ...s }
    writeLibrary({ ...library, activeId: id, scripts: [entry, ...library.scripts] })
    setProject(proj)
    setActiveRef(proj)
    activeRef.current = id
    try {
      localStorage.setItem(LS_SCRIPT(id), JSON.stringify(proj))
      localStorage.setItem(LS_ACTIVE, id)
    } catch {}
    if (apiOk) await postScript(id, proj, s)
    return id
  }

  const createScript = async (cfg) => {
    const p = emptyProject()
    p.meta = { ...p.meta, ...cfg }
    p.episodes = [emptyEpisode(1)]
    p.characters = cfg.characters || []
    const id = await createFromProject(p, cfg)
    notify('剧本已新建：' + (cfg.title || '未命名漫剧'))
    return id
  }

  const loadDemo = async () => {
    try {
      const seed = await fetch('/seed.json').then((r) => (r.ok ? r.json() : null))
      if (!seed) throw new Error('no seed')
      const id = await createFromProject(seed, {})
      notify('示例剧本已载入')
      return id
    } catch {
      notify('示例数据读取失败')
      return null
    }
  }

  const renameScript = async (id, title) => {
    const name = String(title || '').trim()
    if (!id || !name) return
    const entry = library.scripts.find((s) => s.id === id)
    const lib = { ...library, scripts: library.scripts.map((s) => (s.id === id ? { ...s, title: name } : s)) }
    writeLibrary(lib)
    if (id === activeRef.current) {
      mutate((p) => {
        p.meta.title = name
      })
    } else if (entry) {
      try {
        const r = await fetch(`/api/script?id=${encodeURIComponent(id)}`)
        const j = await r.json()
        if (j?.project) {
          const p = normalizeProject(j.project)
          p.meta = { ...p.meta, title: name, updatedAt: new Date().toISOString() }
          if (apiOk) await postScript(id, p, summaryOf(p))
        }
      } catch {}
    }
    notify('已重命名为：' + name)
  }

  const duplicateScript = async (id) => {
    const src = library.scripts.find((s) => s.id === id)
    if (!src) return null
    const newId = newScriptId()
    const title = `${src.title}（副本）`
    try {
      const r = await fetch('/api/script/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: id, id: newId, title }),
      })
      const j = await r.json()
      if (j?.ok && j.library) {
        writeLibrary(j.library)
        notify('已复制：' + title)
        return newId
      }
      throw new Error(j?.error || 'copy failed')
    } catch {
      try {
        const r = await fetch(`/api/script?id=${encodeURIComponent(id)}`)
        const j = await r.json()
        if (j?.project) {
          const p = normalizeProject(j.project)
          p.meta = { ...p.meta, title }
          const nid = await createFromProject(p, { id: newId, title })
          notify('已复制：' + title)
          return nid
        }
      } catch {}
      notify('复制失败')
      return null
    }
  }

  const deleteScript = async (id) => {
    const rest = library.scripts.filter((s) => s.id !== id)
    try {
      await fetch('/api/script/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {}
    try {
      localStorage.removeItem(LS_SCRIPT(id))
    } catch {}
    const nextId = rest[0]?.id || null
    writeLibrary({ activeId: library.activeId === id ? nextId : library.activeId, scripts: rest })
    if (activeRef.current === id) {
      activeRef.current = null
      setProject(null)
      setActiveRef(null)
      if (nextId) await openScript(nextId)
      else {
        try {
          localStorage.removeItem(LS_ACTIVE)
        } catch {}
      }
    }
    notify('剧本已删除')
  }

  const refreshLibrary = async () => {
    try {
      const r = await fetch('/api/library')
      const j = await r.json()
      if (j?.library) writeLibrary(j.library, { persist: false })
    } catch {
      setApiOk(false)
    }
  }

  const actions = useMemo(
    () => ({
      // ---- 场景 / 环境 ----
      /** 加一条空场景卡，返回新 id */
      addScene: (patch = {}) => {
        let id = ''
        mutate((p) => {
          if (!Array.isArray(p.scenes)) p.scenes = []
          const sc = emptyScene(patch)
          p.scenes.push(sc)
          id = sc.id
        })
        return id
      },
      updateScene: (id, patch) =>
        mutate((p) => {
          const sc = (p.scenes || []).find((x) => x.id === id)
          if (sc) Object.assign(sc, patch)
        }),
      removeScene: (id) =>
        mutate((p) => {
          p.scenes = (p.scenes || []).filter((x) => x.id !== id)
        }),
      /**
       * 整批合并推测结果：按 name 去重，已填的字段不覆盖（人工改过就是人工的），陈设取并集。
       * 这样反复点「从原文推测」不会把确认过的值冲掉。
       */
      mergeScenes: (list) =>
        mutate((p) => {
          if (!Array.isArray(p.scenes)) p.scenes = []
          const mergeProps = (a, b) => [...new Set([...(a || []), ...(b || [])])].filter(Boolean).slice(0, 10)
          ;(Array.isArray(list) ? list : []).forEach((raw) => {
            if (!raw || !raw.name) return
            const hit = p.scenes.find((x) => x.name === raw.name)
            if (!hit) {
              p.scenes.push({ ...emptyScene(), ...raw, id: raw.id || uid('sc') })
              return
            }
            const keep = (k) => (String(hit[k] || '').trim() ? hit[k] : raw[k] || '')
            Object.assign(hit, {
              place: keep('place'),
              time: keep('time'),
              weather: keep('weather'),
              light: keep('light'),
              tone: keep('tone'),
              ambience: keep('ambience'),
              props: mergeProps(hit.props, raw.props),
              desc: String(hit.desc || '').trim() ? hit.desc : raw.desc || describeScene(hit),
              confidence: hit.confidence === 'high' ? 'high' : raw.confidence || hit.confidence,
              open: [...new Set([...(hit.open || []), ...(raw.open || [])])],
            })
            if (!hit.at) hit.at = new Date().toISOString()
          })
        }),
      /** 回答一条待确认：写字段 → 从 open 里划掉 → 重算场景名与描述 */
      answerScene: (sceneId, field, value) =>
        mutate((p) => {
          const sc = (p.scenes || []).find((x) => x.id === sceneId)
          if (!sc || !field) return
          sc[field] = value
          sc.open = (sc.open || []).filter((f) => f !== field)
          if (field === 'place' || field === 'time') {
            const place = field === 'place' ? value : sc.place
            const time = field === 'time' ? value : sc.time
            sc.name = place && time ? place + '·' + time : place || time || sc.name
          }
          if (!sc.open.length) sc.confidence = 'high'
          sc.desc = describeScene(sc)
        }),
      setMeta: (patch) => mutate((p) => Object.assign(p.meta, patch)),
      addEpisode: () =>
        mutate((p) => {
          const no = p.episodes.length + 1
          p.episodes.push(emptyEpisode(no))
        }),
      removeEpisode: (id) =>
        mutate((p) => {
          p.episodes = p.episodes.filter((e) => e.id !== id).map((e, i) => ({ ...e, no: i + 1 }))
        }),
      updateEpisode: (id, patch) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === id)
          if (e) Object.assign(e, patch)
        }),
      /** 写入 / 清空这一集的原文段落；清空时连带清掉锚点，否则锚点会指向不存在的句子 */
      setEpisodeSource: (id, text) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === id)
          if (!e) return
          e.sourceText = String(text || '')
          if (!e.sourceText.trim()) e.anchors = []
        }),
      /** 整批替换锚点（自动识别 / 手动清空都走它） */
      setEpisodeAnchors: (id, anchors) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === id)
          if (!e) return
          e.anchors = (Array.isArray(anchors) ? anchors : [])
            .map((a) => ({ sid: Number(a && a.sid), type: String((a && a.type) || '冲突') }))
            .filter((a) => Number.isInteger(a.sid) && a.sid >= 0)
        }),
      /** 单句切换锚点：有则删，无则加（type 缺省交给调用方判） */
      toggleAnchor: (id, sid, type) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === id)
          if (!e) return
          if (!Array.isArray(e.anchors)) e.anchors = []
          const i = e.anchors.findIndex((a) => a.sid === sid)
          if (i >= 0) e.anchors.splice(i, 1)
          else e.anchors.push({ sid, type: type || '冲突' })
          e.anchors.sort((a, b) => a.sid - b.sid)
        }),
      /**
       * 把「一集文本」生成的结果写进当前剧本。
       * ep: { title, hook, hookType, recap, beats[], cliffhangers[], shots[], characters[] }
       * opts.targetId: 有则覆盖该集（保留集号），无则追加为新的一集
       */
      importEpisode: (ep, opts = {}) =>
        mutate((p) => {
          ;(ep?.characters || []).forEach((c) => {
            if (!c?.name) return
            if (!p.characters.some((x) => x.name === c.name)) {
              p.characters.push({ ...c, id: uid('ch') })
            }
          })
          const shots = (ep?.shots || []).map((s, i) => ({ ...s, no: i + 1 }))
          const target = opts.targetId ? p.episodes.find((e) => e.id === opts.targetId) : null
          if (target) {
            Object.assign(target, {
              title: ep.title || target.title,
              hook: ep.hook || '',
              hookType: ep.hookType || target.hookType,
              summary: ep.summary || target.summary,
              sourceText: ep.sourceText || ep.text || target.sourceText || '',
              anchors: autoA(ep.sourceText || ep.text || target.sourceText || ''),
              recap: ep.recap || '',
              beats: ep.beats?.length ? ep.beats : target.beats,
              cliffhangers: ep.cliffhangers?.length ? ep.cliffhangers : target.cliffhangers,
              shots,
            })
            return target.no
          }
          const no = p.episodes.length + 1
          const base = emptyEpisode(no)
          p.episodes.push({
            ...base,
            title: ep.title || base.title,
            hook: ep.hook || '',
            hookType: ep.hookType || base.hookType,
            summary: ep.summary || base.summary,
            sourceText: ep.sourceText || ep.text || '',
            anchors: autoA(ep.text || ''),
            recap: ep.recap || '',
            beats: ep.beats?.length ? ep.beats : base.beats,
            cliffhangers: ep.cliffhangers || [],
            shots: shots.length ? shots : base.shots,
          })
          return no
        }),
      /**
       * 批量写入多集（整本分集后用）。
       * eps: [{ title, hook, hookType, recap, beats, cliffhangers, shots, characters }]
       * 从现有集数之后连续编号；角色按 name 去重合并，已存在的角色保留原卡。
       */
      importEpisodes: (eps) =>
        mutate((p) => {
          const list = Array.isArray(eps) ? eps.filter(Boolean) : []
          if (!list.length) return 0
          list.forEach((ep) => {
            ;(ep.characters || []).forEach((c) => {
              if (!c?.name) return
              if (!p.characters.some((x) => x.name === c.name)) {
                p.characters.push({ ...c, id: uid('ch') })
              }
            })
          })
          const startNo = p.episodes.length
          list.forEach((ep, k) => {
            const no = startNo + k + 1
            const base = emptyEpisode(no)
            const shots = (ep.shots || []).map((s, i) => ({ ...s, no: i + 1 }))
            p.episodes.push({
              ...base,
              title: ep.title || base.title,
              hook: ep.hook || '',
              hookType: ep.hookType || base.hookType,
              summary: ep.summary || base.summary,
              sourceText: ep.sourceText || ep.text || '',
              anchors: autoA(ep.text || ''),
              recap: ep.recap || '',
              beats: ep.beats?.length ? ep.beats : base.beats,
              cliffhangers: ep.cliffhangers || [],
              shots: shots.length ? shots : base.shots,
            })
          })
          return list.length
        }),
      updateShot: (epId, shotId, patch) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === epId)
          const s = e?.shots.find((x) => x.id === shotId)
          if (s) Object.assign(s, patch)
        }),
      addShot: (epId) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === epId)
          if (e) e.shots.push(emptyShot(e.shots.length + 1))
        }),
      removeShot: (epId, shotId) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === epId)
          if (e) e.shots = e.shots.filter((s) => s.id !== shotId).map((s, i) => ({ ...s, no: i + 1 }))
        }),
      moveShot: (epId, shotId, dir) =>
        mutate((p) => {
          const e = p.episodes.find((x) => x.id === epId)
          if (!e) return
          const i = e.shots.findIndex((s) => s.id === shotId)
          const j = i + dir
          if (i < 0 || j < 0 || j >= e.shots.length) return
          const arr = e.shots
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
          e.shots = arr.map((s, k) => ({ ...s, no: k + 1 }))
        }),
      addCharacter: () =>
        mutate((p) => {
          p.characters.push(emptyCharacter(`角色${p.characters.length + 1}`))
        }),
      pushCharacter: (c) =>
        mutate((p) => {
          p.characters.push(c)
        }),

      updateCharacter: (id, patch) =>
        mutate((p) => {
          const c = p.characters.find((x) => x.id === id)
          if (c) Object.assign(c, patch)
        }),
      removeCharacter: (id) =>
        mutate((p) => {
          p.characters = p.characters.filter((c) => c.id !== id)
        }),
      // ---- 自定义音色（V1 / V2 …）----
      addVoice: (patch) =>
        mutate((p) => {
          if (!Array.isArray(p.voices)) p.voices = []
          const seq = voiceSeq(p.voices.length)
          p.voices.push({ ...emptyCustomVoice(`自定义音色 ${p.voices.length + 1}`), ...(patch || {}), seq })
        }),
      updateVoice: (id, patch) =>
        mutate((p) => {
          const v = (p.voices || []).find((x) => x.id === id)
          if (!v) return
          const before = voiceTitle(v)
          Object.assign(v, patch)
          const after = voiceTitle(v)
          // 改了名字就把正在用它的角色一起改名，否则绑定会断
          if (before !== after) p.characters.forEach((c) => { if (c.voice === before) c.voice = after })
        }),
      removeVoice: (id) =>
        mutate((p) => {
          const list = p.voices || []
          const oldLabels = new Map(list.map((v) => [v.id, voiceTitle(v)]))
          const rest = list.filter((x) => x.id !== id).map((x, i) => ({ ...x, seq: voiceSeq(i) }))
          const remap = new Map()
          rest.forEach((v) => {
            const old = oldLabels.get(v.id)
            if (old && old !== voiceTitle(v)) remap.set(old, voiceTitle(v))
          })
          p.voices = rest
          p.characters.forEach((c) => {
            if (!c.voice) return
            if (oldLabels.get(id) === c.voice) { c.voice = ''; return }
            if (remap.has(c.voice)) c.voice = remap.get(c.voice)
          })
        }),
      /** 把某个角色当前这套参数存成新音色并立刻绑定（角色卡的「存为新音色」） */
      adoptVoice: (charId, profile, name) =>
        mutate((p) => {
          if (!Array.isArray(p.voices)) p.voices = []
          const seq = voiceSeq(p.voices.length)
          const v = { ...emptyCustomVoice(String(name || '自定义音色').slice(0, 20)), ...(profile || {}), seq }
          p.voices.push(v)
          const c = p.characters.find((x) => x.id === charId)
          if (c) c.voice = voiceTitle(v)
        }),

      addTopic: () =>
        mutate((p) => {
          p.topics.push({ id: uid('tp'), title: '新选题', genre: '', audience: '', logline: '', memory: '' })
        }),
      updateTopic: (id, patch) =>
        mutate((p) => {
          const t = p.topics.find((x) => x.id === id)
          if (t) Object.assign(t, patch)
        }),
      removeTopic: (id) =>
        mutate((p) => {
          p.topics = p.topics.filter((t) => t.id !== id)
        }),
      addAsset: () =>
        mutate((p) => {
          p.assets.push({ id: uid('as'), ep: 1, shot: 1, status: '已有', path: '', note: '' })
        }),
      updateAsset: (id, patch) =>
        mutate((p) => {
          const a = p.assets.find((x) => x.id === id)
          if (a) Object.assign(a, patch)
        }),
      removeAsset: (id) =>
        mutate((p) => {
          p.assets = p.assets.filter((a) => a.id !== id)
        }),
      addAssetImage: (kind = 'view') =>
        mutate((p) => {
          p.assetImages.push(emptyAssetImage(kind))
        }),
      updateAssetImage: (id, patch) =>
        mutate((p) => {
          const a = p.assetImages.find((x) => x.id === id)
          if (a) Object.assign(a, patch)
        }),
      setExportSkip: (keys) =>
        mutate((p) => {
          p.meta.exportSkip = Array.isArray(keys) ? [...new Set(keys.map(String).filter(Boolean))] : []
        }),
      removeAssetImage: (id) =>
        mutate((p) => {
          p.assetImages = p.assetImages.filter((a) => a.id !== id)
        }),
      /** 给任意素材（含自动汇总的三视图/服装卡）起别名：键是图片路径，空名表示恢复默认 */
      renameAsset: (path, name) =>
        mutate((p) => {
          if (!path) return
          if (!p.assetNames) p.assetNames = {}
          const v = String(name || '').trim().slice(0, 40)
          if (v) p.assetNames[path] = v
          else delete p.assetNames[path]
        }),
      // ── 资产生成任务（05 页：主视图 / 四视图 / 表情 / 配饰 / 服装）──
      addAssetJob: (kind, patch = {}) =>
        mutate((p) => {
          if (!Array.isArray(p.assetJobs)) p.assetJobs = []
          p.assetJobs.push(emptyAssetJob(kind, patch))
        }),
      updateAssetJob: (id, patch) =>
        mutate((p) => {
          const j = (p.assetJobs || []).find((x) => x.id === id)
          if (j) Object.assign(j, patch)
        }),
      removeAssetJob: (id) =>
        mutate((p) => {
          p.assetJobs = (p.assetJobs || []).filter((x) => x.id !== id)
        }),
      /** 给每个（非随机）角色补齐缺的资产任务；有 prop 才建配饰、每套服装建一条。返回新增条数 */
      seedAssetJobs: () => {
        let added = 0
        mutate((p) => {
          if (!Array.isArray(p.assetJobs)) p.assetJobs = []
          const has = (kind, charId, outfitId) =>
            p.assetJobs.some((j) => j.kind === kind && j.charId === charId && (j.outfitId || '') === (outfitId || ''))
          for (const c of p.characters || []) {
            if (c.random) continue
            const base = { charId: c.id, charName: c.name }
            for (const k of ['main', 'ortho', 'expr']) {
              if (has(k, c.id, '')) continue
              p.assetJobs.push(emptyAssetJob(k, { ...base, name: `${c.name} · ${ASSET_JOB_KINDS.find((x) => x.id === k).label}`, seed: Number(c.seed) || 0, image: (c.refImages || [])[0] || c.refImage || '' }))
              added++
            }
            if ((c.prop || '').trim() && !has('acc', c.id, '')) {
              p.assetJobs.push(emptyAssetJob('acc', { ...base, name: `${c.name} · 配饰`, seed: Number(c.seed) || 0, image: (c.refImages || [])[0] || c.refImage || '' }))
              added++
            }
            for (const o of c.outfits || []) {
              if (has('outfit', c.id, o.id)) continue
              p.assetJobs.push(emptyAssetJob('outfit', { ...base, outfitId: o.id, outfitSeq: o.seq || '', name: `${c.name} ${o.seq || ''} · ${o.name || '服装'}`, seed: Number(c.seed) || 0, image: o.refImage || (c.refImages || [])[0] || c.refImage || '' }))
              added++
            }
          }
        })
        return added
      },
      /** 把生成好的图落到素材库，或直接设成角色参考图 */
      adoptAssetRender: (jobId, target = 'asset') =>
        mutate((p) => {
          const j = (p.assetJobs || []).find((x) => x.id === jobId)
          if (!j || !j.render) return
          if (target === 'ref') {
            const c = (p.characters || []).find((x) => x.id === j.charId)
            if (c) {
              const list = Array.isArray(c.refImages) && c.refImages.length ? c.refImages : c.refImage ? [c.refImage] : []
              const next = [j.render, ...list.filter((x) => x !== j.render)]
              c.refImages = next
              c.refImage = next[0]
            }
            return
          }
          if (!Array.isArray(p.assetImages)) p.assetImages = []
          if (p.assetImages.some((a) => a.path === j.render)) return
          p.assetImages.push(
            emptyAssetImage(
              j.kind === 'ortho' ? 'view' : j.kind === 'expr' ? 'expression' : j.kind === 'acc' ? 'accessory' : j.kind === 'outfit' ? 'outfit' : 'view',
            ),
          )
          const last = p.assetImages[p.assetImages.length - 1]
          Object.assign(last, { name: j.name || '资产', charId: j.charId, charName: j.charName, path: j.render })
        }),
      replaceProject: (next) => {
        const p = normalizeProject(next)
        setProject(p)
        setActiveRef(p)
        const id = activeRef.current
        if (id) {
          const s = summaryOf(p)
          try {
            localStorage.setItem(LS_SCRIPT(id), JSON.stringify(p))
          } catch {}
          postScript(id, p, s)
        }
      },
    }),
    [],
  )

  const value = {
    library,
    scripts: library.scripts,
    activeId: library.activeId,
    project,
    ready,
    loading,
    saveState,
    apiOk,
    autoSave: autoCfg,
    autoNext,
    setAutoSave,
    mutate,
    actions,
    notify,
    toast,
    setProject,
    openScript,
    createScript,
    createFromProject,
    loadDemo,
    renameScript,
    duplicateScript,
    deleteScript,
    refreshLibrary,
    flushSave,
    summaryOf,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProject() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProject 必须在 ProjectProvider 内使用')
  return v
}
