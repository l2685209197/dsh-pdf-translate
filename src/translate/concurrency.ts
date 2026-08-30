export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
