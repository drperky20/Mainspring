import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  clientDeletionGuard,
  workspaceDeletionGuard,
} from './localGatewayDeletionGuards'

const snapshot = {
  generatedAt: '2026-06-27T18:00:00.000Z',
  health: { ok: true, running: true, activeSessions: 3 },
  counts: {
    clients: 2,
    workspaces: 3,
    agents: 2,
    providerProfiles: 1,
    sessions: 3,
    runs: 2,
    storedApprovals: 1,
    artifacts: 1,
    usageLedgerEntries: 1,
    auditEvents: 0,
    memoryEntries: 0,
    pendingApprovals: 0,
  },
  clients: [
    { clientId: 'client_busy', name: 'Busy Client', status: 'active' },
    { clientId: 'client_empty', name: 'Empty Client', status: 'active' },
  ],
  workspaces: [
    {
      workspaceId: 'workspace_busy',
      clientId: 'client_busy',
      name: 'Busy Workspace',
      status: 'active',
    },
    {
      workspaceId: 'workspace_archive',
      clientId: 'client_busy',
      name: 'Archive Workspace',
      status: 'archived',
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
      agentId: 'agent_busy',
      workspaceId: 'workspace_busy',
      name: 'Busy Agent',
      version: '1.0.0',
      status: 'active',
    },
    {
      agentId: 'agent_archive',
      workspaceId: 'workspace_archive',
      name: 'Archive Agent',
      version: '1.0.0',
      status: 'archived',
    },
  ],
  providerProfiles: [
    {
      profileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      label: 'OpenRouter',
      status: 'active',
      credentialState: 'configured',
    },
  ],
  sessions: [
    {
      sessionId: 'session_busy',
      status: 'open',
      clientId: 'client_busy',
      workspaceId: 'workspace_busy',
      createdAt: '2026-06-27T17:40:00.000Z',
      updatedAt: '2026-06-27T17:59:00.000Z',
    },
    {
      sessionId: 'session_archive',
      status: 'open',
      clientId: 'client_busy',
      workspaceId: 'workspace_archive',
      createdAt: '2026-06-27T17:20:00.000Z',
      updatedAt: '2026-06-27T17:58:00.000Z',
    },
    {
      sessionId: 'session_other',
      status: 'open',
      clientId: 'client_other',
      workspaceId: 'workspace_other',
      createdAt: '2026-06-27T17:00:00.000Z',
      updatedAt: '2026-06-27T17:30:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_busy',
      sessionId: 'session_busy',
      status: 'completed',
      workspaceId: 'workspace_busy',
      createdAt: '2026-06-27T17:01:00.000Z',
      lastEventAt: '2026-06-27T17:10:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_empty',
      sessionId: 'session_other',
      status: 'completed',
      workspaceId: 'workspace_other',
      createdAt: '2026-06-27T17:42:00.000Z',
      lastEventAt: '2026-06-27T17:58:30.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [],
  approvalMetadata: [
    {
      approvalId: 'approval_busy',
      runId: 'run_busy',
      sessionId: 'session_busy',
      workspaceId: 'workspace_busy',
      status: 'approved',
      requestedAt: '2026-06-27T17:57:00.000Z',
      resolvedAt: '2026-06-27T17:58:00.000Z',
      targetKey: 'tool:file.write',
    },
  ],
  artifacts: [
    {
      artifactId: 'artifact_busy',
      runId: 'run_busy',
      sessionId: 'session_busy',
      workspaceId: 'workspace_busy',
      kind: 'report',
      createdAt: '2026-06-27T17:59:00.000Z',
    },
  ],
  usageLedger: [
    {
      entryId: 'usage_busy',
      runId: 'run_busy',
      sessionId: 'session_busy',
      workspaceId: 'workspace_busy',
      createdAt: '2026-06-27T17:59:00.000Z',
    },
  ],
  auditEvents: [],
  memoryEntries: [],
} satisfies ConsoleGatewaySnapshot

describe('localGatewayDeletionGuards', () => {
  it('allows deleting a client only when no linked workspaces or sessions remain', () => {
    expect(
      clientDeletionGuard({
        snapshot,
        clientId: 'client_empty',
      }),
    ).toEqual({
      allowed: false,
      blockers: ['1 linked workspace'],
    })

    expect(
      clientDeletionGuard({
        snapshot: {
          ...snapshot,
          workspaces: snapshot.workspaces.filter((workspace) => workspace.clientId !== 'client_empty'),
        },
        clientId: 'client_empty',
      }),
    ).toEqual({
      allowed: true,
      blockers: [],
    })
  })

  it('describes all workspace-linked blockers that currently prevent deletion', () => {
    expect(
      workspaceDeletionGuard({
        snapshot,
        workspaceId: 'workspace_busy',
      }),
    ).toEqual({
      allowed: false,
      blockers: [
        '1 linked agent',
        '1 run record',
        '1 stored approval',
        '1 artifact',
        '1 usage entry',
        '1 linked session',
      ],
    })
  })
})
