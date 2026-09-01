import { describe, expect, it, vi } from 'vitest'
import { resetSettings, saveSettings } from '../src/client/index.js'
import { enDict, zhDict } from '../src/client/locales.js'
import { settingsValue, stageDiff, stagedFromScope } from '../src/client/model.js'

describe('client settings model', () => {
  it('stages string and numeric scope values as text', () => {
    const staged = stagedFromScope({
      value: { apiKey: 'k', concurrency: 4, enabled: true, nested: {} },
      base: { concurrency: 6 },
      user: {},
    })

    expect(staged).toEqual({ apiKey: 'k', concurrency: '4' })
  })

  it('keeps only staged values that differ from the base layer', () => {
    expect(stageDiff(
      { apiKey: 'k', concurrency: 4 },
      { apiKey: undefined, concurrency: 6 },
    )).toEqual({ apiKey: 'k', concurrency: '4' })
  })

  it('omits unsupported values and fields equal to the base layer', () => {
    expect(stageDiff(
      { apiKey: 'k', concurrency: 4, enabled: true, nested: {} },
      { apiKey: 'k', concurrency: '4' },
    )).toEqual({})
  })

  it('converts configured numeric fields to finite numbers while retaining text values', () => {
    expect(settingsValue('concurrency', '4')).toBe(4)
    expect(settingsValue('maxRetries', '2.5')).toBe(2.5)
    expect(settingsValue('timeoutMs', '1000')).toBe(1000)
    expect(settingsValue('baseUrl', 'https://api.example.test')).toBe('https://api.example.test')
  })

  it('refuses empty and non-finite numeric drafts', () => {
    expect(settingsValue('concurrency', '')).toBeUndefined()
    expect(settingsValue('maxRetries', 'Infinity')).toBeUndefined()
    expect(settingsValue('timeoutMs', 'not-a-number')).toBeUndefined()
  })
})

describe('settings.pdfTranslate 双语词典', () => {
  it('zh 与 en 键集合完全一致（locale 运行时要求双语平衡）', () => {
    const zhKeys = Object.keys(zhDict).sort()
    const enKeys = Object.keys(enDict).sort()
    expect(zhKeys).toEqual(enKeys)
    expect(zhKeys.length).toBeGreaterThan(10)
  })

  it('每个键在两种语言下都有非空文案', () => {
    for (const key of Object.keys(zhDict)) {
      expect(zhDict[key as keyof typeof zhDict]?.trim().length ?? 0).toBeGreaterThan(0)
      expect(enDict[key as keyof typeof enDict]?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('PDF Translate settings card actions', () => {
  it('saves numeric draft fields as numbers through the scope', async () => {
    const set = vi.fn<(...args: [string, string | number]) => Promise<void>>().mockResolvedValue(undefined)

    await saveSettings({ set }, { concurrency: '4', baseUrl: 'https://api.example.test' }, {})

    expect(set).toHaveBeenCalledWith('concurrency', 4)
    expect(set).toHaveBeenCalledWith('baseUrl', 'https://api.example.test')
  })

  it('does not write invalid numeric drafts', async () => {
    const set = vi.fn<(...args: [string, string | number]) => Promise<void>>().mockResolvedValue(undefined)

    await saveSettings({ set }, { concurrency: '', maxRetries: 'Infinity', timeoutMs: 'bad' }, {})

    expect(set).not.toHaveBeenCalled()
  })

  it('resets every configurable field, including a redacted apiKey', async () => {
    const unset = vi.fn<(...args: [string]) => Promise<void>>().mockResolvedValue(undefined)

    await resetSettings({ unset })

    expect(unset.mock.calls.map(([field]) => field)).toEqual([
      'apiKey',
      'baseUrl',
      'model',
      'langPair',
      'termbasePath',
      'concurrency',
      'maxRetries',
      'timeoutMs',
      'pythonBin',
    ])
  })
})
