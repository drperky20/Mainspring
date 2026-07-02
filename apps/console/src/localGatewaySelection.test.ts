import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  formatGatewaySessionOptionLabel,
  listGatewaySessionsForClient,
  selectGatewayPendingApprovalForSession,
  selectGatewayRunForSession,
  selectGatewaySessionForClient,
} from './localGatewaySelection'

const snapshot = {
  generatedAt: '2026-06-27T18:00:00.000Z',
  health: { ok: true, running: true, activeSessions: 3 },
  counts: {
    clients: 1,
    workspaces: 2,
    agents: 1,
    providerProfiles: 1,
    sessions: 3,
    runs: 3,
    storedApprovals: 0,
    artifacts: 0,
    usageLedgerEntries: 0,
    auditEvents: 0,
    memoryEntries: 0,
    pendingApprovals: 1,
  },
  clients: [{ clientId: 'client_acme', name: 'Acme', status: 'active' }],
  workspaces: [
    {
      workspaceId: 'workspace_primary',
      clientId: 'client_acme',
      name: 'Primary',
      status: 'active',
    },
    {
      workspaceId: 'workspace_secondary',
      clientId: 'client_acme',
      name: 'Secondary',
      status: 'active',
    },
  ],
  agents: [
    {
      agentId: 'agent_acme',
      workspaceId: 'workspace_primary',
      name: 'Acme Agent',
      version: '1.0.0',
      status: 'active',
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
      sessionId: 'session_primary_new',
      status: 'open',
      clientId: 'client_acme',
      workspaceId: 'workspace_primary',
      createdAt: '2026-06-27T17:40:00.000Z',
      updatedAt: '2026-06-27T17:59:00.000Z',
    },
    {
      sessionId: 'session_secondary',
      status: 'open',
      clientId: 'client_acme',
      workspaceId: 'workspace_secondary',
      createdAt: '2026-06-27T17:20:00.000Z',
      updatedAt: '2026-06-27T17:58:00.000Z',
    },
    {
      sessionId: 'session_primary_old',
      status: 'open',
      clientId: 'client_acme',
      workspaceId: 'workspace_primary',
      createdAt: '2026-06-27T17:00:00.000Z',
      updatedAt: '2026-06-27T17:30:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_completed_old',
      sessionId: 'session_primary_old',
      status: 'completed',
      workspaceId: 'workspace_primary',
      createdAt: '2026-06-27T17:01:00.000Z',
      lastEventAt: '2026-06-27T17:10:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_waiting',
      sessionId: 'session_primary_new',
      status: 'waiting_approval',
      workspaceId: 'workspace_primary',
      createdAt: '2026-06-27T17:41:00.000Z',
      lastEventAt: '2026-06-27T17:57:00.000Z',
      eventCount: 6,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_completed_newer',
      sessionId: 'session_primary_new',
      status: 'completed',
      workspaceId: 'workspace_primary',
      createdAt: '2026-06-27T17:42:00.000Z',
      lastEventAt: '2026-06-27T17:58:30.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_waiting',
      runId: 'run_waiting',
      sessionId: 'session_primary_new',
      status: 'pending',
      requestedAt: '2026-06-27T17:57:00.000Z',
      targetKey: 'tool:file.write',
    },
  ],
  approvalMetadata: [],
  artifacts: [],
  usageLedger: [],
  auditEvents: [],
  memoryEntries: [],
} satisfies ConsoleGatewaySnapshot

describe('localGatewaySelection', () => {
  it('lists client sessions with matching workspace sessions first and newest first', () => {
    expect(
      listGatewaySessionsForClient({
        snapshot,
        clientId: 'client_acme',
        workspaceId: 'workspace_primary',
      }).map((session) => session.sessionId),
    ).toEqual(['session_primary_new', 'session_primary_old', 'session_secondary'])
  })

  it('prefers the explicitly selected session when it still belongs to the client', () => {
    expect(
      selectGatewaySessionForClient({
        snapshot,
        clientId: 'client_acme',
        workspaceId: 'workspace_primary',
        preferredSessionId: 'session_secondary',
      })?.sessionId,
    ).toBe('session_secondary')
  })

  it('selects the newest run for the chosen session', () => {
    expect(
      selectGatewayRunForSession({
        snapshot,
        sessionId: 'session_primary_new',
      })?.runId,
    ).toBe('run_completed_newer')
  })

  it('selects the newest pending approval for the chosen session', () => {
    expect(
      selectGatewayPendingApprovalForSession({
        snapshot,
        sessionId: 'session_primary_new',
      })?.approvalId,
    ).toBe('approval_waiting')
  })

  it('formats a compact session label without leaking host paths', () => {
    expect(
      formatGatewaySessionOptionLabel({
        session: snapshot.sessions[0],
        latestRun: snapshot.runs[1],
      }),
    ).toBe('session_primary_new | workspace_primary | waiting_approval')
  })
})
