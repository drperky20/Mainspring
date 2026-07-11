import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayDeploymentRunRecord,
  LocalGatewayDeploymentTargetRecord,
} from './AppStateStore.js'
import {
  deploymentTargetSupport,
  executeLocalGatewayDeployment,
  planLocalGatewayDeployment,
  type DeploymentDriverRegistry,
  type LocalGatewayDeploymentCommandRunner,
  type LocalGatewayDeploymentExecutionResult,
  type LocalGatewayDeploymentOperation,
  type LocalGatewayDeploymentPlan,
} from './DeploymentWizard.js'

export interface CreateLocalGatewayDeploymentTargetDraftInput {
  workspaceId?: string
  label: string
  kind: LocalGatewayDeploymentTargetRecord['kind']
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayDeploymentTargetDraftInput {
  targetId: string
  workspaceId?: string
  label?: string
  kind?: LocalGatewayDeploymentTargetRecord['kind']
  status?: LocalGatewayDeploymentTargetRecord['status']
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface GatewayDeploymentControlOptions {
  appState: LocalGatewayAppStateStore
  repoRoot: string
  drivers: DeploymentDriverRegistry
  commandRunner?: LocalGatewayDeploymentCommandRunner
}

/**
 * Owns gateway deployment-target configuration and external deployment
 * authority. The public gateway facade delegates here so every configuration
 * mutation and driver invocation has one explicit, durable decision boundary.
 */
export class GatewayDeploymentControl {
  constructor(private readonly options: GatewayDeploymentControlOptions) {}

  listTargets(workspaceId?: string): LocalGatewayDeploymentTargetRecord[] {
    return this.options.appState.deploymentTargets.list(workspaceId ? { workspaceId } : {})
  }

  listRuns(input: {
    targetId?: string
    status?: LocalGatewayDeploymentRunRecord['status']
  } = {}): LocalGatewayDeploymentRunRecord[] {
    return this.options.appState.deploymentRuns.list(input)
  }

  createTarget(
    input: CreateLocalGatewayDeploymentTargetDraftInput,
  ): LocalGatewayDeploymentTargetRecord {
    const { actor: _actor, ...draft } = input
    if (draft.workspaceId && !this.options.appState.workspaces.get(draft.workspaceId)) {
      throw new Error(`Unknown gateway workspace: ${draft.workspaceId}`)
    }
    const targetId = createMainspringRuntimeId('deployment_target')
    const targetInput = this.deploymentTargetInputWithDriverSupport(draft)
    this.options.drivers.validateTarget({
      targetId,
      label: targetInput.label,
      kind: targetInput.kind,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(targetInput.workspaceId ? { workspaceId: targetInput.workspaceId } : {}),
      ...(targetInput.metadata ? { metadata: targetInput.metadata } : {}),
    })
    const targetHash = hashApprovalInput({
      targetId,
      workspaceId: targetInput.workspaceId,
      label: targetInput.label,
      kind: targetInput.kind,
      status: 'active',
      metadata: targetInput.metadata,
    })
    const actor = actorFor(input)
    const decision = this.targetDecision({
      targetId,
      targetHash,
      mutation: 'create',
      targetKind: targetInput.kind,
      ...(targetInput.workspaceId ? { workspaceId: targetInput.workspaceId } : {}),
      reason: 'Trusted gateway operator requested deployment target creation.',
    })
    this.authorizeTargetMutation({ action: 'target.created', actor, targetId, decision })
    try {
      const target = this.options.appState.deploymentTargets.create({
        targetId,
        ...targetInput,
        metadata: {
          ...(targetInput.metadata ?? {}),
          decisionRecord: decision,
        },
      })
      this.recordTargetOutcome({
        action: 'target.created',
        actor,
        target,
        decision,
        targetHash,
      })
      return target
    } catch (error) {
      this.recordTargetFailure({ action: 'target.created', actor, targetId, decision, targetHash })
      throw error
    }
  }

  updateTarget(
    input: UpdateLocalGatewayDeploymentTargetDraftInput,
  ): LocalGatewayDeploymentTargetRecord {
    const { actor: _actor, ...draft } = input
    const existing = this.options.appState.deploymentTargets.get(draft.targetId)
    if (!existing) throw new Error(`Unknown deployment target: ${draft.targetId}`)
    if (draft.workspaceId && !this.options.appState.workspaces.get(draft.workspaceId)) {
      throw new Error(`Unknown gateway workspace: ${draft.workspaceId}`)
    }
    const nextCandidate: LocalGatewayDeploymentTargetRecord = {
      ...existing,
      ...(draft.workspaceId ? { workspaceId: draft.workspaceId } : {}),
      ...(draft.label ? { label: draft.label } : {}),
      ...(draft.kind ? { kind: draft.kind } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.metadata ? { metadata: draft.metadata } : {}),
    }
    this.options.drivers.validateTarget(nextCandidate)
    const targetInput = this.deploymentTargetInputWithDriverSupport(draft, nextCandidate)
    const previousTargetHash = hashApprovalInput(existing)
    const targetHash = hashApprovalInput({
      targetId: existing.targetId,
      workspaceId: targetInput.workspaceId ?? existing.workspaceId,
      label: targetInput.label ?? existing.label,
      kind: targetInput.kind ?? existing.kind,
      status: targetInput.status ?? existing.status,
      metadata: targetInput.metadata ?? existing.metadata,
    })
    const actor = actorFor(input)
    const decision = this.targetDecision({
      targetId: existing.targetId,
      targetHash,
      previousTargetHash,
      mutation: 'update',
      targetKind: targetInput.kind ?? existing.kind,
      ...(targetInput.workspaceId ?? existing.workspaceId
        ? { workspaceId: targetInput.workspaceId ?? existing.workspaceId }
        : {}),
      previousStatus: existing.status,
      nextStatus: targetInput.status ?? existing.status,
      reason: 'Trusted gateway operator requested deployment target mutation.',
    })
    this.authorizeTargetMutation({ action: 'target.updated', actor, targetId: existing.targetId, decision })
    try {
      const target = this.options.appState.deploymentTargets.update({
        ...targetInput,
        metadata: {
          ...(targetInput.metadata ?? {}),
          decisionRecord: decision,
        },
      })
      this.recordTargetOutcome({
        action: 'target.updated',
        actor,
        target,
        decision,
        targetHash,
        previousStatus: existing.status,
      })
      return target
    } catch (error) {
      this.recordTargetFailure({
        action: 'target.updated',
        actor,
        targetId: existing.targetId,
        decision,
        targetHash,
      })
      throw error
    }
  }

  plan(input: {
    targetId: string
    operation: LocalGatewayDeploymentOperation
  }): LocalGatewayDeploymentPlan {
    return planLocalGatewayDeployment({
      appState: this.options.appState,
      targetId: input.targetId,
      operation: input.operation,
      dependencies: {
        repoRoot: this.options.repoRoot,
        drivers: this.options.drivers,
      },
    })
  }

  execute(input: {
    targetId: string
    operation: LocalGatewayDeploymentOperation
    confirm: string
    /** Trusted gateway identity. HTTP callers cannot set this directly. */
    actor?: string
  }): LocalGatewayDeploymentExecutionResult {
    assertDeploymentConfirmation(input.operation, input.confirm)
    const target = this.options.appState.deploymentTargets.get(input.targetId)
    if (!target) throw new Error(`Unknown deployment target: ${input.targetId}`)

    // Preflight before recording allow, while the actual driver call remains
    // immediately after the durable decision write below.
    const plan = this.plan({ targetId: input.targetId, operation: input.operation })
    const planHash = hashApprovalInput(plan)
    const targetHash = hashApprovalInput(target)
    const support = deploymentTargetSupport(target, this.options.drivers)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'deployment',
      operation: 'deployment.execute',
      targetKey: target.targetId,
      state: 'allow',
      reasons: [`Trusted gateway operator confirmed ${input.operation} for the deployment target.`],
      permissionCategories: ['deployment', 'side-effecting', 'operator-control-plane'],
      input: {
        targetId: target.targetId,
        operation: input.operation,
        targetKind: target.kind,
        targetHash,
        planHash,
      },
      metadata: {
        operation: input.operation,
        targetKind: target.kind,
        executionMode: support.executionMode,
        targetHash,
        planHash,
      },
    })
    const actor = actorFor(input)
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: `run.${input.operation}.authorized`,
      actor,
      targetType: 'deployment-target',
      targetId: target.targetId,
      metadata: { decisionRecord: decision },
    })
    try {
      const result = executeLocalGatewayDeployment({
        appState: this.options.appState,
        targetId: input.targetId,
        operation: input.operation,
        confirm: input.confirm,
        authorization: decision,
        plan,
        dependencies: {
          repoRoot: this.options.repoRoot,
          drivers: this.options.drivers,
          ...(this.options.commandRunner ? { commandRunner: this.options.commandRunner } : {}),
        },
      })
      this.options.appState.auditEvents.create({
        category: 'deployment',
        action: `run.${input.operation}.${result.execution.ok ? 'succeeded' : 'failed'}`,
        actor,
        targetType: 'deployment-target',
        targetId: input.targetId,
        metadata: {
          decisionId: decision.decisionId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          exitCode: result.execution.exitCode,
          targetHash,
          planHash,
          executionMode: support.executionMode,
        },
      })
      return result
    } catch (error) {
      this.options.appState.auditEvents.create({
        category: 'deployment',
        action: `run.${input.operation}.failed`,
        actor,
        targetType: 'deployment-target',
        targetId: input.targetId,
        metadata: {
          decisionId: decision.decisionId,
          targetHash,
          planHash,
          executionMode: support.executionMode,
        },
      })
      throw error
    }
  }

  private targetDecision(input: {
    targetId: string
    targetHash: string
    previousTargetHash?: string
    mutation: 'create' | 'update'
    targetKind: string
    workspaceId?: string
    previousStatus?: LocalGatewayDeploymentTargetRecord['status']
    nextStatus?: LocalGatewayDeploymentTargetRecord['status']
    reason: string
  }): DecisionRecord {
    return createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'deployment',
      operation: 'deployment.target.write',
      targetKey: input.targetId,
      state: 'allow',
      reasons: [input.reason],
      permissionCategories: ['deployment', 'operator-control-plane'],
      input: {
        targetId: input.targetId,
        mutation: input.mutation,
        targetHash: input.targetHash,
        ...(input.previousTargetHash ? { previousTargetHash: input.previousTargetHash } : {}),
      },
      metadata: {
        mutation: input.mutation,
        targetKind: input.targetKind,
        targetHash: input.targetHash,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
        ...(input.nextStatus ? { nextStatus: input.nextStatus } : {}),
        ...(input.previousTargetHash ? { previousTargetHash: input.previousTargetHash } : {}),
      },
    })
  }

  private authorizeTargetMutation(input: {
    action: 'target.created' | 'target.updated'
    actor: string
    targetId: string
    decision: DecisionRecord
  }): void {
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: `${input.action}.authorized`,
      actor: input.actor,
      targetType: 'deployment-target',
      targetId: input.targetId,
      metadata: { decisionRecord: input.decision },
    })
  }

  private recordTargetOutcome(input: {
    action: 'target.created' | 'target.updated'
    actor: string
    target: LocalGatewayDeploymentTargetRecord
    decision: DecisionRecord
    targetHash: string
    previousStatus?: LocalGatewayDeploymentTargetRecord['status']
  }): void {
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: input.action,
      actor: input.actor,
      targetType: 'deployment-target',
      targetId: input.target.targetId,
      metadata: {
        decisionRecord: input.decision,
        targetHash: input.targetHash,
        ...(input.target.workspaceId ? { workspaceId: input.target.workspaceId } : {}),
        ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
        ...(input.previousStatus ? { nextStatus: input.target.status } : {}),
      },
    })
  }

  private recordTargetFailure(input: {
    action: 'target.created' | 'target.updated'
    actor: string
    targetId: string
    decision: DecisionRecord
    targetHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: `${input.action}.failed`,
      actor: input.actor,
      targetType: 'deployment-target',
      targetId: input.targetId,
      metadata: {
        decisionId: input.decision.decisionId,
        targetHash: input.targetHash,
      },
    })
  }

  private deploymentTargetInputWithDriverSupport<T extends {
    kind?: string
    metadata?: Record<string, unknown>
  }>(
    input: T,
    target?: LocalGatewayDeploymentTargetRecord,
  ): T {
    const supportTarget = target
      ?? (
        input.kind
          ? {
              targetId: 'deployment_target_pending',
              label: 'pending',
              kind: input.kind,
              status: 'active' as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...(input.metadata ? { metadata: input.metadata } : {}),
            }
          : undefined
      )
    if (!supportTarget) return input
    const support = deploymentTargetSupport(supportTarget, this.options.drivers)
    return {
      ...input,
      metadata: {
        ...(input.metadata ?? target?.metadata ?? {}),
        deploymentDriver: {
          executionSupported: support.executionSupported,
          executionMode: support.executionMode,
          ...(support.executionUnavailableReason
            ? { executionUnavailableReason: support.executionUnavailableReason }
            : {}),
        },
      },
    }
  }
}

function actorFor(input: { actor?: string }): string {
  const actor = input.actor?.trim()
  return actor || 'local-gateway'
}

function assertDeploymentConfirmation(
  operation: LocalGatewayDeploymentOperation,
  confirmation: string,
): void {
  if (confirmation.trim().toLowerCase() !== operation) {
    throw new Error(`Deployment execution requires confirm="${operation}".`)
  }
}
