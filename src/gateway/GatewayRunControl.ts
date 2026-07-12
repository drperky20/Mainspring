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

export interface LocalGatewayRunCancellationAuthorization {
  runId: string
  sessionId: string
  actor: string
  cancellationBindingHash: string
  decision: DecisionRecord
}

export interface LocalGatewayRunRetryAuthorization {
  runId: string
  sessionId: string
  actor: string
  retryBindingHash: string
  decision: DecisionRecord
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

  authorizeCancel(input: {
    runId: string
    sessionId: string
    actor?: string
    binding: unknown
  }): LocalGatewayRunCancellationAuthorization {
    const runId = requiredText(input.runId, 'cancel run id')
    const sessionId = requiredText(input.sessionId, 'cancel session id')
    const cancellationBindingHash = hashApprovalInput(input.binding)
    const decision = createHostDecisionRecord({
      runId,
      sessionId,
      surface: 'run',
      operation: 'run.cancel',
      targetKey: runId,
      state: 'allow',
      reasons: ['Trusted gateway operator authorized run cancellation before lifecycle mutation.'],
      permissionCategories: ['run', 'cancellation', 'operator-control-plane'],
      input: {
        runId,
        sessionId,
        cancellationBindingHash,
      },
      metadata: {
        runId,
        sessionId,
        cancellationBindingHash,
      },
    })
    const actor = actorFor(input.actor)
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.cancel.authorized',
      actor,
      targetType: 'run',
      targetId: runId,
      runId,
      sessionId,
      metadata: { decisionRecord: decision },
    })
    return { runId, sessionId, actor, cancellationBindingHash, decision }
  }

  recordCancelOutcome(input: {
    authorization: LocalGatewayRunCancellationAuthorization
    runtime: 'compatibility' | 'runlog'
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: input.runtime === 'runlog' ? 'run.cancelled' : 'run.cancel.requested',
      actor: input.authorization.actor,
      targetType: 'run',
      targetId: input.authorization.runId,
      runId: input.authorization.runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        cancellationBindingHash: input.authorization.cancellationBindingHash,
        runtime: input.runtime,
      },
    })
  }

  recordCancelFailure(input: {
    authorization: LocalGatewayRunCancellationAuthorization
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.cancel.failed',
      actor: input.authorization.actor,
      targetType: 'run',
      targetId: input.authorization.runId,
      runId: input.authorization.runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        cancellationBindingHash: input.authorization.cancellationBindingHash,
      },
    })
  }

  authorizeRetry(input: {
    runId: string
    sessionId: string
    actor?: string
    binding: unknown
  }): LocalGatewayRunRetryAuthorization {
    const runId = requiredText(input.runId, 'retry run id')
    const sessionId = requiredText(input.sessionId, 'retry session id')
    const retryBindingHash = hashApprovalInput(input.binding)
    const decision = createHostDecisionRecord({
      runId,
      sessionId,
      surface: 'run',
      operation: 'run.retry',
      targetKey: runId,
      state: 'allow',
      reasons: ['Trusted gateway operator authorized a fresh linked run before enqueue.'],
      permissionCategories: ['run', 'retry', 'operator-control-plane'],
      input: { runId, sessionId, retryBindingHash },
      metadata: { runId, sessionId, retryBindingHash, retryMode: 'fresh-run' },
    })
    const actor = actorFor(input.actor)
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.retry.authorized',
      actor,
      targetType: 'run',
      targetId: runId,
      runId,
      sessionId,
      metadata: { decisionRecord: decision },
    })
    return { runId, sessionId, actor, retryBindingHash, decision }
  }

  recordRetryOutcome(input: {
    authorization: LocalGatewayRunRetryAuthorization
    retryRunId: string
  }): void {
    const retryRunId = requiredText(input.retryRunId, 'retry child run id')
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.retried',
      actor: input.authorization.actor,
      targetType: 'run',
      targetId: retryRunId,
      runId: retryRunId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        retryBindingHash: input.authorization.retryBindingHash,
        retryOfRunId: input.authorization.runId,
        retryMode: 'fresh-run',
      },
    })
  }

  recordRetryFailure(input: {
    authorization: LocalGatewayRunRetryAuthorization
  }): void {
    this.appState.auditEvents.create({
      category: 'gateway',
      action: 'run.retry.failed',
      actor: input.authorization.actor,
      targetType: 'run',
      targetId: input.authorization.runId,
      runId: input.authorization.runId,
      sessionId: input.authorization.sessionId,
      metadata: {
        decisionId: input.authorization.decision.decisionId,
        retryBindingHash: input.authorization.retryBindingHash,
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
