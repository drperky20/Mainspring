import type { GatewayRunDispatch, MainspringRuntimeProfile } from '#protocol'
import type {
  MainspringApprovalRecord,
  MainspringSessionRecord,
  RunEvent,
  RunRecord,
  RuntimeHealth,
  StartRunInput,
} from '../contracts/runtime.js'
import { latestProviderInitWarningDetailFromRunEvents } from '../contracts/runtime.js'
import { MainspringMailbox, type InboundMessage } from '../mailbox/SqliteMailbox.js'
import type { Mainspring } from '../sdk/Mainspring.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayAppStateStore,
  LocalGatewayClientRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayRunMetadataRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface CreateLocalMainspringGatewayOptions {
  runtime: Mainspring
  appState?: LocalGatewayAppStateStore
}

export interface LocalGatewaySessionProjection {
  sessionId: string
  status: MainspringSessionRecord['status']
  workspaceRoot: string
  sessionPath: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayRunProjection {
  runId: string
  sessionId: string
  status: RunRecord['status']
  input?: string
  createdAt?: string
  lastEventAt?: string
  eventCount: number
  pendingInboundCount: number
  ownerId?: string
  workspaceId?: string
  agentId?: string
  computerId?: string
  providerId?: string
  providerProfileId?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  runtimeProfile?: MainspringRuntimeProfile
}

export type LocalGatewayStartRunInput = StartRunInput & {
  sessionId: string
}

export interface LocalGatewayEventListInput {
  sessionId: string
  runId?: string
  afterSeq?: number
  limit?: number
}

export interface LocalGatewayApprovalResponseInput {
  sessionId: string
  runId: string
  approvalId: string
  reason?: string
  response?: unknown
}

export type LocalGatewayAppStateRunInput = LocalGatewayStartRunInput & {
  providerProfileId?: string
}

export interface LocalGatewaySnapshot {
  generatedAt: string
  health: RuntimeHealth
  appState: {
    clients: LocalGatewayClientRecord[]
    workspaces: LocalGatewayWorkspaceRecord[]
    agents: LocalGatewayAgentRecord[]
    providerProfiles: LocalGatewayProviderProfileRecord[]
    runs: LocalGatewayRunMetadataRecord[]
  }
  sessions: LocalGatewaySessionProjection[]
  runs: LocalGatewayRunProjection[]
  approvals: MainspringApprovalRecord[]
}

function projectSession(session: MainspringSessionRecord): LocalGatewaySessionProjection {
  return {
    sessionId: session.sessionId,
    status: session.status,
    workspaceRoot: session.workspaceRoot,
    sessionPath: session.sessionPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.metadata ? { metadata: session.metadata } : {}),
  }
}

function gatewayRunStatusFromEvents(events: RunEvent[]): RunRecord['status'] {
  let status: RunRecord['status'] = 'queued'
  for (const event of events) {
    switch (event.type) {
      case 'run.started':
        status = 'running'
        break
      case 'approval.requested':
        status = 'waiting_approval'
        break
      case 'approval.approved':
      case 'approval.denied':
        if (status === 'waiting_approval') status = 'running'
        break
      case 'run.completed':
        status = 'completed'
        break
      case 'run.failed':
        status = 'failed'
        break
      case 'run.cancelled':
        status = 'cancelled'
        break
      default:
        break
    }
  }
  return status
}

function projectionFromDispatch(
  message: InboundMessage,
  dispatch: GatewayRunDispatch,
): LocalGatewayRunProjection {
  const options = dispatch.intent.runtimeOptions
  return {
    runId: dispatch.runId,
    sessionId: message.sessionId,
    status: 'queued',
    input: dispatch.intent.message,
    createdAt: message.timestamp,
    eventCount: 0,
    pendingInboundCount: 1,
    ownerId: dispatch.ownerId,
    workspaceId: dispatch.workspaceId,
    agentId: dispatch.agentId,
    computerId: dispatch.computerId,
    runtimeProfile: dispatch.runtimeProfile,
    ...(options?.providerId ? { providerId: options.providerId } : {}),
    ...(options?.modelId ? { modelId: options.modelId } : {}),
  }
}

