import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LocalGatewayWorkspaceRecord } from './AppStateStore.js'
import { listMemoryHistoryPage } from './MemoryHistoryPage.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeWorkspace(): LocalGatewayWorkspaceRecord {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-memory-history-page-'))
  tempRoots.push(root)
  const memoryDirectory = path.join(root, '.mainspring')
  fs.mkdirSync(memoryDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(memoryDirectory, 'memory.jsonl'),
    [
      {
        entryId: 'memory_newest',
        workspaceRoot: root,
        scope: 'workspace',
        text: 'Newest operator note workspaceRoot=C:/private/memory-root',
        tags: ['recent', 'filePath=/private/memory-tag.txt'],
        createdAt: '2026-07-10T12:03:00.000Z',
        metadata: { privateMemorySource: 'must-not-cross-the-browser-boundary' },
      },
      {
        entryId: 'memory_middle',
        workspaceRoot: root,
        scope: 'session',
        sessionId: 'session_memory_history',
        text: 'Session-scoped memory note.',
        tags: ['session'],
        createdAt: '2026-07-10T12:03:00.000Z',
      },
      {
        entryId: 'memory_oldest',
        workspaceRoot: root,
        scope: 'workspace',
        text: 'Older workspace memory note.',
        tags: [],
        createdAt: '2026-07-10T12:01:00.000Z',
      },
    ].map((record) => JSON.stringify(record)).join('\n').concat('\n'),
  )
  return {
    workspaceId: 'workspace_memory_history',
    name: 'Memory history workspace',
    root,
    status: 'active',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  }
}

describe('listMemoryHistoryPage', () => {
  it('pages one registered workspace with a stable cursor and browser-safe previews', () => {
    const workspace = makeWorkspace()
    const workspaceRequests: string[] = []
    const source = {
      workspaces: {
        get: (workspaceId: string) => {
          workspaceRequests.push(workspaceId)
          return workspaceId === workspace.workspaceId ? workspace : null
        },
      },
    }

    const first = listMemoryHistoryPage({
      source,
      workspaceId: workspace.workspaceId,
      limit: 2,
    })

    expect(first?.entries).toHaveLength(2)
    expect(first?.entries.map((entry) => entry.entryId)).not.toContain('memory_newest')
    expect(first?.entries.map((entry) => entry.entryId)).not.toContain('memory_middle')
    expect(first?.entries.every((entry) => /^memory_[A-Za-z0-9_-]{43}$/.test(entry.entryId))).toBe(true)
    expect(first?.nextCursor).toEqual({
      createdAt: '2026-07-10T12:03:00.000Z',
      entryId: first?.entries[1]?.entryId,
    })
    expect(first?.entries.find((entry) => entry.textPreview.startsWith('Newest operator note'))).toMatchObject({
      workspaceId: workspace.workspaceId,
      textPreview: 'Newest operator note [redacted]',
      tags: ['recent', '[redacted]'],
    })
    expect(JSON.stringify(first)).not.toContain('privateMemorySource')
    expect(JSON.stringify(first)).not.toContain('private/memory-root')
    expect(JSON.stringify(first)).not.toContain('private/memory-tag.txt')
    expect(workspaceRequests).toEqual([workspace.workspaceId])

    const second = listMemoryHistoryPage({
      source,
      workspaceId: workspace.workspaceId,
      limit: 2,
      before: first?.nextCursor,
    })
    expect(second?.entries).toMatchObject([
      { textPreview: 'Older workspace memory note.' },
    ])
    expect(second?.entries[0]?.entryId).not.toBe('memory_oldest')
    expect(second?.nextCursor).toBeUndefined()
  })

  it('refuses an unknown workspace instead of accepting a host path', () => {
    const workspace = makeWorkspace()
    const source = {
      workspaces: {
        get: () => null,
      },
    }

    expect(listMemoryHistoryPage({
      source,
      workspaceId: workspace.workspaceId,
      limit: 25,
    })).toBeNull()
  })
})
