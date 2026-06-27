import type { RuntimeHealth } from '../contracts/runtime.js'
import type {
  LocalGatewaySnapshot,
  LocalGatewayRunProjection,
  LocalGatewaySessionProjection,
} from './LocalGateway.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayClientRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface ConsoleGatewayClient {
  clientId: string
  name: string
  status: LocalGatewayClientRecord['status']
}

export interface ConsoleGatewayWorkspace {
  workspaceId: string
  clientId?: string
  name: string
  status: LocalGatewayWorkspaceRecord['status']
}

export interface ConsoleGatewayAgent {
  agentId: string
  workspaceId?: string
  name: string
  version: string
  defaultModelId?: string
  status: LocalGatewayAgentRecord['status']
}

export interface ConsoleGatewayProviderProfile {
  profileId: string
  providerId: string
  label: string
  status: LocalGatewayProviderProfileRecord['status']
  defaultModelId?: string
  credentialState: 'configured' | 'missing' | 'unverified'
}

export interface ConsoleGatewaySession {
  sessionId: string
  status: LocalGatewaySessionProjection['status']
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayRun {
  runId: string
  sessionId: string
  status: LocalGatewayRunProjection['status']
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  providerId?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  createdAt?: string
  lastEventAt?: string
  eventCount: number
  pendingInboundCount: number
}

export interface ConsoleGatewayApproval {
  approvalId: string
  runId: string
  sessionId: string
  status: string
  requestedAt: string
  resolvedAt?: string
  targetKey?: string
}

export interface ConsoleGatewaySnapshot {
  generatedAt: string
  health: Pick<RuntimeHealth, 'ok' | 'running' | 'activeSessions'> & {
    lastError?: string
  }
  counts: {
    clients: number
    workspaces: number
    agents: number
    providerProfiles: number
    sessions: number
    runs: number
    pendingApprovals: number
  }
  clients: ConsoleGatewayClient[]
  workspaces: ConsoleGatewayWorkspace[]
  agents: ConsoleGatewayAgent[]
  providerProfiles: ConsoleGatewayProviderProfile[]
  sessions: ConsoleGatewaySession[]
  runs: ConsoleGatewayRun[]
  approvals: ConsoleGatewayApproval[]
}

export function gatewaySnapshotToConsoleState(
  snapshot: LocalGatewaySnapshot,
): ConsoleGatewaySnapshot {
  const clients = snapshot.appState.clients.map(consoleClient)
  const workspaces = snapshot.appState.workspaces.map(consoleWorkspace)
  const agents = snapshot.appState.agents.map(consoleAgent)
  const providerProfiles = snapshot.appState.providerProfiles.map(consoleProviderProfile)
  const sessions = snapshot.sessions.map(consoleSession)
  const runs = snapshot.runs.map(consoleRun)
  const approvals = snapshot.approvals.map(consoleApproval)

  return {
    generatedAt: snapshot.generatedAt,
    health: {
      ok: snapshot.health.ok,
      running: snapshot.health.running,
      activeSessions: snapshot.health.activeSessions,
      ...(snapshot.health.lastError ? { lastError: snapshot.health.lastError } : {}),
    },
    counts: {
      clients: clients.length,
      workspaces: workspaces.length,
      agents: agents.length,
      providerProfiles: providerProfiles.length,
      sessions: sessions.length,
      runs: runs.length,
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
    },
    clients,
    workspaces,
    agents,
    providerProfiles,
    sessions,
    runs,
    approvals,
  }
}

function consoleClient(record: LocalGatewayClientRecord): ConsoleGatewayClient {
  return {
    clientId: record.clientId,
    name: record.name,
    status: record.status,
  }
}

function consoleWorkspace(record: LocalGatewayWorkspaceRecord): ConsoleGatewayWorkspace {
  return {
    workspaceId: record.workspaceId,
    ...(record.clientId ? { clientId: record.clientId } : {}),
    name: record.name,
    status: record.status,
  }
}

function consoleAgent(record: LocalGatewayAgentRecord): ConsoleGatewayAgent {
  return {
    agentId: record.agentId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    name: record.name,
    version: record.version,
    ...(record.defaultModelId ? { defaultModelId: record.defaultModelId } : {}),
    status: record.status,
  }
}

function consoleProviderProfile(
  record: LocalGatewayProviderProfileRecord,
): ConsoleGatewayProviderProfile {
  return {
    profileId: record.profileId,
    providerId: record.providerId,
    label: record.label,
    status: record.status,
    ...(record.defaultModelId ? { defaultModelId: record.defaultModelId } : {}),
    credentialState: resolveCredentialState(record.secretRef),
  }
}

function resolveCredentialState(
  secretRef: string,
): ConsoleGatewayProviderProfile['credentialState'] {
  const trimmed = secretRef.trim()
  if (!trimmed) return 'missing'
  if (trimmed.startsWith('env:')) {
    const envKey = trimmed.slice(4).trim()
    if (!envKey) return 'missing'
    return process.env[envKey]?.trim() ? 'configured' : 'missing'
  }
  return 'unverified'
}

function consoleSession(record: LocalGatewaySessionProjection): ConsoleGatewaySession {
  return {
    sessionId: record.sessionId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function consoleRun(record: LocalGatewayRunProjection): ConsoleGatewayRun {
  return {
    runId: record.runId,
    sessionId: record.sessionId,
    status: record.status,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.providerProfileId ? { providerProfileId: record.providerProfileId } : {}),
    ...(record.providerId ? { providerId: record.providerId } : {}),
    ...(record.modelId ? { modelId: record.modelId } : {}),
    ...(record.modelFamily ? { modelFamily: record.modelFamily } : {}),
    ...(record.providerTransport ? { providerTransport: record.providerTransport } : {}),
    ...(record.providerSessionId ? { providerSessionId: record.providerSessionId } : {}),
    ...(record.createdAt ? { createdAt: record.createdAt } : {}),
    ...(record.lastEventAt ? { lastEventAt: record.lastEventAt } : {}),
    eventCount: record.eventCount,
    pendingInboundCount: record.pendingInboundCount,
  }
}

function consoleApproval(
  record: LocalGatewaySnapshot['approvals'][number],
): ConsoleGatewayApproval {
  return {
    approvalId: record.approvalId,
    runId: record.runId,
    sessionId: record.sessionId,
    status: record.status,
    requestedAt: record.requestedAt,
    ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
    ...(record.targetKey ? { targetKey: record.targetKey } : {}),
  }
}
