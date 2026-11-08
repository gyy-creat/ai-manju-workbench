# 项目清理记录（2026-11-05）

一次完整盘点：删了什么、加了什么、改了什么、查了什么。

---

## 1. 删（约 24 MB + 2 万个临时文件）

| 对象 | 量级 | 为什么删 |
|---|---|---|
| `.tmp/edge-prof1..12` | 8 个目录、约 2 万文件 | headless Edge 的 user-data-dir，每起一次测试就多一份，纯垃圾 |
| `.tmp/*.png` | 1700+ 张测试截图 | 界面验收截图，看过就完了；文档真正引用的 7 张已挪进 `docs/screens/` |
| `.tmp/*.mjs` | 数百个一次性 CDP 脚本 | 每个功能的临时测试脚本，改完代码就失效；两个通用工具已挪进 `scripts/` |
| `exports/handoff/*.zip` | 2 个包、24 MB | 历史交接包，`npm run pack` 随时能重打 |
| 根目录 `0` | 0 字节 | 误创建的空气文件 |
| 根目录乱码名文件 | 0 字节 | 某次 printf 重定向产生的乱码文件名 |
| `MANIFEST.sha256` | 6 KB | 打包交接的副产物，`pack-handoff.mjs` 每次重新生成 |

`.tmp/` 目录本身保留（在 `.gitignore` 里），`npm run verify` 会往里写临时 bundle。

---

## 2. 增

| 对象 | 用途 |
|---|---|
| `docs/screens/`（7 张） | 交接文档真正引用的界面截图：`del-story / del-topics / del-voice / src-ep2 / src-manual / src-story / strip-novel` |
| `scripts/cdp.mjs` | CDP 连接工具（`conn / nav / sleep / shot`），headless Edge 9223 调试用 |
| `scripts/page-shot.mjs` | 按路由整页截图：`node scripts/page-shot.mjs <route> <height> <name>` |
| `docs/CLEANUP.md` | 本文件 |

---

## 3. 改

| 文件 | 改动 |
|---|---|
| `HANDOFF.md` 第 2 节 | 目录清单补 `uploads/`（上传图不是原文归档）、`docs/screens/`、5 个新 `scripts/` 工具、`.tmp/` 说明；`components/` 与 11 个 `lib/` 模块逐个点名，页数 12 → 13 |
| `HANDOFF.md` 全文 | 13 处 `.tmp/*.png` 引用改指 `docs/screens/*.png`；末尾加一句说明：正文提到的 `.tmp/*.mjs` 都是临时脚本，不入库 |
| `README.md` 第 2 节 | 目录树重写：补 `uploads/`、`docs/screens/`、`scripts/` 六类工具、`src/components/`、7 个新 lib 模块 |

---

## 4. 查（确认该留的都留着）

**没有死代码**：11 个 `lib/*` + 3 个 `components/*` 全部有引用方。

| 文件 | 引用处 | 结论 |
|---|---|---|
| `public/seed.json`（18 KB） | `src/lib/store.jsx:354`、`src/pages/Settings.jsx:30`、`scripts/verify-seed.mjs:7` | **留** —— 「恢复示例数据」与首次启动兜底 |
| `data/project.json`（22 KB） | `api.mjs:892 / 954 / 1439` | **留** —— 旧版单项目迁移源，`/api/script` 无 id 时兜底 |
| `data/library.json` + `data/scripts/*.json` | 全站数据源 | **留** —— 两个剧本：`sc_seed_legacy`（1 集 26 镜）、`sc_mw20qk04ljp3`（2 集 19 镜） |
| `data/ai-config.json` | `/api/ai/*` | **留** —— 已确认 `apiKey` 为空，无泄漏 |
| `data/styles.json` | `/api/styles` | **留** —— 自定义画风为空数组，结构正常 |
| `uploads/scene-hall-mw1pz5i4.png` | 台账里沈砚第三张参考图 | **留** —— 被引用，删了角色卡会掉图 |
| `assets/ref/*`（11 张） | 台账参考图 / 服装卡 / 场景 | **留** |
| `docs/ui-ref/`（36 张、19.9 MB） | UI 改版依据 | **留** —— 占项目体积九成，但删了没法复现设计决策 |
| `dist/` | `server.mjs` 静态根 | **留** —— 生产服务要它（也在 `.gitignore` 里） |

**验收**：`npm run build` 通过（css 52.21 kB / js 334.39 kB，gzip 119.87 kB）；`npm run verify` → 机检 100 | error 0 | warn 0 | info 0。

---

## 5. 现在的体量

不含 `node_modules`：**21.0 MB**，其中 `docs/` 19.9 MB（长图切块）、代码与数据不到 1.1 MB。

开发时真正要读的只有：`src/`（413 KB）、`api.mjs`（63 KB）、`data/`（78 KB）、`HANDOFF.md`（119 KB）。

---

## 6. 下次清理的最短指令

```bash
cd E:/ai项目/ai-manju-workbench
# 1. 先杀掉所有 headless 测试浏览器（否则 profile 文件被占用删不掉）
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { \$_.CommandLine -like '*ai-manju-workbench*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"
# 2. 清临时目录（保留目录本身）
find .tmp -mindepth 1 -delete
# 3. 清旧交接包（需要时 npm run pack 重打）
rm -rf exports/handoff
```

按需清空 `exports/` 下导出的投产包（那些是交付物，一般留着给客户）。

---

## 7. 遗留

- `data/project.json` 是 2026-11-03 的旧版单项目快照，功能上只作迁移源。想彻底干净可以删，但删了「首次启动自动迁移」这条体验路径就没了。
- `docs/screens/` 只有 7 张，其余历史截图（最终设计稿、简化前后对比）在 `docs/*.png` 里，共 10 张，作为设计演进留档。
- `.tmp/` 里不再有跨会话有价值的脚本；下次要调试界面，从 `scripts/cdp.mjs` + `scripts/page-shot.mjs` 起。
