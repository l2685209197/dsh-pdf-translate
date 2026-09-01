import { cp, mkdir } from 'node:fs/promises'

// 把 tsc 输出（lib/types/，含全部相对导入模块）整树复制到 lib/：
// lib/index.js 的 './tool.js' 等相对导入才能解析到 lib/tool.js。
// 只复制 index.js 会导致打包后的主机入口导入失效。
await mkdir('lib', { recursive: true })
await cp('lib/types', 'lib', { recursive: true, force: true })
console.log('lib/index.js + 全量模块树已就绪')
