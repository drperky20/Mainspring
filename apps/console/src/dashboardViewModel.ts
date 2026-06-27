import type { ConsoleDashboardProjection } from './dashboardProjection'
import { forbiddenConsoleSnapshotTokens } from './consoleDataSource'

export interface PrototypeDashboardClient {
  id: string
  name: string
}

export interface PrototypeDashboardAgent {
  id: string
  clientId: string
  name: string
}

export interface PrototypeDashboardProvider {
  provider: string
  status: 'Not connected' | 'Saved locally'
}

export interface PrototypeDashboardState {
  clients: PrototypeDashboardClient[]
  agents: PrototypeDashboardAgent[]
  providers: PrototypeDashboardProvider[]
}

export interface DashboardClientViewModel {
  id: string
  name: string
  subtitle: string
  activeRunSummary?: string
  statusLabel: string
  providerReady: boolean
  activeRunCount: number
  pendingApprovalCount: number
}

export interface DashboardViewModel {
  source: 'prototype-localStorage' | 'gateway-projection'
  providerReady: boolean
  providerState: 'ready' | 'unverified' | 'missing'
  clients: DashboardClientViewModel[]
  statusStrip: string[]
  activeRunCount: number
  pendingApprovalCount: number
}

export function prototypeStateToDashboardViewModel(
  state: PrototypeDashboardState,
): DashboardViewModel {
  const providerReady = state.providers.some(
    (provider) =>
      provider.status === 'Saved locally' &&
      (provider.provider === 'OpenRouter' || provider.provider === 'OpenAI'),
  )
  const clients = state.clients.map((client) => {
    const agent = state.agents.find((candidate) => candidate.clientId === client.id)
    return {
      id: client.id,
      name: client.name,
      subtitle: agent?.name ?? 'No agent attached yet',
      statusLabel: providerReady ? 'Ready' : 'Provider missing',
      providerReady,
      activeRunCount: 0,
      pendingApprovalCount: 0,
    }
  })
  const activeAgent = state.clients[0]
    ? state.agents.find((agent) => agent.clientId === state.clients[0]?.id)
    : undefined

  return {
    source: 'prototype-localStorage',
    providerReady,
    providerState: providerReady ? 'ready' : 'missing',
    clients,
    statusStrip: [
      'Local account. Password required on launch.',
      providerReady ? 'Provider ready' : 'Provider missing',
      activeAgent ? 'Agent draft saved' : 'No models saved',
      'Workspace ready',
    ],
    activeRunCount: 0,
    pendingApprovalCount: 0,
  }
}

export function gatewayProjectionToDashboardViewModel(
  projection: ConsoleDashboardProjection,
): DashboardViewModel {
  return {
    source: 'gateway-projection',
    providerReady: projection.providerReady,
    providerState: projection.providerState,
    clients: projection.clients.map((client) => {
      const activeRun = projection.activeRuns.find((run) => run.clientId === client.clientId)
      const runSummary = activeRunSummary(activeRun)
      return {
        id: client.clientId,
        name: client.name,
        subtitle: client.primaryAgentName ?? 'No agent attached yet',
        ...(runSummary ? { activeRunSummary: runSummary } : {}),
        statusLabel: gatewayClientStatusLabel(client.status, activeRun?.providerLabel),
        providerReady: client.providerReady,
        activeRunCount: client.activeRunCount,
        pendingApprovalCount: client.pendingApprovalCount,
      }
    }),
    statusStrip: [
      `${projection.counts.clientCount} ${pluralize('client', projection.counts.clientCount)}`,
      gatewayProviderStateLabel(projection.providerState),
      `${projection.counts.activeRunCount} active ${pluralize(
        'run',
        projection.counts.activeRunCount,
      )}`,
      `${projection.counts.pendingApprovalCount} pending ${pluralize(
        'approval',
        projection.counts.pendingApprovalCount,
      )}`,
    ],
    activeRunCount: projection.counts.activeRunCount,
    pendingApprovalCount: projection.counts.pendingApprovalCount,
  }
}

export function findForbiddenDashboardViewModelTokens(
  viewModel: DashboardViewModel,
  forbiddenTokens: readonly string[] = forbiddenConsoleSnapshotTokens,
): string[] {
  const serialized = JSON.stringify(viewModel)
  return forbiddenTokens.filter((token) => serialized.includes(token))
}

function gatewayClientStatusLabel(
  status: ConsoleDashboardProjection['clients'][number]['status'],
  providerLabel?: string,
): string {
  if (status === 'needs-agent') return 'No agent attached yet'
  if (status === 'provider-missing') return 'Provider missing'
  if (status === 'provider-unverified') return 'Provider unverified'
  if (status === 'needs-approval') {
    return providerLabel ? `Approval needed - ${providerLabel}` : 'Approval needed'
  }
  if (status === 'running') return providerLabel ? `Running - ${providerLabel}` : 'Running'
  return 'Ready'
}

function gatewayProviderStateLabel(
  state: ConsoleDashboardProjection['providerState'],
): string {
  if (state === 'ready') return 'Provider ready'
  if (state === 'unverified') return 'Provider unverified'
  return 'Provider missing'
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`
}

function activeRunSummary(
  run: ConsoleDashboardProjection['activeRuns'][number] | undefined,
): string | undefined {
  if (!run) return undefined
  const parts = [
    run.providerLabel ?? run.providerId,
    run.modelId ?? run.modelFamily,
    run.providerTransport,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return parts.length > 0 ? parts.join(' | ') : undefined
}
