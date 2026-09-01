import { build } from 'esbuild'

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  sourcemap: true,
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-pdf-translate", factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;',
  },
  footer: {
    js: 'return module.exports;\n} });',
  },
})
