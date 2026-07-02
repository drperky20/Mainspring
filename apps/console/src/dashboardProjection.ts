import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  forbiddenConsoleSnapshotTokens,
  summarizeConsoleGatewaySnapshot,
} from './consoleDataSource'

type ConsoleDashboardClientStatus =
  | 'needs-agent'
  | 'provider-missing'
  | 'provider-unavailable'
  | 'provider-unverified'
  | 'ready'
  | 'running'
  | 'needs-approval'

export interface ConsoleDashboardProviderRow {
  profileId: string
  providerId: string
  label: string
  status: ConsoleGatewaySnapshot['providerProfiles'][number]['status']
  credentialState: ConsoleGatewaySnapshot['providerProfiles'][number]['credentialState']
  defaultModelId?: string
  ready: boolean
}

type ConsoleDashboardProviderState = 'ready' | 'unavailable' | 'unverified' | 'missing'

export interface ConsoleDashboardClientRow {
  clientId: string
  name: string
  status: ConsoleDashboardClientStatus
  providerReady: boolean
  workspaceCount: number
  agentCount: number
  activeRunCount: number
  pendingApprovalCount: number
  artifactCount: number
  usageEntryCount: number
  estimatedCostUsd: number
  primaryAgentName?: string
}

export interface ConsoleDashboardRunRow {
  runId: string
  sessionId: string
  status: ConsoleGatewaySnapshot['runs'][number]['status']
  needsApproval: boolean
  eventCount: number
  pendingInboundCount: number
  clientId?: string
  clientName?: string
  workspaceId?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerLabel?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  lastEventAt?: string
}

export interface ConsoleDashboardApprovalRow {
  approvalId: string
  runId: string
  sessionId: string
  requestedAt: string
  targetKey?: string
  clientId?: string
  clientName?: string
  agentId?: string
  agentName?: string
}

export interface ConsoleDashboardClientArtifactRow {
  artifactId: string
  runId: string
  sessionId: string
  workspaceId?: string
  workspaceName?: string
  agentId?: string
  agentName?: string
  kind: string
  label?: string
  mediaType?: string
  sizeBytes?: number
  createdAt: string
}

export interface ConsoleDashboardClientUsageRow {
  entryId: string
  runId: string
  sessionId: string
  workspaceId?: string
  workspaceName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerLabel?: string
  modelId?: string
  totalTokens?: number
  estimatedCostUsd?: number
  createdAt: string
}

export interface ConsoleDashboardClientAuditRow {
  eventId: string
  category: string
  action: string
  actor: string
  targetType: string
  targetId: string
  runId?: string
  sessionId?: string
  workspaceId?: string
  workspaceName?: string
  createdAt: string
}

export interface ConsoleDashboardClientMemoryRow {
  entryId: string
  workspaceId?: string
  workspaceName?: string
  sessionId?: string
  scope: 'workspace' | 'session'
  textPreview: string
  tags: string[]
  createdAt: string
}

export interface ConsoleDashboardClientApprovalRow {
  approvalId: string
  runId: string
  sessionId: string
  workspaceId?: string
  workspaceName?: string
  agentId?: string
  agentName?: string
  status: string
  requestedAt: string
  resolvedAt?: string
  targetKey?: string
}

export interface ConsoleDashboardClientSessionRow {
  sessionId: string
  workspaceId?: string
  workspaceName?: string
  status: string
  latestRunId?: string
  latestRunStatus?: string
  updatedAt: string
  createdAt: string
}

