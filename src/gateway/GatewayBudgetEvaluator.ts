import { summarizeUsageLedger } from '../usage/UsageLedger.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayAppStateStore,
  LocalGatewayBudgetRecord,
  LocalGatewayClientRecord,
  LocalGatewayRunMetadataRecord,
  LocalGatewayUsageLedgerEntryRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'
import type {
  LocalGatewayBudgetEvaluation,
  LocalGatewayUsageBreakdown,
  LocalGatewayUsageRollup,
  LocalGatewayUsageStatus,
} from './LocalGateway.js'

type UsageContext = {
  usageEntries: LocalGatewayUsageLedgerEntryRecord[]
  runsById: Map<string, LocalGatewayRunMetadataRecord>
  workspacesById: Map<string, LocalGatewayWorkspaceRecord>
  agentsById: Map<string, LocalGatewayAgentRecord>
  clientsById: Map<string, LocalGatewayClientRecord>
}

function workspaceIdFor(entry: LocalGatewayUsageLedgerEntryRecord, context: Pick<UsageContext, 'runsById'>): string | undefined {
  return entry.workspaceId ?? context.runsById.get(entry.runId)?.workspaceId
}

function rollup(scopeType: LocalGatewayUsageRollup['scopeType'], scopeId: string, scopeLabel: string, entries: LocalGatewayUsageLedgerEntryRecord[]): LocalGatewayUsageRollup {
  return { scopeType, scopeId, scopeLabel, summary: summarizeUsageLedger(entries) }
}

function breakdowns(
  entries: readonly LocalGatewayUsageLedgerEntryRecord[],
  field: 'providerId' | 'modelId',
): LocalGatewayUsageBreakdown[] {
  const groups = new Map<string, LocalGatewayUsageBreakdown>()
  for (const entry of entries) {
    const id = entry[field] ?? 'unassigned'
    const current = groups.get(id) ?? {
      id,
      label: id,
      entries: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      unpricedEntries: 0,
    }
    current.entries += 1
    current.inputTokens += entry.inputTokens ?? 0
    current.outputTokens += entry.outputTokens ?? 0
    current.totalTokens += entry.totalTokens ?? (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0)
    current.estimatedCostUsd += entry.estimatedCostUsd ?? 0
    if (typeof entry.estimatedCostUsd !== 'number') current.unpricedEntries += 1
    groups.set(id, current)
  }
  return [...groups.values()].sort((left, right) =>
    right.estimatedCostUsd - left.estimatedCostUsd
    || right.totalTokens - left.totalTokens
    || left.label.localeCompare(right.label),
  )
}

/** Read-only usage and budget derivation. It never writes authority or audit rows. */
export class GatewayBudgetEvaluator {
  evaluate(appState: LocalGatewayAppStateStore): LocalGatewayBudgetEvaluation[] {
    const context = this.context(appState)
    return appState.budgets.list({ status: 'active' }).map((budget) => this.evaluateRecord(budget, context))
  }

  evaluateForRun(appState: LocalGatewayAppStateStore, input: { workspaceId?: string; agentId?: string }, sessionMetadata: unknown): LocalGatewayBudgetEvaluation[] {
    const metadata = sessionMetadata && typeof sessionMetadata === 'object' ? sessionMetadata as Record<string, unknown> : {}
    const workspaceId = input.workspaceId ?? (typeof metadata.workspaceId === 'string' ? metadata.workspaceId : undefined)
    const clientId = workspaceId
      ? appState.workspaces.get(workspaceId)?.clientId
      : typeof metadata.clientId === 'string' ? metadata.clientId : undefined
    const evaluations = new Map(this.evaluate(appState).map((evaluation) => [evaluation.budgetId, evaluation] as const))
    return appState.budgets.list({ status: 'active' })
      .filter((budget) => (budget.scopeType === 'client' && clientId === budget.scopeId)
        || (budget.scopeType === 'workspace' && workspaceId === budget.scopeId)
        || (budget.scopeType === 'agent' && input.agentId === budget.scopeId))
      .flatMap((budget) => {
        const evaluation = evaluations.get(budget.budgetId)
        return evaluation ? [evaluation] : []
      })
  }

