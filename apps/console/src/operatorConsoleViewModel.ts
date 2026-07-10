import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import { projectConsoleDashboard } from './dashboardProjection'

type SnapshotRunLogRun = NonNullable<ConsoleGatewaySnapshot['runLog']>['runs'][number]

export type OperatorRunSource = 'runlog' | 'compatibility'

export interface OperatorRunToolCall {
  toolCallId: string
  name: string
  status: string
}

export interface OperatorRunCheckpoint {
  eventId: string
  seq: number
  kind?: string
}

export interface OperatorRunPolicyDecision {
  decisionId: string
  state: string
  surface: string
  targetKey: string
  toolCallId?: string
}

export interface OperatorRunError {
  eventId: string
  seq: number
  type: string
  message?: string
}

export interface OperatorRunRow {
  runId: string
  sessionId: string
  source: OperatorRunSource
  status: string
  active: boolean
  cancellable: boolean
  needsApproval: boolean
  clientId?: string
  clientName?: string
  workspaceId?: string
  workspaceName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerLabel?: string
  modelId?: string
  createdAt?: string
  lastActivityAt?: string
  eventCount: number
  artifactCount: number
  toolCalls: OperatorRunToolCall[]
  checkpoints: OperatorRunCheckpoint[]
  policyDecisions: OperatorRunPolicyDecision[]
  errors: OperatorRunError[]
}

export type OperatorApprovalSource = 'runlog' | 'compatibility'

export interface OperatorApprovalRow {
  approvalId: string
  runId: string
  sessionId: string
  source: OperatorApprovalSource
  status: string
  requestedAt: string
  resolvedAt?: string
  targetKey?: string
  clientName?: string
  agentName?: string
}

export interface OperatorUsageRow {
  id: string
  label: string
  entries: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  unpricedEntries: number
}

export interface OperatorBudgetRow {
  budgetId: string
  label: string
  scopeLabel: string
  status: 'ok' | 'warn' | 'blocked' | 'unmeasured'
  usedEstimatedCostUsd: number
  maxEstimatedCostUsd: number
  warnAtUsd: number
  unpricedUsageEntryCount: number
}

export interface OperatorRecentActivity {
  id: string
  kind: 'run' | 'approval' | 'usage' | 'audit'
  label: string
  detail: string
  timestamp: string
  runId?: string
}

export interface OperatorConsoleViewModel {
  generatedAt: string
  health: 'ready' | 'degraded' | 'offline'
  healthError?: string
  providerState: 'ready' | 'unavailable' | 'unverified' | 'missing'
  counts: {
    clients: number
    workspaces: number
    agents: number
    activeSessions: number
    activeRuns: number
    pendingApprovals: number
    artifacts: number
  }
  runs: OperatorRunRow[]
  activeRuns: OperatorRunRow[]
  approvals: OperatorApprovalRow[]
  pendingApprovals: OperatorApprovalRow[]
  usage: {
    entries: number
    pricedEntries: number
    unpricedEntries: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
    providers: OperatorUsageRow[]
    models: OperatorUsageRow[]
  }
  budgets: OperatorBudgetRow[]
  recentActivity: OperatorRecentActivity[]
}

const activeRunStatuses = new Set(['queued', 'running', 'waiting_approval', 'awaiting_approval'])

