import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ListRunLogApprovalRequestsInput,
  RunLogApprovalRequestSummary,
} from '../core/types.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { listApprovalHistoryPage } from './ApprovalHistoryPage.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

describe('listApprovalHistoryPage', () => {
  it('prefers canonical RunLog rows and carries a deterministic merged cursor', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-approval-history-page-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    appState.approvals.upsert({
      approvalId: 'approval_mirror',
      runId: 'run_mirror',
      sessionId: 'session_mirror',
      status: 'pending',
      requestedAt: '2026-07-10T12:03:00.000Z',
      targetKey: 'private-mirror-target',
    })
    appState.approvals.upsert({
      approvalId: 'approval_compat_new',
      runId: 'run_compat_new',
      sessionId: 'session_compat',
      status: 'pending',
      requestedAt: '2026-07-10T12:02:00.000Z',
    })
    appState.approvals.upsert({
      approvalId: 'approval_compat_old',
      runId: 'run_compat_old',
      sessionId: 'session_compat',
      status: 'denied',
      requestedAt: '2026-07-10T12:00:00.000Z',
    })
    const runLogRecords: RunLogApprovalRequestSummary[] = [
      {
        approvalId: 'approval_mirror',
        runId: 'run_mirror',
        sessionId: 'session_mirror',
        agentId: 'agent_runlog',
        toolCallId: 'toolcall_mirror',
        toolName: 'file.write',
        status: 'approved',
        requestedAt: '2026-07-10T12:03:00.000Z',
        decidedAt: '2026-07-10T12:03:30.000Z',
      },
      {
        approvalId: 'approval_runlog_old',
        runId: 'run_runlog_old',
        sessionId: 'session_runlog',
        agentId: 'agent_runlog',
        toolCallId: 'toolcall_old',
        toolName: 'browser.open',
        status: 'cancelled',
        requestedAt: '2026-07-10T12:01:00.000Z',
      },
    ]
    const runLog = {
      list: (input: ListRunLogApprovalRequestsInput = {}) => {
        const statuses = Array.isArray(input.status)
          ? input.status
          : input.status ? [input.status] : undefined
        return runLogRecords
          .filter((record) => !statuses || statuses.includes(record.status))
          .filter((record) => !input.before
            || record.requestedAt < input.before.requestedAt
            || (
              record.requestedAt === input.before.requestedAt
              && record.approvalId < input.before.approvalId
            ))
          .slice(0, input.limit ?? runLogRecords.length)
      },
    }

    try {
      const first = listApprovalHistoryPage({ appState, runLog, limit: 2 })
      expect(first.approvals).toEqual([
        expect.objectContaining({
          approvalId: 'approval_mirror',
          source: 'runlog',
          status: 'approved',
          targetKey: 'tool:file.write',
        }),
        expect.objectContaining({ approvalId: 'approval_compat_new', source: 'compatibility' }),
      ])
      expect(first.nextCursor).toEqual({
        requestedAt: '2026-07-10T12:02:00.000Z',
        approvalId: 'approval_compat_new',
      })

      const second = listApprovalHistoryPage({
        appState,
        runLog,
        limit: 2,
        before: first.nextCursor,
      })
      expect(second.approvals.map((approval) => approval.approvalId)).toEqual([
        'approval_runlog_old',
        'approval_compat_old',
      ])
      expect(second.nextCursor).toBeUndefined()

      const cancelled = listApprovalHistoryPage({ appState, runLog, limit: 2, status: 'cancelled' })
      expect(cancelled.approvals).toEqual([
        expect.objectContaining({ approvalId: 'approval_runlog_old', source: 'runlog' }),
      ])
    } finally {
      appState.close()
    }
  })
})
