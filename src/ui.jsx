import React, { useEffect } from 'react'

export const Btn = ({ children, variant = '', size = '', icon, ...rest }) => (
  <button type="button" {...rest} className={`btn ${variant} ${size} ${rest.className || ''}`}>
    {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}
    {children}
  </button>
)

/* ---------------- icons (统一 24 网格、1.6 描边) ---------------- */
const PATHS = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15V5a1 1 0 0 1 1-1h10',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17zM14 5l3 3',
  arrow: 'M5 12h13M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  film: 'M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4',
  check: 'M4 12.5 9 18 20 6',
  alert: 'M12 4 3 20h18zM12 10v4M12 17h.01',
  x: 'M6 6l12 12M18 6 6 18',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  play: 'M8 5l11 7-11 7z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  refresh: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  scissors: 'M6 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8.2 8.2 20 20M20 4 8.2 15.8',
}

export function Icon({ name, size = 16, className = '' }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={`ic ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/* ---------------- 表单 ---------------- */
export function Field({ label, hint, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export const Text = ({ value, onChange, ...rest }) => (
  <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
)

export const Num = ({ value, onChange, ...rest }) => (
  <input
    type="number"
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    {...rest}
  />
)

export const Area = ({ value, onChange, rows = 3, ...rest }) => (
  <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
)

export const Sel = ({ value, onChange, options = [], ...rest }) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
    {options.map((o) =>
      typeof o === 'object' ? (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ) : (
        <option key={o} value={o}>
          {o}
        </option>
      ),
    )}
  </select>
)

export const Tag = ({ children, level = '' }) => <span className={`tag ${level}`}>{children}</span>

/* ---------------- 展示块 ---------------- */
export function Stat({ k, v, unit, hint }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {unit && <small>{unit}</small>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function Panel({ title, children, extra, style, className = '' }) {
  return (
    <div className={`panel ${className}`} style={style}>
      {(title || extra) && (
        <h3>
          <span>{title}</span>
          {extra}
        </h3>
      )}
      {children}
    </div>
  )
}

export const Empty = ({ children = '暂无数据', icon = 'folder', action }) => (
  <div className="empty">
    <div className="empty-ic">
      <Icon name={icon} size={22} />
    </div>
    <div className="empty-text">{children}</div>
    {action}
  </div>
)

export const Kv = ({ k, v }) => (
  <div className="kv">
    <span className="k">{k}</span>
    <span className="v">{v || '—'}</span>
  </div>
)

/* ---------------- 单选卡（站酷第 9、13 条：用单选而不是一堆按钮） ---------------- */
export function Seg({ value, onChange, options = [], columns = 2 }) {
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o
        const label = typeof o === 'object' ? o.label : o
        const desc = typeof o === 'object' ? o.desc : ''
        const on = value === val
        return (
          <button
            type="button"
            key={val}
            className={`seg-item ${on ? 'on' : ''}`}
            onClick={() => onChange(val)}
            aria-pressed={on}
          >
            <span className="seg-dot" />
            <span className="seg-body">
              <span className="seg-label">{label}</span>
              {desc && <span className="seg-desc">{desc}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- 分数环（站酷第 11、26 条：数据可视化+渐变） ---------------- */
export function Ring({ value = 0, size = 88, stroke = 8, label = '机检分' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = v >= 90 ? 'ok' : v >= 75 ? 'warn' : 'err'
  return (
    <div className={`ring ring-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`rg-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-a)" />
            <stop offset="100%" stopColor="var(--ring-b)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#rg-${tone})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-inner">
        <b>{Math.round(v)}</b>
        <span>{label}</span>
      </div>
    </div>
  )
}

/* ---------------- 弹窗（毛玻璃 + 双边框圆角） ---------------- */
export function Modal({ open, title, desc, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {desc && <p>{desc}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}
