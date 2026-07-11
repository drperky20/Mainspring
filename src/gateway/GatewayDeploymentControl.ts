import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord } from '../policy/DecisionRecord.js'
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
}

export interface UpdateLocalGatewayDeploymentTargetDraftInput {
  targetId: string
  workspaceId?: string
  label?: string
  kind?: LocalGatewayDeploymentTargetRecord['kind']
  status?: LocalGatewayDeploymentTargetRecord['status']
  metadata?: Record<string, unknown>
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
    if (input.workspaceId && !this.options.appState.workspaces.get(input.workspaceId)) {
      throw new Error(`Unknown gateway workspace: ${input.workspaceId}`)
    }
    const targetId = createMainspringRuntimeId('deployment_target')
    const targetInput = this.deploymentTargetInputWithDriverSupport(input)
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
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'deployment',
      operation: 'deployment.target.write',
      targetKey: targetId,
      state: 'allow',
      reasons: ['Trusted local gateway operator requested deployment target creation.'],
      permissionCategories: ['deployment', 'operator-control-plane'],
      input: targetInput,
      metadata: {
        mutation: 'create',
        targetKind: targetInput.kind,
        ...(targetInput.workspaceId ? { workspaceId: targetInput.workspaceId } : {}),
      },
    })
    const target = this.options.appState.deploymentTargets.create({
      targetId,
      ...targetInput,
      metadata: {
        ...(targetInput.metadata ?? {}),
        decisionRecord: decision,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: 'target.created',
      actor: 'local-gateway',
      targetType: 'deployment-target',
      targetId: target.targetId,
      metadata: {
        decisionRecord: decision,
        ...(target.workspaceId ? { workspaceId: target.workspaceId } : {}),
      },
    })
    return target
  }

  updateTarget(
    input: UpdateLocalGatewayDeploymentTargetDraftInput,
  ): LocalGatewayDeploymentTargetRecord {
    const existing = this.options.appState.deploymentTargets.get(input.targetId)
    if (!existing) throw new Error(`Unknown deployment target: ${input.targetId}`)
    if (input.workspaceId && !this.options.appState.workspaces.get(input.workspaceId)) {
      throw new Error(`Unknown gateway workspace: ${input.workspaceId}`)
    }
    const nextCandidate: LocalGatewayDeploymentTargetRecord = {
      ...existing,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
    this.options.drivers.validateTarget(nextCandidate)
    const targetInput = this.deploymentTargetInputWithDriverSupport(input, nextCandidate)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'deployment',
      operation: 'deployment.target.write',
      targetKey: existing.targetId,
      state: 'allow',
      reasons: ['Trusted local gateway operator requested deployment target mutation.'],
      permissionCategories: ['deployment', 'operator-control-plane'],
      input: targetInput,
      metadata: {
        mutation: 'update',
        previousKind: existing.kind,
        nextKind: targetInput.kind ?? existing.kind,
        previousStatus: existing.status,
        nextStatus: targetInput.status ?? existing.status,
      },
    })
    const target = this.options.appState.deploymentTargets.update({
      ...targetInput,
      metadata: {
        ...(targetInput.metadata ?? {}),
        decisionRecord: decision,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: 'target.updated',
      actor: 'local-gateway',
      targetType: 'deployment-target',
      targetId: target.targetId,
      metadata: {
        previousStatus: existing.status,
        nextStatus: target.status,
        decisionRecord: decision,
      },
    })
    return target
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
  }): LocalGatewayDeploymentExecutionResult {
    assertDeploymentConfirmation(input.operation, input.confirm)
    const target = this.options.appState.deploymentTargets.get(input.targetId)
    if (!target) throw new Error(`Unknown deployment target: ${input.targetId}`)

    // Preflight before recording allow, while the actual driver call remains
    // immediately after the durable decision write below.
    const plan = this.plan(input)
    const planHash = hashApprovalInput(plan)
    const targetHash = hashApprovalInput(target)
    const support = deploymentTargetSupport(target, this.options.drivers)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'deployment',
      operation: 'deployment.execute',
      targetKey: target.targetId,
      state: 'allow',
      reasons: [`Trusted local gateway operator confirmed ${input.operation} for the deployment target.`],
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
    this.options.appState.auditEvents.create({
      category: 'deployment',
      action: `run.${input.operation}.authorized`,
      actor: 'local-gateway',
      targetType: 'deployment-target',
      targetId: target.targetId,
      metadata: { decisionRecord: decision },
    })
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
      actor: 'local-gateway',
      targetType: 'deployment-target',
      targetId: input.targetId,
      metadata: {
        decisionId: decision.decisionId,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        exitCode: result.execution.exitCode,
      },
    })
    return result
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

function assertDeploymentConfirmation(
  operation: LocalGatewayDeploymentOperation,
  confirmation: string,
): void {
  if (confirmation.trim().toLowerCase() !== operation) {
    throw new Error(`Deployment execution requires confirm="${operation}".`)
  }
}
