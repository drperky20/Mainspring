import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'

export interface LocalGatewayRunEnqueueAuthorization {
  sessionId: string
  actor: string
  runBindingHash: string
  decision: DecisionRecord
}

export interface LocalGatewayApprovalResolutionAuthorization {
  approvalId: string
  runId: string
  sessionId: string
  decision: 'approved' | 'denied'
  actor: string
  resolutionBindingHash: string
  decisionRecord: DecisionRecord
}

export interface LocalGatewayRunExecutionEvidence {
  cellId?: string
  cellLeaseId?: string
  backend?: string
  backendUnsafe?: boolean
}

function requiredText(value: string, label: string): string {
  const text = value.trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function actorFor(actor: string | undefined): string {
  const text = actor?.trim()
  return text || 'local-gateway'
}

/**
 * Owns the gateway's run ingress and approval-response authority. Runtime
 * stores remain responsible for the actual lifecycle transition; this
 * collaborator makes the trusted operator decision durable before that
 * transition and keeps request details hash-only in the gateway audit log.
 */
export class GatewayRunControl {
  constructor(private readonly appState: LocalGatewayAppStateStore) {}

  authorizeEnqueue(input: {
    sessionId: string
    actor?: string
    workspaceId?: string
    binding: unknown
  }): LocalGatewayRunEnqueueAuthorization {
    const sessionId = requiredText(input.sessionId, 'run session id')
    const workspaceId = input.workspaceId?.trim() || undefined
    const runBindingHash = hashApprovalInput(input.binding)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      sessionId,
      surface: 'run',
      operation: 'run.enqueue',
      targetKey: sessionId,
      state: 'allow',
      reasons: ['Trusted gateway operator authorized run ingress before enqueue.'],
      permissionCategories: ['run', 'operator-control-plane'],
      input: {
        sessionId,
        ...(workspaceId ? { workspaceId } : {}),
        runBindingHash,
      },
      metadata: {
        sessionId,
        ...(workspaceId ? { workspaceId } : {}),
        runBindingHash,
      },
    })
    const actor = actorFor(input.actor)
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.enqueued.authorized',
      actor,
      targetType: 'run-request',
      targetId: sessionId,
      sessionId,
      metadata: { decisionRecord: decision },
    })
    return { sessionId, actor, runBindingHash, decision }
  }

  recordEnqueueOutcome(input: {
    authorization: LocalGatewayRunEnqueueAuthorization
    runId: string
    runtime: 'compatibility' | 'runlog'
    execution?: LocalGatewayRunExecutionEvidence
  }): void {
    const runId = requiredText(input.runId, 'run id')
    this.appState.auditEvents.create({
      category: 'gateway',
      action: input.runtime === 'runlog' ? 'runlog.run.enqueued' : 'run.enqueued',
      actor: input.authorization.actor,
      targetType: 'run',
      targetId: runId,
      runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        runBindingHash: input.authorization.runBindingHash,
        runtime: input.runtime,
        ...(input.execution?.cellId ? { cellId: input.execution.cellId } : {}),
        ...(input.execution?.cellLeaseId ? { cellLeaseId: input.execution.cellLeaseId } : {}),
        ...(input.execution?.backend ? { backend: input.execution.backend } : {}),
        ...(input.execution?.backendUnsafe !== undefined
          ? { backendUnsafe: input.execution.backendUnsafe }
          : {}),
      },
    })
  }

  recordEnqueueFailure(input: {
    authorization: LocalGatewayRunEnqueueAuthorization
    runId?: string
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.enqueue.failed',
      actor: input.authorization.actor,
      targetType: input.runId ? 'run' : 'run-request',
      targetId: input.runId ?? input.authorization.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        runBindingHash: input.authorization.runBindingHash,
      },
    })
  }

  authorizeApproval(input: {
    approvalId: string
    runId: string
    sessionId: string
    decision: 'approved' | 'denied'
    actor?: string
    binding: unknown
  }): LocalGatewayApprovalResolutionAuthorization {
    const approvalId = requiredText(input.approvalId, 'approval id')
    const runId = requiredText(input.runId, 'approval run id')
    const sessionId = requiredText(input.sessionId, 'approval session id')
    const resolutionBindingHash = hashApprovalInput(input.binding)
    const decisionRecord = createHostDecisionRecord({
      runId,
      sessionId,
      surface: 'approval',
      operation: 'approval.resolve',
      targetKey: approvalId,
      state: 'allow',
      reasons: [
        input.decision === 'approved'
          ? 'Trusted gateway operator authorized approval before runtime resume.'
          : 'Trusted gateway operator authorized approval denial before runtime terminal transition.',
      ],
      permissionCategories: ['approval', 'operator-control-plane'],
      input: {
        approvalId,
        runId,
        sessionId,
        decision: input.decision,
        resolutionBindingHash,
      },
      metadata: {
        approvalId,
        runId,
        sessionId,
        decision: input.decision,
        resolutionBindingHash,
      },
    })
    const actor = actorFor(input.actor)
    this.appState.auditEvents.create({
      category: 'gateway',
      action: `approval.${input.decision}.authorized`,
      actor,
      targetType: 'approval',
      targetId: approvalId,
      runId,
      sessionId,
      metadata: { decisionRecord },
    })
    return {
      approvalId,
      runId,
      sessionId,
      decision: input.decision,
      actor,
      resolutionBindingHash,
      decisionRecord,
    }
  }

  recordApprovalOutcome(input: {
    authorization: LocalGatewayApprovalResolutionAuthorization
    receiptId?: string
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: `approval.${input.authorization.decision}`,
      actor: input.authorization.actor,
      targetType: 'approval',
      targetId: input.authorization.approvalId,
      runId: input.authorization.runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decisionRecord.decisionId,
        resolutionBindingHash: input.authorization.resolutionBindingHash,
        ...(input.receiptId ? { receiptId: input.receiptId } : {}),
      },
    })
  }

  recordApprovalFailure(input: {
    authorization: LocalGatewayApprovalResolutionAuthorization
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: `approval.${input.authorization.decision}.failed`,
      actor: input.authorization.actor,
      targetType: 'approval',
      targetId: input.authorization.approvalId,
      runId: input.authorization.runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decisionRecord.decisionId,
        resolutionBindingHash: input.authorization.resolutionBindingHash,
      },
    })
  }
}
