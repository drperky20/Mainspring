import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  createMainspringRuntimeId,
  redactRuntimeSensitiveText,
  sanitizeRuntimeResponse,
} from '#protocol'
import { assertPathContained } from '#protocol/node'

export type MemoryScope = 'workspace' | 'session'

export interface MemoryRecord {
  entryId: string
  workspaceRoot: string
  scope: MemoryScope
  sessionId?: string
  text: string
  tags: string[]
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface WriteMemoryInput {
  workspaceRoot: string
  text: string
  scope?: MemoryScope
  sessionId?: string
  tags?: readonly string[]
  metadata?: Record<string, unknown>
  createdAt?: string
  entryId?: string
}

export interface ListMemoryInput {
  workspaceRoot: string
  scope?: MemoryScope | 'all'
  sessionId?: string
  query?: string
  tags?: readonly string[]
  limit?: number
}

export interface DeleteMemoryInput {
  workspaceRoot: string
  entryId: string
  actor?: string
  reason?: string
  journalMetadata?: Record<string, unknown>
  deletedAt?: string
}

export interface ReplaceMemoryInput {
  workspaceRoot: string
  entryId: string
  text: string
  scope?: MemoryScope
  sessionId?: string
  tags?: readonly string[]
  metadata?: Record<string, unknown>
  actor?: string
  reason?: string
  journalMetadata?: Record<string, unknown>
  replacedAt?: string
}

export interface MemoryDeletionResult {
  entryId: string
  deletedAt: string
}

export interface MemoryStore {
  write(input: WriteMemoryInput): MemoryRecord
  list(input: ListMemoryInput): MemoryRecord[]
}

/**
 * Optional mutation capability for stores that can preserve logical memory
 * identity while appending a durable correction or deletion record. Keeping it
 * separate from MemoryStore preserves compatibility with read/write-only
 * custom stores supplied to context assembly.
 */
export interface MutableMemoryStore extends MemoryStore {
  delete(input: DeleteMemoryInput): MemoryDeletionResult
  replace(input: ReplaceMemoryInput): MemoryRecord
}

const MEMORY_DIR = '.mainspring'
const MEMORY_FILE = 'memory.jsonl'

function memoryFilePath(workspaceRoot: string): string {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  return assertPathContained(
    resolvedWorkspaceRoot,
    path.join(resolvedWorkspaceRoot, MEMORY_DIR, MEMORY_FILE),
  )
}

function assertNoRawSecretMaterial(value: unknown, label: string): void {
  const sanitized = sanitizeRuntimeResponse(value)
  if (JSON.stringify(sanitized) !== JSON.stringify(value)) {
    throw new Error(`${label} must not contain raw secret material.`)
  }
  if (typeof value === 'string' && redactRuntimeSensitiveText(value) !== value) {
    throw new Error(`${label} must not contain raw secret material.`)
  }
}

function normalizeTags(value: readonly string[] | undefined): string[] {
  return (value ?? [])
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 16)
}

function optionalJournalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  assertNoRawSecretMaterial(text, label)
  return text.slice(0, maxLength)
}

function legacyEntryId(workspaceRoot: string, line: string, lineNumber: number): string {
  const digest = createHash('sha256')
    .update(workspaceRoot)
    .update('\u0000')
    .update(String(lineNumber))
    .update('\u0000')
    .update(line)
    .digest('base64url')
  return `memory_legacy_${digest}`
}

function parseMemoryRecord(
  value: unknown,
  workspaceRoot: string,
  fallbackEntryId: string,
): MemoryRecord | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const parsed = value as Partial<MemoryRecord>
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    if (parsed.scope !== 'workspace' && parsed.scope !== 'session') return null
    if (parsed.scope === 'session' && (!parsed.sessionId || typeof parsed.sessionId !== 'string')) {
      return null
    }
    const text = parsed.text.trim().slice(0, 8_000)
    const tags = normalizeTags(Array.isArray(parsed.tags) ? parsed.tags : [])
    assertNoRawSecretMaterial(text, 'memory text')
    for (const tag of tags) assertNoRawSecretMaterial(tag, 'memory tags')
    const metadata =
      parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
        ? parsed.metadata as Record<string, unknown>
        : undefined
    if (metadata) assertNoRawSecretMaterial(metadata, 'memory metadata')
    return {
      entryId:
        typeof parsed.entryId === 'string' && parsed.entryId.trim()
          ? parsed.entryId.trim()
          : fallbackEntryId,
      // Memory journals are scoped by the file that contains them. Never
      // trust a workspace root embedded in a user-controlled JSONL row.
      workspaceRoot,
      scope: parsed.scope,
      ...(typeof parsed.sessionId === 'string' && parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      text,
      tags,
      createdAt:
        typeof parsed.createdAt === 'string' && parsed.createdAt
          ? parsed.createdAt
          : new Date(0).toISOString(),
      ...(metadata ? { metadata } : {}),
    }
  } catch {
    return null
  }
}

