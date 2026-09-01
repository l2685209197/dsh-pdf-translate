/**
 * 设置卡片双语词典（settings.pdfTranslate 命名空间）。
 * zh 与 en 键集合必须一致（tests/client.test.ts 断言两者键集相同）。
 */
export interface PdfTranslateDict {
  title: string
  subtitle: string
  ariaLabel: string
  'group.connection': string
  'group.execution': string
  'field.apiKey': string
  'field.baseUrl': string
  'field.model': string
  'field.langPair': string
  'field.termbasePath': string
  'field.concurrency': string
  'field.maxRetries': string
  'field.timeoutMs': string
  'field.pythonBin': string
  save: string
  reset: string
  secretNote: string
  apiKeyConfigured: string
}

export const zhDict: PdfTranslateDict = {
  title: 'PDF 翻译',
  subtitle: '连接与执行配置。API Key 仅保存在本地，不会写入会话日志。',
  ariaLabel: 'PDF 翻译设置',
  'group.connection': '连接配置',
  'group.execution': '执行配置',
  'field.apiKey': 'API Key',
  'field.baseUrl': 'API 地址',
  'field.model': '模型',
  'field.langPair': '语言对',
  'field.termbasePath': '术语表路径',
  'field.concurrency': '并发数',
  'field.maxRetries': '最大重试',
  'field.timeoutMs': '请求超时(ms)',
  'field.pythonBin': 'Python 可执行文件',
  save: '保存',
  reset: '重置',
  secretNote: 'API Key 仅保存在本地配置，不会写入会话日志。',
  apiKeyConfigured: '已配置（不回显）',
}

export const enDict: PdfTranslateDict = {
  title: 'PDF Translate',
  subtitle: 'Connection and execution settings. The API key stays local and never enters session logs.',
  ariaLabel: 'PDF Translate settings',
  'group.connection': 'Connection',
  'group.execution': 'Execution',
  'field.apiKey': 'API Key',
  'field.baseUrl': 'API base URL',
  'field.model': 'Model',
  'field.langPair': 'Language pair',
  'field.termbasePath': 'Termbase path',
  'field.concurrency': 'Concurrency',
  'field.maxRetries': 'Max retries',
  'field.timeoutMs': 'Timeout (ms)',
  'field.pythonBin': 'Python executable',
  save: 'Save',
  reset: 'Reset',
  secretNote: 'The API key is stored locally only and never written to session logs.',
  apiKeyConfigured: 'Configured (not echoed)',
}
