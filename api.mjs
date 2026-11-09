// 本地 API：多剧本库（library.json + scripts/{id}.json）+ 导出落盘 + 内部 AI 接入
// 被 vite.config.js（dev 中间件）与 server.mjs（生产静态服务）共用
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const pexec = promisify(execFile)
import { createHash } from 'node:crypto'
import require$$fs from 'node:fs'
import path from 'node:path'
import { modelById, modelSpecText } from './src/lib/imageModels.js'
import { videoModelById, videoModelSpecText, clampVideoDur, fillVideoParams } from './src/lib/videoModels.js'
import { deriveScenesLocal, buildSceneMessages, normalizeSceneResult } from './src/lib/scenes.js'
import { createSkillHub } from './src/lib/skills.js'
import { boomScore, levelOf } from './src/lib/splitter.js'

const DATA_DIR = 'data'
const SCRIPT_DIR = 'scripts'
const EXPORT_DIR = 'exports'
const AI_FILE = 'ai-config.json'
const UPLOAD_DIR = 'uploads'

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\.{2,}/g, '_')
}

function safeId(id) {
  const s = String(id || '')
  return /^[A-Za-z0-9_-]{2,48}$/.test(s) ? s : null
}

async function readBody(req, limit = 32 * 1024 * 1024) {
  // 慢速 / 半开连接保护：不设超时的话，一个只发半个请求体的连接会把 handler 永久占住。
  const prevTimeout = req.timeout
  try {
    req.setTimeout(30000)
  } catch {}
  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) throw new Error('payload too large')
      chunks.push(chunk)
    }
  } finally {
    try {
      req.setTimeout(prevTimeout || 0)
    } catch {}
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

// 原子写：先写同目录的临时文件，fsync 后再 rename 覆盖目标。
// 断电 / 进程被杀时，目标要么是旧版本要么是新版本，不会出现截断的 JSON
// （台账截断 = 整部剧本读出来是 null，索引还指向它，等于消失）。
// 同目录保证 rename 不跨盘；Windows 上 Node 的 fs.rename 以 REPLACE_EXISTING 覆盖。
async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`
  const text = JSON.stringify(obj, null, 2)
  let fh = null
  try {
    fh = await fs.open(tmp, 'w')
    await fh.writeFile(text, 'utf8')
    await fh.sync()
    await fh.close()
    fh = null
    await fs.rename(tmp, file)
  } catch (err) {
    if (fh) await fh.close().catch(() => {})
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

// ============================================================
// 常量与工具（与 src/lib/schema.js 保持同名同序，后端独立一份避免耦合）
// ============================================================
const SIZES = ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写']
const ANGLES = ['平视', '仰视', '俯视', '过肩', '主观', '斜角']
const MOVES = ['固定', '推', '拉', '摇', '移', '跟', '升', '降', '手持', '环绕']
const EMOTIONS = ['平静', '压抑', '紧张', '愤怒', '恐惧', '委屈', '嘲讽', '爽', '心动', '崩溃', '决绝', '反转震撼']
// 必须与 src/lib/schema.js 的 ROLE_PRESETS 一致 —— 这里写旧词（主角/对手/助攻）时，
// 模型会照抄进 role 字段，前端下拉认不出来就显示成「自定义」。
const ROLES = ['男主', '女主', '男配', '女配', '兄弟', '妹妹', '姐姐', '学长', '学姐', '学妹', '学弟', '同学', '群演', '路人']
const HOOK_TYPES = ['冲突开场', '悬念开场', '反转开场', '情绪开场']
// 音色档位：与 src/lib/voice.js 的 VOICE_PRESETS.label 一一对应。
// 这里只放 label（不上整套参数），前端 resolveVoice 会从 label 反推出完整的音色档案，
// 所以改预设时两边都不需要同步，只要 label 对得上。
const VOICES = [
  '少年男·清亮偏薄',
  '青年男·低沉沙哑',
  '青年男·清亮干净',
  '中年男·浑厚温润',
  '老年男·干哑沧桑',
  '青年女·冷清倔强',
  '青年女·清甜',
  '少女·脆弱气声',
  '御姐·磁性压迫',
  '疯批反派·尖利金属',
  '旁白·冷静旁观',
  '群演·颗粒嘈杂',
]

const VOICE_BY_ROLE = {
  // 新定位词（与 src/lib/schema.js 的 ROLE_PRESETS 对齐）
  男主: '青年男·低沉沙哑',
  女主: '青年女·冷清倔强',
  男配: '中年男·浑厚温润',
  女配: '御姐·磁性压迫',
  兄弟: '青年男·清亮干净',
  妹妹: '少女·脆弱气声',
  姐姐: '青年女·清甜',
  学长: '青年男·低沉沙哑',
  学姐: '青年女·冷清倔强',
  学妹: '青年女·清甜',
  学弟: '少年男·清亮偏薄',
  同学: '青年男·清亮干净',
  群演: '群演·颗粒嘈杂',
  路人: '群演·颗粒嘈杂',
  // 兼容旧台账里的定位词
  主角: '青年男·低沉沙哑',
  对手: '青年女·冷清倔强',
  助攻: '中年男·浑厚温润',
  导师: '老年男·干哑沧桑',
}

const MODEL_HINTS_BY_HOST = [
  [/deepseek/i, ['deepseek-chat', 'deepseek-reasoner']],
  [/dashscope|aliyuncs/i, ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long']],
  [/bigmodel|zhipu/i, ['glm-4-plus', 'glm-4-air', 'glm-4-flash']],
  [/moonshot/i, ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-auto']],
  [/openai\.com/i, ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']],
  [/localhost|127\.0\.0\.1|11434/i, ['qwen2.5:14b', 'llama3.1:8b']],
];

// baseUrl 认不出时给的兜底清单（只用于下拉里能选东西，不代表端点真有）
function MODEL_HINTS(baseUrl) {
  const u = String(baseUrl || '');
  for (const [re, list] of MODEL_HINTS_BY_HOST) if (re.test(u)) return list;
  return [];
}

const AI_DEFAULT = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 8000,
}

const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 8)}`
const cnLen = (s) => String(s || '').replace(/[\s，。！？、；：""''（）《》…—~·,.!?;:'"()\[\]]/g, '').length
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)
const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}
const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(Math.max(lo, Math.min(hi, n)) * 10) / 10 : fallback
}
const cut = (s, n) => {
  const str = String(s || '').replace(/\s+/g, ' ').trim()
  return str.length <= n ? str : str.slice(0, n) + '…'
}

// 从模型输出里捞出第一个完整 JSON 对象（容忍 ```json 围栏与前后废话）
function extractJson(text) {
  let s = String(text || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  if (start < 0) throw new Error('模型没有返回 JSON')
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const raw = s.slice(start, i + 1)
        try {
          return JSON.parse(raw)
        } catch {
          // 常见模型瑕疵：尾逗号
          return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'))
        }
      }
    }
  }
  throw new Error('模型返回的 JSON 不完整（可能被 max_tokens 截断）')
}

// ============================================================
// LLM 调用（OpenAI 兼容 /chat/completions）
// ============================================================
async function callLlm(cfg, messages, { timeout = 180000, jsonMode = true } = {}) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('baseUrl 未配置')
  if (!cfg.apiKey) throw new Error('apiKey 未配置')
  const body = {
    model: cfg.model || 'deepseek-chat',
    messages,
    temperature: Number(cfg.temperature) >= 0 ? Number(cfg.temperature) : 0.7,
    max_tokens: clampInt(cfg.maxTokens, 512, 32000, 8000),
    stream: false,
  }
  const send = async (extra) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({ ...body, ...extra }),
        signal: ctrl.signal,
      })
      const text = await r.text()
      if (!r.ok) {
        const err = new Error(`HTTP ${r.status} ${cut(text, 400)}`)
        err.status = r.status
        throw err
      }
      const data = JSON.parse(text)
      return {
        content: data?.choices?.[0]?.message?.content || '',
        usage: data?.usage || null,
        model: data?.model || body.model,
      }
    } finally {
      clearTimeout(timer)
    }
  }
  if (jsonMode) {
    try {
      return await send({ response_format: { type: 'json_object' } })
    } catch (e) {
      // 部分兼容端点不认 response_format，去掉重试一次
      if (e?.status === 400 || e?.status === 422) return await send({})
      throw e
    }
  }
  return await send({})
}

// 只接受本机 / 局域网来源：挡住 DNS rebinding（攻击者域名解析到 127.0.0.1）与跨站 CSRF。
// 空 Host 放行——HTTP/1.1 必带 Host，真被 rebinding 时它一定在。
function bareHost(h) {
  let s = String(h || '').toLowerCase().trim()
  if (s.startsWith('[')) {
    const i = s.indexOf(']')
    if (i > 0) return s.slice(1, i)
  }
  const j = s.lastIndexOf(':')
  if (j > 0) s = s.slice(0, j)
  return s
}

