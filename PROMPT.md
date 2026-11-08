# 给接手 AI 的开场指令（复制下面整段即可）

> 用法：把 zip 和下面整段文字一起发给对方 AI。它读完 `HANDOFF.md` 就能冷启动，你不用解释任何背景。
> 当前基线：机检 100 / 0 错误 / 0 警告 / 0 提示；HANDOFF 已写到 6.35 节。

---

你收到一个 zip：`ai-manju-workbench-handoff-<时间戳>.zip`。里面有 `HANDOFF.md`（唯一入口文档）、`README.md`（快速上手）、`MANIFEST.sha256`（基线校验）、`docs/screens/`（当前界面截图）。

## 这是什么

一个跑在本机、单人使用的**「AI 漫剧全流程」内部工作台**。Vite 5 + React 18 单页前端，后端用 Node 内置 `http` 手写（`api.mjs`，被 `server.mjs` 与 vite dev 的中间件共用同一份），所有数据落本地文件，没有数据库、没有登录。

链路是：**导入本集文本 → 剧本/分集（含原文锚点） → 主要角色（多参考图 / 服装序列 / 音色档案） → 分镜脚本 → 生图提示词（12 个生图模型分族） → 配音口型 → 剪辑成片 → 六项机检 → 资产库 → 导出投产包（7 件）**。多剧本隔离，一部剧一套台账。

页面与路由：

| 侧栏 | 路由 | 干什么 |
|---|---|---|
| ＋ 导入本集文本 | `#/novel` | 贴一集正文，自动/手动分集，一集生成一集镜头 |
| 00 总览 | `#/overview` | 项目定位 + 内部 AI 对话 + 流水线进度 + 画风锚 |
| 01 选题 | `#/topics` | 选题池 + 爆款三项自检 |
| 02 剧本 / 分集 | `#/story` | 集纲、节拍强度曲线、本集原文·锚点 |
| 03 主要角色 | `#/characters` | 角色卡、多张参考图、服装序列、音色档案 |
| 04 分镜脚本 | `#/shots` | 逐镜表，TSV 复制 |
| 05 生图提示词 | `#/prompts` | 分族提示词、首尾帧多参、AI 定向 |
| 06 配音 / 口型 | `#/voice` | 台词表、音色分配、自定义音色 |
| 07 剪辑成片 | `#/edit` | 剪辑清单、SRT |
| 08 六项机检 | `#/checks` | 机检问题清单 |
| 09 资产库 | `#/assets` | 三视图 / 表情 / 配饰 / 场景 / 道具 |
| 10 导出交付 | `#/export` | 7 件投产包 |
| 侧栏左下「设置」 | 抽屉 | 外观（6 主题 / 3 字体 / 4 密度）、AI 接入、存储路径、项目、画风 |
| — | `#/settings` | 完整设置页（台账迁移、AiPanel、运行环境） |

## 四条铁律

1. **不加依赖**。`dependencies` 只有 `react` / `react-dom`，`devDependencies` 只有 `vite` / `@vitejs/plugin-react`。样式是手写 CSS，不要引 Tailwind / UI 库 / 状态管理库 / 图表库。真觉得需要，只写进 `CHANGES.md` 的「存疑」，由接收方定。
2. **不改数据契约**。`src/lib/schema.js` 的字段名与枚举（平台 / 画风 / 音色 / 锚点类型 / 景别机位运镜）、`data/library.json`、`data/scripts/{id}.json` 的形状保持。要加字段就往后加，不改不删不移位；`normalizeProject()` 必须能吃过旧台账。
3. **AI 只能走本机代理**。所有模型调用都经 `api.mjs` 里的 `callLlm()`，key 只落 `data/ai-config.json`，浏览器永远拿不到。**无 key 时全流程必须可用**——本地规则链路（分集、锚点、提示词模板、镜头生成）不许删也不许降级成「请先配置 key」。
4. **`npm run build` 与 `npm run verify` 必须过**。verify 的期望输出是 `机检：分数 100 | error 0 | warn 0 | info 0`（当前台账）。改了算法导致分数变化，要在 `CHANGES.md` 里说明原因。

## 先做的事（按顺序）

```bash
npm install --registry=https://registry.npmmirror.com
npm run build      # 必须通过，产物在 dist/
npm run verify     # 必须 100 / 0 / 0 / 0
npm start          # http://127.0.0.1:5273（生产模式，静态 dist/ + api.mjs）
```

要热更新就用 `npm run dev`（vite），但**改 `src/**` 之前先停掉 dev**，Windows 上会报 `ReplaceFileW EIO (Win32 32)`。改 `api.mjs` 后必须重启 node（端口 5273 上的旧进程不清掉会 EADDRINUSE，而且旧代码继续服务）。

