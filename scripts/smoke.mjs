// 冒烟测试：起一个独立的 server 实例（临时数据目录 + 随机端口），
// 依次敲健康检查、剧本库、脚本读、提示词预览，最后自己关掉。
// 用于 CI（不需要浏览器，也不需要任何 key）。
import { spawn } from 'node:child_process'
import http from 'node:http'
import { createServer } from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })

async function waitReady(url, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${url}/api/health`)
      if (r.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

const checks = []
const ok = (name, cond, extra = '') => {
  checks.push({ name, pass: !!cond, extra })
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
}

const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mjw-smoke-'))
const port = await freePort()
const base = `http://127.0.0.1:${port}`

const proc = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MJW_ROOT: dataRoot },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
proc.stdout.on('data', (d) => (log += d))
proc.stderr.on('data', (d) => (log += d))

try {
  const up = await waitReady(base)
  ok('后端就绪 /api/health', up, up ? `${base}` : log.slice(-300))
  if (up) {
    const h = await (await fetch(`${base}/api/health`)).json()
    ok('health.ok', h.ok === true)
    ok('health.ai.hasKey 为 false（未配置时）', h.ai && h.ai.hasKey === false)

    const lib = await (await fetch(`${base}/api/library`)).json()
    ok('/api/library 可读', Array.isArray(lib.library?.scripts), `scripts=${lib.library?.scripts?.length}`)

    // 写入一个剧本 → 再读回来（验证原子写 + rev）
    const proj = {
      meta: { title: 'smoke', platform: 'douyin', style: 'guoman-houtu', rev: 1 },
      topics: [],
      characters: [],
      episodes: [{ id: 'ep1', no: 1, title: '第一集', shots: [] }],
    }
    const w = await (
      await fetch(`${base}/api/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'smoke_test', project: proj, summary: { title: 'smoke' } }),
      })
    ).json()
    ok('POST /api/script 写入', w.ok === true, `rev=${w.rev}`)

    const r = await (await fetch(`${base}/api/script?id=smoke_test`)).json()
    ok('GET /api/script 读回', r.project?.meta?.title === 'smoke', `rev=${r.project?.meta?.rev}`)

    // 过期 rev 必须 409（乐观锁）
    const stale = await fetch(`${base}/api/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'smoke_test', project: { ...proj, meta: { ...proj.meta, rev: 1 } } }),
    })
    ok('过期 rev 被拒（409）', stale.status === 409, `status=${stale.status}`)

    // 没 key 时 AI 定向应给出可读的中文提示，而不是 500
    const t = await (
      await fetch(`${base}/api/prompt/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots: [] }),
      })
    ).json()
    ok('无 key / 空镜头的错误是中文且非 500', t.ok === false && typeof t.error === 'string', t.error)

    // 路径闸门：外站 Host 必须被拒。fetch 不允许伪造 Host，得用原始 http 请求。
    const evilStatus = await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { Host: 'evil.example.com' } },
        (res) => {
          res.resume()
          resolve(res.statusCode)
        }
      )
      req.on('error', () => resolve(0))
      req.end()
    })
    ok('外站 Host 被拒（403）', evilStatus === 403, `status=${evilStatus}`)
  }
} finally {
  proc.kill()
  await fs.rm(dataRoot, { recursive: true, force: true })
}

const pass = checks.filter((c) => c.pass).length
console.log(`\n冒烟：${pass}/${checks.length} 通过`)
if (pass !== checks.length) process.exit(1)
