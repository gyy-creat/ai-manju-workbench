#!/usr/bin/env node
/**
 * 收交接包：解开对方返回的 zip，对着 MANIFEST.sha256 算出「新增 / 修改 / 删除」三张清单。
 *
 *   node scripts/unpack-handoff.mjs <zip 路径>
 *   node scripts/unpack-handoff.mjs            # 默认取 exports/handoff-return/ 里最新的 zip
 *
 * 只解压与比对，不动现有代码。确认清单没问题后再决定是否覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(process.cwd())
const RETURN_DIR = path.resolve(ROOT, 'exports/handoff-return')

function latestZip() {
  if (!fs.existsSync(RETURN_DIR)) return null
  const zips = fs
    .readdirSync(RETURN_DIR)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((f) => ({ f, t: fs.statSync(path.join(RETURN_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  return zips.length ? path.join(RETURN_DIR, zips[0].f) : null
}

const arg = process.argv[2]
const zipPath = arg ? path.resolve(ROOT, arg) : latestZip()
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error('找不到 zip。用法：node scripts/unpack-handoff.mjs <zip 路径>')
  process.exit(1)
}

const STAMP = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/[-: ]/g, '').slice(0, 14)
const outDir = path.join(RETURN_DIR, STAMP)
fs.mkdirSync(outDir, { recursive: true })
execFileSync('tar', ['-x', '-f', zipPath, '-C', outDir], { stdio: 'inherit' })

// zip 里应有一个根目录
const roots = fs.readdirSync(outDir).filter((n) => fs.statSync(path.join(outDir, n)).isDirectory())
const pkgRoot = path.join(outDir, roots.length === 1 ? roots[0] : '')
const manifestPath = path.join(pkgRoot, 'MANIFEST.sha256')
if (!fs.existsSync(manifestPath)) {
  console.log('')
  console.log('解压完成：' + pkgRoot)
  console.log('但包里没有 MANIFEST.sha256，无法自动比对改动 —— 需要人工 diff。')
  console.log('提示：可在本机跑 `diff -r --brief . ' + pkgRoot + '`')
  process.exit(0)
}

const sha256 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
const oldHashes = new Map()
for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue
  const m = line.match(/^([0-9a-f]{64})\s{2}(.+)$/)
  if (m) oldHashes.set(m[2].trim(), m[1])
}

const SKIP = new Set(['node_modules', 'dist', '.tmp', '.git', 'exports', 'MANIFEST.sha256'])
function walk(abs, rel, acc) {
  const st = fs.statSync(abs)
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs)) {
      if (SKIP.has(name)) continue
      walk(path.join(abs, name), rel ? `${rel}/${name}` : name, acc)
    }
  } else {
    acc.push(rel)
  }
}
const nowFiles = []
walk(pkgRoot, '', nowFiles)

const added = []
const modified = []
const same = []
for (const rel of nowFiles.sort()) {
  const old = oldHashes.get(rel)
  const now = sha256(path.join(pkgRoot, rel))
  if (old === undefined) added.push(rel)
  else if (old !== now) modified.push(rel)
  else same.push(rel)
}
const removed = [...oldHashes.keys()].filter((rel) => !nowFiles.includes(rel))

const block = (title, list) => {
  console.log('')
  console.log(`${title}（${list.length}）`)
  if (!list.length) return console.log('  -')
  for (const rel of list) console.log('  ' + rel)
}
console.log('')
console.log('收包位置：' + pkgRoot)
console.log('比对基准：' + manifestPath)
console.log('未改动：' + same.length + ' 个文件')
block('新增', added)
block('修改', modified)
block('删除', removed)

if (modified.length || added.length || removed.length) {
  console.log('')
  console.log('下一步：')
  console.log('  1) 看对方 CHANGES.md，核对每个改动是否说了理由')
  console.log('  2) 确认后逐个覆盖，例如：')
  for (const rel of [...added, ...modified]) {
    console.log(`     cp "${path.join(pkgRoot, rel).replace(/\\/g, '/')}" "${rel}"`)
  }
  console.log('  3) 覆盖后跑：npm run build && npm run verify')
} else {
  console.log('')
  console.log('包内容与基线完全一致（没改任何文件）。')
}
