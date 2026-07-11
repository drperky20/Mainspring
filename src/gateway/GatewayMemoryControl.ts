import { MemoryProvider } from '../memory/MemoryProvider.js'
import type { MemoryRecord } from '../memory/MemoryStore.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import {
  assertScanCanProceed,
  deriveProvenanceTrustMetadata,
  scanMemoryMutation,
} from '../provenance/ProvenanceReview.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'
import {
  resolveMemoryHistoryEntry,
  type ResolvedMemoryHistoryEntry,
} from './MemoryHistoryPage.js'

/**
 * Inputs carry only the browser-safe memory ID from the bounded history page.
 * This service resolves that ID through app-state before touching workspace
 * storage, so callers cannot select a host path or raw JSONL identity.
 */
export interface LocalGatewayMemoryCorrectionInput {
  workspaceId: string
  entryId: string
  text: string
  reason?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayMemoryDeletionInput {
  workspaceId: string
  entryId: string
  reason?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayMemoryCorrectionResult {
  workspaceId: string
  entry: MemoryRecord
}

export interface LocalGatewayMemoryDeletionResult {
  workspaceId: string
  entryId: string
  deletedAt: string
}

function memoryMutationDecisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return {
    decisionId: decision.decisionId,
    surface: decision.surface,
    operation: decision.operation,
    targetKey: decision.targetKey,
    state: decision.state,
    inputHash: decision.inputHash,
    manifestHash: decision.manifestHash,
    policyHash: decision.policyHash,
    createdAt: decision.createdAt,
  }
}

/**
 * Owns host-only mutable-memory authority. LocalGateway remains the stable
 * facade, while this service keeps opaque-ID resolution, provenance scanning,
 * decision evidence, journal mutation, and audit persistence together.
 */
export class GatewayMemoryControl {
  constructor(private readonly appState: LocalGatewayAppStateStore) {}

  correct(input: LocalGatewayMemoryCorrectionInput): LocalGatewayMemoryCorrectionResult {
    const text = input.text.trim()
    if (!text) throw new Error('Memory correction text is required.')
    const resolved = this.resolveMemoryForMutation(input)
    const actor = input.actor?.trim() || 'local-gateway'
    const reason = input.reason?.trim() || undefined
    const scan = scanMemoryMutation({
      text,
      scope: resolved.record.scope,
      tags: resolved.record.tags,
    })
    assertScanCanProceed(scan)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'memory',
      operation: 'memory.replace',
      targetKey: input.entryId.trim(),
      state: 'allow',
      reasons: [
        scan.status === 'review'
          ? 'Trusted local gateway operator reviewed a memory correction requiring provenance attention.'
          : 'Trusted local gateway operator requested a durable memory correction.',
      ],
      permissionCategories: ['memory', 'workspace-write', 'operator-control-plane'],
      input: {
        workspaceId: resolved.workspaceId,
        entryId: input.entryId.trim(),
        text,
        ...(reason ? { reason } : {}),
      },
      metadata: {
        mutation: 'correct',
        workspaceId: resolved.workspaceId,
        scanStatus: scan.status,
        contentHash: scan.contentHash,
      },
    })
    const provider = new MemoryProvider({ workspaceRoot: resolved.workspaceRoot })
    const entry = provider.replace({
      entryId: resolved.record.entryId,
      text,
      scope: resolved.record.scope,
      ...(resolved.record.sessionId ? { sessionId: resolved.record.sessionId } : {}),
      tags: resolved.record.tags,
      metadata: {
        provenance: deriveProvenanceTrustMetadata({
          source: 'gateway.memory.correct',
          scan,
          reviewed: true,
          mutationKind: 'memory',
        }),
      },
      actor,
      ...(reason ? { reason } : {}),
      journalMetadata: memoryMutationDecisionMetadata(decision),
    })
    this.appState.auditEvents.create({
      category: 'memory',
      action: 'entry.corrected',
      actor,
      targetType: 'memory-entry',
      targetId: input.entryId.trim(),
      metadata: {
        workspaceId: resolved.workspaceId,
        decisionRecord: decision,
      },
    })
    return { workspaceId: resolved.workspaceId, entry }
  }

  delete(input: LocalGatewayMemoryDeletionInput): LocalGatewayMemoryDeletionResult {
    const resolved = this.resolveMemoryForMutation(input)
    const actor = input.actor?.trim() || 'local-gateway'
    const reason = input.reason?.trim() || undefined
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'memory',
      operation: 'memory.delete',
      targetKey: input.entryId.trim(),
      state: 'allow',
      reasons: ['Trusted local gateway operator requested a durable memory deletion.'],
      permissionCategories: ['memory', 'workspace-write', 'operator-control-plane'],
      input: {
        workspaceId: resolved.workspaceId,
        entryId: input.entryId.trim(),
        ...(reason ? { reason } : {}),
      },
      metadata: { mutation: 'delete', workspaceId: resolved.workspaceId },
    })
    const provider = new MemoryProvider({ workspaceRoot: resolved.workspaceRoot })
    const deletion = provider.delete({
      entryId: resolved.record.entryId,
      actor,
      ...(reason ? { reason } : {}),
      journalMetadata: memoryMutationDecisionMetadata(decision),
    })
    this.appState.auditEvents.create({
      category: 'memory',
      action: 'entry.deleted',
      actor,
      targetType: 'memory-entry',
      targetId: input.entryId.trim(),
      metadata: {
        workspaceId: resolved.workspaceId,
        decisionRecord: decision,
      },
    })
    return {
      workspaceId: resolved.workspaceId,
      entryId: input.entryId.trim(),
      deletedAt: deletion.deletedAt,
    }
  }

  private resolveMemoryForMutation(input: {
    workspaceId: string
    entryId: string
  }): ResolvedMemoryHistoryEntry {
    const workspaceId = input.workspaceId.trim()
    const entryId = input.entryId.trim()
    if (!workspaceId) throw new Error('Memory workspaceId is required.')
    if (!entryId) throw new Error('Memory entryId is required.')
    if (!this.appState.workspaces.get(workspaceId)) {
      throw new Error('Unknown gateway workspace.')
    }
    const resolved = resolveMemoryHistoryEntry({
      source: this.appState,
      workspaceId,
      entryId,
    })
    if (!resolved) throw new Error('Memory entry is unavailable in the selected workspace.')
    return resolved
  }
}