type MemoryJournalEntry =
  | { kind: 'memory.record'; record: MemoryRecord }
  | { kind: 'memory.deleted'; targetEntryId: string }
  | { kind: 'memory.replaced'; targetEntryId: string; replacement: MemoryRecord }

function journalTargetEntryId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseMemoryJournalLine(
  line: string,
  workspaceRoot: string,
  lineNumber: number,
): MemoryJournalEntry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (parsed.kind === 'memory.deleted') {
      const targetEntryId = journalTargetEntryId(parsed.targetEntryId)
      const deletedAt = typeof parsed.deletedAt === 'string' ? parsed.deletedAt.trim() : ''
      return targetEntryId && deletedAt ? { kind: 'memory.deleted', targetEntryId } : null
    }
    if (parsed.kind === 'memory.replaced') {
      const targetEntryId = journalTargetEntryId(parsed.targetEntryId)
      const replacedAt = typeof parsed.replacedAt === 'string' ? parsed.replacedAt.trim() : ''
      if (!targetEntryId || !replacedAt) return null
      const replacement = parseMemoryRecord(
        parsed.replacement,
        workspaceRoot,
        targetEntryId,
      )
      return replacement?.entryId === targetEntryId
        ? { kind: 'memory.replaced', targetEntryId, replacement }
        : null
    }
    const record = parseMemoryRecord(
      parsed,
      workspaceRoot,
      legacyEntryId(workspaceRoot, line, lineNumber),
    )
    return record ? { kind: 'memory.record', record } : null
  } catch {
    return null
  }
}

function readEntries(workspaceRoot: string): MemoryRecord[] {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  const filePath = memoryFilePath(resolvedWorkspaceRoot)
  if (!fs.existsSync(filePath)) return []
  const entries: MemoryRecord[] = []
  for (const [lineNumber, rawLine] of fs.readFileSync(filePath, 'utf8').split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line) continue
    const journal = parseMemoryJournalLine(line, resolvedWorkspaceRoot, lineNumber)
    if (!journal) continue
    if (journal.kind === 'memory.record') {
      entries.push(journal.record)
      continue
    }
    const matches = entries
      .map((entry, index) => entry.entryId === journal.targetEntryId ? index : -1)
      .filter((index) => index >= 0)
    // A mutation is only applied when the target has one unambiguous active
    // identity. Hand-authored malformed journal rows therefore fail closed.
    if (matches.length !== 1) continue
    if (journal.kind === 'memory.deleted') {
      entries.splice(matches[0]!, 1)
    } else {
      entries[matches[0]!] = journal.replacement
    }
  }
  return entries
}

export function listStoredMemoryEntries(workspaceRoot: string): MemoryRecord[] {
  if (!fs.existsSync(workspaceRoot)) return []
  return readEntries(workspaceRoot)
}

