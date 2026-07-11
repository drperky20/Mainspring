import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayBudgetRecord,
  LocalGatewayBudgetScope,
} from './AppStateStore.js'

export interface LocalGatewayBudgetDraftInput {
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  label: string
  maxEstimatedCostUsd: number
  warnAtUsd?: number
  status?: 'active' | 'archived'
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayBudgetDraftInput {
  budgetId: string
  label?: string
  maxEstimatedCostUsd?: number
  warnAtUsd?: number
  status?: 'active' | 'archived'
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

/** The non-sensitive portion of a computed budget state that binds a run decision. */
export interface GatewayBudgetEvaluationBinding {
  budgetId: string
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  status: 'blocked' | 'warn'
  usedEstimatedCostUsd: number
  remainingEstimatedCostUsd: number
  usageEntryCount: number
  pricedUsageEntryCount: number
  unpricedUsageEntryCount: number
}

export interface GatewayBudgetRunDecisionInput {
  sessionId: string
  actor?: string
  /** Kept transient; persisted decision data contains only its hash. */
  runBinding: unknown
  evaluations: readonly GatewayBudgetEvaluationBinding[]
  acknowledged: boolean
}

export interface GatewayBudgetControlOptions {
  appState: LocalGatewayAppStateStore
  validateScope: (scopeType: LocalGatewayBudgetScope, scopeId: string) => void
}

type BudgetMutation = 'create' | 'update' | 'delete'

function normalizedText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function requiredText(value: string, label: string): string {
  const text = value.trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function actorFor(input: { actor?: string }): string {
  return normalizedText(input.actor) ?? 'local-gateway'
}

function requiredUsdAmount(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`)
  }
  return value
}

function budgetStatus(value: LocalGatewayBudgetRecord['status'] | undefined): LocalGatewayBudgetRecord['status'] {
  const status = value ?? 'active'
  if (status !== 'active' && status !== 'archived') {
    throw new Error('Budget status must be active or archived.')
  }
  return status
}

function budgetScope(value: LocalGatewayBudgetScope): LocalGatewayBudgetScope {
  if (value !== 'client' && value !== 'workspace' && value !== 'agent') {
    throw new Error('Budget scope type must be client, workspace, or agent.')
  }
  return value
}

function acknowledged(value: boolean): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Budget acknowledgement must be a boolean.')
  }
  return value
}

function budgetBinding(input: {
  budgetId?: string
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  label: string
  maxEstimatedCostUsd: number
  warnAtUsd: number
  status: LocalGatewayBudgetRecord['status']
}): Record<string, unknown> {
  return {
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    label: input.label,
    maxEstimatedCostUsd: input.maxEstimatedCostUsd,
    warnAtUsd: input.warnAtUsd,
    status: input.status,
  }
}

function budgetHash(input: Parameters<typeof budgetBinding>[0]): string {
  return hashApprovalInput(budgetBinding(input))
}

function evaluationBinding(input: GatewayBudgetEvaluationBinding): Record<string, unknown> {
  return {
    budgetId: input.budgetId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    status: input.status,
    usedEstimatedCostUsd: input.usedEstimatedCostUsd,
    remainingEstimatedCostUsd: input.remainingEstimatedCostUsd,
    usageEntryCount: input.usageEntryCount,
    pricedUsageEntryCount: input.pricedUsageEntryCount,
    unpricedUsageEntryCount: input.unpricedUsageEntryCount,
  }
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

/**
 * Owns gateway budget configuration plus the explicit warning acknowledgement
 * that must be recorded before a warning-band run can be enqueued. Runtime
 * policy enforcement stays in LocalGateway/RunLog; this service records the
 * preceding operator control-plane authority with hash-only evidence.
 */
export class GatewayBudgetControl {
  constructor(private readonly options: GatewayBudgetControlOptions) {}

  list(): LocalGatewayBudgetRecord[] {
    return this.options.appState.budgets.list()
  }

  create(input: LocalGatewayBudgetDraftInput): LocalGatewayBudgetRecord {
    const budgetId = createMainspringRuntimeId('budget')
    const scopeType = budgetScope(input.scopeType)
    const scopeId = requiredText(input.scopeId, 'budget scope id')
    const label = requiredText(input.label, 'budget label')
    const maxEstimatedCostUsd = requiredUsdAmount(input.maxEstimatedCostUsd, 'budget max estimated cost usd')
    const warnAtUsd = requiredUsdAmount(
      input.warnAtUsd ?? maxEstimatedCostUsd * 0.8,
      'budget warn at usd',
    )
    if (warnAtUsd > maxEstimatedCostUsd) {
      throw new Error('budget warn at usd must be less than or equal to the max estimated cost usd.')
    }
    const status = budgetStatus(input.status)
    this.options.validateScope(scopeType, scopeId)
    const bindingHash = budgetHash({
      budgetId,
      scopeType,
      scopeId,
      label,
      maxEstimatedCostUsd,
      warnAtUsd,
      status,
    })
    const actor = actorFor(input)
    const decision = this.writeDecision({
      budgetId,
      scopeType,
      scopeId,
      bindingHash,
      mutation: 'create',
      reason: 'Trusted gateway operator created a budget control.',
    })
    this.authorize({ action: 'budget.created', actor, scopeType, scopeId, decision })
    try {
      const budget = this.options.appState.budgets.create({
        budgetId,
        scopeType,
        scopeId,
        label,
        maxEstimatedCostUsd,
        warnAtUsd,
        status,
      })
      this.recordBudgetOutcome({ action: 'budget.created', actor, budget, decision, bindingHash })
      return budget
    } catch (error) {
      this.recordFailure({
        action: 'budget.created',
        actor,
        scopeType,
        scopeId,
        budgetId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  update(input: UpdateLocalGatewayBudgetDraftInput): LocalGatewayBudgetRecord {
    const existing = this.requireBudget(input.budgetId)
    const label = input.label === undefined ? existing.label : requiredText(input.label, 'budget label')
    const maxEstimatedCostUsd = requiredUsdAmount(
      input.maxEstimatedCostUsd ?? existing.maxEstimatedCostUsd,
      'budget max estimated cost usd',
    )
    const warnAtUsd = requiredUsdAmount(input.warnAtUsd ?? existing.warnAtUsd, 'budget warn at usd')
    if (warnAtUsd > maxEstimatedCostUsd) {
      throw new Error('budget warn at usd must be less than or equal to the max estimated cost usd.')
    }
    const status = budgetStatus(input.status ?? existing.status)
    this.options.validateScope(existing.scopeType, existing.scopeId)
    const previousHash = budgetHash(existing)
    const bindingHash = budgetHash({
      budgetId: existing.budgetId,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      label,
      maxEstimatedCostUsd,
      warnAtUsd,
      status,
    })
    const actor = actorFor(input)
    const decision = this.writeDecision({
      budgetId: existing.budgetId,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      bindingHash,
      previousHash,
      mutation: 'update',
      reason: 'Trusted gateway operator updated a budget control.',
    })
    this.authorize({
      action: 'budget.updated',
      actor,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      decision,
    })
    try {
      const budget = this.options.appState.budgets.update({
        budgetId: existing.budgetId,
        label,
        maxEstimatedCostUsd,
        warnAtUsd,
        status,
      })
      this.recordBudgetOutcome({ action: 'budget.updated', actor, budget, decision, bindingHash })
      return budget
    } catch (error) {
      this.recordFailure({
        action: 'budget.updated',
        actor,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        budgetId: existing.budgetId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  delete(budgetIdInput: string, actorInput?: string): void {
    const existing = this.requireBudget(budgetIdInput)
    const actor = actorFor({ actor: actorInput })
    const bindingHash = budgetHash(existing)
    const decision = this.writeDecision({
      budgetId: existing.budgetId,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      bindingHash,
      mutation: 'delete',
      reason: 'Trusted gateway operator deleted a budget control.',
    })
    this.authorize({
      action: 'budget.deleted',
      actor,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      decision,
    })
    try {
      this.options.appState.budgets.delete(existing.budgetId)
      this.options.appState.auditEvents.create({
        category: 'billing',
        action: 'budget.deleted',
        actor,
        targetType: existing.scopeType,
        targetId: existing.scopeId,
        metadata: { budgetId: existing.budgetId, decisionId: decision.decisionId, budgetHash: bindingHash },
      })
    } catch (error) {
      this.recordFailure({
        action: 'budget.deleted',
        actor,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        budgetId: existing.budgetId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  /**
   * Records the hard block or acknowledgement state before LocalGateway can
   * reach a mailbox or RunLog enqueue. The caller keeps labels and raw run
   * text transient; audit evidence stores only deterministic hashes and IDs.
   */
  recordRunDecision(input: GatewayBudgetRunDecisionInput): DecisionRecord {
    const sessionId = requiredText(input.sessionId, 'budget session id')
    const acknowledgement = acknowledged(input.acknowledged)
    const evaluations = input.evaluations.filter((evaluation) => (
      evaluation.status === 'blocked' || evaluation.status === 'warn'
    ))
    if (evaluations.length === 0) {
      throw new Error('Budget decision requires at least one blocked or warning evaluation.')
    }
    const blocked = evaluations.filter((evaluation) => evaluation.status === 'blocked')
    const applicable = blocked.length > 0 ? blocked : evaluations
    const evidence = applicable.map((evaluation) => {
      const budget = this.requireBudget(evaluation.budgetId)
      if (budget.scopeType !== evaluation.scopeType || budget.scopeId !== evaluation.scopeId) {
        throw new Error(`Budget ${budget.budgetId} changed before run authorization.`)
      }
      return {
        budgetId: budget.budgetId,
        budgetHash: budgetHash(budget),
        evaluationHash: hashApprovalInput(evaluationBinding(evaluation)),
      }
    })
    const hardBlocked = blocked.length > 0
    const isAcknowledged = !hardBlocked && acknowledgement
    const state: DecisionRecord['state'] = hardBlocked
      ? 'hard_block'
      : isAcknowledged
        ? 'allow'
        : 'requires_approval'
    const operation = hardBlocked ? 'budget.run.block' : 'budget.warning.acknowledge'
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      sessionId,
      surface: 'budget',
      operation,
      targetKey: sessionId,
      state,
      reasons: [
        hardBlocked
          ? 'Active budget policy blocks this run before enqueue.'
          : isAcknowledged
            ? 'Trusted gateway operator acknowledged active budget warnings before enqueue.'
            : 'Active budget warnings require acknowledgement before enqueue.',
      ],
      permissionCategories: hardBlocked
        ? ['budget', 'hard-policy', 'operator-control-plane']
        : ['budget', 'operator-control-plane'],
      input: {
        sessionId,
        runBindingHash: hashApprovalInput(input.runBinding),
        budgets: evidence,
      },
      metadata: {
        budgetIds: evidence.map((entry) => entry.budgetId),
        budgetHashes: evidence.map((entry) => entry.budgetHash),
        evaluationHashes: evidence.map((entry) => entry.evaluationHash),
        ...(hardBlocked ? { hardBlocked: true } : { acknowledged: isAcknowledged }),
      },
    })
    this.options.appState.auditEvents.create({
      category: 'billing',
      action: hardBlocked
        ? 'budget.blocked'
        : isAcknowledged
          ? 'budget.warning.acknowledged'
          : 'budget.warning_ack_required',
      actor: actorFor(input),
      targetType: 'session',
      targetId: sessionId,
      sessionId,
      metadata: {
        ...decisionMetadata(decision),
        budgetIds: evidence.map((entry) => entry.budgetId),
        budgetHashes: evidence.map((entry) => entry.budgetHash),
      },
    })
    return decision
  }

  private requireBudget(budgetIdInput: string): LocalGatewayBudgetRecord {
    const budgetId = budgetIdInput.trim()
    if (!budgetId) throw new Error('Budget budgetId is required.')
    const budget = this.options.appState.budgets.get(budgetId)
    if (!budget) throw new Error(`Unknown budget: ${budgetId}`)
    return budget
  }

  private writeDecision(input: {
    budgetId: string
    scopeType: LocalGatewayBudgetScope
    scopeId: string
    bindingHash: string
    previousHash?: string
    mutation: BudgetMutation
    reason: string
  }): DecisionRecord {
    return createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'budget',
      operation: 'budget.write',
      targetKey: input.budgetId,
      state: 'allow',
      reasons: [input.reason],
      permissionCategories: ['budget', 'operator-control-plane'],
      input: {
        budgetId: input.budgetId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        mutation: input.mutation,
        budgetHash: input.bindingHash,
        ...(input.previousHash ? { previousBudgetHash: input.previousHash } : {}),
      },
      metadata: {
        mutation: input.mutation,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        budgetHash: input.bindingHash,
        ...(input.previousHash ? { previousBudgetHash: input.previousHash } : {}),
      },
    })
  }

  private authorize(input: {
    action: string
    actor: string
    scopeType: LocalGatewayBudgetScope
    scopeId: string
    decision: DecisionRecord
  }): void {
    this.options.appState.auditEvents.create({
      category: 'billing',
      action: `${input.action}.authorized`,
      actor: input.actor,
      targetType: input.scopeType,
      targetId: input.scopeId,
      metadata: decisionMetadata(input.decision),
    })
  }

  private recordBudgetOutcome(input: {
    action: 'budget.created' | 'budget.updated'
    actor: string
    budget: LocalGatewayBudgetRecord
    decision: DecisionRecord
    bindingHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'billing',
      action: input.action,
      actor: input.actor,
      targetType: input.budget.scopeType,
      targetId: input.budget.scopeId,
      metadata: {
        budgetId: input.budget.budgetId,
        decisionId: input.decision.decisionId,
        budgetHash: input.bindingHash,
        status: input.budget.status,
      },
    })
  }

  private recordFailure(input: {
    action: string
    actor: string
    scopeType: LocalGatewayBudgetScope
    scopeId: string
    budgetId: string
    decision: DecisionRecord
    bindingHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'billing',
      action: `${input.action}.failed`,
      actor: input.actor,
      targetType: input.scopeType,
      targetId: input.scopeId,
      metadata: {
        budgetId: input.budgetId,
        decisionId: input.decision.decisionId,
        budgetHash: input.bindingHash,
      },
    })
  }
}
