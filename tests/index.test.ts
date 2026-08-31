import { describe, expect, it, vi } from 'vitest'
import type { ToolConfig } from '../src/tool.js'

const toolModule = vi.hoisted(() => ({
  defineTranslateTool: vi.fn((deps: { config: () => ToolConfig }) => ({
    name: 'translate_pdf',
    config: deps.config,
  })),
}))

vi.mock('../src/tool.js', () => toolModule)

import { apply, Config, inject, NS, name, type Config as PluginConfig } from '../src/index.js'

function createConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return Config(overrides as PluginConfig)
}

function latestToolConfig(): () => ToolConfig {
  return toolModule.defineTranslateTool.mock.calls.at(-1)![0].config
}

describe('pdf-translate 插件入口', () => {
  it('导出固定插件元数据', () => {
    expect(name).toBe('pdf-translate')
    expect(inject).toEqual(['tools', 'jobs'])
    expect(NS).toMatch(/pdf-translate/)
  })

  it('Config 提供 Task 25 的全部默认值', () => {
    const cfg = createConfig()
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

  it('settings provider 更新后，工具配置回调读取保存的最新来源 thunk', () => {
    let current = createConfig({ model: 'provider-initial' })
    const registrations: string[] = []
    const ctx = {
      tools: { register: (tool: { name: string }) => { registrations.push(tool.name) } },
      jobs: {},
      inject: (_dependencies: string[], callback: (scope: object) => void) => {
        callback({
          settings: {
            register: () => ({
              get: () => current,
              watch: () => () => {},
            }),
          },
          effect: () => {},
        })
      },
    }

    apply(ctx as never, createConfig({ model: 'entry' }))
    current = createConfig({ model: 'provider-updated' })

    expect(registrations).toContain('translate_pdf')
    expect(latestToolConfig()().model).toBe('provider-updated')
  })

  it('有合理 inject 但没有 settings provider 时仍注册工具并使用入口配置', () => {
    const registrations: string[] = []
    const entry = createConfig({ model: 'entry-only' })
    const ctx = {
      tools: { register: (tool: { name: string }) => { registrations.push(tool.name) } },
      jobs: {},
      // Cordis optional injection creates a pending fiber; the callback waits for settings.
      inject: () => undefined,
    }

    apply(ctx as never, entry)

    expect(registrations).toContain('translate_pdf')
    expect(latestToolConfig()()).toBe(entry)
  })

  it('settings 安装期间的非缺服务错误不会被静默吞掉', () => {
    const error = new Error('settings registration failed')
    const ctx = {
      tools: { register: vi.fn() },
      jobs: {},
      inject: (_dependencies: string[], callback: (scope: object) => void) => {
        callback({
          settings: { register: () => { throw error } },
          effect: () => {},
        })
      },
    }

    expect(() => apply(ctx as never, createConfig())).toThrow(error)
    expect(ctx.tools.register).not.toHaveBeenCalled()
  })
})
