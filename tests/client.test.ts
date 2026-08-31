import { describe, expect, it } from 'vitest'
import { stageDiff, stagedFromScope } from '../src/client/model.js'

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
})
