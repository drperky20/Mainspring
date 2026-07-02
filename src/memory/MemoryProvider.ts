import {
  createJsonlMemoryStore,
  type ListMemoryInput,
  type MemoryRecord,
  type MemoryScope,
  type MemoryStore,
  type WriteMemoryInput,
} from './MemoryStore.js'

export interface MemoryProviderOptions {
  store?: MemoryStore
  workspaceRoot?: string
  sessionId?: string
}

export class MemoryProvider {
  readonly store: MemoryStore

  constructor(private readonly options: MemoryProviderOptions = {}) {
    this.store = options.store ?? createJsonlMemoryStore()
  }

  write(input: Omit<WriteMemoryInput, 'workspaceRoot' | 'sessionId'> & {
    workspaceRoot?: string
    sessionId?: string
  }): MemoryRecord {
    const workspaceRoot = input.workspaceRoot ?? this.options.workspaceRoot
    if (!workspaceRoot) throw new Error('MemoryProvider.write requires a workspaceRoot.')
    const scope: MemoryScope = input.scope ?? 'workspace'
    const sessionId = input.sessionId ?? this.options.sessionId
    return this.store.write({
      workspaceRoot,
      text: input.text,
      scope,
      ...(sessionId ? { sessionId } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      ...(input.entryId ? { entryId: input.entryId } : {}),
    })
  }

  list(input: Omit<ListMemoryInput, 'workspaceRoot' | 'sessionId'> & {
    workspaceRoot?: string
    sessionId?: string
  } = {}): MemoryRecord[] {
    const workspaceRoot = input.workspaceRoot ?? this.options.workspaceRoot
    if (!workspaceRoot) throw new Error('MemoryProvider.list requires a workspaceRoot.')
    const sessionId = input.sessionId ?? this.options.sessionId
    return this.store.list({
      workspaceRoot,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
    })
  }
}
