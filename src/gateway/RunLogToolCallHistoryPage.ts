import {
  consoleRunLogToolCall,
  type ConsoleGatewayRunLogToolCall,
} from './ConsoleSnapshotAdapter.js'
import type {
  ListRunLogToolCallSummariesInput,
  RunLogToolCallListCursor,
  RunLogToolCallSummary,
} from '../core/types.js'

export type RunLogToolCallHistoryPageSource = {
  list(input?: ListRunLogToolCallSummariesInput): RunLogToolCallSummary[]
}

export type RunLogToolCallHistoryPage = {
  toolCalls: ConsoleGatewayRunLogToolCall[]
  nextCursor?: RunLogToolCallListCursor
}

/**
 * Bounded, canonical RunLog tool-call history. The source is deliberately the
 * durable RunLog projection rather than the mailbox compatibility inventory.
 */
export function listRunLogToolCallHistoryPage(
  source: RunLogToolCallHistoryPageSource,
  input: ListRunLogToolCallSummariesInput & { limit: number },
): RunLogToolCallHistoryPage {
  const records = source.list({
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.before ? { before: input.before } : {}),
    limit: input.limit + 1,
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)
  return {
    toolCalls: page.map(consoleRunLogToolCall),
    ...(hasMore && last ? { nextCursor: { latestSeq: last.latestSeq } } : {}),
  }
}
