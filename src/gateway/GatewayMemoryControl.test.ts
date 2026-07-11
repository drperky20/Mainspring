import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createJsonlMemoryStore, listStoredMemoryEntries } from '../memory/MemoryStore.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { consoleMemoryEntryId } from './ConsoleSnapshotAdapter.js'
import { GatewayMemoryControl } from './GatewayMemoryControl.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    removeTempRoot(root)
  }
  tempRoots.length = 0
})

function removeTempRoot(root: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

describe('GatewayMemoryControl', () => {
  it('corrects and deletes opaque workspace memory with durable decision evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-memory-mutations-'))
    tempRoots.push(root)
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const control = new GatewayMemoryControl(appState)

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_memory_mutation',
        name: 'Memory Mutation Workspace',
        root: workspaceRoot,
      })
      const original = createJsonlMemoryStore().write({
        workspaceRoot,
        text: 'The launch brief is awaiting final approval.',
        scope: 'workspace',
        tags: ['launch'],
      })
      const entryId = consoleMemoryEntryId(original.entryId)

      const corrected = control.correct({
        workspaceId: workspace.workspaceId,
        entryId,
        text: 'The launch brief is approved and scheduled for delivery.',
        reason: 'The approval decision is final.',
        actor: 'operator_memory',
      })
      expect(corrected).toMatchObject({
        workspaceId: workspace.workspaceId,
        entry: {
          entryId: original.entryId,
          text: 'The launch brief is approved and scheduled for delivery.',
          tags: ['launch'],
          metadata: {
            provenance: expect.objectContaining({
              source: 'gateway.memory.correct',
              reviewed: true,
              scanStatus: 'pass',
            }),
          },
        },
      })
      expect(listStoredMemoryEntries(workspaceRoot)).toEqual([corrected.entry])

      const journalPath = path.join(workspaceRoot, '.mainspring', 'memory.jsonl')
      const correctedJournal = fs.readFileSync(journalPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(correctedJournal.at(-1)).toMatchObject({
        kind: 'memory.replaced',
        targetEntryId: original.entryId,
        actor: 'operator_memory',
        metadata: {
          operation: 'memory.replace',
          state: 'allow',
        },
      })

      const correctionAudit = appState.auditEvents.list({ category: 'memory' })
      expect(correctionAudit).toEqual([
        expect.objectContaining({
          action: 'entry.corrected',
          actor: 'operator_memory',
          targetType: 'memory-entry',
          targetId: entryId,
          metadata: expect.objectContaining({
            workspaceId: workspace.workspaceId,
            decisionRecord: expect.objectContaining({
              operation: 'memory.replace',
              inputHash: expect.any(String),
            }),
          }),
        }),
      ])
      expect(JSON.stringify(correctionAudit)).not.toContain('The launch brief is approved')

      const deleted = control.delete({
        workspaceId: workspace.workspaceId,
        entryId,
        actor: 'operator_memory',
      })
      expect(deleted).toMatchObject({
        workspaceId: workspace.workspaceId,
        entryId,
        deletedAt: expect.any(String),
      })
      expect(listStoredMemoryEntries(workspaceRoot)).toEqual([])
      expect(appState.auditEvents.list({ category: 'memory' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'entry.deleted',
            targetId: entryId,
            metadata: expect.objectContaining({
              decisionRecord: expect.objectContaining({ operation: 'memory.delete' }),
            }),
          }),
        ]),
      )

      expect(() => control.correct({
        workspaceId: workspace.workspaceId,
        entryId,
        text: 'apiKey=sk-or-secret',
      })).toThrow('Memory entry is unavailable')
    } finally {
      appState.close()
    }
  })
})
