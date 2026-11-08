# 安全说明

## 这个项目的信任边界

它设计成**只在本机跑**：`server.mjs` 默认只监听 `127.0.0.1`，所有数据落在你自己的磁盘上，没有任何云同步、统计上报或自动更新。

因此有两件事你必须知道：

1. **不要把 `HOST` 设成 `0.0.0.0` 暴露到公网。** 它没有账号体系，也没有多租户隔离。设成内网地址（`192.168.x.x`）给同网段用是支持的，但那时能访问的人就能改你全部台账。
2. **AI 接入的 key 存在 `data/ai-config.json`，明文。** 本机文件权限就是它的全部保护。别把这个文件放进 git、网盘同步目录或交接包里 —— `.gitignore` 与 `scripts/pack-handoff.mjs` 都已经排除它，但自己别手动加回去。

工作台已有的防护（可以 review 源码确认）：

| 位置 | 机制 |
|---|---|
| `api.mjs` | Host / Origin 闸门：非本机 Host 或跨站 Origin 的写请求直接 403（挡 DNS rebinding 与 CSRF） |
| `api.mjs` | `/media/*` 只放行白名单扩展名，`..` 与绝对路径 403，目标必须落在 `uploads/`、`assets/`、`renders/` 内 |
| `api.mjs` | `POST /api/script` 带 rev 乐观锁，过期写入返回 409 而不是覆盖 |
| `api.mjs` | 台账写入是「临时文件 + fsync + rename」，断电不会截断 JSON |
| `api.mjs` | `readBody` 有 32MB 上限与 30 秒 socket 超时 |
| `api.mjs` | `/api/export/delete` 只接受文件名，`../` 被 `safeName` 抹平 |
| `api.mjs` | `POST /api/settings` 拒绝含 `..`、UNC 前缀、超长路径 |

## 出站请求

工作台会主动连三个地方，全部由你自己填、你自己触发：

- 你配置的 OpenAI 兼容端点（`data/ai-config.json` 的 `baseUrl`）—— 聊天、生图/生视频提示词定向、导入本集文本
- 你的 ComfyUI（`data/comfy.json` 或设置页填的地址）—— 探测连通、提交任务、取回图片
- `api.github.com` —— 只在「设置 → Skill」拉榜单时；有 `GITHUB_TOKEN` 环境变量时作为 Bearer 使用

发给模型的**包含整部剧本与导入的原文**，界面上有一次性提示。不想外发的稿子，先用本地规则（不配 key 也能跑）。

## 报告漏洞

开一个 issue 描述影响面即可；涉及具体利用链的，请先在 issue 里只写「影响 + 触发点」，细节我们私信交换。别在公开 issue 里贴真实 key、真实剧本或别人的接口地址。
