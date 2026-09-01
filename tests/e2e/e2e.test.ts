import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterAll } from 'vitest'
import { PdfWorker, workerScriptPath, workerSpawn } from '../../src/worker.js'
import { DeepSeekClient } from '../../src/translate/deepseek.js'
import { TranslationCache } from '../../src/translate/cache.js'
import { runPipeline } from '../../src/pipeline.js'
import { startMockDeepSeek } from './mock-server.js'

describe('e2e: 真实 worker + mock DeepSeek', () => {
  const holder: { server?: { close: () => void } } = {}
  afterAll(() => { holder.server?.close() })

  it('完整翻译一个生成 PDF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdf-e2e-'))
    const pdfPath = join(dir, 'src.pdf')
    const { server, url, calls } = await startMockDeepSeek()
    holder.server = server

    // 用 Python 生成 3 页 PDF（每页一段）
    const worker0 = await PdfWorker.start('python', workerSpawn('python').args, workerSpawn('python').cwd)
    await worker0.dispose() // 确保真实 worker 可启动（start 等待 "ready"；rebuild 需 inputPath 不能空 payload 冒烟）
    const { execFileSync } = await import('node:child_process')
    const genScript = `
import pymupdf as fitz, sys
doc = fitz.open()
for i in range(3):
    page = doc.new_page()
    page.insert_text((72, 100), f"page {i} content", fontsize=12)
doc.save(sys.argv[1])
`
    await writeFile(join(dir, 'gen.py'), genScript)
    execFileSync('python', [join(dir, 'gen.py'), pdfPath])

    const worker = await PdfWorker.start('python', workerSpawn('python').args, workerSpawn('python').cwd)
    try {
      const client = new DeepSeekClient(
        { apiKey: 'test-key', baseUrl: url, model: 'mock', timeoutMs: 5000, maxRetries: 0 },
        fetch,
      )
      const cache = new TranslationCache(join(dir, 'cache.json'))
      const report = await runPipeline({
        inputPath: pdfPath,
        outputPath: join(dir, 'out.pdf'),
        langPair: 'en→zh',
        termbase: [],
        config: { concurrency: 3, maxParagraphs: 8, maxChars: 3000, maxPages: 50 },
        worker, client, cache,
        pythonBin: 'python',
        workerScript: workerScriptPath,
        signal: new AbortController().signal, // PipelineOptions.signal 必填（Task 23）
      })
      expect(report.pagesTranslated).toBe(3)
      expect(report.failures).toEqual([])
      expect(calls.length).toBeGreaterThan(0)
      // 输出 PDF 存在且文本可提取、含译文标记
      const { readFile } = await import('node:fs/promises')
      const outBytes = await readFile(join(dir, 'out.pdf'))
      expect(outBytes.length).toBeGreaterThan(0)
      const { execFileSync: exec } = await import('node:child_process')
      const check = exec('python', ['-c',
        `import pymupdf as fitz,sys; d=fitz.open(sys.argv[1]); t="".join(p.get_text("text") for p in d); print(t)`,
        join(dir, 'out.pdf')]).toString()
      // 逐页断言译文归属（Task 29 QA 发现的回归：段落 id 曾按页局部编号、
      // translations 映射跨页碰撞，导致每页都写入最后一页的译文）
      for (let i = 0; i < 3; i += 1) {
        expect(check).toContain(`[TR] page ${i} content`)
      }
    } finally {
      await worker.dispose()
    }
  }, 60000)
})
