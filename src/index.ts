import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { defineTranslateTool, type ToolConfig } from './tool.js'

export const name = 'pdf-translate'
export const inject = ['tools', 'jobs']
export const NS = settingsNamespace('pdf-translate')

export interface Config extends ToolConfig {
  apiKey?: string
  termbasePath?: string
}

// rc.2：schemastery 没有 .optional() —— object 子字段在输入层天然可选
// （未 required、无 default 时缺省键在输出中被省略），因此 apiKey/termbasePath
// 直接声明为 string 即可，无需调用不存在的 optional()。
const configSchema: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  baseUrl: z.string().default('https://api.deepseek.com'),
  model: z.string().default('deepseek-chat'),
  langPair: z.string().default('en→zh'),
  concurrency: z.number().step(1).min(1).max(16).default(6),
  maxRetries: z.number().step(1).min(0).max(10).default(3),
  timeoutMs: z.number().step(1).min(1000).default(60000),
  termbasePath: z.string(),
  pythonBin: z.string().default('python'),
})

// rc.2 适配：rc.2 schemastery 的 schema 实例直接在实例上暴露 dict/meta（没有
// .schema 包装），而入口测试按计划断言 Config.schema.dict.apiKey.meta.role。
// 这里给实例挂一个指向自身的非枚举 schema 引用：非枚举使 { ...this } 展开不会
// 带上它，toJSON 的 JSON.stringify 因此不会遇到循环引用。
export const Config = Object.defineProperty(configSchema, 'schema', {
  value: configSchema,
  enumerable: false,
}) as z<Config> & { readonly schema: z<Config> }

export function apply(ctx: Context, config: Config): void {
  // settings 未激活时保持入口配置；激活后 installSettingsSection 提供实时解析来源。
  let source = () => config
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (current) => { source = current },
    // rc.2：SettingsSectionHooks 的 onChange 为必填（仅 validate 可选）；工具在每次
    // 执行时通过 source() 读取配置，因此无需额外派生状态。
    onChange: () => {},
  })
  ctx.tools.register(defineTranslateTool({ ctx, config: () => source() }))
}
