import type { Paragraph } from '../types.js'
import type { TranslationBatch } from './chunker.js'

export interface TermEntry {
  src: string
  dst: string
  locked: boolean // locked=true 表示禁止翻译（专名/代码标识符）
}

export interface PromptOptions {
  langPair: string
  termbase: TermEntry[]
}

export function buildSystemPrompt(opts: PromptOptions): string {
  const terms = opts.termbase
    .map(t => (t.locked ? `- ${t.src}（保留原文，不翻译）` : `- ${t.src} → ${t.dst}`))
    .join('\n')
  return [
    `你是专业文档翻译引擎。语言对：${opts.langPair}。`,
    '规则：',
    '1. 不得合并或拆分段落；每个段落独立翻译，保持段落边界。',
    '2. 保留原文的换行、缩进与列表结构。',
    '3. 代码、变量名、URL、数字保持不变。',
    '4. 术语表（优先遵守）：',
    terms || '（无）',
    '5. 仅返回 JSON 对象，键为段落 id（数字），值为译文。',
  ].join('\n')
}

export function buildUserMessage(batch: TranslationBatch): string {
  const items = batch.paragraphs.map(p => ({
    id: String(p.id),
    text: p.lines.map(l => l.text).join('\n'),
  }))
  return JSON.stringify(items)
}

export function parseBatchResponse(content: string, expectedIds: number[]): Map<number, string> {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const parsed = JSON.parse(cleaned) as Record<string, unknown>
  const result = new Map<number, string>()
  for (const id of expectedIds) {
    const value = parsed[String(id)]
    if (typeof value !== 'string') {
      throw new Error(`translation response missing id ${id}`)
    }
    result.set(id, value)
  }
  return result
}
