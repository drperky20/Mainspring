import { describe, expect, it } from 'vitest'
import {
  MAINSPRING_RUNTIME_IDENTITY,
  createMainspring,
} from './index.js'

describe('mainspring package identity', () => {
  it('exports a standalone Mainspring runtime identity', () => {
    expect(MAINSPRING_RUNTIME_IDENTITY).toEqual({
      productName: 'Mainspring',
      owner: 'Mainspring OSS',
      implementation: 'typescript-agentic-runtime',
      canonicalRuntime: 'runlog-fabric',
      transport: 'mailbox',
      compatibilityTransport: 'per-session-sqlite-mailbox',
    })
    expect(MAINSPRING_RUNTIME_IDENTITY.canonicalRuntime).toBe('runlog-fabric')
    expect(MAINSPRING_RUNTIME_IDENTITY.transport).toBe('mailbox')
  })

  it('exports the Mainspring SDK factory', () => {
    expect(typeof createMainspring).toBe('function')
  })
})
