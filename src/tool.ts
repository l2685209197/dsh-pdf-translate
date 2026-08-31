import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { runPipeline, type PipelineReport } from './pipeline.js'
import { PdfWorker, workerSpawn, workerScriptPath } from './worker.js'
import { DeepSeekClient } from './translate/deepseek.js'
import { TranslationCache } from './translate/cache.js'
import { join } from 'node:path'

export interface ToolConfig {
  apiKey?: string
  baseUrl: string
  model: string
  langPair: string
  concurrency: number
  maxRetries: number
  timeoutMs: number
  termbasePath?: string
  pythonBin: string
}

export interface TranslateToolDeps {
  ctx: Context
  config: () => ToolConfig
}

export function defineTranslateTool(deps: TranslateToolDeps): ToolDefinition {
  const { ctx, config } = deps
  return defineTool({
    name: 'translate_pdf',
    description: 'Translate a text-based PDF into another language, preserving layout, fonts, images and links. Max 50 pages per task.',
    parameters: {
      input: { type: 'string', required: true, description: 'Absolute path of the input PDF' },
      outputDir: { type: 'string', required: true, description: 'Directory for the translated output PDF' },
      pageStart: { type: 'number', description: '1-based first page to translate' },
      pageEnd: { type: 'number', description: '1-based last page to translate' },
      langPair: { type: 'string', description: 'Language pair, e.g. en→zh; defaults to the configured pair' },
      termbase: { type: 'string', description: 'Optional termbase file path (JSON or TXT)' },
    },
    output: {
      // rc.2：output.schema 必须是 ValueSchemaSpec（对象级 required 改为属性级 required: true，
      // 对象节点必须显式声明 additionalProperties）。注册表会对 execute 返回值执行该校验且
      // additionalProperties:false 会强制拒绝未声明字段，因此这里声明 PipelineReport 的全部
      // 顶层字段；paragraphs/stats/failures 用 'json' 节点接受任意无损 JSON。
      schema: {
        type: 'object',
        properties: {
          outputPath: { type: 'string', required: true },
          pagesTranslated: { type: 'number', required: true },
          paragraphs: { type: 'json' },
          stats: { type: 'json' },
          failures: { type: 'json' },
          // RebuildWarning 是 interface（无隐式索引签名），不能赋给推断出的 JsonValue，
          // 因此 warnings 需要精确声明 items 形状（execute 返回 PipelineReport 才能通过类型检查）
          warnings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                paraId: { type: 'number' },
                kind: { type: 'string' },
                detail: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => {
        // schema 推断类型对复杂字段是 JsonValue，无法直接访问报告字段；运行时的 value
        // 就是完整 PipelineReport，此处收窄（as unknown 因 JsonValue 与数组类型不可比较）
        const report = value as unknown as PipelineReport
        const lines = [
          `翻译完成：${report.pagesTranslated} 页 → ${report.outputPath}`,
          `段落：${report.paragraphs.length}（失败 ${report.failures.length}，溢出 ${report.paragraphs.filter(p => p.overflow).length}）`,
          `API 调用 ${report.stats.apiCalls} 次，token ${report.stats.tokensIn}→${report.stats.tokensOut}，缓存命中 ${report.stats.cacheHits}，耗时 ${(report.stats.durationMs / 1000).toFixed(1)}s`,
        ]
        if (report.failures.length > 0) {
          lines.push('失败段落: ' + report.failures.map(f => `#${f.id}`).join(', '))
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const cfg = config()
      if (!existsSync(args.input)) {
        throw new Error(`no such file: ${args.input}`)
      }
      if (args.pageStart !== undefined && args.pageEnd !== undefined && args.pageStart > args.pageEnd) {
        throw new Error(`invalid page range ${args.pageStart}..${args.pageEnd}`)
      }
      const outputPath = join(args.outputDir, `${basenameWithoutExt(args.input)}.${cfg.langPair.replace('→', '-')}.pdf`)
      const cacheFile = join(args.outputDir, `.translate-cache.json`)

      const worker = await PdfWorker.start(cfg.pythonBin, workerSpawn(cfg.pythonBin).args, workerSpawn(cfg.pythonBin).cwd)
      try {
        const client = new DeepSeekClient({
          apiKey: cfg.apiKey ?? '',
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          timeoutMs: cfg.timeoutMs,
          maxRetries: cfg.maxRetries,
        })
        const cache = new TranslationCache(cacheFile)
        const termbase = await loadTermbase(args.termbase ?? cfg.termbasePath)
        return await runPipeline({
          inputPath: args.input,
          outputPath,
          pageStart: args.pageStart !== undefined ? args.pageStart - 1 : undefined,
          pageEnd: args.pageEnd !== undefined ? args.pageEnd - 1 : undefined,
          langPair: args.langPair ?? cfg.langPair,
          termbase,
          config: { concurrency: cfg.concurrency, maxParagraphs: 8, maxChars: 3000, maxPages: 50 },
          worker,
          client,
          cache,
          pythonBin: cfg.pythonBin,
          workerScript: workerScriptPath,
          signal: exec.signal, // 取消贯穿：exec.signal → pipeline → 客户端/worker
        })
      } finally {
        await worker.dispose()
      }
    },
  })
}

function basenameWithoutExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? 'output'
  return base.replace(/\.[^.]+$/, '')
}

async function loadTermbase(path: string | undefined): Promise<{ src: string; dst: string; locked: boolean }[]> {
  if (path === undefined) return []
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(path, 'utf8')
  if (path.endsWith('.json')) {
    const parsed = JSON.parse(raw) as { src?: string; dst?: string; locked?: boolean }[]
    return parsed.map(t => ({ src: t.src ?? '', dst: t.dst ?? '', locked: t.locked ?? false }))
  }
  return raw.split(/\r?\n/).filter(Boolean).map(line => {
    const [src = '', dst = ''] = line.split(/\t|,/).map(s => s.trim())
    return { src, dst, locked: false }
  })
}
