import { describe, expect, it } from 'vitest'
import { apply, Config, inject, NS, name } from '../src/index.js'

describe('pdf-translate 插件入口', () => {
  it('导出固定插件元数据', () => {
    expect(name).toBe('pdf-translate')
    expect(inject).toEqual(['tools', 'jobs'])
    expect(NS).toMatch(/pdf-translate/)
  })

  it('Config 提供 Task 25 的全部默认值', () => {
    const cfg = Config({}) as {
      baseUrl: string
      model: string
      langPair: string
      concurrency: number
      maxRetries: number
      timeoutMs: number
      pythonBin: string
    }
    expect(cfg).toMatchObject({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      langPair: 'en→zh',
      concurrency: 6,
      maxRetries: 3,
      timeoutMs: 60000,
      pythonBin: 'python',
    })
  })

  it('apiKey 字段标记为 secret，且 schema 可序列化', () => {
    const apiKey = Config.schema.dict!.apiKey!
    expect(apiKey.meta.role).toBe('secret')
    expect(Object.keys(Config)).not.toContain('schema')
    expect(JSON.parse(JSON.stringify(Config))).not.toHaveProperty('schema')
  })

  it('headless 没有 settings provider 时仍注册工具', () => {
    const registrations: string[] = []
    const ctx = {
      tools: { register: (t: { name: string }) => { registrations.push(t.name) } },
      jobs: {},
    } as never
    apply(ctx as never, Config({}) as never)
    expect(registrations).toContain('translate_pdf')
  })
})