function isPrivateIPv4(h) {
  const p = h.split('.')
  if (p.length !== 4) return false
  const nums = p.map((x) => (x === '' ? NaN : Number(x)))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = nums
  if (a === 127 || a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function isLocalHostName(h) {
  if (!h) return true
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true
  return isPrivateIPv4(h)
}

function isLocalHost(header) {
  return isLocalHostName(bareHost(header))
}

function isLocalOrigin(origin) {
  try {
    return isLocalHostName(bareHost(new URL(String(origin)).host))
  } catch {
    return false
  }
}

// 归一化 usage：兼容 OpenAI（prompt_tokens / prompt_tokens_details.cached_tokens）
// 与 DeepSeek（prompt_cache_hit_tokens / prompt_cache_miss_tokens）两种写法
function hostOf(u) {
  try {
    return new URL(String(u || '')).host || ''
  } catch {
    return ''
  }
}

function usageStats(usage, ms) {
  const u = usage || {}
  const prompt = Number(u.prompt_tokens ?? u.promptTokens ?? 0) || 0
  const completion = Number(u.completion_tokens ?? u.completionTokens ?? 0) || 0
  const total = Number(u.total_tokens ?? u.totalTokens ?? 0) || prompt + completion
  const cached = Number(u.prompt_cache_hit_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0) || 0
  const miss = Number(u.prompt_cache_miss_tokens ?? 0) || Math.max(0, prompt - cached)
  const secs = ms > 0 ? ms / 1000 : 0
  return {
    prompt,
    completion,
    total,
    cached,
    miss,
    tps: secs > 0 && completion > 0 ? Math.round((completion / secs) * 10) / 10 : 0,
    hitRate: prompt > 0 ? Math.round((cached / prompt) * 100) : 0,
  }
}


// ============================================================
// 内置对话：把整部剧本（含导入的原文）压成可读上下文
// 原文必留，分镜吃剩余预算；超预算时只留分镜统计
// ============================================================
function buildChatContext(project, { maxChars = 26000 } = {}) {
  const p = project || {};
  const meta = p.meta || {};
  const head = [];
  head.push(`【项目】${meta.title || '未命名'}`);
  head.push(`平台：${meta.platform || '—'}｜画风：${meta.style || '—'}｜受众：${meta.audience || '—'}`);
  if (meta.logline) head.push(`一句话冲突：${meta.logline}`);
  if (meta.tags) head.push(`标签：${meta.tags}`);

  const chars = Array.isArray(p.characters) ? p.characters : [];
  if (chars.length) {
    head.push('', '【角色】');
    for (const c of chars) {
      const outfits = (c.outfits || [])
        .map((o) => `${o.seq || ''} ${o.name || ''}${o.scene ? `（${o.scene}）` : ''}`.trim())
        .filter(Boolean)
        .join('；');
      head.push(
        `- ${c.name || '无名'}（${c.role || '—'}）${c.random ? '随机路人，不锁脸' : ''}` +
          (c.anchor ? `｜锚定：${c.anchor}` : '') +
          (c.look ? `｜外形：${c.look}` : '') +
          (c.voice ? `｜音色：${c.voice}` : '') +
          (outfits ? `｜服装：${outfits}` : '') +
          (c.seed ? `｜seed：${c.seed}` : ''),
      );
    }
  }

  const eps = Array.isArray(p.episodes) ? p.episodes : [];
  const outline = [];
  const sources = [];
  const shotBlocks = [];
  for (const e of eps) {
    outline.push(
      `- 第 ${e.no} 集《${e.title || '未命名'}》` +
        (e.hook ? `｜钩子：${e.hook}` : '') +
        (e.summary ? `｜概要：${e.summary}` : ''),
    );
    const beats = Array.isArray(e.beats) ? e.beats.filter((b) => (b.text || '').trim()) : [];
    if (beats.length) {
      outline.push(`  节拍：${beats.map((b) => `${b.t || ''}(${b.intensity || 3})${b.text ? '：' + b.text : ''}`).join(' → ')}`);
    }
    if (Array.isArray(e.cliffhangers) && e.cliffhangers.filter(Boolean).length) {
      outline.push(`  未解悬念：${e.cliffhangers.filter(Boolean).join('；')}`);
    }
    if (e.sourceText) sources.push(`〔第 ${e.no} 集原文 · ${String(e.sourceText).length} 字〕\n${e.sourceText}`);
    const shots = Array.isArray(e.shots) ? e.shots : [];
    if (shots.length) {
      const rows = shots.map((sh) => {
        const parts = [`镜${sh.no}`, sh.size, sh.angle, sh.scene, sh.desc];
        if (sh.chars) parts.push(`角色:${sh.chars}`);
        if (sh.dialogue) parts.push(`${sh.speaker || '?'}「${sh.dialogue}」`);
        if (sh.emotion) parts.push(sh.emotion);
        return parts.filter(Boolean).join(' / ');
      });
      shotBlocks.push(`〔第 ${e.no} 集分镜 · ${shots.length} 镜〕\n${rows.join('\n')}`);
    }
  }

  const assets = Array.isArray(p.assetImages) ? p.assetImages : [];
  const bucket = [...head];
  if (outline.length) bucket.push('', '【分集】', ...outline);
  if (assets.length) {
    bucket.push('', `【素材】${assets.map((a) => (a.name || '未命名') + (a.scene ? `（${a.scene}）` : '')).join('、')}`);
  }
  let body = bucket.join('\n');
  if (sources.length) body += `\n\n【导入的原文】\n${sources.join('\n\n')}`;

  const shotCount = eps.reduce((n, e) => n + (e.shots || []).length, 0);
  const rest = maxChars - body.length;
  if (shotBlocks.length) {
    const all = shotBlocks.join('\n\n');
    body += all.length <= rest
      ? `\n\n【分镜】\n${all}`
      : `\n\n【分镜】\n（分镜明细过长已省略，共 ${eps.length} 集 ${shotCount} 镜；需要具体镜头直接问第几集第几镜）`;
  }
  const truncated = body.length > maxChars;
  return { text: truncated ? body.slice(0, maxChars) : body, chars: body.length, truncated };
}

// ============================================================
// 小说 → 粗略剧本：把模型输出规整成工作台契约
// ============================================================
function normalizeShot(raw, no) {
  const dlg = String(raw?.dialogue || '').replace(/\s+/g, ' ').trim()
  const durRaw = raw?.dur
  const dur = Number.isFinite(Number(durRaw)) && Number(durRaw) > 0
    ? clampNum(durRaw, 0.8, 12, 3)
    : clampNum(cnLen(dlg) / 4.5, 1.2, 8, 3)
  return {
    id: uid('sh'),
    no,
    size: oneOf(raw?.size, SIZES, '中景'),
    angle: oneOf(raw?.angle, ANGLES, '平视'),
    move: oneOf(raw?.move, MOVES, '固定'),
    scene: cut(raw?.scene, 40),
    desc: cut(raw?.desc, 300),
    chars: cut(raw?.chars, 80),
    props: cut(raw?.props, 60),
    speaker: cut(raw?.speaker, 30),
    dialogue: cut(dlg, 200),
    vo: cut(raw?.vo, 80),
    emotion: oneOf(raw?.emotion, EMOTIONS, '紧张'),
    intensity: clampInt(raw?.intensity, 1, 5, 3),
    action: cut(raw?.action, 120),
    dur,
  }
}

function normalizeEpisode(raw, index, shotsPerEp) {
  const shotsRaw = Array.isArray(raw?.shots) ? raw.shots : []
  const shots = (shotsRaw.length ? shotsRaw : Array.from({ length: shotsPerEp }, () => ({})))
    .slice(0, 60)
    .map((s, i) => normalizeShot(s, i + 1))
  const beatsRaw = Array.isArray(raw?.beats) ? raw.beats : []
  return {
    id: uid('ep'),
    no: index,
    title: cut(raw?.title || `第${index}集`, 40),
    hook: cut(raw?.hook, 80),
    hookType: oneOf(raw?.hookType, HOOK_TYPES, '冲突开场'),
    summary: cut(raw?.summary, 400),
    cliffhangers: Array.isArray(raw?.cliffhangers) ? raw.cliffhangers.map((c) => cut(c, 80)).slice(0, 5) : [],
    beats: (beatsRaw.length ? beatsRaw : [{ t: '开局钩子', text: '' }]).slice(0, 12).map((b) => ({
      id: uid('bt'),
      t: cut(b?.t || '节拍', 20),
      text: cut(b?.text, 200),
    })),
    shots,
  }
}

function normalizeCharacter(raw, i) {
  const name = cut(raw?.name, 20) || `角色${i + 1}`
  return {
    id: uid('ch'),
    name,
    role: oneOf(raw?.role, ROLES, i === 0 ? '男主' : '男配'),
    age: cut(raw?.age, 20),
    look: cut(raw?.look, 160),
    outfit: cut(raw?.outfit, 160),
    anchor: cut(raw?.anchor, 300),
    face: cut(raw?.face, 160),
    hair: cut(raw?.hair, 120),
    prop: cut(raw?.prop, 80),
    seed: cut(raw?.seed, 20),
    refImage: '',
    voice: oneOf(raw?.voice, VOICES, i === 0 ? '青年男·低沉沙哑' : i === 1 ? '青年女·冷清倔强' : '中年男·浑厚温润'),
    notes: cut(raw?.notes, 200),
  }
}

function normalizeAiProject(data, opts = {}) {
  const episodesRaw = Array.isArray(data?.episodes) ? data.episodes : []
  const charsRaw = Array.isArray(data?.characters) ? data.characters : []
  return {
    meta: {
      title: cut(opts.title || data?.title, 40) || '未命名漫剧',
      platform: opts.platform || 'douyin',
      style: opts.style || 'guoman-houtu',
      logline: cut(data?.logline, 300),
      audience: cut(data?.audience, 100),
      tags: cut(data?.tags, 120),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    topics: [],
    characters: charsRaw.slice(0, 12).map(normalizeCharacter),
    episodes: episodesRaw.slice(0, 12).map((e, i) => normalizeEpisode(e, i + 1, opts.shotsPerEp || 12)),
    assets: [],
  }
}

// ============================================================
// 本地规则兜底：无 key / 调用失败时也能出一版结构正确的粗稿
// ============================================================
const STOP_NAMES = new Set([
  '他说', '她说', '我说', '你们', '我们', '他们', '她们', '自己', '一个', '这个', '那个', '什么', '怎么',
  '这样', '那样', '知道', '不是', '就是', '可以', '已经', '还是', '但是', '如果', '因为', '所以', '于是',
  '忽然', '突然', '然后', '现在', '刚才', '此时', '心里', '眼中', '声音', '抬头', '低头', '转身', '当时',
])

// 名字候选黑名单：地点、物件、身体部位、时间词，避免把「堂屋」当人名
const NAME_STOP = /^(?:这时|那时|此时|当下|随后|接着|于是|只是|可是|但见|只见|声音|眼睛|脸上|心里|手里|身后|门外|桌上|堂屋|院子|工坊|老宅|东西|半个|一个|整个|那些|这些|他们|她们|我们|你们|屋里|房中|门口|街上|天色|雨点|灯火|纸角|退婚|账本|榫头|老匠|灯笼)$/
// 以物件字结尾的候选一律不是人名（「木匣」「刨子」「灯笼」这类最容易在动作模式里被误抓）
const NAME_OBJ_SUFFIX = /(?:匣|盒|箱|袋|灯|刀|剑|枪|棍|杖|门|窗|桌|椅|床|碗|杯|壶|瓶|车|船|马|纸|书|笔|墨|伞|衣|袍|鞋|帽|镜|契|票|钥|匙|架|案|瓦|雨|风|子|头|面|声|光|火|水|土|木|石|线|绳|钉|锤|锯|尺|墙|地|井|桥|路|街|集|账|钱|银|票|本|册|录|据)$/
// 代词 / 指代 / 情状开头（「我爸」「你爸」「七个人」「同样」「笔记本」都不该被当成角色名）
const NAME_PRONOUN = /^(?:我|你|他|她|它|咱|俺|谁|这|那|哪|同|又|还|就|才|也|都|忽|突|然|当|现|此|整|半|全|每)/
// 量词 / 副词 / 方位结尾
const NAME_TAIL_BAD = /(?:人|个|样|么|时|后|前|里|外|中|们|的|了|着|过|下|上|边|刻|间)$/
const isName = (n) =>
  !STOP_NAMES.has(n) && !NAME_STOP.test(n) && !NAME_OBJ_SUFFIX.test(n) && !NAME_PRONOUN.test(n) && !NAME_TAIL_BAD.test(n)
const HOOK_WORDS = /(?:杀|血|死|滚|砸|撕|抢|逼|退婚|别想|不配|凭什么|敢|算账|逐出|断了|拿走|值多少|娶|嫁|滚出)/
const SPEAK_WORDS = '说道|问道|答道|喊道|说|问|喊|答|吼|笑|开口|低声|轻声|沉声|冷笑|冷哼|冷冷地|淡淡地|缓缓|猛地|瞪着|盯着'
const ACT_WORDS = '把|站|走|翻|看|转|抬|推|拿|放|坐|跪|握|拉|扔|捡|提|拍|踏|退|撞|摇|点|扯|摸'

// 平台单集时长区间（与 src/lib/schema.js 的 PLATFORMS 对齐）
const PLATFORM_SEC = {
  douyin: [60, 90],
  hongguo: [60, 90],
  kuaishou: [60, 90],
  bilibili: [120, 300],
  reelshort: [60, 120],
}

const EMOTION_HINTS = [
  [['杀', '血', '刀', '死', '滚', '砸', '撕', '抢', '逼'], '紧张'],
  [['怒', '吼', '骂', '畜生', '凭什么', '混账'], '愤怒'],
  [['怕', '颤', '抖', '惊恐', '不敢', '后退'], '恐惧'],
  [['哭', '泪', '委屈', '哽咽', '疼'], '委屈'],
  [['笑', '哼', '嗤', '讽刺', '嘲讽'], '嘲讽'],
  [['冷', '淡淡', '沉默', '无声'], '压抑'],
  [['爱', '心动', '脸红', '温柔'], '心动'],
  [['震惊', '想不到', '竟然', '原来', '真相'], '反转震撼'],
  [['跪', '求', '绝望', '崩'], '崩溃'],
  [['走', '转身', '离开', '决定', '一定'], '决绝'],
  [['好', '赢', '成了', '答应', '翻身'], '爽'],
]

function guessEmotion(text) {
  const s = String(text || '')
  for (const [words, emo] of EMOTION_HINTS) {
    if (words.some((w) => s.includes(w))) return emo
  }
  return '平静'
}

const INTENSITY_OF = {
  平静: 2, 压抑: 3, 紧张: 4, 愤怒: 4, 恐惧: 4, 委屈: 3,
  嘲讽: 3, 爽: 4, 心动: 3, 崩溃: 5, 决绝: 4, 反转震撼: 5,
}

function cleanSentence(s) {
  return String(s || '')
    .replace(/^[\s　」”』》】）)\]]+/, '')
    .replace(/^[，、。！？；：\s　]+/, '')
    .replace(/[\s　]+$/, '')
    .trim()
}

// 按引号配对切句：引号内的句号不切，且把「对白 + 归属句」合为一句，
// 否则「他说。」会被切成独立句，说话人就丢了。
function splitSentences(text) {
  const src = String(text || '').replace(/\r/g, '')
  const out = []
  let buf = ''
  let depth = 0
  const flush = () => {
    const s = cleanSentence(buf)
    if (cnLen(s) > 1) out.push(s)
    buf = ''
  }
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '\n') {
      if (depth === 0) flush()
      else buf += ' '
      continue
    }
    buf += ch
    if ('「“『'.includes(ch)) depth += 1
    else if ('」”』'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && '。！？!?…'.includes(ch)) flush()
  }
  flush()
  return out
}

function countOccur(text, name) {
  let n = 0
  let i = 0
  while (true) {
    const at = text.indexOf(name, i)
    if (at < 0) break
    n += 1
    i = at + name.length
  }
  return n
}

function guessCharacters(text) {
  const talk = new Map()
  const reTalk = new RegExp(`([\\u4e00-\\u9fa5]{2,3})(?:${SPEAK_WORDS})`, 'g')
  let m
  while ((m = reTalk.exec(text))) {
    const n = m[1]
    if (!isName(n)) continue
    talk.set(n, (talk.get(n) || 0) + 1)
  }
  // 动作模式补充：没怎么说话但一直在动的人（配角/反派）
  const act = new Map()
  const reAct = new RegExp(`([\\u4e00-\\u9fa5]{2,3})(?:${ACT_WORDS})`, 'g')
  while ((m = reAct.exec(text))) {
    const n = m[1]
    if (!isName(n)) continue
    act.set(n, (act.get(n) || 0) + 1)
  }
  const score = new Map()
  for (const [n, c] of talk) score.set(n, (score.get(n) || 0) + c * 5)
  for (const [n, c] of act) score.set(n, (score.get(n) || 0) + c)
  const list = [...score.entries()]
    .map(([n, sc]) => ({ n, sc, occ: countOccur(text, n), pos: text.indexOf(n) }))
    .filter((x) => x.occ >= 2)
  if (!list.length) return []
  // 主角判定：开头第一句就出场的人最可能是主角（叙事直觉），否则退回「戏份最多」
  const head = text.slice(0, 80)
  list.sort((a, b) => b.sc - a.sc)
  const inHead = list.filter((x) => head.includes(x.n)).sort((a, b) => a.pos - b.pos)
  const lead = inHead[0] || list[0]
  const rest = list.filter((x) => x !== lead).sort((a, b) => a.pos - b.pos)
  return [lead, ...rest].slice(0, 6).map((x) => x.n)
}

