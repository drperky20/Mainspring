import {
  createJsonlMemoryStore,
  isMutableMemoryStore,
  type DeleteMemoryInput,
  type MemoryDeletionResult,
  type ListMemoryInput,
  type MemoryRecord,
  type MemoryScope,
  type MemoryStore,
  type ReplaceMemoryInput,
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

  replace(input: Omit<ReplaceMemoryInput, 'workspaceRoot' | 'sessionId'> & {
    workspaceRoot?: string
    sessionId?: string
  }): MemoryRecord {
    const workspaceRoot = input.workspaceRoot ?? this.options.workspaceRoot
    if (!workspaceRoot) throw new Error('MemoryProvider.replace requires a workspaceRoot.')
    if (!isMutableMemoryStore(this.store)) {
      throw new Error('MemoryProvider.replace requires a mutable memory store.')
    }
    const sessionId = input.sessionId ?? this.options.sessionId
    return this.store.replace({
      workspaceRoot,
      entryId: input.entryId,
      text: input.text,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.journalMetadata ? { journalMetadata: input.journalMetadata } : {}),
      ...(input.replacedAt ? { replacedAt: input.replacedAt } : {}),
    })
  }

  delete(input: Omit<DeleteMemoryInput, 'workspaceRoot'> & {
    workspaceRoot?: string
  }): MemoryDeletionResult {
    const workspaceRoot = input.workspaceRoot ?? this.options.workspaceRoot
    if (!workspaceRoot) throw new Error('MemoryProvider.delete requires a workspaceRoot.')
    if (!isMutableMemoryStore(this.store)) {
      throw new Error('MemoryProvider.delete requires a mutable memory store.')
    }
    return this.store.delete({
      workspaceRoot,
      entryId: input.entryId,
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.journalMetadata ? { journalMetadata: input.journalMetadata } : {}),
      ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    })
  }
}
