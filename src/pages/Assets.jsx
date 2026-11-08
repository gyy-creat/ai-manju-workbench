import React, { useMemo, useRef, useState } from 'react'
import { useProject } from '../lib/store.jsx'
import { buildAssetCSV, download, shotName } from '../lib/exporters'
import { Btn, Panel, Tag, Sel, Text, Empty } from '../ui.jsx'
import { ASSET_KINDS, kindOf, photoSrc, uploadImage } from '../lib/media.js'

/** 一张素材卡：图框（点选/拖入替换）+ 名称 + 关联角色/场景 */
function AssetCard({ card, chars, onPatch, onRemove, onPick, onRename, auto, go }) {
  const src = photoSrc(card.path)
  const [over, setOver] = useState(false)
  const k = kindOf(card.kind)

  return (
    <div className={`asset-card${over ? ' is-over' : ''}`}>
      <div
        className={`asset-frame${src ? ' has' : ''}`}
        onClick={() => (auto ? go?.('characters') : onPick(card.id))}
        onDragOver={(e) => { if (!auto) { e.preventDefault(); setOver(true) } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (auto) return
          e.preventDefault(); setOver(false)
          const f = e.dataTransfer?.files?.[0]
          if (f) onPick(card.id, f)
        }}
        title={auto ? '这张图在「主要角色」页维护，点一下跳过去' : '点一下选图，或把图片拖进来'}
      >
        {src ? <img src={src} alt={card.name || k.label} /> : (
          <div className="asset-ph">
            <span>{auto ? '没传图' : '点选 / 拖入'}</span>
            <em>{k.hint}</em>
          </div>
        )}
        <span className="asset-kind">{k.label}</span>
        {auto && <span className="asset-src">主要角色</span>}
      </div>

      <div className="asset-cap">
        {auto ? (
          card.kind === 'view' ? (
            <input
              className="asset-name"
              placeholder={card.defaultName || card.name}
              value={card.customName || ''}
              onChange={(e) => onRename(card.path, e.target.value)}
              title="改这里只改这张卡的名字，不动原图"
            />
          ) : (
            <div className="asset-auto-name" title={card.name}>{card.name}</div>
          )
        ) : (
          <input
            className="asset-name"
            data-id={card.id}
            placeholder={k.id === 'scene' ? '场景名（分镜里选的就是它）' : `${k.label}名称`}
            value={card.name || ''}
            onChange={(e) => onPatch(card.id, { name: e.target.value })}
          />
        )}
        <div className="asset-meta">
          {auto ? (
            <>
              <span className="asset-who">{card.charName || '—'}</span>
              <span className="asset-who-sub">
                {[card.scene, card.ep ? `第 ${card.ep} 集` : ''].filter(Boolean).join(' · ') || ''}
              </span>
            </>
          ) : (
            <>
              <Sel
                value={card.charName || ''}
                onChange={(v) => {
                  const c = chars.find((x) => x.name === v)
                  onPatch(card.id, { charName: v, charId: c ? c.id : '' })
                }}
                options={['', ...chars.map((c) => c.name)]}
              />
              <input
                className="asset-scene"
                value={card.scene || ''}
                placeholder="场景"
                onChange={(e) => onPatch(card.id, { scene: e.target.value })}
              />
              <input
                className="asset-ep"
                value={card.ep || ''}
                placeholder="集"
                onChange={(e) => onPatch(card.id, { ep: e.target.value })}
              />
            </>
          )}
        </div>
        {!auto && (
          <div className="asset-foot">
            <span className="mono dim" title={card.path}>{card.path ? card.path.replace(/^uploads\//, '') : '未上传'}</span>
            <Btn size="sm" variant="ghost danger" onClick={() => onRemove(card.id)}>删</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Assets({ go }) {
  const { project, actions, notify } = useProject()
  const [filter, setFilter] = useState('all')
  const fileRef = useRef(null)
  const pendingId = useRef(null)

  /* ---------- 关键帧对账（原功能保留） ---------- */
  const auto = useMemo(() => {
    const rows = []
    project.episodes.forEach((ep) => {
      ep.shots.forEach((sh) => {
        const rec = (project.assets || []).find((a) => a.ep === ep.no && a.shot === sh.no)
        rows.push({ ep, sh, rec, name: shotName(ep, sh) })
      })
    })
    return rows
  }, [project])
  const missing = auto.filter((r) => !r.rec || r.rec.status === '缺失')

  /* ---------- 素材库：主要角色页已有的图自动汇总 + 这里手工补的 ---------- */
  const fromChars = useMemo(() => {
    const out = []
    const alias = project.assetNames || {}
    project.characters.forEach((c) => {
      const refs = Array.isArray(c.refImages) && c.refImages.length ? c.refImages : c.refImage ? [c.refImage] : []
      refs.forEach((path, i) => {
        const def = `${c.name} · ${i === 0 ? '主视图' : `参考图 ${i + 1}`}`
        out.push({
          id: `ref_${c.id}_${i}`, kind: 'view', name: alias[path] || def, defaultName: def, customName: alias[path] || '',
          charName: c.name, scene: '', ep: '', path, auto: true,
        })
      })
      ;(c.outfits || []).forEach((o) => {
        if (!o.refImage) return
        const label = `${c.name} 服装 ${o.seq}${o.name ? ` · ${o.name}` : ''}`
        out.push({ id: `of_${o.id}`, kind: 'outfit', name: label, charName: c.name, scene: o.scene || '', ep: '', path: o.refImage, auto: true })
      })
    })
    return out
  }, [project.characters, project.assetNames])

  const manual = project.assetImages || []
  const ORDER = ASSET_KINDS.map((k) => k.id)
  const all = [...fromChars, ...manual].sort(
    (a, b) => (ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)) || (Number(!!b.auto) - Number(!!a.auto)),
  )
  const shown = filter === 'all' ? all : all.filter((c) => c.kind === filter)
  const countOf = (id) => all.filter((c) => c.kind === id).length

  /* ---------- 操作 ---------- */
  const patch = (id, p) => actions.updateAssetImage(id, p)
  const rename = (path, name) => actions.renameAsset(path, name)
  const remove = (id) => actions.removeAssetImage(id)

  const pick = (id, presetFile) => {
    if (presetFile) return doUpload(id, presetFile)
    pendingId.current = id
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  const doUpload = async (id, file) => {
    try {
      const j = await uploadImage(file)
      const card = (project.assetImages || []).find((x) => x.id === id)
      const fromFile = String(file?.name || '').replace(/\.[^.]+$/, '').replace(/[-_]\w{6,10}$/, '').trim()
      const patch = { path: j.path }
      // 名字空着就先用文件名顶上，省得每张图都要手打一遍
      if (card && !String(card.name || '').trim() && fromFile) patch.name = fromFile
      actions.updateAssetImage(id, patch)
      notify(
        card && String(card.name || '').trim()
          ? `已存 uploads/ · ${(j.bytes / 1024).toFixed(0)} KB`
          : `已上传，名字暂用「${fromFile || '未命名'}」——直接在这里改`,
      )
      // 把焦点丢到名称框并全选，用户想改名就能立刻改
      requestAnimationFrame(() => {
        const el = document.querySelector(`input.asset-name[data-id="${id}"]`)
        if (el) {
          el.focus()
          el.select?.()
        }
      })
    } catch (err) {
      notify(String(err.message || err))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const addKind = (kind) => {
    actions.addAssetImage(kind)
    notify(`已加一张${kindOf(kind).label}卡，点图框上传`)
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && pendingId.current) doUpload(pendingId.current, f)
        }}
      />

      <div className="toolbar">
        <Tag level="ok">素材 {all.length}</Tag>
        <Tag level={missing.length ? 'warn' : 'ok'}>关键帧缺 {missing.length}</Tag>
        <span style={{ flex: 1 }} />
        {ASSET_KINDS.filter((k) => k.id !== 'outfit').map((k) => (
          <Btn key={k.id} size="sm" onClick={() => addKind(k.id)}>＋ {k.label}</Btn>
        ))}
      </div>

      <Panel
        title="素材库"
        extra={(
          <div className="chips">
            <button type="button" className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>全部 {all.length}</button>
            {ASSET_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`chip${filter === k.id ? ' on' : ''}`}
                onClick={() => setFilter(k.id)}
              >
                {k.label} {countOf(k.id)}
              </button>
            ))}
          </div>
        )}
      >
        {shown.length ? (
          <div className="asset-grid">
            {shown.map((card) => (
              <AssetCard
                key={card.id}
                card={card}
                chars={project.characters}
                auto={!!card.auto}
                go={go}
                onPatch={patch}
                onRemove={remove}
                onPick={pick}
                onRename={rename}
              />
            ))}
          </div>
        ) : (
          <Empty
            icon="film"
            action={<Btn size="sm" onClick={() => addKind(filter === 'all' ? 'view' : filter)}>＋ 加一张</Btn>}
          >
            这一类还没有素材。
          </Empty>
        )}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr .65fr', gap: 14 }}>
        <Panel title="关键帧对账（按镜自动生成）">
          <div className="shots-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>集</th>
                  <th style={{ width: 44 }}>镜</th>
                  <th>素材名</th>
                  <th style={{ width: 78 }}>状态</th>
                  <th style={{ width: 200 }}>存放路径</th>
                  <th style={{ width: 74 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {auto.map((r) => (
                  <tr key={`${r.ep.no}_${r.sh.no}`}>
                    <td className="mono dim">{r.ep.no}</td>
                    <td className="mono dim">{r.sh.no}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.name}</td>
                    <td>
                      {r.rec ? (
                        <Sel
                          value={r.rec.status || '已有'}
                          onChange={(v) => actions.updateAsset(r.rec.id, { status: v })}
                          options={['已有', '缺失', '返工', '弃用']}
                        />
                      ) : (
                        <Tag level="warn">缺失</Tag>
                      )}
                    </td>
                    <td className="dim" style={{ fontSize: 11 }}>
                      {r.rec ? (
                        <Text value={r.rec.path} onChange={(v) => actions.updateAsset(r.rec.id, { path: v })} placeholder={`assets/S${String(r.ep.no).padStart(2, '0')}/`} />
                      ) : (
                        `assets/S${String(r.ep.no).padStart(2, '0')}/`
                      )}
                    </td>
                    <td>
                      {r.rec ? (
                        <Btn size="sm" variant="ghost danger" onClick={() => actions.removeAsset(r.rec.id)}>撤销</Btn>
                      ) : (
                        <Btn size="sm" onClick={() => actions.addAsset()}>登记</Btn>
                      )}
                    </td>
                  </tr>
                ))}
                {!auto.length && <tr><td colSpan={6}><div className="empty">还没有分镜</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <div>
          <Panel
            title="命名规范（照这个存，脚本才认）"
            extra={<Btn size="sm" variant="primary" onClick={() => { download('素材清单.csv', buildAssetCSV(project)); notify?.('素材清单已导出') }}>导出清单</Btn>}
          >
            <div className="pre">S01E01_SH03_v01.png{'\n'}S{'{集:02}'}E{'{集:02}'}_SH{'{镜:02}'}_v{'{版本:02}'}.png</div>
          </Panel>

        </div>
      </div>
    </div>
  )
}
