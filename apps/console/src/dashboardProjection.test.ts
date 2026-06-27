import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  findForbiddenDashboardProjectionTokens,
  projectConsoleDashboard,
} from './dashboardProjection'

const dashboardSnapshot = {
  generatedAt: '2026-06-27T14:00:00.000Z',
  health: {
    ok: true,
    running: true,
    activeSessions: 1,
  },
  counts: {
    clients: 2,
    workspaces: 2,
    agents: 1,
    providerProfiles: 2,
    sessions: 1,
    runs: 3,
    pendingApprovals: 1,
  },
  clients: [
    {
      clientId: 'client_acme',
      name: 'Acme',
      status: 'active',
    },
    {
      clientId: 'client_empty',
      name: 'Empty Client',
      status: 'active',
    },
  ],
  workspaces: [
    {
      workspaceId: 'workspace_acme',
      clientId: 'client_acme',
      name: 'Acme Workspace',
      status: 'active',
    },
    {
      workspaceId: 'workspace_empty',
      clientId: 'client_empty',
      name: 'Empty Workspace',
      status: 'active',
    },
  ],
  agents: [
    {
      agentId: 'agent_research',
      workspaceId: 'workspace_acme',
      name: 'Research Agent',
      version: '1.0.0',
      defaultModelId: 'openrouter/auto',
      status: 'active',
    },
  ],
  providerProfiles: [
    {
      profileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      label: 'OpenRouter',
      status: 'active',
      defaultModelId: 'anthropic/claude-sonnet-4',
      credentialState: 'configured',
    },
    {
      profileId: 'provider_profile_archived',
      providerId: 'openai',
      label: 'Archived OpenAI',
      status: 'archived',
      credentialState: 'configured',
    },
  ],
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      createdAt: '2026-06-27T13:40:00.000Z',
      updatedAt: '2026-06-27T13:59:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_waiting',
      sessionId: 'session_1',
      status: 'waiting_approval',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:50:00.000Z',
      lastEventAt: '2026-06-27T13:59:00.000Z',
      eventCount: 5,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_running',
      sessionId: 'session_1',
      status: 'running',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:45:00.000Z',
      lastEventAt: '2026-06-27T13:55:00.000Z',
      eventCount: 3,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_completed',
      sessionId: 'session_1',
      status: 'completed',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:20:00.000Z',
      lastEventAt: '2026-06-27T13:30:00.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_waiting',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T13:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
} satisfies ConsoleGatewaySnapshot

describe('projectConsoleDashboard', () => {
  it('maps safe gateway snapshots into dashboard client, provider, run, and approval rows', () => {
    const projection = projectConsoleDashboard(dashboardSnapshot)

    expect(projection.providerReady).toBe(true)
    expect(projection.providerState).toBe('ready')
    expect(projection.providers).toEqual([
      {
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter',
        status: 'active',
        credentialState: 'configured',
        defaultModelId: 'anthropic/claude-sonnet-4',
        ready: true,
      },
      {
        profileId: 'provider_profile_archived',
        providerId: 'openai',
        label: 'Archived OpenAI',
        status: 'archived',
        credentialState: 'configured',
        ready: false,
      },
    ])
    expect(projection.clients).toEqual([
      {
        clientId: 'client_acme',
        name: 'Acme',
        status: 'needs-approval',
        providerReady: true,
        workspaceCount: 1,
        agentCount: 1,
        activeRunCount: 2,
        pendingApprovalCount: 1,
        primaryAgentName: 'Research Agent',
      },
      {
        clientId: 'client_empty',
        name: 'Empty Client',
        status: 'needs-agent',
        providerReady: true,
        workspaceCount: 1,
        agentCount: 0,
        activeRunCount: 0,
        pendingApprovalCount: 0,
      },
    ])
    expect(projection.activeRuns.map((run) => run.runId)).toEqual([
      'run_waiting',
      'run_running',
    ])
    expect(projection.activeRuns[0]).toMatchObject({
      runId: 'run_waiting',
      clientId: 'client_acme',
      clientName: 'Acme',
      agentId: 'agent_research',
      agentName: 'Research Agent',
      providerLabel: 'OpenRouter',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      needsApproval: true,
    })
    expect(projection.pendingApprovals).toEqual([
      {
        approvalId: 'approval_1',
        runId: 'run_waiting',
        sessionId: 'session_1',
        requestedAt: '2026-06-27T13:59:00.000Z',
        targetKey: 'tool:shell.exec',
        clientId: 'client_acme',
        clientName: 'Acme',
        agentId: 'agent_research',
        agentName: 'Research Agent',
      },
    ])
    expect(findForbiddenDashboardProjectionTokens(projection)).toEqual([])
  })

  it('marks clients with agents as provider-missing when no configured active provider exists', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      counts: {
        ...dashboardSnapshot.counts,
        providerProfiles: 0,
        runs: 0,
        pendingApprovals: 0,
      },
      providerProfiles: [],
      runs: [],
      approvals: [],
    })

    expect(projection.providerReady).toBe(false)
    expect(projection.providerState).toBe('missing')
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'provider-missing',
      providerReady: false,
      agentCount: 1,
      activeRunCount: 0,
      pendingApprovalCount: 0,
    })
  })

  it('treats missing or unverified provider credentials as not ready', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      providerProfiles: [
        {
          ...dashboardSnapshot.providerProfiles[0],
          credentialState: 'missing',
        },
        {
          ...dashboardSnapshot.providerProfiles[1],
          status: 'active',
          credentialState: 'unverified',
        },
      ],
    })

    expect(projection.providerReady).toBe(false)
    expect(projection.providerState).toBe('unverified')
    expect(projection.providers).toEqual([
      expect.objectContaining({
        profileId: 'provider_profile_openrouter',
        credentialState: 'missing',
        ready: false,
      }),
      expect.objectContaining({
        profileId: 'provider_profile_archived',
        credentialState: 'unverified',
        ready: false,
      }),
    ])
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'provider-unverified',
      providerReady: false,
    })
  })

  it('keeps provider labels visible for active runs when providerId is present but providerProfileId is not', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      runs: [
        {
          ...dashboardSnapshot.runs[1],
          runId: 'run_runtime_derived',
          providerProfileId: undefined,
          providerId: 'openrouter',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          providerSessionId: 'provider_runtime_session',
        },
      ],
      approvals: [],
    })

    expect(projection.activeRuns).toEqual([
      expect.objectContaining({
        runId: 'run_runtime_derived',
        providerId: 'openrouter',
        providerLabel: 'OpenRouter',
        modelId: 'anthropic/claude-sonnet-4',
        modelFamily: 'claude',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: 'provider_runtime_session',
      }),
    ])
  })
})
