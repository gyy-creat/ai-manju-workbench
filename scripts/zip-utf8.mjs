// 用 UTF-8 文件名打 zip（通用位标记 0x0800）。
//
// 为什么不用 bsdtar / Compress-Archive：两者在中文 Windows 上把文件名按 GBK 写进
// 中央目录，且不设 UTF-8 标志位。本机解压看着正常，但 GitHub Release 的下载者
// 在 macOS / Linux 上解出来是 `AI���繤��̨/` 这样的乱码目录。
//
// 用法：
//   node scripts/zip-utf8.mjs <源目录> <输出.zip> [--strip 顶层目录名]
//
// 例：
//   node scripts/zip-utf8.mjs "exports/app/影格" "exports/app/影格-0.3.0-便携版.zip"
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const crc32 = (buf) => (zlib.crc32 ? zlib.crc32(buf) : zlib.crc32Fallback?.(buf) ?? legacyCrc(buf))

// 老版本 Node 兜底（zlib.crc32 是 v22.2 才有的）
let TABLE = null
function legacyCrc(buf) {
  if (!TABLE) {
    TABLE = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABLE[i] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31)
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  return { time, date }
}

/** 递归收集文件（相对路径用 / 分隔） */
function walk(root, dir = '', out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + e.name : e.name
    if (e.isDirectory()) {
      out.push({ rel, dir: true })
      walk(root, rel, out)
    } else if (e.isFile()) {
      out.push({ rel, dir: false })
    }
  }
  return out
}

export function zipDir(srcDir, outFile, opts = {}) {
  // prefix：在条目名前加一层目录，解压得到一个整齐的文件夹而不是把 175 个文件摊在地上
  const prefix = opts.prefix ? String(opts.prefix).replace(/\/+$/, '') + '/' : ''
  const skip = opts.exclude || (() => false)
  const entries = walk(srcDir)
    .filter((e) => !skip(e.rel))
    .map((e) => ({ ...e, src: e.rel, rel: prefix + e.rel }))
  const chunks = []
  const central = []
  let offset = 0

  for (const e of entries) {
    const abs = path.join(srcDir, e.src || e.rel)
    const st = fs.statSync(abs)
    const nameBuf = Buffer.from(e.rel, 'utf8') // ← 关键：UTF-8 写名
    const { time, date } = dosTime(st.mtime)
    const isDir = e.dir
    const raw = isDir ? Buffer.alloc(0) : fs.readFileSync(abs)
    const comp = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(raw, { level: opts.level ?? 6 })
    const crc = isDir ? 0 : crc32(raw)
    const method = isDir ? 0 : 8

    // 通用位 0x0800 = 文件名是 UTF-8；目录另置 0x0000
    const flags = 0x0800
    const extAttr = isDir ? 0x10 : 0
    const version = 20

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(version, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, comp)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(version, 4)
    cd.writeUInt16LE(version, 6)
    cd.writeUInt16LE(flags, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(extAttr, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + comp.length
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, Buffer.concat([...chunks, cdBuf, eocd]))
  return { files: entries.filter((e) => !e.dir).length, dirs: entries.filter((e) => e.dir).length, bytes: fs.statSync(outFile).size }
}

// ── CLI ──
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const args = process.argv.slice(2)
  const flags = {}
  const pos = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i]
    else pos.push(args[i])
  }
  const [src, out] = pos
  if (!src || !out) {
    console.error('用法：node scripts/zip-utf8.mjs <源目录> <输出.zip> [--prefix 顶层目录名]')
    process.exit(1)
  }
  const t0 = Date.now()
  const r = zipDir(path.resolve(src), path.resolve(out), {
    prefix: flags.prefix,
    // 别把上一次的 zip / electron-builder 的调试文件打进去（自我包含会翻倍）
    exclude: (rel) => /\.(zip|7z|tar\.gz)$/i.test(rel) || /^builder-debug\.yml$/i.test(rel),
  })
  console.log(`✓ ${out}`)
  console.log(`  ${r.files} 个文件 / ${r.dirs} 个目录 / ${(r.bytes / 1048576).toFixed(1)}MB / ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log('  文件名以 UTF-8 写入（通用位 0x0800），任何系统解压都不乱码')
}
