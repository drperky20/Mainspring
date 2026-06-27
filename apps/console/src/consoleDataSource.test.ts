import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createStaticGatewaySnapshotDataSource,
  findForbiddenConsoleSnapshotTokens,
  prototypeConsoleDataSource,
  prototypeConsoleStorageKey,
  summarizeConsoleGatewaySnapshot,
} from './consoleDataSource'

const gatewaySnapshotFixture = {
  generatedAt: '2026-06-27T13:00:00.000Z',
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
      createdAt: '2026-06-27T12:55:00.000Z',
      updatedAt: '2026-06-27T12:59:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'waiting_approval',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T12:56:00.000Z',
      lastEventAt: '2026-06-27T12:59:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_2',
      sessionId: 'session_1',
      status: 'completed',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T12:40:00.000Z',
      lastEventAt: '2026-06-27T12:44:00.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T12:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
} satisfies ConsoleGatewaySnapshot

describe('console data source boundary', () => {
  it('keeps the existing prototype localStorage source explicit', () => {
    expect(prototypeConsoleDataSource).toEqual({
      kind: 'prototype-localStorage',
      storageKey: prototypeConsoleStorageKey,
    })
  })

  it('accepts a console gateway snapshot without local paths or secret refs', () => {
    const source = createStaticGatewaySnapshotDataSource(gatewaySnapshotFixture)
    const summary = summarizeConsoleGatewaySnapshot(gatewaySnapshotFixture)

    expect(source).toEqual({
      kind: 'gateway-snapshot',
      snapshot: gatewaySnapshotFixture,
    })
    expect(summary).toEqual({
      health: 'ready',
      clientCount: 1,
      workspaceCount: 1,
      agentCount: 1,
      providerProfileCount: 1,
      activeSessionCount: 1,
      activeRunCount: 1,
      pendingApprovalCount: 1,
    })
    expect(findForbiddenConsoleSnapshotTokens(gatewaySnapshotFixture)).toEqual([])
    expect(JSON.stringify(gatewaySnapshotFixture)).not.toContain('localStorage')
  })
})
