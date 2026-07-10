import {
  consoleAuditEvent,
  type ConsoleGatewayAuditEvent,
} from './ConsoleSnapshotAdapter.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayAuditEventCursor,
} from './AppStateStore.js'

export type AuditHistoryPageSource = {
  auditEvents: Pick<LocalGatewayAppStateStore['auditEvents'], 'list'>
}

export type AuditHistoryPage = {
  events: ConsoleGatewayAuditEvent[]
  nextCursor?: LocalGatewayAuditEventCursor
}

/**
 * Bounded browser-safe authority/audit history. The page keeps event metadata
 * in app-state while retaining the stable fields operators need to inspect
 * local mutations and decisions.
 */
export function listAuditHistoryPage(input: {
  source: AuditHistoryPageSource
  limit: number
  before?: LocalGatewayAuditEventCursor
}): AuditHistoryPage {
  const records = input.source.auditEvents.list({
    ...(input.before ? { before: input.before } : {}),
    limit: input.limit + 1,
    order: 'desc',
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)
  return {
    events: page.map(consoleAuditEvent),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.createdAt, eventId: last.eventId } }
      : {}),
  }
}
