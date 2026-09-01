export interface SettingsSecret {
  path: readonly string[]
  set: boolean
}

/** A client-safe copy of the settings scope snapshot; secret values are redacted. */
export interface SettingsSnapshot {
  value?: Record<string, unknown>
  base?: Record<string, unknown>
  user?: Record<string, unknown>
  secrets?: readonly SettingsSecret[]
  status?: string
  writable?: boolean
}

const numericFields = new Set(['concurrency', 'maxRetries', 'timeoutMs'])

function asText(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

export function stagedFromScope(scope: SettingsSnapshot): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scope.value ?? {}).flatMap(([field, value]) => {
      const text = asText(value)
      return text === undefined ? [] : [[field, text]]
    }),
  )
}

/**
 * Converts a staged text value only at the settings write boundary.
 * Numeric fields reject empty and non-finite drafts so NaN never reaches Scope.set().
 */
export function settingsValue(field: string, value: string): string | number | undefined {
  if (!numericFields.has(field)) return value
  if (value.trim() === '') return undefined

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function stageDiff(
  staged: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(staged).flatMap(([field, value]) => {
      const text = asText(value)
      return text === undefined || text === asText(base[field]) ? [] : [[field, text]]
    }),
  )
}
