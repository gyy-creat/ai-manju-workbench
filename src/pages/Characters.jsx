import React, { useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { Btn, Field, Text, Area, Sel, Panel, Tag, Kv, Empty } from '../ui.jsx'
import { ROLES, ROLE_PRESETS, ROLE_CUSTOM, nextOutfitSeq, emptyOutfit, randomPasserby, rerollPasserby } from '../lib/schema'
import { copyText } from '../lib/exporters'
import { charAnchorText } from '../lib/prompts'
import {
  VOICE_PRESETS,
  VOICE_ENUMS,
  VOICE_TOOLS,
  VOICE_FIELDS,
  emptyVoiceProfile,
  presetOf,
  customOf,
  resolveVoice,
  voiceDisplayLabel,
  voiceLock,
  voiceLine,
} from '../lib/voice.js'

const F = { flex: 1, minWidth: 118 }

const VOICE_LABEL = {
  gender: '性别',
  age: '年龄感',
  pitch: '基频',
  timbre: '音质',
  rate: '语速',
  accent: '口音',
  emotion: '情绪基线',
  breath: '气息',
}

/** 选预设 = 把整套参数写进 voiceProfile（而不是只换个名字），之后随便微调 */
function applyVoicePreset(cur, upd, label) {
  const p = VOICE_PRESETS.find((x) => x.label === label || x.id === label)
  if (!p) {
    upd({ voice: label })
    return
  }
  upd({
    voice: p.label,
    voiceProfile: {
      ...emptyVoiceProfile(),
      presetId: p.id,
      gender: p.gender,
      age: p.age,
      pitch: p.pitch,
      timbre: p.timbre,
      rate: p.rate,
      accent: p.accent,
      emotion: p.emotion,
      breath: p.breath,
      tool: p.tool,
      voiceId: p.voiceId,
      params: p.params,
      refAudio: cur.voiceProfile?.refAudio || '',
      refText: cur.voiceProfile?.refText || '',
      seed: cur.voiceProfile?.seed || cur.seed || '',
    },
  })
}

/** 服装展示：同一角色按场景换装，每套一张图 + 一个序列号（O1/O2…），跨集就认这个号 */
function OutfitPanel({ cur, upd, uploadImage, notify }) {
  const fileRef = useRef(null)
  const target = useRef(-1)
  const [busy, setBusy] = useState(false)
  const list = cur.outfits || []

  const setAt = (i, patch) => upd({ outfits: list.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const add = () => upd({ outfits: [...list, { ...emptyOutfit(nextOutfitSeq(list)), name: '', scene: '' }] })
  const remove = (i) => upd({ outfits: list.filter((_, j) => j !== i) })

  const applyPhoto = async (i, file) => {
    if (i < 0 || !file) return
    setBusy(true)
    try {
      const j = await uploadImage(file)
      setAt(i, { refImage: j.path })
      notify(`服装图已存 uploads/ · ${(j.bytes / 1024).toFixed(0)} KB`)
    } catch (err) {
      notify(String(err.message || err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const pick = (i) => {
    target.current = i
    fileRef.current?.click()
  }

  const onPaste = (i) => (e) => {
    const f = Array.from(e.clipboardData?.files || [])[0]
    if (f) {
      e.preventDefault()
      applyPhoto(i, f)
    }
  }

  return (
    <Panel
      title="服装展示"
      style={{ marginTop: 12 }}
      extra={
        <Btn size="sm" variant="ghost" onClick={add}>
          ＋ 新增服装
        </Btn>
      }
    >

      {list.length === 0 ? (
        <Empty>还没有服装卡</Empty>
      ) : (
        <div className="outfit-grid">
          {list.map((o, i) => {
            const src = photoSrc(o.refImage)
            return (
              <div className="outfit-card" key={o.id || i}>
                <div
                  className={`outfit-frame ${src ? 'has' : ''}`}
                  onClick={() => pick(i)}
                  onPaste={onPaste(i)}
                  title={src ? '点击更换服装图' : '点击选图，或粘贴图片'}
                >
                  {src ? (
                    <img src={src} alt={o.seq} />
                  ) : (
                    <span className="ph">
                      点这里选图
                      <br />
                      或直接粘贴
                    </span>
                  )}
                </div>

                <input
                  className="outfit-seq"
                  value={o.seq}
                  title="序列号，可改"
                  onChange={(e) => setAt(i, { seq: e.target.value.toUpperCase().slice(0, 6) })}
                />

                <input
                  className="outfit-name"
                  value={o.name}
                  placeholder="这套叫什么（工厂夜）"
                  onChange={(e) => setAt(i, { name: e.target.value })}
                />
                <input
                  className="outfit-scene"
                  value={o.scene}
                  placeholder="出场集/场景（第2集 老街工坊）"
                  onChange={(e) => setAt(i, { scene: e.target.value })}
                />
                <input
                  className="outfit-anchor"
                  value={o.anchor}
                  placeholder="英文服装串（dark grey workwear jacket）"
                  onChange={(e) => setAt(i, { anchor: e.target.value })}
                />

                <div className="outfit-foot">
                  <span className="dim" style={{ fontSize: 10 }}>
                    {busy ? '上传中…' : o.refImage && !src ? '路径渲染不出来' : ''}
                  </span>
                  <Btn size="sm" variant="ghost" onClick={() => remove(i)}>
                    删除
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => applyPhoto(target.current, e.target.files?.[0])} />
    </Panel>
  )
}

function VoicePanel({ cur, upd, notify, project, actions }) {
  const voices = project.voices || []
  const vp = resolveVoice(cur, voices)
  const preset = presetOf(cur.voice)
  const drifted = VOICE_FIELDS.filter((k) => (vp[k] || '') !== (preset[k] || ''))
  const setVp = (patch) => upd({ voiceProfile: { ...(cur.voiceProfile || {}), ...patch } })

  return (
    <Panel
      title="音色档案"
      style={{ marginTop: 12 }}
      extra={
        <>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => {
            copyText(voiceLock(cur, voices))
            notify('音色锁定串已复制，可直接贴给配音 / TTS')
          }}
        >
          复制锁定串
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          onClick={() => {
            const name = `${cur.name || '角色'} 的音色`.slice(0, 20)
            actions.adoptVoice(cur.id, {
              gender: vp.gender, age: vp.age, pitch: vp.pitch, timbre: vp.timbre,
              rate: vp.rate, accent: vp.accent, emotion: vp.emotion, breath: vp.breath,
              tool: vp.tool, voiceId: vp.voiceId, params: vp.params,
              refAudio: vp.refAudio, refText: vp.refText, seed: vp.seed,
              note: '来自角色卡',
            }, name)
            notify?.(`已存为新音色「${name}」，可在 06 页改名`)
          }}
        >
          存为新音色
        </Btn>
        </>
      }
    >
      <div className="dim" style={{ fontSize: 11, lineHeight: 1.7, marginBottom: 10 }}>
        {drifted.length > 0 && (
          <>
            <br />
            <span style={{ color: 'var(--gamboge)' }}>
              已在预设「{preset.label}」基础上微调 {drifted.length} 项
              {drifted.length < 4 ? `（${drifted.map((k) => VOICE_LABEL[k] || k).join('、')}）` : ''}
              ，重选预设会覆盖这些微调。
            </span>
          </>
        )}
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field label="性别" style={F}>
          <Sel value={vp.gender} onChange={(v) => setVp({ gender: v })} options={VOICE_ENUMS.gender} />
        </Field>
        <Field label="年龄感" style={F}>
          <Sel value={vp.age} onChange={(v) => setVp({ age: v })} options={VOICE_ENUMS.age} />
        </Field>
        <Field label="基频" style={F}>
          <Sel value={vp.pitch} onChange={(v) => setVp({ pitch: v })} options={VOICE_ENUMS.pitch} />
        </Field>
        <Field label="音质" style={F}>
          <Sel value={vp.timbre} onChange={(v) => setVp({ timbre: v })} options={VOICE_ENUMS.timbre} />
        </Field>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field label="语速" style={F}>
          <Sel value={vp.rate} onChange={(v) => setVp({ rate: v })} options={VOICE_ENUMS.rate} />
        </Field>
        <Field label="情绪基线" style={F}>
          <Sel value={vp.emotion} onChange={(v) => setVp({ emotion: v })} options={VOICE_ENUMS.emotion} />
        </Field>
        <Field label="口音" style={{ ...F, minWidth: 150 }}>
          <Text value={vp.accent} onChange={(v) => setVp({ accent: v })} placeholder="标准普通话 / 轻北方口音" />
        </Field>
        <Field label="气息" style={{ ...F, minWidth: 150 }}>
          <Text value={vp.breath} onChange={(v) => setVp({ breath: v })} placeholder="尾字带气声" />
        </Field>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field label="TTS 工具" style={F}>
          <Sel value={vp.tool} onChange={(v) => setVp({ tool: v })} options={['', ...VOICE_TOOLS]} />
        </Field>
        <Field label="voice_id（工具里的音色名）" style={{ ...F, minWidth: 190 }}>
          <Text value={vp.voiceId} onChange={(v) => setVp({ voiceId: v })} placeholder="x4_yezi / zh-CN-YunxiNeural" />
        </Field>
        <Field label="音色 seed" style={F}>
          <Text value={vp.seed} onChange={(v) => setVp({ seed: v })} placeholder="克隆/随机音色的种子" />
        </Field>
      </div>

      <Field label="参数（speed / pitch / emotion / breathiness）">
        <Text value={vp.params} onChange={(v) => setVp({ params: v })} placeholder="speed=0.92, pitch=-4, emotion=serious" />
      </Field>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field
          label="参考音频（克隆音色的 10–30 秒干净样本）"
          style={{ flex: 1, minWidth: 240 }}
        >
          <Text value={vp.refAudio} onChange={(v) => setVp({ refAudio: v })} placeholder="uploads/shen-yan-voice-01.wav" />
        </Field>
      </div>

      <Field label="参考文本（样本的逐字稿，zero-shot 克隆必需）">
        <Area rows={2} value={vp.refText} onChange={(v) => setVp({ refText: v })} placeholder="「三年了，你们沈家就剩这张纸值钱。」" />
      </Field>

      <div className="kvs" style={{ marginBottom: 10 }}>
        <Kv k="一句话听感" v={voiceLine(cur, voices)} />
      </div>

      <div style={{ fontSize: 11, color: 'var(--paper-4)', marginBottom: 4 }}>锁定串（换集照抄，别改）</div>
      <div className="pre" style={{ maxHeight: 168, overflow: 'auto', fontSize: 11.5 }}>{voiceLock(cur, voices)}</div>
    </Panel>
  )
}


// refImage 存三类值：uploads/xxx.png（本机上传）、http(s) 外链、或历史遗留的裸路径（渲染不出来，只当记录）
const photoSrc = (v) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^(https?:|data:|blob:)/i.test(s)) return s
  if (s.startsWith('/media/')) return s
  if (s.startsWith('uploads/')) return `/media/${s.slice(8)}`
  if (s.startsWith('assets/')) return `/media/${s}`
  return ''
}

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('读文件失败'))
    fr.readAsDataURL(file)
  })

export default function Characters() {
  const { project, actions, notify } = useProject()
  const [sel, setSel] = useState(project.characters[0]?.id || null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const cur = project.characters.find((c) => c.id === sel) || project.characters[0]
  const upd = (patch) => cur && actions.updateCharacter(cur.id, patch)

  // 随机路人：不锁脸、不锁 seed，每次出图可以换一张脸
  const addPasserby = () => {
    const seq = project.characters.filter((c) => c.random).length + 1
    const c = randomPasserby(seq)
    actions.pushCharacter(c)
    setSel(c.id)
    notify(`已加随机路人「${c.name}」——不锁脸，提示词里会写成随机路人`)
  }

  /** 通用图片上传：返回 {ok, path, url, bytes}，失败抛错（角色参考图与服装卡共用） */
  const uploadImage = async (file) => {
    if (!file) throw new Error('没拿到文件')
    if (!/^image\//.test(file.type)) throw new Error('只能传图片文件')
    if (file.size > 12 * 1024 * 1024) throw new Error('图片超过 12MB，先压缩再传')
    const data = await readAsDataUrl(file)
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, name: file.name || 'ref' }),
    })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || '上传失败')
    return j
  }

  // 参考图可以有多张：主视图 / 表情表 / 配饰 / 侧面。refImage 永远是第一张的镜像
  const refList = cur
    ? Array.isArray(cur.refImages) && cur.refImages.length
      ? cur.refImages
      : cur.refImage
        ? [cur.refImage]
        : []
    : []

  const pushPhotos = async (files) => {
    const list = (files || []).filter(Boolean)
    if (!cur || !list.length) return
    setBusy(true)
    try {
      const added = []
      for (const f of list) {
        const j = await uploadImage(f)
        added.push(j.path)
      }
      const next = [...refList, ...added]
      upd({ refImages: next, refImage: next[0] || '' })
      notify(`已加 ${added.length} 张参考图（共 ${next.length} 张）`)
    } catch (err) {
      notify(String(err.message || err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePhoto = (path) => {
    if (!cur) return
    const next = refList.filter((x) => x !== path)
    upd({ refImages: next, refImage: next[0] || '' })
  }

  const setMainPhoto = (path) => {
    if (!cur || path === refList[0]) return
    upd({ refImages: [path, ...refList.filter((x) => x !== path)], refImage: path })
  }

  const onPastePhoto = (e) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length) {
      e.preventDefault()
      pushPhotos(files)
    }
  }

  const onDropPhoto = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) pushPhotos(files)
  }

  const usedIn = (name) => project.episodes.flatMap((e) => e.shots.filter((s) => (s.chars || '').includes(name))).length

  // 与提示词里实际用的主体串保持一致（随机路人会输出 random background passerby）
  const anchorFull = cur ? charAnchorText(cur) : ''

  const used = cur ? usedIn(cur.name) : 0
  const refRisk = {
    ok: refList.some((p) => photoSrc(p)),
    msg: '缺参考图——建议三视图 + 表情表',
    okMsg: refList.length > 1 ? `${refList.length} 张参考图已就位` : '参考图已就位',
  }
  const usedRisk = {
    ok: used > 0 || project.episodes.length === 0,
    msg: '还没被任何分镜引用',
    okMsg: used > 0 ? `已被 ${used} 镜引用` : '还没有分镜，无从引用',
  }
  // 随机路人不参与一致性机制：不要求锚定词 / seed / 参考图 / 服装卡
  const risks = cur
    ? cur.random
      ? [
          { ok: true, msg: '', okMsg: '随机路人：不锁脸、不锁 seed，每次出图可以换一张脸' },
          { ok: true, msg: '', okMsg: '不需要参考图与服装卡；想固定下来就把「随机」关掉再补' },
          { ok: !!cur.voice, msg: '缺音色——群演戏也需要定一档', okMsg: '群演音色已定档' },
          usedRisk,
        ]
      : [
          { ok: !!cur.anchor, msg: '缺锚定词——同一张脸在镜头间会漂', okMsg: '锚定词已写，脸在镜头间不会漂' },
          { ok: !!cur.seed, msg: '缺固定 seed——重生成会换脸', okMsg: 'seed 已锁，重生成不掉脸' },
          refRisk,
          { ok: !!cur.outfit, msg: '缺服装描述——换场必崩', okMsg: '服装描述已写死' },
          { ok: !!cur.voice, msg: '缺音色——配音时临时决定会串', okMsg: '音色已定档' },
          usedRisk,
        ]
    : []

  return (
    <div className="cols">
      <div className="list-panel">
        <div className="list-head">
          <span style={{ flex: 1 }}>角色 · {project.characters.length}</span>
          <Btn size="sm" variant="ghost" title="加一个随机路人：不锁脸、不锁 seed、不用参考图" onClick={addPasserby}>路人＋</Btn>
          <Btn size="sm" variant="ghost" onClick={() => { actions.addCharacter(); setSel(null) }}>＋</Btn>
        </div>
        {project.characters.map((c) => (
          <div key={c.id} className={`list-item ${cur?.id === c.id ? 'active' : ''}`} onClick={() => setSel(c.id)}>
            {photoSrc(c.refImage) ? (
              <img className="avatar-sm" src={photoSrc(c.refImage)} alt={c.name} />
            ) : (
              <span className="n">{c.random ? '随' : c.role.slice(0, 1)}</span>
            )}
            <span className="t">{c.name}</span>
            {c.random ? null : c.anchor ? (
              <span className="st" style={{ color: 'var(--ok)', fontSize: 10 }}>●</span>
            ) : (
              <span className="st" style={{ color: 'var(--warn)', fontSize: 10 }}>○</span>
            )}
            <button
              type="button"
              className="li-del"
              title={`删除「${c.name}」`}
              onClick={(e) => {
                e.stopPropagation()
                const n = usedIn(c.name)
                if (!window.confirm(n
                  ? `「${c.name}」还在 ${n} 个镜头里出现。删掉后这些镜头的「角色」栏要手动清，确定删除？`
                  : `删除「${c.name}」？`)) return
                actions.removeCharacter(c.id)
                if (cur && cur.id === c.id) setSel(null)
              }}
            >×</button>
          </div>
        ))}
        {!project.characters.length && <div className="empty">还没有角色档案</div>}
      </div>

      <div>
        {cur ? (
          <Panel
            title="角色卡"
            extra={
              cur.random ? (
                <>
                  <Tag level="warn">随机路人</Tag>
                  <Btn size="sm" variant="ghost" onClick={() => upd(rerollPasserby(cur))}>
                    重掷外形
                  </Btn>
                </>
              ) : null
            }
          >
            <div className="row">
              <Field label="姓名">
                <Text value={cur.name} onChange={(v) => upd({ name: v })} />
              </Field>
              <Field
                label="定位"
              >
                <Sel
                  value={ROLE_PRESETS.includes(cur.role) ? cur.role : ROLE_CUSTOM}
                  onChange={(v) => upd({ role: v === ROLE_CUSTOM ? '' : v })}
                  options={[...ROLE_PRESETS, ROLE_CUSTOM]}
                />
                {!ROLE_PRESETS.includes(cur.role) && (
                  <div style={{ marginTop: 6 }}>
                    <Text
                      value={cur.role}
                      onChange={(v) => upd({ role: v })}
                      placeholder="自定义定位，如 反派 / 师父 / 老板"
                    />
                  </div>
                )}
              </Field>
              <Field label="年龄感">
                <Text value={cur.age} onChange={(v) => upd({ age: v })} placeholder="18 / 25–30 / 中年" />
              </Field>
            </div>
            <Field
              label={cur.random ? '外形描述（随机路人不用锚定）' : '锚定词（锁脸锁装，一段英文最稳）'}
            >
              <Area rows={2} value={cur.anchor} onChange={(v) => upd({ anchor: v })} placeholder="hanfu-clad young woman, oval face, sharp brows, long black hair tied high, scar over left eyebrow" />
            </Field>
            <div className="row">
              <Field label="脸型 / 五官">
                <Text value={cur.face} onChange={(v) => upd({ face: v })} />
              </Field>
              <Field label="发型 / 发色">
                <Text value={cur.hair} onChange={(v) => upd({ hair: v })} />
              </Field>
            </div>
            <Field label="服装（分集分场可换，但要写死）">
              <Text value={cur.outfit} onChange={(v) => upd({ outfit: v })} placeholder="玄色广袖长袍，银线暗纹，左腕缠绷带" />
            </Field>
            <Field label="外貌补充">
              <Area rows={2} value={cur.look} onChange={(v) => upd({ look: v })} />
            </Field>
            <div className="row">
              <Field label="固定 seed">
                <Text value={cur.seed} onChange={(v) => upd({ seed: v })} placeholder="如 1283764（即梦/MJ 通用）" />
              </Field>
              <Field label="音色">
                <Sel
                  value={customOf(project.voices, cur.voice) ? voiceDisplayLabel(cur.voice, project.voices) : presetOf(cur.voice).label}
                  onChange={(v) => {
                    const found = (project.voices || []).find((x) => voiceDisplayLabel(x.id, project.voices) === v)
                    if (found) upd({ voice: v })
                    else applyVoicePreset(cur, upd, v)
                  }}
                  options={[...VOICE_PRESETS.map((p) => p.label), ...(project.voices || []).map((x) => voiceDisplayLabel(x.id, project.voices))]}
                />
              </Field>
            </div>
            <Field
              label={`参考图（${refList.length} 张）`}
            >
              <div className="ref-grid" onPaste={onPastePhoto} onDragOver={(e) => e.preventDefault()} onDrop={onDropPhoto}>
                {refList.map((path, i) => {
                  const src = photoSrc(path)
                  return (
                    <div key={`${path}-${i}`} className={`ref-cell ${src ? 'has' : 'bad'}`}>
                      {src ? (
                        <img src={src} alt={`${cur.name} 参考图 ${i + 1}`} onClick={() => setMainPhoto(path)} title={i === 0 ? '主图' : '点击设为主图'} />
                      ) : (
                        <div className="ph bad">渲染不出来</div>
                      )}
                      {i === 0 ? <span className="ref-main">主图</span> : null}
                      <button type="button" className="ref-del" onClick={() => removePhoto(path)} title="删除这张">
                        ×
                      </button>
                    </div>
                  )
                })}
                <div
                  className="ref-add"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  title="点这里加图（可多选 / 拖入 / 粘贴）"
                >
                  {busy ? '上传中…' : (
                    <>
                      ＋
                      <br />
                      加参考图
                    </>
                  )}
                </div>
              </div>
            </Field>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => pushPhotos(Array.from(e.target.files || []))}
            />
            <Field label="备注（口头禅 / 小动作 / 关系）">
              <Area rows={2} value={cur.notes} onChange={(v) => upd({ notes: v })} />
            </Field>
            <Btn size="sm" variant="danger" onClick={() => { actions.removeCharacter(cur.id); setSel(null) }}>删除角色</Btn>
          </Panel>
        ) : (
          <div className="empty">左栏新建角色</div>
        )}
        {cur && <OutfitPanel cur={cur} upd={upd} uploadImage={uploadImage} notify={notify} />}
        {cur && <VoicePanel cur={cur} upd={upd} notify={notify} project={project} actions={actions} />}
      </div>

      <div>
        <Panel
          title="拼装后的锚定串"
          extra={<Btn size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(anchorFull); notify('锚定串已复制') }}>复制</Btn>}
        >
          <div className="pre" style={{ maxHeight: 180, overflow: 'auto' }}>{anchorFull || '（先填锚定词）'}</div>
        </Panel>

        <Panel title="一致性风险" style={{ marginTop: 12 }}>
          {cur ? (
            <>
              {risks.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'center' }}>
                  <Tag level={!r.ok ? 'warn' : 'ok'}>{!r.ok ? '缺' : '✓'}</Tag>
                  <span style={{ fontSize: 11.5 }}>{r.ok ? r.okMsg || r.msg : r.msg}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="muted">无角色</div>
          )}
        </Panel>

        {cur && (
          <div style={{ marginTop: 12 }}>
            <Kv k="引用镜数" v={`${usedIn(cur.name)} 镜`} />
          </div>
        )}
      </div>
    </div>
  )
}
