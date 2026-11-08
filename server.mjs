// 生产模式：静态服务 dist/ + 复用同一套 /api
import http from 'node:http'
import fs from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi } from './api.mjs'

// here = 代码与静态产物所在目录（打包进 app 后是只读的 asar / 安装目录）
// root = 数据目录（data/uploads/assets/renders/exports/skills）。桌面版用 MJW_ROOT
//        指到 userData，这样升级软件不会把台账冲掉。
const here = path.dirname(fileURLToPath(import.meta.url))
const root = process.env.MJW_ROOT ? path.resolve(process.env.MJW_ROOT) : here
const dist = path.join(here, 'dist')
const PORT = Number(process.env.PORT || 5273)
const HOST = process.env.HOST || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

mkdirSync(root, { recursive: true })
const api = createApi(root)

const server = http.createServer(async (req, res) => {
  if (await api(req, res)) return

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  let p = decodeURIComponent(url.pathname)
  if (p === '/' || p === '') p = '/index.html'

  const file = path.join(dist, p)
  if (!file.startsWith(dist)) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }

  try {
    const buf = await fs.readFile(file)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(buf)
  } catch {
    // SPA 回退
    try {
      const html = await fs.readFile(path.join(dist, 'index.html'))
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
    } catch {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('dist/ 还没有构建产物，先跑 npm run build 或直接用 start.bat（开发模式）')
    }
  }
})

server.listen(PORT, HOST, () => {
  console.log(`AI漫剧工作台 → http://${HOST}:${PORT}`)
  console.log(`台账：${path.join(root, 'data', 'library.json')}`)
  console.log(`导出：${path.join(root, 'exports')}`)
})
