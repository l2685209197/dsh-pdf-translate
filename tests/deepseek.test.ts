import { describe, expect, it, vi } from 'vitest'
import { DeepSeekClient, classifyError, DeepSeekError } from '../src/translate/deepseek.js'

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {})) as unknown as typeof fetch
}

const batch = {
  paragraphs: [
    { id: 1, text: 'hello' },
    { id: 2, text: 'world' },
  ],
}

describe('classifyError', () => {
  it('429 → rate-limit', () => {
    const e = new DeepSeekError('rate limited', 429)
    expect(classifyError(e)).toBe('rate-limit')
  })
  it('5xx → server', () => {
    expect(classifyError(new DeepSeekError('boom', 503))).toBe('server')
  })
  it('网络错误 → network', () => {
    expect(classifyError(new Error('fetch failed'))).toBe('network')
  })
})

describe('DeepSeekClient', () => {
  it('成功翻译并解析响应', async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ 1: '你好', 2: '世界' }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 8 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', timeoutMs: 5000, maxRetries: 0 }, fetchImpl)
    const { translations, usage } = await client.translateBatch(batch, new AbortController().signal)
    expect(translations.get(1)).toBe('你好')
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 8 })
  })

  it('429 时按 maxRetries 重试后成功', async () => {
    let calls = 0
    const fetchImpl = mockFetch(async () => {
      calls += 1
      if (calls === 1) return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"ok"}' } }] }), { status: 200 })
    })
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 5000, maxRetries: 2, retryBaseMs: 1 }, fetchImpl)
    const { translations } = await client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, new AbortController().signal)
    expect(translations.get(1)).toBe('ok')
    expect(calls).toBe(2)
  })

  it('超时抛 DeepSeekError(timeout)', async () => {
    const fetchImpl = mockFetch(async () => {
      await new Promise(r => setTimeout(r, 200))
      return new Response('late', { status: 200 })
    })
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 10, maxRetries: 0 }, fetchImpl)
    await expect(client.translateBatch(batch, new AbortController().signal)).rejects.toThrow(/timeout/i)
  })

  it('缺少响应 id 报 invalid-response', async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }),
    )
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 5000, maxRetries: 0 }, fetchImpl)
    await expect(client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, new AbortController().signal)).rejects.toThrow(/missing/)
  })

  it('401 立即抛错不重试', async () => {
    let calls = 0
    const fetchImpl = mockFetch(async () => {
      calls += 1
      return new Response('no', { status: 401 })
    })
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 5000, maxRetries: 3 }, fetchImpl)
    await expect(client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, new AbortController().signal)).rejects.toThrow(/auth/)
    expect(calls).toBe(1)
  })

  it('重试耗尽抛最后错误', async () => {
    const fetchImpl = mockFetch(async () => new Response('x', { status: 503 }))
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 5000, maxRetries: 1, retryBaseMs: 1 }, fetchImpl)
    await expect(client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, new AbortController().signal)).rejects.toThrow(/503/)
  })

  it('请求携带 Bearer 与 json_object', async () => {
    let captured: RequestInit | undefined
    const fetchImpl = mockFetch(async (_url, init) => {
      captured = init
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"x"}' } }] }), { status: 200 })
    })
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'm', timeoutMs: 5000, maxRetries: 0 }, fetchImpl)
    await client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, new AbortController().signal)
    const headers = captured?.headers as Record<string, string> | undefined
    expect(headers?.['authorization']).toBe('Bearer k')
    const body = JSON.parse(String(captured?.body)) as { response_format?: { type?: string } }
    expect(body.response_format?.type).toBe('json_object')
  })

  it('调用方信号中止时立即抛错不重试', async () => {
    let calls = 0
    const fetchImpl = mockFetch(async () => {
      calls += 1
      await new Promise(r => setTimeout(r, 50))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"x"}' } }] }), { status: 200 })
    })
    const ac = new AbortController()
    ac.abort() // 预先中止：模拟 exec.signal 取消后的排队调用
    const client = new DeepSeekClient({ apiKey: 'k', baseUrl: 'x', model: 'm', timeoutMs: 5000, maxRetries: 3, retryBaseMs: 1 }, fetchImpl)
    await expect(client.translateBatch({ paragraphs: [{ id: 1, text: 'hi' }] }, ac.signal)).rejects.toThrow(/abort/i)
    expect(calls).toBe(0) // 未发起请求
  })
})
