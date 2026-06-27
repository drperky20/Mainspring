import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  forbiddenConsoleSnapshotTokens,
  summarizeConsoleGatewaySnapshot,
} from './consoleDataSource'

type ConsoleDashboardClientStatus =
  | 'needs-agent'
  | 'provider-missing'
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

type ConsoleDashboardProviderState = 'ready' | 'unverified' | 'missing'

export interface ConsoleDashboardClientRow {
  clientId: string
  name: string
  status: ConsoleDashboardClientStatus
  providerReady: boolean
  workspaceCount: number
  agentCount: number
  activeRunCount: number
  pendingApprovalCount: number
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

export interface ConsoleDashboardProjection {
  generatedAt: string
  health: ReturnType<typeof summarizeConsoleGatewaySnapshot>['health']
  providerReady: boolean
  providerState: ConsoleDashboardProviderState
  counts: ReturnType<typeof summarizeConsoleGatewaySnapshot>
  providers: ConsoleDashboardProviderRow[]
  clients: ConsoleDashboardClientRow[]
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
    providers,
    clients,
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
    ...(agents[0]?.name ? { primaryAgentName: agents[0].name } : {}),
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
