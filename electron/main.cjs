// Electron 外壳：把一个本地 HTTP 服务塞进桌面窗口。
//
// 为什么是 .cjs 而不是 ESM：
// 本仓库 package.json 是 "type": "module"，Electron 33 的 ESM 主进程在加载内置 'electron'
// 模块时会走到 cjsPreparseModuleExports 并抛
// `TypeError: Cannot read properties of undefined (reading 'exports')`（主进程直接起不来）。
// 主进程改用 CommonJS 是官方在打包场景下的稳妥写法，渲染进程那边照旧是 ESM。
//
// 设计要点：
// 1. 后端仍是 server.mjs —— 桌面版和命令行版跑的是同一套代码，不存在两套逻辑。
// 2. 数据目录用 MJW_ROOT 指到 userData：打包后代码在 asar/安装目录里可能只读，
//    台账绝不能被写进那里，否则升级一次就丢一次。
// 3. 端口先探测再起：5273 被别的实例占用时自动往后找，不跟用户抢端口。
// 4. 退出时杀掉子进程，不留孤儿 node 进程占端口。
const { app, BrowserWindow, shell, Menu, dialog, nativeImage } = require('electron')
const { spawn } = require('node:child_process')
const { createServer } = require('node:net')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

// 某些受限终端（CI runner、agent 沙箱、以受限令牌启动的 shell）里 Chromium 沙箱创建失败，
// 进程会以 0x80000003（STATUS_BREAKPOINT）直接退出且不打印任何东西。
// 本工具加载的全是本机 127.0.0.1 的页面，这种环境下关掉沙箱是可接受的；
// 普通双击启动不需要它，所以做成显式开关而不是默认行为。
// 注意：no-sandbox 必须在命令行上传（npm run app:trouble）。
// 用 app.commandLine.appendSwitch('no-sandbox') 太晚——Chromium 在 main.cjs 执行前就决定了沙箱。
const NO_SANDBOX = process.argv.includes('--no-sandbox')

const here = __dirname
const APP_ROOT = path.dirname(here) // 项目根 / 安装目录
const SERVER = path.join(APP_ROOT, 'server.mjs')
const ICON = path.join(APP_ROOT, 'assets', 'icon.ico')

const DATA_ROOT = path.join(app.getPath('userData'), 'data-root')
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

let child = null
let win = null
let baseUrl = ''
let starting = false

/** 找一个空闲端口（从 5273 开始往后试 20 个） */
function pickPort(start = 5273, tries = 20) {
  return new Promise((resolve, reject) => {
    let port = start
    const attempt = () => {
      const srv = createServer()
      srv.once('error', () => {
        srv.close()
        if (++port > start + tries) reject(new Error('没有可用端口'))
        else attempt()
      })
      srv.once('listening', () => {
        const p = srv.address().port
        srv.close(() => resolve(p))
      })
      srv.listen(port, '127.0.0.1')
    }
    attempt()
  })
}

/** 等 HTTP 起来（最多 20 秒），避免窗口先白屏 */
async function waitReady(url, timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (!child) return false // 后端自己先挂了，别再等
    try {
      const r = await fetch(`${url}/api/health`)
      if (r.ok) return true
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/** 记住上次的窗口大小与位置；读不到就用默认值 */
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    return {
      width: Math.max(1080, Number(s.width) || 1440),
      height: Math.max(680, Number(s.height) || 940),
      x: Number.isFinite(s.x) ? s.x : undefined,
      y: Number.isFinite(s.y) ? s.y : undefined,
      maximized: !!s.maximized,
    }
  } catch {
    return { width: 1440, height: 940, maximized: false }
  }
}

async function saveState() {
  if (!win || win.isDestroyed()) return
  const b = win.getNormalBounds()
  try {
    await fsp.writeFile(STATE_FILE, JSON.stringify({ ...b, maximized: win.isMaximized() }, null, 2))
  } catch {
    /* 写不进就算了，不影响使用 */
  }
}

