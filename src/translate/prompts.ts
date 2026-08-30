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
    .map(t => {
      // 术语表内容换行会破坏编号规则列表/伪造规则，渲染前压平
      const src = t.src.replace(/[\r\n]+/g, ' ')
      const dst = t.dst.replace(/[\r\n]+/g, ' ')
      return t.locked ? `- ${src}（保留原文，不翻译）` : `- ${src} → ${dst}`
    })
    .join('\n')
  return [
    `你是专业文档翻译引擎。语言对：${opts.langPair}。`,
    '规则：',
    '1. 不得合并或拆分段落；每个段落独立翻译，保持段落边界。',
    '2. 保留原文的换行、缩进与列表结构。',
    '3. 代码、变量名、URL、数字保持不变。',
    '4. 术语表（优先遵守）：',
    terms || '（无）',
    '5. 仅返回 JSON 对象，键为段落 id（字符串，如 "3"），值为译文。',
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
  const parsed = JSON.parse(cleaned) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('translation response is not a JSON object')
  }
  const obj = parsed as Record<string, unknown>
  const result = new Map<number, string>()
  for (const id of expectedIds) {
    const key = String(id)
    if (!(key in obj)) {
      throw new Error(`translation response missing id ${id}`)
    }
    const value = obj[key]
    if (typeof value !== 'string') {
      throw new Error(`translation response invalid value for id ${id}`)
    }
    result.set(id, value)
  }
  return result
}
