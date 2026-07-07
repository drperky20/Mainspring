import type { CompiledContextPrompt, ContextPromptPart } from './types.js'

export type ContextCacheDecisionKind = 'cache-read-write' | 'cache-read-only' | 'no-cache'

export interface ContextCacheDecision {
  partIndex: number
  kind: ContextCacheDecisionKind
  reason: string
  blockId?: string
}

export interface ContextCachePlan {
  supportsPromptCache: boolean
  decisions: ContextCacheDecision[]
}

function decisionForPart(
  compiled: CompiledContextPrompt,
  part: ContextPromptPart,
  index: number,
): ContextCacheDecision {
  if (!compiled.model.profile.supportsPromptCache) {
    return {
      partIndex: index,
      kind: 'no-cache',
      reason: 'model-profile-does-not-support-prompt-cache',
      ...(part.type === 'text' && part.blockId ? { blockId: part.blockId } : {}),
      ...(part.type === 'image' ? { blockId: part.blockId } : {}),
    }
  }

  if (part.type === 'text' && part.purpose === 'exact') {
    return {
      partIndex: index,
      kind: 'cache-read-write',
      reason: 'exact-context-is-stable',
      ...(part.blockId ? { blockId: part.blockId } : {}),
    }
  }

  if (part.type === 'text' && (part.purpose === 'factsheet' || part.purpose === 'summary')) {
    return {
      partIndex: index,
      kind: 'cache-read-write',
      reason: `${part.purpose}-is-derived-from-recoverable-source`,
      ...(part.blockId ? { blockId: part.blockId } : {}),
    }
  }

  if (part.type === 'image') {
    return {
      partIndex: index,
      kind: 'cache-read-write',
      reason: 'image-projection-is-deterministic-for-renderer-and-recoverable-source',
      blockId: part.blockId,
    }
  }

  if (part.type === 'text' && part.purpose === 'rehydrate-hint') {
    return {
      partIndex: index,
      kind: 'cache-read-only',
      reason: 'rehydrate-hint-is-small-and-derived',
      ...(part.blockId ? { blockId: part.blockId } : {}),
    }
  }

  return {
    partIndex: index,
    kind: 'no-cache',
    reason: 'instructions-can-be-task-specific',
    ...(part.type === 'text' && part.blockId ? { blockId: part.blockId } : {}),
  }
}

export function planContextPromptCache(compiled: CompiledContextPrompt): ContextCachePlan {
  return {
    supportsPromptCache: compiled.model.profile.supportsPromptCache,
    decisions: compiled.parts.map((part, index) => decisionForPart(compiled, part, index)),
  }
}
