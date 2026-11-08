#!/usr/bin/env node
// mjw-skills —— 从 GitHub 找 AI 漫剧 / 短剧 / 分镜相关的开源 skill，按 Star 或下载量排行，
// 一键下载到本地，并把规则文档打印出来（可直接贴进工作台的「规则」下拉，或任何 LLM 的 system）。
//
//   npx mjw-skills list                      榜单（默认按 Star）
//   npx mjw-skills list --sort downloads     按下载量
//   npx mjw-skills list --refresh            强制重拉（默认缓存 24 小时）
//   npx mjw-skills search 分镜                在榜单里搜
//   npx mjw-skills install owner/repo        下载到 <home>/skills/
//   npx mjw-skills remove owner/repo
//   npx mjw-skills docs owner/repo           打印规则正文
//   npx mjw-skills where                     看数据落在哪
//
// 环境变量：GITHUB_TOKEN 可提高 GitHub 速率限制；MJW_SKILL_HOME 可改数据目录。
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createSkillHub, skillIdOf } from '../src/lib/skills.js'

const HOME = process.env.MJW_SKILL_HOME || path.join(os.homedir(), '.ai-manju-workbench')
const hub = createSkillHub({ home: HOME })

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', x: '\x1b[0m' }
  : { dim: '', b: '', g: '', y: '', r: '', c: '', x: '' }

const argv = process.argv.slice(2)
const cmd = (argv[0] || 'list').toLowerCase()
const rest = argv.slice(1)
const flag = (name) => rest.includes(`--${name}`)
const valueOf = (name, fallback = '') => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback
}
const positional = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')))

const wan = (n) => {
  const v = Number(n) || 0
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`
  return String(v)
}

function usage() {
  console.log(`${C.b}mjw-skills${C.x} —— AI 漫剧开源 skill 市场（命令行版）

  mjw-skills list [--sort stars|downloads] [--refresh] [--limit 30]
  mjw-skills search <关键词>
  mjw-skills install <owner/repo>
  mjw-skills remove <owner/repo>
  mjw-skills docs <owner/repo>
  mjw-skills where

数据目录：${HOME}
GITHUB_TOKEN 可提高速率限制；MJW_SKILL_HOME 可改数据目录。`)
}

function printItems(items, limit) {
  const shown = items.slice(0, limit)
  let i = 0
  for (const it of shown) {
    i++
    const mark = it.installed ? `${C.g}✓${C.x}` : ' '
    console.log(
      `${mark} ${String(i).padStart(2)}. ${C.b}${it.fullName}${C.x} ${C.dim}(${it.lang || '—'})${C.x}`,
    )
    if (it.desc) console.log(`      ${it.desc}`)
    console.log(
      `      ${C.y}★ ${wan(it.stars)}${C.x}  ⑂ ${wan(it.forks)}  ↓ ${wan(it.downloads)}` +
        (it.license ? `  ${C.dim}${it.license}${C.x}` : '') +
        (it.installed ? `  ${C.g}已下载${C.x}` : ''),
    )
  }
  if (items.length > shown.length) {
    console.log(`${C.dim}… 还有 ${items.length - shown.length} 个，用 --limit 查看更多${C.x}`)
  }
}

async function ensureList(refresh) {
  const r = await hub.listSkills({ refresh })
  if (r.warning) console.log(`${C.y}! ${r.warning}${C.x}`)
  if (r.source === 'github') {
    console.log(`${C.dim}榜单已刷新 · ${r.items.length} 个仓库${C.x}\n`)
  } else if (r.fetchedAt) {
    console.log(`${C.dim}缓存自 ${new Date(r.fetchedAt).toLocaleString()}，--refresh 可重拉${C.x}\n`)
  }
  return r.items
}

const main = async () => {
  if (cmd === '-h' || cmd === '--help' || cmd === 'help') return usage()

  if (cmd === 'where') {
    console.log(`skills/    ${hub.skillsDir}`)
    console.log(`skills.json ${hub.skillsFile}`)
    const sm = await hub.loadSkills()
    const n = Object.keys(sm.installed).length
    console.log(`已下载      ${n} 个`)
    for (const [id, rec] of Object.entries(sm.installed)) {
      console.log(`  ${C.g}✓${C.x} ${rec.fullName} ${C.dim}(${rec.mode}, ${id})${C.x}`)
    }
    return
  }

  if (cmd === 'list') {
    const sort = String(valueOf('sort', 'stars')).toLowerCase()
    const limit = Number(valueOf('limit', '30')) || 30
    let items = await ensureList(flag('refresh'))
    items = [...items].sort((a, b) =>
      sort === 'downloads' ? b.downloads - a.downloads || b.stars - a.stars : b.stars - a.stars,
    )
    printItems(items, limit)
    return
  }

  if (cmd === 'search') {
    const kw = positional[0] || ''
    if (!kw) return usage()
    const items = await ensureList(flag('refresh'))
    const hit = items.filter((it) =>
      `${it.fullName} ${it.desc} ${it.topics.join(' ')} ${it.lang}`.toLowerCase().includes(kw.toLowerCase()),
    )
    if (!hit.length) {
      console.log(`${C.y}榜单里没有匹配「${kw}」的仓库。${C.x}（榜单只收漫剧/短剧/分镜相关的 60 个，试试 --refresh 或换关键词）`)
      return
    }
    printItems(hit, Number(valueOf('limit', '20')) || 20)
    return
  }

  if (cmd === 'install') {
    const target = positional[0] || ''
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) {
      console.error(`${C.r}仓库名要写成 owner/repo${C.x}`)
      process.exitCode = 1
      return
    }
    console.log(`下载 ${C.b}${target}${C.x} …`)
    const r = await hub.installSkill(target)
    console.log(`${C.g}✓${C.x} 已落盘：${r.dir}`)
    console.log(`  模式 ${r.mode} · ${r.files.length} 项 · 下载量 ${wan(r.downloads)}`)
    const doc = await hub.loadSkillDoc(r.id)
    if (doc) console.log(`  规则文档：${doc.file}（${doc.chars} 字${doc.truncated ? '，读时截 6000' : ''}）`)
    console.log(`\n贴进工作台：设置 → Skill 里选它；或者 ${C.c}mjw-skills docs ${target}${C.x} 直接打印正文`)
    return
  }

  if (cmd === 'remove') {
    const target = positional[0] || ''
    const ok = await hub.removeSkill(target)
    console.log(ok ? `${C.g}✓${C.x} 已删除 ${target}` : `${C.dim}没有装过 ${target}${C.x}`)
    return
  }

  if (cmd === 'docs') {
    const target = positional[0] || ''
    const doc = await hub.loadSkillDoc(skillIdOf(target))
    if (!doc) {
      console.error(`${C.r}没找到 ${target} 的规则文档${C.x}（先 install，或仓库里没有 SKILL.md / README.md）`)
      process.exitCode = 1
      return
    }
    console.error(`${C.dim}# ${doc.fullName} · ${doc.file} · ${doc.chars} 字${doc.truncated ? '（截到 6000）' : ''}${C.x}`)
    console.log(doc.text)
    return
  }

  return usage()
}

main().catch((e) => {
  console.error(`${C.r}${e && e.message ? e.message : e}${C.x}`)
  process.exitCode = 1
})
