import { describe, expect, it, vi } from 'vitest'
import { createLocalGatewayClient } from './localGatewayClient'

describe('createLocalGatewayClient', () => {
  it('fetches snapshot, run events, run start, and approval resolution through the expected routes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/snapshot')) {
        return new Response(
          JSON.stringify({
            generatedAt: '2026-06-27T00:00:00.000Z',
            health: { ok: true, running: true, activeSessions: 1 },
            counts: {
              clients: 1,
              workspaces: 1,
              agents: 1,
              providerProfiles: 1,
              sessions: 1,
              runs: 0,
              pendingApprovals: 0,
            },
            clients: [],
            workspaces: [],
            agents: [],
            providerProfiles: [],
            sessions: [],
            runs: [],
            approvals: [],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/runs/run_1/events')) {
        return new Response(JSON.stringify({ events: [{ type: 'run.started', runId: 'run_1' }] }), {
          status: 200,
        })
      }
      if (url.endsWith('/runs/start')) {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ run: { runId: 'run_1', sessionId: 'session_1' } }), {
          status: 202,
        })
      }
      if (url.includes('/approvals/approval_1/resolve')) {
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ approvalId: 'approval_1', status: 'approved' }), {
          status: 200,
        })
      }
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            mode: 'local-gateway-dev',
            health: { ok: true, running: true, activeSessions: 1 },
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const client = createLocalGatewayClient('http://127.0.0.1:8787', fetchImpl as typeof fetch)

    await expect(client.health()).resolves.toMatchObject({ mode: 'local-gateway-dev' })
    await expect(client.snapshot()).resolves.toMatchObject({ counts: { clients: 1 } })
    await expect(
      client.startRun({
        sessionId: 'session_1',
        input: 'Run now',
        mode: 'chat',
        allowedTools: ['file.read'],
      }),
    ).resolves.toMatchObject({ run: { runId: 'run_1' } })
    await expect(client.runEvents({ sessionId: 'session_1', runId: 'run_1' })).resolves.toEqual({
      events: [{ type: 'run.started', runId: 'run_1' }],
    })
    await expect(
      client.resolveApproval({
        approvalId: 'approval_1',
        sessionId: 'session_1',
        runId: 'run_1',
        decision: 'approved',
      }),
    ).resolves.toMatchObject({ status: 'approved' })
  })
})
