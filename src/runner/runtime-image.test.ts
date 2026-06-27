import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.resolve(__dirname, relativePath), 'utf8')) as T
}

describe('Mainspring runtime image', () => {
  it('builds the standalone package and runs the compiled runtime entrypoint', () => {
    const dockerfile = readFileSync(
      path.resolve(__dirname, '../../docker/runtime.Dockerfile'),
      'utf8',
    )

    expect(dockerfile).toContain('pnpm run build')
    expect(dockerfile).toContain('pnpm prune --prod')
    expect(dockerfile).toContain('COPY --from=deps --chown=mainspring:mainspring /app/dist /app/dist')
    expect(dockerfile).toContain('CMD ["node", "dist/runner/main.js"]')
    expect(dockerfile).not.toContain('@mainspring/mainspring')
    expect(dockerfile).not.toContain('/var/run/docker.sock')
  })

  it('excludes test files from production TypeScript build output', () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>('../../package.json')
    const tsconfig = readJson<{ exclude?: string[] }>('../../tsconfig.json')

    expect(packageJson.scripts?.build).toMatch(/^pnpm run clean && /)
    expect(tsconfig.exclude).toContain('src/**/*.test.ts')
    expect(tsconfig.exclude).toContain('src/**/*.test-support.ts')
  })
})
