import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export class TranslationCache {
  private map = new Map<string, string>()

  constructor(private readonly filePath: string | null) {}

  key(text: string, langPair: string): string {
    return createHash('sha256').update(`${langPair}\u0000${text}`).digest('hex')
  }

  get(key: string): string | undefined {
    return this.map.get(key)
  }

  set(key: string, text: string): void {
    this.map.set(key, text)
  }

  async load(): Promise<void> {
    if (this.filePath === null) return
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, string>
      this.map = new Map(Object.entries(parsed))
    } catch {
      this.map = new Map()
    }
  }

  async save(): Promise<void> {
    if (this.filePath === null) return
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(this.map), null, 2), 'utf8')
  }
}
