import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TranslationCache } from '../src/translate/cache.js'

describe('TranslationCache', () => {
  it('按 文本+语言对 哈希键存取', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfcache-'))
    const cache = new TranslationCache(join(dir, 'cache.json'))
    const key = cache.key('Hello world', 'en→zh')
    expect(cache.get(key)).toBeUndefined()
    cache.set(key, '你好，世界')
    expect(cache.get(key)).toBe('你好，世界')
    await cache.save()
    const cache2 = new TranslationCache(join(dir, 'cache.json'))
    await cache2.load()
    expect(cache2.get(cache2.key('Hello world', 'en→zh'))).toBe('你好，世界')
  })

  it('相同文本同语言对 → 相同键', () => {
    const cache = new TranslationCache(null)
    expect(cache.key('abc', 'en→zh')).toBe(cache.key('abc', 'en→zh'))
    expect(cache.key('abc', 'en→zh')).not.toBe(cache.key('abc', 'zh→en'))
  })
})
