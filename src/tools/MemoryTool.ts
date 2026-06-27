import fs from 'node:fs'
import path from 'node:path'
import { sanitizeRuntimeResponse } from '#protocol'
import { assertPathContained } from '#protocol/node'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

type MemoryEntry = {
  id: string
  text: string
  tags: string[]
  createdAt: string
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

function readMemoryEntries(workspaceRoot: string): MemoryEntry[] {
  const filePath = memoryFilePath(workspaceRoot)
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<MemoryEntry>
        if (typeof parsed.text !== 'string' || !parsed.text.trim()) return []
        return [
          {
            id: typeof parsed.id === 'string' && parsed.id ? parsed.id : `mem_${Date.now()}`,
            text: parsed.text,
            tags: Array.isArray(parsed.tags)
              ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
              : [],
            createdAt:
              typeof parsed.createdAt === 'string' && parsed.createdAt
                ? parsed.createdAt
                : new Date(0).toISOString(),
          },
        ]
      } catch {
        return []
      }
    })
}

function inputTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 16)
    : []
}

function createMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function matchesQuery(entry: MemoryEntry, query: string): boolean {
  if (!query) return true
  const haystack = `${entry.text} ${entry.tags.join(' ')}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function createMemoryReadTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'memory.read',
      name: 'Memory Read',
      description: 'Reads scoped runtime memory through the Mainspring memory store.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'memory',
    }),
    execute: ({ input, workspaceRoot }) => {
      const record = inputRecord(input)
      const query = typeof record.query === 'string' ? record.query.trim() : ''
      const limit = positiveInt(record.limit, 10, 50)
      const entries = readMemoryEntries(workspaceRoot)
        .filter((entry) => matchesQuery(entry, query))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)

      return sanitizeRuntimeResponse({
        query,
        count: entries.length,
        memories: entries,
      })
    },
  }
}

export function createMemoryWriteTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'memory.write',
      name: 'Memory Write',
      description: 'Persists scoped runtime memory inside the Mainspring workspace store.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'memory',
    }),
    execute: ({ input, workspaceRoot }) => {
      const record = inputRecord(input)
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      if (!text) throw new Error('Memory write input.text must be a non-empty string.')
      const entry: MemoryEntry = {
        id: createMemoryId(),
        text: text.slice(0, 8_000),
        tags: inputTags(record.tags),
        createdAt: new Date().toISOString(),
      }
      const filePath = memoryFilePath(workspaceRoot)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`)
      return sanitizeRuntimeResponse({
        id: entry.id,
        stored: true,
        tags: entry.tags,
      })
    },
  }
}

export function createMemoryTools(): RuntimeTool[] {
  return [createMemoryReadTool(), createMemoryWriteTool()]
}

export const createMemoryTool = createMemoryReadTool
