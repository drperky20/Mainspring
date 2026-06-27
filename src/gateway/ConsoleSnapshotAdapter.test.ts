import { describe, expect, it } from 'vitest'
import type { LocalGatewaySnapshot } from './LocalGateway.js'
import { gatewaySnapshotToConsoleState } from './ConsoleSnapshotAdapter.js'

const sourceSnapshot: LocalGatewaySnapshot = {
  generatedAt: '2026-06-27T12:00:00.000Z',
  health: {
    ok: true,
    running: true,
    sessionsRoot: 'C:\\mainspring\\runtime\\sessions',
    activeSessions: 1,
    lastTickAt: '2026-06-27T12:00:01.000Z',
  },
  appState: {
    clients: [
      {
        clientId: 'client_acme',
        name: 'Acme',
        status: 'active',
        createdAt: '2026-06-27T11:00:00.000Z',
        updatedAt: '2026-06-27T11:00:00.000Z',
        metadata: { privateNote: 'internal client memo' },
      },
    ],
    workspaces: [
      {
        workspaceId: 'workspace_acme',
        clientId: 'client_acme',
        name: 'Acme Workspace',
        root: 'C:\\secret\\workspaces\\acme',
        status: 'active',
        createdAt: '2026-06-27T11:01:00.000Z',
        updatedAt: '2026-06-27T11:01:00.000Z',
        metadata: { localPath: 'C:\\secret\\metadata' },
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
        createdAt: '2026-06-27T11:02:00.000Z',
        updatedAt: '2026-06-27T11:02:00.000Z',
        metadata: { promptPath: 'C:\\secret\\prompts\\agent.md' },
      },
    ],
    providerProfiles: [
      {
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'anthropic/claude-sonnet-4',
        status: 'active',
        createdAt: '2026-06-27T11:03:00.000Z',
        updatedAt: '2026-06-27T11:03:00.000Z',
        metadata: { ownerSecretHint: 'OPENROUTER_API_KEY' },
      },
    ],
    runs: [
      {
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        agentId: 'agent_research',
        providerProfileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4',
        runtimeProfile: 'core-browser',
        createdAt: '2026-06-27T11:04:00.000Z',
        updatedAt: '2026-06-27T11:05:00.000Z',
        metadata: { secretRef: 'env:OPENROUTER_API_KEY' },
      },
    ],
  },
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      workspaceRoot: 'C:\\secret\\runtime-workspaces\\session_1',
      sessionPath: 'C:\\secret\\runtime-sessions\\session_1',
      createdAt: '2026-06-27T11:04:00.000Z',
      updatedAt: '2026-06-27T11:05:00.000Z',
      metadata: { clientId: 'client_acme', root: 'C:\\secret\\runtime-workspaces\\session_1' },
    },
  ],
  runs: [
    {
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'waiting_approval',
      input: 'Do private work',
      createdAt: '2026-06-27T11:04:00.000Z',
      lastEventAt: '2026-06-27T11:05:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      computerId: 'computer_host',
      providerId: 'openrouter',
      providerProfileId: 'provider_profile_openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      runtimeProfile: 'core-browser',
    },
  ],
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T11:05:00.000Z',
      targetKey: 'tool:shell.exec',
      reasons: ['requires host shell'],
      permissionCategories: ['process'],
    },
    {
      approvalId: 'approval_2',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'approved',
      requestedAt: '2026-06-27T11:04:30.000Z',
      resolvedAt: '2026-06-27T11:04:45.000Z',
      targetKey: 'tool:file.write',
      reasons: ['write file'],
      permissionCategories: ['filesystem.write'],
    },
  ],
}

describe('gatewaySnapshotToConsoleState', () => {
  it('maps gateway snapshots into console-safe serializable data', () => {
    const original = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-test-secret'
    const consoleState = gatewaySnapshotToConsoleState(sourceSnapshot)

    try {
      expect(consoleState.counts).toEqual({
        clients: 1,
        workspaces: 1,
        agents: 1,
        providerProfiles: 1,
        sessions: 1,
        runs: 1,
        pendingApprovals: 1,
      })
      expect(consoleState.health).toEqual({
        ok: true,
        running: true,
        activeSessions: 1,
      })
      expect(consoleState.providerProfiles[0]).toEqual({
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter',
        status: 'active',
        defaultModelId: 'anthropic/claude-sonnet-4',
        credentialState: 'configured',
      })
      expect(consoleState.workspaces[0]).toEqual({
        workspaceId: 'workspace_acme',
        clientId: 'client_acme',
        name: 'Acme Workspace',
        status: 'active',
      })
      expect(consoleState.sessions[0]).toEqual({
        sessionId: 'session_1',
        status: 'open',
        createdAt: '2026-06-27T11:04:00.000Z',
        updatedAt: '2026-06-27T11:05:00.000Z',
      })
      expect(consoleState.runs[0]).toEqual({
        runId: 'run_1',
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
        createdAt: '2026-06-27T11:04:00.000Z',
        lastEventAt: '2026-06-27T11:05:00.000Z',
        eventCount: 4,
        pendingInboundCount: 0,
      })
      expect(consoleState.approvals).toEqual([
        {
          approvalId: 'approval_1',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'pending',
          requestedAt: '2026-06-27T11:05:00.000Z',
          targetKey: 'tool:shell.exec',
        },
        {
          approvalId: 'approval_2',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'approved',
          requestedAt: '2026-06-27T11:04:30.000Z',
          resolvedAt: '2026-06-27T11:04:45.000Z',
          targetKey: 'tool:file.write',
        },
      ])

      expect(consoleState.providerProfiles[0]).not.toHaveProperty('secretRef')
      expect(consoleState.workspaces[0]).not.toHaveProperty('root')
      expect(consoleState.sessions[0]).not.toHaveProperty('workspaceRoot')
      expect(consoleState.sessions[0]).not.toHaveProperty('sessionPath')

      const serialized = JSON.stringify(consoleState)
      expect(serialized).not.toContain('OPENROUTER_API_KEY')
      expect(serialized).not.toContain('secretRef')
      expect(serialized).not.toContain('C:\\secret')
      expect(serialized).not.toContain('workspaceRoot')
      expect(serialized).not.toContain('sessionPath')
      expect(JSON.parse(serialized)).toEqual(consoleState)
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = original
    }
  })

  it('marks env-backed provider profiles as missing when the current process lacks the referenced key', () => {
    const original = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const consoleState = gatewaySnapshotToConsoleState(sourceSnapshot)
      expect(consoleState.providerProfiles[0]?.credentialState).toBe('missing')
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = original
    }
  })

  it('marks non-env provider refs as unverified instead of pretending they are configured', () => {
    const consoleState = gatewaySnapshotToConsoleState({
      ...sourceSnapshot,
      appState: {
        ...sourceSnapshot.appState,
        providerProfiles: [
          {
            ...sourceSnapshot.appState.providerProfiles[0],
            profileId: 'provider_profile_managed',
            label: 'Managed Profile',
            secretRef: 'managed:openrouter-profile',
          },
        ],
      },
    })

    expect(consoleState.providerProfiles[0]).toMatchObject({
      profileId: 'provider_profile_managed',
      credentialState: 'unverified',
    })
  })
})