export function buildOperatorConsoleViewModel(
  snapshot: ConsoleGatewaySnapshot,
): OperatorConsoleViewModel {
  const projection = projectConsoleDashboard(snapshot)
  const workspaceById = new Map(snapshot.workspaces.map((workspace) => [workspace.workspaceId, workspace]))
  const clientById = new Map(snapshot.clients.map((client) => [client.clientId, client]))
  const agentById = new Map(snapshot.agents.map((agent) => [agent.agentId, agent]))
  const providerByProfileId = new Map(
    snapshot.providerProfiles.map((profile) => [profile.profileId, profile]),
  )
  const providerById = new Map(
    snapshot.providerProfiles.map((profile) => [profile.providerId, profile]),
  )
  const sessionById = new Map(snapshot.sessions.map((session) => [session.sessionId, session]))
  const runLogRuns = snapshot.runLog?.runs ?? []
  const runLogRunIds = new Set(runLogRuns.map((run) => run.runId))

  const runs = [
    ...runLogRuns.map((run) =>
      operatorRunLogRow({
        run,
        snapshot,
        workspaceById,
        clientById,
        agentById,
        providerById,
      }),
    ),
    ...snapshot.runs
      .filter((run) => !runLogRunIds.has(run.runId))
      .map((run) => {
        const session = sessionById.get(run.sessionId)
        const workspaceId = run.workspaceId ?? session?.workspaceId
        const workspace = workspaceId ? workspaceById.get(workspaceId) : undefined
        const clientId = workspace?.clientId ?? session?.clientId
        const client = clientId ? clientById.get(clientId) : undefined
        const agent = run.agentId ? agentById.get(run.agentId) : undefined
        const provider =
          (run.providerProfileId ? providerByProfileId.get(run.providerProfileId) : undefined)
          ?? (run.providerId ? providerById.get(run.providerId) : undefined)
        const toolCalls = (snapshot.toolCalls ?? [])
          .filter((toolCall) => toolCall.runId === run.runId)
          .map((toolCall) => ({
            toolCallId: toolCall.toolCallId,
            name: toolCall.toolName,
            status: toolCall.status,
          }))
        const active = activeRunStatuses.has(String(run.status))
        return {
          runId: run.runId,
          sessionId: run.sessionId,
          source: 'compatibility' as const,
          status: String(run.status),
          active,
          cancellable: active,
          needsApproval: run.status === 'waiting_approval'
            || snapshot.approvals.some(
              (approval) => approval.runId === run.runId && approval.status === 'pending',
            ),
          ...(client ? { clientId: client.clientId, clientName: client.name } : {}),
          ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
          ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
          ...(run.providerId ? { providerId: run.providerId } : {}),
          ...(provider ? { providerLabel: provider.label } : {}),
          ...(run.modelId ? { modelId: run.modelId } : {}),
          ...(run.createdAt ? { createdAt: run.createdAt } : {}),
          ...(run.lastEventAt ? { lastActivityAt: run.lastEventAt } : {}),
          eventCount: run.eventCount,
          artifactCount: snapshot.artifacts.filter((artifact) => artifact.runId === run.runId).length,
          toolCalls,
          checkpoints: [],
          policyDecisions: [],
          errors: [],
        }
      }),
  ].sort(sortRunsNewestFirst)

  const runById = new Map(runs.map((run) => [run.runId, run]))
  const runLogApprovalIds = new Set(
    runLogRuns.flatMap((run, runIndex) =>
      run.pendingApprovals.map(
        (approval, approvalIndex) =>
          approval.approvalId ?? `${run.runId}:approval:${approvalIndex + runIndex * 1_000}`,
      ),
    ),
  )

  const approvalsById = new Map<string, OperatorApprovalRow>()
  for (const approval of snapshot.approvals) {
    const run = runById.get(approval.runId)
    approvalsById.set(approval.approvalId, {
      approvalId: approval.approvalId,
      runId: approval.runId,
      sessionId: approval.sessionId,
      source: runLogApprovalIds.has(approval.approvalId) ? 'runlog' : 'compatibility',
      status: approval.status,
      requestedAt: approval.requestedAt,
      ...(approval.resolvedAt ? { resolvedAt: approval.resolvedAt } : {}),
      ...(approval.targetKey ? { targetKey: approval.targetKey } : {}),
      ...(run?.clientName ? { clientName: run.clientName } : {}),
      ...(run?.agentName ? { agentName: run.agentName } : {}),
    })
  }
  for (const approval of projection.pendingApprovals) {
    const run = runById.get(approval.runId)
    const source = runLogRuns.some((candidate) =>
      candidate.runId === approval.runId
      && candidate.pendingApprovals.some((pending) => pending.approvalId === approval.approvalId),
    ) ? 'runlog' : 'compatibility'
    approvalsById.set(approval.approvalId, {
      approvalId: approval.approvalId,
      runId: approval.runId,
      sessionId: approval.sessionId,
      source,
      status: 'pending',
      requestedAt: approval.requestedAt,
      ...(approval.targetKey ? { targetKey: approval.targetKey } : {}),
      ...(approval.clientName ?? run?.clientName
        ? { clientName: approval.clientName ?? run?.clientName }
        : {}),
      ...(approval.agentName ?? run?.agentName
        ? { agentName: approval.agentName ?? run?.agentName }
        : {}),
    })
  }
  const approvals = [...approvalsById.values()].sort(
    (left, right) => right.requestedAt.localeCompare(left.requestedAt),
  )

  const usage = buildUsageView(snapshot)
  const budgets = buildBudgetRows(snapshot)
  const activeRuns = runs.filter((run) => run.active)
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')

  return {
    generatedAt: projection.generatedAt,
    health: projection.health,
    ...(snapshot.health.lastError ? { healthError: snapshot.health.lastError } : {}),
    providerState: projection.providerState,
    counts: {
      clients: snapshot.clients.filter((client) => client.status !== 'archived').length,
      workspaces: snapshot.workspaces.filter((workspace) => workspace.status !== 'archived').length,
      agents: snapshot.agents.filter((agent) => agent.status !== 'archived').length,
      activeSessions: snapshot.health.activeSessions,
      activeRuns: activeRuns.length,
      pendingApprovals: pendingApprovals.length,
      artifacts: snapshot.artifacts.length,
    },
    runs,
    activeRuns,
    approvals,
    pendingApprovals,
    usage,
    budgets,
    recentActivity: buildRecentActivity(snapshot, runs, pendingApprovals),
  }
}

