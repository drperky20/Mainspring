import { describe, expect, it } from 'vitest'
import type { LocalGatewayAuditEventRecord } from './AppStateStore.js'
import { listAuditHistoryPage } from './AuditHistoryPage.js'

function auditEvent(eventId: string, createdAt: string): LocalGatewayAuditEventRecord {
  return {
    eventId,
    category: 'gateway',
    action: `client.updated ${eventId}`,
    actor: 'local-operator',
    targetType: 'client',
    targetId: `client_${eventId}`,
    runId: `run_${eventId}`,
    sessionId: 'session_audit_history',
    createdAt,
    metadata: { privateDecisionSnapshot: 'must-not-cross-the-browser-boundary' },
  }
}

describe('listAuditHistoryPage', () => {
  it('uses a stable reverse cursor and omits audit metadata from browser rows', () => {
    const records = [
      auditEvent('audit_newest', '2026-07-10T12:03:00.000Z'),
      auditEvent('audit_middle', '2026-07-10T12:02:00.000Z'),
      auditEvent('audit_oldest', '2026-07-10T12:01:00.000Z'),
    ]
    const listCalls: Array<Record<string, unknown>> = []
    const source = {
      auditEvents: {
        list: (input: { before?: { createdAt: string; eventId: string }; limit?: number } = {}) => {
          listCalls.push(input)
          return records
            .filter((record) => !input.before
              || record.createdAt < input.before.createdAt
              || (
                record.createdAt === input.before.createdAt
                && record.eventId < input.before.eventId
              ))
            .slice(0, input.limit)
        },
      },
    }

    const first = listAuditHistoryPage({ source, limit: 2 })
    expect(first.events.map((record) => record.eventId)).toEqual(['audit_newest', 'audit_middle'])
    expect(first.nextCursor).toEqual({
      createdAt: '2026-07-10T12:02:00.000Z',
      eventId: 'audit_middle',
    })
    expect(listCalls).toEqual([{ limit: 3, order: 'desc' }])
    expect(JSON.stringify(first)).not.toContain('privateDecisionSnapshot')

    const second = listAuditHistoryPage({
      source,
      limit: 2,
      before: first.nextCursor,
    })
    expect(second.events.map((record) => record.eventId)).toEqual(['audit_oldest'])
    expect(second.nextCursor).toBeUndefined()
  })
})
