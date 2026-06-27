import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createStaticGatewaySnapshotDataSource,
  prototypeConsoleDataSource,
  prototypeConsoleStorageKey,
} from './consoleDataSource'
import {
  composeConsoleDashboardReadModel,
  findForbiddenConsoleReadModelTokens,
} from './consoleReadModelPipeline'

const gatewaySnapshot = {
  generatedAt: '2026-06-27T16:00:00.000Z',
  health: {
    ok: true,
    running: true,
    activeSessions: 1,
  },
  counts: {
    clients: 1,
    workspaces: 1,
    agents: 1,
    providerProfiles: 1,
    sessions: 1,
    runs: 2,
    pendingApprovals: 1,
  },
  clients: [
    {
      clientId: 'client_acme',
      name: 'Acme',
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
  ],
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      createdAt: '2026-06-27T15:45:00.000Z',
      updatedAt: '2026-06-27T15:59:00.000Z',
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
      createdAt: '2026-06-27T15:50:00.000Z',
      lastEventAt: '2026-06-27T15:59:00.000Z',
      eventCount: 5,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_done',
      sessionId: 'session_1',
      status: 'completed',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T15:35:00.000Z',
      lastEventAt: '2026-06-27T15:40:00.000Z',
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
      requestedAt: '2026-06-27T15:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
} satisfies ConsoleGatewaySnapshot

describe('composeConsoleDashboardReadModel', () => {
  it('composes static gateway snapshots into projection and view-model output', () => {
    const result = composeConsoleDashboardReadModel({
      dataSource: createStaticGatewaySnapshotDataSource(gatewaySnapshot),
    })

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready' || result.source !== 'gateway-snapshot') {
      throw new Error('Expected a composed gateway snapshot result.')
    }
    expect(result.projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'needs-approval',
      activeRunCount: 1,
      pendingApprovalCount: 1,
    })
    expect(result.viewModel).toMatchObject({
      source: 'gateway-projection',
      providerReady: true,
      activeRunCount: 1,
      pendingApprovalCount: 1,
    })
    expect(result.viewModel.clients[0]).toMatchObject({
      id: 'client_acme',
      subtitle: 'Research Agent',
      activeRunSummary: 'OpenRouter | anthropic/claude-sonnet-4',
      statusLabel: 'Approval needed - OpenRouter',
    })
    expect(findForbiddenConsoleReadModelTokens(result)).toEqual([])
  })

  it('keeps prototype localStorage explicit when no prototype state is supplied', () => {
    const result = composeConsoleDashboardReadModel({
      dataSource: prototypeConsoleDataSource,
    })

    expect(result).toEqual({
      kind: 'unsupported',
      source: 'prototype-localStorage',
      storageKey: prototypeConsoleStorageKey,
      reason: 'Prototype localStorage must be loaded by the browser UI before composing read models.',
    })
  })

  it('can compose caller-supplied prototype state without reading browser storage', () => {
    const result = composeConsoleDashboardReadModel({
      dataSource: prototypeConsoleDataSource,
      prototypeState: {
        clients: [{ id: 'client_1', name: 'Northline Dental' }],
        agents: [{ id: 'agent_1', clientId: 'client_1', name: 'Front desk assistant' }],
        providers: [{ provider: 'OpenRouter', status: 'Saved locally' }],
      },
    })

    expect(result).toEqual({
      kind: 'ready',
      source: 'prototype-state',
      viewModel: {
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
      },
    })
  })
})
