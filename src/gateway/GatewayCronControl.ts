import { createMainspringRuntimeId, type MainspringRuntimeProfile } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import {
  createRunLogCronGrant,
  type RunLogCronGrant,
  type RunLogCronPolicyMetadata,
} from '../capabilities/cron/RunLogCron.js'
import type { CronTimezone } from './CronExpression.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayCronScheduleRecord,
} from './AppStateStore.js'

export interface LocalGatewayCronScheduleDraftInput {
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label: string
  prompt: string
  cronExpr: string
  timezone?: CronTimezone
  allowedTools?: string[]
  runtimeProfile?: MainspringRuntimeProfile
  enabled?: boolean
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayCronScheduleDraftInput {
  scheduleId: string
  sessionId?: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label?: string
  prompt?: string
  cronExpr?: string
  timezone?: CronTimezone
  allowedTools?: string[]
  runtimeProfile?: MainspringRuntimeProfile
  enabled?: boolean
  nextRunAt?: string
  lastRunAt?: string
  lastError?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayCronGrantPreview {
  scheduleId: string
  sessionId: string
  agentId: string
  workspaceId?: string
  cronMode: string
  headless: true
  grantRequired: boolean
  grantPresent: boolean
  scheduleKey: string
  allowedTools: string[]
  decision: Pick<
    DecisionRecord,
    | 'decisionId'
    | 'state'
    | 'reasons'
    | 'permissionCategories'
    | 'inputHash'
    | 'manifestHash'
    | 'policyHash'
    | 'metadata'
  >
  grant?: Pick<
    RunLogCronGrant,
    | 'grantId'
    | 'mode'
    | 'promptHash'
    | 'scheduleHash'
    | 'allowedTools'
    | 'expiresAt'
    | 'maxExecutionCount'
    | 'executionCount'
    | 'createdAt'
  >
  lastDecision?: RunLogCronPolicyMetadata['lastDecision']
}

export interface LocalGatewayCreateCronGrantInput {
  scheduleId: string
  expiresAt?: string
  expiresInMs?: number
  maxExecutionCount?: number
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface GatewayCronGrantPreparation {
  agentId: string
  workspaceId?: string
  allowedTools: string[]
  scheduleKey: string
  metadata: Record<string, unknown> & RunLogCronPolicyMetadata
}

export interface GatewayCronControlOptions {
  appState: LocalGatewayAppStateStore
  now?: () => Date
  /** Keeps the grant binding aligned with the RunLog cron job interval. */
  grantIntervalMs: () => number
  validateSchedule: (input: {
    sessionId: string
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    computerId?: string
    label: string
    prompt: string
    cronExpr: string
    timezone?: CronTimezone
    runtimeProfile?: MainspringRuntimeProfile
  }) => void
  computeNextRunAt: (input: {
    cronExpr: string
    timezone: CronTimezone
    after: Date
  }) => string | undefined
  prepareGrant: (
    schedule: LocalGatewayCronScheduleRecord,
    now: Date,
  ) => GatewayCronGrantPreparation
  previewGrant: (
    schedule: LocalGatewayCronScheduleRecord,
    now: Date,
  ) => LocalGatewayCronGrantPreview
}

export interface LocalGatewayCronTriggerAuthorization {
  scheduleId: string
  sessionId: string
  trigger: 'manual' | 'scheduler'
  actor: string
  scheduleHash: string
  decision: DecisionRecord
}

function normalizedText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function actorFor(input: { actor?: string }): string {
  return normalizedText(input.actor) ?? 'local-gateway'
}

function scheduleBinding(input: {
  scheduleId?: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label: string
  prompt: string
  cronExpr: string
  timezone: CronTimezone
  allowedTools: readonly string[]
  runtimeProfile?: string
  enabled: boolean
}): Record<string, unknown> {
  return {
    ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
    sessionId: input.sessionId,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
    ...(input.computerId ? { computerId: input.computerId } : {}),
    label: input.label,
    prompt: input.prompt,
    cronExpr: input.cronExpr,
    timezone: input.timezone,
    allowedTools: [...input.allowedTools],
    ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
    enabled: input.enabled,
  }
}

function scheduleHash(input: Parameters<typeof scheduleBinding>[0]): string {
  return hashApprovalInput(scheduleBinding(input))
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

/**
 * Owns gateway cron configuration and grant authority. RunLog remains the
 * execution-time policy boundary; this collaborator makes the preceding
 * operator mutations durable and auditable before app-state can change.
 */
export class GatewayCronControl {
  private readonly now: () => Date

  constructor(private readonly options: GatewayCronControlOptions) {
    this.now = options.now ?? (() => new Date())
  }

  list(): LocalGatewayCronScheduleRecord[] {
    return this.options.appState.cronSchedules.list()
  }

  authorizeTrigger(input: {
    scheduleId: string
    trigger: 'manual' | 'scheduler'
    actor?: string
    nextRunAt?: string
  }): LocalGatewayCronTriggerAuthorization {
    const schedule = this.requireSchedule(input.scheduleId)
    const scheduleHashValue = scheduleHash(schedule)
    const actor = actorFor(input)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'cron',
      operation: 'cron.trigger',
      targetKey: schedule.scheduleId,
      state: 'allow',
      reasons: [
        input.trigger === 'manual'
          ? 'Trusted gateway operator requested an immediate cron trigger.'
          : 'Trusted gateway scheduler requested a due cron trigger.',
      ],
      permissionCategories: ['cron', 'headless', 'operator-control-plane'],
      input: {
        scheduleId: schedule.scheduleId,
        scheduleHash: scheduleHashValue,
        trigger: input.trigger,
        ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
      },
      metadata: {
        scheduleHash: scheduleHashValue,
        trigger: input.trigger,
        ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
      },
    })
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: input.trigger === 'manual'
        ? 'schedule.run-now.authorized'
        : 'schedule.triggered.authorized',
      actor,
      targetType: 'schedule',
      targetId: schedule.scheduleId,
      sessionId: schedule.sessionId,
      metadata: decisionMetadata(decision),
    })
    return {
      scheduleId: schedule.scheduleId,
      sessionId: schedule.sessionId,
      trigger: input.trigger,
      actor,
      scheduleHash: scheduleHashValue,
      decision,
    }
  }

