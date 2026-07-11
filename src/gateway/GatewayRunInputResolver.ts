import type { MainspringRuntimeProfile } from '#protocol'
import type { MainspringSessionRecord } from '../contracts/runtime.js'
import type {
  LocalGatewayAppStateRunInput,
  LocalGatewayStartRunInput,
} from './LocalGateway.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayAppStateStore,
  LocalGatewayProviderProfileRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface GatewayRunInputResolverOptions {
  appState: LocalGatewayAppStateStore
  getSession: (sessionId: string) => MainspringSessionRecord | null
  assertRuntimeProfile: (profileId: string | undefined) => MainspringRuntimeProfile | undefined
}

/**
 * Resolves browser-safe app-state identifiers into a runnable host input.
 *
 * Run ingress and headless cron share this boundary so workspace/client,
 * agent, provider-profile, session, and runtime-profile checks cannot drift
 * between the compatibility and canonical RunLog paths.
 */
export class GatewayRunInputResolver {
  constructor(private readonly options: GatewayRunInputResolverOptions) {}

  resolve(input: LocalGatewayAppStateRunInput): LocalGatewayStartRunInput {
    const session = this.options.getSession(input.sessionId)
    if (!session) throw new Error(`Unknown session: ${input.sessionId}`)

    const sessionMetadata = recordValue(session.metadata) ?? {}
    const sessionWorkspaceId = textValue(sessionMetadata.workspaceId)
    const sessionWorkspace = this.resolveWorkspace(sessionWorkspaceId)
    const workspace = this.resolveWorkspace(input.workspaceId)
    const agent = this.resolveAgent(input.agentId)
    const providerProfile = this.resolveProviderProfile(input.providerProfileId)

    this.assertWorkspaceRunnable(sessionWorkspace)
    this.assertWorkspaceRunnable(workspace)
    this.assertAgentRunnable(agent)
    this.assertProviderProfileRunnable(providerProfile)

    if (workspace && agent?.workspaceId && workspace.workspaceId !== agent.workspaceId) {
      throw new Error(
        `Agent ${agent.agentId} belongs to workspace ${agent.workspaceId}, not ${workspace.workspaceId}.`,
      )
    }

    if (sessionWorkspace && workspace && sessionWorkspace.workspaceId !== workspace.workspaceId) {
      throw new Error(
        `Session ${session.sessionId} belongs to workspace ${sessionWorkspace.workspaceId}, not ${workspace.workspaceId}.`,
      )
    }

    if (sessionWorkspace && agent?.workspaceId && sessionWorkspace.workspaceId !== agent.workspaceId) {
      throw new Error(
        `Session ${session.sessionId} belongs to workspace ${sessionWorkspace.workspaceId}, not agent ${agent.agentId}'s workspace ${agent.workspaceId}.`,
      )
    }

    if (agent?.workspaceId && !workspace && !this.options.appState.workspaces.get(agent.workspaceId)) {
      throw new Error(`Agent ${agent.agentId} references unknown workspace ${agent.workspaceId}.`)
    }

    if (providerProfile && input.providerId && providerProfile.providerId !== input.providerId) {
      throw new Error(
        `Provider profile ${providerProfile.profileId} belongs to provider ${providerProfile.providerId}, not ${input.providerId}.`,
      )
    }

    const { providerProfileId: _providerProfileId, ...runInput } = input
    const workspaceId =
      workspace?.workspaceId ?? sessionWorkspace?.workspaceId ?? agent?.workspaceId ?? runInput.workspaceId
    const agentId = agent?.agentId ?? runInput.agentId
    const providerId = runInput.providerId ?? providerProfile?.providerId
    const modelId = runInput.modelId ?? providerProfile?.defaultModelId ?? agent?.defaultModelId

    return {
      ...runInput,
      ...(workspaceId ? { workspaceId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(providerId ? { providerId } : {}),
      ...(providerProfile?.secretRef ? { credentialRef: providerProfile.secretRef } : {}),
      ...(modelId ? { modelId } : {}),
    }
  }

  resolveWorkspace(workspaceId: string | undefined): LocalGatewayWorkspaceRecord | null {
    if (!workspaceId) return null
    const workspace = this.options.appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    return workspace
  }

  resolveAgent(agentId: string | undefined): LocalGatewayAgentRecord | null {
    if (!agentId) return null
    const agent = this.options.appState.agents.get(agentId)
    if (!agent) throw new Error(`Unknown gateway agent: ${agentId}`)
    return agent
  }

  resolveProviderProfile(profileId: string | undefined): LocalGatewayProviderProfileRecord | null {
    if (!profileId) return null
    const providerProfile = this.options.appState.providerProfiles.get(profileId)
    if (!providerProfile) throw new Error(`Unknown gateway provider profile: ${profileId}`)
    return providerProfile
  }

  private assertWorkspaceRunnable(workspace: LocalGatewayWorkspaceRecord | null): void {
    if (!workspace) return
    if (workspace.status !== 'active') {
      throw new Error(`Gateway workspace ${workspace.workspaceId} is archived and cannot run agents.`)
    }
    if (!workspace.clientId) return
    const client = this.options.appState.clients.get(workspace.clientId)
    if (!client) {
      throw new Error(
        `Gateway workspace ${workspace.workspaceId} references unknown client ${workspace.clientId}.`,
      )
    }
    if (client.status !== 'active') {
      throw new Error(
        `Gateway workspace ${workspace.workspaceId} belongs to archived client ${client.clientId}.`,
      )
    }
  }

  private assertAgentRunnable(agent: LocalGatewayAgentRecord | null): void {
    if (agent?.status === 'archived') {
      throw new Error(`Gateway agent ${agent.agentId} is archived and cannot run.`)
    }
  }

  private assertProviderProfileRunnable(
    providerProfile: LocalGatewayProviderProfileRecord | null,
  ): void {
    if (providerProfile?.status === 'archived') {
      throw new Error(`Gateway provider profile ${providerProfile.profileId} is archived and cannot run.`)
    }
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
