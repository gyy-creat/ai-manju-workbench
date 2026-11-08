/**
 * 图片素材公共工具：路径解析 / 上传。
 * 参考图、服装图、资产库素材共用这一套，别再各写一份。
 */

/** 台账里存的路径 → 浏览器能渲染的 src；渲染不出来返回 ''（历史遗留裸路径就属于这种） */
export const photoSrc = (v) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^(https?:|data:|blob:)/i.test(s)) return s
  if (s.startsWith('/media/')) return s
  if (s.startsWith('uploads/')) return `/media/${s.slice(8)}`
  if (s.startsWith('assets/')) return `/media/${s}`
  // ComfyUI 跑回来的成品：renders/ep1/xxx.png（图片和视频同一条路）
  if (s.startsWith('renders/')) return `/media/${s}`
  return ''
}

/** 视频类成品用这个判断（<video> 而不是 <img>） */
export const isVideoPath = (v) => /\.(mp4|webm|mov|gif|webp)$/i.test(String(v || ''))

export const IMG_MAX_BYTES = 12 * 1024 * 1024

export const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('读文件失败'))
    fr.readAsDataURL(file)
  })

/** 上传一张图 → {ok, path, url, bytes}，失败抛 Error（消息可直接给用户看） */
export async function uploadImage(file) {
  if (!file) throw new Error('没拿到文件')
  if (!/^image\//.test(file.type || '')) throw new Error('只能传图片文件')
  if (file.size > IMG_MAX_BYTES) throw new Error('图片超过 12MB，先压缩再传')
  const data = await readAsDataUrl(file)
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, name: file.name || 'asset' }),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || '上传失败')
  return j
}

/** 资产库素材类型。id 进台账，label 上界面，hint 是新卡片上的一句话指引 */
export const ASSET_KINDS = [
  { id: 'view', label: '三视图', hint: '正面 / 侧面 / 背面，同一套衣服' },
  { id: 'expression', label: '表情', hint: '一张图一格，标清情绪名' },
  { id: 'accessory', label: '配饰', hint: '戒指 / 怀表 / 疤 / 耳饰，单独抠出来' },
  { id: 'scene', label: '场景', hint: '空镜优先，不带人，方便反复复用' },
  { id: 'prop', label: '道具', hint: '关键剧情物件，别和场景混' },
  { id: 'outfit', label: '服装', hint: '来自主要角色页的服装卡' },
]

export const kindOf = (id) => ASSET_KINDS.find((k) => k.id === id) || ASSET_KINDS[0]
