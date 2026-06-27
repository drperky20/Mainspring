import {
  createMainspringRuntimeId,
  sanitizeRuntimeResponse,
  type MainspringApprovalKind,
  type MainspringEvent,
} from '#protocol'

export interface RuntimeApprovalRequest {
  id: string
  kind: MainspringApprovalKind
  targetKey: string
  reasons: string[]
  permissionCategories: string[]
  metadata?: Record<string, unknown>
}

export interface BuildApprovalRequestInput {
  runId: string
  kind: MainspringApprovalKind
  targetKey: string
  reasons: string[]
  permissionCategories: string[]
  metadata?: Record<string, unknown>
}

export function buildApprovalRequest(input: BuildApprovalRequestInput): RuntimeApprovalRequest {
  return {
    id: createMainspringRuntimeId('ap'),
    kind: input.kind,
    targetKey: input.targetKey,
    reasons: input.reasons,
    permissionCategories: input.permissionCategories,
    metadata: input.metadata
      ? (sanitizeRuntimeResponse(input.metadata) as Record<string, unknown>)
      : undefined,
  }
}

export function approvalRequestedEvent(input: {
  runId: string
  approval: RuntimeApprovalRequest
}): MainspringEvent {
  return {
    type: 'approval.requested',
    runId: input.runId,
    approval: input.approval,
  }
}
