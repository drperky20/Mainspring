import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '#protocol/node': path.join(root, 'src/protocol/node.ts'),
      '#protocol': path.join(root, 'src/protocol/index.ts'),
      '#control': path.join(root, 'src/control/index.ts'),
    },
  },
})
