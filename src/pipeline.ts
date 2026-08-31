import type { RebuildResult, RebuildWarning, TextLayerInfo, Paragraph } from './types.js'
import type { PdfWorker } from './worker.js'
import type { DeepSeekClient } from './translate/deepseek.js'
import type { TranslationCache } from './translate/cache.js'
import type { TermEntry } from './translate/prompts.js'
import { chunkParagraphs, type ChunkRule } from './translate/chunker.js'
import { buildSystemPrompt } from './translate/prompts.js'
import { mapWithConcurrency } from './translate/concurrency.js'

export interface PipelineConfig extends ChunkRule {
  concurrency: number
  maxPages: number
}

export interface PipelineOptions {
  inputPath: string
  outputPath: string
  pageStart?: number
  pageEnd?: number
  langPair: string
  termbase: TermEntry[]
  config: PipelineConfig
  worker: PdfWorker
  client: DeepSeekClient
  cache: TranslationCache
  pythonBin: string
  workerScript: string
  signal: AbortSignal // 取消信号（Task 24 传 exec.signal）：中止后剩余批次跳过、在途请求被客户端中止
  onProgress?: (p: { stage: string; detail: string }) => void
}

export interface PipelineReport {
  outputPath: string
  pagesTranslated: number
  paragraphs: { id: number; ok: boolean; skipped: boolean; overflow: boolean }[]
  stats: { apiCalls: number; tokensIn: number; tokensOut: number; durationMs: number; cacheHits: number }
  failures: { id: number; reason: string }[]
  warnings: RebuildWarning[]
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const started = Date.now()
  const { worker, client, cache, config } = opts
  await cache.load()

  const textInfo = await worker.command<TextLayerInfo>('textlayer', { path: opts.inputPath })
  if (!textInfo.hasTextLayer) {
    throw new Error('no text layer: 该 PDF 无文本层（扫描版不在支持范围）')
  }
  if (textInfo.pageCount > config.maxPages) {
    throw new Error(`page count ${textInfo.pageCount} exceeds limit ${config.maxPages}`)
  }
  const start = opts.pageStart ?? 0
  const end = Math.min(opts.pageEnd ?? textInfo.pageCount - 1, textInfo.pageCount - 1)
  if (start > end) throw new Error(`invalid page range: ${start}..${end}`)

  opts.onProgress?.({ stage: 'extract', detail: `${start}..${end}` })
  const extracted = await worker.command<{ pages: { index: number; paragraphs: Paragraph[] }[] }>(
    'extract', { path: opts.inputPath, start, end },
  )
  const paragraphs = extracted.pages.flatMap(p => p.paragraphs)

  const batches = chunkParagraphs(paragraphs, config)
  let apiCalls = 0
  let tokensIn = 0
  let tokensOut = 0
  let cacheHits = 0
  const failures: { id: number; reason: string }[] = []
  const translations = new Map<number, string>()
  const overflowIds = new Set<number>()

  const systemPrompt = buildSystemPrompt({ langPair: opts.langPair, termbase: opts.termbase })

  await mapWithConcurrency(batches, config.concurrency, async batch => {
    for (const p of batch.paragraphs) {
      // 取消：中止后剩余段落一律回退原文，不再发起请求
      if (opts.signal.aborted) {
        translations.set(p.id, p.lines.map(l => l.text).join('\n'))
        continue
      }
      if (p.type === 'code') {
        translations.set(p.id, p.lines.map(l => l.text).join('\n'))
        continue
      }
      const text = p.lines.map(l => l.text).join('\n')
      const key = cache.key(text, opts.langPair)
      const cached = cache.get(key)
      if (cached !== undefined) {
        translations.set(p.id, cached)
        cacheHits += 1
        continue
      }
      apiCalls += 1
      try {
        const { translations: batchMap, usage } = await client.translateBatch(
          { paragraphs: [{ id: p.id, text }], systemPrompt }, opts.signal,
        )
        tokensIn += usage.promptTokens
        tokensOut += usage.completionTokens
        const translated = batchMap.get(p.id)
        if (translated === undefined) throw new Error(`missing translation for ${p.id}`)
        translations.set(p.id, translated)
        cache.set(key, translated)
      } catch (e) {
        failures.push({ id: p.id, reason: e instanceof Error ? e.message : String(e) })
        translations.set(p.id, text) // 失败段回退原文，保证输出完整
      }
    }
  })

  await cache.save()

  const rebuildPayload = {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
    pages: extracted.pages.map(page => ({
      index: page.index,
      paragraphs: page.paragraphs.map(p => ({ id: p.id, text: translations.get(p.id) ?? '' })),
    })),
  }
  const rebuilt = await worker.command<RebuildResult>('rebuild', rebuildPayload)
  for (const w of rebuilt.warnings) {
    if (w.kind === 'overflow') overflowIds.add(w.paraId)
  }

  return {
    outputPath: opts.outputPath,
    pagesTranslated: extracted.pages.length,
    paragraphs: paragraphs.map(p => ({
      id: p.id,
      ok: !failures.some(f => f.id === p.id),
      skipped: p.type === 'code',
      overflow: overflowIds.has(p.id),
    })),
    stats: { apiCalls, tokensIn, tokensOut, durationMs: Date.now() - started, cacheHits },
    failures,
    warnings: rebuilt.warnings,
  }
}
