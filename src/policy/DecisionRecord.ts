import { randomUUID } from 'node:crypto'
import type { RuntimePolicy, SkillManifest, ToolManifest } from '#protocol'
import { hashApprovalInput } from './ApprovalReceipt.js'
import type { PolicyDecision, PolicyOperation } from './PolicyGuard.js'

export type DecisionRecordState =
  | 'allow'
  | 'deny'
  | 'clarify'
  | 'requires_approval'
  | 'stage_for_review'
  | 'hard_block'

export type DecisionRecordSurface =
  | 'tool'
  | 'shell'
  | 'file'
  | 'browser'
  | 'network'
  | 'memory'
  | 'skill'
  | 'cron'
  | 'subagent'
  | 'artifact'
  | 'provider_config'
  | 'channel'
  | 'mcp'
  | 'unknown'

export interface DecisionRecord {
  decisionId: string
  runId: string
  sessionId?: string
  toolCallId?: string
  surface: DecisionRecordSurface
  operation: PolicyOperation
  targetKey: string
  state: DecisionRecordState
  reasons: string[]
  permissionCategories: string[]
  approved: boolean
  hardBlocked: boolean
  inputHash: string
  manifestHash: string
  policyHash: string
  createdAt: string
  metadata?: Record<string, unknown>
}

function hasCategory(categories: readonly string[], prefix: string): boolean {
  return categories.some((category) => category === prefix || category.startsWith(`${prefix}:`))
}

export function decisionSurfaceForManifest(
  manifest: ToolManifest | SkillManifest,
  categories: readonly string[],
): DecisionRecordSurface {
  if ('source' in manifest && !('toolType' in manifest)) return 'skill'
  if (manifest.permissions.shell || hasCategory(categories, 'shell')) return 'shell'
  if (manifest.permissions.browser || hasCategory(categories, 'browser')) return 'browser'
  if (manifest.permissions.network || hasCategory(categories, 'network')) return 'network'
  if (manifest.permissions.filesystem || hasCategory(categories, 'filesystem')) return 'file'
  if (manifest.permissions.secrets?.length) return 'provider_config'
  if ('toolType' in manifest) {
    if (manifest.toolType === 'browser') return 'browser'
    if (manifest.toolType === 'file') return 'file'
    if (manifest.toolType === 'memory') return 'memory'
    if (manifest.toolType === 'web') return 'network'
    if (manifest.toolType === 'shell') return 'shell'
  }
  return 'tool'
}

export function decisionStateForPolicyDecision(decision: PolicyDecision): DecisionRecordState {
  if (decision.hardBlocked) return 'hard_block'
  if (decision.blocked) return 'deny'
  if (decision.approvalRequired) return 'requires_approval'
  return 'allow'
}

export function createDecisionRecord(input: {
  runId: string
  sessionId?: string
  toolCallId?: string
  operation: PolicyOperation
  manifest: ToolManifest | SkillManifest
  toolInput?: unknown
  policy: RuntimePolicy
  decision: PolicyDecision
  approved?: boolean
  metadata?: Record<string, unknown>
}): DecisionRecord {
  const state = decisionStateForPolicyDecision(input.decision)
  return {
    decisionId: `dr_${randomUUID()}`,
    runId: input.runId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    surface: decisionSurfaceForManifest(input.manifest, input.decision.permissionCategories),
    operation: input.operation,
    targetKey: input.manifest.key,
    state,
    reasons: input.decision.reasons,
    permissionCategories: input.decision.permissionCategories,
    approved: Boolean(input.approved),
    hardBlocked: Boolean(input.decision.hardBlocked),
    inputHash: hashApprovalInput(input.toolInput),
    manifestHash: hashApprovalInput(input.manifest),
    policyHash: hashApprovalInput(input.policy),
    createdAt: new Date().toISOString(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}
