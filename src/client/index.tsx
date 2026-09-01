import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { settingsValue, stageDiff, stagedFromScope } from './model.js'
import type { SettingsSnapshot } from './model.js'
import { enDict, zhDict, type PdfTranslateDict } from './locales.js'

/** 本地结构类型：dsh-client-runtime 不随应用分发（随 web 构建打包），
 * 客户端半侧按最小结构声明所需接口；跨插件协作经 cordis 服务注入。 */
export interface Scope {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: string | number): void | Promise<void>
  unset(field: string): void | Promise<void>
}

export interface LocaleRuntime {
  register(ns: string, locale: string, dict: Record<string, string>): () => void
  bind(ns: string): (key: string) => string
  getSnapshot(): { active: string; revision: number }
  subscribe(listener: () => void): () => void
}

export interface ClientContext {
  settingsScope: {
    bind(options: { namespace: string }): Scope
  }
  slots: {
    inject(name: string, factory: () => unknown): unknown
    register(
      options: {
        name: string
        key: string
        locale: string
        inject: () => PdfTranslateCardProps
      },
      component: (props: PdfTranslateCardProps) => ReactNode,
    ): unknown
  }
  locale: LocaleRuntime
  effect(fn: () => () => void): void
}

export interface PdfTranslateCardProps {
  scope: Scope
  t: (key: keyof PdfTranslateDict) => string
  getLocale: () => { active: string; revision: number }
  subscribeLocale: (listener: () => void) => () => void
}

export const inject = ['slots', 'settingsScope', 'locale']

const namespace = 'pdf-translate'
const localeNamespace = 'settings.pdfTranslate'

// 占位符给"不知道填什么"的用户示例值；非句子，故不随语言切换。
const connectionFields = [
  { name: 'apiKey', type: 'password' as const, placeholder: 'sk-…' },
  { name: 'baseUrl', type: 'text' as const, placeholder: 'https://api.deepseek.com' },
  { name: 'model', type: 'text' as const, placeholder: 'deepseek-chat' },
  { name: 'langPair', type: 'text' as const, placeholder: 'en→zh' },
  { name: 'termbasePath', type: 'text' as const, placeholder: 'C:\\path\\terms.json' },
]

const executionFields = [
  { name: 'concurrency', type: 'number' as const, placeholder: '6' },
  { name: 'maxRetries', type: 'number' as const, placeholder: '3' },
  { name: 'timeoutMs', type: 'number' as const, placeholder: '60000' },
  { name: 'pythonBin', type: 'text' as const, placeholder: 'python' },
]

const fields = [...connectionFields, ...executionFields]

function settingsSnapshot(scope: Scope): SettingsSnapshot {
  return scope.getSnapshot()
}

function useSettings(scope: Scope): SettingsSnapshot {
  const [snapshot, setSnapshot] = useState(() => settingsSnapshot(scope))
  useEffect(() => scope.subscribe(() => setSnapshot(settingsSnapshot(scope))), [scope])
  return snapshot
}

// --dsw-* 主题 token：明暗主题自动适配（ui-theme 全局定义），避免硬编码颜色。
const styles = {
  section: {
    display: 'grid',
    gap: 14,
    fontFamily: 'var(--dsw-font-family)',
    color: 'var(--dsw-alias-label-primary)',
  },
  header: { display: 'grid', gap: 2 },
  title: { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  subtitle: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
  group: {
    display: 'grid',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-inverted)',
    background: 'var(--dsw-alias-bg-base)',
  },
  groupTitle: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  field: { display: 'grid', gap: 4 },
  label: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
  // 输入框视觉可编辑感（2026-09-01 用户反馈"全白看不出能输入"）：
  // 底色用 --dsw-specific-login-input（亮色=浅灰，区别于白色卡片底色），
  // 边框用 --dsw-alias-border-l2（两主题均可见，原 border-inverted 亮色=透明）；
  // hover/聚焦/占位符由下方 inputCss 类处理（:focus 原生聚焦，含键盘聚焦）。
  input: {
    padding: '7px 10px',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--dsw-alias-label-primary)',
    outline: 'none',
  },
  footer: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  save: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--dsw-alias-button-primary-fill)',
    color: 'var(--dsw-alias-label-primary-foreground)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  reset: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-inverted)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 13,
    cursor: 'pointer',
  },
  note: { margin: 0, fontSize: 11, color: 'var(--dsw-alias-label-caption)' },
} satisfies Record<string, React.CSSProperties>

