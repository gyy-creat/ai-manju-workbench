// 校验示例数据能否过六项机检：node scripts/verify-seed.mjs（需先 esbuild 打包，见 package.json 的 verify 脚本）
import fs from 'node:fs'
import path from 'node:path'
import { normalizeProject } from '../src/lib/schema.js'
import { runChecks } from '../src/lib/checks.js'

const file = path.join(process.cwd(), 'public', 'seed.json')
const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const p = normalizeProject(raw)
const r = runChecks(p)

const dur = p.episodes.map((e) => ({
  ep: e.no,
  shots: e.shots.length,
  sec: e.shots.reduce((n, s) => n + (Number(s.dur) || 0), 0),
}))

console.log('项目：', p.meta.title, '| 平台', p.meta.platform, '| 画风', p.meta.style)
console.log('角色', p.characters.length, '选题', p.topics.length, '集', p.episodes.length)
dur.forEach((d) => console.log(`  第${d.ep}集：${d.shots} 镜 / ${d.sec.toFixed(1)}s`))
console.log(`机检：分数 ${r.score} | error ${r.errors} | warn ${r.warns} | info ${r.infos}`)
r.issues.forEach((i) => console.log(`  [${i.level}] ${i.rule} ${i.where} — ${i.msg}`))
process.exit(r.errors > 0 ? 1 : 0)
