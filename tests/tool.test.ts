import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { defineTranslateTool } from '../src/tool.js'

const deps = () => ({
  ctx: {} as Context,
  config: () => ({
    apiKey: 'k',
    baseUrl: 'x',
    model: 'm',
    langPair: 'en→zh',
    concurrency: 2,
    maxRetries: 0,
    timeoutMs: 1000,
    pythonBin: 'python',
  }),
})

describe('translate_pdf 工具定义', () => {
  it('注册名与参数 schema', () => {
    const tool = defineTranslateTool(deps())
    expect(tool.name).toBe('translate_pdf')
    // rc.2：defineTool 把参数 schema 编译为原始 JSON Schema（parameterSchemaSpecToJsonSchema），
    // 必填信息汇总到根级 required 数组，而非属性上的 required: true。
    const params = tool.parameters as { required?: string[] }
    expect(params.required).toContain('input')
    expect(params.required).toContain('outputDir')
    expect(params.required).not.toContain('langPair')
  })

  it('execute 校验输入存在与页码范围', async () => {
    const tool = defineTranslateTool(deps())
    await expect(tool.execute({ input: 'E:\\missing.pdf', outputDir: 'E:\\out' }, { signal: new AbortController().signal } as never)).rejects.toThrow(/no such file/i)
  })
})
