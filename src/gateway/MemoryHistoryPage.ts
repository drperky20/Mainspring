import {
  consoleMemoryEntry,
  consoleMemoryEntryId,
  type ConsoleGatewayMemoryEntry,
} from './ConsoleSnapshotAdapter.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'
import {
  listStoredMemoryEntries,
  type MemoryRecord,
} from '../memory/MemoryStore.js'

export type MemoryHistoryCursor = {
  createdAt: string
  entryId: string
}

export type MemoryHistoryPageSource = {
  workspaces: Pick<LocalGatewayAppStateStore['workspaces'], 'get'>
}

export type MemoryHistoryPage = {
  entries: ConsoleGatewayMemoryEntry[]
  nextCursor?: MemoryHistoryCursor
}

export type ResolvedMemoryHistoryEntry = {
  workspaceId: string
  workspaceRoot: string
  record: MemoryRecord
}

/**
 * Browser-safe, reverse-paginated memory history for one gateway-registered
 * workspace. The browser supplies an opaque workspace ID, never a host path;
 * JSONL persistence remains the canonical source and is read only for that
 * registered workspace.
 */
export function listMemoryHistoryPage(input: {
  source: MemoryHistoryPageSource
  workspaceId: string
  limit: number
  before?: MemoryHistoryCursor
}): MemoryHistoryPage | null {
  const workspace = input.source.workspaces.get(input.workspaceId)
  if (!workspace) return null

  const records = listStoredMemoryEntries(workspace.root)
    .map((record) => ({ record, cursorEntryId: consoleMemoryEntryId(record.entryId) }))
    .sort(compareMemoryHistoryRecords)
    .filter((record) => !input.before || isBeforeMemoryHistoryCursor(record, input.before))
    .slice(0, input.limit + 1)
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)

  return {
    entries: page.map(({ record }) => consoleMemoryEntry(record, workspace.workspaceId)),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.record.createdAt, entryId: last.cursorEntryId } }
      : {}),
  }
}

/**
 * Resolves a browser-visible opaque memory identifier only through a
 * gateway-registered workspace. Callers receive the host record only after
 * both the workspace and the opaque entry identity match exactly.
 */
export function resolveMemoryHistoryEntry(input: {
  source: MemoryHistoryPageSource
  workspaceId: string
  entryId: string
}): ResolvedMemoryHistoryEntry | null {
  const workspace = input.source.workspaces.get(input.workspaceId)
  if (!workspace) return null
  const matches = listStoredMemoryEntries(workspace.root)
    .filter((record) => consoleMemoryEntryId(record.entryId) === input.entryId)
  if (matches.length !== 1) return null
  return {
    workspaceId: workspace.workspaceId,
    workspaceRoot: workspace.root,
    record: matches[0]!,
  }
}

type MemoryHistoryRecord = {
  record: MemoryRecord
  cursorEntryId: string
}

function compareMemoryHistoryRecords(left: MemoryHistoryRecord, right: MemoryHistoryRecord): number {
  return right.record.createdAt.localeCompare(left.record.createdAt)
    || right.cursorEntryId.localeCompare(left.cursorEntryId)
}

function isBeforeMemoryHistoryCursor(
  record: MemoryHistoryRecord,
  cursor: MemoryHistoryCursor,
): boolean {
  return record.record.createdAt < cursor.createdAt
    || (record.record.createdAt === cursor.createdAt && record.cursorEntryId < cursor.entryId)
}
