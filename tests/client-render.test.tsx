// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PdfTranslateCard, type PdfTranslateCardProps } from '../src/client/index.js'
import { enDict, zhDict } from '../src/client/locales.js'

// 与 src/client/index.tsx 的 connectionFields 数量保持一致（执行分组另有 4 个）
const connectionFieldCount = 5

function props(overrides: Partial<PdfTranslateCardProps> = {}): PdfTranslateCardProps {
  // uSES 契约：getSnapshot 必须返回稳定引用（LocaleRuntime 在变更间冻结快照）
  const localeSnapshot = { active: 'en' as const, revision: 0 }
  return {
    scope: {
      getSnapshot: () => ({
        value: { baseUrl: 'https://api.deepseek.com' },
        base: {},
        user: {},
        status: 'active',
        writable: true,
      }),
      subscribe: vi.fn(() => () => {}),
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    },
    t: (key) => enDict[key] ?? String(key),
    getLocale: () => localeSnapshot,
    subscribeLocale: vi.fn(() => () => {}),
    ...overrides,
  }
}

function renderCard(p: PdfTranslateCardProps): { container: HTMLDivElement; cleanup: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<PdfTranslateCard {...p} />) })
  return {
    container,
    cleanup: () => { act(() => { root.unmount() }); container.remove() },
  }
}

describe('PdfTranslateCard 渲染（jsdom）', () => {
  it('用词典渲染标题、分组与按钮（组件挂载不崩溃）', () => {
    const { container, cleanup } = renderCard(props())
    const text = container.textContent ?? ''
    expect(text).toContain('PDF Translate')
    expect(text).toContain('Connection')
    expect(text).toContain('Execution')
    expect(text).toContain('Save')
    expect(text).toContain('Reset')
    cleanup()
  })

  it('zh 词典渲染中文文案', () => {
    const { container, cleanup } = renderCard(props({ t: (key) => zhDict[key] ?? String(key) }))
    const text = container.textContent ?? ''
    expect(text).toContain('PDF 翻译')
    expect(text).toContain('连接配置')
    expect(text).toContain('保存')
    cleanup()
  })

  it('暂存值渲染进输入框；secret 字段不回显（值脱敏后为空）', () => {
    const { container, cleanup } = renderCard(props())
    const inputs = Array.from(container.querySelectorAll('input'))
    const passwordInput = inputs.find(i => i.type === 'password')
    const baseUrlInput = inputs.find(i => i.value === 'https://api.deepseek.com')
    expect(passwordInput?.value ?? '').toBe('')
    expect(baseUrlInput).toBeDefined()
    cleanup()
  })

  it('订阅函数被 useSyncExternalStore 以普通调用执行时正常（this 绑定守卫）', () => {
    // 回归：inject 曾裸传 ctx.locale.subscribe 导致 this 丢失、挂载即崩。
    // 这里模拟运行时以普通调用执行订阅器（不绑定 this）：
    const subscribed: (() => void)[] = []
    let listenerRef: (() => void) | undefined
    const subscribeLocale = (fn: () => void): (() => void) => {
      listenerRef = fn
      subscribed.push(fn)
      return () => {}
    }
    const { cleanup } = renderCard(props({ subscribeLocale }))
    // 触发一次快照变更回调（如同 locale 切换后的通知），组件应能重渲而不抛
    expect(() => act(() => { listenerRef?.() })).not.toThrow()
    expect(subscribed.length).toBe(1)
    cleanup()
  })

  it('输入框带可编辑视觉标识（class + 占位符示例）', () => {
    // 回归（用户反馈"输入框全白看不出能输入"）：input 必须挂 dsh-pt-input 类
    // （样式层提供可见边框/底色/聚焦环），并提供占位符示例值。
    const { container, cleanup } = renderCard(props())
    const inputs = Array.from(container.querySelectorAll('input.dsh-pt-input'))
    expect(inputs.length).toBeGreaterThanOrEqual(connectionFieldCount)
    const placeholders = inputs.map(i => i.getAttribute('placeholder')).filter(Boolean)
    expect(placeholders.length).toBeGreaterThanOrEqual(connectionFieldCount)
    expect(placeholders).toContain('https://api.deepseek.com')
    expect(placeholders).toContain('sk-…')
    cleanup()
  })
})
