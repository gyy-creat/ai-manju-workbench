#!/usr/bin/env node
/**
 * 打交接包：把源码 + 数据 + 文档 + 截图打成一个 zip，交给外部 AI 改。
 *
 *   node scripts/pack-handoff.mjs            # → exports/handoff/ai-manju-workbench-handoff-<时间戳>.zip
 *   node scripts/pack-handoff.mjs --dir out  # 换输出目录
 *
 * 不含：node_modules / dist / .tmp / exports / .git
 * 附带：MANIFEST.sha256（逐文件 sha256，收包时用它算「改了哪些文件」）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(process.cwd())
const STAMP = new Date()
  .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  .replace(/[-: ]/g, '')
  .slice(0, 14)

const args = process.argv.slice(2)
const dirFlag = args.indexOf('--dir')
const OUT_DIR = path.resolve(ROOT, dirFlag >= 0 ? args[dirFlag + 1] : 'exports/handoff')

const INCLUDE = [
  'index.html',
  'vite.config.js',
  'package.json',
  'api.mjs',
  'server.mjs',
  'start.bat',
  'README.md',
  'HANDOFF.md',
  'PROMPT.md',
  '.gitignore',
  'public',
  'src',
  'scripts',
  'data',
  'docs',
  'assets',
  'uploads',
]
const SKIP_NAMES = new Set(['node_modules', 'dist', '.tmp', '.git', 'exports', 'handoff', 'handoff-return', 'data/comfy.json',])
// 精确到相对路径的排除项：密钥绝不进包（示例剧本数据仍随包，方便接手方直接看到成品）
const SKIP_PATHS = new Set(['data/ai-config.json', 'settings.json', 'data/skills.json', 'data/comfy.json'])
// 目录级排除：站酷《UI 改版 35 招》长图切块共 16.9MB，交接用不到，需要时找原作者要
const SKIP_DIRS = new Set(['docs/ui-ref', 'skills', 'renders'])

function walk(abs, rel, acc) {
  let st
  try {
    st = fs.statSync(abs)
  } catch {
    return
  }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs)) {
      if (SKIP_NAMES.has(name)) continue
      const childRel = rel ? `${rel}/${name}` : name
      if (SKIP_DIRS.has(childRel)) continue
      walk(path.join(abs, name), childRel, acc)
    }
  } else {
    if (SKIP_PATHS.has(rel) || rel.endsWith('/ai-config.json')) return
    acc.push(rel)
  }
}

const files = []
for (const entry of INCLUDE) {
  const abs = path.join(ROOT, entry)
  if (!fs.existsSync(abs)) continue
  walk(abs, entry, files)
}
files.sort()

const sha256 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')

// staging 目录：保证 zip 里是一个干净的根目录
const staging = path.join(ROOT, '.tmp', `handoff-${STAMP}`)
fs.rmSync(staging, { recursive: true, force: true })
const pkgRoot = path.join(staging, 'ai-manju-workbench')
for (const rel of files) {
  const dest = path.join(pkgRoot, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(path.join(ROOT, rel), dest)
}

// MANIFEST.sha256
const manifestLines = [
  `# ai-manju-workbench handoff · ${STAMP} · ${files.length} files`,
  ...files.map((rel) => `${sha256(path.join(ROOT, rel))}  ${rel}`),
]
fs.writeFileSync(path.join(pkgRoot, 'MANIFEST.sha256'), manifestLines.join('\n') + '\n', 'utf8')

// 顺手把 MANIFEST 复制到根目录一份（本机也留档）
fs.writeFileSync(path.join(ROOT, 'MANIFEST.sha256'), manifestLines.join('\n') + '\n', 'utf8')

fs.mkdirSync(OUT_DIR, { recursive: true })
const zipName = `ai-manju-workbench-handoff-${STAMP}.zip`
const zipPath = path.join(OUT_DIR, zipName)

// bsdtar 自带 zip 支持（Windows 10+ 与 MSYS 都有），免装依赖
execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', staging, 'ai-manju-workbench'], { stdio: 'inherit' })

const zipSize = fs.statSync(zipPath).size
const zipHash = sha256(zipPath)
fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${zipName}\n`, 'utf8')
fs.rmSync(staging, { recursive: true, force: true })

console.log('')
console.log('交接包已生成')
console.log('  文件数  ' + (files.length + 1) + '（含 MANIFEST.sha256）')
console.log('  包大小  ' + (zipSize / 1024 / 1024).toFixed(2) + ' MB')
console.log('  包路径  ' + zipPath)
console.log('  sha256  ' + zipHash)
console.log('')
console.log('把上面这个 zip 交给对方；对方改完把整包发回后跑：')
console.log('  node scripts/unpack-handoff.mjs <返回的 zip>')
