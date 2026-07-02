import { MemoryProvider, type MemoryProviderOptions } from './MemoryProvider.js'
import type { MemoryRecord, MemoryScope, MemoryStore } from './MemoryStore.js'

export interface MemoryContextOptions extends MemoryProviderOptions {
  workspaceRoot: string
  sessionId?: string
}

export interface MemoryContext {
  workspaceRoot: string
  sessionId?: string
  store: MemoryStore
  remember(input: {
    text: string
    scope?: MemoryScope
    tags?: readonly string[]
    metadata?: Record<string, unknown>
  }): MemoryRecord
  read(input?: {
    scope?: MemoryScope | 'all'
    query?: string
    tags?: readonly string[]
    limit?: number
  }): MemoryRecord[]
}

export function createMemoryContext(options: MemoryContextOptions): MemoryContext {
  const provider = new MemoryProvider(options)
  return {
    workspaceRoot: options.workspaceRoot,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    store: provider.store,
    remember: (input) =>
      provider.write({
        text: input.text,
        scope: input.scope ?? 'workspace',
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    read: (input = {}) =>
      provider.list({
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.query ? { query: input.query } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      }),
  }
}