function mergeRunProjection(
  existing: LocalGatewayRunProjection | undefined,
  incoming: LocalGatewayRunProjection,
): LocalGatewayRunProjection {
  return {
    ...existing,
    ...incoming,
    input: incoming.input ?? existing?.input,
    createdAt: existing?.createdAt ?? incoming.createdAt,
    eventCount: (existing?.eventCount ?? 0) + incoming.eventCount,
    pendingInboundCount: (existing?.pendingInboundCount ?? 0) + incoming.pendingInboundCount,
    ownerId: incoming.ownerId ?? existing?.ownerId,
    workspaceId: incoming.workspaceId ?? existing?.workspaceId,
    agentId: incoming.agentId ?? existing?.agentId,
    computerId: incoming.computerId ?? existing?.computerId,
    providerId: existing?.providerId ?? incoming.providerId,
    providerProfileId: incoming.providerProfileId ?? existing?.providerProfileId,
    modelId: existing?.modelId ?? incoming.modelId,
    modelFamily: existing?.modelFamily ?? incoming.modelFamily,
    providerTransport: existing?.providerTransport ?? incoming.providerTransport,
    providerSessionId: existing?.providerSessionId ?? incoming.providerSessionId,
    runtimeProfile: incoming.runtimeProfile ?? existing?.runtimeProfile,
  }
}

function providerInitProjectionFromEvents(
  events: RunEvent[],
): Pick<
  LocalGatewayRunProjection,
  'providerId' | 'modelId' | 'modelFamily' | 'providerTransport' | 'providerSessionId'
> {
  const detail = latestProviderInitWarningDetailFromRunEvents(events)
  if (!detail) return {}
  return {
    ...(detail.provider ? { providerId: detail.provider } : {}),
    ...(detail.modelId ? { modelId: detail.modelId } : {}),
    ...(detail.modelFamily ? { modelFamily: detail.modelFamily } : {}),
    ...(detail.providerTransport ? { providerTransport: detail.providerTransport } : {}),
    ...(detail.providerSessionId ? { providerSessionId: detail.providerSessionId } : {}),
  }
}

/**
 * In-process Local Gateway boundary over the SDK/runtime package.
 *
 * This is not a desktop shell, network server, secret store, or isolation
 * manager. It keeps command writes on the SDK command store so runs, cancels,
 * and approval responses still enter the per-session mailbox.
 */
export class LocalMainspringGateway {
  readonly appState?: LocalGatewayAppStateStore

  constructor(
    private readonly runtime: Mainspring,
    options: { appState?: LocalGatewayAppStateStore } = {},
  ) {
    this.appState = options.appState
  }

  readonly sessions = {
    list: (): LocalGatewaySessionProjection[] =>
      this.runtime.storage.stateStore.listSessions().map(projectSession),
    get: (sessionId: string): LocalGatewaySessionProjection | null => {
      const session = this.runtime.storage.stateStore.getSession(sessionId)
      return session ? projectSession(session) : null
    },
  }

  readonly runs = {
    list: (sessionId: string): LocalGatewayRunProjection[] => this.listRuns(sessionId),
    start: (input: LocalGatewayStartRunInput): RunRecord => {
      return this.startRun(input)
    },
    startFromAppState: (input: LocalGatewayAppStateRunInput): RunRecord => {
      return this.startRun(this.resolveAppStateRunInput(input), {
        providerProfileId: input.providerProfileId,
      })
    },
    cancel: (sessionId: string, runId: string, reason?: string): void => {
      this.runtime.storage.commandStore.cancelRun(sessionId, runId, reason)
    },
  }

  readonly events = {
    list: (input: LocalGatewayEventListInput): RunEvent[] =>
      this.runtime.storage.eventStore.listRunEvents(input),
  }

