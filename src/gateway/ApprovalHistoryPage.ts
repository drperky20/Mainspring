import type {
  ListRunLogApprovalRequestsInput,
  RunLogApprovalRequestSummary,
} from '../core/types.js'
import {
  consoleApprovalMetadata,
  type ConsoleGatewayApprovalMetadata,
} from './ConsoleSnapshotAdapter.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'

export type ApprovalHistoryStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export type ApprovalHistoryCursor = {
  requestedAt: string
  approvalId: string
}

export type ApprovalHistoryRow = Omit<ConsoleGatewayApprovalMetadata, 'status'> & {
  status: ApprovalHistoryStatus
  source: 'compatibility' | 'runlog'
}

export type ApprovalHistoryPage = {
  approvals: ApprovalHistoryRow[]
  nextCursor?: ApprovalHistoryCursor
}

export type ApprovalHistoryRunLogSource = {
  list(input?: ListRunLogApprovalRequestsInput): RunLogApprovalRequestSummary[]
}

const SOURCE_FETCH_MULTIPLIER = 3

/**
 * Merges only bounded compatibility metadata and the canonical RunLog approval
 * ledger. The returned rows are already browser-safe summaries: receipt
 * snapshots, tool input, workspace paths, hashes, and signing material never
 * enter this read model.
 */
export function listApprovalHistoryPage(input: {
  appState: LocalGatewayAppStateStore
  runLog?: ApprovalHistoryRunLogSource
  limit: number
  before?: ApprovalHistoryCursor
  status?: ApprovalHistoryStatus
}): ApprovalHistoryPage {
  const sourceLimit = input.limit * SOURCE_FETCH_MULTIPLIER + 1
  const compatibility = input.status === 'cancelled'
    ? []
    : input.appState.approvals.list({
        ...(input.status ? { status: input.status } : {}),
        ...(input.before ? { before: input.before } : {}),
        limit: sourceLimit,
        order: 'desc',
      }).map((record): ApprovalHistoryRow => ({
        ...consoleApprovalMetadata(record),
        source: 'compatibility',
      }))
  const runLog = input.runLog?.list({
    ...(input.status ? { status: input.status } : {}),
    ...(input.before ? { before: input.before } : {}),
    limit: sourceLimit,
  }).map((record): ApprovalHistoryRow => ({
    approvalId: record.approvalId,
    runId: record.runId,
    sessionId: record.sessionId,
    ...(record.agentId ? { agentId: record.agentId } : {}),
    status: record.status,
    requestedAt: record.requestedAt,
    ...(record.decidedAt ? { resolvedAt: record.decidedAt } : {}),
    ...(record.toolName ? { targetKey: `tool:${record.toolName}` } : {}),
    source: 'runlog',
  })) ?? []

  const merged = new Map<string, ApprovalHistoryRow>()
  for (const approval of compatibility) merged.set(approval.approvalId, approval)
  // A canonical RunLog row replaces a mirrored compatibility record with the
  // same id, including after a gateway-originated approval decision.
  for (const approval of runLog) merged.set(approval.approvalId, approval)
  const records = [...merged.values()].sort(sortApprovalHistoryNewestFirst)
  const approvals = records.slice(0, input.limit)
  const last = approvals.at(-1)
  const hasMore = records.length > input.limit
    || compatibility.length === sourceLimit
    || runLog.length === sourceLimit
  return {
    approvals,
    ...(hasMore && last
      ? { nextCursor: { requestedAt: last.requestedAt, approvalId: last.approvalId } }
      : {}),
  }
}

function sortApprovalHistoryNewestFirst(left: ApprovalHistoryRow, right: ApprovalHistoryRow): number {
  return right.requestedAt.localeCompare(left.requestedAt)
    || right.approvalId.localeCompare(left.approvalId)
}