function guessScene(text) {
  const m = String(text || '').match(/([\u4e00-\u9fa5]{2,6}(?:堂屋|院子|院中|屋|房|厅|殿|宫|街|巷|店|铺|楼|阁|桥|山|城|门|码头|书房|卧室|厨房|车厢|办公室))/)
  return m ? m[1] : '未标注场景'
}

function quoteOf(text) {
  const m = String(text || '').match(/[「“"]([^」”"]{1,200})[」”"]/)
  return m ? m[1] : ''
}

function speakerOf(text, names) {
  const s = String(text || '')
  for (const n of names) {
    if (!s.includes(n)) continue
    const re = new RegExp(`${n}[^\\u4e00-\\u9fa5]{0,4}(?:${SPEAK_WORDS})`)
    if (re.test(s)) return n
  }
  // 「……」沈砚说 → 名字紧跟在右引号后
  const after = s.match(/[」”』][^\u4e00-\u9fa5]{0,2}([\u4e00-\u9fa5]{2,3})/)
  if (after && names.includes(after[1])) return after[1]
  // 句内只有一个候选名字：认定为该镜说话人
  const present = names.filter((n) => s.includes(n))
  return present.length === 1 ? present[0] : ''
}

// 剧名推断：没有填写时从正文里挑一个像剧名的短句
function guessTitle(sentences) {
  const clean = (s) =>
    String(s || '')
      .replace(/[「」“”『』"]/g, '')
      .replace(/[，。！？、；：]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const cands = sentences.map(clean).filter((s) => s.length >= 6 && s.length <= 20)
  const CONFLICT = /(退婚|离婚|休书|重生|复仇|系统|签到|打脸|逆袭|断绝|抢|夺|背叛|撕|砸|滚|废物|跪下|算账|翻身)/
  const strong = cands.find((s) => CONFLICT.test(s))
  if (strong) return cut(strong, 20)
  for (const s of sentences) {
    const q = quoteOf(s).replace(/[，。！？、；：]$/, '')
    if (cnLen(q) >= 6 && cnLen(q) <= 18) return q
  }
  return cut(cands[0] || sentences[0] || '', 18)
}

function balanceDurations(ep, target) {
  const shots = ep.shots
  if (!shots.length) return
  const total = shots.reduce((n, s) => n + (Number(s.dur) || 0), 0)
  if (total >= target * 0.85) return
  const room = shots.length * 6 - total
  const need = Math.min(target - total, room)
  if (need <= 0) return
  const per = need / shots.length
  for (const s of shots) {
    s.dur = clampNum((Number(s.dur) || 2) + per, 1, 6, 3)
  }
}

// 本地规则给角色定定位时，性别只能从称呼猜 —— 猜不出来就按位置兜底。
// 不猜的话「三叔」会被写成「女主」，用户到角色页第一眼就是错的。
const FEMALE_HINT = /姨|姑|姐|妹|母|奶|婶|娘|小姐|夫人|太太|姑娘|婆|嫂|媳妇|女/
const MALE_HINT = /叔|伯|哥|弟|父|爷|爸|公|先生|少爷|掌柜|将军|掌柜|兄|男/
function guessGender(name) {
  const n = String(name || '')
  if (FEMALE_HINT.test(n)) return 'f'
  if (MALE_HINT.test(n)) return 'm'
  return ''
}

// 分集时把原文按集切回去 —— 后端不补的话，写完台账 sourceText 就是空的：
// 02 页「本集原文」空白、03b 场景页直接显示「还没原文」，最要命的是一看就以为导入失败。
function attachSourceText(project, text) {
  const eps = project?.episodes || []
  if (!eps.length) return project
  const all = splitSentences(String(text || '').trim())
  if (!all.length) return project
  const per = Math.max(1, Math.ceil(all.length / eps.length))
  eps.forEach((e, i) => {
    if (String(e.sourceText || '').trim()) return
    e.sourceText = all.slice(i * per, (i + 1) * per).join('')
  })
  return project
}

/* ── AI 分集：模型只决定切点，原文逐字不改 ── */
function buildSplitMessages(text, opts = {}) {
  const target = opts.targetChars || 1500
  const sys = [
    '你是竖屏短剧的分集编剧。',
    '任务：把用户给的小说原文切成若干集。每一集的正文必须逐字复制原文，不许改写、不许润色、不许增删标点。',
    '只输出 JSON，不要解释。',
  ].join('\n')
  const user = [
    `平台：${opts.platformName || '抖音'}｜单集时长：${opts.episodeSec || '60–90s'}｜画风：${opts.styleName || '—'}`,
    `原文（共 ${cnLen(text)} 字）：`,
    text,
    '',
    '要求：',
    `1. 每集 ${target} 字左右（上下浮动不超过 40%），切点必须落在句子边界上，不许把一个句子劈成两集。`,
    '2. 每集开头要有钩子：前 3 秒能抓住人的冲突句（原文里有就选它，不要自己写）。',
    '3. 每段 text 必须是从原文里原样复制的连续片段：不许改字、不许改标点、不许用省略号省略、不许补写。段与段首尾相接，不重叠、不遗漏，拼起来等于原文。',
    '4. title ≤14 字，像剧名，从这一段最抓人的那句里提炼；hook ≤20 字，直接引这一集最狠的一句原文。',
    '5. 输出格式：{"segments":[{"title":"","hook":"","text":"原文片段"}]}',
  ].join('\n')
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ]
}

const normTxt = (x) => String(x || '').replace(/\s+/g, '')

/** 校验模型切出来的片段确实是原文连续子串，并补齐密度 / 等级 / 标题等统计 */
function analyzeAiSegments(rawList, source, targetChars) {
  const normSrc = normTxt(source)
  const out = []
  let cursor = 0
  for (const it of rawList || []) {
    const text = String(it?.text || '').trim()
    if (!text) continue
    const n = normTxt(text)
    const at = normSrc.indexOf(n, Math.max(0, cursor - 40))
    if (at < 0) throw new Error('模型返回的片段不是原文连续片段（改写过或跳过了内容），请重新点一次分集')
    cursor = at + n.length
    const sents = splitSentences(text)
    const scored = sents.map((x) => ({ s: x, n: cnLen(x), boom: boomScore(x) }))
    const chars = scored.reduce((m, x) => m + x.n, 0)
    const bursts = scored.filter((x) => x.boom >= 4)
    const dense = scored.length ? (bursts.length / scored.length) * 10 : 0
    const lv = levelOf(dense)
    const strongest = scored.length ? scored.reduce((a, b) => (b.boom > a.boom ? b : a), scored[0]) : { s: '' }
    out.push({
      id: `seg_${out.length + 1}`,
      no: out.length + 1,
      text,
      chars,
      sents: scored.length,
      booms: bursts.length,
      boomSum: scored.reduce((m, x) => m + x.boom, 0),
      density: Math.round(dense * 10) / 10,
      level: lv.id,
      levelLabel: lv.label,
      levelTone: lv.level,
      hook: String(it?.hook || '').trim().slice(0, 60) || strongest.s.slice(0, 60),
      title:
        String(it?.title || '').trim().slice(0, 20) ||
        strongest.s.replace(/[。！？!?…；;，,、]+$/g, '').slice(0, 16),
      head: (scored[0]?.s || '').slice(0, 40),
      scenes: 0,
      estShots: Math.max(8, Math.min(40, Math.round(chars / 75))),
    })
  }
  const stats = {
    chars: cnLen(source),
    sents: splitSentences(source).length,
    eps: out.length,
    avgChars: out.length ? Math.round(out.reduce((m, x) => m + x.chars, 0) / out.length) : 0,
    boomCount: out.reduce((m, x) => m + x.booms, 0),
    targetChars,
  }
  return { segments: out, stats }
}

function localOutline(text, opts = {}) {
  const raw = String(text || '').trim()
  if (cnLen(raw) < 30) throw new Error('正文太短，至少给几百字')
  const epCount = clampInt(opts.episodes, 1, 12, 3)
  const perEp = clampInt(opts.shotsPerEp, 4, 60, 12)
  const secRange = PLATFORM_SEC[opts.platform] || PLATFORM_SEC.douyin
  const all = splitSentences(raw)
  const perEpSentences = Math.max(1, Math.ceil(all.length / epCount))
  const names = guessCharacters(raw)
  // 一个真名都没认出来时才造占位角色，并明确标注——别让用户以为「主角/对手」是抽出来的
  const placeholderChars = names.length === 0

  const characters = (placeholderChars ? ['主角', '对手'] : names).map((name, i) => {
    const g = guessGender(name)
    const role = i === 0 ? (g === 'f' ? '女主' : '男主') : g === 'f' ? '女配' : g === 'm' ? '男配' : i === 1 ? '女配' : '男配'
    return normalizeCharacter(
      {
        name,
        role,
        look: `${name}的外形待补（由原文提炼）`,
        anchor: `${name}, Chinese comic drama character, consistent face, ${i === 0 ? 'sharp jaw, tired but steady eyes' : 'distinct silhouette'}`,
        voice: VOICE_BY_ROLE[role],
        notes: placeholderChars ? '本地规则没认出人名，这是占位角色——到「主要角色」页改成正文里的真名' : '本地规则命中，需人工核对',
      },
      i,
    )
  })

  const episodes = []
  for (let e = 0; e < epCount; e += 1) {
    const seg = all.slice(e * perEpSentences, (e + 1) * perEpSentences)
    if (!seg.length) break
    const bucket = Math.max(1, Math.ceil(seg.length / perEp))
    const shots = []
    for (let i = 0; i < perEp; i += 1) {
      const chunk = seg.slice(i * bucket, (i + 1) * bucket)
      const reused = !chunk.length
      const use = reused ? [seg[i % seg.length] || ''] : chunk
      const line = use.join('')
      const quoted = use.find((s) => /[「“"]/.test(s))
      const dialogue = quoteOf(line) || (quoted ? quoteOf(quoted) : '')
      const speaker = speakerOf(line, names)
      const emotion = guessEmotion(line)
      shots.push(
        normalizeShot(
          {
            size: SIZES[(i + e) % SIZES.length],
            angle: ANGLES[(i + 1) % ANGLES.length],
            move: MOVES[i % MOVES.length],
            scene: guessScene(line),
            desc: cut((reused ? '（反应镜）' : '') + line.replace(/[「“"][^」”"]*[」”"]/g, ''), 120),
            chars: speaker || names.slice(0, 2).join('、'),
            props: '',
            speaker,
            dialogue,
            vo: dialogue ? (speaker ? `${speaker}·按音色表` : '旁白') : '',
            emotion,
            intensity: INTENSITY_OF[emotion] || 3,
            action: '',
            dur: dialogue ? clampNum(cnLen(dialogue) / 4.5, 1.2, 8, 2.5) : clampNum(1.8 + (i % 3) * 0.4, 1.2, 6, 2.4),
          },
          i + 1,
        ),
      )
    }
    const first = seg[0] || ''
    // 前 3 秒钩子：优先挑带冲突词/决策句的那一句，别拿环境描写开场
    const hookLine = seg.find((x) => HOOK_WORDS.test(x)) || seg.find((x) => /[「“"]/.test(x)) || first
    const lastTwo = seg.slice(-2)
    // 集标题：优先开口就是台词/有火气的句子——「雨下了一整夜」不配当剧集标题
    const titleSrc =
      seg.slice(0, 12).find((x) => /[「“『"]/.test(x) && cnLen(x) >= 4) ||
      seg.slice(0, 12).find((x) => HOOK_WORDS.test(x)) ||
      seg.find((s) => cnLen(s) >= 6)
    const titleText = String(titleSrc || `第${e + 1}集`)
    // 「「老陈，我来了。」他说，「欠的…」」→ 只留第一句台词，别把归属句也塞进标题
    const quoted = titleText.match(/[「“『"]([^」”』"]{2,20})[」”』"]/)
    const titleClean = (quoted ? quoted[1] : titleText.replace(/^[「“『"]+/, '').replace(/[」”』"]+/g, '')).trim()
    const episode = {
      id: uid('ep'),
      no: e + 1,
      title: cut(titleClean, 18),
      hook: cut(hookLine, 60),
      hookType: HOOK_TYPES[e % HOOK_TYPES.length],
      summary: opts.prev
        ? cut(`上集「${opts.prev.title || `第${opts.prev.no}集`}」结尾：${opts.prev.hook || ''}｜${seg.join('')}`, 300)
        : cut(seg.join(''), 300),
      cliffhangers: lastTwo.map((s) => cut(s, 60)),
      beats: [
        { id: uid('bt'), t: '开局钩子', text: cut(hookLine, 120) },
        { id: uid('bt'), t: '冲突升级', text: cut(seg[Math.floor(seg.length / 2)] || '', 120) },
        { id: uid('bt'), t: '集尾悬念', text: cut(seg[seg.length - 1] || '', 120) },
      ],
      shots,
    }
    balanceDurations(episode, secRange[0] + (secRange[1] - secRange[0]) * 0.35)
    episodes.push(episode)
  }

  const minShotsForRange = Math.ceil(secRange[0] / 6)
  return {
    meta: {
      title: cut(opts.title, 40) || guessTitle(all) || '未命名漫剧',
      platform: opts.platform || 'douyin',
      style: opts.style || 'guoman-houtu',
      logline: cut(all[0] || '', 200),
      audience: '',
      tags: '本地规则生成',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    topics: [],
    characters,
    episodes,
    assets: [],
    hint:
      perEp < minShotsForRange
        ? `每集 ${perEp} 镜在单镜≤6s 的限制下最多 ${(perEp * 6).toFixed(0)}s，达不到该平台 ${secRange[0]}–${secRange[1]}s；建议每集 ≥ ${minShotsForRange} 镜。`
        : '',
  }
}

// ============================================================
// 提示词：让模型产出严格 JSON
// ============================================================
/** 按所选生图模型重写提示词：把该模型的语法规范整段喂给模型，别让它自由发挥 */
// 把 skill 规则拼进 system；格式约束仍以工作台自己的为准
// 可以同时挂多份 skill 规则：总预算 11000 字，按份数均分、单份不超过 4000
const SKILL_TOTAL_CHARS = 11000
const SKILL_PER_CHARS = 4000
function skillBlock(docs) {
  const list = (Array.isArray(docs) ? docs : docs ? [docs] : []).filter(Boolean)
  if (!list.length) return ''
  const per = Math.max(800, Math.min(SKILL_PER_CHARS, Math.floor(SKILL_TOTAL_CHARS / list.length)))
  const head =
    list.length > 1
      ? `\n\n【外挂规则：共 ${list.length} 份】下面是这个项目挂的 ${list.length} 份 skill 方法论。在不违反上面输出格式与枚举取值的前提下优先吸收它们的思路；**格式一律以上面为准**，不要因为它们的示例而改变 JSON 结构。多份规则互相冲突时，按列出顺序，前一份优先。`
      : ''
  const body = list
    .map((d, i) => {
      const over = d.text.length > per
      return `\n\n【规则 ${i + 1}/${list.length} · ${d.fullName} · ${d.file}${over ? `（只取前 ${per} 字）` : ''}】\n----- 规则开始 -----\n${d.text.slice(0, per)}\n----- 规则结束 -----`
    })
    .join('')
  return head + body
}

function buildPromptExpandMessages(m, drafts, ctx) {
  if (ctx.mode === 'video') return buildVideoExpandMessages(drafts, ctx)
  const spec = modelSpecText(m.id, { ar: ctx.ratio, w: ctx.width, h: ctx.height })
  const pair = ctx.mode === 'pair'
  const system = [
    '你是 AI 生图提示词工程师。你只输出 JSON，不写解释、不写 markdown 代码块。',
    '',
    spec,
    '',
    `画风锚定（必须被吸收进每条提示词，但不要整段复制）：${ctx.styleName || '国漫厚涂'} / ${ctx.styleAnchor || ''}`,
    '',
    ...(pair
      ? [
          '本次任务：为一镜同时生成【首帧】与【尾帧】两条提示词（多参首尾帧生图）。',
          '首帧 = 这一镜动作的起势（动作刚开始那一瞬）；尾帧 = 同一镜动作的收势（动作做完、身体停住的定势）。',
          '两条必须共享完全相同的机位、景别、光线、服装与背景陈设，只有身体姿态和表情可以不同；',
          '不要给尾帧换场景、换衣服、换角度，也不要在两条之间改变人物数量。',
          '',
          '输出格式：',
          '{"prompts":[{"no":1,"first":"首帧提示词","last":"尾帧提示词","bridge":"一句话说明从首帧到尾帧只变了什么","negative":"两张共用负向词","params":"参数行"}]}',
        ]
      : [
          '输出格式：',
          '{"prompts":[{"no":1,"prompt":"该模型能直接粘贴的提示词","negative":"负向词，该模型不需要时填空字符串","params":"参数行，该模型无参数时填空字符串"}]}',
        ]),
    '',
    '硬性要求：',
    '1. 提示词必须严格符合上面这套模型语法，换模型就换写法；',
    '2. 镜头数量与输入完全一致，no 与输入一一对应；',
    '3. 每条都要保留角色外观锚定与服装号信息，不要把角色写成「一个男人」；',
    '4. 不要出现「提示词：」这类前缀，不要加引号包裹整个内容。',
    ...(pair
      ? ['5. 输入给了 localFirst / localLast 作起手式，可以改写措辞，但不要丢掉里面的角色锚定与服装号。']
      : []),
  ].join('\n') + (ctx.skillBlock || '')
  return [
    { role: 'system', content: system },
    // 生图不走 clampVideoDur —— 那是视频模型的时长区间，
    // 这里的 vm 属于 buildVideoExpandMessages，误抄过来会让生图分支直接抛 vm is not defined。
    { role: 'user', content: JSON.stringify({ shots: drafts.map((d) => ({ ...d, dur: Number(d.dur) || 3 })) }) },
  ]
}

function buildVideoExpandMessages(drafts, ctx) {
  const vm = videoModelById(ctx.videoModelId)
  // 每镜时长各自夹进模型区间；同一集里时长不一致时，规范里要说明「按各自 dur 写」，
  // 否则模型会把所有镜写成同一个时长（分镜 2.3s 与 5s 的镜会被抹平）。
  const durs = Array.from(
    new Set(drafts.map((d) => Number(clampVideoDur(vm.id, Number(d.dur) || ctx.dur || 5).toFixed(1))))
  ).sort((a, b) => a - b)
  const durLine =
    durs.length <= 1
      ? ""
      : `时长：该模型支持 ${vm.durRange[0]}–${vm.durRange[1]} 秒。这一集 ${drafts.length} 镜的时长并不相同（${durs
          .slice(0, 8)
          .join(" / ")}${durs.length > 8 ? " …" : ""} 秒，都已在区间内），每镜按它自己在输入里的 dur 写，不要统一成同一个时长。`
  const spec = videoModelSpecText(vm.id, {
    dur: ctx.dur || 5,
    ar: vm.ratio,
    fps: ctx.fps || 24,
    durLine,
  })
  const isEn = vm.family === 'english'
  const minLen = isEn ? '45 个英文词' : '110 个汉字'

  const system = [
    '你是短视频分镜的动态提示词工程师，专做 AI 漫剧。你只输出 JSON，不写解释、不写 markdown 代码块。',
    '',
    spec,
    '',
    `画风锚定：${ctx.styleName || '国漫厚涂'} / ${ctx.styleAnchor || ''}`,
    '',
    '本次任务：把下面每一镜的中文分镜，改写成该视频模型能直接粘贴的提示词。',
    '输入里每一镜都带着这些字段，**每一条都要用上**：size 景别 / angle 机位 / move 运镜 / scene 场景 / desc 画面 / action 动作 / chars 在场角色 / outfit 服装号 / props 道具 / emotion 情绪 / intensity 强度 1-5 / dialogue 台词 / dur 时长。',
    '',
    '输出格式：',
    '{"prompts":[{"no":1,"prompt":"该模型能直接粘贴的提示词","negative":"负向词，该模型不需要时填空字符串","params":"参数行，该模型无参数时填空字符串"}]}',
    '',
    '硬性要求（少一条都算不合格）：',
    `1. 长度：每条正文不少于 ${minLen}（不含参数与锁定句）。写不够就补：把 action 拆成三拍、把 props 的物理反应写出来、把 emotion 落到脸上和眼里、把 scene 的两三件陈设写进去。**不要用「氛围感」「充满张力」这类空话凑字数**。`,
    '2. 写「变化」不写「状态」：desc 是这一镜的静态画面，你要把它写成从第 0 秒到最后一秒怎么变——谁先动、身体哪个部位动、道具被带动后有什么反应、最后停在哪里。直接照抄 desc 是错的。',
    '3. 动作拆三拍：起势（发力前的姿势）→ 过程（一到两个具体动作，说清手/肩/头/眼的位移）→ 收势（动作做完停在哪）。',
    '4. 七要素逐条落齐：主体外观 + 服装号、场景陈设、景别 + 机位、运镜方向与幅度、动作三拍、道具交互、情绪与强度。缺哪条就补哪条，不要用一句话概括全部。',
    '5. 强度对应幅度：intensity 1–2 写成克制的小幅动作（眼神、指尖、呼吸），3 写成常规幅度，4–5 写大幅动作（起身、摔、转身、推搡）。',
    '6. 时长与动作量匹配：短镜（≤3 秒）只写一个动作，长镜（≥6 秒）写两到三个动作接续，不能把一个动作拉长充数。',
    '7. 每条写法必须不同：同集里不许套同一句模板，动作动词、运镜方向、道具交互至少三样里有两样与相邻镜不一样。',
    '8. 严格符合上面这套模型语法，换模型就换写法（英文族不写参数符号、不加 negative 字段，把限制写进正向句）。',
    '9. 镜头数量与输入完全一致，no 与输入一一对应；保留角色外观锚定与服装号，不要写成「一个男人」「女主」。',
    '10. 不出现「提示词：」这类前缀，不加引号包裹整个内容，不在正文里写分镜术语的括号注释。',
    '11. 服装号必须原样出现在正文里（例如「穿 O1 工厂夜 · 深灰旧工装」）。这是后期换装的唯一锚点，漏了这一段就没法保持一致。',
    '12. 有台词（dialogue 非空）时，情绪与嘴部状态要贴台词语气：压着嗓子说的写成低声、下颌收紧；喊出来的写成张口、颈侧绷紧。',
    '',
    '生成前自检（在心里做，不要输出）：每条是否达到长度下限？七要素是否都在？动作是否拆成了三拍？相邻两条是否不雷同？',
  ].join('\n') + (ctx.skillBlock || '')
  // 输入的 dur 已被夹进模型区间：模型若看见 2.3 会写成「2 秒」，而可灵最短 5 秒，导出的提示词会与模型能力矛盾。
  const safeDrafts = drafts.map((d) => ({
    ...d,
    dur: Number(clampVideoDur(vm.id, Number(d.dur) || ctx.dur || 5).toFixed(1)),
  }))
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ shots: safeDrafts }) },
  ]
}



function normalizeVideoExpanded(data, drafts, vm) {
  const list = Array.isArray(data?.prompts) ? data.prompts : []
  const byNo = new Map(list.map((x) => [Number(x?.no), x]))
  return drafts
    .map((d) => {
      const hit = byNo.get(Number(d.no))
      const prompt = hit && typeof hit.prompt === 'string' ? hit.prompt.trim() : ''
      if (!prompt) return null
      const dur = clampVideoDur(vm.id, d.dur)
      return {
        no: Number(d.no),
        prompt,
        negative: hit && typeof hit.negative === 'string' ? hit.negative.trim() : '',
        params: (hit && typeof hit.params === 'string' && hit.params.trim()) || fillVideoParams(vm.id, { dur, ar: vm.ratio }),
      }
    })
    .filter(Boolean)
}

function normalizeExpanded(data, drafts) {
  const arr = Array.isArray(data?.prompts) ? data.prompts : []
  const byNo = new Map(arr.map((x) => [Number(x?.no), x]))
  return drafts
    .map((d) => {
      const hit = byNo.get(Number(d.no)) || {}
      return {
        no: d.no,
        prompt: String(hit.prompt || '').trim(),
        first: String(hit.first || '').trim(),
        last: String(hit.last || '').trim(),
        bridge: String(hit.bridge || '').trim(),
        negative: String(hit.negative || '').trim(),
        params: String(hit.params || '').trim(),
      }
    })
    .filter((x) => x.prompt || (x.first && x.last))
}

/**
 * 上一集的衔接信息。分集按顺接续时逐集传下来，
 * 让模型知道「观众刚看完什么」，新的一集要接住那个悬念而不是重新铺垫世界观。
 */
function normalizePrev(raw) {
  if (!raw || typeof raw !== 'object') return null
  const no = clampInt(raw.no, 1, 999, 0)
  const hook = String(raw.hook || '').slice(0, 80)
  const summary = String(raw.summary || '').slice(0, 240)
  const title = String(raw.title || '').slice(0, 40)
  const cliff = Array.isArray(raw.cliffhangers) ? raw.cliffhangers.slice(0, 3).map((x) => String(x || '').slice(0, 60)) : []
  if (!no && !hook && !summary) return null
  return { no, title, hook, summary, cliffhangers: cliff.filter(Boolean) }
}

function buildOutlineMessages(text, opts) {  const epCount = clampInt(opts.episodes, 1, 10, 3)
  const perEp = clampInt(opts.shotsPerEp, 6, 40, 12)
  const maxChars = 14000
  const clipped = String(text || '').slice(0, maxChars)
  const system = [
    '你是中文竖屏 AI 漫剧的编剧兼分镜师，熟悉抖音/快手短剧节奏。',
    '任务：把用户给的小说正文，改写成可直接投产的粗略分镜剧本。',
    '只输出一个 JSON 对象，不要任何解释、不要 markdown 围栏。',
    '',
    'JSON 结构：',
    '{',
    '  "title": "剧名（≤20字，抓冲突）",',
    '  "logline": "一句话讲清核心冲突，≤60字",',
    '  "audience": "目标受众",',
    '  "tags": "标签，逗号分隔",',
    '  "characters": [',
    `    {"name":"角色名","role":"${ROLES.join('|')}","age":"年龄","look":"外形","outfit":"服装","anchor":"英文外貌锚定串","face":"脸型特征","hair":"发型","prop":"标志道具","voice":"${VOICES.join('|')}"}`,
    '  ],',
    '  "episodes": [',
    '    {',
    `      "no": 1, "title": "集名≤12字", "hook": "前3秒钩子台词或画面≤30字", "hookType": "${HOOK_TYPES.join('|')}",`,
    '      "summary": "本集梗概≤150字", "cliffhangers": ["集尾悬念1","集尾悬念2"],',
    '      "beats": [{"t":"开局钩子","text":"..."},{"t":"冲突升级","text":"..."},{"t":"集尾悬念","text":"..."}],',
    '      "shots": [',
    `        {"no":1,"size":"${SIZES.join('|')}","angle":"${ANGLES.join('|')}","move":"${MOVES.join('|')}",`,
    '         "scene":"场景名","desc":"画面描述≤60字，写清人物动作与构图","chars":"出场角色名，顿号分隔",',
    '         "props":"道具","speaker":"说话人","dialogue":"台词，无台词留空字符串",',
    `         "vo":"配音提示","emotion":"${EMOTIONS.join('|')}","intensity":1到5的整数,"action":"一镜内动作≤2个","dur":镜头秒数}`, 
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    '硬性规则：',
    `1. 一共 ${epCount} 集，每集 ${perEp} 个镜头（可±2），镜头按叙事顺序。`,
    '2. 枚举字段只能取上面列出的中文值，不许自创。',
    '3. 每集第一个镜头必须承担钩子：冲突/反常/悬念直接砸脸，不要铺垫。',
    '4. 台词口语化、短句，单句≤15字；台词总字数按每秒4.5字换算，保证一集总时长落在平台区间。',
    '5. 只保留原文最强的冲突线，砍掉支线与回忆；人物合并，最多6个角色。',
    '6. intensity 首镜≥4，末尾悬念镜≥4。',
    '7. anchor 字段用英文短语描述长相，便于生图复用，不含剧情。',
  ].join('\n') + (opts.skillBlock || '')

  const user = [
    `平台：${opts.platformName || opts.platform || 'douyin'}（竖屏 9:16，单集 ${opts.episodeSec || '60–90'} 秒）`,
    `画风：${opts.styleName || opts.style || '国漫厚涂'}`,
    `集数：${epCount}，每集镜头：${perEp}`,
    opts.title ? `剧名倾向：${opts.title}` : '',
    opts.prev ? `【承接上一集】第 ${opts.prev.no} 集「${opts.prev.title || '未命名'}」结尾：${opts.prev.hook || opts.prev.summary || '（未填）'}${opts.prev.cliffhangers.length ? `；留下的悬念：${opts.prev.cliffhangers.join('；')}` : ''}。本集第一镜必须直接接住这个悬念或它的后果，不要重新交代人物关系与世界观；角色卡沿用不重写。` : '',
    '',
    '小说正文：',
    clipped,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// ============================================================
function summaryOf(project, extra = {}) {
  const meta = project?.meta || {}
  const episodes = Array.isArray(project?.episodes) ? project.episodes : []
  const shots = episodes.reduce((n, e) => n + (Array.isArray(e.shots) ? e.shots.length : 0), 0)
  const duration = episodes.reduce(
    (n, e) => n + (Array.isArray(e.shots) ? e.shots.reduce((m, s) => m + (Number(s.dur) || 0), 0) : 0),
    0,
  )
  return {
    title: meta.title || '未命名漫剧',
    platform: meta.platform || 'douyin',
    style: meta.style || 'guoman-houtu',
    logline: meta.logline || '',
    episodes: episodes.length,
    shots,
    duration: Math.round(duration * 10) / 10,
    chars: Array.isArray(project?.characters) ? project.characters.length : 0,
    updatedAt: meta.updatedAt || new Date().toISOString(),
    ...extra,
  }
}

export function createApi(rootDir) {
  // ---- 可配置的存储位置（settings.json，改动后重启生效）----
  const settingsFile = path.join(rootDir, 'settings.json')
  const defaultDataDir = path.join(rootDir, DATA_DIR)

  // 同步读取一次：dataDir 必须在建路径之前定下来，不能 await
  let storedSettings = {}
  try {
    storedSettings = JSON.parse(require$$fs.readFileSync(settingsFile, 'utf8'))
  } catch {
    storedSettings = {}
  }
  const resolveDataDir = (v) => {
    const raw = String(v || '').trim()
    if (!raw) return defaultDataDir
    return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw)
  }

  let dataDir = resolveDataDir(storedSettings.dataDir)
  let scriptsDir = path.join(dataDir, SCRIPT_DIR)
  let libraryFile = path.join(dataDir, 'library.json')
  let legacyFile = path.join(dataDir, 'project.json')
  let aiFile = path.join(dataDir, AI_FILE)
  const stylesFile = path.join(dataDir, 'styles.json')
  const uploadDir = path.join(rootDir, UPLOAD_DIR)
  const exportDir = path.join(rootDir, EXPORT_DIR)


  const scriptFile = (id) => path.join(scriptsDir, `${id}.json`)

  const maskKey = (k) => {
    const s = String(k || '')
    if (!s) return ''
    if (s.length <= 8) return '****'
    return `${s.slice(0, 3)}****${s.slice(-4)}`
  }

  async function readAiConfig() {
    const saved = await readJson(aiFile, {})
    return { ...AI_DEFAULT, ...(saved || {}) }
  }

  async function saveAiConfig(patch) {
    const cur = await readAiConfig()
    const next = {
      baseUrl: String(patch.baseUrl ?? cur.baseUrl).trim(),
      model: String(patch.model ?? cur.model).trim(),
      apiKey: String(patch.apiKey ?? cur.apiKey).trim(),
      temperature: clampNum(patch.temperature ?? cur.temperature, 0, 2, 0.7),
      maxTokens: clampInt(patch.maxTokens ?? cur.maxTokens, 512, 32000, 8000),
    }
    await writeJson(aiFile, next)
    return next
  }
  // 自定义画风：只存用户新建的，内置 28 条在前端 schema.js 里（前端启动时拉这份合并）
  async function readCustomStyles() {
    const saved = await readJson(stylesFile, { version: 1, custom: [] })
    const list = Array.isArray(saved?.custom) ? saved.custom : []
    return list.filter((x) => x && x.id && x.name)
  }

  async function writeCustomStyles(list) {
    await writeJson(stylesFile, { version: 1, custom: list })
    return list
  }

  function normalizeStyle(raw, keepId) {
    const name = String(raw?.name || '').trim().slice(0, 24)
    if (!name) throw new Error('画风名不能空')
    const anchor = String(raw?.anchor || '').trim().slice(0, 600)
    if (anchor.length < 8) throw new Error('正向锚定词太短——至少写 8 个字，不然生图模型不知道要什么画风')
    return {
      id: keepId || `cs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name,
      group: 'custom',
      anchor,
      negative: String(raw?.negative || '').trim().slice(0, 400),
      note: String(raw?.note || '').trim().slice(0, 120),
      createdAt: raw?.createdAt || new Date().toISOString(),
    }
  }


  // 一次性迁移：旧单项目 project.json → scripts/{id}.json + library.json
  async function ensureLibrary() {
    const existing = await readJson(libraryFile, null)
    if (existing && Array.isArray(existing.scripts)) return existing

    const legacy = await readJson(legacyFile, null)
    const library = { version: 1, activeId: null, updatedAt: new Date().toISOString(), scripts: [] }
    if (legacy && legacy.meta) {
      const id = 'sc_seed_legacy'
      await writeJson(scriptFile(id), legacy)
      library.scripts.push({ id, createdAt: legacy.meta.createdAt || new Date().toISOString(), ...summaryOf(legacy) })
      library.activeId = id
    }
    await writeJson(libraryFile, library)
    return library
  }

  // ---------- Skill 市场：从 GitHub 拉 AI 漫剧相关开源 skill，按 star / 下载量排行 ----------
  const skillsFile = path.join(dataDir, 'skills.json')
  const comfyFile = path.join(dataDir, 'comfy.json')
  const COMFY_DEFAULT = { url: 'http://127.0.0.1:8188', workflowId: '', autoCollect: false, timeoutMs: 20000 }
  const readComfyConfig = async () => {
    const raw = await readJson(comfyFile, null)
    const c = raw && typeof raw === 'object' ? raw : {}
    const u = typeof c.url === 'string' && c.url.trim() ? c.url.trim().replace(/\/+$/, '') : COMFY_DEFAULT.url
    return {
      url: u,
      workflowId: typeof c.workflowId === 'string' ? c.workflowId : '',
      autoCollect: !!c.autoCollect,
      timeoutMs: clampInt(c.timeoutMs, 2000, 120000, COMFY_DEFAULT.timeoutMs),
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
    }
  }
  // skill 市场：实现全在 src/lib/skills.js（工作台与命令行 mjw-skills 共用一份），
  // 这里只把依赖注入进去，再按原名解构出来，所以下面几十处调用点一行都不用改。
  // 榜单缓存时效：24 小时（与 skills.js 里的 CACHE_MS 对齐）
  const SKILL_CACHE_MS = 24 * 3600 * 1000
  const skillHub = createSkillHub({ rootDir, dataDir, readJson, writeJson })
  const {
    skillsDir,
    loadSkills,
    saveSkills,
    refreshSkills,
    downloadSkill,
    loadSkillDoc,
    loadSkillDocs,
    fetchDownloads,
  } = skillHub
  const skillIdOf = skillHub.skillIdOf

  // 对话资料快照缓存：同一份剧本资料只编译一次。
  // 前端首次带 project 换一个 ctxId，之后内容没变就只带 ctxId，不再重传整本台账。
  const ctxCache = new Map();
  const CTX_CACHE_MAX = 8;
  const sha1 = (s) => createHash('sha1').update(String(s)).digest('hex');

  async function saveLibrary(library) {
    const next = {
      version: 1,
      activeId: library?.activeId || null,
      updatedAt: new Date().toISOString(),
      scripts: Array.isArray(library?.scripts) ? library.scripts : [],
    }
    await writeJson(libraryFile, next)
    return next
  }

  async function upsertSummary(library, id, project, extra = {}) {
    const idx = library.scripts.findIndex((s) => s.id === id)
    const entry = {
      id,
      createdAt: idx >= 0 ? library.scripts[idx].createdAt : new Date().toISOString(),
      ...summaryOf(project),
      ...extra,
    }
    if (idx >= 0) library.scripts[idx] = { ...library.scripts[idx], ...entry }
    else library.scripts.unshift(entry)
    return entry
  }

  return async function handleApi(req, res) {
    const url = new URL(req.url, 'http://localhost')

    // ---- 参考图静态服务（uploads/ 与 assets/ 两个来源，dev 与生产都通）----
    if (url.pathname.startsWith('/media/')) {
      const rel = decodeURIComponent(url.pathname.slice(7)).replace(/^\/+/, '')
      const MIME_IMG = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.avif': 'image/avif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
      }
      const ext = path.extname(rel).toLowerCase()
      if (!rel || rel.includes('..') || path.isAbsolute(rel) || rel.startsWith('.')) {
        res.statusCode = 403
        res.end('forbidden')
        return true
      }
      if (!MIME_IMG[ext]) {
        res.statusCode = 404
        res.end('not an image')
        return true
      }
      // /media/assets/… → 项目根 assets/；/media/renders/… → renders/；其余 → uploads/
      const underAssets = rel.startsWith('assets/')
      const underRenders = rel.startsWith('renders/')
      const base = underAssets
        ? path.join(rootDir, 'assets')
        : underRenders
          ? path.join(rootDir, 'renders')
          : uploadDir
      const target = path.join(base, underAssets ? rel.slice(7) : underRenders ? rel.slice(8) : rel)
      if (!target.startsWith(base)) {
        res.statusCode = 403
        res.end('forbidden')
        return true
      }
      try {
        const buf = await fs.readFile(target)
        res.statusCode = 200
        res.setHeader('Content-Type', MIME_IMG[ext])
        // uploads/ 的文件名带时间戳，永不重名，可以长缓存；
        // assets/ 是人手维护的素材目录，同名文件会被替换（换一张三视图、换一套服装图），
        // 一旦长缓存浏览器就永远看旧图 —— 所以这里必须每次回源校验。
        res.setHeader('Cache-Control', underAssets ? 'no-cache' : 'max-age=31536000, immutable')
        // ETag 只能放 ASCII：文件名里有中文会让 Node 抛 ERR_INVALID_CHAR
        res.setHeader('ETag', `"${buf.length.toString(16)}-${createHash('sha1').update(buf).digest('hex').slice(0, 12)}"`)
        res.end(buf)
      } catch {
        res.statusCode = 404
        res.end('not found')
      }
      return true
    }

    if (!url.pathname.startsWith('/api/')) return false

    const json = (code, obj) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(obj))
    }

    // ---- 来源校验：只接受本机页面发来的请求 ----
    // 挡两类真实风险：
    //   1) DNS rebinding：攻击者域名解析到 127.0.0.1 后，Host 头是攻击者域名，这里直接拒；
    //   2) 跨站 CSRF：别的站点脚本发来的写请求会带 Origin，非同源一律拒。
    // 这会保护包括 /api/settings（可改 dataDir 到任意路径）在内的全部写接口。
    if (!isLocalHost(req.headers.host)) {
      json(403, { ok: false, error: '只接受本机访问（Host 校验失败）' })
      return true
    }
    if (req.headers.origin && req.method !== 'GET' && !isLocalOrigin(req.headers.origin)) {
      json(403, { ok: false, error: '跨站请求被拒绝（Origin 校验失败）' })
      return true
    }

    try {
      // ---- 库索引 ----
      if (url.pathname === '/api/library' && req.method === 'GET') {
        const library = await ensureLibrary()
        json(200, { ok: true, library, file: libraryFile })
        return true
      }

      if (url.pathname === '/api/library' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const incoming = body.library || body
        const current = await ensureLibrary()
        // 索引按 id 合并，绝不整库替换：incoming 里有的 id 视为 upsert（覆盖摘要），
        // 磁盘上有而 incoming 里没有的 id 一律保留。删除只能走 /api/script/delete，
        // 这样旧标签页 / 第二个窗口拿着过期快照回写，也不会把别的剧本从索引里抹掉。
        const merged = new Map(current.scripts.map((s) => [s.id, s]))
        if (Array.isArray(incoming.scripts)) {
          for (const s of incoming.scripts) {
            if (!s || typeof s.id !== 'string' || !s.id) continue
            merged.set(s.id, s)
          }
        }
        const scripts = [...merged.values()]
        const library = await saveLibrary({
          activeId: incoming.activeId !== undefined ? incoming.activeId : current.activeId,
          scripts,
        })
        json(200, { ok: true, library })
        return true
      }

      // ---- 单个剧本 ----
      if (url.pathname === '/api/script' && req.method === 'GET') {
        const id = safeId(url.searchParams.get('id'))
        if (!id) {
          json(400, { ok: false, error: 'bad id' })
          return true
        }
        const project = await readJson(scriptFile(id), null)
        json(200, { ok: true, project, id })
        return true
      }

      if (url.pathname === '/api/script' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const id = safeId(body.id)
        if (!id || !body.project) {
          json(400, { ok: false, error: 'bad payload' })
          return true
        }
        // 乐观锁：拿传入的 rev 跟磁盘当前 rev 比。过期（< 磁盘）就拒绝，避免旧窗口覆盖新改动。
        // 首次写盘 / 老数据没有 rev 时磁盘按 1 算。
        const disk = await readJson(scriptFile(id), null)
        const diskRev = Number(disk?.meta?.rev) >= 1 ? Math.floor(Number(disk.meta.rev)) : 1
        const incomingRev = Number(body.project?.meta?.rev) >= 1 ? Math.floor(Number(body.project.meta.rev)) : undefined
        if (incomingRev !== undefined && incomingRev < diskRev) {
          json(409, {
            ok: false,
            conflict: true,
            error: '版本冲突：磁盘已有更新的版本，本次写入被拒绝',
            rev: diskRev,
            project: disk,
          })
          return true
        }
        const newRev = Math.max(incomingRev || 0, diskRev) + 1
        body.project.meta = { ...(body.project.meta || {}), rev: newRev }
        await writeJson(scriptFile(id), body.project)
        const library = await ensureLibrary()
        const entry = await upsertSummary(library, id, body.project, body.summary || {})
        if (!library.activeId) library.activeId = id
        await saveLibrary(library)
        json(200, { ok: true, savedAt: new Date().toISOString(), file: scriptFile(id), rev: newRev, entry })
        return true
      }

      if (url.pathname === '/api/script/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const id = safeId(body.id)
        if (!id) {
          json(400, { ok: false, error: 'bad id' })
          return true
        }
        await fs.rm(scriptFile(id), { force: true })
        const library = await ensureLibrary()
        library.scripts = library.scripts.filter((s) => s.id !== id)
        if (library.activeId === id) library.activeId = library.scripts[0]?.id || null
        await saveLibrary(library)
        json(200, { ok: true, library })
        return true
      }

      if (url.pathname === '/api/script/copy' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const from = safeId(body.from)
        const id = safeId(body.id)
        if (!from || !id) {
          json(400, { ok: false, error: 'bad id' })
          return true
        }
        const src = await readJson(scriptFile(from), null)
        if (!src) {
          json(404, { ok: false, error: 'source not found' })
          return true
        }
        const copy = JSON.parse(JSON.stringify(src))
        copy.meta = {
          ...copy.meta,
          title: body.title || `${copy.meta?.title || '未命名'}（副本）`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rev: 1,
        }
        await writeJson(scriptFile(id), copy)
        const library = await ensureLibrary()
        library.scripts.unshift({ id, createdAt: new Date().toISOString(), ...summaryOf(copy) })
        await saveLibrary(library)
        json(200, { ok: true, library, id })
        return true
      }

      // ---- AI 接口配置 ----
      if (url.pathname === '/api/styles' && req.method === 'GET') {
        const custom = await readCustomStyles()
        json(200, { ok: true, custom, file: stylesFile })
        return true
      }

      if (url.pathname === '/api/styles' && req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req))
          const list = await readCustomStyles()
          const id = body?.id && list.some((x) => x.id === body.id) ? body.id : null
          const style = normalizeStyle(body || {}, id)
          const next = id ? list.map((x) => (x.id === id ? { ...style, createdAt: x.createdAt } : x)) : [...list, style]
          await writeCustomStyles(next)
          json(200, { ok: true, style, custom: next, updated: !!id })
        } catch (e) {
          json(400, { ok: false, error: String(e?.message || e) })
        }
        return true
      }

      if (url.pathname === '/api/styles/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const id = String(body?.id || '')
        const list = await readCustomStyles()
        if (!list.some((x) => x.id === id)) {
          json(404, { ok: false, error: '没有这条自定义画风' })
          return true
        }
        const next = list.filter((x) => x.id !== id)
        await writeCustomStyles(next)
        json(200, { ok: true, custom: next })
        return true
      }

      if (url.pathname === '/api/ai/config' && req.method === 'GET') {
        const cfg = await readAiConfig()
        json(200, {
          ok: true,
          config: {
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            temperature: cfg.temperature,
            maxTokens: cfg.maxTokens,
            hasKey: !!cfg.apiKey,
            keyMask: maskKey(cfg.apiKey),
          },
          file: aiFile,
        })
        return true
      }

      if (url.pathname === '/api/ai/config' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const cfg = await saveAiConfig(body || {})
        json(200, {
          ok: true,
          config: {
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            temperature: cfg.temperature,
            maxTokens: cfg.maxTokens,
            hasKey: !!cfg.apiKey,
            keyMask: maskKey(cfg.apiKey),
          },
        })
        return true
      }

      // 连通性测试：发一次极小请求
      if (url.pathname === '/api/ai/test' && req.method === 'POST') {
        let body = {}
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch {
          body = {}
        }
        const cfg = { ...(await readAiConfig()), ...(body || {}) }
        const t0 = Date.now()
        try {
          const out = await callLlm(
            cfg,
            [
              { role: 'system', content: '你是连通性探针，只回一个字。' },
              { role: 'user', content: '回「通」一个字。' },
            ],
            { timeout: 45000, jsonMode: false },
          )
          json(200, {
            ok: true,
            ms: Date.now() - t0,
            model: out.model,
            reply: cut(out.content, 80),
            usage: out.usage,
          })
        } catch (e) {
          json(200, { ok: false, ms: Date.now() - t0, error: String(e?.message || e) })
        }
        return true
      }


      // ---- 内置对话：读整部剧本（含原文）做顾问 ----
      // ---------- Skill 市场 ----------
      if (url.pathname === '/api/skills' && req.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').trim().toLowerCase()
        const force = url.searchParams.get('refresh') === '1'
        let sm = await loadSkills()
        const stale = !sm.fetchedAt || Date.now() - Date.parse(sm.fetchedAt) > SKILL_CACHE_MS
        let source = 'cache'
        let warning = ''
        if (force || stale || !sm.items.length) {
          try {
            const items = await refreshSkills()
            sm = { ...sm, items, fetchedAt: new Date().toISOString() }
            await saveSkills(sm)
            source = 'github'
          } catch (e) {
            source = sm.items.length ? 'cache' : 'empty'
            warning = `GitHub 拉取失败：${String(e.message || e).slice(0, 160)}`
          }
        }
        let items = sm.items.map((it) => {
          const inst = sm.installed[it.id]
          return { ...it, installed: Boolean(inst), installedAt: inst?.at || '', localPath: inst?.dir || '', installMode: inst?.mode || '' }
        })
        if (q) items = items.filter((it) => `${it.fullName} ${it.desc} ${it.topics.join(' ')}`.toLowerCase().includes(q))
        json(200, { ok: true, items, fetchedAt: sm.fetchedAt, source, warning, count: items.length })
        return true
      }

      // 已安装的 skill：给「用哪个 skill 的规则」下拉用，附带文档预览信息
      // 取若干份 skill 正文：任务包随包带上规则文件，ComfyUI 侧要用时直接贴
      if (url.pathname === '/api/skills/docs') {
        const body = await readBody(req).then((s) => (s ? JSON.parse(s) : {})).catch(() => ({}))
        const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []
        const docs = await loadSkillDocs(ids)
        json(200, {
          ok: true,
          count: docs.length,
          docs: docs.map((d) => ({ id: d.id, fullName: d.fullName, file: d.file, chars: d.chars, truncated: d.truncated, text: d.text })),
        })
        return true
      }

      if (url.pathname === '/api/skills/installed' && req.method === 'GET') {
        const sm = await loadSkills()
        const out = []
        for (const [id, rec] of Object.entries(sm.installed || {})) {
          const doc = await loadSkillDoc(id)
          out.push({
            id,
            fullName: rec.fullName || id,
            dir: rec.dir || path.join(skillsDir, id),
            mode: rec.mode || '',
            at: rec.at || '',
            hasDoc: Boolean(doc),
            docFile: doc ? doc.file : '',
            docChars: doc ? doc.chars : 0,
            preview: doc ? doc.text.slice(0, 200) : '',
          })
        }
        out.sort((a, b) => (a.fullName > b.fullName ? 1 : -1))
        json(200, { ok: true, items: out, count: out.length })
        return true
      }

      if (url.pathname === '/api/skills/install' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const fullName = String(body.fullName || '').trim()
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
          json(400, { ok: false, error: '仓库名要写成 owner/repo' })
          return true
        }
        const sm = await loadSkills()
        const id = skillIdOf(fullName)
        const item = sm.items.find((x) => x.fullName === fullName) || null
        try {
          const res = await downloadSkill(fullName, item)
          // 顺手记一下下载量（GitHub 只有 release 资产才有下载计数）
          let downloads = 0
          try {
            downloads = await fetchDownloads(fullName)
          } catch {
            /* 忽略 */
          }
          if (item && downloads > 0) {
            item.downloads = downloads
            await saveSkills(sm)
          }
          sm.installed[id] = { fullName, at: new Date().toISOString(), dir: res.dir, mode: res.mode }
          await saveSkills(sm)
          json(200, { ok: true, id, fullName, mode: res.mode, files: res.files, dir: res.dir, downloads })
        } catch (e) {
          // 下到一半失败时把半成品目录清掉，别在 skills/ 里留空壳
          await fs.rm(path.join(skillsDir, id), { recursive: true, force: true }).catch(() => {})
          json(200, { ok: false, error: String(e.message || e).slice(0, 240) })
        }
        return true
      }

      if (url.pathname === '/api/skills/remove' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const fullName = String(body.fullName || '').trim()
        const id = skillIdOf(fullName)
        const sm = await loadSkills()
        const rec = sm.installed[id]
        if (rec) {
          await fs.rm(rec.dir || path.join(skillsDir, id), { recursive: true, force: true })
          delete sm.installed[id]
          await saveSkills(sm)
        }
        json(200, { ok: true, id, removed: Boolean(rec) })
        return true
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const cfgBase = await readAiConfig();
        if (!cfgBase.apiKey || !cfgBase.baseUrl) {
          json(400, { ok: false, error: '还没接入模型——去「设置 → AI 接入」填 baseUrl / 模型名 / key' });
          return true;
        }
        const body = JSON.parse(await readBody(req));
        // 本次对话可以临时换模型，不写回配置
        const picked = String(body.model || '').trim();
        const cfg = picked ? { ...cfgBase, model: picked.slice(0, 120) } : cfgBase;
        const history = (Array.isArray(body.messages) ? body.messages : [])
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .slice(-16)
          .map((m) => ({ role: m.role, content: cut(m.content, 4000) }));
        if (!history.length) {
          json(400, { ok: false, error: '说点什么' });
          return true;
        }
        // 资料只编译 / 传输一次：有 ctxId 且命中缓存就复用，否则用本次带来的 project 重建
        const maxChars = clampInt(body.maxChars, 4000, 40000, 26000);
        const wantId = String(body.ctxId || '').trim().slice(0, 64);
        let ctx = null;
        let ctxId = wantId;
        let ctxReuse = false;
        if (wantId && ctxCache.has(wantId)) {
          ctx = ctxCache.get(wantId);
          ctxReuse = true;
          // 命中后挪到队尾，配合下面的 LRU 淘汰
          ctxCache.delete(wantId);
          ctxCache.set(wantId, ctx);
        }
        if (!ctx) {
          if (!body.project || typeof body.project !== 'object') {
            json(400, { ok: false, error: '资料快照已过期，刷新页面后再问' });
            return true;
          }
          // 指纹只看「会进资料的那几块」：改分镜时长不会让整段资料重编译
          const fp = sha1(
            JSON.stringify({
              m: body.project.meta,
              c: body.project.characters,
              e: body.project.episodes,
              a: body.project.assetImages,
              n: body.project.assetNames,
              v: body.project.voices,
            }),
          ).slice(0, 16);
          ctxId = `c_${fp}`;
          if (ctxCache.has(ctxId)) {
            // 同一份资料已经编译过：直接用，连重建都省掉
            ctx = ctxCache.get(ctxId);
            ctxReuse = true;
            ctxCache.delete(ctxId);
            ctxCache.set(ctxId, ctx);
          } else {
            ctx = buildChatContext(body.project, { maxChars });
            ctxCache.set(ctxId, ctx);
            while (ctxCache.size > CTX_CACHE_MAX) {
              const oldest = ctxCache.keys().next().value;
              ctxCache.delete(oldest);
            }
          }
        }
        const sys = [
          '你是「AI 漫剧工作台」的内置顾问，服务对象是把小说改成竖屏 AI 漫剧的创作者。',
          '下面的资料就是这个剧本的全部内容：项目定位、角色卡、分集大纲、节拍、导入的原文、分镜。',
          '回答要求：',
          '1. 先给结论，再给理由；不要复述资料。',
          '2. 引用原文或某一镜时点明「第几集第几镜」或原句片段；资料里没有的情节不要编。',
          '3. 涉及改稿要给可执行的点子（具体台词、具体镜号、具体拍型、具体时长），不要泛泛而谈。',
          '4. 简体中文，短句，能省的字省掉。',
          '',
          '【剧本资料开始】',
          ctx.text,
          '【剧本资料结束】',
        ].join('\n');
        const t0 = Date.now();
        try {
          const out = await callLlm(cfg, [{ role: 'system', content: sys }, ...history], { timeout: 180000, jsonMode: false });
          const ms = Date.now() - t0;
          json(200, {
            ok: true,
            reply: out.content,
            ms,
            model: out.model,
            usage: out.usage,
            stats: usageStats(out.usage, ms),
            contextChars: ctx.chars,
            truncated: ctx.truncated,
            ctxId,
            ctxReuse,
            // 这次请求把剧本资料发去了哪台机器（前端据此显示「发往 xxx」）
            sentTo: hostOf(cfg.baseUrl),
          });
        } catch (e) {
          json(200, { ok: false, error: cut(String(e?.message || e), 400), ms: Date.now() - t0 });
        }
        return true;
      }

      // ---- 当前接口可用的模型清单（对话窗口的模型下拉用）----
      if (url.pathname === '/api/ai/models' && req.method === 'GET') {
        const cfg = await readAiConfig();
        const hint = MODEL_HINTS(cfg.baseUrl);
        const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
        if (!cfg.apiKey || !base) {
          json(200, { ok: true, models: hint, current: cfg.model || '', source: 'hint' });
          return true;
        }
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          let r;
          try {
            r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + cfg.apiKey }, signal: ctrl.signal });
          } finally {
            clearTimeout(timer);
          }
          const txt = await r.text();
          if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + cut(txt, 160));
          const data = JSON.parse(txt);
          const ids = (Array.isArray(data?.data) ? data.data : []).map((x) => String(x?.id || '')).filter(Boolean).sort();
          json(200, {
            ok: true,
            models: ids.length ? ids : hint,
            current: cfg.model || '',
            source: ids.length ? 'api' : 'hint',
          });
        } catch (e) {
          json(200, {
            ok: true,
            models: hint,
            current: cfg.model || '',
            source: 'hint',
            error: cut(String(e?.message || e), 200),
          });
        }
        return true;
      }

      // ---- 按生图模型定向重写提示词（单镜或整集）----
      if (url.pathname === '/api/prompt/expand' && req.method === 'POST') {
        // 先校验请求体，再校验 key：请求体本身有问题时，提示「去配 key」会把人带偏。
        let body = null
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          json(400, { ok: false, error: '请求体不是合法 JSON' })
          return true
        }
        if (!body || typeof body !== 'object') {
          json(400, { ok: false, error: '请求体不是合法 JSON' })
          return true
        }
        const isVideo = body.mode === 'video'
        const vm = isVideo ? videoModelById(body.videoModelId) : null
        const m = isVideo
          ? { id: vm.id, name: vm.name, family: vm.family, vendor: vm.vendor }
          : modelById(body.modelId)
        const drafts = Array.isArray(body.shots) ? body.shots : []
        if (!drafts.length) {
          json(400, { ok: false, error: '没有镜头可生成' })
          return true
        }
        if (drafts.length > 40) {
          json(400, { ok: false, error: '一次最多 40 镜，按集分批来' })
          return true
        }
        const cfg = await readAiConfig()
        if (!cfg.apiKey || !cfg.baseUrl) {
          json(503, {
            ok: false,
            error: '未接入 AI：提示词只由模型定向生成，请先在「设置 → AI 接入」填 baseUrl / 模型名 / key',
          })
          return true
        }
        const ctx = {
          ratio: body.ratio || '9:16',
          width: body.width || 1080,
          height: body.height || 1920,
          styleName: body.styleName || '',
          styleAnchor: body.styleAnchor || '',
          mode: isVideo ? 'video' : body.mode === 'pair' ? 'pair' : 'single',
          videoModelId: isVideo ? vm.id : '',
          dur: isVideo ? clampVideoDur(vm.id, body.dur || 5) : body.dur || 5,
          fps: body.fps || 24,
        }
        const wantSkills = body.skillIds !== undefined ? body.skillIds : body.skillId
        if (wantSkills && (Array.isArray(wantSkills) ? wantSkills.length : String(wantSkills).trim())) {
          const docs = await loadSkillDocs(wantSkills)
          ctx.skillBlock = skillBlock(docs)
          ctx.skillName = docs.map((d) => d.fullName).join('、')
          ctx.skillNames = docs.map((d) => d.fullName)
        }
        const t0 = Date.now()
        try {
          const out = await callLlm(cfg, buildPromptExpandMessages(m, drafts, ctx), { timeout: 240000, jsonMode: true })
          const data = extractJson(out.content)
          const prompts = isVideo ? normalizeVideoExpanded(data, drafts, vm) : normalizeExpanded(data, drafts)
          if (!prompts.length) throw new Error('模型没给出可用的 prompts')
          json(200, {
            ok: true,
            modelId: m.id,
            modelName: m.name,
            family: m.family,
            count: prompts.length,
            missing: drafts.length - prompts.length,
            skillName: ctx.skillName || '',
            skillNames: ctx.skillNames || [],
            ms: Date.now() - t0,
            usage: out.usage || null,
            prompts,
          })
        } catch (e) {
          json(200, {
            ok: false,
            ms: Date.now() - t0,
            modelId: m.id,
            error: String(e?.message || e).slice(0, 400),
          })
        }
        return true
      }

      // ---- 场景 / 环境：从原文推测 ----
      if (url.pathname === '/api/scenes/derive' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const text = String(body.text || '')
        if (cnLen(text) < 20) {
          json(400, { ok: false, error: '正文太少（当前 ' + cnLen(text) + ' 字），给一段含环境描写的原文再来' })
          return true
        }
        const opts = {
          styleName: body.styleName || '',
          characters: Array.isArray(body.characters) ? body.characters.map(String).slice(0, 20) : [],
          existing: Array.isArray(body.existing) ? body.existing.slice(0, 60) : [],
          epIds: Array.isArray(body.epIds) ? body.epIds.map(String) : [],
        }
        const cfg = await readAiConfig()
        if (!cfg.apiKey || !cfg.baseUrl) {
          json(503, {
            ok: false,
            error: '未接入 AI：场景只由模型生成，请先在「设置 → AI 接入」填 baseUrl / 模型名 / key',
          })
          return true
        }

        const t0 = Date.now()
        let scenes = []
        let questions = []
        let engine = 'llm'
        let warn = ''
        try {
          const out = await callLlm(cfg, buildSceneMessages(text, opts), { timeout: 120000, jsonMode: true })
          const data = extractJson(out.content)
          const r = normalizeSceneResult(data, opts)
          scenes = r.scenes
          questions = r.questions
          if (!scenes.length) throw new Error('模型没给出 scenes')
        } catch (e) {
          json(502, { ok: false, error: '模型调用失败：' + String(e?.message || e).slice(0, 300) })
          return true
        }
        json(200, {
          ok: true,
          engine,
          warning: warn || undefined,
          ms: Date.now() - t0,
          chars: cnLen(text),
          scenes,
          questions,
        })
        return true
      }

      // ---- AI 分集：按剧情把长文切成多集（模型只切，不改原文）----
      if (url.pathname === '/api/novel/split' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const text = String(body.text || '')
        if (cnLen(text) < 300) {
          json(400, { ok: false, error: `正文太少（当前 ${cnLen(text)} 字），至少 300 字再来分集` })
          return true
        }
        const cfg = await readAiConfig()
        if (!cfg.apiKey || !cfg.baseUrl) {
          json(503, {
            ok: false,
            error: '未接入 AI：分集只由模型生成，请先在「设置 → AI 接入」填 baseUrl / 模型名 / key',
          })
          return true
        }
        const targetChars = clampInt(body.targetChars, 600, 5000, 1500)
        const t0 = Date.now()
        try {
          const out = await callLlm(
            cfg,
            buildSplitMessages(text, {
              targetChars,
              platformName: body.platformName || '',
              styleName: body.styleName || '',
              episodeSec: body.episodeSec || '',
            }),
            { timeout: 300000, jsonMode: true },
          )
          const data = extractJson(out.content)
          const list = Array.isArray(data?.segments) ? data.segments : []
          if (!list.length) throw new Error('模型没给出 segments')
          const r = analyzeAiSegments(list, text, targetChars)
          if (!r.segments.length) throw new Error('模型给出的片段都不在原文里')
          json(200, {
            ok: true,
            engine: 'llm',
            ms: Date.now() - t0,
            usage: out.usage || null,
            segments: r.segments,
            stats: r.stats,
          })
        } catch (e) {
          json(502, { ok: false, error: `模型调用失败：${String(e?.message || e).slice(0, 300)}` })
        }
        return true
      }

      // ---- 小说 → 粗略剧本 ----
      if (url.pathname === '/api/novel/outline' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const text = String(body.text || '')
        if (cnLen(text) < 30) {
          json(400, { ok: false, error: '正文太短，至少给几百字（当前 ' + cnLen(text) + ' 字）' })
          return true
        }
        const opts = {
          title: body.title || '',
          platform: body.platform || 'douyin',
          style: body.style || 'guoman-houtu',
          episodes: clampInt(body.episodes, 1, 10, 3),
          shotsPerEp: clampInt(body.shotsPerEp, 6, 40, 12),
          platformName: body.platformName || '',
          styleName: body.styleName || '',
          episodeSec: body.episodeSec || '',
          prev: normalizePrev(body.prev),
        }
        const cfg = await readAiConfig()
        if (!cfg.apiKey || !cfg.baseUrl) {
          json(503, {
            ok: false,
            error: '未接入 AI：分集与分镜只由模型生成，请先在「设置 → AI 接入」填 baseUrl / 模型名 / key',
          })
          return true
        }

        const wantSkills = body.skillIds !== undefined ? body.skillIds : body.skillId
        if (wantSkills && (Array.isArray(wantSkills) ? wantSkills.length : String(wantSkills).trim())) {
          const docs = await loadSkillDocs(wantSkills)
          opts.skillBlock = skillBlock(docs)
          opts.skillName = docs.map((d) => d.fullName).join('、')
          opts.skillNames = docs.map((d) => d.fullName)
        }

        const t0 = Date.now()
        let project = null
        let engine = 'llm'
        let warn = ''
        try {
          const out = await callLlm(cfg, buildOutlineMessages(text, opts), { timeout: 240000, jsonMode: true })
          const data = extractJson(out.content)
          project = normalizeAiProject(data, opts)
          if (!project.episodes.length) throw new Error('模型没给出 episodes')
          attachSourceText(project, text)
          if (out.usage) warn = `tokens ${out.usage.total_tokens ?? '-'}`
        } catch (e) {
          json(502, { ok: false, error: `模型调用失败：${String(e?.message || e).slice(0, 300)}` })
          return true
        }
        const hint = project.hint || ''
        delete project.hint
        json(200, {
          ok: true,
          engine,
          skillName: opts.skillName || '',
          skillNames: opts.skillNames || [],
          warning: warn || undefined,
          hint: hint || undefined,
          ms: Date.now() - t0,
          stats: {
            chars: cnLen(text),
            episodes: project.episodes.length,
            shots: project.episodes.reduce((n, e) => n + e.shots.length, 0),
          },
          project,
        })
        return true
      }

      // 小说原文归档（可选，便于回溯）
      if (url.pathname === '/api/novel/save' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const name = safeName(body.name || `novel-${Date.now()}.txt`)
        await fs.mkdir(uploadDir, { recursive: true })
        const target = path.join(uploadDir, name)
        await fs.writeFile(target, String(body.text || ''), 'utf8')
        json(200, { ok: true, file: target, chars: cnLen(body.text) })
        return true
      }

      // ---- 旧接口兼容 ----
      if (url.pathname === '/api/project' && req.method === 'GET') {
        const project = await readJson(legacyFile, null)
        json(200, { ok: true, project, file: legacyFile })
        return true
      }
      if (url.pathname === '/api/project' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        await writeJson(legacyFile, body)
        json(200, { ok: true, savedAt: new Date().toISOString(), file: legacyFile })
        return true
      }

      // ---- 导出 ----
      if (url.pathname === '/api/export' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        // content 必须是字符串：以前传 { project } 进来不报错，直接写出 0 字节的 export.txt，
        // 事后看到「导出成功」但文件是空的，排查很费劲。
        if (typeof body.content !== 'string') {
          json(400, { ok: false, error: 'content 必须是字符串' })
          return true
        }
        const name = safeName(body.name || 'export.txt')
        const dir = exportDir
        await fs.mkdir(dir, { recursive: true })
        const target = path.join(dir, name)
        await fs.writeFile(target, body.content ?? '', 'utf8')
        json(200, { ok: true, file: target })
        return true
      }

      // ---- 删掉 exports/ 里的一个文件（文件名由前端从「已落盘」记录里取，只认 basename）----
  // ── ComfyUI：工作流管理 / 连通性探测 / 渲染结果回收 ────────────────
    // 一期只做「导出任务包 + 脚本跑 + 拷回来回收」，不在浏览器里管长任务。
    // 地址等配置落在 data/comfy.json：浏览器不直连 ComfyUI（它默认不发 CORS 头），
    // 一律经本机 /api/comfy/* 代理转发。
    if (url.pathname === '/api/comfy/config') {
      if (req.method === 'GET') {
        const cfg = await readComfyConfig()
        json(200, { ok: true, config: cfg, file: comfyFile })
        return true
      }
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const before = await readComfyConfig()
        const urlv = String(body.url ?? before.url).trim().replace(/\/+$/, '')
        if (urlv && !/^https?:\/\//i.test(urlv)) {
          json(400, { ok: false, error: '地址要写成 http://主机:端口，比如 http://127.0.0.1:8188' })
          return true
        }
        const next = {
          url: urlv || 'http://127.0.0.1:8188',
          workflowId: String(body.workflowId ?? before.workflowId ?? '').slice(0, 60),
          autoCollect: body.autoCollect === undefined ? before.autoCollect : !!body.autoCollect,
          timeoutMs: clampInt(body.timeoutMs ?? before.timeoutMs, 2000, 120000, before.timeoutMs),
          updatedAt: new Date().toISOString(),
        }
        await writeJson(comfyFile, next)
        json(200, { ok: true, config: next, file: comfyFile })
        return true
      }
    }
    if (url.pathname === '/api/comfy/workflows' && req.method === 'GET') {
      const dir = path.join(dataDir, 'workflows')
      // 带 ?id= 时连工作流正文一起给：导出任务包要用它，列表页面上不用
      const wantId = safeId(String(url.searchParams.get('id') || ''))
      if (wantId) {
        const one = await readJson(path.join(dir, `${wantId}.json`), null)
        if (!one) {
          json(404, { ok: false, error: '没有这份工作流' })
          return true
        }
        json(200, { ok: true, id: wantId, workflow: one })
        return true
      }
      let items = []
      try {
        const names = (await fs.readdir(dir)).filter((x) => x.endsWith('.json'))
        for (const n of names) {
          const wf = await readJson(path.join(dir, n), null)
          if (!wf) continue
          const txt = JSON.stringify(wf)
          const ph = [...new Set([...txt.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((m) => m[1]))].sort()
          items.push({
            id: n.replace(/\.json$/, ''),
            nodes: Object.keys(wf).length,
            classes: [...new Set(Object.values(wf).map((x) => x && x.class_type).filter(Boolean))].slice(0, 12),
            placeholders: ph,
            bytes: txt.length,
            at: (await fs.stat(path.join(dir, n))).mtime.toISOString(),
          })
        }
      } catch {
        items = []
      }
      items.sort((a, b) => (a.at < b.at ? 1 : -1))
      json(200, { ok: true, items, dir: path.relative(rootDir, dir) || 'data/workflows' })
      return true
    }

    if (url.pathname === '/api/comfy/workflows' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const wf = body.workflow
      if (!wf || typeof wf !== 'object' || Array.isArray(wf)) {
        json(400, { ok: false, error: '工作流不是合法对象——要是 ComfyUI 的 API 格式（Export (API) 导出的那份）' })
        return true
      }
      const classes = Object.values(wf).map((x) => x && x.class_type)
      if (!classes.some((c) => typeof c === 'string' && c)) {
        json(400, {
          ok: false,
          error: '这份 JSON 里没有 class_type，看着像画布格式（nodes/links）。请在 ComfyUI 菜单里用 Export (API) 再导一次。',
        })
        return true
      }
      const rawName = String(body.name || 'workflow').trim().slice(0, 48)
      const id = safeId(rawName.replace(/[^A-Za-z0-9_-]/g, '_')) || `wf_${Date.now().toString(36)}`
      const dir = path.join(dataDir, 'workflows')
      await fs.mkdir(dir, { recursive: true })
      await writeJson(path.join(dir, `${id}.json`), wf)
      const txt = JSON.stringify(wf)
      const placeholders = [...new Set([...txt.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((m) => m[1]))].sort()
      json(200, {
        ok: true,
        id,
        nodes: Object.keys(wf).length,
        placeholders,
        classes: [...new Set(classes.filter(Boolean))].slice(0, 12),
        warning: placeholders.length ? '' : '这份工作流里没有任何 {{占位符}}，跑出来每一镜都会是同一张图。',
      })
      return true
    }

    if (url.pathname === '/api/comfy/workflows/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const id = safeId(String(body.id || ''))
      if (!id) {
        json(400, { ok: false, error: '要删哪一份？没给 id' })
        return true
      }
      const f = path.join(dataDir, 'workflows', `${id}.json`)
      if (!f.startsWith(path.join(dataDir, 'workflows'))) {
        json(403, { ok: false, error: '路径越界' })
        return true
      }
      const existed = await fs.stat(f).then(() => true).catch(() => false)
      if (!existed) {
        json(404, { ok: false, error: '没有这份工作流' })
        return true
      }
      await fs.rm(f, { force: true })
      json(200, { ok: true, removed: id })
      return true
    }

    if (url.pathname === '/api/comfy/test' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const cfgNow = await readComfyConfig()
      const base = String(body.url || cfgNow.url || 'http://127.0.0.1:8188').replace(/\/+$/, '')
      if (!/^https?:\/\//i.test(base)) {
        json(400, { ok: false, error: '地址要写成 http://主机:端口' })
        return true
      }
      const t0 = Date.now()
      try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 4000)
        const r = await fetch(`${base}/system_stats`, { signal: ctl.signal })
        clearTimeout(timer)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        const dev = Array.isArray(j.devices) ? j.devices[0] : null
        json(200, {
          ok: true,
          ms: Date.now() - t0,
          base,
          version: j.system?.comfyui_version || '',
          python: j.system?.python_version || '',
          device: dev ? `${dev.name || ''} · 显存 ${Math.round((dev.vram_total || 0) / 1073741824)}G` : '',
        })
      } catch (e) {
        json(200, {
          ok: false,
          base,
          error:
            e?.name === 'AbortError'
              ? '连不上（4 秒超时）——ComfyUI 没开，或者只监听本机、工作台在另一台机器'
              : String(e.message || e).slice(0, 200),
        })
      }
      return true
    }

    if (url.pathname === '/api/comfy/collect' && req.method === 'POST') {
      // 扫 renders/ep{N}/ 下的成品，按文件名里的 _s{镜号} 归到镜头
      const rendersDir = path.join(rootDir, 'renders')
      const OK_EXT = { '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.mp4': 'video', '.webm': 'video', '.mov': 'video' }
      const items = []
      let eps = []
      try {
        eps = (await fs.readdir(rendersDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      } catch {
        eps = []
      }
      for (const epDir of eps) {
        const mEp = /^ep(\d+)$/i.exec(epDir)
        const isAssetDir = /^assets$/i.test(epDir)
        if (!mEp && !isAssetDir) continue
        const epNo = mEp ? Number(mEp[1]) : 0
        const full = path.join(rendersDir, epDir)
        const files = await fs.readdir(full).catch(() => [])
        for (const f of files) {
          const ext = path.extname(f).toLowerCase()
          const kind = OK_EXT[ext]
          if (!kind) continue
          const mShot = /_s(\d+)[_.]/i.exec(f) || /_s(\d+)$/i.exec(f.replace(/\.[^.]+$/, ''))
          // 资产任务的文件名形如 asset_expr_沈砚_aj_y6bjft_00001_.png，靠 jobId 认回那一条
          const mJob = /(aj_[a-z0-9]+)/i.exec(f)
          const st = await fs.stat(path.join(full, f)).catch(() => null)
          if (!st) continue
          items.push({
            epNo,
            shotNo: mShot ? Number(mShot[1]) : 0,
            assetJobId: mJob ? mJob[1] : '',
            path: `renders/${epDir}/${f}`,
            kind,
            name: f,
            bytes: st.size,
            at: st.mtime.toISOString(),
          })
        }
      }
      items.sort((a, b) => a.epNo - b.epNo || a.shotNo - b.shotNo || (a.at < b.at ? 1 : -1))
      const unmatched = items.filter((x) => !x.shotNo && !x.assetJobId).length
      json(200, {
        ok: true,
        items,
        count: items.length,
        unmatched,
        dir: 'renders/',
        hint: items.length
          ? ''
          : 'renders/ 下还没东西。把 comfy-run.mjs 跑出来的 renders/ 整个目录拷到项目根目录，再点一次（镜头在 ep{N}/，资产在 assets/）。',
      })
      return true
    }

    if (url.pathname === '/api/export/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const name = safeName(String(body.name || ''))
        if (!name) {
          json(400, { ok: false, error: '文件名不能为空' })
          return true
        }
        const target = path.join(exportDir, name)
        if (!target.startsWith(exportDir)) {
          json(403, { ok: false, error: '路径越界' })
          return true
        }
        try {
          await fs.rm(target, { force: true })
          json(200, { ok: true, removed: name })
        } catch (e) {
          json(500, { ok: false, error: String(e && e.message || e) })
        }
        return true
      }

      // ---- 图片上传（base64 → uploads/，返回可直接塞进 <img src> 的 url）----
      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const dataUrl = String(body.data || '')
        const m = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
        if (!m) {
          json(400, { ok: false, error: '只接受 png / jpeg / webp / gif / avif 的 base64' })
          return true
        }
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
        const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
        if (!buf.length) {
          json(400, { ok: false, error: '空图片' })
          return true
        }
        if (buf.length > 12 * 1024 * 1024) {
          json(400, { ok: false, error: '图片超过 12MB，先压缩再传' })
          return true
        }
        await fs.mkdir(uploadDir, { recursive: true })
        const base =
          safeName(String(body.name || 'img'))
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
            .slice(0, 40) || 'img'
        const file = `${base}-${Date.now().toString(36)}.${ext}`
        await fs.writeFile(path.join(uploadDir, file), buf)
        json(200, { ok: true, path: `uploads/${file}`, url: `/media/${file}`, bytes: buf.length })
        return true
      }

      // ---- 存储位置（设置抽屉用）----
      if (url.pathname === '/api/settings' && req.method === 'GET') {
        let count = 0
        try {
          count = (await ensureLibrary()).scripts.length
        } catch {
          count = 0
        }
        json(200, {
          ok: true,
          root: rootDir,
          dataDir,
          scriptsDir,
          exportsDir: exportDir,
          uploadDir,
          defaultDataDir,
          settingsFile,
          custom: dataDir !== defaultDataDir,
          scripts: count,
          needRestart: false,
        })
        return true
      }

      if (url.pathname === '/api/settings' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const raw = String(body.dataDir ?? '').trim()
        // 路径校验：只接受本地磁盘路径。UNC（\\server\share）、含 .. 的穿越、
        // 空字节、超长路径一律拒——这个接口能让服务把库指到任意目录，必须收紧。
        if (raw) {
          const badPath =
            raw.includes('\u0000') ||
            raw.includes('..') ||
            raw.startsWith('\\\\') ||
            raw.startsWith('//') ||
            raw.length > 240
          if (badPath) {
            json(400, { ok: false, error: '路径不合法：不要用 UNC 或含 .. 的路径' })
            return true
          }
        }
        const next = { ...storedSettings, dataDir: raw }
        await writeJson(settingsFile, next)
        const resolved = resolveDataDir(raw)
        // 目标目录先建好并落一个空库，否则重启后页面会是空白
        await fs.mkdir(path.join(resolved, SCRIPT_DIR), { recursive: true })
        const libPath = path.join(resolved, 'library.json')
        let exists = true
        try {
          await fs.access(libPath)
        } catch {
          exists = false
        }
        if (!exists) await writeJson(libPath, { version: 1, activeId: null, updatedAt: new Date().toISOString(), scripts: [] })
        json(200, { ok: true, dataDir: resolved, previous: dataDir, fresh: !exists, needRestart: true })
        return true
      }

      if (url.pathname === '/api/health') {
        const cfg = await readAiConfig()
        json(200, { ok: true, root: rootDir, ai: { model: cfg.model, hasKey: !!cfg.apiKey } })
        return true
      }

      json(404, { ok: false, error: 'not found' })
      return true
    } catch (err) {
      json(500, { ok: false, error: String(err && err.message ? err.message : err) })
      return true
    }
  }
}
