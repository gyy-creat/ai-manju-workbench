// 打一个「免安装便携版」：解压 → 双击 start.bat → 浏览器打开工作台。
// 需要本机已装 Node.js 18+（前端已构建进 dist/，不用 npm install）。
// 用法：npm run portable
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const pexec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const VER = pkg.version || '0.0.0'
const NAME = `ai-manju-workbench-${VER}-portable`
const outRoot = path.join(root, 'exports', 'portable')
const stage = path.join(outRoot, NAME)

// 服务端要的东西：静态产物 + 后端 + api.mjs 直接 import 的那几个 lib
const FILES = [
  'api.mjs',
  'server.mjs',
  'LICENSE',
  'README.md',
  'public/seed.json',
  'src/lib/imageModels.js',
  'src/lib/videoModels.js',
]
const DIRS = ['dist']

const mkdir = (p) => fs.mkdir(p, { recursive: true })
const copy = async (rel) => {
  const from = path.join(root, rel)
  if (!existsSync(from)) {
    console.log('  skip（不存在）', rel)
    return false
  }
  const to = path.join(stage, rel)
  await mkdir(path.dirname(to))
  await fs.copyFile(from, to)
  return true
}

const START_BAT = `@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js 18+ is required.  https://nodejs.org
  echo.
  pause
  exit /b 1
)
if not exist "dist\\index.html" (
  echo.
  echo   dist\\ is missing - this portable build is broken, please re-download.
  echo.
  pause
  exit /b 1
)
start "" http://127.0.0.1:5273
node server.mjs
if errorlevel 1 pause
`

const README_TXT = `AI 漫剧工作台 ${VER} — 便携版
========================================

1) 装 Node.js 18 或更新版本（只需一次）：https://nodejs.org
2) 双击 start.bat
3) 浏览器会自动打开 http://127.0.0.1:5273

数据都存在这个文件夹里：
  data/       台账（library.json + scripts/*.json），先备份这个目录
  uploads/    你上传的参考图 / 服装图 / 场景图
  assets/ref/ 手工维护的素材图
  renders/    ComfyUI 回来的图
  exports/    一键投产包导出的成品

想换端口：set PORT=6000 && node server.mjs
想只在局域网访问：set HOST=0.0.0.0 && node server.mjs（注意：此时会拒绝外站请求，但同网段可访问）

AI 接入是可选的：设置 → AI 接入 填 baseUrl / 模型名 / key（OpenAI 兼容即可）。
不填也能全流程跑通，全部走本地规则。key 只写在本机 data/ai-config.json。

许可证：MIT
`

async function main() {
  if (!existsSync(path.join(root, 'dist', 'index.html'))) {
    console.error('dist/ 还没有构建产物，先跑 npm run build')
    process.exit(1)
  }
  await fs.rm(stage, { recursive: true, force: true })
  await mkdir(stage)

  console.log('复制文件：')
  for (const f of FILES) console.log(' ', (await copy(f)) ? '✓' : '·', f)
  for (const d of DIRS) {
    await fs.cp(path.join(root, d), path.join(stage, d), { recursive: true })
    console.log('  ✓', d + '/')
  }

  // 运行期目录（空目录也要建，用户第一次打开就有地方写）
  for (const d of ['data', 'data/scripts', 'uploads', 'assets/ref', 'renders', 'exports', 'skills']) {
    await mkdir(path.join(stage, d))
    await fs.writeFile(path.join(stage, d, '.gitkeep'), '')
  }

  await fs.writeFile(path.join(stage, 'start.bat'), START_BAT, 'latin1') // 全 ASCII，避免 cmd 代码页问题
  await fs.writeFile(path.join(stage, 'README.txt'), '\ufeff' + README_TXT, 'utf8')
  await fs.writeFile(
    path.join(stage, 'VERSION.txt'),
    `ai-manju-workbench ${VER}\nbuilt ${new Date().toISOString()}\n`
  )

  const zip = path.join(outRoot, `${NAME}.zip`)
  await fs.rm(zip, { force: true })
  await pexec('tar', ['-a', '-c', '-f', zip, '-C', outRoot, NAME])
  const st = await fs.stat(zip)

  const count = (await fs.readdir(stage, { recursive: true })).length
  console.log('')
  console.log(`便携版 → ${path.relative(root, zip)}`)
  console.log(`  ${(st.size / 1024 / 1024).toFixed(2)} MB · ${count} 项`)
  console.log(`  解压后双击 start.bat（需要 Node 18+，不需要 npm install）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
