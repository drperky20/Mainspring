import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROVIDER_INIT_LOG_MESSAGE,
  providerInitDetailFromRunEvent,
} from './contracts/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readPackageJson(): {
  name?: string
  exports?: Record<string, { import?: string; types?: string }>
  imports?: Record<string, { default?: string; types?: string }>
} {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
    name?: string
    exports?: Record<string, { import?: string; types?: string }>
    imports?: Record<string, { default?: string; types?: string }>
  }
}

describe('mainspring package exports', () => {
  it('is a single publishable package with built JavaScript exports', () => {
    const packageJson = readPackageJson()

    expect(packageJson.name).toBe('mainspring')
    for (const entry of Object.values(packageJson.exports ?? {})) {
      expect(entry.import).toMatch(/^\.\/dist\/.+\.js$/)
      expect(entry.types).toMatch(/^\.\/dist\/.+\.d\.ts$/)
    }
  })

  it('exposes the browser-safety helper as a narrow gateway subpath', () => {
    const packageJson = readPackageJson()

    expect(packageJson.exports?.['./gateway/browser-safety']).toEqual({
      import: './dist/gateway/browserSafety.js',
      types: './dist/gateway/browserSafety.d.ts',
    })
  })

  it('exposes provider-init runtime helpers from the contracts barrel', () => {
    expect(PROVIDER_INIT_LOG_MESSAGE).toBe('Provider session initialized')
    expect(typeof providerInitDetailFromRunEvent).toBe('function')
  })

  it('exposes the RunLog Fabric canonical subpaths', () => {
    const packageJson = readPackageJson()

    expect(packageJson.exports?.['./core']).toEqual({
      import: './dist/core/index.js',
      types: './dist/core/index.d.ts',
    })
    expect(packageJson.exports?.['./adapters/sqlite']).toEqual({
      import: './dist/adapters/sqlite/index.js',
      types: './dist/adapters/sqlite/index.d.ts',
    })
    expect(packageJson.exports?.['./hosts/runlog']).toEqual({
      import: './dist/hosts/runlog/index.js',
      types: './dist/hosts/runlog/index.d.ts',
    })
  })

  it('uses package imports for internal protocol and control contracts', () => {
    const packageJson = readPackageJson()

    expect(packageJson.imports?.['#protocol']?.default).toBe('./dist/protocol/index.js')
    expect(packageJson.imports?.['#protocol/node']?.default).toBe('./dist/protocol/node.js')
    expect(packageJson.imports?.['#control']?.default).toBe('./dist/control/index.js')
  })
})
