# dsh-pdf-translate

DSH（DeepSeek Harness）插件：用用户自有的 DeepSeek（或任意 OpenAI 兼容 API）对**文本型 PDF** 进行全文翻译，输出保留版式、字体样式、图片与链接的**可编辑 PDF**（文本可选中、可复制）。

## 功能

- 单任务最多翻译 50 页（超出报错提示分段处理）。
- 段落级翻译：保留段落区域与样式（字号/颜色/对齐）；代码块不翻译、原样保留。
- 输出 PDF 中**只有译文可选**：原文经 redaction 真正删除（非白块遮盖），图片/线稿/非链接注释保留。
- 术语表注入：JSON/TXT 导入，支持"禁止翻译"专名。
- 译文缓存（断点续传）：按 段落文本+语言对 哈希，中断后重跑只补缺失段落。
- 多语言对（默认中英互译）、OpenAI 兼容端点可配。
- API Key 由用户配置，`role('secret')` 保护，**绝不写入会话日志**。

> 当前仅支持**文本型 PDF**（有文本层）。扫描版（需 OCR）不在 v1 范围。

## 当前实施状态（2026-08-30）

| 阶段 | 任务 | 状态 |
|---|---|---|
| 仓库脚手架 | Task 1-3（package.json/tsconfig/vitest/pytest/pymupdf/协议数据模型） | ✅ 完成 |
| worker 协议与提取 | Task 4-11（stdio 协议、文本层检测、行/span 归一化、列检测、段落聚类、分类、置信度降级、extract 命令 + 6 类黄金版式精确率/召回率测试，全部 1.000） | ✅ 完成 |
| TS 翻译模块 | Task 12-16（协议类型、分块器、提示词/解析、DeepSeek 客户端、并发池、译文缓存） | ✅ 完成 |
| Python 重建 | Task 17-21（redaction 覆盖、几何按 id 匹配、字体回退、溢出三级链、链接捕获-恢复、代码直写） | ✅ 完成 |
| 流水线/工具 | Task 22-23（worker 进程管理、流水线编排） | ✅ 完成 |
| 工具/集成 | Task 24-26（translate_pdf 工具、apply 入口、设置卡片 + esbuild 构建） | ✅ 完成 |
| 挂载/安装 | Task 27（挂载配置、install-worker.ps1、README 完善；桌面 profile 已 link 安装，激活行待确认后应用） | ✅ 完成 |
| E2E/QA | Task 28-29（mock DeepSeek E2E 全流程、PDFium 渲染对比 QA 工具；QA 发现并修复段落 id 跨页碰撞缺陷） | ✅ 完成 |

实施计划见 `docs/superpowers/plans/2026-08-30-dsh-pdf-translate.md`；设计规格见 `docs/superpowers/specs/2026-08-30-dsh-pdf-translate-design.md`；继续开发的交接说明见 `docs/HANDOFF.md`。

## 环境要求

| 组件 | 版本 |
|---|---|
| Node.js | ^22.19 \|\| >=24（本机 24.16.0） |
| pnpm | 11.x（本机 11.8.0） |
| Python | 3.14（PyMuPDF 1.28.2 已验证） |
| DSH | 桌面版（`dsh` CLI 0.1.2-alpha.1，Harness home `%USERPROFILE%\.dsh`） |

## 安装

```bash
# 1. 安装 Python worker 依赖（pymupdf + pytest；-ExecutionPolicy Bypass 因 Windows PowerShell 5.1 默认拦截脚本）
powershell -ExecutionPolicy Bypass -File scripts/install-worker.ps1

# 2. 安装 TS 依赖并构建
pnpm install
pnpm run build

# 3. 挂载到 DSH 桌面 profile（可选，集成阶段）
dsh plugin --profile desktop add "E:\Code\dsh-pdf-translate"
```

挂载：把 `cordis.patch.yml` 中的 insert 行加入 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`（桌面实例 `patchReload: live`，即时生效）。

## 使用

### 工具调用

`translate_pdf` 工具（agent 可调用；集成阶段完成前可用单元测试/直连脚本验证）：

| 参数 | 必填 | 说明 |
|---|---|---|
| `input` | ✅ | 输入 PDF 绝对路径 |
| `outputDir` | ✅ | 输出目录 |
| `pageStart` / `pageEnd` | 可选 | 页面范围（1-based），默认全文；校验 ≤ 50 页 |
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
│  rebuild    → redaction 删原文 + insert_textbox 写译文         │
└──────────────────────────────────────────────────────────────┘
```

**worker 协议**（stdio 逐行 JSON）：请求 `{"id","cmd","payload"}`；响应 `{"id","ok","result"|"error"}`；启动首行 `{"ready":true}`。字段契约见计划头部与 `src/types.ts` / `worker/model.py`。

**关键设计**：
- 段落识别 = 规则聚类（列检测 + 行合并 + 列表项规则）+ 置信度降级（重叠检测）+ 提示词兜底（"不得合并/拆分段落"）。
- 重建 = redaction（`images/graphics=NONE, text=REMOVE`）真正删除原文 → `insert_textbox` 按段落锚点写入；几何由重建时重提取原文档按 id 匹配（载荷只传 `{id, text}`）。
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
  tests/                pytest（40 个用例）
