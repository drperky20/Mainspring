import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MockProvider } from '../../providers/MockProvider.js'
import { createMainspring } from '../../sdk/Mainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from '../index.js'
import { createLocalGatewayServer } from './createLocalGatewayServer.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    removeTempRoot(root)
  }
  tempRoots.length = 0
})

function removeTempRoot(root: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        attempt === 4 ||
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

function makeTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

describe('LocalGatewayHttpServer', () => {
  it('serves sanitized health and snapshot routes for browser clients', async () => {
    const root = makeTempRoot('mainspring-gateway-server-snapshot-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new MockProvider([{ type: 'result', text: 'ok' }]),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    await mainspring.start()
    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(workspaceRoot, 'northline'),
      })
      appState.agents.create({
        workspaceId: workspace.workspaceId,
        name: 'Front desk assistant',
        version: '1.0.0',
        defaultModelId: 'openrouter/free',
      })
      appState.providerProfiles.create({
        providerId: 'openrouter',
        label: 'OpenRouter',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
      })
      mainspring.sessions.create({
        sessionId: 'gateway-dev-session',
        workspace: { root: path.join(workspaceRoot, 'northline') },
      })

      const started = await server.start()
      const health = await fetch(`${started.url}/health`).then((response) => response.json())
      const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())

      expect(health).toMatchObject({
        mode: 'local-gateway-dev',
        health: { ok: true, running: true, activeSessions: 1 },
      })
      expect(snapshot).toMatchObject({
        counts: {
          clients: 1,
          workspaces: 1,
          agents: 1,
          providerProfiles: 1,
          sessions: 1,
        },
      })
      expect(JSON.stringify(snapshot)).not.toContain('secretRef')
      expect(JSON.stringify(snapshot)).not.toContain('workspaceRoot')
      expect(JSON.stringify(snapshot)).not.toContain('sessionPath')

      await server.stop()
    } finally {
      appState.close()
      await mainspring.stop()
    }
  })

  it('routes run start requests and exposes normalized events', async () => {
    const starts: unknown[] = []
    const gateway = {
      snapshot: () => ({
        generatedAt: '2026-06-27T00:00:00.000Z',
        health: { ok: true, running: true, activeSessions: 1 },
        appState: {
          clients: [],
          workspaces: [],
          agents: [],
          providerProfiles: [],
          runs: [],
        },
        sessions: [],
        runs: [
          {
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'waiting_approval',
            eventCount: 1,
            pendingInboundCount: 0,
          },
        ],
        approvals: [
          {
            approvalId: 'approval_1',
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'pending',
            requestedAt: '2026-06-27T00:00:01.000Z',
          },
        ],
      }),
      sessions: { list: () => [] },
      runs: {
        start: (input: unknown) => {
          starts.push({ kind: 'direct', input })
          return { runId: 'run_1', sessionId: 'session_1' }
        },
        startFromAppState: (input: unknown) => {
          starts.push({ kind: 'appState', input })
          return { runId: 'run_1', sessionId: 'session_1' }
        },
      },
      events: {
        list: () => [
          {
            type: 'approval.requested',
            runId: 'run_1',
            sessionId: 'session_1',
            timestamp: '2026-06-27T00:00:01.000Z',
            seq: 1,
            payload: { approvalId: 'approval_1', targetKey: 'file.write' },
          },
        ],
      },
      approvals: { list: () => [], approve: () => undefined, deny: () => undefined },
    } as unknown as ReturnType<typeof createLocalMainspringGateway>
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const startRun = await fetch(`${started.url}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_1',
          input: 'Write through the HTTP gateway.',
          mode: 'chat',
          allowedTools: ['file.write'],
          workspaceId: 'workspace_1',
          agentId: 'agent_1',
          providerProfileId: 'profile_1',
        }),
      }).then((response) => response.json())

      expect(startRun).toMatchObject({ run: { runId: 'run_1', sessionId: 'session_1' } })
      expect(starts).toEqual([
        {
          kind: 'appState',
          input: {
            sessionId: 'session_1',
            input: 'Write through the HTTP gateway.',
            mode: 'chat',
            allowedTools: ['file.write'],
            workspaceId: 'workspace_1',
            agentId: 'agent_1',
            providerProfileId: 'profile_1',
          },
        },
      ])

      const approvals = await fetch(`${started.url}/approvals`).then((response) => response.json())
      expect(approvals.approvals[0]).toMatchObject({
        approvalId: 'approval_1',
        runId: 'run_1',
      })

      const runEvents = await fetch(
        `${started.url}/runs/${encodeURIComponent('run_1')}/events?sessionId=${encodeURIComponent('session_1')}`,
      ).then((response) => response.json())
      expect(runEvents.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'approval.requested' })]),
      )
    } finally {
      await server.stop()
    }
  })

  it('routes approval resolution requests into the existing approval path and rejects malformed bodies', async () => {
    const approvals: unknown[] = []
    const denied: unknown[] = []
    const gateway = {
      snapshot: () => ({
        generatedAt: '2026-06-27T00:00:00.000Z',
        health: { ok: true, running: true, activeSessions: 0 },
        appState: {
          clients: [],
          workspaces: [],
          agents: [],
          providerProfiles: [],
          runs: [],
        },
        sessions: [],
        runs: [],
        approvals: [],
      }),
      sessions: { list: () => [] },
      runs: {
        start: () => ({ runId: 'run_1', sessionId: 'session_1' }),
        startFromAppState: () => ({ runId: 'run_1', sessionId: 'session_1' }),
      },
      events: { list: () => [{ type: 'run.started', runId: 'run_1', sessionId: 'session_1' }] },
      approvals: {
        list: () => [],
        approve: (input: unknown) => approvals.push(input),
        deny: (input: unknown) => denied.push(input),
      },
    } as unknown as ReturnType<typeof createLocalMainspringGateway>
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const approved = await fetch(`${started.url}/approvals/approval_1/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_1',
          runId: 'run_1',
          decision: 'approved',
          reason: 'approved in route test',
        }),
      }).then((response) => response.json())
      expect(approved).toMatchObject({ approvalId: 'approval_1', status: 'approved' })
      expect(approvals).toEqual([
        {
          sessionId: 'session_1',
          runId: 'run_1',
          approvalId: 'approval_1',
          reason: 'approved in route test',
        },
      ])

      const deniedResponse = await fetch(`${started.url}/approvals/approval_2/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_1',
          runId: 'run_1',
          decision: 'denied',
        }),
      }).then((response) => response.json())
      expect(deniedResponse).toMatchObject({ approvalId: 'approval_2', status: 'denied' })
      expect(denied).toEqual([
        {
          sessionId: 'session_1',
          runId: 'run_1',
          approvalId: 'approval_2',
        },
      ])

      const malformed = await fetch(`${started.url}/approvals/approval_3/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: '',
          runId: 'run_1',
          decision: 'approved',
        }),
      })
      expect(malformed.status).toBe(400)
      expect(await malformed.json()).toMatchObject({
        error: expect.stringContaining('Too small'),
      })
    } finally {
      await server.stop()
    }
  })
})