// 输入框的悬停/聚焦/占位符样式：内联样式无法表达伪类，注入一个按类名作用域的 <style>。
// 聚焦环用 --dsw-alias-state-business-tertiary（亮色=浅蓝光晕），边框切 business-primary。
const inputCss = `
.dsh-pt-input {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-login-input);
  transition: border-color .12s ease, background-color .12s ease, box-shadow .12s ease;
}
.dsh-pt-input:hover { border-color: var(--dsw-alias-border-l3); }
.dsh-pt-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-specific-input-major);
  box-shadow: 0 0 0 3px var(--dsw-alias-state-business-tertiary);
}
.dsh-pt-input::placeholder { color: var(--dsw-alias-label-dimmed); }
`

function SettingField({
  name,
  type,
  label,
  placeholder,
  value,
  onChange,
}: {
  name: string
  type: string
  label: string
  placeholder?: string
  value: string
  onChange(value: string): void
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input
        className="dsh-pt-input"
        type={type}
        value={value}
        placeholder={placeholder}
        style={styles.input}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </label>
  )
}

export async function saveSettings(
  scope: Pick<Scope, 'set'>,
  staged: Record<string, string>,
  base: Record<string, unknown>,
): Promise<void> {
  const diff = stageDiff(staged, base)
  await Promise.all(Object.entries(diff).flatMap(([field, value]) => {
    const typedValue = settingsValue(field, value)
    return typedValue === undefined ? [] : [scope.set(field, typedValue)]
  }))
}

export async function resetSettings(scope: Pick<Scope, 'unset'>): Promise<void> {
  await Promise.all(fields.map(({ name }) => scope.unset(name)))
}

export function PdfTranslateCard({ scope, t, getLocale, subscribeLocale }: PdfTranslateCardProps) {
  // 语言跟随应用全局设置（dsh-client-locale 的 zh/en 切换）；快照 revision 变化触发重渲
  useSyncExternalStore(subscribeLocale, getLocale)

  const snapshot = useSettings(scope)
  const [staged, setStaged] = useState(() => stagedFromScope(snapshot))

  useEffect(() => {
    setStaged(stagedFromScope(snapshot))
  }, [snapshot])

  const update = (field: string, value: string) => {
    setStaged((current) => ({ ...current, [field]: value }))
  }

  const save = async () => {
    await saveSettings(scope, staged, snapshot.base ?? {})
  }

  const reset = async () => {
    await resetSettings(scope)
    setStaged(stagedFromScope(settingsSnapshot(scope)))
  }

  const renderField = (field: { name: string; type: string; placeholder?: string }) => (
    <SettingField
      key={field.name}
      name={field.name}
      type={field.type}
      label={t(`field.${field.name}` as keyof PdfTranslateDict)}
      placeholder={field.placeholder}
      value={staged[field.name] ?? ''}
      onChange={(value) => update(field.name, value)}
    />
  )

  return (
    <section aria-label={t('ariaLabel')} style={styles.section}>
      <style>{inputCss}</style>
      <header style={styles.header}>
        <h2 style={styles.title}>{t('title')}</h2>
        <p style={styles.subtitle}>{t('subtitle')}</p>
      </header>
      <fieldset style={{ ...styles.group, border: 'none', padding: 0 }}>
        <legend style={styles.groupTitle}>{t('group.connection')}</legend>
        {connectionFields.map(renderField)}
      </fieldset>
      <fieldset style={{ ...styles.group, border: 'none', padding: 0 }}>
        <legend style={styles.groupTitle}>{t('group.execution')}</legend>
        {executionFields.map(renderField)}
      </fieldset>
      <footer style={styles.footer}>
        <button type="button" style={styles.save} onClick={() => { void save() }}>{t('save')}</button>
        <button type="button" style={styles.reset} onClick={() => { void reset() }}>{t('reset')}</button>
        <p style={styles.note}>{t('secretNote')}</p>
      </footer>
    </section>
  )
}

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind({ namespace })
  // 注册双语词典（zh/en 键集一致；disposer 随插件生命周期卸载）
  ctx.effect(() => {
    // PdfTranslateDict 是带具体键的 interface（无索引签名），locale.register 收 Record<string,string
    const disposeZh = ctx.locale.register(localeNamespace, 'zh', zhDict as unknown as Record<string, string>)
    const disposeEn = ctx.locale.register(localeNamespace, 'en', enDict as unknown as Record<string, string>)
    return () => { disposeZh(); disposeEn() }
  })
  const t = ctx.locale.bind(localeNamespace) as (key: keyof PdfTranslateDict) => string
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: namespace,
    locale: localeNamespace,
    inject: () => ({
      scope,
      t,
      getLocale: () => ctx.locale.getSnapshot(),
      // 箭头包装保持 this：useSyncExternalStore 以普通调用执行 subscribe，
      // 裸传 ctx.locale.subscribe 会因 this 丢失而崩溃（LocaleRuntime 用 this.listeners）
      subscribeLocale: (fn) => ctx.locale.subscribe(fn),
    }),
  }, PdfTranslateCard))
}
