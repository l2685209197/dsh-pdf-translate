// 干跑：只执行 extract（不调用 API），打印 1-20 页的段落统计，用于预估翻译成本。
const { PdfWorker, workerSpawn, workerScriptPath } = await import('../lib/worker.js')
const input = process.argv[2]
const start = Number(process.argv[3] ?? 0)
const end = Number(process.argv[4] ?? 19)
const worker = await PdfWorker.start('python', workerSpawn('python').args, workerSpawn('python').cwd)
try {
  const info = await worker.command('textlayer', { path: input })
  console.log(`pageCount=${info.pageCount} hasTextLayer=${info.hasTextLayer}`)
  const extracted = await worker.command('extract', { path: input, start, end })
  let total = 0
  let totalChars = 0
  const byType = {}
  for (const p of extracted.pages) {
    const paras = p.paragraphs
    const chars = paras.reduce((s, x) => s + x.lines.map(l => l.text).join('\n').length, 0)
    total += paras.length
    totalChars += chars
    for (const x of paras) byType[x.type] = (byType[x.type] ?? 0) + 1
    console.log(`page ${p.index + 1}: paragraphs=${paras.length} chars=${chars}`)
  }
  console.log(`TOTAL paragraphs=${total} chars=${totalChars} byType=${JSON.stringify(byType)}`)
} finally {
  await worker.dispose()
}
