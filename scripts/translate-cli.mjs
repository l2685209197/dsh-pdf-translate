// 直连 CLI：不经过 Cordis 上下文，直接复用生产流水线（与 src/tool.ts 完全相同的数据路径）。
// 用于在仓库外快速调用翻译（例如本机跑书页翻译），或作为工具注册前的调试入口。
//
// 用法:
//   node scripts/translate-cli.mjs <input.pdf> <outputDir> [pageStart] [pageEnd] [langPair]
//   pageStart/pageEnd 为 1-based 页码；langPair 如 en→zh（默认取 PDF_LANG_PAIR）
//
// 环境变量:
//   DEEPSEEK_API_KEY   必填。API Key（与设置卡片同一字段）
//   DEEPSEEK_BASE_URL  可选，默认 https://api.deepseek.com
//   DEEPSEEK_MODEL     可选，默认 deepseek-chat
//   PDF_LANG_PAIR      可选，默认 en→zh
//   PDF_CONCURRENCY    可选，默认 6
//   PDF_MAX_RETRIES    可选，默认 3
//   PDF_TIMEOUT_MS     可选，默认 60000
//   PDF_PYTHON_BIN     可选，默认 python
//
// 产物: <outputDir>/<书名>.<langPair 的 → 换成 ->>.pdf + <outputDir>/.translate-cache.json（续传缓存）
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

const { PdfWorker, workerSpawn, workerScriptPath } = await import('../lib/worker.js')
const { DeepSeekClient } = await import('../lib/translate/deepseek.js')
const { TranslationCache } = await import('../lib/translate/cache.js')
const { runPipeline } = await import('../lib/pipeline.js')

const [input, outputDir, pageStartRaw, pageEndRaw, langPairRaw] = process.argv.slice(2)
if (!input || !outputDir) {
  console.error('usage: node scripts/translate-cli.mjs <input.pdf> <outputDir> [pageStart] [pageEnd] [langPair]')
  process.exit(2)
}
if (!existsSync(input)) {
  console.error(`no such file: ${input}`)
  process.exit(2)
}
const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY 环境变量未设置（与设置卡片同一字段）')
  process.exit(2)
}
const cfg = {
  apiKey,
  baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
  langPair: langPairRaw ?? process.env.PDF_LANG_PAIR ?? 'en→zh',
  concurrency: Number(process.env.PDF_CONCURRENCY ?? 6),
  maxRetries: Number(process.env.PDF_MAX_RETRIES ?? 3),
  timeoutMs: Number(process.env.PDF_TIMEOUT_MS ?? 60000),
  pythonBin: process.env.PDF_PYTHON_BIN ?? 'python',
}
const pageStart = pageStartRaw === undefined ? undefined : Number(pageStartRaw) - 1
const pageEnd = pageEndRaw === undefined ? undefined : Number(pageEndRaw) - 1

const outputPath = join(outputDir, `${basename(input).replace(/\.[^.]+$/, '')}.${cfg.langPair.replace('→', '-')}.pdf`)
const cacheFile = join(outputDir, '.translate-cache.json')

console.log(`input:   ${input}`)
console.log(`range:   ${pageStart === undefined ? 'all' : pageStart + 1}..${pageEnd === undefined ? 'last' : pageEnd + 1}`)
console.log(`lang:    ${cfg.langPair}`)
console.log(`output:  ${outputPath}`)

const worker = await PdfWorker.start(cfg.pythonBin, workerSpawn(cfg.pythonBin).args, workerSpawn(cfg.pythonBin).cwd)
try {
  const client = new DeepSeekClient({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
  })
  const cache = new TranslationCache(cacheFile)
  const report = await runPipeline({
    inputPath: input,
    outputPath,
    pageStart,
    pageEnd,
    langPair: cfg.langPair,
    termbase: [],
    config: { concurrency: cfg.concurrency, maxParagraphs: 8, maxChars: 3000, maxPages: 50 },
    worker,
    client,
    cache,
    pythonBin: cfg.pythonBin,
    workerScript: workerScriptPath,
    signal: new AbortController().signal,
    onProgress: (p) => console.log(`[progress] ${p.stage} ${p.detail}`),
  })
  console.log('--- 翻译报告 ---')
  console.log(`输出: ${report.outputPath}`)
  console.log(`页面: ${report.pagesTranslated} 页；段落 ${report.paragraphs.length}（失败 ${report.failures.length}，溢出 ${report.paragraphs.filter(p => p.overflow).length}，代码跳过 ${report.paragraphs.filter(p => p.skipped).length}）`)
  console.log(`API 调用 ${report.stats.apiCalls} 次，token ${report.stats.tokensIn}→${report.stats.tokensOut}，缓存命中 ${report.stats.cacheHits}，耗时 ${(report.stats.durationMs / 1000).toFixed(1)}s`)
  for (const f of report.failures) console.log(`失败段落 #${f.id}: ${f.reason}`)
  for (const w of report.warnings) console.log(`警告 [${w.kind}] 页${w.page} 段${w.paraId}: ${w.detail}`)
  if (report.failures.length > 0) process.exitCode = 1
} finally {
  await worker.dispose()
}
