import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyApprovedMemoryReview,
  scanMemoryMutation,
  stageProvenanceReview,
} from '../provenance/ProvenanceReview.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { consoleAuditEvent } from './ConsoleSnapshotAdapter.js'
import { GatewayProvenanceReviewControl } from './GatewayProvenanceReviewControl.js'

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
        !(error instanceof Error)
        || !('code' in error)
        || (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

describe('GatewayProvenanceReviewControl', () => {
  it('records trusted authority before deciding or applying a staged memory review', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-provenance-control-'))
    tempRoots.push(root)
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const text = 'Remember the approved control boundary.'
    const scan = scanMemoryMutation({ text, scope: 'workspace', tags: ['control'] })
    const staged = stageProvenanceReview({
      workspaceRoot,
      source: 'tool:memory.write',
      mutation: {
        kind: 'memory',
        text,
        scope: 'workspace',
        tags: ['control'],
      },
      scan,
    })
    let observedPreApplyAuthorization = false
    const control = new GatewayProvenanceReviewControl({
      appState,
      applyMemoryReview: (input) => {
        const authorization = appState.auditEvents.list({ category: 'provenance' }).find((event) => (
          event.action === 'review.apply.authorized' && event.targetId === staged.reviewId
        ))
        const decision = recordValue(recordValue(authorization?.metadata)?.decisionRecord)
        observedPreApplyAuthorization = decision?.surface === 'provenance'
          && decision.operation === 'provenance.review.apply'
          && decision.state === 'allow'
        return applyApprovedMemoryReview(input)
      },
    })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_provenance_control',
        name: 'Provenance Control Workspace',
        root: workspaceRoot,
      })
      const approved = control.decide({
        workspaceId: workspace.workspaceId,
        reviewId: staged.reviewId,
        decision: 'approved',
        actor: 'hosted:user_1:operator',
        reviewer: 'browser-spoofed-reviewer',
        reason: 'Reviewed before applying.',
      })
      expect(approved.decision?.reviewer).toBe('hosted:user_1:operator')

      const decisionAuthorization = appState.auditEvents.list({ category: 'provenance' }).find((event) => (
        event.action === 'review.approved.authorized' && event.targetId === staged.reviewId
      ))
      if (!decisionAuthorization) throw new Error('Missing provenance review authorization audit event.')
      expect(decisionAuthorization).toMatchObject({
        actor: 'hosted:user_1:operator',
        metadata: {
          decisionRecord: {
            surface: 'provenance',
            operation: 'provenance.review.decide',
            state: 'allow',
            inputHash: expect.any(String),
            metadata: expect.objectContaining({
              workspaceId: workspace.workspaceId,
              reviewHash: expect.any(String),
            }),
          },
        },
      })
      expect(JSON.stringify(decisionAuthorization)).not.toContain(text)

      const applied = control.apply({
        workspaceId: workspace.workspaceId,
        reviewId: staged.reviewId,
        actor: 'hosted:user_1:operator',
      })
      expect(applied).toMatchObject({ kind: 'memory', reviewId: staged.reviewId, applied: true })
      expect(observedPreApplyAuthorization).toBe(true)

      const applyAuthorization = appState.auditEvents.list({ category: 'provenance' }).find((event) => (
        event.action === 'review.apply.authorized' && event.targetId === staged.reviewId
      ))
      if (!applyAuthorization) throw new Error('Missing provenance apply authorization audit event.')
      expect(JSON.stringify(applyAuthorization)).not.toContain(text)
      expect(consoleAuditEvent(applyAuthorization)).not.toHaveProperty('metadata')
      expect(JSON.stringify(consoleAuditEvent(applyAuthorization))).not.toContain('decisionRecord')
    } finally {
      appState.close()
    }
  })
})