export interface ConsoleDashboardClientToolCallRow {
  toolCallId: string
  runId: string
  sessionId: string
  workspaceId?: string
  workspaceName?: string
  agentId?: string
  agentName?: string
  toolName: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface ConsoleDashboardClientDetail {
  clientId: string
  name: string
  workspaceCount: number
  agentCount: number
  artifactCount: number
  usageEntryCount: number
  memoryEntryCount: number
  toolCallCount: number
  deploymentTargetCount: number
  deploymentRunCount: number
  cellCount: number
  cellLeaseCount: number
  cellSnapshotCount: number
  estimatedCostUsd: number
  artifacts: ConsoleDashboardClientArtifactRow[]
  usageEntries: ConsoleDashboardClientUsageRow[]
  auditEvents: ConsoleDashboardClientAuditRow[]
  memoryEntries: ConsoleDashboardClientMemoryRow[]
  approvals: ConsoleDashboardClientApprovalRow[]
  sessions: ConsoleDashboardClientSessionRow[]
  toolCalls: ConsoleDashboardClientToolCallRow[]
}

export interface ConsoleDashboardProjection {
  generatedAt: string
  health: ReturnType<typeof summarizeConsoleGatewaySnapshot>['health']
  providerReady: boolean
  providerState: ConsoleDashboardProviderState
  counts: ReturnType<typeof summarizeConsoleGatewaySnapshot>
  artifactCount: number
  usageEntryCount: number
  estimatedCostUsd: number
  providers: ConsoleDashboardProviderRow[]
  clients: ConsoleDashboardClientRow[]
  clientDetails: ConsoleDashboardClientDetail[]
  activeRuns: ConsoleDashboardRunRow[]
  pendingApprovals: ConsoleDashboardApprovalRow[]
}

export function projectConsoleDashboard(
  snapshot: ConsoleGatewaySnapshot,
): ConsoleDashboardProjection {
  const counts = summarizeConsoleGatewaySnapshot(snapshot)
  const providers = snapshot.providerProfiles.map((profile) => ({
    profileId: profile.profileId,
    providerId: profile.providerId,
    label: profile.label,
    status: profile.status,
    credentialState: profile.credentialState,
    ...(profile.defaultModelId ? { defaultModelId: profile.defaultModelId } : {}),
    ready: isProviderReady(profile),
  }))
  const providerReady = providers.some((provider) => provider.ready)
  const providerState = summarizeProviderState(providers)

  const workspaceById = new Map(snapshot.workspaces.map((workspace) => [workspace.workspaceId, workspace]))
  const clientById = new Map(snapshot.clients.map((client) => [client.clientId, client]))
  const agentById = new Map(snapshot.agents.map((agent) => [agent.agentId, agent]))
  const providerByProfileId = new Map(providers.map((provider) => [provider.profileId, provider]))
  const providerById = new Map(
    providers
      .filter((provider) => provider.status === 'active')
      .map((provider) => [provider.providerId, provider]),
  )
  const pendingApprovalsByRunId = new Map<string, ConsoleGatewaySnapshot['approvals']>()

  for (const approval of snapshot.approvals) {
    if (approval.status !== 'pending') continue
    const existing = pendingApprovalsByRunId.get(approval.runId) ?? []
    pendingApprovalsByRunId.set(approval.runId, [...existing, approval])
  }

  const clients = snapshot.clients.map((client) =>
    projectClientRow({
      client,
      providerState,
      snapshot,
      pendingApprovalsByRunId,
    }),
  )
  const clientDetails = snapshot.clients.map((client) =>
    projectClientDetail({
      client,
      snapshot,
      providerByProfileId,
      providerById,
    }),
  )

  const activeRuns = snapshot.runs
    .filter(isActiveRun)
    .map((run) => {
      const workspace = run.workspaceId ? workspaceById.get(run.workspaceId) : undefined
      const client = workspace?.clientId ? clientById.get(workspace.clientId) : undefined
      const agent = run.agentId ? agentById.get(run.agentId) : undefined
      const provider =
        (run.providerProfileId ? providerByProfileId.get(run.providerProfileId) : undefined)
        ?? (run.providerId ? providerById.get(run.providerId) : undefined)
      return {
        runId: run.runId,
        sessionId: run.sessionId,
        status: run.status,
        needsApproval: (pendingApprovalsByRunId.get(run.runId)?.length ?? 0) > 0,
        eventCount: run.eventCount,
        pendingInboundCount: run.pendingInboundCount,
        ...(client ? { clientId: client.clientId, clientName: client.name } : {}),
        ...(run.workspaceId ? { workspaceId: run.workspaceId } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
        ...(run.providerId ? { providerId: run.providerId } : {}),
        ...(provider ? { providerLabel: provider.label } : {}),
        ...(run.modelId ? { modelId: run.modelId } : {}),
        ...(run.modelFamily ? { modelFamily: run.modelFamily } : {}),
        ...(run.providerTransport ? { providerTransport: run.providerTransport } : {}),
        ...(run.providerSessionId ? { providerSessionId: run.providerSessionId } : {}),
        ...(run.lastEventAt ? { lastEventAt: run.lastEventAt } : {}),
      }
    })
    .sort(sortByNewestActivity)

  const pendingApprovals = snapshot.approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => {
      const run = snapshot.runs.find((candidate) => candidate.runId === approval.runId)
      const workspace = run?.workspaceId ? workspaceById.get(run.workspaceId) : undefined
      const client = workspace?.clientId ? clientById.get(workspace.clientId) : undefined
      const agent = run?.agentId ? agentById.get(run.agentId) : undefined
      return {
        approvalId: approval.approvalId,
        runId: approval.runId,
        sessionId: approval.sessionId,
        requestedAt: approval.requestedAt,
        ...(approval.targetKey ? { targetKey: approval.targetKey } : {}),
        ...(client ? { clientId: client.clientId, clientName: client.name } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
      }
    })
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))