  recordTriggerOutcome(input: {
    authorization: LocalGatewayCronTriggerAuthorization
    runId: string
    nextRunAt?: string
    executionDecision?: DecisionRecord
  }): void {
    const metadata: Record<string, unknown> = {
      nextRunAt: input.nextRunAt ?? null,
      triggerDecisionId: input.authorization.decision.decisionId,
      scheduleHash: input.authorization.scheduleHash,
      ...(input.executionDecision
        ? {
            decisionId: input.executionDecision.decisionId,
            state: input.executionDecision.state,
            ...(input.executionDecision.reasons.length > 0
              ? { reasons: input.executionDecision.reasons }
              : {}),
          }
        : {}),
    }
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: input.authorization.trigger === 'manual' ? 'schedule.run-now' : 'schedule.triggered',
      actor: input.authorization.actor,
      targetType: 'schedule',
      targetId: input.authorization.scheduleId,
      runId: input.runId,
      sessionId: input.authorization.sessionId,
      metadata,
    })
  }

  recordTriggerFailure(input: {
    authorization: LocalGatewayCronTriggerAuthorization
  }): void {
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: input.authorization.trigger === 'manual'
        ? 'schedule.run-now.failed'
        : 'schedule.triggered.failed',
      actor: input.authorization.actor,
      targetType: 'schedule',
      targetId: input.authorization.scheduleId,
      sessionId: input.authorization.sessionId,
      metadata: {
        triggerDecisionId: input.authorization.decision.decisionId,
        scheduleHash: input.authorization.scheduleHash,
      },
    })
  }

  create(input: LocalGatewayCronScheduleDraftInput): LocalGatewayCronScheduleRecord {
    const now = this.now()
    const scheduleId = createMainspringRuntimeId('schedule')
    const timezone = input.timezone ?? 'local'
    const allowedTools = [...(input.allowedTools ?? [])]
    const enabled = input.enabled ?? true
    const binding = scheduleBinding({
      scheduleId,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
      ...(input.computerId ? { computerId: input.computerId } : {}),
      label: input.label,
      prompt: input.prompt,
      cronExpr: input.cronExpr,
      timezone,
      allowedTools,
      ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
      enabled,
    })
    this.options.validateSchedule({
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
      ...(input.computerId ? { computerId: input.computerId } : {}),
      label: input.label,
      prompt: input.prompt,
      cronExpr: input.cronExpr,
      timezone,
      ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
    })
    const nextRunAt = this.options.computeNextRunAt({ cronExpr: input.cronExpr, timezone, after: now })
    const bindingHash = hashApprovalInput(binding)
    const actor = actorFor(input)
    const decision = this.scheduleDecision({
      scheduleId,
      bindingHash,
      mutation: 'create',
      reason: 'Trusted gateway operator created a cron schedule.',
    })
    this.authorize({ action: 'schedule.created', actor, scheduleId, decision })
    try {
      const schedule = this.options.appState.cronSchedules.create({
        ...input,
        scheduleId,
        timezone,
        allowedTools,
        enabled,
        ...(nextRunAt ? { nextRunAt } : {}),
      })
      this.recordScheduleOutcome({
        action: 'schedule.created',
        actor,
        schedule,
        decision,
        bindingHash,
      })
      return schedule
    } catch (error) {
      this.recordFailure({ action: 'schedule.created', actor, scheduleId, decision, bindingHash })
      throw error
    }
  }

  update(input: UpdateLocalGatewayCronScheduleDraftInput): LocalGatewayCronScheduleRecord {
    const now = this.now()
    const existing = this.requireSchedule(input.scheduleId)
    const timezone = input.timezone ?? existing.timezone
    const enabled = input.enabled ?? existing.enabled
    const nextRunAt = enabled
      ? this.options.computeNextRunAt({
          cronExpr: input.cronExpr ?? existing.cronExpr,
          timezone,
          after: now,
        })
      : undefined
    const sessionId = input.sessionId ?? existing.sessionId
    const workspaceId = input.workspaceId ?? existing.workspaceId
    const agentId = input.agentId ?? existing.agentId
    const providerProfileId = input.providerProfileId ?? existing.providerProfileId
    const computerId = input.computerId ?? existing.computerId
    const runtimeProfile = input.runtimeProfile ?? existing.runtimeProfile
    const projected = {
      scheduleId: existing.scheduleId,
      sessionId,
      ...(workspaceId ? { workspaceId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(providerProfileId ? { providerProfileId } : {}),
      ...(computerId ? { computerId } : {}),
      label: input.label ?? existing.label,
      prompt: input.prompt ?? existing.prompt,
      cronExpr: input.cronExpr ?? existing.cronExpr,
      timezone,
      allowedTools: input.allowedTools ?? existing.allowedTools,
      ...(runtimeProfile ? { runtimeProfile } : {}),
      enabled,
    }
    this.options.validateSchedule(projected)
    const actor = actorFor(input)
    const previousHash = scheduleHash(existing)
    const bindingHash = scheduleHash(projected)
    const decision = this.scheduleDecision({
      scheduleId: existing.scheduleId,
      bindingHash,
      previousHash,
      mutation: 'update',
      reason: 'Trusted gateway operator updated a cron schedule.',
    })
    this.authorize({ action: 'schedule.updated', actor, scheduleId: existing.scheduleId, decision })
    const { actor: _actor, ...patch } = input
    try {
      const schedule = this.options.appState.cronSchedules.update({
        ...patch,
        timezone,
        ...(enabled
          ? { nextRunAt, lastError: input.lastError ?? existing.lastError }
          : { nextRunAt: '', lastError: '' }),
      })
      this.recordScheduleOutcome({
        action: 'schedule.updated',
        actor,
        schedule,
        decision,
        bindingHash,
      })
      return schedule
    } catch (error) {
      this.recordFailure({
        action: 'schedule.updated',
        actor,
        scheduleId: existing.scheduleId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  delete(scheduleIdInput: string, actorInput?: string): void {
    const existing = this.requireSchedule(scheduleIdInput)
    const actor = actorFor({ actor: actorInput })
    const bindingHash = scheduleHash(existing)
    const decision = this.scheduleDecision({
      scheduleId: existing.scheduleId,
      bindingHash,
      mutation: 'delete',
      reason: 'Trusted gateway operator deleted a cron schedule.',
    })
    this.authorize({ action: 'schedule.deleted', actor, scheduleId: existing.scheduleId, decision })
    try {
      this.options.appState.cronSchedules.delete(existing.scheduleId)
      this.options.appState.auditEvents.create({
        category: 'cron',
        action: 'schedule.deleted',
        actor,
        targetType: 'schedule',
        targetId: existing.scheduleId,
        sessionId: existing.sessionId,
        metadata: { decisionId: decision.decisionId, scheduleHash: bindingHash },
      })
    } catch (error) {
      this.recordFailure({
        action: 'schedule.deleted',
        actor,
        scheduleId: existing.scheduleId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  previewGrant(scheduleId: string): LocalGatewayCronGrantPreview {
    const now = this.now()
    return this.options.previewGrant(this.requireSchedule(scheduleId), now)
  }

  createGrant(input: LocalGatewayCreateCronGrantInput): LocalGatewayCronGrantPreview {
    const schedule = this.requireSchedule(input.scheduleId)
    const now = this.now()
    const prepared = this.options.prepareGrant(schedule, now)
    const grant = createRunLogCronGrant({
      agentId: prepared.agentId,
      input: schedule.prompt,
      intervalMs: this.options.grantIntervalMs(),
      sessionId: schedule.sessionId,
      workspaceId: prepared.workspaceId,
      allowedTools: prepared.allowedTools,
      scheduleKey: prepared.scheduleKey,
      expiresAt: input.expiresAt,
      expiresInMs: input.expiresInMs,
      maxExecutionCount: input.maxExecutionCount,
      createdAt: now.toISOString(),
    })
    const metadata: Record<string, unknown> & RunLogCronPolicyMetadata = {
      ...prepared.metadata,
      cronMode: 'allowlist',
      cronGrant: grant,
    }
    const actor = actorFor(input)
    const bindingHash = scheduleHash(schedule)
    const grantHash = hashApprovalInput(grant)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'cron',
      operation: 'cron.grant.create',
      targetKey: schedule.scheduleId,
      state: 'allow',
      reasons: ['Trusted gateway operator created a bounded headless cron grant.'],
      permissionCategories: ['cron', 'headless', 'side-effecting', 'operator-control-plane'],
      input: {
        scheduleId: schedule.scheduleId,
        scheduleHash: bindingHash,
        grantHash,
        scheduleKey: prepared.scheduleKey,
      },
      metadata: {
        scheduleHash: bindingHash,
        grantHash,
        scheduleKey: prepared.scheduleKey,
        grantId: grant.grantId,
        expiresAt: grant.expiresAt,
        maxExecutionCount: grant.maxExecutionCount,
      },
    })
    this.authorize({ action: 'schedule.grant.created', actor, scheduleId: schedule.scheduleId, decision })
    try {
      const updatedSchedule = this.options.appState.cronSchedules.update({
        scheduleId: schedule.scheduleId,
        metadata,
      })
      this.options.appState.auditEvents.create({
        category: 'cron',
        action: 'schedule.grant.created',
        actor,
        targetType: 'schedule',
        targetId: schedule.scheduleId,
        sessionId: schedule.sessionId,
        metadata: {
          decisionId: decision.decisionId,
          scheduleHash: bindingHash,
          grantHash,
          grantId: grant.grantId,
          expiresAt: grant.expiresAt,
          maxExecutionCount: grant.maxExecutionCount,
          scheduleKey: prepared.scheduleKey,
        },
      })
      return this.options.previewGrant(updatedSchedule, now)
    } catch (error) {
      this.recordFailure({
        action: 'schedule.grant.created',
        actor,
        scheduleId: schedule.scheduleId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  private requireSchedule(scheduleIdInput: string): LocalGatewayCronScheduleRecord {
    const scheduleId = scheduleIdInput.trim()
    if (!scheduleId) throw new Error('Cron scheduleId is required.')
    const schedule = this.options.appState.cronSchedules.get(scheduleId)
    if (!schedule) throw new Error(`Unknown cron schedule: ${scheduleId}`)
    return schedule
  }

  private scheduleDecision(input: {
    scheduleId: string
    bindingHash: string
    previousHash?: string
    mutation: 'create' | 'update' | 'delete'
    reason: string
  }): DecisionRecord {
    return createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'cron',
      operation: 'cron.schedule.write',
      targetKey: input.scheduleId,
      state: 'allow',
      reasons: [input.reason],
      permissionCategories: ['cron', 'headless', 'operator-control-plane'],
      input: {
        scheduleId: input.scheduleId,
        mutation: input.mutation,
        scheduleHash: input.bindingHash,
        ...(input.previousHash ? { previousScheduleHash: input.previousHash } : {}),
      },
      metadata: {
        mutation: input.mutation,
        scheduleHash: input.bindingHash,
        ...(input.previousHash ? { previousScheduleHash: input.previousHash } : {}),
      },
    })
  }

  private authorize(input: {
    action: string
    actor: string
    scheduleId: string
    decision: DecisionRecord
  }): void {
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: `${input.action}.authorized`,
      actor: input.actor,
      targetType: 'schedule',
      targetId: input.scheduleId,
      metadata: decisionMetadata(input.decision),
    })
  }

  private recordScheduleOutcome(input: {
    action: 'schedule.created' | 'schedule.updated'
    actor: string
    schedule: LocalGatewayCronScheduleRecord
    decision: DecisionRecord
    bindingHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: input.action,
      actor: input.actor,
      targetType: 'schedule',
      targetId: input.schedule.scheduleId,
      sessionId: input.schedule.sessionId,
      metadata: {
        decisionId: input.decision.decisionId,
        scheduleHash: input.bindingHash,
        enabled: input.schedule.enabled,
      },
    })
  }

  private recordFailure(input: {
    action: string
    actor: string
    scheduleId: string
    decision: DecisionRecord
    bindingHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'cron',
      action: `${input.action}.failed`,
      actor: input.actor,
      targetType: 'schedule',
      targetId: input.scheduleId,
      metadata: {
        decisionId: input.decision.decisionId,
        scheduleHash: input.bindingHash,
      },
    })
  }
}