async function startServer() {
  const port = await pickPort()
  baseUrl = `http://127.0.0.1:${port}`

  // 数据根先建好：首启时 server.mjs 会往里写 library.json
  await fsp.mkdir(DATA_ROOT, { recursive: true }).catch(() => {})

  child = spawn(process.execPath, [SERVER], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // 用 electron 自带的 node 跑后端，用户不用另装 node
      PORT: String(port),
      HOST: '127.0.0.1',
      MJW_ROOT: DATA_ROOT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
  child.on('exit', (code) => {
    if (code && code !== 0 && win && !win.isDestroyed()) {
      dialog.showErrorBox('后端已退出', `server.mjs 退出，代码 ${code}。\n看控制台日志定位。`)
    }
    child = null
  })

  const ok = await waitReady(baseUrl)
  if (!ok) throw new Error(`后端没在 20 秒内就绪：${baseUrl}`)
  return { port, dataRoot: DATA_ROOT }
}

/** 后端没起来时的可读页面，比白屏强 */
function errorPage(message) {
  const esc = (s) =>
    String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
  const html = `<!doctype html><meta charset="utf-8"><title>启动失败</title>
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#fff;color:#14161a;
       font:14px/1.7 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}
  .box{max-width:560px;padding:28px 32px;border:1px solid #e2e5ea;border-left:3px solid #e0533a;
       border-radius:10px;box-shadow:0 1px 2px rgba(21,23,27,.05)}
  h1{margin:0 0 10px;font-size:16px;font-weight:600}
  p{margin:0 0 8px;color:#474d55;font-size:12.5px}
  code{background:#f6f7f9;padding:1px 5px;border-radius:4px;font-size:12px}
  .hint{margin-top:14px;padding-top:12px;border-top:1px solid #eceef2;color:#646a73;font-size:12px}
</style>
<div class="box">
  <h1>页面没加载出来</h1>
  <p>${esc(message)}</p>
  <p>数据目录：<code>${esc(DATA_ROOT)}</code></p>
  <div class="hint">
    排查顺序：① 这个端口是不是被别的程序占了 · ② 安装目录里的 <code>server.mjs</code> 还在不在 ·
    ③ 从命令行跑 <code>npm run app</code> 看完整日志。
  </div>
</div>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function createWindow() {
  const st = loadState()
  const icon = fs.existsSync(ICON) ? nativeImage.createFromPath(ICON) : undefined

  win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#ffffff',
    title: 'AI 漫剧工作台',
    icon,
    autoHideMenuBar: true,
    show: false, // 等首帧就绪再显示，避免白闪
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  if (st.maximized) win.maximize()

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show()
  })

  win.loadURL(baseUrl)

  // 外链一律走系统浏览器：工作台里点 GitHub / 文档链接不该把窗口变成浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(baseUrl)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // F5 / Ctrl+R 刷新、F12 开发者工具：别被网页的快捷键逻辑吃掉
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    const k = String(input.key || '').toLowerCase()
    if (k === 'f5' || (input.control && k === 'r')) {
      e.preventDefault()
      win.reload()
    }
    if (k === 'f12' || (input.control && input.shift && k === 'i')) {
      e.preventDefault()
      win.webContents.toggleDevTools()
    }
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return // 主动中断（换地址）不用报
    if (win && !win.isDestroyed()) win.loadURL(errorPage(`${desc}（${code}）· ${url}`))
  })

  win.webContents.on('render-process-gone', () => {
    if (win && !win.isDestroyed()) win.reload()
  })

  let saveTimer = null
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveState(), 400)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)

  win.on('close', () => {
    clearTimeout(saveTimer)
    saveState()
  })

  win.on('closed', () => {
    win = null
  })
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '数据',
      submenu: [
        { label: '打开数据目录', click: () => shell.openPath(DATA_ROOT) },
        { label: '打开导出目录', click: () => shell.openPath(path.join(DATA_ROOT, 'exports')) },
        { label: '打开工作流目录', click: () => shell.openPath(path.join(DATA_ROOT, 'workflows')) },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () =>
            dialog.showMessageBox({
              message: 'AI 漫剧工作台',
              detail: `版本 ${app.getVersion()}\n后端 ${baseUrl || '（未启动）'}\n数据 ${DATA_ROOT}`,
            }),
        },
      ],
    },
  ])
}

// 单实例：第二次点图标就把已有窗口拉到前面，而不是再起一个后端
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    if (starting) return
    starting = true
    try {
      await startServer()
    } catch (e) {
      dialog.showErrorBox('启动失败', String((e && e.message) || e))
      app.quit()
      return
    }
    Menu.setApplicationMenu(buildMenu())
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && baseUrl) createWindow()
    })
  })
}

function shutdown() {
  if (child && !child.killed) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    child = null
  }
}

app.on('window-all-closed', () => {
  shutdown()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', shutdown)
process.on('exit', shutdown)