  readonly approvals = {
    list: (): MainspringApprovalRecord[] => this.runtime.approvals.list(),
    approve: (input: LocalGatewayApprovalResponseInput): void => {
      this.runtime.approvals.approve(input)
    },
    deny: (input: LocalGatewayApprovalResponseInput): void => {
      this.runtime.approvals.deny(input)
    },
  }

  snapshot(): LocalGatewaySnapshot {
    const sessions = this.sessions.list()
    return {
      generatedAt: new Date().toISOString(),
      health: this.runtime.health(),
      appState: {
        clients: this.appState?.clients.list() ?? [],
        workspaces: this.appState?.workspaces.list() ?? [],
        agents: this.appState?.agents.list() ?? [],
        providerProfiles: this.appState?.providerProfiles.list() ?? [],
        runs: this.appState?.runs.list() ?? [],
      },
      sessions,
      runs: sessions.flatMap((session) => this.runs.list(session.sessionId)),
      approvals: this.approvals.list(),
    }
  }

  private listRuns(sessionId: string): LocalGatewayRunProjection[] {
    const session = this.runtime.storage.stateStore.getSession(sessionId)
    if (!session) return []

    const byRunId = new Map<string, LocalGatewayRunProjection>()

    for (const metadata of this.appState?.runs.list({ sessionId }) ?? []) {
      byRunId.set(
        metadata.runId,
        mergeRunProjection(byRunId.get(metadata.runId), {
          runId: metadata.runId,
          sessionId: metadata.sessionId,
          status: 'queued',
          createdAt: metadata.createdAt,
          eventCount: 0,
          pendingInboundCount: 0,
          ...(metadata.workspaceId ? { workspaceId: metadata.workspaceId } : {}),
          ...(metadata.agentId ? { agentId: metadata.agentId } : {}),
          ...(metadata.providerProfileId ? { providerProfileId: metadata.providerProfileId } : {}),
          ...(metadata.providerId ? { providerId: metadata.providerId } : {}),
          ...(metadata.modelId ? { modelId: metadata.modelId } : {}),
          ...(metadata.runtimeProfile
            ? { runtimeProfile: metadata.runtimeProfile as MainspringRuntimeProfile }
            : {}),
        }),
      )
    }

    for (const pending of this.pendingRunProjections(session)) {
      byRunId.set(pending.runId, mergeRunProjection(byRunId.get(pending.runId), pending))
    }

    const events = this.runtime.storage.eventStore.listSessionEvents({
      sessionId,
      limit: 500,
    })
    const eventsByRunId = new Map<string, RunEvent[]>()
    for (const event of events) {
      const existing = eventsByRunId.get(event.runId) ?? []
      existing.push(event)
      eventsByRunId.set(event.runId, existing)
    }

    for (const [runId, runEvents] of eventsByRunId) {
      const firstEvent = runEvents[0]
      const lastEvent = runEvents[runEvents.length - 1]
      const incoming: LocalGatewayRunProjection = {
        runId,
        sessionId,
        status: gatewayRunStatusFromEvents(runEvents),
        createdAt: firstEvent?.timestamp,
        lastEventAt: lastEvent?.timestamp,
        eventCount: runEvents.length,
        pendingInboundCount: 0,
        ...providerInitProjectionFromEvents(runEvents),
      }
      byRunId.set(runId, mergeRunProjection(byRunId.get(runId), incoming))
    }

    return [...byRunId.values()].sort((left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? ''),
    )
  }

  private pendingRunProjections(session: MainspringSessionRecord): LocalGatewayRunProjection[] {
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    const projections: LocalGatewayRunProjection[] = []
    for (const message of mailbox.readPending(500)) {
      if (message.kind !== 'chat' || !message.dispatch.success) continue
      projections.push(projectionFromDispatch(message, message.dispatch.data))
    }
    return projections
  }

