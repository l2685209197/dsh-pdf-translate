import { createServer, type Server } from 'node:http'

export function startMockDeepSeek(): Promise<{ server: Server; url: string; calls: { body: unknown }[] }> {
  const calls: { body: unknown }[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const body = JSON.parse(raw) as { messages?: { content: string }[] }
      calls.push({ body })
      const userContent = body.messages?.at(-1)?.content ?? '[]'
      const items = JSON.parse(userContent) as { id: number; text: string }[]
      const translated: Record<string, string> = {}
      for (const item of items) translated[String(item.id)] = `[TR] ${item.text}`
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(translated) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr !== null && typeof addr === 'object') {
        resolve({ server, url: `http://127.0.0.1:${addr.port}`, calls })
      }
    })
  })
}