tools/pdf-render/       PDFium 渲染 QA 工具（待 Task 29）
docs/superpowers/       规格 + 实施计划
```

## 测试

```bash
# Python worker（40 个用例：协议/提取/聚类/分类/置信度/黄金版式/重建）
python -m pytest worker/tests -q

# TS 模块（63 个用例：分块/提示词/客户端/并发池/缓存/流水线/工具/入口/设置卡片）
pnpm exec vitest run

# 类型检查
pnpm exec tsc -p tsconfig.json --noEmit
```

## 已知限制（Known Limitations and Deferred Work）

- **仅文本型 PDF**：无文本层时明确报错；扫描版 OCR 不在 v1。
- **表格**：v1 按单元格几何独立成段（每格一个段落、独立翻译、按各自 bbox 写回）；`table:{row,col}` 元数据字段已声明但未填充（v2）。
- **下划线样式丢失**：提取层不产生 underline 信息（PyMuPDF dict 无此位），重建不保留下划线。
- **密集表格行合并**：行距过小（≤ ~25pt @12pt 字号）的段落可能被合并；由置信度降级与 QA 阶段调参缓解。
- **与 redaction 区域相交的链接注释会被删除**（pymupdf 1.28.2 行为）：Task 21 实现链接捕获-恢复前，相交链接会丢失。
- **单行超长译文横向溢出页外**：溢出链第 ③ 级对超长单行按行写入，超出页面右缘部分不可见（已标注 overflow 警告；超长段落建议人工检查）。
- **批内请求合并**：当前每段落一次 API 调用（并发已达标）；批次合并为后续优化。
- **公式 LaTeX / 脚注对应**：v2。
- **复杂版式**（文本框重叠/旋转文字）：置信度降级为逐行翻译并标注；QA 阶段评估 ML 布局模型。

## 开发说明

- **`import pymupdf as fitz` 是强制约定**：1.28.2 的 `fitz` shim 会在 import 时向 stdout 打印弃用警告，污染 stdio 行协议。
- 依赖策略：`@deepseek-ai/dsh-tools`/`dsh-settings` 的 `0.1.2-alpha.1` 仅在桌面应用安装（私有来源，无 .d.ts）；运行时经 `$DSH_HOME/profiles/node_modules` 回退解析到应用实例；开发期类型用注册表 `0.1.1-rc.2`（类型漂移已接受）。
- worker 必须用 `python -m worker.main`（cwd = 仓库根）启动——脚本形式 `python worker/main.py` 无法 `from worker import ...`。
- 所有代码改动需通过 `python -m pytest worker/tests -q` 与 `pnpm exec vitest run` 两套测试。

## 路线图（Task 18-29）

1. **重建深化**：字体解析与回退（CJK → 系统字体/内置 china-s）、溢出三级链（微缩字号→放宽行距→区域外溢标注）、代码直写、链接捕获-恢复。
2. **流水线**：worker 进程管理、校验→提取→翻译→重建→报告、translate_pdf 工具。
3. **集成**：apply 入口（工具注册 + 设置命名空间）、设置卡片（client 半侧）、挂载到桌面 profile、README 完善。
4. **E2E 与 QA**：mock DeepSeek 全流程、PDFium 渲染原文/译文对比。

## QA 记录（Task 29：PDFium 渲染对比）

**样例**：Task 28 E2E 产物（`tests/e2e` 的 mock DeepSeek 全流程输出）——`src.pdf`（3 页，每页一段 `page N content`，12pt Helvetica，插入点 (72,100)）与 `out.pdf`（译文版）。

**冒烟命令**（scale 2.0 → 每页 1190×1684px）：

```bash
tools/pdf-render/build/Release/pdf_render.exe <input.pdf> <outdir> 1 1 2.0
```

**结论**（像素级墨水 bbox 统计 + PDF 文本层比对）：

- ✅ 工具可用：原文/译文第 1 页均渲染成功，`page_1.bmp` 8,015,894 B（1190×1684、32bpp BGRA、自下而上行序翻转正确，与页尺寸精确一致）。
- ✅ 文本位置：两页墨水 bbox 左缘均为 x=145px（=72pt，与 PDF 文本层 span 左缘一致），纵向同一条带（y 相差 ≤2px，对应译文 +1pt 基线差异）；译文因 `[TR] ` 前缀横向更宽（302→354px）。无重叠、无错位，页面几何保持一致。
- ➖ 图片保留：本样例无图片，此项 N/A（工具以 `FPDF_ANNOT` 渲染，图片/注释路径未覆盖）。
- ⚠️ **发现并已修复 Task 28 E2E 产物内容缺陷**：`out.pdf` 三页曾全部为 `[TR] page 2 content`（每页段落均写入最后一页段落的译文）。**根因**：段落 id 按页局部编号（每页从 0 开始），TS 流水线 `translations` 映射按裸 id 键控 → 跨页碰撞。**修复**：`worker/extract.py` 的 `_paragraphs_of_page` 给 id 加 `page_index * 1_000_000` 偏移（extract 与 rebuild 共用此函数，两侧一致）；`tests/e2e/e2e.test.ts` 强化为逐页断言 `[TR] page N content`（旧代码下必失败）。修复后 3 页译文归属正确，E2E 与全量测试（40 Python + 64 TS）全绿。

