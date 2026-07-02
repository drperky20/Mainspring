import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.reference/**'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '#protocol/node': path.join(root, 'src/protocol/node.ts'),
      '#protocol': path.join(root, 'src/protocol/index.ts'),
      '#control': path.join(root, 'src/control/index.ts'),
      'mainspring/gateway/browser-safety': path.join(root, 'src/gateway/browserSafety.ts'),
    },
  },
})
