import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { fileURLToPath } from 'node:url'

interface WorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

export class PdfWorker {
  private seq = 0
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly rl: Interface

  private constructor(
    private readonly proc: ChildProcessWithoutNullStreams,
    rl: Interface,
  ) {
    this.rl = rl
    rl.on('line', (line: string) => {
      if (line.trim() === '') return
      const msg = JSON.parse(line) as WorkerResponse
      const entry = this.pending.get(msg.id)
      if (entry === undefined) return
      this.pending.delete(msg.id)
      if (msg.ok) {
        entry.resolve(msg.result)
      } else {
        entry.reject(new Error(msg.error ?? 'worker error'))
      }
    })
    proc.on('error', err => {
      for (const entry of this.pending.values()) entry.reject(err)
      this.pending.clear()
    })
    // 进程退出（无 'error' 事件，如 stdin EOF/外部 kill/OOM）时拒绝所有挂起命令，
    // 防止管道调用方永久挂起（Task 22 质量审查）
    proc.on('exit', () => {
      for (const entry of this.pending.values()) entry.reject(new Error('worker exited'))
      this.pending.clear()
    })
  }

  static start(pythonBin: string, args: readonly string[], cwd: string): Promise<PdfWorker> {
    // @types/node 将 stdio: ['pipe','pipe','inherit'] 精确匹配为
    // ChildProcessByStdio<Writable, Readable, null>（stderr 为 null，因被继承）。
    // 运行时 stdin/stdout 均为非空 pipe，此处按计划声明的 ChildProcessWithoutNullStreams 收窄。
    const proc = spawn(pythonBin, [...args], { cwd, stdio: ['pipe', 'pipe', 'inherit'] }) as unknown as ChildProcessWithoutNullStreams
    const rl = createInterface({ input: proc.stdout })
    return new Promise((resolve, reject) => {
      const onLine = (line: string): void => {
        if (line.includes('"ready"')) {
          rl.off('line', onLine)
          resolve(new PdfWorker(proc, rl))
        }
      }
      rl.on('line', onLine)
      proc.on('error', reject)
    })
  }

  command<T>(cmd: string, payload: Record<string, unknown>): Promise<T> {
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.proc.stdin.write(JSON.stringify({ id, cmd, payload }) + '\n')
    })
  }

  dispose(): Promise<void> {
    return new Promise(resolve => {
      // 进程可能已退出（exitCode 已置位）：exit 事件不会再触发，直接完成
      if (this.proc.exitCode !== null) {
        this.rl.close()
        resolve()
        return
      }
      this.proc.on('exit', () => resolve())
      this.proc.kill()
      this.rl.close()
    })
  }
}

// 源码（src/worker.ts）与构建产物（lib/types/worker.js）相对深度不同，
// 无法用单一固定深度解析；逐级上探直到找到 worker/main.py（插件包根下必有）。
function resolveWorkerScriptPath(): string {
  for (const depth of ['../../worker/main.py', '../worker/main.py']) {
    const p = fileURLToPath(new URL(depth, import.meta.url))
    if (existsSync(p)) return p
  }
  return fileURLToPath(new URL('../../worker/main.py', import.meta.url))
}

export const workerScriptPath = resolveWorkerScriptPath()
export const workerRepoRoot = dirname(dirname(workerScriptPath))

// 真实 worker 必须用 `python -u -m worker.main`（cwd = 仓库根）：
// `python -u worker/main.py` 脚本形式会把脚本目录放入 sys.path[0]，
// 导致 `from worker import ...` 失败（Task 4 已实测确认）。
export const workerSpawn = (pythonBin: string): { args: string[]; cwd: string } => ({
  args: ['-u', '-m', 'worker.main'],
  cwd: workerRepoRoot,
})
