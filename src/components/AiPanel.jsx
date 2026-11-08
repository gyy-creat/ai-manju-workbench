import React, { useEffect, useState } from 'react'
import { Btn, Field, Text, Panel, Tag, Num } from '../ui.jsx'

/** 常见 OpenAI 兼容端点，点一下就填好 */
export const PRESETS = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' },
]

/**
 * AI 接入面板：设置页与设置抽屉共用同一份实现。
 * key 只走本机 /api/ai 代理，浏览器不接触。
 */
export default function AiPanel({ notify, compact = false }) {
  const [cfg, setCfg] = useState(null)
  const [keyInput, setKeyInput] = useState('')
  const [state, setState] = useState('')
  const [busy, setBusy] = useState(false)
  const [testOut, setTestOut] = useState(null)

  const load = async () => {
    try {
      const r = await fetch('/api/ai/config')
      const j = await r.json()
      if (j?.ok) setCfg(j.config)
    } catch {
      setState('读取配置失败')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const patch = (p) => setCfg((c) => ({ ...(c || {}), ...p }))

  const save = async () => {
    setBusy(true)
    setState('')
    try {
      const body = {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      }
      if (keyInput.trim()) body.apiKey = keyInput.trim()
      const r = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j?.ok) throw new Error(j?.error || '保存失败')
      setCfg(j.config)
      setKeyInput('')
      setState('已保存')
      notify?.('AI 接口配置已保存')
    } catch (e) {
      setState('保存失败：' + String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setTestOut(null)
    try {
      const body = { baseUrl: cfg.baseUrl, model: cfg.model, temperature: cfg.temperature, maxTokens: 512 }
      if (keyInput.trim()) body.apiKey = keyInput.trim()
      const r = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      setTestOut(j)
    } catch (e) {
      setTestOut({ ok: false, error: String(e?.message || e) })
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) {
    return (
      <Panel title="AI 接入">
        <div className="dim" style={{ fontSize: 12 }}>正在读取配置…</div>
      </Panel>
    )
  }

  return (
    <Panel
      title="AI 接入"
      extra={<Tag level={cfg.hasKey ? 'accent' : 'warn'}>{cfg.hasKey ? `已配置 ${cfg.keyMask}` : '未配置 key'}</Tag>}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            onClick={() => patch({ baseUrl: p.baseUrl, model: p.model })}
            style={{ cursor: 'pointer' }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Field label="Base URL（OpenAI 兼容端点，末尾不带 /chat/completions）">
        <Text value={cfg.baseUrl} onChange={(v) => patch({ baseUrl: v })} placeholder="https://api.deepseek.com/v1" />
      </Field>
      <div className="row">
        <Field label="模型名">
          <Text value={cfg.model} onChange={(v) => patch({ model: v })} placeholder="deepseek-chat" />
        </Field>
        <Field label="温度">
          <Num value={cfg.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step={0.1} />
        </Field>
      </div>
      <Field label={`API Key${cfg.hasKey ? '（留空则不修改已保存的 key）' : ''}`}>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={cfg.hasKey ? cfg.keyMask : 'sk-...'}
          autoComplete="off"
        />
      </Field>
      <div className="row">
        <Field label="max_tokens">
          <Num value={cfg.maxTokens} onChange={(v) => patch({ maxTokens: v })} min={512} max={32000} step={512} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
          <Btn size="sm" variant="primary" onClick={save} disabled={busy}>
            保存
          </Btn>
          <Btn size="sm" onClick={test} disabled={busy}>
            测试连通
          </Btn>
        </div>
      </div>
      {state && <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{state}</div>}
      {testOut && (
        <div
          className="dim"
          style={{ fontSize: 11.5, lineHeight: 1.8, marginTop: 6, color: testOut.ok ? 'var(--ok)' : 'var(--err)' }}
        >
          {testOut.ok
            ? `连通正常 · ${testOut.ms}ms · ${testOut.model || ''} · 回：「${testOut.reply || ''}」`
            : `连通失败 · ${testOut.ms || 0}ms · ${testOut.error || ''}`}
        </div>
      )}
    </Panel>
  )
}
