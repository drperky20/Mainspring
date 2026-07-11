import { describe, expect, it } from 'vitest'
import type { MainspringSessionRecord } from '../contracts/runtime.js'
import type { LocalGatewayAppStateRunInput } from './LocalGateway.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayAppStateStore,
  LocalGatewayClientRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'
import { GatewayRunInputResolver } from './GatewayRunInputResolver.js'

function fixture() {
  const client: LocalGatewayClientRecord = {
    clientId: 'client_a',
    name: 'Client A',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  }
  const workspace: LocalGatewayWorkspaceRecord = {
    workspaceId: 'workspace_a',
    clientId: client.clientId,
    name: 'Workspace A',
    root: 'C:/mainspring/workspace-a',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  }
  const agent: LocalGatewayAgentRecord = {
    agentId: 'agent_a',
    workspaceId: workspace.workspaceId,
    name: 'Agent A',
    version: '1',
    defaultModelId: 'agent-model',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  }
  const providerProfile: LocalGatewayProviderProfileRecord = {
    profileId: 'profile_a',
    providerId: 'provider_a',
    label: 'Provider A',
    secretRef: 'managed:provider-a',
    defaultModelId: 'provider-model',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  }
  const session: MainspringSessionRecord = {
    sessionId: 'session_a',
    sessionPath: 'C:/mainspring/sessions/session-a.sqlite',
    workspaceRoot: workspace.root,
    status: 'open',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    metadata: { workspaceId: workspace.workspaceId },
  }
  const appState = {
    clients: { get: (clientId: string) => clientId === client.clientId ? client : null },
    workspaces: { get: (workspaceId: string) => workspaceId === workspace.workspaceId ? workspace : null },
    agents: { get: (agentId: string) => agentId === agent.agentId ? agent : null },
    providerProfiles: {
      get: (profileId: string) => profileId === providerProfile.profileId ? providerProfile : null,
    },
  } as unknown as LocalGatewayAppStateStore
  const resolver = new GatewayRunInputResolver({
    appState,
    getSession: (sessionId) => sessionId === session.sessionId ? session : null,
    assertRuntimeProfile: (profileId) => profileId,
  })
  return { resolver, client, workspace, agent, providerProfile, session }
}

describe('GatewayRunInputResolver', () => {
  it('resolves one safe app-state binding for gateway and RunLog ingress', () => {
    const { resolver } = fixture()
    const input: LocalGatewayAppStateRunInput = {
      sessionId: 'session_a',
      workspaceId: 'workspace_a',
      agentId: 'agent_a',
      providerProfileId: 'profile_a',
      runtimeProfile: 'core-browser-memory',
      input: 'Prepare the next step.',
      mode: 'chat',
    }

    expect(resolver.resolve(input)).toMatchObject({
      sessionId: 'session_a',
      workspaceId: 'workspace_a',
      agentId: 'agent_a',
      providerId: 'provider_a',
      credentialRef: 'managed:provider-a',
      modelId: 'provider-model',
      runtimeProfile: 'core-browser-memory',
    })
    expect(resolver.resolve(input)).not.toHaveProperty('providerProfileId')
  })

  it('rejects archived providers and unknown identifiers before a run can start', () => {
    const { resolver, workspace, providerProfile } = fixture()
    const input: LocalGatewayAppStateRunInput = {
      sessionId: 'session_a',
      workspaceId: 'workspace_a',
      providerProfileId: 'profile_a',
      input: 'Run safely.',
    }

    workspace.status = 'archived'
    expect(() => resolver.resolve(input)).toThrow(/archived and cannot run agents/)

    workspace.status = 'active'
    providerProfile.status = 'archived'
    expect(() => resolver.resolve(input)).toThrow(/provider profile profile_a is archived/)

    providerProfile.status = 'active'
    expect(() => resolver.resolveProviderProfile('missing')).toThrow(/Unknown gateway provider profile/)
  })
})
