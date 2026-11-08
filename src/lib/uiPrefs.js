/**
 * 界面偏好：主题色 / 字体 / 密度。
 * 只存 localStorage（mjw:ui:v1），不写进项目台账——换剧本不该换皮肤。
 * 应用方式：给 <html> 打 data-theme / data-font / data-scale，样式全在 styles.css 末尾。
 */

const KEY = 'mjw:ui:v1'

export const THEMES = [
  { id: 'paper', name: '白色', swatch: '#ffffff', desc: '默认：白底墨字，印一点朱砂' },
  { id: 'ink', name: '墨纸朱砂', swatch: '#e0533a', desc: '夜里看稿的深色版：墨底纸字' },
  { id: 'indigo', name: '靛青', swatch: '#6f93cc', desc: '冷色压场，适合悬疑/权谋' },
  { id: 'malachite', name: '石绿', swatch: '#5fae8a', desc: '清透一点，适合甜宠/治愈' },
  { id: 'gamboge', name: '藤黄', swatch: '#e2b13c', desc: '偏暖，适合年代/市井' },
  { id: 'rose', name: '胭脂', swatch: '#d8607e', desc: '女性向、情感线' },
]

export const FONTS = [
  { id: 'system', name: '系统无衬线', desc: '苹方 / 雅黑，默认，屏幕可读性最好' },
  { id: 'serif', name: '宋体', desc: '通篇衬线，读剧本正文更顺' },
  { id: 'mono', name: '等宽', desc: '对齐看表格用' },
]

export const SCALES = [
  { id: 's', name: '紧凑', v: 0.92 },
  { id: 'm', name: '标准', v: 1 },
  { id: 'l', name: '宽松', v: 1.08 },
  { id: 'xl', name: '大号', v: 1.16 },
]

// 自动保存间隔（秒）。30 是一集的「想一件事」的时间尺度：改完顺手就存了，又不会每敲一个字就写盘。
export const AUTOSAVE_SECS = [
  { id: 10, name: '10 秒', desc: '写得很密时用，磁盘 io 会多一点' },
  { id: 30, name: '30 秒', desc: '默认' },
  { id: 60, name: '1 分钟' },
  { id: 120, name: '2 分钟' },
  { id: 300, name: '5 分钟', desc: '只想偶尔落一次盘' },
]

export const DEFAULTS = { theme: 'paper', font: 'system', scale: 'm', autosave: true, autosaveSec: 30 }

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    const merged = { ...DEFAULTS, ...raw }
    // 默认主题从「墨纸朱砂」换成了「白色」：没手动选过主题的老用户跟着换过来，
    // 手动选过（themeTouched）的保持原样——不然改个默认值会把人正在用的深色顶掉。
    if (!raw.themeTouched && raw.theme === 'ink') merged.theme = DEFAULTS.theme
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePrefs(p) {
  let prev = {}
  try {
    prev = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {}
  const store = { ...(p || {}) }
  // 只要主题真的被改过就记一笔，默认值的后续调整不再影响他
  if (p && p.theme !== undefined && p.theme !== (prev.theme ?? DEFAULTS.theme)) store.themeTouched = true
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
  // 广播出去：store 里的自动保存定时器、侧栏的开关都靠这条事件同步，
  // 否则改完设置要刷新页面才生效。
  try {
    window.dispatchEvent(new CustomEvent('mjw:prefs', { detail: { ...DEFAULTS, ...p } }))
  } catch {}
}

/** 归一化自动保存配置：间隔夹在 5s–30min，非法值回默认。 */
export function autoSaveOf(p) {
  const prefs = { ...DEFAULTS, ...(p || {}) }
  const sec = Number(prefs.autosaveSec)
  return {
    on: prefs.autosave !== false,
    sec: Number.isFinite(sec) ? Math.min(1800, Math.max(5, Math.round(sec))) : 30,
  }
}

export function applyPrefs(p) {
  const prefs = { ...DEFAULTS, ...(p || {}) }
  const el = document.documentElement
  el.dataset.theme = prefs.theme
  el.dataset.font = prefs.font
  const sc = SCALES.find((s) => s.id === prefs.scale) || SCALES[1]
  el.style.setProperty('--ui-scale', String(sc.v))
  return prefs
}
