import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryContext } from './MemoryContext.js'
import { createJsonlMemoryStore } from './MemoryStore.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeWorkspaceRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-memory-store-'))
  tempRoots.push(root)
  return root
}

describe('JsonlMemoryStore', () => {
  it('stores workspace and session memory with scoped lookup', () => {
    const workspaceRoot = makeWorkspaceRoot()
    const store = createJsonlMemoryStore()

    store.write({
      workspaceRoot,
      text: 'Remember the founder cockpit positioning.',
      tags: ['positioning'],
    })
    store.write({
      workspaceRoot,
      sessionId: 'session_alpha',
      scope: 'session',
      text: 'Remember the current session note.',
      tags: ['session'],
    })

    const combined = store.list({
      workspaceRoot,
      sessionId: 'session_alpha',
      scope: 'all',
      limit: 10,
    })
    expect(combined).toHaveLength(2)
    expect(combined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'workspace',
          text: 'Remember the founder cockpit positioning.',
        }),
        expect.objectContaining({
          scope: 'session',
          sessionId: 'session_alpha',
          text: 'Remember the current session note.',
        }),
      ]),
    )

    expect(
      store.list({
        workspaceRoot,
        sessionId: 'session_beta',
        scope: 'all',
        limit: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        scope: 'workspace',
        text: 'Remember the founder cockpit positioning.',
      }),
    ])

    expect(
      store.list({
        workspaceRoot,
        sessionId: 'session_alpha',
        scope: 'session',
        query: 'current session',
        limit: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        scope: 'session',
        sessionId: 'session_alpha',
        tags: ['session'],
      }),
    ])
  })

  it('creates a scoped memory context with default workspace and session lookup', () => {
    const workspaceRoot = makeWorkspaceRoot()
    const memory = createMemoryContext({
      workspaceRoot,
      sessionId: 'session_context',
    })

    memory.remember({
      text: 'Workspace truth survives across sessions.',
      scope: 'workspace',
      tags: ['workspace'],
    })
    memory.remember({
      text: 'Session-only detail for the current operator turn.',
      scope: 'session',
      tags: ['session'],
    })

    const remembered = memory.read({ scope: 'all', limit: 10 })
    expect(remembered).toHaveLength(2)
    expect(remembered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'workspace', tags: ['workspace'] }),
        expect.objectContaining({
          scope: 'session',
          sessionId: 'session_context',
          tags: ['session'],
        }),
      ]),
    )
  })

  it('rejects raw secret material in memory text, tags, and metadata', () => {
    const workspaceRoot = makeWorkspaceRoot()
    const store = createJsonlMemoryStore()

    expect(() =>
      store.write({
        workspaceRoot,
        text: 'apiKey=sk-or-secret',
      }),
    ).toThrow('raw secret material')

    expect(() =>
      store.write({
        workspaceRoot,
        text: 'safe',
        tags: ['token=sk-or-secret'],
      }),
    ).toThrow('raw secret material')

    expect(() =>
      store.write({
        workspaceRoot,
        text: 'safe',
        metadata: { authorization: 'Bearer sk-or-secret' },
      }),
    ).toThrow('raw secret material')
  })
})
