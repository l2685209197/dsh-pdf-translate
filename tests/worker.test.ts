import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PdfWorker } from '../src/worker.js'

const script = fileURLToPath(new URL('./fake_worker.py', import.meta.url))
const repoRoot = dirname(dirname(script))

describe('PdfWorker', () => {
  it('spawn、发命令、收响应、关闭', async () => {
    const worker = await PdfWorker.start('python', ['-u', script], repoRoot)
    const info = await worker.command<{ pageCount: number; hasTextLayer: boolean }>('textlayer', { path: 'x.pdf' })
    expect(info.pageCount).toBe(3)
    expect(info.hasTextLayer).toBe(true)
    const rebuilt = await worker.command<{ warnings: unknown[] }>('rebuild', {})
    expect(rebuilt.warnings).toEqual([])
    await worker.dispose()
  })

  it('错误命令返回 ok:false 并抛错', async () => {
    const worker = await PdfWorker.start('python', ['-u', script], repoRoot)
    await expect(worker.command('nope', {})).rejects.toThrow(/unknown/)
    await worker.dispose()
  })
})