  private startRun(
    input: LocalGatewayStartRunInput,
    metadata: { providerProfileId?: string } = {},
  ): RunRecord {
    const { sessionId, ...runInput } = input
    const session = this.runtime.storage.stateStore.getSession(sessionId)
    if (!session) throw new Error(`Unknown session: ${sessionId}`)
    const run = this.runtime.storage.commandStore.enqueueRun(session, runInput)
    this.persistRunMetadata(run, input, metadata)
    return run
  }

  private persistRunMetadata(
    run: RunRecord,
    input: LocalGatewayStartRunInput,
    metadata: { providerProfileId?: string },
  ): void {
    this.appState?.runs.upsert({
      runId: run.runId,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(metadata.providerProfileId ? { providerProfileId: metadata.providerProfileId } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
    })
  }

  private requireAppState(): LocalGatewayAppStateStore {
    if (!this.appState) {
      throw new Error('Local gateway app state is not configured.')
    }
    return this.appState
  }

  private resolveAppStateRunInput(input: LocalGatewayAppStateRunInput): LocalGatewayStartRunInput {
    const appState = this.requireAppState()
    const workspace = this.resolveGatewayWorkspace(appState, input.workspaceId)
    const agent = this.resolveGatewayAgent(appState, input.agentId)
    const providerProfile = this.resolveGatewayProviderProfile(appState, input.providerProfileId)

    if (
      workspace &&
      agent?.workspaceId &&
      workspace.workspaceId !== agent.workspaceId
    ) {
      throw new Error(
        `Agent ${agent.agentId} belongs to workspace ${agent.workspaceId}, not ${workspace.workspaceId}.`,
      )
    }

    if (agent?.workspaceId && !workspace && !appState.workspaces.get(agent.workspaceId)) {
      throw new Error(`Agent ${agent.agentId} references unknown workspace ${agent.workspaceId}.`)
    }

    if (
      providerProfile &&
      input.providerId &&
      providerProfile.providerId !== input.providerId
    ) {
      throw new Error(
        `Provider profile ${providerProfile.profileId} belongs to provider ${providerProfile.providerId}, not ${input.providerId}.`,
      )
    }

    const { providerProfileId: _providerProfileId, ...runInput } = input
    const workspaceId = workspace?.workspaceId ?? agent?.workspaceId ?? runInput.workspaceId
    const agentId = agent?.agentId ?? runInput.agentId
    const providerId = runInput.providerId ?? providerProfile?.providerId
    const modelId =
      runInput.modelId ?? providerProfile?.defaultModelId ?? agent?.defaultModelId

    return {
      ...runInput,
      ...(workspaceId ? { workspaceId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
    }
  }

  private resolveGatewayWorkspace(
    appState: LocalGatewayAppStateStore,
    workspaceId: string | undefined,
  ): LocalGatewayWorkspaceRecord | null {
    if (!workspaceId) return null
    const workspace = appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    return workspace
  }

  private resolveGatewayAgent(
    appState: LocalGatewayAppStateStore,
    agentId: string | undefined,
  ): LocalGatewayAgentRecord | null {
    if (!agentId) return null
    const agent = appState.agents.get(agentId)
    if (!agent) throw new Error(`Unknown gateway agent: ${agentId}`)
    return agent
  }

  private resolveGatewayProviderProfile(
    appState: LocalGatewayAppStateStore,
    providerProfileId: string | undefined,
  ): LocalGatewayProviderProfileRecord | null {
    if (!providerProfileId) return null
    const providerProfile = appState.providerProfiles.get(providerProfileId)
    if (!providerProfile) {
      throw new Error(`Unknown gateway provider profile: ${providerProfileId}`)
    }
    return providerProfile
  }
}

export function createLocalMainspringGateway(
  options: CreateLocalMainspringGatewayOptions,
): LocalMainspringGateway {
  return new LocalMainspringGateway(options.runtime, { appState: options.appState })
}
