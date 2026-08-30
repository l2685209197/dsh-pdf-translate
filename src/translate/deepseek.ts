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
    let retryAfterMs = 0
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      // 调用方信号中止（如 exec.signal 取消）：立即抛错，绝不进入重试路径
      // （fetch 的 AbortError 消息会匹配 /abort/i → 误分类为 timeout 并重试）
      if (signal.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError')
      }
      if (attempt > 0) {
        const base = this.config.retryBaseMs ?? 500
        // 429 时按 Retry-After 退避（规格 §5.3），否则指数退避 + 抖动
        await new Promise(r => setTimeout(r, Math.max(base * 2 ** (attempt - 1) + Math.random() * 100, retryAfterMs)))
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
          // 读取错误体（保留 API 的错误详情供报告展示；同时释放 socket）
          const detail = await resp.text().catch(() => '')
          if (resp.status === 429) {
            const ra = Number(resp.headers.get('retry-after'))
            if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.max(retryAfterMs, ra * 1000)
          }
          lastError = new DeepSeekError(
            `http ${resp.status}${detail ? `: ${detail.trim().slice(0, 200)}` : ''}`,
            resp.status,
          )
          continue
        }
        if (resp.status === 401 || resp.status === 403) {
          throw new DeepSeekError(`auth failed: ${resp.status}`, resp.status)
        }
        if (!resp.ok) {
          throw new DeepSeekError(`http ${resp.status}`, resp.status)
        }
        let data: {
          choices?: { message?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        try {
          data = (await resp.json()) as typeof data
        } catch {
          throw new DeepSeekError('invalid response: body is not JSON')
        }
        const content = data.choices?.[0]?.message?.content
        if (content === undefined) {
          throw new DeepSeekError('empty response content')
        }
        let translations: Map<number, string>
        try {
          translations = parseBatchResponse(content, input.paragraphs.map(p => p.id))
        } catch (e) {
          // 解析失败归为 invalid-response（非网络错误；立即抛出不重试）
          throw new DeepSeekError(`invalid response: ${e instanceof Error ? e.message : String(e)}`)
        }
        return {
          translations,
          usage: {
            promptTokens: data.usage?.prompt_tokens ?? 0,
            completionTokens: data.usage?.completion_tokens ?? 0,
          },
        }
      } catch (e) {
        if (signal.aborted) {
          throw signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError')
        }
        lastError = e
        if (classifyError(e) !== 'rate-limit' && classifyError(e) !== 'server' && classifyError(e) !== 'timeout') {
          throw e
        }
      }
    }
    throw lastError
  }
}