  usageStatus(appState: LocalGatewayAppStateStore): LocalGatewayUsageStatus {
    const context = this.context(appState)
    const total = rollup('total', 'total', 'All usage', context.usageEntries)
    return {
      total,
      clients: [...context.clientsById.values()].map((client) => rollup('client', client.clientId, client.name,
        context.usageEntries.filter((entry) => {
          const workspaceId = workspaceIdFor(entry, context)
          return workspaceId ? context.workspacesById.get(workspaceId)?.clientId === client.clientId : false
        }))),
      workspaces: [...context.workspacesById.values()].map((workspace) => rollup('workspace', workspace.workspaceId, workspace.name,
        context.usageEntries.filter((entry) => workspaceIdFor(entry, context) === workspace.workspaceId))),
      agents: [...context.agentsById.values()].map((agent) => rollup('agent', agent.agentId, agent.name,
        context.usageEntries.filter((entry) => context.runsById.get(entry.runId)?.agentId === agent.agentId))),
      unpricedEntries: total.summary.unpricedEntries,
      pricedEntries: total.summary.pricedEntries,
      estimatedCostUsd: total.summary.estimatedCostUsd,
      breakdowns: {
        providers: breakdowns(context.usageEntries, 'providerId'),
        models: breakdowns(context.usageEntries, 'modelId'),
      },
    }
  }

  private context(appState: LocalGatewayAppStateStore): UsageContext {
    return {
      usageEntries: appState.usageLedger.list(),
      runsById: new Map(appState.runs.list().map((run) => [run.runId, run] as const)),
      workspacesById: new Map(appState.workspaces.list().map((workspace) => [workspace.workspaceId, workspace] as const)),
      agentsById: new Map(appState.agents.list().map((agent) => [agent.agentId, agent] as const)),
      clientsById: new Map(appState.clients.list().map((client) => [client.clientId, client] as const)),
    }
  }

  private evaluateRecord(budget: LocalGatewayBudgetRecord, context: UsageContext): LocalGatewayBudgetEvaluation {
    const matched = context.usageEntries.filter((entry) => {
      const workspaceId = workspaceIdFor(entry, context)
      if (budget.scopeType === 'workspace') return workspaceId === budget.scopeId
      if (budget.scopeType === 'agent') return context.runsById.get(entry.runId)?.agentId === budget.scopeId
      return workspaceId ? context.workspacesById.get(workspaceId)?.clientId === budget.scopeId : false
    })
    const summary = summarizeUsageLedger(matched)
    const used = summary.estimatedCostUsd
    const unpriced = summary.unpricedEntries > 0
    const status = used >= budget.maxEstimatedCostUsd ? 'blocked' : used >= budget.warnAtUsd || unpriced ? 'warn' : 'ok'
    const scopeLabel = budget.scopeType === 'client' ? context.clientsById.get(budget.scopeId)?.name ?? budget.scopeId
      : budget.scopeType === 'workspace' ? context.workspacesById.get(budget.scopeId)?.name ?? budget.scopeId
        : context.agentsById.get(budget.scopeId)?.name ?? budget.scopeId
    const reason = status === 'blocked' ? `Budget blocked cost-sensitive tools: ${budget.label} (${scopeLabel})`
      : unpriced ? `Budget has ${summary.unpricedEntries} unpriced usage ${summary.unpricedEntries === 1 ? 'entry' : 'entries'} requiring review: ${budget.label} (${scopeLabel})`
        : status === 'warn' ? `Budget warning requires review for cost-sensitive tools: ${budget.label} (${scopeLabel})`
          : `Budget allows cost-sensitive tools: ${budget.label} (${scopeLabel})`
    return { budgetId: budget.budgetId, scopeType: budget.scopeType, scopeId: budget.scopeId, label: budget.label, scopeLabel, status,
      maxEstimatedCostUsd: budget.maxEstimatedCostUsd, warnAtUsd: budget.warnAtUsd, usedEstimatedCostUsd: used,
      remainingEstimatedCostUsd: budget.maxEstimatedCostUsd - used, usageEntryCount: matched.length,
      pricedUsageEntryCount: summary.pricedEntries, unpricedUsageEntryCount: summary.unpricedEntries,
      estimateCoverage: unpriced ? 'incomplete' : 'complete',
      costSensitiveTools: { mode: status === 'warn' ? 'approval' : status === 'blocked' ? 'block' : 'allow', reason }, }
  }
}
