import { describe, expect, it } from 'vitest'
import { apply, Config, NS, name } from '../src/index.js'

describe('pdf-translate 插件入口', () => {
  it('插件名与命名空间', () => {
    expect(name).toBe('pdf-translate')
    expect(NS).toMatch(/pdf-translate/)
  })

  it('Config 有默认值', () => {
    const cfg = Config({}) as { baseUrl: string; model: string; concurrency: number }
    expect(cfg.baseUrl).toBe('https://api.deepseek.com')
    expect(cfg.model).toBe('deepseek-chat')
    expect(cfg.concurrency).toBe(6)
  })

  it('apiKey 字段标记为 secret', () => {
    const schema = Config.schema
    const apiKey = schema.dict.apiKey
    expect(apiKey?.meta?.role ?? '').toContain('secret')
  })

  it('apply 注册工具与设置段', () => {
    const registrations: string[] = []
    const ctx = {
      tools: { register: (t: { name: string }) => { registrations.push(t.name) } },
      jobs: {},
    } as never
    apply(ctx as never, Config({}) as never)
    expect(registrations).toContain('translate_pdf')
  })
})
