import { describe, expect, it, vi } from 'vitest'
import { runPipeline } from '../src/pipeline.js'
import type { PdfWorker } from '../src/worker.js'
import type { DeepSeekClient } from '../src/translate/deepseek.js'
import type { TranslationCache } from '../src/translate/cache.js'

function fakeWorker(overrides: Partial<PdfWorker> = {}): PdfWorker {
  return {
    command: vi.fn(async (cmd: string) => {
      if (cmd === 'textlayer') return { pageCount: 2, hasTextLayer: true, pages: [] }
      if (cmd === 'extract') {
        return {
          pages: [
            { index: 0, paragraphs: [{ id: 0, bbox: [0, 0, 10, 10], firstLineAnchor: [0, 5], lines: [{ text: 'hello', bbox: [0, 0, 10, 10], origin: [0, 5], spans: [] }], type: 'body', readingOrder: 0, confidence: 1, table: null }] },
          ],
        }
      }
      if (cmd === 'rebuild') return { warnings: [] }
      throw new Error('unexpected')
    }),
    dispose: vi.fn(async () => {}),
  } as unknown as PdfWorker
}

function fakeClient(translation: string): DeepSeekClient {
  return {
    translateBatch: vi.fn(async () => ({
      translations: new Map([[0, translation]]),
      usage: { promptTokens: 5, completionTokens: 5 },
    })),
  } as unknown as DeepSeekClient
}

const emptyCache = { load: async () => {}, save: async () => {}, get: () => undefined, set: () => {}, key: () => 'k' } as unknown as TranslationCache

const baseOpts = {
  inputPath: 'a.pdf', outputPath: 'b.pdf', langPair: 'en→zh', termbase: [],
  config: { concurrency: 2, maxParagraphs: 8, maxChars: 3000, maxPages: 50 },
  worker: undefined as unknown as PdfWorker, client: undefined as unknown as DeepSeekClient,
  cache: emptyCache, pythonBin: 'python', workerScript: 'w.py',
  signal: new AbortController().signal,
}

describe('runPipeline', () => {
  it('校验无文本层时报错', async () => {
    const worker = fakeWorker()
    ;(worker.command as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => {
      if (cmd === 'textlayer') return { pageCount: 1, hasTextLayer: false, pages: [] }
      throw new Error('unexpected')
    })
    await expect(runPipeline({ ...baseOpts, worker, client: fakeClient('x') })).rejects.toThrow(/text layer/i)
  })

  it('校验页数超限', async () => {
    const worker = fakeWorker()
    ;(worker.command as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => {
      if (cmd === 'textlayer') return { pageCount: 60, hasTextLayer: true, pages: [] }
      throw new Error('unexpected')
    })
    await expect(runPipeline({ ...baseOpts, worker, client: fakeClient('x') })).rejects.toThrow(/50/i)
  })

  it('完整流程：提取→翻译→重建→报告', async () => {
    const worker = fakeWorker()
    const client = fakeClient('你好')
    const report = await runPipeline({ ...baseOpts, worker, client })
    expect(report.pagesTranslated).toBe(1)
    expect(report.paragraphs[0].ok).toBe(true)
    expect(worker.command).toHaveBeenCalledWith('rebuild', expect.objectContaining({ outputPath: 'b.pdf' }))
  })

  it('缓存命中跳过 API 调用', async () => {
    const worker = fakeWorker()
    const client = fakeClient('你好')
    const cache = {
      load: async () => {}, save: async () => {},
      get: () => 'cached 译文', set: () => {}, key: () => 'same-key',
    } as unknown as TranslationCache
    const report = await runPipeline({ ...baseOpts, worker, client, cache })
    expect(client.translateBatch).not.toHaveBeenCalled()
    expect(report.stats.cacheHits).toBe(1)
  })
})
