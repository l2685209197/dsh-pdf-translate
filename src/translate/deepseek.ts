import { parseBatchResponse } from './prompts.js'

export type ErrorKind = 'rate-limit' | 'server' | 'timeout' | 'auth' | 'network' | 'invalid-response'

export class DeepSeekError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DeepSeekError'
  }
}

export function classifyError(e: unknown): ErrorKind {
  if (e instanceof DeepSeekError) {
    if (e.status === 429) return 'rate-limit'
    if (e.status === 401 || e.status === 403) return 'auth'
    if (e.status !== undefined && e.status >= 500) return 'server'
    return 'invalid-response'
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/timeout|abort/i.test(msg)) return 'timeout'
  return 'network'
}

export interface DeepSeekConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxRetries: number
  retryBaseMs?: number
}

export interface BatchInput {
  paragraphs: { id: number; text: string }[]
  systemPrompt?: string
}

export interface BatchOutput {
  translations: Map<number, string>
  usage: { promptTokens: number; completionTokens: number }
}

export class DeepSeekClient {
  constructor(
    private readonly config: DeepSeekConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async translateBatch(input: BatchInput, signal: AbortSignal): Promise<BatchOutput> {
    const { apiKey, baseUrl, model, timeoutMs, maxRetries } = this.config
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = {
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt ?? '你是文档翻译引擎。仅返回 JSON，键为段落 id（数字），值为译文。' },
        { role: 'user', content: JSON.stringify(input.paragraphs.map(p => ({ id: p.id, text: p.text }))) },
      ],
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        const base = this.config.retryBaseMs ?? 500
        await new Promise(r => setTimeout(r, base * 2 ** (attempt - 1) + Math.random() * 100))
      }
      try {
        // 超时由客户端计时器强制（mock/真实 fetch 均生效）：
        // - 计时器先 reject 确定性超时错误（消息含 timeout，classifyError 归为 timeout 可重试）
        // - 随后 abort 底层请求，避免真实 fetch 悬挂（fetch 的拒绝已被 race 消化）
        const controller = new AbortController()
        const timeoutError = new Error(`request timeout after ${timeoutMs}ms`)
        let timer: ReturnType<typeof setTimeout> | undefined
        let resp: Response
        try {
          resp = await Promise.race([
            this.fetchImpl(url, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
              signal: AbortSignal.any([signal, controller.signal]),
            }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(timeoutError)
                controller.abort()
              }, timeoutMs)
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
        if (resp.status === 429 || resp.status >= 500) {
          lastError = new DeepSeekError(`http ${resp.status}`, resp.status)
          continue
        }
        if (resp.status === 401 || resp.status === 403) {
          throw new DeepSeekError(`auth failed: ${resp.status}`, resp.status)
        }
        if (!resp.ok) {
          throw new DeepSeekError(`http ${resp.status}`, resp.status)
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        const content = data.choices?.[0]?.message?.content
        if (content === undefined) {
          throw new DeepSeekError('empty response content')
        }
        const translations = parseBatchResponse(content, input.paragraphs.map(p => p.id))
        return {
          translations,
          usage: {
            promptTokens: data.usage?.prompt_tokens ?? 0,
            completionTokens: data.usage?.completion_tokens ?? 0,
          },
        }
      } catch (e) {
        lastError = e
        if (classifyError(e) !== 'rate-limit' && classifyError(e) !== 'server' && classifyError(e) !== 'timeout') {
          throw e
        }
      }
    }
    throw lastError
  }
}
