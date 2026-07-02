import { sanitizeRuntimeResponse } from '#protocol'
import { MemoryProvider } from '../memory/MemoryProvider.js'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

function inputTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 16)
    : []
}

function inputScope(value: unknown): 'workspace' | 'session' {
  return value === 'session' ? 'session' : 'workspace'
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
    execute: ({ input, workspaceRoot, sessionId }) => {
      const record = inputRecord(input)
      const query = typeof record.query === 'string' ? record.query.trim() : ''
      const limit = positiveInt(record.limit, 10, 50)
      const provider = new MemoryProvider({ workspaceRoot })
      const entries = provider.list({
        scope: record.scope === 'workspace' || record.scope === 'session' ? record.scope : 'all',
        ...((typeof record.sessionId === 'string' && record.sessionId.trim()) || sessionId
          ? { sessionId: (typeof record.sessionId === 'string' && record.sessionId.trim()) || sessionId }
          : {}),
        query,
        limit,
        ...(Array.isArray(record.tags) ? { tags: inputTags(record.tags) } : {}),
      })

      return sanitizeRuntimeResponse({
        query,
        count: entries.length,
        memories: entries.map((entry) => ({
          id: entry.entryId,
          scope: entry.scope,
          ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
          text: entry.text,
          tags: entry.tags,
          createdAt: entry.createdAt,
        })),
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
    execute: ({ input, workspaceRoot, sessionId }) => {
      const record = inputRecord(input)
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      if (!text) throw new Error('Memory write input.text must be a non-empty string.')
      const scope = inputScope(record.scope)
      const provider = new MemoryProvider({
        workspaceRoot,
        ...(sessionId ? { sessionId } : {}),
      })
      const entry = provider.write({
        text,
        scope,
        tags: inputTags(record.tags),
        ...(record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? { metadata: record.metadata as Record<string, unknown> }
          : {}),
      })
      return sanitizeRuntimeResponse({
        id: entry.entryId,
        stored: true,
        scope: entry.scope,
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        tags: entry.tags,
      })
    },
  }
}

export function createMemoryTools(): RuntimeTool[] {
  return [createMemoryReadTool(), createMemoryWriteTool()]
}

export const createMemoryTool = createMemoryReadTool
