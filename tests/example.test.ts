import { describe, expect, it } from 'vitest'
import { version } from '../src/version.js'

describe('version', () => {
  it('导出插件版本号', () => {
    expect(version).toBe('0.1.0')
  })
})