function operatorRunLogRow(input: {
  run: SnapshotRunLogRun
  snapshot: ConsoleGatewaySnapshot
  workspaceById: Map<string, ConsoleGatewaySnapshot['workspaces'][number]>
  clientById: Map<string, ConsoleGatewaySnapshot['clients'][number]>
  agentById: Map<string, ConsoleGatewaySnapshot['agents'][number]>
  providerById: Map<string, ConsoleGatewaySnapshot['providerProfiles'][number]>
}): OperatorRunRow {
  const { run, snapshot, workspaceById, clientById, agentById, providerById } = input
  const workspace = run.workspaceId ? workspaceById.get(run.workspaceId) : undefined
  const client = workspace?.clientId ? clientById.get(workspace.clientId) : undefined
  const agent = agentById.get(run.agentId)
  const provider = run.providerId ? providerById.get(run.providerId) : undefined
  const active = activeRunStatuses.has(String(run.status))
  return {
    runId: run.runId,
    sessionId: run.sessionId,
    source: 'runlog',
    status: String(run.status),
    active,
    cancellable: active,
    needsApproval: run.pendingApprovalCount > 0,
    ...(client ? { clientId: client.clientId, clientName: client.name } : {}),
    ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
    ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
    ...(run.providerId ? { providerId: run.providerId } : {}),
    ...(provider ? { providerLabel: provider.label } : {}),
    ...(run.modelId ? { modelId: run.modelId } : {}),
    createdAt: run.createdAt,
    lastActivityAt: run.updatedAt,
    eventCount: run.eventCount,
    artifactCount: snapshot.artifacts.filter((artifact) => artifact.runId === run.runId).length,
    toolCalls: run.toolCalls.map((toolCall, index) => ({
      toolCallId: toolCall.toolCallId ?? `${run.runId}:tool:${index}`,
      name: toolCall.name ?? 'tool.call',
      status: toolCall.status,
    })),
    checkpoints: run.checkpoints,
    policyDecisions: run.policyDecisions,
    errors: run.errors,
  }
}

