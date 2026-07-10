import { describe, expect, it } from 'vitest'
import type { LocalGatewayUsageLedgerEntryRecord } from './AppStateStore.js'
import { listUsageHistoryPage } from './UsageHistoryPage.js'

function entry(entryId: string, createdAt: string): LocalGatewayUsageLedgerEntryRecord {
  return {
    entryId,
    runId: `run_${entryId}`,
    sessionId: 'session_usage_history',
    workspaceId: 'workspace_usage_history',
    providerId: 'openrouter',
    modelId: 'openrouter/auto',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    estimatedCostUsd: 0.001,
    createdAt,
    metadata: { privateRateLimitHeader: 'must-not-cross-the-browser-boundary' },
  }
}

describe('listUsageHistoryPage', () => {
  it('uses a stable reverse cursor and omits ledger metadata from browser rows', () => {
    const records = [
      entry('usage_newest', '2026-07-10T12:03:00.000Z'),
      entry('usage_middle', '2026-07-10T12:02:00.000Z'),
      entry('usage_oldest', '2026-07-10T12:01:00.000Z'),
    ]
    const listCalls: Array<Record<string, unknown>> = []
    const source = {
      usageLedger: {
        list: (input: { before?: { createdAt: string; entryId: string }; limit?: number } = {}) => {
          listCalls.push(input)
          return records
            .filter((record) => !input.before
              || record.createdAt < input.before.createdAt
              || (
                record.createdAt === input.before.createdAt
                && record.entryId < input.before.entryId
              ))
            .slice(0, input.limit)
        },
      },
    }

    const first = listUsageHistoryPage({ source, limit: 2 })
    expect(first.entries.map((record) => record.entryId)).toEqual(['usage_newest', 'usage_middle'])
    expect(first.nextCursor).toEqual({
      createdAt: '2026-07-10T12:02:00.000Z',
      entryId: 'usage_middle',
    })
    expect(listCalls).toEqual([{ limit: 3, order: 'desc' }])
    expect(JSON.stringify(first)).not.toContain('must-not-cross-the-browser-boundary')

    const second = listUsageHistoryPage({
      source,
      limit: 2,
      before: first.nextCursor,
    })
    expect(second.entries.map((record) => record.entryId)).toEqual(['usage_oldest'])
    expect(second.nextCursor).toBeUndefined()
  })
})
