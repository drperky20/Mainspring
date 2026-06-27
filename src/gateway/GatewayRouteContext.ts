import { redactRuntimeSensitiveText, sanitizeRuntimeResponse } from '#protocol'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayRunMetadataRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'
import type {
  LocalGatewayRunProjection,
  LocalGatewaySessionProjection,
  LocalGatewaySnapshot,
} from './LocalGateway.js'

export interface GatewayRouteContext {
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  providerId?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  workspaceName?: string
  agentName?: string
  channel: {
    kind: 'local'
    sessionStatus: LocalGatewaySessionProjection['status']
    routeKey: string
  }
  run: {
    runId?: string
    status?: LocalGatewayRunProjection['status']
    eventCount: number
    pendingInboundCount: number
  }
  metadata: Record<string, unknown>
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? redactRuntimeSensitiveText(cleaned) : undefined
}

function safeMetadata(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeRuntimeResponse(value)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {}
}

function selectLatestRun(
  runs: LocalGatewayRunProjection[],
  sessionId: string,
): LocalGatewayRunProjection | undefined {
  return runs
    .filter((run) => run.sessionId === sessionId)
    .sort((left, right) => (left.lastEventAt ?? left.createdAt ?? '').localeCompare(right.lastEventAt ?? right.createdAt ?? ''))
    .at(-1)
}

function findWorkspace(
  workspaces: LocalGatewayWorkspaceRecord[],
  workspaceId: string | undefined,
): LocalGatewayWorkspaceRecord | undefined {
  return workspaceId ? workspaces.find((workspace) => workspace.workspaceId === workspaceId) : undefined
}

function findAgent(
  agents: LocalGatewayAgentRecord[],
  agentId: string | undefined,
): LocalGatewayAgentRecord | undefined {
  return agentId ? agents.find((agent) => agent.agentId === agentId) : undefined
}

function findProviderProfile(
  profiles: LocalGatewayProviderProfileRecord[],
  providerProfileId: string | undefined,
): LocalGatewayProviderProfileRecord | undefined {
  return providerProfileId
    ? profiles.find((profile) => profile.profileId === providerProfileId)
    : undefined
}

function findRunMetadata(
  runs: LocalGatewayRunMetadataRecord[],
  runId: string | undefined,
): LocalGatewayRunMetadataRecord | undefined {
  return runId ? runs.find((run) => run.runId === runId) : undefined
}

export function gatewayRouteKey(input: {
  sessionId: string
  workspaceId?: string
  agentId?: string
}): string {
  return [input.workspaceId ?? 'workspace_local', input.agentId ?? 'agent_default', input.sessionId]
    .map((part) => part.replace(/[^A-Za-z0-9_.:-]+/g, '_'))
    .join(':')
}

export function buildGatewayRouteContext(input: {
  snapshot: LocalGatewaySnapshot
  sessionId: string
  runId?: string
}): GatewayRouteContext {
  const session = input.snapshot.sessions.find((candidate) => candidate.sessionId === input.sessionId)
  if (!session) throw new Error(`Unknown gateway session: ${input.sessionId}`)

  const run =
    (input.runId
      ? input.snapshot.runs.find((candidate) => candidate.runId === input.runId)
      : undefined) ?? selectLatestRun(input.snapshot.runs, input.sessionId)
  const metadata = findRunMetadata(input.snapshot.appState.runs, run?.runId)
  const workspaceId = run?.workspaceId ?? metadata?.workspaceId
  const agentId = run?.agentId ?? metadata?.agentId
  const providerProfileId = run?.providerProfileId ?? metadata?.providerProfileId
  const providerProfile = findProviderProfile(input.snapshot.appState.providerProfiles, providerProfileId)
  const workspace = findWorkspace(input.snapshot.appState.workspaces, workspaceId)
  const agent = findAgent(input.snapshot.appState.agents, agentId)
  const providerId = run?.providerId ?? metadata?.providerId ?? providerProfile?.providerId
  const modelId = run?.modelId ?? metadata?.modelId ?? providerProfile?.defaultModelId ?? agent?.defaultModelId
  const modelFamily = run?.modelFamily
  const providerTransport = run?.providerTransport
  const providerSessionId = run?.providerSessionId

  return {
    sessionId: session.sessionId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(providerProfileId ? { providerProfileId } : {}),
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelFamily ? { modelFamily } : {}),
    ...(providerTransport ? { providerTransport } : {}),
    ...(providerSessionId ? { providerSessionId } : {}),
    ...(cleanText(workspace?.name) ? { workspaceName: cleanText(workspace?.name) } : {}),
    ...(cleanText(agent?.name) ? { agentName: cleanText(agent?.name) } : {}),
    channel: {
      kind: 'local',
      sessionStatus: session.status,
      routeKey: gatewayRouteKey({ sessionId: session.sessionId, workspaceId, agentId }),
    },
    run: {
      ...(run?.runId ? { runId: run.runId } : {}),
      ...(run?.status ? { status: run.status } : {}),
      eventCount: run?.eventCount ?? 0,
      pendingInboundCount: run?.pendingInboundCount ?? 0,
    },
    metadata: {
      ...safeMetadata(session.metadata),
      ...safeMetadata(metadata?.metadata),
    },
  }
}
