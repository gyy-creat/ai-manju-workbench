// 通用截图：node .tmp/page-shot.mjs <route> <height> <outname>
import fs from 'node:fs'

const route = process.argv[2] || 'characters'
const height = Number(process.argv[3] || 900)
const out = process.argv[4] || `shot-${route}`

const res = await fetch('http://127.0.0.1:9223/json/list')
const targets = await res.json()
const target = targets.find((t) => t.type === 'page')
if (!target) throw new Error('no page target')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
})
await new Promise((r, j) => {
  ws.addEventListener('open', r, { once: true })
  ws.addEventListener('error', j, { once: true })
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
await send('Network.clearBrowserCache')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:5273/?v=${Date.now()}#/${route}` })
await wait(2800)

const info = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ h: document.body.scrollHeight, txt: [...document.querySelectorAll('.panel h3, .field label')].slice(0,14).map(e=>e.textContent.trim()) })`,
  returnByValue: true,
})
console.log('页面信息:', info.result.value)

const shot = await send('Page.captureScreenshot', { format: 'png' })
const file = `.tmp/${out}.png`
fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(out, fs.statSync(file).size, 'bytes')
ws.close()
