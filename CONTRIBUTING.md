# 贡献指南

先说清这个项目的一条底线：**它是本地优先的单机工具**。任何改动都不该让「打开网页就能用、数据全在自己磁盘上」这件事失效。

## 开工前

```bash
git clone <your-fork>
cd ai-manju-workbench
npm ci
npm run build
npm run verify   # 机检必须是 100 分 / 0 error
npm run smoke    # 9 个接口断言，不需要任何 key
npm start        # 生产模式 → http://127.0.0.1:5273
```

改前端页面时用 `npm run dev`（vite 热更新），但注意：**vite dev 运行期间写 `src/` 可能报 `replace EIO (Win32 32)`**，Windows 上先停掉 dev 再改文件。

## 硬约束（破了就得整套返工）

1. `dependencies` 只允许 `react` / `react-dom`；`devDependencies` 只允许 `vite` / `@vitejs/plugin-react`。要加别的包，先在 issue 里说明为什么手写不行。
2. 样式手写在 `src/styles.css`，不引 Tailwind / CSS-in-JS。
3. 数据契约不许改名：`data/library.json`（索引）+ `data/scripts/{id}.json`（整部剧）。字段可以加，不能删、不能重命名。
4. AI 调用一律走本机 `/api/*` 代理，key 只落 `data/ai-config.json`，**浏览器侧永远拿不到 key**。没有 key 时全流程必须仍然可用（走本地规则）。
5. 提交前 `npm run build` + `npm run verify` + `npm run smoke` 三个都过。

## 提 PR 时

- 一个 PR 只做一件事。修 UI 顺手重构数据层这类混在一起，会被要求拆开。
- 描述里写：**改了什么 / 为什么这么改 / 怎么验证的**。有截图更好（前后对比）。
- 新增功能请同时更新 `README.md` 对应行；影响数据或接口的更新 `HANDOFF.md`。
- 新增字段记得在 `src/lib/schema.js` 的 `normalizeProject` 里做归一 —— 旧的 `data/scripts/*.json` 不会被自动迁移，靠归一函数兜底。

## 代码风格

- 2 空格缩进、无分号（跟现有文件一致）。
- 纯函数（提示词拼装、爆点分级、语法族映射）放 `src/lib/`，不要塞进组件 —— 前后端都要用同一套口径。
- 组件里不要写业务判定，判定逻辑放 `lib/`，组件只负责渲染与调用 action。
- 注释写「为什么」，不写「是什么」。

## 已知易踩的坑

| 现象 | 原因 |
|---|---|
| 字符串替换静默失败 | 仓库里 `.js/.jsx` 换行是**混合**的（多数 CRLF，`Prompts.jsx` / `Checks.jsx` / `Settings.jsx` / `exporters.js` 有裸 LF）。按实际换行拼，或用行序列匹配 |
| 卡片里的输入框撑满整卡 | 全局 `input:not([type]){width:100%}` 的 specificity 高于单类名，要写 `.card input.xxx` |
| 改了磁盘数据，刷新后又变回去 | 多窗口下旧标签页的 localStorage 会被自动保存心跳写回磁盘。改盘前先关掉所有页面 |
| 页面白屏但 build 通过 | 把对象当 children 渲染了（例如 `{someFunc()}` 返回对象）。`npm run build` 发现不了，要跑浏览器巡检 |
| `npm run build` 只报 `error during build` | 多半是模板字符串里写了反引号，提前终止了字符串 |

## 报 issue

带上：系统 / Node 版本、`npm run smoke` 输出、浏览器控制台报错原文、复现步骤。别贴 key。