  return {
    generatedAt: snapshot.generatedAt,
    health: counts.health,
    providerReady,
    providerState,
    counts,
    artifactCount: snapshot.artifacts.length,
    usageEntryCount: snapshot.usageLedger.length,
    estimatedCostUsd: sumEstimatedCost(snapshot.usageLedger),
    providers,
    clients,
    clientDetails,
    activeRuns,
    pendingApprovals,
  }
}

export function findForbiddenDashboardProjectionTokens(
  projection: ConsoleDashboardProjection,
  forbiddenTokens: readonly string[] = forbiddenConsoleSnapshotTokens,
): string[] {
  const serialized = JSON.stringify(projection)
  return forbiddenTokens.filter((token) => serialized.includes(token))
}

function projectClientRow({
  client,
  providerState,
  snapshot,
  pendingApprovalsByRunId,
}: {
  client: ConsoleGatewaySnapshot['clients'][number]
  providerState: ConsoleDashboardProviderState
  snapshot: ConsoleGatewaySnapshot
  pendingApprovalsByRunId: Map<string, ConsoleGatewaySnapshot['approvals']>
}): ConsoleDashboardClientRow {
  const workspaces = snapshot.workspaces.filter((workspace) => workspace.clientId === client.clientId)
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId))
  const agents = snapshot.agents.filter(
    (agent) => agent.workspaceId && workspaceIds.has(agent.workspaceId),
  )
  const agentIds = new Set(agents.map((agent) => agent.agentId))
  const runs = snapshot.runs.filter(
    (run) =>
      (run.workspaceId && workspaceIds.has(run.workspaceId)) ||
      (run.agentId && agentIds.has(run.agentId)),
  )
  const activeRunCount = runs.filter(isActiveRun).length
  const pendingApprovalCount = runs.reduce(
    (count, run) => count + (pendingApprovalsByRunId.get(run.runId)?.length ?? 0),
    0,
  )
  const artifacts = snapshot.artifacts.filter(
    (artifact) =>
      (artifact.workspaceId && workspaceIds.has(artifact.workspaceId)) ||
      runs.some((run) => run.runId === artifact.runId),
  )
  const usageEntries = snapshot.usageLedger.filter(
    (entry) =>
      (entry.workspaceId && workspaceIds.has(entry.workspaceId)) ||
      runs.some((run) => run.runId === entry.runId),
  )

  return {
    clientId: client.clientId,
    name: client.name,
    status: clientStatus({
      agentCount: agents.length,
      providerState,
      activeRunCount,
      pendingApprovalCount,
    }),
    providerReady: providerState === 'ready',
    workspaceCount: workspaces.length,
    agentCount: agents.length,
    activeRunCount,
    pendingApprovalCount,
    artifactCount: artifacts.length,
    usageEntryCount: usageEntries.length,
    estimatedCostUsd: sumEstimatedCost(usageEntries),
    ...(agents[0]?.name ? { primaryAgentName: agents[0].name } : {}),
  }
}

