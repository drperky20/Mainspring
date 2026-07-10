import {
  consoleUsageLedgerEntry,
  type ConsoleGatewayUsageLedgerEntry,
} from './ConsoleSnapshotAdapter.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayUsageLedgerCursor,
} from './AppStateStore.js'

export type UsageHistoryPageSource = {
  usageLedger: Pick<LocalGatewayAppStateStore['usageLedger'], 'list'>
}

export type UsageHistoryPage = {
  entries: ConsoleGatewayUsageLedgerEntry[]
  nextCursor?: LocalGatewayUsageLedgerCursor
}

/**
 * Bounded browser-safe usage history. The aggregate snapshot remains a
 * compatibility surface, while detailed operator history can advance without
 * serializing the entire durable ledger on every refresh.
 */
export function listUsageHistoryPage(input: {
  source: UsageHistoryPageSource
  limit: number
  before?: LocalGatewayUsageLedgerCursor
}): UsageHistoryPage {
  const records = input.source.usageLedger.list({
    ...(input.before ? { before: input.before } : {}),
    limit: input.limit + 1,
    order: 'desc',
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)
  return {
    entries: page.map(consoleUsageLedgerEntry),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.createdAt, entryId: last.entryId } }
      : {}),
  }
}
