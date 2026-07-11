import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryContext } from './MemoryContext.js'
import { createJsonlMemoryStore, listStoredMemoryEntries } from './MemoryStore.js'

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

  it('replays append-only corrections and tombstones across store restarts', () => {
    const workspaceRoot = makeWorkspaceRoot()
    const store = createJsonlMemoryStore()
    const original = store.write({
      workspaceRoot,
      entryId: 'memory_operator_note',
      text: 'The launch checklist is ready for review.',
      tags: ['launch'],
      metadata: { source: 'operator-note' },
      createdAt: '2026-07-10T12:00:00.000Z',
    })

    const corrected = store.replace({
      workspaceRoot,
      entryId: original.entryId,
      text: 'The launch checklist is approved for the next scheduled review.',
      tags: ['launch', 'approved'],
      actor: 'operator_1',
      reason: 'The review status changed.',
      replacedAt: '2026-07-10T12:05:00.000Z',
    })

    expect(corrected).toMatchObject({
      entryId: original.entryId,
      text: 'The launch checklist is approved for the next scheduled review.',
      tags: ['launch', 'approved'],
      createdAt: original.createdAt,
      metadata: { source: 'operator-note' },
    })
    expect(createJsonlMemoryStore().list({ workspaceRoot, limit: 10 })).toEqual([corrected])

    const memoryPath = path.join(workspaceRoot, '.mainspring', 'memory.jsonl')
    const journal = fs.readFileSync(memoryPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(journal).toHaveLength(2)
    expect(journal[1]).toMatchObject({
      kind: 'memory.replaced',
      targetEntryId: original.entryId,
      actor: 'operator_1',
      reason: 'The review status changed.',
    })

    // A partial final line is ignored on recovery, so a process interruption
    // never applies half of a correction.
    fs.appendFileSync(memoryPath, '{"kind":"memory.replaced"')
    expect(listStoredMemoryEntries(workspaceRoot)).toEqual([corrected])

    const deletion = store.delete({
      workspaceRoot,
      entryId: original.entryId,
      actor: 'operator_1',
      reason: 'The memory is no longer needed.',
      deletedAt: '2026-07-10T12:10:00.000Z',
    })
    expect(deletion).toEqual({
      entryId: original.entryId,
      deletedAt: '2026-07-10T12:10:00.000Z',
    })
    expect(createJsonlMemoryStore().list({ workspaceRoot, limit: 10 })).toEqual([])
  })

  it('keeps legacy entries without stored IDs stable and rejects secret journal metadata', () => {
    const workspaceRoot = makeWorkspaceRoot()
    const memoryDirectory = path.join(workspaceRoot, '.mainspring')
    fs.mkdirSync(memoryDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(memoryDirectory, 'memory.jsonl'),
      `${JSON.stringify({
        workspaceRoot: 'C:\\untrusted\\workspace',
        scope: 'workspace',
        text: 'Legacy memory remains available for correction.',
        tags: ['legacy'],
        createdAt: '2026-07-10T12:00:00.000Z',
      })}\n`,
    )

    const first = listStoredMemoryEntries(workspaceRoot)
    const second = listStoredMemoryEntries(workspaceRoot)
    expect(first).toHaveLength(1)
    expect(first[0]?.entryId).toMatch(/^memory_legacy_[A-Za-z0-9_-]{43}$/)
    expect(second[0]?.entryId).toBe(first[0]?.entryId)
    expect(first[0]?.workspaceRoot).toBe(fs.realpathSync.native(workspaceRoot))

    const store = createJsonlMemoryStore()
    expect(() => store.delete({
      workspaceRoot,
      entryId: first[0]!.entryId,
      reason: 'token=sk-or-secret',
    })).toThrow('raw secret material')
    expect(store.replace({
      workspaceRoot,
      entryId: first[0]!.entryId,
      text: 'Corrected legacy memory remains durable.',
    })).toMatchObject({
      entryId: first[0]!.entryId,
      text: 'Corrected legacy memory remains durable.',
    })
  })
})
