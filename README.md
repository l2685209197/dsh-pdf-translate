# dsh-pdf-translate

[![npm version](https://img.shields.io/npm/v/dsh-pdf-translate)](https://www.npmjs.com/package/dsh-pdf-translate)
[![license](https://img.shields.io/npm/l/dsh-pdf-translate)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/dsh-pdf-translate)](https://www.npmjs.com/package/dsh-pdf-translate)

DSH（DeepSeek Harness）插件：用用户自有的 DeepSeek（或任意 OpenAI 兼容 API）对**文本型 PDF** 进行全文翻译，输出保留版式、字体样式、图片与链接的**可编辑 PDF**（文本可选中、可复制）。

> 当前仅支持**文本型 PDF**（有文本层）。扫描版（需 OCR）不在 v1 范围。

## 功能

- 单任务最多翻译 50 页（超出报错提示分段处理；大书可分页段多次翻译）。
- 段落级翻译：保留段落区域与样式（字号/颜色/对齐）；代码块不翻译、原样保留。
- 输出 PDF 中**只有译文可选**：原文经 redaction 真正删除（非白块遮盖），图片/线稿/非链接注释保留。
- 术语表注入：JSON/TXT 导入，支持"禁止翻译"专名。
- 译文缓存（断点续传）：按 段落文本+语言对 哈希，中断后重跑只补缺失段落。
- 多语言对（默认中英互译）、OpenAI 兼容端点可配。
- API Key 由用户配置，`role('secret')` 保护，**绝不写入会话日志**。
- 设置卡片 zh/en 双语，随应用全局语言切换。

## 快速开始

```bash
# 1. 安装 Python worker 依赖（pymupdf + pytest；-ExecutionPolicy Bypass 因 Windows PowerShell 5.1 默认拦截脚本）
powershell -ExecutionPolicy Bypass -File scripts/install-worker.ps1

# 2. 安装 TS 依赖并构建
pnpm install
pnpm run build

# 3. 挂载到 DSH 桌面 profile（发布前可指向本地目录）
dsh plugin --profile desktop add "E:\Code\dsh-pdf-translate"

# 4. 重启 DSH Desktop → 设置 → 插件区 →「PDF 翻译」卡片填入 API Key → 保存

# 5. 让 agent 翻译，或直连 CLI：
node scripts/translate-cli.mjs <input.pdf> <outputDir> 1 20 en→zh
```

## 环境要求

| 组件 | 版本 |
|---|---|
| Node.js | ^22.19 \|\| >=24 |
| pnpm | 11.x |
| Python | 3.14（PyMuPDF 1.28.2 已验证） |
| DSH | 桌面版（Harness home `%USERPROFILE%\.dsh`） |

## 使用

### 工具调用

`translate_pdf` 工具（agent 可调用）：

| 参数 | 必填 | 说明 |
|---|---|---|
| `input` | ✅ | 输入 PDF 绝对路径 |
| `outputDir` | ✅ | 输出目录 |
| `pageStart` / `pageEnd` | 可选 | 页面范围（1-based），默认全文；**单次任务范围 ≤ 50 页**（大书可分页段多次翻译） |
| `langPair` | 可选 | 语言对，如 `en→zh`；默认取配置 |
| `termbase` | 可选 | 术语表文件路径（JSON/TXT） |

### 配置（设置卡片 / cordis.yml）

| 配置项 | 默认 | 说明 |
|---|---|---|
| `apiKey` | 空 | DeepSeek API Key（secret，不入日志） |
| `baseUrl` | `https://api.deepseek.com` | OpenAI 兼容端点 |
| `model` | `deepseek-chat` | 模型名 |
| `langPair` | `en→zh` | 默认语言对 |
| `concurrency` | 6 | 并发请求数（1-16） |
| `maxRetries` | 3 | 每请求最大重试（429/5xx/超时，指数退避 + `Retry-After`） |
| `timeoutMs` | 60000 | 单请求超时 |
| `termbasePath` | 空 | 默认术语表路径 |
| `pythonBin` | `python` | Python 解释器 |

设置卡片（DSH 桌面设置页 → 插件区）以 zh/en 双语渲染：文案经 `ctx.locale` 注册 `settings.pdfTranslate` 命名空间词典，跟随应用全局 Language 切换即时中英互换；视觉使用 `--dsw-*` 主题 token（明暗自动适配）。API Key 为 secret 角色：保存后不再回显值，显示为「已配置」。输入框带可编辑视觉标识（浅灰底色 + 可见边框 + 聚焦蓝环 + 每字段示例占位符）。

### 直连 CLI（不经 DSH 应用）

仓库内置两个脚本直接复用生产流水线（与 `translate_pdf` 工具完全同路径）：

```bash
# 干跑：只提取段落统计，不调用 API（预估段数/成本）
node scripts/extract-dryrun.mjs <input.pdf> [start0Based] [end0Based]

# 真实翻译（需要 DEEPSEEK_API_KEY 环境变量；与设置卡片同一字段）
node scripts/translate-cli.mjs <input.pdf> <outputDir> [pageStart1Based] [pageEnd1Based] [langPair]
```

产物：`<outputDir>/<书名>.<langPair>.pdf` + `<outputDir>/.translate-cache.json`（断点续传缓存，重跑同段落直接命中）。

## 术语表格式

JSON：

```json
[
  { "src": "API", "dst": "应用程序接口", "locked": false },
  { "src": "GPT", "dst": "GPT", "locked": true }
]
```

TXT（每行 `原文,译文`；`locked` 不支持）：

```
API,应用程序接口
```

`locked: true` 表示专名/标识符**保留原文不翻译**。

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│ DSH Cordis 插件（TypeScript）                                 │
│  translate_pdf 工具 → runPipeline（校验/编排/缓存/报告）        │
│    ├─ DeepSeek 客户端（并发池 × 批处理 × 重试/退避/取消）       │
│    └─ PdfWorker（spawn `python -m worker.main`，stdio 逐行 JSON）│
├──────────────────────────────────────────────────────────────┤
│ Python worker（仅依赖 PyMuPDF）                               │
│  textlayer  → 文本层检测（无文本层报错）                        │
│  extract    → 段落提取（列检测→聚类→分类→置信度降级）           │
│  rebuild    → 两阶段重建：redaction 删原文 → insert_textbox 写译文 │
└──────────────────────────────────────────────────────────────┘
```

**worker 协议**（stdio 逐行 JSON）：请求 `{"id","cmd","payload"}`；响应 `{"id","ok","result"|"error"}`；启动首行 `{"ready":true}`。

**关键设计**：
- 段落识别 = 规则聚类（列检测 + 行合并 + 列表项规则）+ 置信度降级（重叠检测）+ 提示词兜底（"不得合并/拆分段落"）。
- 重建 = **两阶段**：先一次性 redaction（`images/graphics=NONE, text=REMOVE`）删除本页全部原文，再统一 `insert_textbox` 按段落锚点写回（逐段「删→写」会让后段 redaction 误删前段已写译文）；几何由重建时重提取原文档按 id 匹配（载荷只传 `{id, text}`）。
- 性能：唯一瓶颈是 API 延迟 → 有界并发池（默认 6）+ 缓存续传 + 常驻 worker 进程。

## 目录结构

```
src/                    TS 插件
  types.ts              协议类型（与 worker JSON 镜像）
  translate/            分块器/提示词/DeepSeek 客户端/并发池/缓存
  worker.ts             Python worker 进程管理
  pipeline.ts           流水线编排
  tool.ts               translate_pdf 工具
  index.ts              apply 入口
  client/               设置卡片
worker/                 Python worker
  main.py               stdio 协议分发
  model.py              数据模型（协议唯一来源）
  extract.py            文本提取 + 段落识别
  rebuild.py            redaction + 写入
  tests/                pytest（41 个用例）
tools/pdf-render/       PDFium 渲染对比 QA 工具（C++，链接现有 pdfium.lib）
docs/superpowers/       规格 + 实施计划（内部开发文档）
```

## 测试

```bash
# Python worker（41 个用例：协议/提取/聚类/分类/置信度/黄金版式/重建）
python -m pytest worker/tests -q

# TS 模块（73 个用例：分块/提示词/客户端/并发池/缓存/流水线/工具/入口/设置卡片/jsdom 渲染/E2E）
pnpm exec vitest run

# 类型检查
pnpm exec tsc -p tsconfig.json --noEmit
```

## 发布到 DSH 插件市场

DSH Desktop 内置社区市场（目录源：DSH 1024Store / DSH Marketplace(qilewl.net) / dshfind）。目录条目 = GitHub 仓库元数据 + `dsh plugin --profile <name> add <npm包>` 部署命令；**可安装前提**：npm 官方 latest 稳定版本 + 有效的 `dsh.bundle.patch`。本仓库已做好发布前置：

- `package.json`：已声明 `dsh.bundle.patch: "cordis.patch.yml"`（插件进入 profile bundle 层）、`license: MIT`、`description`/`keywords`，无 `private`；`prepublishOnly` 自动构建。
- 发布流程：`npm login` → `pnpm publish --access public`；随后把仓库推送到 GitHub（公开，补 topics 分类），再到市场站点（qilewl.net 等）按其收录流程提交。
- **重复条目注意**：走市场/bundle 层安装后，不要再在 profile 补丁层保留同一条 `insert` 行（loader 树重复 id 会启动失败）。

## 已知限制（Known Limitations and Deferred Work）

- **仅文本型 PDF**：无文本层时明确报错；扫描版 OCR 不在 v1。
- **表格**：v1 按单元格几何独立成段（每格一个段落、独立翻译、按各自 bbox 写回）；`table:{row,col}` 元数据字段已声明但未填充（v2）。
- **下划线样式丢失**：提取层不产生 underline 信息（PyMuPDF dict 无此位），重建不保留下划线。
- **密集表格行合并**：行距过小（≤ ~25pt @12pt 字号）的段落可能被合并；由置信度降级缓解。
- **与 redaction 区域相交的链接注释会被删除**（pymupdf 1.28.2 行为）：已实现链接捕获-恢复。
- **单行超长译文横向溢出页外**：溢出链第 ③ 级对超长单行按行写入，超出页面右缘部分不可见（已标注 overflow 警告）。
- **批内请求合并**：当前每段落一次 API 调用（并发已达标）；批次合并为后续优化。
- **公式 LaTeX / 脚注对应**：v2。
- **复杂版式**（文本框重叠/旋转文字）：置信度降级为逐行翻译并标注。

## 开发说明

- **`import pymupdf as fitz` 是强制约定**：1.28.2 的 `fitz` shim 会在 import 时向 stdout 打印弃用警告，污染 stdio 行协议。
- 依赖策略：`@deepseek-ai/dsh-tools`/`dsh-settings` 的 `0.1.2-alpha.1` 仅在桌面应用安装（私有来源，无 .d.ts）；运行时经 `$DSH_HOME/profiles/node_modules` 回退解析到应用实例；开发期类型用注册表 `0.1.1-rc.2`（类型漂移已接受）。
- worker 必须用 `python -m worker.main`（cwd = 仓库根）启动——脚本形式 `python worker/main.py` 无法 `from worker import ...`。
- 所有代码改动需通过 `python -m pytest worker/tests -q` 与 `pnpm exec vitest run` 两套测试。

## QA 与实现状态

- 全量测试：41 Python + 73 TS 全绿；类型检查 exit 0。
- PDFium 渲染对比（`tools/pdf-render`）：原文/译文第 1 页渲染成功，墨水 bbox 左缘一致（x=145px=72pt），无重叠、无错位。
- 已修复的真实缺陷（均有回归测试）：
  - **段落 id 跨页碰撞**：extract 按页给段落 id 加 `page_index * 1_000_000` 偏移，E2E 逐页断言守卫。
  - **重叠段落译文被截断**：重建改为两阶段（先删全部原文、再统一写译文）。
  - **页数上限误伤大书**：`maxPages` 作用于翻译范围长度而非全书页数。

内部开发文档：`docs/superpowers/plans/2026-08-30-dsh-pdf-translate.md`（实施计划）、`docs/superpowers/specs/2026-08-30-dsh-pdf-translate-design.md`（设计规格）、`docs/HANDOFF.md`（交接说明）。
