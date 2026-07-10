import { describe, expect, it } from 'vitest'
import { buildGatewayRouteContext, gatewayRouteKey } from './GatewayRouteContext.js'
import type { LocalGatewaySnapshot } from './LocalGateway.js'

function snapshot(): LocalGatewaySnapshot {
  return {
    generatedAt: '2026-06-27T00:00:00.000Z',
    health: { ok: true, running: true, sessionsRoot: '/sessions', activeSessions: 1 },
    appState: {
      clients: [],
      workspaces: [
        {
          workspaceId: 'workspace_1',
          name: 'Acme sk-or-secret',
          root: '/workspace',
          status: 'active',
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
        },
      ],
      agents: [
        {
          agentId: 'agent_1',
          workspaceId: 'workspace_1',
          name: 'Research Agent',
          version: 'v1',
          defaultModelId: 'agent/default',
          status: 'active',
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
        },
      ],
      providerProfiles: [
        {
          profileId: 'profile_1',
          providerId: 'openrouter',
          label: 'OpenRouter',
          secretRef: 'env:OPENROUTER_API_KEY',
          defaultModelId: 'openrouter/free',
          status: 'active',
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
        },
      ],
      runs: [
        {
          runId: 'run_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_1',
          agentId: 'agent_1',
          providerProfileId: 'profile_1',
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
          metadata: { apiKey: 'sk-or-secret' },
        },
      ],
      approvals: [],
      artifacts: [],
      toolCalls: [],
      usageLedger: [],
      auditEvents: [],
    },
    sessions: [
      {
        sessionId: 'session_1',
        status: 'open',
        workspaceRoot: '/workspace',
        sessionPath: '/sessions/session_1',
        createdAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-27T00:00:00.000Z',
        metadata: { client: 'Acme', token: 'sk-or-session' },
      },
    ],
    runs: [
      {
        runId: 'run_1',
        sessionId: 'session_1',
        status: 'completed',
        createdAt: '2026-06-27T00:00:00.000Z',
        lastEventAt: '2026-06-27T00:00:01.000Z',
        eventCount: 3,
        pendingInboundCount: 0,
        workspaceId: 'workspace_1',
        agentId: 'agent_1',
        providerProfileId: 'profile_1',
        providerId: 'openrouter',
        modelId: 'openrouter/free',
        modelFamily: 'claude',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: '[redacted]',
      },
    ],
    approvals: [],
  } as unknown as LocalGatewaySnapshot
}

describe('Gateway route context', () => {
  it('builds a sanitized Hermes-style local gateway context from snapshot state', () => {
    const context = buildGatewayRouteContext({ snapshot: snapshot(), sessionId: 'session_1' })

    expect(context).toMatchObject({
      sessionId: 'session_1',
      workspaceId: 'workspace_1',
      agentId: 'agent_1',
      providerProfileId: 'profile_1',
      providerId: 'openrouter',
      modelId: 'openrouter/free',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: '[redacted]',
      workspaceName: 'Acme [redacted]',
      agentName: 'Research Agent',
      channel: {
        kind: 'local',
        sessionStatus: 'open',
        routeKey: 'workspace_1:agent_1:session_1',
      },
      run: {
        runId: 'run_1',
        status: 'completed',
        eventCount: 3,
        pendingInboundCount: 0,
      },
    })
    expect(JSON.stringify(context)).not.toContain('sk-or-secret')
    expect(JSON.stringify(context)).not.toContain('OPENROUTER_API_KEY')
  })

  it('creates stable local route keys', () => {
    expect(
      gatewayRouteKey({
        sessionId: 'session one',
        workspaceId: 'workspace/acme',
        agentId: 'agent:research',
      }),
    ).toBe('workspace_acme:agent:research:session_one')
  })

  it('fails closed for unknown sessions', () => {
    expect(() =>
      buildGatewayRouteContext({ snapshot: snapshot(), sessionId: 'missing' }),
    ).toThrow('Unknown gateway session: missing')
  })
})