然后读 `HANDOFF.md`：第 2 节目录、第 3 节运行链路、第 4 节数据契约、第 5 节 API 表、第 7 节 UI token。功能细节在 6.1–6.35，按你改的模块挑着读（生图提示词看 6.9 / 6.19 / 6.23，音色看 6.7 / 6.34，分集与原文看 6.24 / 6.28，AI 对话看 6.32 / 6.35）。

## 改的时候守这些

- **颜色、圆角、阴影只用 `src/styles.css` 顶部的 token**（`--ink-*` / `--paper-*` / `--vermilion*` / `--line*` / `--r-*` / `--hard`）。写裸 `rgba()` 在浅色主题（`html[data-theme='paper']`）下会变成一块黑板——这是已经踩过的坑。
- 图标只用 `src/ui.jsx` 的 `Icon(name)`，不加 emoji、不加图标库；新图标往 `PATHS` 里加 24 网格 stroke 1.6 的路径。
- 编辑数据只走 `mutate(fn)`，且**原地改 `draft`**（回调返回值会被丢弃）。
- 加页面 = `src/pages/X.jsx` + `App.jsx` 的 `NAV` 加一项 + `PAGES` 注册；`TITLES` 由 NAV 派生，别手写。
- 切剧本前 `flushSave()`，别把 A 剧的改动写进 B 剧。
- **界面不写说明书**：解释「怎么操作」的小字一律不加（6.3 节），只留数据、校验结果、状态与 error。
- 组件内 `<select>` 的 `value` 必须能在 `options` 里找到，否则 React 静默回落到第一项（音色、拍型、画风都踩过）。
- 自定义 class 若作用于 `input`/`select`，选择器要带元素名（`.vc-card input.vc-name`），否则被全局 `input:not([type])` 的 specificity 盖掉。

## 已知的坑（照着躲）

| 现象 | 原因 / 做法 |
|---|---|
| 改了 `.jsx` 用脚本替换全部 MISS | 文件换行不统一：多数 CRLF，`Prompts.jsx` / `Checks.jsx` / `Settings.jsx` 是 LF。先 `s.includes('\r\n')` 再按实际换行拼 |
| 改了代码页面还是旧界面 | 只差 query 的 `Page.navigate` 不会重载。用 `Page.reload({ ignoreCache: true })` |
| 删掉的剧本/角色又回来了 | 浏览器 localStorage 旧副本被 30s 自动保存心跳写回磁盘。改盘前先关掉所有开着页面的浏览器实例 |
| `/media/assets/*` 换了图仍显示旧的 | `assets/` 是 `no-cache` + ETag；`uploads/` 才是长缓存（文件名带时间戳） |
| 提示词里角色退化成「同参考图」 | `resolveChars` 先按逗号切段、整段命中角色名才不拆空格；角色名**不能带空格** |
| 生图提示词角色串里混了英文 | 中文族要用 `charCnText()`，不能塞英文 anchor |
| 首尾帧两条一模一样 | 帧标记必须与提示词同语言，英文标记塞进中文串会被模型忽略 |
| 导出的 CSV 列对不上 | 表头与行必须同时改（分镜 / 提示词 / 配音 / 素材四张表） |

## 交回什么

1. 改完的整个目录，保持 `ai-manju-workbench/` 根目录名。
2. 根目录一份 `CHANGES.md`：

```markdown
# CHANGES
## 改了什么（逐文件）
- src/pages/Home.jsx: …
## 为什么
…
## 验证
- [ ] npm run build 通过
- [ ] npm run verify 输出 100 / 0 / 0 / 0
- [ ] npm start 后手工走一遍：新建剧本 → 导入一集正文 → 生成 → 写入 → 刷新仍在 → 导出投产包
## 没做 / 存疑
…
```

3. **不要**顺手升级依赖、**不要**重排无关文件的格式、**不要**删 `MANIFEST.sha256`（接收方靠它算你改了哪些文件）。

接收方拿到回包会跑 `node scripts/unpack-handoff.mjs <zip>`，自动列出新增 / 修改 / 删除三个清单，再决定怎么合并。

## 包里没有的东西

`node_modules` / `dist` / `.tmp` / `exports` / `data/ai-config.json`（含 key）/ `settings.json`（含本机绝对路径）/ `docs/ui-ref`（16.9MB UI 改版参考长图）。前四个跑一条命令就有；中间两个是机密与机器相关配置；最后一个是设计参考，需要时找原作者要。
