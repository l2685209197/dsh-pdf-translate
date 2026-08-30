import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../src/translate/concurrency.js'

describe('mapWithConcurrency', () => {
  it('限制并发数', async () => {
    let active = 0
    let peak = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async n => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 10))
      active -= 1
      return n * 2
    })
    expect(results).toEqual([2, 4, 6, 8, 10, 12])
    expect(peak).toBe(2)
  })

  it('保持输入顺序', async () => {
    const delay = [30, 5, 20]
    const results = await mapWithConcurrency([0, 1, 2], 3, async i => {
      await new Promise(r => setTimeout(r, delay[i] ?? 0))
      return i
    })
    expect(results).toEqual([0, 1, 2])
  })

  it('传播异常', async () => {
    await expect(
      mapWithConcurrency([1], 1, async () => { throw new Error('boom') }),
    ).rejects.toThrow('boom')
  })
})
