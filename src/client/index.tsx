import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { stageDiff, stagedFromScope } from './model.js'
import type { SettingsSnapshot } from './model.js'

export interface Scope {
  value?: Record<string, unknown>
  base?: Record<string, unknown>
  user?: Record<string, unknown>
  getSnapshot(): Scope
  subscribe(listener: () => void): () => void
  set(field: string, value: string): Promise<void>
  unset(field: string): Promise<void>
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
        inject: () => { scope: Scope }
      },
      component: (props: PdfTranslateCardProps) => ReactNode,
    ): unknown
  }
}

export interface PdfTranslateCardProps {
  scope: Scope
}

export const inject = ['slots', 'settingsScope']

const namespace = 'pdf-translate'

const connectionFields = [
  { name: 'apiKey', label: 'API key', type: 'password' },
  { name: 'baseUrl', label: 'Base URL', type: 'text' },
  { name: 'model', label: 'Model', type: 'text' },
  { name: 'langPair', label: 'Language pair', type: 'text' },
  { name: 'termbasePath', label: 'Termbase path', type: 'text' },
] as const

const executionFields = [
  { name: 'concurrency', label: 'Concurrency', type: 'number' },
  { name: 'maxRetries', label: 'Maximum retries', type: 'number' },
  { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number' },
  { name: 'pythonBin', label: 'Python executable', type: 'text' },
] as const

function settingsSnapshot(scope: Scope): SettingsSnapshot {
  const snapshot = scope.getSnapshot()
  return {
    value: snapshot.value ?? {},
    base: snapshot.base ?? {},
    user: snapshot.user ?? {},
  }
}

function useSettings(scope: Scope): SettingsSnapshot {
  const [snapshot, setSnapshot] = useState(() => settingsSnapshot(scope))

  useEffect(() => scope.subscribe(() => {
    setSnapshot(settingsSnapshot(scope))
  }), [scope])

  return snapshot
}

function SettingField({
  field,
  value,
  onChange,
}: {
  field: { name: string; label: string; type: string }
  value: string
  onChange(value: string): void
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{field.label}</span>
      <input
        type={field.type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </label>
  )
}

export function PdfTranslateCard({ scope }: PdfTranslateCardProps) {
  const snapshot = useSettings(scope)
  const [staged, setStaged] = useState(() => stagedFromScope(snapshot))

  useEffect(() => {
    setStaged(stagedFromScope(snapshot))
  }, [snapshot])

  const update = (field: string, value: string) => {
    setStaged((current) => ({ ...current, [field]: value }))
  }

  const save = async () => {
    const diff = stageDiff(staged, snapshot.base)
    await Promise.all(Object.entries(diff).map(([field, value]) => scope.set(field, value)))
  }

  const reset = async () => {
    await Promise.all(Object.keys(staged).map((field) => scope.unset(field)))
    setStaged(stagedFromScope(settingsSnapshot(scope)))
  }

  return (
    <section aria-label="PDF Translate settings" style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2>PDF Translate</h2>
        <p>Connection and execution settings for PDF translation.</p>
      </header>
      <fieldset style={{ display: 'grid', gap: 12 }}>
        <legend>Connection</legend>
        {connectionFields.map((field) => (
          <SettingField
            key={field.name}
            field={field}
            value={staged[field.name] ?? ''}
            onChange={(value) => update(field.name, value)}
          />
        ))}
      </fieldset>
      <fieldset style={{ display: 'grid', gap: 12 }}>
        <legend>Execution</legend>
        {executionFields.map((field) => (
          <SettingField
            key={field.name}
            field={field}
            value={staged[field.name] ?? ''}
            onChange={(value) => update(field.name, value)}
          />
        ))}
      </fieldset>
      <footer style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { void reset() }}>Reset</button>
        <button type="button" onClick={() => { void save() }}>Save</button>
      </footer>
    </section>
  )
}

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind({ namespace })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: namespace,
    locale: 'settings.pdfTranslate',
    inject: () => ({ scope }),
  }, PdfTranslateCard))
}