function queryMatches(entry: MemoryRecord, query: string): boolean {
  if (!query) return true
  const haystack = `${entry.text} ${entry.tags.join(' ')}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

function tagsMatch(entry: MemoryRecord, tags: string[]): boolean {
  if (tags.length === 0) return true
  const available = new Set(entry.tags.map((tag) => tag.toLowerCase()))
  return tags.every((tag) => available.has(tag.toLowerCase()))
}

function scopeMatches(entry: MemoryRecord, input: ListMemoryInput): boolean {
  if (input.scope === 'workspace') return entry.scope === 'workspace'
  if (input.scope === 'session') {
    return entry.scope === 'session' && Boolean(input.sessionId) && entry.sessionId === input.sessionId
  }
  if (entry.scope === 'workspace') return true
  if (!input.sessionId) return false
  return entry.sessionId === input.sessionId
}

function memoryRecordFromInput(input: WriteMemoryInput, resolvedWorkspaceRoot: string): MemoryRecord {
  const scope = input.scope ?? 'workspace'
  if (scope === 'session' && !input.sessionId?.trim()) {
    throw new Error('Session-scoped memory requires a sessionId.')
  }
  const text = input.text.trim()
  if (!text) throw new Error('Memory text must be a non-empty string.')
  assertNoRawSecretMaterial(text, 'memory text')
  if (input.metadata) assertNoRawSecretMaterial(input.metadata, 'memory metadata')
  const tags = normalizeTags(input.tags)
  for (const tag of tags) assertNoRawSecretMaterial(tag, 'memory tags')

  return {
    entryId: input.entryId?.trim() || createMainspringRuntimeId('memory'),
    workspaceRoot: resolvedWorkspaceRoot,
    scope,
    ...(scope === 'session' && input.sessionId ? { sessionId: input.sessionId.trim() } : {}),
    text: text.slice(0, 8_000),
    tags,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

function activeMemoryEntry(workspaceRoot: string, entryId: string): MemoryRecord {
  const normalizedEntryId = entryId.trim()
  if (!normalizedEntryId) throw new Error('Memory entryId is required.')
  const matches = readEntries(workspaceRoot).filter((entry) => entry.entryId === normalizedEntryId)
  if (matches.length === 0) throw new Error('Memory entry is unavailable.')
  if (matches.length > 1) throw new Error('Memory entry is ambiguous and cannot be mutated.')
  return matches[0]!
}

function appendMemoryJournalRecord(workspaceRoot: string, record: unknown): void {
  const filePath = memoryFilePath(workspaceRoot)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  let needsLineBreak = false
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    const size = fs.statSync(filePath).size
    const descriptor = fs.openSync(filePath, 'r')
    try {
      const lastByte = Buffer.alloc(1)
      fs.readSync(descriptor, lastByte, 0, 1, size - 1)
      // A crashed append can leave an unterminated partial row. Isolate that
      // invalid row before appending the next complete journal record.
      needsLineBreak = lastByte[0] !== 0x0a
    } finally {
      fs.closeSync(descriptor)
    }
  }
  const descriptor = fs.openSync(filePath, 'a')
  try {
    fs.writeFileSync(descriptor, `${needsLineBreak ? '\n' : ''}${JSON.stringify(record)}\n`, 'utf8')
    // The current journal row is the mutation's durable commit point. Flush
    // the replacement/tombstone before reporting the operator action.
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
}

export function isMutableMemoryStore(store: MemoryStore): store is MutableMemoryStore {
  const candidate = store as Partial<MutableMemoryStore>
  return typeof candidate.delete === 'function' && typeof candidate.replace === 'function'
}

export class JsonlMemoryStore implements MutableMemoryStore {
  write(input: WriteMemoryInput): MemoryRecord {
    const resolvedWorkspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const record = memoryRecordFromInput(input, resolvedWorkspaceRoot)
    appendMemoryJournalRecord(resolvedWorkspaceRoot, record)
    return record
  }

  replace(input: ReplaceMemoryInput): MemoryRecord {
    const resolvedWorkspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const current = activeMemoryEntry(resolvedWorkspaceRoot, input.entryId)
    const scope = input.scope ?? current.scope
    const replacement = memoryRecordFromInput({
      workspaceRoot: resolvedWorkspaceRoot,
      entryId: current.entryId,
      text: input.text,
      scope,
      ...(input.sessionId !== undefined
        ? { sessionId: input.sessionId }
        : current.sessionId
          ? { sessionId: current.sessionId }
          : {}),
      ...(input.tags ? { tags: input.tags } : { tags: current.tags }),
      ...(input.metadata ? { metadata: input.metadata } : current.metadata ? { metadata: current.metadata } : {}),
      createdAt: current.createdAt,
    }, resolvedWorkspaceRoot)
    const replacedAt = input.replacedAt?.trim() || new Date().toISOString()
    const actor = optionalJournalText(input.actor, 'memory replacement actor', 160)
    const reason = optionalJournalText(input.reason, 'memory replacement reason', 500)
    if (input.journalMetadata) assertNoRawSecretMaterial(input.journalMetadata, 'memory replacement journal metadata')
    appendMemoryJournalRecord(resolvedWorkspaceRoot, {
      kind: 'memory.replaced',
      targetEntryId: current.entryId,
      replacement,
      replacedAt,
      ...(actor ? { actor } : {}),
      ...(reason ? { reason } : {}),
      ...(input.journalMetadata ? { metadata: input.journalMetadata } : {}),
    })
    return replacement
  }

  delete(input: DeleteMemoryInput): MemoryDeletionResult {
    const resolvedWorkspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const current = activeMemoryEntry(resolvedWorkspaceRoot, input.entryId)
    const deletedAt = input.deletedAt?.trim() || new Date().toISOString()
    const actor = optionalJournalText(input.actor, 'memory deletion actor', 160)
    const reason = optionalJournalText(input.reason, 'memory deletion reason', 500)
    if (input.journalMetadata) assertNoRawSecretMaterial(input.journalMetadata, 'memory deletion journal metadata')
    appendMemoryJournalRecord(resolvedWorkspaceRoot, {
      kind: 'memory.deleted',
      targetEntryId: current.entryId,
      deletedAt,
      ...(actor ? { actor } : {}),
      ...(reason ? { reason } : {}),
      ...(input.journalMetadata ? { metadata: input.journalMetadata } : {}),
    })
    return { entryId: current.entryId, deletedAt }
  }

  list(input: ListMemoryInput): MemoryRecord[] {
    const entries = readEntries(input.workspaceRoot)
    const query = input.query?.trim() ?? ''
    const tags = normalizeTags(input.tags)
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 10), 1), 100)
    return entries
      .filter((entry) => scopeMatches(entry, input))
      .filter((entry) => queryMatches(entry, query))
      .filter((entry) => tagsMatch(entry, tags))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
  }
}

export function createJsonlMemoryStore(): MutableMemoryStore {
  return new JsonlMemoryStore()
}
