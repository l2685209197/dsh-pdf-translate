import { describe, expect, it } from 'vitest'
import { chunkParagraphs } from '../src/translate/chunker.js'
import type { Paragraph } from '../src/types.js'

const para = (id: number, text: string, type: Paragraph['type'] = 'body'): Paragraph => ({
  id,
  bbox: [0, 0, 100, 20],
  firstLineAnchor: [0, 10],
  lines: [{ text, bbox: [0, 0, 100, 20], origin: [0, 10], spans: [] }],
  type,
  readingOrder: id,
  confidence: 1,
  table: null,
})

describe('chunkParagraphs', () => {
  it('按 maxParagraphs 分批', () => {
    const paras = [para(0, 'a'), para(1, 'b'), para(2, 'c'), para(3, 'd')]
    const batches = chunkParagraphs(paras, { maxParagraphs: 2, maxChars: 1000 })
    expect(batches.map(b => b.paragraphs.map(p => p.id))).toEqual([[0, 1], [2, 3]])
  })

  it('按 maxChars 截断且不拆段', () => {
    const paras = [para(0, 'x'.repeat(60)), para(1, 'y'.repeat(60)), para(2, 'z'.repeat(60))]
    const batches = chunkParagraphs(paras, { maxParagraphs: 100, maxChars: 100 })
    expect(batches.length).toBe(3)
  })

  it('超大段落独占一批', () => {
    const big = para(0, 'b'.repeat(5000))
    const batches = chunkParagraphs([big], { maxParagraphs: 8, maxChars: 3000 })
    expect(batches).toHaveLength(1)
    expect(batches[0].paragraphs).toEqual([big])
  })

  it('代码段落标记 skip', () => {
    const code = para(0, 'code text', 'code')
    const batches = chunkParagraphs([code], { maxParagraphs: 8, maxChars: 3000 })
    expect(batches[0].skipIds).toEqual([0])
    // code 段落保留在 paragraphs 中：流水线按 id 原样写回（Task 23）
    expect(batches[0].paragraphs).toEqual([code])
  })
})
