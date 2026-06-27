import { describe, expect, it } from 'vitest'
import type { ConsoleDashboardProjection } from './dashboardProjection'
import {
  findForbiddenDashboardViewModelTokens,
  gatewayProjectionToDashboardViewModel,
  prototypeStateToDashboardViewModel,
} from './dashboardViewModel'

describe('dashboard view-model boundary', () => {
  it('maps prototype localStorage state into the existing dashboard shape', () => {
    const viewModel = prototypeStateToDashboardViewModel({
      clients: [{ id: 'client_1', name: 'Northline Dental' }],
      agents: [{ id: 'agent_1', clientId: 'client_1', name: 'Front desk assistant' }],
      providers: [
        { provider: 'OpenRouter', status: 'Saved locally' },
        { provider: 'OpenAI', status: 'Not connected' },
      ],
    })

    expect(viewModel).toEqual({
      source: 'prototype-localStorage',
      providerReady: true,
      providerState: 'ready',
      clients: [
        {
          id: 'client_1',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          statusLabel: 'Ready',
          providerReady: true,
          activeRunCount: 0,
          pendingApprovalCount: 0,
        },
      ],
      statusStrip: [
        'Local account. Password required on launch.',
        'Provider ready',
        'Agent draft saved',
        'Workspace ready',
      ],
      activeRunCount: 0,
      pendingApprovalCount: 0,
    })
  })

  it('maps projected gateway dashboard data into the same render shape', () => {
    const projection: ConsoleDashboardProjection = {
      generatedAt: '2026-06-27T15:00:00.000Z',
      health: 'ready',
      providerReady: true,
      providerState: 'ready',
      counts: {
        health: 'ready',
        clientCount: 1,
        workspaceCount: 1,
        agentCount: 1,
        providerProfileCount: 1,
        activeSessionCount: 1,
        activeRunCount: 2,
        pendingApprovalCount: 1,
      },
      providers: [
        {
          profileId: 'provider_profile_openrouter',
          providerId: 'openrouter',
          label: 'OpenRouter',
          status: 'active',
          credentialState: 'configured',
          defaultModelId: 'anthropic/claude-sonnet-4',
          ready: true,
        },
      ],
      clients: [
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
      ],
      activeRuns: [
        {
          runId: 'run_waiting',
          sessionId: 'session_1',
          status: 'waiting_approval',
          needsApproval: true,
          eventCount: 5,
          pendingInboundCount: 0,
          clientId: 'client_acme',
          clientName: 'Acme',
          agentId: 'agent_research',
          agentName: 'Research Agent',
          providerLabel: 'OpenRouter',
        },
      ],
      pendingApprovals: [
        {
          approvalId: 'approval_1',
          runId: 'run_waiting',
          sessionId: 'session_1',
          requestedAt: '2026-06-27T14:59:00.000Z',
          targetKey: 'tool:shell.exec',
          clientId: 'client_acme',
          clientName: 'Acme',
          agentId: 'agent_research',
          agentName: 'Research Agent',
        },
      ],
    }

    const viewModel = gatewayProjectionToDashboardViewModel(projection)

    expect(viewModel).toEqual({
      source: 'gateway-projection',
      providerReady: true,
      providerState: 'ready',
      clients: [
        {
          id: 'client_acme',
          name: 'Acme',
          subtitle: 'Research Agent',
          activeRunSummary: 'OpenRouter',
          statusLabel: 'Approval needed - OpenRouter',
          providerReady: true,
          activeRunCount: 2,
          pendingApprovalCount: 1,
        },
      ],
      statusStrip: ['1 client', 'Provider ready', '2 active runs', '1 pending approval'],
      activeRunCount: 2,
      pendingApprovalCount: 1,
    })
    expect(findForbiddenDashboardViewModelTokens(viewModel)).toEqual([])
  })

  it('keeps provider-missing and empty-client states visible for both sources', () => {
    expect(
      prototypeStateToDashboardViewModel({
        clients: [{ id: 'client_1', name: 'Client' }],
        agents: [],
        providers: [{ provider: 'OpenRouter', status: 'Not connected' }],
      }).clients[0],
    ).toMatchObject({
      subtitle: 'No agent attached yet',
      statusLabel: 'Provider missing',
      providerReady: false,
    })

    expect(
      gatewayProjectionToDashboardViewModel({
        generatedAt: '2026-06-27T15:05:00.000Z',
        health: 'ready',
        providerReady: false,
        providerState: 'missing',
        counts: {
          health: 'ready',
          clientCount: 1,
          workspaceCount: 1,
          agentCount: 0,
          providerProfileCount: 0,
          activeSessionCount: 0,
          activeRunCount: 0,
          pendingApprovalCount: 0,
        },
        providers: [],
        clients: [
          {
            clientId: 'client_empty',
            name: 'Empty',
            status: 'needs-agent',
            providerReady: false,
            workspaceCount: 1,
            agentCount: 0,
            activeRunCount: 0,
            pendingApprovalCount: 0,
          },
        ],
        activeRuns: [],
        pendingApprovals: [],
      }).clients[0],
    ).toMatchObject({
      subtitle: 'No agent attached yet',
      statusLabel: 'No agent attached yet',
      providerReady: false,
    })
  })

  it('keeps unverified gateway provider state visible in status labels', () => {
    const viewModel = gatewayProjectionToDashboardViewModel({
      generatedAt: '2026-06-27T15:10:00.000Z',
      health: 'ready',
      providerReady: false,
      providerState: 'unverified',
      counts: {
        health: 'ready',
        clientCount: 1,
        workspaceCount: 1,
        agentCount: 1,
        providerProfileCount: 1,
        activeSessionCount: 0,
        activeRunCount: 0,
        pendingApprovalCount: 0,
      },
      providers: [
        {
          profileId: 'provider_profile_managed',
          providerId: 'openrouter',
          label: 'Managed OpenRouter',
          status: 'active',
          credentialState: 'unverified',
          ready: false,
        },
      ],
      clients: [
        {
          clientId: 'client_1',
          name: 'Client',
          status: 'provider-unverified',
          providerReady: false,
          workspaceCount: 1,
          agentCount: 1,
          activeRunCount: 0,
          pendingApprovalCount: 0,
        },
      ],
      activeRuns: [],
      pendingApprovals: [],
    })

    expect(viewModel.statusStrip).toEqual([
      '1 client',
      'Provider unverified',
      '0 active runs',
      '0 pending approvals',
    ])
    expect(viewModel).toMatchObject({
      providerReady: false,
      providerState: 'unverified',
    })
    expect(viewModel.clients[0]).toMatchObject({
      statusLabel: 'Provider unverified',
      providerReady: false,
    })
  })

  it('keeps active run provider labels visible in running client statuses', () => {
    const viewModel = gatewayProjectionToDashboardViewModel({
      generatedAt: '2026-06-27T15:12:00.000Z',
      health: 'ready',
      providerReady: true,
      providerState: 'ready',
      counts: {
        health: 'ready',
        clientCount: 1,
        workspaceCount: 1,
        agentCount: 1,
        providerProfileCount: 1,
        activeSessionCount: 1,
        activeRunCount: 1,
        pendingApprovalCount: 0,
      },
      providers: [
        {
          profileId: 'provider_profile_openrouter',
          providerId: 'openrouter',
          label: 'OpenRouter',
          status: 'active',
          credentialState: 'configured',
          ready: true,
        },
      ],
      clients: [
        {
          clientId: 'client_1',
          name: 'Client',
          status: 'running',
          providerReady: true,
          workspaceCount: 1,
          agentCount: 1,
          activeRunCount: 1,
          pendingApprovalCount: 0,
          primaryAgentName: 'Runtime Agent',
        },
      ],
      activeRuns: [
        {
          runId: 'run_runtime',
          sessionId: 'session_1',
          status: 'running',
          needsApproval: false,
          eventCount: 3,
          pendingInboundCount: 0,
          clientId: 'client_1',
          clientName: 'Client',
          agentId: 'agent_1',
          agentName: 'Runtime Agent',
          providerId: 'openrouter',
          providerLabel: 'OpenRouter',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
        },
      ],
      pendingApprovals: [],
    })

    expect(viewModel.clients[0]).toMatchObject({
      subtitle: 'Runtime Agent',
      activeRunSummary: 'OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions',
      statusLabel: 'Running - OpenRouter',
    })
  })
})