function projectClientDetail({
  client,
  snapshot,
  providerByProfileId,
  providerById,
}: {
  client: ConsoleGatewaySnapshot['clients'][number]
  snapshot: ConsoleGatewaySnapshot
  providerByProfileId: Map<string, ConsoleDashboardProviderRow>
  providerById: Map<string, ConsoleDashboardProviderRow>
}): ConsoleDashboardClientDetail {
  const workspaces = snapshot.workspaces.filter((workspace) => workspace.clientId === client.clientId)
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId))
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace] as const))
  const agents = snapshot.agents.filter(
    (agent) => agent.workspaceId && workspaceIds.has(agent.workspaceId),
  )
  const agentById = new Map(agents.map((agent) => [agent.agentId, agent] as const))
  const agentIds = new Set(agents.map((agent) => agent.agentId))
  const runs = snapshot.runs.filter(
    (run) =>
      (run.workspaceId && workspaceIds.has(run.workspaceId)) ||
      (run.agentId && agentIds.has(run.agentId)),
  )
  const runById = new Map(runs.map((run) => [run.runId, run] as const))
  const sessions = snapshot.sessions
    .filter(
      (session) =>
        session.clientId === client.clientId
        || (session.workspaceId ? workspaceIds.has(session.workspaceId) : false),
    )
    .map((session) => {
      const workspace = session.workspaceId ? workspaceById.get(session.workspaceId) : undefined
      const latestRun = runs
        .filter((run) => run.sessionId === session.sessionId)
        .sort((left, right) => (right.lastEventAt ?? '').localeCompare(left.lastEventAt ?? ''))[0]
      return {
        sessionId: session.sessionId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        status: session.status,
        ...(latestRun ? { latestRunId: latestRun.runId, latestRunStatus: latestRun.status } : {}),
        updatedAt: session.updatedAt,
        createdAt: session.createdAt,
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const sessionIds = new Set(sessions.map((session) => session.sessionId))
  const artifacts = snapshot.artifacts
    .filter(
      (artifact) =>
        (artifact.workspaceId && workspaceIds.has(artifact.workspaceId)) ||
        runById.has(artifact.runId),
    )
    .map((artifact) => {
      const run = runById.get(artifact.runId)
      const workspace = artifact.workspaceId
        ? workspaceById.get(artifact.workspaceId)
        : run?.workspaceId
          ? workspaceById.get(run.workspaceId)
          : undefined
      const agent = run?.agentId ? agentById.get(run.agentId) : undefined
      return {
        artifactId: artifact.artifactId,
        runId: artifact.runId,
        sessionId: artifact.sessionId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
        kind: artifact.kind,
        ...(artifact.label ? { label: artifact.label } : {}),
        ...(artifact.mediaType ? { mediaType: artifact.mediaType } : {}),
        ...(typeof artifact.sizeBytes === 'number' ? { sizeBytes: artifact.sizeBytes } : {}),
        createdAt: artifact.createdAt,
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const usageEntries = snapshot.usageLedger
    .filter(
      (entry) =>
        (entry.workspaceId && workspaceIds.has(entry.workspaceId)) ||
        runById.has(entry.runId),
    )
    .map((entry) => {
      const run = runById.get(entry.runId)
      const workspace = entry.workspaceId
        ? workspaceById.get(entry.workspaceId)
        : run?.workspaceId
          ? workspaceById.get(run.workspaceId)
          : undefined
      const agent = run?.agentId ? agentById.get(run.agentId) : undefined
      const provider =
        (run?.providerProfileId ? providerByProfileId.get(run.providerProfileId) : undefined)
        ?? (entry.providerId ? providerById.get(entry.providerId) : undefined)
      return {
        entryId: entry.entryId,
        runId: entry.runId,
        sessionId: entry.sessionId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
        ...(entry.providerId ? { providerId: entry.providerId } : {}),
        ...(provider ? { providerLabel: provider.label } : {}),
        ...(entry.modelId ? { modelId: entry.modelId } : {}),
        ...(typeof entry.totalTokens === 'number' ? { totalTokens: entry.totalTokens } : {}),
        ...(typeof entry.estimatedCostUsd === 'number'
          ? { estimatedCostUsd: entry.estimatedCostUsd }
          : {}),
        createdAt: entry.createdAt,
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const auditEvents = snapshot.auditEvents
    .filter(
      (event) =>
        (event.targetType === 'client' && event.targetId === client.clientId)
        || (event.targetType === 'workspace' && workspaceIds.has(event.targetId))
        || (event.runId ? runById.has(event.runId) : false)
        || (event.sessionId ? sessionIds.has(event.sessionId) : false),
    )
    .map((event) => {
      const workspace =
        event.targetType === 'workspace'
          ? workspaceById.get(event.targetId)
          : undefined
      return {
        eventId: event.eventId,
        category: event.category,
        action: event.action,
        actor: event.actor,
        targetType: event.targetType,
        targetId: event.targetId,
        ...(event.runId ? { runId: event.runId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        createdAt: event.createdAt,
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const memoryEntries = snapshot.memoryEntries
    .filter(
      (entry) =>
        (entry.workspaceId && workspaceIds.has(entry.workspaceId))
        || (entry.sessionId ? sessionIds.has(entry.sessionId) : false),
    )
    .map((entry) => {
      const workspace = entry.workspaceId ? workspaceById.get(entry.workspaceId) : undefined
      return {
        entryId: entry.entryId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        scope: entry.scope,
        textPreview: entry.textPreview,
        tags: entry.tags,
        createdAt: entry.createdAt,
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const approvals = snapshot.approvalMetadata
    .filter(
      (approval) =>
        (approval.workspaceId && workspaceIds.has(approval.workspaceId))
        || (approval.sessionId ? sessionIds.has(approval.sessionId) : false)
        || runById.has(approval.runId),
    )
    .map((approval) => {
      const workspace = approval.workspaceId
        ? workspaceById.get(approval.workspaceId)
        : undefined
      const run = runById.get(approval.runId)
      const agent = approval.agentId
        ? agentById.get(approval.agentId)
        : run?.agentId
          ? agentById.get(run.agentId)
          : undefined
      return {
        approvalId: approval.approvalId,
        runId: approval.runId,
        sessionId: approval.sessionId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
        status: approval.status,
        requestedAt: approval.requestedAt,
        ...(approval.resolvedAt ? { resolvedAt: approval.resolvedAt } : {}),
        ...(approval.targetKey ? { targetKey: approval.targetKey } : {}),
      }
    })
    .sort((left, right) =>
      (right.resolvedAt ?? right.requestedAt).localeCompare(left.resolvedAt ?? left.requestedAt),
    )
  const toolCalls = (snapshot.toolCalls ?? [])
    .filter(
      (toolCall) =>
        (toolCall.workspaceId && workspaceIds.has(toolCall.workspaceId))
        || (toolCall.runId ? runById.has(toolCall.runId) : false)
        || (toolCall.sessionId ? sessionIds.has(toolCall.sessionId) : false),
    )
    .map((toolCall) => {
      const run = runById.get(toolCall.runId)
      const workspace = toolCall.workspaceId
        ? workspaceById.get(toolCall.workspaceId)
        : run?.workspaceId
          ? workspaceById.get(run.workspaceId)
          : undefined
      const agent = toolCall.agentId
        ? agentById.get(toolCall.agentId)
        : run?.agentId
          ? agentById.get(run.agentId)
          : undefined
      return {
        toolCallId: toolCall.toolCallId,
        runId: toolCall.runId,
        sessionId: toolCall.sessionId,
        ...(workspace ? { workspaceId: workspace.workspaceId, workspaceName: workspace.name } : {}),
        ...(agent ? { agentId: agent.agentId, agentName: agent.name } : {}),
        toolName: toolCall.toolName,
        status: toolCall.status,
        createdAt: toolCall.createdAt,
        updatedAt: toolCall.updatedAt,
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const deploymentTargets = (snapshot.deploymentTargets ?? []).filter(
    (target) => target.workspaceId && workspaceIds.has(target.workspaceId),
  )
  const deploymentTargetIds = new Set(deploymentTargets.map((target) => target.targetId))
  const deploymentRuns = (snapshot.deploymentRuns ?? []).filter(
    (deploymentRun) =>
      deploymentTargetIds.has(deploymentRun.targetId)
      || (deploymentRun.runId ? runById.has(deploymentRun.runId) : false)
      || (deploymentRun.sessionId ? sessionIds.has(deploymentRun.sessionId) : false),
  )
  const cells = (snapshot.cells ?? []).filter(
    (cell) => cell.workspaceId && workspaceIds.has(cell.workspaceId),
  )
  const cellIds = new Set(cells.map((cell) => cell.cellId))
  const cellLeases = (snapshot.cellLeases ?? []).filter(
    (lease) =>
      cellIds.has(lease.cellId)
      || (lease.runId ? runById.has(lease.runId) : false)
      || (lease.sessionId ? sessionIds.has(lease.sessionId) : false),
  )
  const cellLeaseIds = new Set(cellLeases.map((lease) => lease.leaseId))
  const cellSnapshots = (snapshot.cellSnapshots ?? []).filter(
    (cellSnapshot) =>
      cellIds.has(cellSnapshot.cellId)
      || (cellSnapshot.leaseId ? cellLeaseIds.has(cellSnapshot.leaseId) : false),
  )

  return {
    clientId: client.clientId,
    name: client.name,
    workspaceCount: workspaces.length,
    agentCount: agents.length,
    artifactCount: artifacts.length,
    usageEntryCount: usageEntries.length,
    memoryEntryCount: memoryEntries.length,
    toolCallCount: toolCalls.length,
    deploymentTargetCount: deploymentTargets.length,
    deploymentRunCount: deploymentRuns.length,
    cellCount: cells.length,
    cellLeaseCount: cellLeases.length,
    cellSnapshotCount: cellSnapshots.length,
    estimatedCostUsd: sumEstimatedCost(usageEntries),
    artifacts,
    usageEntries,
    auditEvents,
    memoryEntries,
    approvals,
    sessions,
    toolCalls,
  }
}

function isProviderReady(profile: ConsoleGatewaySnapshot['providerProfiles'][number]): boolean {
  return profile.status === 'active' && profile.credentialState === 'configured'
}

function summarizeProviderState(
  providers: ConsoleDashboardProviderRow[],
): ConsoleDashboardProviderState {
  if (providers.some((provider) => provider.ready)) return 'ready'
  if (
    providers.some(
      (provider) =>
        provider.status === 'active' && provider.credentialState === 'unavailable',
    )
  ) {
    return 'unavailable'
  }
  if (
    providers.some(
      (provider) =>
        provider.status === 'active' && provider.credentialState === 'unverified',
    )
  ) {
    return 'unverified'
  }
  return 'missing'
}

function isActiveRun(run: ConsoleGatewaySnapshot['runs'][number]): boolean {
  return run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval'
}

function clientStatus(input: {
  agentCount: number
  providerState: ConsoleDashboardProviderState
  activeRunCount: number
  pendingApprovalCount: number
}): ConsoleDashboardClientStatus {
  if (input.agentCount === 0) return 'needs-agent'
  if (input.providerState === 'missing') return 'provider-missing'
  if (input.providerState === 'unavailable') return 'provider-unavailable'
  if (input.providerState === 'unverified') return 'provider-unverified'
  if (input.pendingApprovalCount > 0) return 'needs-approval'
  if (input.activeRunCount > 0) return 'running'
  return 'ready'
}

function sortByNewestActivity(
  left: ConsoleDashboardRunRow,
  right: ConsoleDashboardRunRow,
): number {
  return (right.lastEventAt ?? '').localeCompare(left.lastEventAt ?? '')
}

function sumEstimatedCost(
  usageEntries: ReadonlyArray<ConsoleGatewaySnapshot['usageLedger'][number]>,
): number {
  return usageEntries.reduce(
    (total, entry) => total + (typeof entry.estimatedCostUsd === 'number' ? entry.estimatedCostUsd : 0),
    0,
  )
}
