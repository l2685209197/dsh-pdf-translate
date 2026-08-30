import type { Paragraph } from '../types.js'

export interface ChunkRule {
  maxParagraphs: number
  maxChars: number
}

export interface TranslationBatch {
  paragraphs: Paragraph[]
  skipIds: number[] // code 段落 id：不翻译，原样写回
}

export function chunkParagraphs(paragraphs: Paragraph[], rule: ChunkRule): TranslationBatch[] {
  const batches: TranslationBatch[] = []
  let current: Paragraph[] = []
  let chars = 0

  const flush = (): void => {
    if (current.length > 0) {
      batches.push({ paragraphs: current, skipIds: current.filter(p => p.type === 'code').map(p => p.id) })
      current = []
      chars = 0
    }
  }

  for (const p of paragraphs) {
    const text = p.lines.map(l => l.text).join('\n')
    if (p.type === 'code') {
      // 代码段：独立一批（skip），不占用正文批次
      batches.push({ paragraphs: [], skipIds: [p.id] })
      continue
    }
    if (current.length > 0 && (current.length >= rule.maxParagraphs || chars + text.length > rule.maxChars)) {
      flush()
    }
    current.push(p)
    chars += text.length
  }
  flush()
  return batches
}