function buildUsageView(snapshot: ConsoleGatewaySnapshot): OperatorConsoleViewModel['usage'] {
  const totalFromLedger = snapshot.usageLedger.reduce(
    (total, entry) => ({
      entries: total.entries + 1,
      pricedEntries: total.pricedEntries + (typeof entry.estimatedCostUsd === 'number' ? 1 : 0),
      unpricedEntries: total.unpricedEntries + (typeof entry.estimatedCostUsd === 'number' ? 0 : 1),
      inputTokens: total.inputTokens + (entry.inputTokens ?? 0),
      outputTokens: total.outputTokens + (entry.outputTokens ?? 0),
      totalTokens: total.totalTokens + (entry.totalTokens ?? entry.inputTokens ?? 0) + (
        entry.totalTokens === undefined ? entry.outputTokens ?? 0 : 0
      ),
      estimatedCostUsd: total.estimatedCostUsd + (entry.estimatedCostUsd ?? 0),
    }),
    {
      entries: 0,
      pricedEntries: 0,
      unpricedEntries: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
  )
  const gatewayTotal = snapshot.usageStatus?.total.summary
  const total = gatewayTotal
    ? {
        entries: gatewayTotal.entries,
        pricedEntries: gatewayTotal.pricedEntries,
        unpricedEntries: gatewayTotal.unpricedEntries,
        inputTokens: gatewayTotal.inputTokens,
        outputTokens: gatewayTotal.outputTokens,
        totalTokens: gatewayTotal.totalTokens,
        estimatedCostUsd: gatewayTotal.estimatedCostUsd,
      }
    : totalFromLedger

  return {
    ...total,
    providers: aggregateUsage(snapshot, 'providerId'),
    models: aggregateUsage(snapshot, 'modelId'),
  }
}

function aggregateUsage(
  snapshot: ConsoleGatewaySnapshot,
  field: 'providerId' | 'modelId',
): OperatorUsageRow[] {
  const groups = new Map<string, OperatorUsageRow>()
  for (const entry of snapshot.usageLedger) {
    const value = entry[field] ?? 'unassigned'
    const current = groups.get(value) ?? {
      id: value,
      label: value,
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
    groups.set(value, current)
  }
  return [...groups.values()].sort((left, right) =>
    right.estimatedCostUsd - left.estimatedCostUsd
    || right.totalTokens - left.totalTokens
    || left.label.localeCompare(right.label),
  )
}

function buildBudgetRows(snapshot: ConsoleGatewaySnapshot): OperatorBudgetRow[] {
  const evaluationById = new Map(
    (snapshot.budgetEvaluations ?? []).map((evaluation) => [evaluation.budgetId, evaluation]),
  )
  return (snapshot.budgets ?? [])
    .filter((budget) => budget.status === 'active')
    .map((budget) => {
      const evaluation = evaluationById.get(budget.budgetId)
      return {
        budgetId: budget.budgetId,
        label: budget.label,
        scopeLabel: evaluation?.scopeLabel ?? `${budget.scopeType}:${budget.scopeId}`,
        status: evaluation?.status ?? 'unmeasured',
        usedEstimatedCostUsd: evaluation?.usedEstimatedCostUsd ?? 0,
        maxEstimatedCostUsd: budget.maxEstimatedCostUsd,
        warnAtUsd: budget.warnAtUsd,
        unpricedUsageEntryCount: evaluation?.unpricedUsageEntryCount ?? 0,
      }
    })
}

function buildRecentActivity(
  snapshot: ConsoleGatewaySnapshot,
  runs: OperatorRunRow[],
  pendingApprovals: OperatorApprovalRow[],
): OperatorRecentActivity[] {
  const activity: OperatorRecentActivity[] = [
    ...runs.map((run) => ({
      id: `run:${run.runId}`,
      kind: 'run' as const,
      label: `${run.agentName ?? 'Agent run'} ${humanizeStatus(run.status)}`,
      detail: [run.clientName, run.providerLabel ?? run.providerId, run.modelId]
        .filter(Boolean)
        .join(' · ') || run.runId,
      timestamp: run.lastActivityAt ?? run.createdAt ?? '',
      runId: run.runId,
    })),
    ...pendingApprovals.map((approval) => ({
      id: `approval:${approval.approvalId}`,
      kind: 'approval' as const,
      label: 'Approval waiting',
      detail: [approval.clientName, approval.agentName, approval.targetKey]
        .filter(Boolean)
        .join(' · ') || approval.approvalId,
      timestamp: approval.requestedAt,
      runId: approval.runId,
    })),
    ...snapshot.usageLedger.map((entry) => ({
      id: `usage:${entry.entryId}`,
      kind: 'usage' as const,
      label: 'Usage recorded',
      detail: [entry.providerId, entry.modelId, `${entry.totalTokens ?? 0} tokens`]
        .filter(Boolean)
        .join(' · '),
      timestamp: entry.createdAt,
      runId: entry.runId,
    })),
    ...snapshot.auditEvents.map((event) => ({
      id: `audit:${event.eventId}`,
      kind: 'audit' as const,
      label: `${event.category} · ${event.action}`,
      detail: `${event.actor} · ${event.targetType}`,
      timestamp: event.createdAt,
      ...(event.runId ? { runId: event.runId } : {}),
    })),
  ]
  return activity
    .filter((item) => item.timestamp)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 12)
}

function sortRunsNewestFirst(left: OperatorRunRow, right: OperatorRunRow): number {
  return (right.lastActivityAt ?? right.createdAt ?? '').localeCompare(
    left.lastActivityAt ?? left.createdAt ?? '',
  )
}

export function humanizeStatus(status: string): string {
  return status.replaceAll('_', ' ')
}
