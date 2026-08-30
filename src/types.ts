export interface Span {
  text: string
  bbox: [number, number, number, number]
  font: string
  size: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  origin: [number, number]
  mono: boolean
}

export interface Line {
  text: string
  bbox: [number, number, number, number]
  origin: [number, number]
  spans: Span[]
}

export type ParagraphType = 'body' | 'heading' | 'list-item' | 'code' | 'table-cell'

export interface Paragraph {
  id: number
  bbox: [number, number, number, number]
  firstLineAnchor: [number, number]
  lines: Line[]
  type: ParagraphType
  readingOrder: number
  confidence: number
  table: { row: number; col: number } | null
}

export interface TextLayerInfo {
  pageCount: number
  hasTextLayer: boolean
  pages: { index: number; charCount: number }[]
}

export interface ExtractResult {
  pages: { index: number; paragraphs: Paragraph[] }[]
}

export interface RebuildWarning {
  page: number
  paraId: number
  kind: 'overflow' | 'font-fallback' | 'empty'
  detail: string
}

export interface RebuildResult {
  warnings: RebuildWarning[]
}
