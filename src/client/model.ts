export interface SettingsSnapshot {
  value: Record<string, unknown>
  base: Record<string, unknown>
  user: Record<string, unknown>
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

export function stagedFromScope(scope: SettingsSnapshot): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scope.value).flatMap(([field, value]) => {
      const text = asText(value)
      return text === undefined ? [] : [[field, text]]
    }),
  )
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
