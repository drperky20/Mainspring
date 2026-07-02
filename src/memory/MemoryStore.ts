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

export interface MemoryStore {
  write(input: WriteMemoryInput): MemoryRecord
  list(input: ListMemoryInput): MemoryRecord[]
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

function parseMemoryLine(line: string): MemoryRecord | null {
  try {
    const parsed = JSON.parse(line) as Partial<MemoryRecord>
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    if (parsed.scope !== 'workspace' && parsed.scope !== 'session') return null
    if (parsed.scope === 'session' && (!parsed.sessionId || typeof parsed.sessionId !== 'string')) {
      return null
    }
    return {
      entryId:
        typeof parsed.entryId === 'string' && parsed.entryId
          ? parsed.entryId
          : createMainspringRuntimeId('memory'),
      workspaceRoot:
        typeof parsed.workspaceRoot === 'string' && parsed.workspaceRoot
          ? parsed.workspaceRoot
          : '',
      scope: parsed.scope,
      ...(typeof parsed.sessionId === 'string' && parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      text: parsed.text,
      tags: normalizeTags(Array.isArray(parsed.tags) ? parsed.tags : []),
      createdAt:
        typeof parsed.createdAt === 'string' && parsed.createdAt
          ? parsed.createdAt
          : new Date(0).toISOString(),
      ...(parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
        ? { metadata: parsed.metadata as Record<string, unknown> }
        : {}),
    }
  } catch {
    return null
  }
}

function readEntries(workspaceRoot: string): MemoryRecord[] {
  const filePath = memoryFilePath(workspaceRoot)
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parsed = parseMemoryLine(line)
      return parsed ? [parsed] : []
    })
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

export class JsonlMemoryStore implements MemoryStore {
  write(input: WriteMemoryInput): MemoryRecord {
    const resolvedWorkspaceRoot = fs.realpathSync.native(input.workspaceRoot)
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

    const record: MemoryRecord = {
      entryId: input.entryId?.trim() || createMainspringRuntimeId('memory'),
      workspaceRoot: resolvedWorkspaceRoot,
      scope,
      ...(scope === 'session' && input.sessionId ? { sessionId: input.sessionId.trim() } : {}),
      text: text.slice(0, 8_000),
      tags,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
    const filePath = memoryFilePath(resolvedWorkspaceRoot)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`)
    return record
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

export function createJsonlMemoryStore(): MemoryStore {
  return new JsonlMemoryStore()
}
