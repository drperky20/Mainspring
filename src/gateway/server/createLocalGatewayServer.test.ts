import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MockProvider } from '../../providers/MockProvider.js'
import type { AgentProvider, AgentQuery, QueryInput } from '../../providers/types.js'
import {
  scanMemoryMutation,
  stageProvenanceReview,
} from '../../provenance/ProvenanceReview.js'
import { createMainspring } from '../../sdk/Mainspring.js'
import { createRunLogMainspring } from '../../sdk/RunLogMainspring.js'
import { executionBackendCapabilities } from '../../tools/ExecutionBackend.js'
import { builtinManifest, type RuntimeTool } from '../../tools/ToolRegistry.js'
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
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        attempt === 29 ||
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
}

function makeTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function approvalTool(executions: { count: number }): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'tool.reviewed',
      name: 'Reviewed Tool',
      description: 'Requires approval before execution.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input }) => {
      executions.count += 1
      return { ok: true, input, executions: executions.count }
    },
  }
}

async function waitFor<T>(predicate: () => T | Promise<T>, label: string): Promise<T> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

function fileContains(root: string, needle: string): string | null {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      stack.push(...fs.readdirSync(current).map((entry) => path.join(current, entry)))
      continue
    }
    if (stat.isFile() && fs.readFileSync(current).includes(Buffer.from(needle))) {
      return current
    }
  }
  return null
}

class ManagedSecretRecordingProvider implements AgentProvider {
  readonly resolvedSecrets: Array<string | undefined> = []
  readonly credentialRefs: Array<QueryInput['credentialRef']> = []

  query(input: QueryInput): AgentQuery {
    this.credentialRefs.push(input.credentialRef)
    this.resolvedSecrets.push(
      input.credentialRef ? input.resolveCredential?.(input.credentialRef) : undefined,
    )
    return {
      push() {},
      end() {},
      abort() {},
      events: (async function* () {
        yield {
          type: 'init' as const,
          provider: input.providerId,
          providerSessionId: 'provider_http_managed_secret_check',
          modelId: input.model,
          providerTransport: 'managed-secret-http-check',
        }
        yield { type: 'result' as const, text: 'managed secret resolved through HTTP' }
      })(),
    }
  }
}

function testCellBackendOptions() {
  return {
    inspectBackends: () => ({
      defaultBackend: 'host' as const,
      backends: [
        {
          key: 'host' as const,
          label: 'Host shell',
          available: true,
          unsafe: true,
          capabilities: executionBackendCapabilities('host'),
          reason: 'Host process execution is available but not isolated.',
        },
        {
          key: 'wsl' as const,
          label: 'WSL bash',
          available: false,
          unsafe: false,
          capabilities: executionBackendCapabilities('wsl'),
          reason: 'WSL not available in HTTP route tests.',
        },
        {
          key: 'docker' as const,
          label: 'Docker Linux container',
          available: false,
          unsafe: false,
          capabilities: executionBackendCapabilities('docker'),
          reason: 'Docker not available in HTTP route tests.',
        },
      ],
    }),
  }
}

describe('LocalGatewayHttpServer', () => {
  it('keeps managed provider secrets write-only while HTTP-created profiles drive runtime provider resolution', async () => {
    const root = makeTempRoot('mainspring-gateway-server-secret-http-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const provider = new ManagedSecretRecordingProvider()
    const managedSecretValue = 'sk-managed-secret-http-value'
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      secretResolver: (ref) => appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: testCellBackendOptions(),
    })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    await mainspring.start()
    try {
      const started = await server.start()
      const createdClient = await fetch(`${started.url}/clients`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Secret HTTP Client',
          workspaceName: 'Secret HTTP Workspace',
          workspaceRoot,
        }),
      }).then((response) => response.json())
      const sessionId = createdClient.session.sessionId as string
      const workspaceId = createdClient.workspace.workspaceId as string

      const createdProfile = await fetch(`${started.url}/provider-profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'default',
          label: 'HTTP Managed Secret',
          defaultModelId: 'managed-secret-http-model',
          secretValue: managedSecretValue,
        }),
      }).then((response) => response.json())
      const providerProfileId = createdProfile.providerProfile.profileId as string
      const persistedProfile = appState.providerProfiles.get(providerProfileId)

      expect(persistedProfile).toMatchObject({
        profileId: providerProfileId,
        secretRef: `managed:${providerProfileId}`,
        managedSecretStored: true,
      })
      expect(appState.resolveSecretRef(`managed:${providerProfileId}`)).toBe(managedSecretValue)

      const startedRun = await fetch(`${started.url}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          workspaceId,
          providerProfileId,
          input: 'Resolve the HTTP-created managed provider credential.',
          mode: 'chat',
          allowedTools: [],
        }),
      }).then((response) => response.json())
      const runId = startedRun.run.runId as string

      await waitFor(async () => {
        const runs = await fetch(
          `${started.url}/runs?sessionId=${encodeURIComponent(sessionId)}`,
        ).then((response) => response.json())
        return runs.runs.find(
          (run: { runId: string; status: string }) =>
            run.runId === runId && run.status === 'completed',
        )
      }, 'HTTP managed secret run completion')

      const runEvents = await fetch(
        `${started.url}/runs/${encodeURIComponent(runId)}/events?sessionId=${encodeURIComponent(sessionId)}&limit=100`,
      ).then((response) => response.json())
      const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())
      const serializedHttp = JSON.stringify({
        createdClient,
        createdProfile,
        startedRun,
        runEvents,
        snapshot,
      })

      expect(provider.resolvedSecrets).toEqual([managedSecretValue])
      expect(provider.credentialRefs).toEqual([{ kind: 'managed', key: providerProfileId }])
      expect(runEvents.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'run.completed' })]),
      )
      expect(serializedHttp).not.toContain(managedSecretValue)
      expect(serializedHttp).not.toContain('secretRef')
      expect(fileContains(root, managedSecretValue)).toBeNull()

    } finally {
      await server.stop()
      appState.close()
      await mainspring.stop()
    }
  }, 60_000)

  it('resolves managed provider profile secrets for RunLog-backed default HTTP starts without response leakage', async () => {
    const root = makeTempRoot('mainspring-gateway-server-runlog-secret-http-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const provider = new ManagedSecretRecordingProvider()
    const managedSecretValue = 'sk-runlog-managed-secret-http-value'
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      secretResolver: (ref) => appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
      pollIntervalMs: 10,
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider,
      defaultProviderId: 'default',
      agent: {
        agentId: 'gateway-runlog-secret-agent',
        instructions: 'Resolve managed provider profile credentials through RunLog.',
        providerId: 'default',
        capabilities: ['provider'],
      },
      secretResolver: (ref) => appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
      approvalReceiptKey: 'gateway-runlog-managed-secret-test-key',
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      runLog,
      appState,
      cells: testCellBackendOptions(),
    })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    await mainspring.start()
    try {
      const started = await server.start()
      const createdClient = await fetch(`${started.url}/clients`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'RunLog Secret HTTP Client',
          workspaceName: 'RunLog Secret HTTP Workspace',
          workspaceRoot,
        }),
      }).then((response) => response.json())
      const sessionId = createdClient.session.sessionId as string
      const workspaceId = createdClient.workspace.workspaceId as string

      const createdProfile = await fetch(`${started.url}/provider-profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'default',
          label: 'RunLog HTTP Managed Secret',
          defaultModelId: 'runlog-managed-secret-http-model',
          secretValue: managedSecretValue,
        }),
      }).then((response) => response.json())
      const providerProfileId = createdProfile.providerProfile.profileId as string

      const startedRun = await fetch(`${started.url}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          workspaceId,
          providerProfileId,
          input: 'Resolve the RunLog managed provider credential.',
          mode: 'chat',
          allowedTools: [],
        }),
      }).then((response) => response.json())
      const runId = startedRun.run.runId as string

      const runLogProjection = await waitFor(async () => {
        const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())
        return snapshot.runLog?.runs?.find(
          (run: { runId: string; status: string }) =>
            run.runId === runId && run.status === 'completed',
        )
      }, 'RunLog HTTP managed secret run completion')
      const runLogEvents = await fetch(
        `${started.url}/runlog/runs/${encodeURIComponent(runId)}/events?limit=100`,
      ).then((response) => response.json())
      const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())
      const serializedHttp = JSON.stringify({
        createdClient,
        createdProfile,
        startedRun,
        runLogProjection,
        runLogEvents,
        snapshot,
      })

      expect(provider.resolvedSecrets).toEqual([managedSecretValue])
      expect(provider.credentialRefs).toEqual([{ kind: 'managed', key: providerProfileId }])
      expect(runLog.store.getRun(runId)?.credentialRef).toBe(`managed:${providerProfileId}`)
      expect(runLogEvents.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'run.completed' })]),
      )
      expect(serializedHttp).not.toContain(managedSecretValue)
      expect(serializedHttp).not.toContain('secretRef')
      expect(fileContains(root, managedSecretValue)).toBeNull()
    } finally {
      await server.stop()
      runLog.close()
      appState.close()
      await mainspring.stop()
    }
  }, 60_000)

  it('protects hosted routes with bootstrapped auth and revocable sessions', async () => {
    const root = makeTempRoot('mainspring-gateway-server-hosted-auth-')
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
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: testCellBackendOptions(),
    })
    const server = createLocalGatewayServer({
      gateway,
      host: '127.0.0.1',
      port: 0,
      auth: { mode: 'hosted' },
    })

    await mainspring.start()
    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(workspaceRoot, 'northline'),
      })
      const artifactPath = path.join(root, 'artifacts', 'northline-report.md')
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
      fs.writeFileSync(artifactPath, '# hosted auth report\n')
      appState.artifacts.create({
        artifactId: 'artifact_report',
        runId: 'run_report',
        sessionId: 'gateway-hosted-session',
        workspaceId: workspace.workspaceId,
        kind: 'report',
        label: 'northline-report',
        path: artifactPath,
        mediaType: 'text/markdown',
      })
      mainspring.sessions.create({
        sessionId: 'gateway-hosted-session',
        workspace: { root: path.join(workspaceRoot, 'northline') },
      })
      appState.runs.upsert({
        runId: 'run_report',
        sessionId: 'gateway-hosted-session',
        workspaceId: workspace.workspaceId,
      })

      const started = await server.start()
      const hostedHealth = await fetch(`${started.url}/health`).then((response) => response.json())
      const unauthorizedSnapshot = await fetch(`${started.url}/snapshot`)
      const hostileOriginBootstrap = await fetch(`${started.url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ username: 'Mallory', password: 'NorthlinePass123' }),
      })
      const hostileOriginPreflight = await fetch(`${started.url}/auth/login`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      })
      const bootstrapResponse = await fetch(`${started.url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
        body: JSON.stringify({ username: 'Admin', password: 'NorthlinePass123' }),
      })
      const bootstrapBody = await bootstrapResponse.json()
      const loginResponse = await fetch(`${started.url}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ username: 'Admin', password: 'NorthlinePass123' }),
      })
      const loginBody = await loginResponse.json()
      const sessionToken = loginResponse.headers.get('x-mainspring-auth-token')
      const authorizedSnapshot = await fetch(`${started.url}/snapshot`, {
        headers: { authorization: `Bearer ${sessionToken}` },
      })
      const authorizedSnapshotBody = await authorizedSnapshot.json()
      const queryTokenSnapshot = await fetch(
        `${started.url}/snapshot?sessionToken=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const queryTokenArtifact = await fetch(
        `${started.url}/artifacts/artifact_report?sessionToken=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const unauthorizedBrowserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'artifact', artifactId: 'artifact_report' }),
      })
      const browserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'artifact', artifactId: 'artifact_report' }),
      })
      const browserAccessBody = await browserAccess.json()
      const missingArtifactBrowserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'artifact', artifactId: 'missing_artifact' }),
      })
      const missingArtifactBrowserAccessBody = await missingArtifactBrowserAccess.json()
      const streamBrowserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'event-stream',
          sessionId: 'gateway-hosted-session',
          runId: 'run_report',
        }),
      })
      const streamBrowserAccessBody = await streamBrowserAccess.json()
      const missingStreamSessionBrowserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'event-stream', sessionId: 'missing_session' }),
      })
      const missingStreamSessionBrowserAccessBody = await missingStreamSessionBrowserAccess.json()
      const missingStreamRunBrowserAccess = await fetch(`${started.url}/auth/browser-access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'event-stream',
          sessionId: 'gateway-hosted-session',
          runId: 'missing_run',
        }),
      })
      const missingStreamRunBrowserAccessBody = await missingStreamRunBrowserAccess.json()
      const authorizedArtifact = await fetch(
        browserAccessBody.url,
      )
      const authorizedArtifactBody = await authorizedArtifact.text()
      const leakyArtifactTicket = await fetch(
        `${browserAccessBody.url}&sessionToken=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const hyphenLeakyArtifactTicket = await fetch(
        `${browserAccessBody.url}&session-token=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const leakyStreamTicket = await fetch(
        `${streamBrowserAccessBody.url}&access_token=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const oauthLeakyStreamTicket = await fetch(
        `${streamBrowserAccessBody.url}&oauth-token=${encodeURIComponent(sessionToken ?? '')}`,
      )
      const wrongArtifactTicket = await fetch(
        String(browserAccessBody.url).replace('/artifacts/artifact_report', '/artifacts/other_report'),
      )
      const authSession = await fetch(`${started.url}/auth/session`, {
        headers: { authorization: `Bearer ${sessionToken}` },
      }).then((response) => response.json())
      const logoutResponse = await fetch(`${started.url}/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sessionToken}` },
      })
      const postLogoutSnapshot = await fetch(`${started.url}/snapshot`, {
        headers: { authorization: `Bearer ${sessionToken}` },
      })

      expect(hostedHealth).toMatchObject({
        mode: 'local-gateway-hosted',
        health: { ok: true, running: true, activeSessions: 1 },
        auth: {
          authMode: 'hosted',
          authenticated: false,
          bootstrapRequired: true,
        },
      })
      expect(JSON.stringify(hostedHealth)).not.toContain('sessionsRoot')
      expect(JSON.stringify(hostedHealth)).not.toContain('lastTickAt')
      expect(JSON.stringify(hostedHealth)).not.toContain(workspaceRoot)
      expect(unauthorizedSnapshot.status).toBe(401)
      expect(hostileOriginBootstrap.status).toBe(403)
      expect(hostileOriginBootstrap.headers.get('access-control-allow-origin')).toBeNull()
      expect(hostileOriginPreflight.status).toBe(403)
      expect(hostileOriginPreflight.headers.get('access-control-allow-origin')).toBeNull()
      expect(bootstrapResponse.status).toBe(201)
      expect(bootstrapResponse.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
      expect(bootstrapBody).toMatchObject({
        user: {
          username: 'admin',
          role: 'admin',
        },
      })
      expect(loginResponse.status).toBe(200)
      expect(loginResponse.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(loginBody).toMatchObject({
        user: {
          username: 'admin',
          role: 'admin',
        },
      })
      expect(loginBody).not.toHaveProperty('sessionToken')
      expect(sessionToken).toMatch(/^[a-f0-9]{64}$/)
      expect(authorizedSnapshot.status).toBe(200)
      expect(authorizedSnapshotBody.counts.clients).toBe(1)
      expect(queryTokenSnapshot.status).toBe(401)
      expect(queryTokenArtifact.status).toBe(401)
      expect(unauthorizedBrowserAccess.status).toBe(401)
      expect(browserAccess.status).toBe(201)
      expect(browserAccessBody.kind).toBe('artifact')
      expect(browserAccessBody.url).toContain('/artifacts/artifact_report?ticket=')
      expect(browserAccessBody.url).not.toContain(sessionToken)
      expect(missingArtifactBrowserAccess.status).toBe(404)
      expect(missingArtifactBrowserAccessBody).toEqual({ error: 'Unknown artifact: missing_artifact' })
      expect(JSON.stringify(missingArtifactBrowserAccessBody)).not.toContain('ticket')
      expect(streamBrowserAccess.status).toBe(201)
      expect(streamBrowserAccessBody.kind).toBe('event-stream')
      expect(streamBrowserAccessBody.url).toContain('/events/stream?sessionId=gateway-hosted-session')
      expect(streamBrowserAccessBody.url).toContain('runId=run_report')
      expect(streamBrowserAccessBody.url).toContain('ticket=')
      expect(streamBrowserAccessBody.url).not.toContain(sessionToken)
      expect(missingStreamSessionBrowserAccess.status).toBe(404)
      expect(missingStreamSessionBrowserAccessBody).toEqual({ error: 'Unknown session: missing_session' })
      expect(JSON.stringify(missingStreamSessionBrowserAccessBody)).not.toContain('ticket')
      expect(missingStreamRunBrowserAccess.status).toBe(404)
      expect(missingStreamRunBrowserAccessBody).toEqual({ error: 'Unknown run: missing_run' })
      expect(JSON.stringify(missingStreamRunBrowserAccessBody)).not.toContain('ticket')
      expect(authorizedArtifact.status).toBe(200)
      expect(authorizedArtifactBody).toContain('# hosted auth report')
      expect(leakyArtifactTicket.status).toBe(401)
      expect(hyphenLeakyArtifactTicket.status).toBe(401)
      expect(leakyStreamTicket.status).toBe(401)
      expect(oauthLeakyStreamTicket.status).toBe(401)
      expect(wrongArtifactTicket.status).toBe(401)
      expect(authSession).toMatchObject({
        auth: {
          authMode: 'hosted',
          authenticated: true,
          bootstrapRequired: false,
          user: {
            username: 'admin',
            role: 'admin',
          },
        },
      })
      expect(logoutResponse.status).toBe(200)
      expect(postLogoutSnapshot.status).toBe(401)

      await server.stop()
    } finally {
      appState.close()
      await mainspring.stop()
    }
  }, 30_000)

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
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: testCellBackendOptions(),
    })
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
      const artifactPath = path.join(root, 'artifacts', 'northline-report.md')
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
      fs.writeFileSync(artifactPath, '# report\n')
      appState.artifacts.create({
        artifactId: 'artifact_report',
        runId: 'run_report',
        sessionId: 'gateway-dev-session',
        workspaceId: workspace.workspaceId,
        kind: 'report artifactPath=C:\\secret\\artifact-kind.md',
        label: 'northline-report',
        path: artifactPath,
        mediaType: 'text/markdown',
      })
      appState.toolCalls.upsert({
        toolCallId: 'tool_call_report',
        runId: 'run_report',
        sessionId: 'gateway-dev-session',
        workspaceId: workspace.workspaceId,
        toolName: 'browser.screenshot filePath=C:\\secret\\tool-name.txt',
        status: 'completed',
      })
      const deploymentTarget = appState.deploymentTargets.create({
        workspaceId: workspace.workspaceId,
        label: 'Northline staging VPS',
        kind: 'vps',
      })
      appState.deploymentRuns.upsert({
        deploymentRunId: 'deployment_run_report',
        targetId: deploymentTarget.targetId,
        runId: 'run_report',
        sessionId: 'gateway-dev-session',
        status: 'succeeded',
      })
      const cell = appState.cells.create({
        workspaceId: workspace.workspaceId,
        label: 'Northline local cell workspaceRoot=E:/Mainspring/cell-label',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash filePath=C:\\secret\\cell-backend-label.txt',
          backendUnsafe: false,
          backendCapabilities: {
            ...executionBackendCapabilities('wsl'),
            networkPolicy: 'host-inherited databasePath=/var/lib/mainspring/cell.sqlite',
            limits: ['Does not disable network access. filePath=C:\\secret\\cell-limit.txt'],
            secretPath: 'C:\\secret\\backend',
          },
        },
      })
      appState.cellLeases.upsert({
        leaseId: 'cell_lease_report',
        cellId: cell.cellId,
        runId: 'run_report',
        sessionId: 'gateway-dev-session',
        status: 'active',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash filePath=C:\\secret\\lease-backend-label.txt',
          backendUnsafe: false,
          backendCapabilities: {
            ...executionBackendCapabilities('wsl'),
            networkPolicy: 'host-inherited filePath=C:\\secret\\lease-network.txt',
          },
        },
      })
      appState.cellSnapshots.create({
        snapshotId: 'cell_snapshot_report',
        cellId: cell.cellId,
        leaseId: 'cell_lease_report',
        label: 'Post-login snapshot artifactPath=C:\\secret\\cells\\snap.png',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash filePath=C:\\secret\\snapshot-backend-label.txt',
          backendCapabilities: {
            ...executionBackendCapabilities('wsl'),
            networkPolicy: 'host-inherited filePath=C:\\secret\\snapshot-network.txt',
          },
        },
      })
      appState.cronSchedules.create({
        scheduleId: 'schedule_report',
        sessionId: 'gateway-dev-session',
        workspaceId: workspace.workspaceId,
        computerId: 'computer_wsl',
        label: 'Daily report',
        prompt: 'Build the morning report.',
        cronExpr: '0 9 * * 1',
        allowedTools: ['file.write'],
        nextRunAt: '2026-06-30T14:00:00.000Z',
      })
      appState.budgets.create({
        budgetId: 'budget_report',
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Northline workspace budget',
        maxEstimatedCostUsd: 10,
        warnAtUsd: 8,
      })
      appState.usageLedger.create({
        entryId: 'usage_report',
        runId: 'run_report',
        sessionId: 'gateway-dev-session',
        workspaceId: workspace.workspaceId,
        estimatedCostUsd: 8.5,
      })
      mainspring.sessions.create({
        sessionId: 'gateway-dev-session',
        workspace: { root: path.join(workspaceRoot, 'northline') },
      })

      const started = await server.start()
      const health = await fetch(`${started.url}/health`).then((response) => response.json())
      const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())
      const sessions = await fetch(`${started.url}/sessions`).then((response) => response.json())
      const toolCalls = await fetch(
        `${started.url}/tool-calls?workspaceId=${encodeURIComponent(workspace.workspaceId)}`,
      ).then((response) => response.json())
      const deploymentTargets = await fetch(
        `${started.url}/deployment-targets?workspaceId=${encodeURIComponent(workspace.workspaceId)}`,
      ).then((response) => response.json())
      const deploymentRuns = await fetch(
        `${started.url}/deployment-runs?targetId=${encodeURIComponent(deploymentTarget.targetId)}`,
      ).then((response) => response.json())
      const cells = await fetch(
        `${started.url}/cells?workspaceId=${encodeURIComponent(workspace.workspaceId)}`,
      ).then((response) => response.json())
      const cellLeases = await fetch(
        `${started.url}/cell-leases?cellId=${encodeURIComponent(cell.cellId)}`,
      ).then((response) => response.json())
      const cellStatus = await fetch(`${started.url}/cells/status`).then((response) => response.json())
      const executionBackends = await fetch(`${started.url}/execution-backends/status`).then((response) => response.json())
      const cellSnapshots = await fetch(
        `${started.url}/cell-snapshots?leaseId=cell_lease_report`,
      ).then((response) => response.json())
      const cronSchedules = await fetch(`${started.url}/cron`).then((response) => response.json())
      const cronStatus = await fetch(`${started.url}/cron/status`).then((response) => response.json())
      const budgets = await fetch(`${started.url}/budgets`).then((response) => response.json())
      const budgetStatus = await fetch(`${started.url}/budgets/status`).then((response) => response.json())
      const usageStatus = await fetch(`${started.url}/usage/status`).then((response) => response.json())
      const artifactResponse = await fetch(`${started.url}/artifacts/artifact_report`)
      const artifactBody = await artifactResponse.text()
      const artifactDownloadResponse = await fetch(
        `${started.url}/artifacts/artifact_report?download=1`,
      )

      expect(health).toMatchObject({
        mode: 'local-gateway-dev',
        health: { ok: true, running: true, activeSessions: 1 },
      })
      expect(JSON.stringify(health)).not.toContain('sessionsRoot')
      expect(JSON.stringify(health)).not.toContain('lastTickAt')
      expect(JSON.stringify(health)).not.toContain(workspaceRoot)
      expect(snapshot).toMatchObject({
        counts: {
          clients: 1,
          workspaces: 1,
          agents: 1,
          providerProfiles: 1,
          sessions: 1,
        },
        toolCalls: [
          expect.objectContaining({
            toolCallId: 'tool_call_report',
            toolName: 'browser.screenshot [redacted]',
            status: 'completed',
          }),
        ],
        deploymentTargets: [
          expect.objectContaining({
            label: 'Northline staging VPS',
            kind: 'vps',
            status: 'active',
          }),
        ],
        deploymentRuns: [
          expect.objectContaining({
            deploymentRunId: 'deployment_run_report',
            status: 'succeeded',
          }),
        ],
        cells: [
          expect.objectContaining({
            label: 'Northline local cell [redacted]',
            status: 'active',
            backend: expect.objectContaining({
              backend: 'wsl',
              backendLabel: 'WSL bash [redacted]',
              backendCapabilities: expect.objectContaining({
                networkPolicy: 'host-inherited [redacted]',
                limits: ['Does not disable network access. [redacted]'],
              }),
            }),
          }),
        ],
        cellLeases: [
          expect.objectContaining({
            leaseId: 'cell_lease_report',
            status: 'active',
          }),
        ],
        cellStatus: expect.objectContaining({
          enabled: true,
          leases: expect.objectContaining({ active: 1 }),
        }),
        cellSnapshots: [
          expect.objectContaining({
            snapshotId: 'cell_snapshot_report',
            label: 'Post-login snapshot [redacted]',
            backend: expect.objectContaining({
              backend: 'wsl',
              backendLabel: 'WSL bash [redacted]',
              backendCapabilities: expect.objectContaining({
                networkPolicy: 'host-inherited [redacted]',
              }),
            }),
          }),
        ],
        cronSchedules: [
          expect.objectContaining({
            scheduleId: 'schedule_report',
            label: 'Daily report',
            cronExpr: '0 9 * * 1',
            computerId: 'computer_wsl',
          }),
        ],
        budgets: [
          expect.objectContaining({
            budgetId: 'budget_report',
            scopeType: 'workspace',
            scopeId: workspace.workspaceId,
          }),
        ],
      })
      expect(JSON.stringify(snapshot)).not.toContain('secretRef')
      expect(JSON.stringify(snapshot)).not.toContain('workspaceRoot')
      expect(JSON.stringify(snapshot)).not.toContain('sessionPath')
      expect(JSON.stringify(snapshot)).not.toContain('artifactPath')
      expect(JSON.stringify(snapshot)).not.toContain('filePath')
      expect(JSON.stringify(snapshot)).not.toContain('databasePath')
      expect(JSON.stringify(snapshot)).not.toContain('cell-label')
      expect(JSON.stringify(snapshot)).not.toContain('cell-limit')
      expect(JSON.stringify(snapshot)).not.toContain('artifact-kind')
      expect(JSON.stringify(snapshot)).not.toContain('tool-name')
      expect(sessions).toEqual({
        sessions: [
          expect.objectContaining({
            sessionId: 'gateway-dev-session',
            status: 'open',
          }),
        ],
      })
      expect(JSON.stringify(sessions)).not.toContain('workspaceRoot')
      expect(JSON.stringify(sessions)).not.toContain('sessionPath')
      expect(JSON.stringify(sessions)).not.toContain(workspaceRoot)
      expect(toolCalls).toEqual({
        toolCalls: [
          expect.objectContaining({
            toolCallId: 'tool_call_report',
            workspaceId: workspace.workspaceId,
            toolName: 'browser.screenshot [redacted]',
          }),
        ],
      })
      expect(JSON.stringify(toolCalls)).not.toContain('filePath')
      expect(JSON.stringify(toolCalls)).not.toContain('tool-name')
      expect(JSON.stringify(toolCalls)).not.toContain('C:\\secret')
      expect(deploymentTargets).toEqual({
        deploymentTargets: [
          expect.objectContaining({
            targetId: deploymentTarget.targetId,
            workspaceId: workspace.workspaceId,
          }),
        ],
      })
      expect(deploymentRuns).toEqual({
        deploymentRuns: [
          expect.objectContaining({
            deploymentRunId: 'deployment_run_report',
            targetId: deploymentTarget.targetId,
          }),
        ],
      })
      expect(cells).toEqual({
        cells: [
          expect.objectContaining({
            cellId: cell.cellId,
            workspaceId: workspace.workspaceId,
          }),
        ],
      })
      expect(cellLeases).toEqual({
        cellLeases: [
          expect.objectContaining({
            leaseId: 'cell_lease_report',
            cellId: cell.cellId,
          }),
        ],
      })
      expect(cellStatus).toEqual({
        cellStatus: expect.objectContaining({
          enabled: true,
          leases: expect.objectContaining({ active: 1 }),
          cellStatuses: expect.arrayContaining([
            expect.objectContaining({ cellId: cell.cellId, activeLeases: 1 }),
          ]),
        }),
      })
      expect(JSON.stringify(cellStatus)).not.toContain('secretRef')
      expect(JSON.stringify(cellStatus)).not.toContain('workspaceRoot')
      expect(JSON.stringify(cellStatus)).not.toContain('sessionPath')
      expect(JSON.stringify(cellStatus)).not.toContain(workspaceRoot)
      expect(executionBackends).toEqual({
        executionBackends: expect.objectContaining({
          defaultBackend: 'host',
          backends: expect.arrayContaining([
            expect.objectContaining({
              key: 'wsl',
              observedCells: 1,
              activeLeases: 1,
              capabilities: expect.objectContaining({
                isolationKind: 'wsl-distro',
                networkPolicy: 'host-inherited',
              }),
              latestCell: expect.objectContaining({ cellId: cell.cellId }),
              latestLease: expect.objectContaining({ leaseId: 'cell_lease_report' }),
              latestSnapshot: expect.objectContaining({ snapshotId: 'cell_snapshot_report' }),
            }),
          ]),
        }),
      })
      expect(JSON.stringify(executionBackends)).not.toContain('verificationCommand')
      expect(JSON.stringify(executionBackends)).not.toContain('C:\\secret')
      expect(cellSnapshots).toEqual({
        cellSnapshots: [
          expect.objectContaining({
            snapshotId: 'cell_snapshot_report',
            leaseId: 'cell_lease_report',
            label: 'Post-login snapshot [redacted]',
          }),
        ],
      })
      expect(JSON.stringify(cellSnapshots)).not.toContain('artifactPath')
      expect(JSON.stringify(cellSnapshots)).not.toContain('filePath')
      expect(JSON.stringify(cellSnapshots)).not.toContain('C:\\secret')
      expect(cronSchedules).toEqual({
        cronSchedules: [
          expect.objectContaining({
            scheduleId: 'schedule_report',
            sessionId: 'gateway-dev-session',
            computerId: 'computer_wsl',
          }),
        ],
      })
      expect(cronStatus).toEqual({
        cron: expect.objectContaining({
          enabled: false,
          running: false,
          pollIntervalMs: 30000,
        }),
      })
      expect(JSON.stringify(cronStatus)).not.toContain('workspaceRoot')
      expect(JSON.stringify(cronStatus)).not.toContain('sessionPath')
      expect(JSON.stringify(cronStatus)).not.toContain(workspaceRoot)
      expect(budgets).toEqual({
        budgets: [
          expect.objectContaining({
            budgetId: 'budget_report',
            scopeType: 'workspace',
          }),
        ],
      })
      expect(budgetStatus).toEqual({
        budgetStatus: expect.objectContaining({
          blocked: 0,
          warnings: 1,
          usageStatus: expect.objectContaining({
            estimatedCostUsd: 8.5,
            pricedEntries: 1,
            unpricedEntries: 0,
          }),
          evaluations: [
            expect.objectContaining({
              budgetId: 'budget_report',
              status: 'warn',
            }),
          ],
        }),
      })
      expect(JSON.stringify(budgetStatus)).not.toContain('secretRef')
      expect(JSON.stringify(budgetStatus)).not.toContain('workspaceRoot')
      expect(JSON.stringify(budgetStatus)).not.toContain(workspaceRoot)
      expect(usageStatus).toEqual({
        usageStatus: expect.objectContaining({
          estimatedCostUsd: 8.5,
          pricedEntries: 1,
          unpricedEntries: 0,
          total: expect.objectContaining({
            summary: expect.objectContaining({
              entries: 1,
              estimatedCostUsd: 8.5,
            }),
          }),
        }),
      })
      expect(JSON.stringify(usageStatus)).not.toContain('secretRef')
      expect(JSON.stringify(usageStatus)).not.toContain('workspaceRoot')
      expect(JSON.stringify(usageStatus)).not.toContain(workspaceRoot)
      expect(artifactResponse.status).toBe(200)
      expect(artifactResponse.headers.get('content-type')).toContain('text/markdown')
      expect(artifactResponse.headers.get('content-disposition')).toContain('inline; filename="northline-report.md"')
      expect(artifactBody).toContain('# report')
      expect(artifactDownloadResponse.status).toBe(200)
      expect(artifactDownloadResponse.headers.get('content-disposition')).toContain(
        'attachment; filename="northline-report.md"',
      )

      await server.stop()
    } finally {
      appState.close()
      await mainspring.stop()
    }
  }, 60_000)

  it('routes run start requests and exposes normalized events', async () => {
    const starts: unknown[] = []
    const createdClients: unknown[] = []
    const createdWorkspaces: unknown[] = []
    const deletedClients: unknown[] = []
    const deletedWorkspaces: unknown[] = []
    const updatedClients: unknown[] = []
    const createdAgents: unknown[] = []
    const updatedAgents: unknown[] = []
    const createdProviderProfiles: unknown[] = []
    const updatedProviderProfiles: unknown[] = []
    const createdCronSchedules: unknown[] = []
    const updatedCronSchedules: unknown[] = []
    const createdBudgets: unknown[] = []
    const updatedBudgets: unknown[] = []
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
          approvals: [],
          artifacts: [],
          cronSchedules: [],
          budgets: [],
          usageLedger: [],
          auditEvents: [],
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
        cron: { enabled: false, running: false, pollIntervalMs: 30000 },
        budgetStatus: { evaluations: [], blocked: 0, warnings: 0 },
      }),
      sessions: { list: () => [] },
      clients: {
        create: (input: unknown) => {
          createdClients.push(input)
          return {
            client: { clientId: 'client_1', name: 'Northline Dental workspaceRoot=E:/hidden-client', status: 'active' },
            workspace: {
              workspaceId: 'workspace_1',
              clientId: 'client_1',
              name: 'Northline Workspace filePath=/srv/hidden-workspace',
              status: 'active',
            },
            session: {
              sessionId: 'session_1',
              status: 'open',
              workspaceRoot: 'E:/hidden',
              sessionPath: 'E:/hidden/session.sqlite',
              createdAt: '2026-06-27T00:00:00.000Z',
              updatedAt: '2026-06-27T00:00:00.000Z',
              metadata: { clientId: 'client_1', workspaceId: 'workspace_1' },
            },
          }
        },
        update: (input: unknown) => {
          updatedClients.push(input)
          return {
            client: { clientId: 'client_1', name: 'Northline Dental Group databasePath=/var/lib/mainspring/gateway.sqlite', status: 'archived' },
            workspace: {
              workspaceId: 'workspace_1',
              clientId: 'client_1',
              name: 'Northline Operations artifactPath=C:\\secret\\workspace.md',
              status: 'archived',
            },
          }
        },
        delete: (clientId: unknown) => {
          deletedClients.push(clientId)
          return {
            clientId: 'client_2',
            deleted: true,
          }
        },
      },
      workspaces: {
        create: (input: unknown) => {
          createdWorkspaces.push(input)
          return {
            workspace: {
              workspaceId: 'workspace_2',
              clientId: 'client_1',
              name: 'Northline Follow-up sessionPath=/tmp/mainspring/session',
              status: 'active',
            },
            session: {
              sessionId: 'session_2',
              status: 'open',
              workspaceRoot: 'E:/hidden/workspace-2',
              sessionPath: 'E:/hidden/session-2.sqlite',
              createdAt: '2026-06-27T00:05:00.000Z',
              updatedAt: '2026-06-27T00:05:00.000Z',
              metadata: { clientId: 'client_1', workspaceId: 'workspace_2' },
            },
          }
        },
        delete: (workspaceId: unknown) => {
          deletedWorkspaces.push(workspaceId)
          return {
            workspaceId: 'workspace_2',
            deleted: true,
          }
        },
      },
      agents: {
        create: (input: unknown) => {
          createdAgents.push(input)
          return {
            agentId: 'agent_1',
            workspaceId: 'workspace_1',
            name: 'Front desk assistant',
            version: '1.0.0',
            status: 'active',
            metadata: {
              instructions: 'Stay plain secretRef=env:OPENROUTER_API_KEY',
              outcome: 'Keep workspaceRoot=E:/Mainspring/hidden out',
              voice: 'Plain filePath=/tmp/mainspring/voice.txt',
              approvalMode: 'Balanced',
              modelLabel: 'OpenRouter databasePath=/var/lib/mainspring/gateway.sqlite',
              skills: { 'File tools': true },
            },
          }
        },
        update: (input: unknown) => {
          updatedAgents.push(input)
          return {
            agentId: 'agent_1',
            workspaceId: 'workspace_1',
            name: 'Front desk assistant v2',
            version: '1.1.0',
            status: 'active',
            defaultModelId: 'openrouter/free',
            metadata: {
              instructions: 'Stay concise artifactPath=C:\\secret\\agent.md',
              approvalMode: 'Ask first',
              modelLabel: 'OpenRouter free',
            },
          }
        },
      },
      providerProfiles: {
        create: (input: unknown) => {
          createdProviderProfiles.push(input)
          return {
            profileId: 'provider_profile_1',
            providerId: 'openrouter filePath=C:\\secret\\provider-id.txt',
            label: 'OpenRouter Default workspaceRoot=E:/Mainspring/provider-label',
            defaultModelId: 'openrouter/free filePath=/srv/secret/provider-model.txt',
            status: 'active',
            secretRef: 'managed:provider_profile_1',
            managedSecretStored: true,
          }
        },
        update: (input: unknown) => {
          updatedProviderProfiles.push(input)
          return {
            profileId: 'provider_profile_1',
            providerId: 'openrouter filePath=C:\\secret\\provider-id-v2.txt',
            label: 'OpenRouter Archived filePath=C:\\secret\\provider-label.txt',
            defaultModelId: 'openrouter/free filePath=/srv/secret/provider-model-v2.txt',
            status: 'archived',
            secretRef: 'env:OPENROUTER_API_KEY',
          }
        },
      },
      cron: {
        create: (input: unknown) => {
          createdCronSchedules.push(input)
          return {
            scheduleId: 'schedule_1',
            sessionId: 'session_1',
            workspaceId: 'workspace_1',
            computerId: 'local-computer filePath=C:\\secret\\cron-computer.txt',
            label: 'Daily secret workspaceRoot=E:/Mainspring/hidden-cron-label',
            prompt:
              'Run the daily route. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/hidden '.repeat(4),
            cronExpr: '30 9 * * 1',
            timezone: 'local',
            allowedTools: ['file.read', 'shell.exec filePath=C:\\secret\\cron-tool.txt'],
            enabled: false,
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
            metadata: {
              secretRef: 'env:OPENROUTER_API_KEY',
              workspaceRoot: 'E:/Mainspring/hidden-cron',
            },
          }
        },
        update: (input: unknown) => {
          updatedCronSchedules.push(input)
          return {
            scheduleId: 'schedule_1',
            sessionId: 'session_1',
            workspaceId: 'workspace_1',
            computerId: 'local-computer filePath=C:\\secret\\cron-computer-v2.txt',
            label: 'Daily route v2 filePath=C:\\secret\\cron-label.txt',
            prompt: 'Short safe prompt.',
            cronExpr: '45 9 * * 1',
            timezone: 'utc',
            allowedTools: ['file.read', 'memory.read filePath=C:\\secret\\cron-tool-v2.txt'],
            enabled: true,
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:10:00.000Z',
            metadata: {
              secretRef: 'managed:cron-secret',
              root: 'C:\\secret\\cron',
            },
          }
        },
        delete: () => ({ scheduleId: 'schedule_1', deleted: true }),
        runNow: () => ({
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'queued',
          createdAt: '2026-06-27T00:15:00.000Z',
          input: 'Cron run-now prompt secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/cron-hidden',
        }),
        status: () => ({ enabled: false, running: false, pollIntervalMs: 30000 }),
      },
      budgets: {
        create: (input: unknown) => {
          createdBudgets.push(input)
          return {
            budgetId: 'budget_1',
            scopeType: 'workspace',
            scopeId: 'workspace_1',
            label: 'Northline workspace budget workspaceRoot=E:/Mainspring/hidden-budget',
            maxEstimatedCostUsd: 25,
            warnAtUsd: 20,
            status: 'active',
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
            metadata: {
              secretRef: 'managed:budget-secret',
              workspaceRoot: 'E:/Mainspring/hidden-budget',
              root: '/srv/mainspring-budget',
            },
          }
        },
        update: (input: unknown) => {
          updatedBudgets.push(input)
          return {
            budgetId: 'budget_1',
            scopeType: 'workspace',
            scopeId: 'workspace_1',
            label: 'Northline workspace budget v2 filePath=C:\\secret\\budget.txt',
            maxEstimatedCostUsd: 30,
            warnAtUsd: 24,
            status: 'archived',
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:10:00.000Z',
            metadata: {
              secretRef: 'env:OPENROUTER_API_KEY',
              root: 'C:\\secret\\budget',
            },
          }
        },
        delete: () => ({ budgetId: 'budget_1', deleted: true }),
        status: () => ({ evaluations: [], blocked: 0, warnings: 0 }),
      },
      runs: {
        start: (input: unknown) => {
          starts.push({ kind: 'direct', input })
          return {
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'queued',
            createdAt: '2026-06-27T00:20:00.000Z',
            input: 'Direct run prompt secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/direct-hidden',
          }
        },
        startFromAppState: (input: unknown) => {
          starts.push({ kind: 'appState', input })
          return {
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'queued',
            createdAt: '2026-06-27T00:20:00.000Z',
            input: 'App-state run prompt secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/app-hidden',
          }
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
            payload: {
              approvalId: 'approval_1',
              targetKey: 'file.write',
              note:
                'review workspaceRoot=E:/Mainspring/event-hidden sessionPath=/tmp/mainspring/session mailboxPath=C:\\secret\\mailbox remote=/srv/event-hidden',
            },
          },
        ],
      },
      approvals: { list: () => [], approve: () => undefined, deny: () => undefined },
    } as unknown as ReturnType<typeof createLocalMainspringGateway>
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const createClient = await fetch(`${started.url}/clients`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Northline Dental',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-dental',
          contact: 'Austin',
          billingLabel: 'retainer',
        }),
      }).then((response) => response.json())
      expect(createClient).toMatchObject({
        client: { clientId: 'client_1', name: 'Northline Dental [redacted]' },
        workspace: { workspaceId: 'workspace_1', name: 'Northline Workspace [redacted]' },
        session: { sessionId: 'session_1', workspaceId: 'workspace_1' },
      })
      expect(JSON.stringify(createClient)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createClient)).not.toContain('filePath')
      expect(JSON.stringify(createClient)).not.toContain('sessionPath')
      expect(JSON.stringify(createClient)).not.toContain('"root"')
      expect(JSON.stringify(createClient)).not.toContain('E:/hidden-client')
      expect(JSON.stringify(createClient)).not.toContain('/srv/hidden-workspace')
      expect(createdClients).toEqual([
        {
          name: 'Northline Dental',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-dental',
          contact: 'Austin',
          billingLabel: 'retainer',
        },
      ])

      const createWorkspace = await fetch(`${started.url}/workspaces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: 'client_1',
          name: 'Northline Follow-up',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-follow-up',
        }),
      }).then((response) => response.json())
      expect(createWorkspace).toMatchObject({
        workspace: { workspaceId: 'workspace_2', clientId: 'client_1', name: 'Northline Follow-up [redacted]' },
        session: { sessionId: 'session_2', workspaceId: 'workspace_2' },
      })
      expect(JSON.stringify(createWorkspace)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createWorkspace)).not.toContain('sessionPath')
      expect(JSON.stringify(createWorkspace)).not.toContain('"root"')
      expect(createdWorkspaces).toEqual([
        {
          clientId: 'client_1',
          name: 'Northline Follow-up',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-follow-up',
        },
      ])

      const deleteWorkspace = await fetch(`${started.url}/workspaces/workspace_2`, {
        method: 'DELETE',
      }).then((response) => response.json())
      expect(deleteWorkspace).toEqual({
        workspaceId: 'workspace_2',
        deleted: true,
      })
      expect(deletedWorkspaces).toEqual(['workspace_2'])

      const updateClient = await fetch(`${started.url}/clients/client_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Northline Dental Group',
          status: 'archived',
          workspaceId: 'workspace_1',
          workspaceName: 'Northline Operations',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-ops',
          workspaceStatus: 'archived',
          contact: 'Austin Updated',
        }),
      }).then((response) => response.json())
      expect(updateClient).toMatchObject({
        client: { clientId: 'client_1', name: 'Northline Dental Group [redacted]', status: 'archived' },
        workspace: { workspaceId: 'workspace_1', name: 'Northline Operations [redacted]', status: 'archived' },
      })
      expect(JSON.stringify(updateClient)).not.toContain('workspaceRoot')
      expect(JSON.stringify(updateClient)).not.toContain('"root"')
      expect(JSON.stringify(updateClient)).not.toContain('databasePath')
      expect(JSON.stringify(updateClient)).not.toContain('artifactPath')
      expect(JSON.stringify(updateClient)).not.toContain('C:\\secret')
      expect(JSON.stringify(updateClient)).not.toContain('/var/lib/mainspring')
      expect(updatedClients).toEqual([
        {
          clientId: 'client_1',
          name: 'Northline Dental Group',
          status: 'archived',
          workspaceId: 'workspace_1',
          workspaceName: 'Northline Operations',
          workspaceRoot: 'E:/Mainspring/workspaces/northline-ops',
          workspaceStatus: 'archived',
          contact: 'Austin Updated',
        },
      ])

      const deleteClient = await fetch(`${started.url}/clients/client_2`, {
        method: 'DELETE',
      }).then((response) => response.json())
      expect(deleteClient).toEqual({
        clientId: 'client_2',
        deleted: true,
      })
      expect(deletedClients).toEqual(['client_2'])

      const createAgent = await fetch(`${started.url}/agents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'workspace_1',
          name: 'Front desk assistant',
          instructions: 'Stay plain and careful.',
          skills: { 'File tools': true },
        }),
      }).then((response) => response.json())
      expect(createAgent).toMatchObject({
        agent: {
          agentId: 'agent_1',
          instructions: 'Stay plain [redacted]',
          outcome: 'Keep [redacted] out',
          voice: 'Plain [redacted]',
          modelLabel: 'OpenRouter [redacted]',
          skills: { 'File tools': true },
        },
      })
      expect(JSON.stringify(createAgent)).not.toContain('secretRef')
      expect(JSON.stringify(createAgent)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(createAgent)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createAgent)).not.toContain('filePath')
      expect(JSON.stringify(createAgent)).not.toContain('databasePath')
      expect(JSON.stringify(createAgent)).not.toContain('E:/Mainspring/hidden')
      expect(JSON.stringify(createAgent)).not.toContain('/tmp/mainspring')
      expect(createdAgents).toEqual([
        {
          workspaceId: 'workspace_1',
          name: 'Front desk assistant',
          instructions: 'Stay plain and careful.',
          skills: { 'File tools': true },
        },
      ])

      const updateAgent = await fetch(`${started.url}/agents/agent_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Front desk assistant v2',
          version: '1.1.0',
          instructions: 'Stay concise.',
        }),
      }).then((response) => response.json())
      expect(updateAgent).toMatchObject({
        agent: {
          agentId: 'agent_1',
          name: 'Front desk assistant v2',
          version: '1.1.0',
          instructions: 'Stay concise [redacted]',
          approvalMode: 'Ask first',
        },
      })
      expect(JSON.stringify(updateAgent)).not.toContain('artifactPath')
      expect(JSON.stringify(updateAgent)).not.toContain('C:\\secret')
      expect(updatedAgents).toEqual([
        {
          agentId: 'agent_1',
          name: 'Front desk assistant v2',
          version: '1.1.0',
          instructions: 'Stay concise.',
        },
      ])

      const createProviderProfile = await fetch(`${started.url}/provider-profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'openrouter',
          label: 'OpenRouter Default',
          secretValue: 'sk-managed-secret-value',
          defaultModelId: 'openrouter/free',
        }),
      }).then((response) => response.json())
      expect(createProviderProfile).toMatchObject({
        providerProfile: {
          profileId: 'provider_profile_1',
          providerId: 'openrouter [redacted]',
          label: 'OpenRouter Default [redacted]',
          defaultModelId: 'openrouter/free [redacted]',
          status: 'active',
          credentialState: 'configured',
        },
      })
      expect(JSON.stringify(createProviderProfile)).not.toContain('secretRef')
      expect(JSON.stringify(createProviderProfile)).not.toContain('sk-managed-secret-value')
      expect(JSON.stringify(createProviderProfile)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createProviderProfile)).not.toContain('filePath')
      expect(JSON.stringify(createProviderProfile)).not.toContain('provider-label')
      expect(JSON.stringify(createProviderProfile)).not.toContain('C:\\secret')
      expect(JSON.stringify(createProviderProfile)).not.toContain('/srv/secret')
      expect(createdProviderProfiles).toEqual([
        {
          providerId: 'openrouter',
          label: 'OpenRouter Default',
          secretValue: 'sk-managed-secret-value',
          defaultModelId: 'openrouter/free',
        },
      ])

      const updateProviderProfile = await fetch(`${started.url}/provider-profiles/provider_profile_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'OpenRouter Archived',
          status: 'archived',
        }),
      }).then((response) => response.json())
      expect(updateProviderProfile).toMatchObject({
        providerProfile: {
          profileId: 'provider_profile_1',
          providerId: 'openrouter [redacted]',
          label: 'OpenRouter Archived [redacted]',
          defaultModelId: 'openrouter/free [redacted]',
          status: 'archived',
          credentialState: 'missing',
        },
      })
      expect(JSON.stringify(updateProviderProfile)).not.toContain('secretRef')
      expect(JSON.stringify(updateProviderProfile)).not.toContain('sk-managed-secret-value')
      expect(JSON.stringify(updateProviderProfile)).not.toContain('filePath')
      expect(JSON.stringify(updateProviderProfile)).not.toContain('provider-label')
      expect(JSON.stringify(updateProviderProfile)).not.toContain('C:\\secret')
      expect(JSON.stringify(updateProviderProfile)).not.toContain('/srv/secret')
      expect(updatedProviderProfiles).toEqual([
        {
          profileId: 'provider_profile_1',
          label: 'OpenRouter Archived',
          status: 'archived',
        },
      ])

      const createCron = await fetch(`${started.url}/cron`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_1',
          workspaceId: 'workspace_1',
          label: 'Daily secret [redacted]',
          prompt: 'Run the daily route. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/hidden',
          cronExpr: '30 9 * * 1',
          allowedTools: ['file.read'],
          enabled: false,
        }),
      }).then((response) => response.json())
      expect(createCron).toMatchObject({
        cronSchedule: {
          scheduleId: 'schedule_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_1',
          computerId: 'local-computer [redacted]',
          label: 'Daily secret [redacted]',
          promptPreview: expect.any(String),
          cronExpr: '30 9 * * 1',
          enabled: false,
        },
      })
      expect(createCron.cronSchedule.allowedTools).toEqual(['file.read', 'shell.exec [redacted]'])
      expect(JSON.stringify(createCron)).not.toContain('"prompt"')
      expect(JSON.stringify(createCron)).not.toContain('secretRef')
      expect(JSON.stringify(createCron)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(createCron)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createCron)).not.toContain('hidden-cron')
      expect(JSON.stringify(createCron)).not.toContain('cron-label')
      expect(JSON.stringify(createCron)).not.toContain('cron-tool')
      expect(JSON.stringify(createCron)).not.toContain('C:\\secret')
      expect(createCron.cronSchedule.promptPreview.length).toBeLessThanOrEqual(140)
      expect(createdCronSchedules).toEqual([
        {
          sessionId: 'session_1',
          workspaceId: 'workspace_1',
          label: 'Daily secret [redacted]',
          prompt: 'Run the daily route. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/hidden',
          cronExpr: '30 9 * * 1',
          allowedTools: ['file.read'],
          enabled: false,
        },
      ])

      const updateCron = await fetch(`${started.url}/cron/schedule_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'Daily route v2',
          prompt: 'Short safe prompt.',
          cronExpr: '45 9 * * 1',
          timezone: 'utc',
          allowedTools: ['file.read', 'memory.read'],
          enabled: true,
        }),
      }).then((response) => response.json())
      expect(updateCron).toMatchObject({
        cronSchedule: {
          scheduleId: 'schedule_1',
          computerId: 'local-computer [redacted]',
          label: 'Daily route v2 [redacted]',
          promptPreview: 'Short safe prompt.',
          cronExpr: '45 9 * * 1',
          timezone: 'utc',
          enabled: true,
        },
      })
      expect(updateCron.cronSchedule.allowedTools).toEqual(['file.read', 'memory.read [redacted]'])
      expect(JSON.stringify(updateCron)).not.toContain('"prompt"')
      expect(JSON.stringify(updateCron)).not.toContain('managed:cron-secret')
      expect(JSON.stringify(updateCron)).not.toContain('C:\\secret')
      expect(JSON.stringify(updateCron)).not.toContain('cron-label')
      expect(JSON.stringify(updateCron)).not.toContain('cron-tool')
      expect(updatedCronSchedules).toEqual([
        {
          scheduleId: 'schedule_1',
          label: 'Daily route v2',
          prompt: 'Short safe prompt.',
          cronExpr: '45 9 * * 1',
          timezone: 'utc',
          allowedTools: ['file.read', 'memory.read'],
          enabled: true,
        },
      ])

      const runCronNow = await fetch(`${started.url}/cron/schedule_1/run-now`, {
        method: 'POST',
      }).then((response) => response.json())
      expect(runCronNow).toMatchObject({
        run: {
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'queued',
        },
      })
      expect(JSON.stringify(runCronNow)).not.toContain('"input"')
      expect(JSON.stringify(runCronNow)).not.toContain('Cron run-now prompt')
      expect(JSON.stringify(runCronNow)).not.toContain('secretRef')
      expect(JSON.stringify(runCronNow)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(runCronNow)).not.toContain('workspaceRoot')
      expect(JSON.stringify(runCronNow)).not.toContain('cron-hidden')

      const createBudget = await fetch(`${started.url}/budgets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scopeType: 'workspace',
          scopeId: 'workspace_1',
          label: 'Northline workspace budget',
          maxEstimatedCostUsd: 25,
          warnAtUsd: 20,
        }),
      }).then((response) => response.json())
      expect(createBudget).toMatchObject({
        budget: {
          budgetId: 'budget_1',
          scopeType: 'workspace',
          scopeId: 'workspace_1',
          label: 'Northline workspace budget [redacted]',
          maxEstimatedCostUsd: 25,
          warnAtUsd: 20,
          status: 'active',
        },
      })
      expect(JSON.stringify(createBudget)).not.toContain('secretRef')
      expect(JSON.stringify(createBudget)).not.toContain('workspaceRoot')
      expect(JSON.stringify(createBudget)).not.toContain('/srv/mainspring-budget')
      expect(JSON.stringify(createBudget)).not.toContain('hidden-budget')
      expect(createdBudgets).toEqual([
        {
          scopeType: 'workspace',
          scopeId: 'workspace_1',
          label: 'Northline workspace budget',
          maxEstimatedCostUsd: 25,
          warnAtUsd: 20,
        },
      ])

      const updateBudget = await fetch(`${started.url}/budgets/budget_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'Northline workspace budget v2',
          maxEstimatedCostUsd: 30,
          warnAtUsd: 24,
          status: 'archived',
        }),
      }).then((response) => response.json())
      expect(updateBudget).toMatchObject({
        budget: {
          budgetId: 'budget_1',
          label: 'Northline workspace budget v2 [redacted]',
          maxEstimatedCostUsd: 30,
          warnAtUsd: 24,
          status: 'archived',
        },
      })
      expect(JSON.stringify(updateBudget)).not.toContain('secretRef')
      expect(JSON.stringify(updateBudget)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(updateBudget)).not.toContain('filePath')
      expect(JSON.stringify(updateBudget)).not.toContain('C:\\secret')
      expect(updatedBudgets).toEqual([
        {
          budgetId: 'budget_1',
          label: 'Northline workspace budget v2',
          maxEstimatedCostUsd: 30,
          warnAtUsd: 24,
          status: 'archived',
        },
      ])

      const startRun = await fetch(`${started.url}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_1',
          input: 'Write through the HTTP gateway.',
          mode: 'chat',
          allowedTools: ['file.write'],
          allowBudgetWarning: true,
          computerId: 'computer_wsl',
          workspaceId: 'workspace_1',
          agentId: 'agent_1',
          providerProfileId: 'profile_1',
        }),
      }).then((response) => response.json())

      expect(startRun).toMatchObject({ run: { runId: 'run_1', sessionId: 'session_1' } })
      expect(JSON.stringify(startRun)).not.toContain('"input"')
      expect(JSON.stringify(startRun)).not.toContain('App-state run prompt')
      expect(JSON.stringify(startRun)).not.toContain('secretRef')
      expect(JSON.stringify(startRun)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(startRun)).not.toContain('workspaceRoot')
      expect(JSON.stringify(startRun)).not.toContain('app-hidden')
      expect(starts).toEqual([
        {
          kind: 'appState',
          input: {
            sessionId: 'session_1',
            input: 'Write through the HTTP gateway.',
            mode: 'chat',
            allowedTools: ['file.write'],
            allowBudgetWarning: true,
            computerId: 'computer_wsl',
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
      expect(runEvents.events[0].payload.note).toBe(
        'review [redacted] [redacted] [redacted] remote=[redacted]',
      )
      expect(JSON.stringify(runEvents)).not.toContain('workspaceRoot')
      expect(JSON.stringify(runEvents)).not.toContain('sessionPath')
      expect(JSON.stringify(runEvents)).not.toContain('mailboxPath')
      expect(JSON.stringify(runEvents)).not.toContain('E:/Mainspring/event-hidden')
      expect(JSON.stringify(runEvents)).not.toContain('/tmp/mainspring')
      expect(JSON.stringify(runEvents)).not.toContain('C:\\secret')
      expect(JSON.stringify(runEvents)).not.toContain('/srv/event-hidden')
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
          approvals: [],
          artifacts: [],
          cronSchedules: [],
          budgets: [],
          usageLedger: [],
          auditEvents: [],
        },
        sessions: [],
        runs: [],
        approvals: [],
        cron: { enabled: false, running: false, pollIntervalMs: 30000 },
        budgetStatus: { evaluations: [], blocked: 0, warnings: 0 },
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

  it('routes RunLog run start, event projection, and approval resolution through explicit RunLog endpoints', async () => {
    const root = makeTempRoot('mainspring-gateway-runlog-route-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const executions = { count: 0 }
    const runtime = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'legacy idle' } }]),
      pollIntervalMs: 10,
    })
    const session = runtime.sessions.create({
      sessionId: 'session_runlog_gateway',
      workspace: { root: workspaceRoot },
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider((input) => {
        const toolMessage = input.messages?.find((message) => message.role === 'tool')
        if (toolMessage) {
          return [
            {
              type: 'event',
              event: {
                type: 'result',
                text: `gateway-approved:${toolMessage.content.includes('"executions":1')}`,
              },
            },
          ]
        }
        return [
          {
            type: 'event',
            event: {
              type: 'tool_call',
              name: 'tool.reviewed',
              toolCallId: 'call_gateway_runlog',
              input: { sourceMutation: true },
            },
          },
        ]
      }),
      tools: [approvalTool(executions)],
      agent: {
        agentId: 'agent_gateway_runlog',
        instructions: 'Use reviewed tools only through RunLog approval.',
        tools: ['tool.reviewed'],
        approvalPolicy: 'balanced',
        capabilities: ['provider', 'tools'],
      },
      approvalReceiptKey: 'gateway-runlog-route-test-key',
    })
    const gateway = createLocalMainspringGateway({ runtime, runLog })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const startedRun = await fetch(`${started.url}/runlog/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.record.sessionId,
          input: 'Use the reviewed tool from the RunLog route.',
          mode: 'chat',
          allowedTools: ['tool.reviewed'],
        }),
      }).then((response) => response.json())

      expect(startedRun).toMatchObject({
        run: {
          sessionId: session.record.sessionId,
          agentId: 'agent_gateway_runlog',
          status: 'awaiting_approval',
        },
        status: 'awaiting_approval',
      })
      expect(startedRun.pendingApprovals).toHaveLength(1)
      expect(executions.count).toBe(0)

      const runId = startedRun.run.runId as string
      const approvalId = startedRun.pendingApprovals[0].approvalId as string
      const events = await fetch(`${started.url}/runlog/runs/${encodeURIComponent(runId)}/events`).then(
        (response) => response.json(),
      )
      expect(events.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'run.created' }),
          expect.objectContaining({ type: 'approval.requested' }),
        ]),
      )
      expect(JSON.stringify(events)).not.toContain('workspaceRoot')

      const resolved = await fetch(
        `${started.url}/runlog/approvals/${encodeURIComponent(approvalId)}/resolve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.record.sessionId,
            runId,
            decision: 'approved',
            reason: 'gateway runlog approval test',
          }),
        },
      ).then((response) => response.json())

      expect(resolved).toMatchObject({
        run: {
          runId,
          sessionId: session.record.sessionId,
          status: 'completed',
        },
        assistantText: 'gateway-approved:true',
      })
      expect(resolved.pendingApprovals).toHaveLength(0)
      expect(executions.count).toBe(1)
    } finally {
      await server.stop()
      runLog.close()
    }
  })

  it('uses RunLog for the default run start endpoint when a RunLog runtime is configured', async () => {
    const root = makeTempRoot('mainspring-gateway-default-runlog-route-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const runtime = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'legacy idle' } }]),
      pollIntervalMs: 10,
    })
    const session = runtime.sessions.create({
      sessionId: 'session_default_runlog_gateway',
      workspace: { root: workspaceRoot },
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'default route via runlog' } }]),
      agent: {
        agentId: 'agent_default_runlog_gateway',
        instructions: 'Answer through the default RunLog gateway route.',
        capabilities: ['provider'],
      },
      approvalReceiptKey: 'gateway-default-runlog-route-test-key',
    })
    const gateway = createLocalMainspringGateway({ runtime, runLog, appState })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const startedRun = await fetch(`${started.url}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.record.sessionId,
          input: 'Use the default route with RunLog.',
          mode: 'chat',
          allowedTools: [],
        }),
      }).then((response) => response.json())

      expect(startedRun).toMatchObject({
        run: {
          sessionId: session.record.sessionId,
          status: 'completed',
        },
      })
      const runId = startedRun.run.runId as string
      expect(runId).toMatch(/^run_/)
      expect(JSON.stringify(startedRun)).not.toContain('Use the default route with RunLog.')

      const projection = await fetch(`${started.url}/runlog/runs/${encodeURIComponent(runId)}/events`).then(
        (response) => response.json(),
      )
      expect(projection).toMatchObject({
        run: {
          runId,
          sessionId: session.record.sessionId,
          agentId: 'agent_default_runlog_gateway',
          status: 'completed',
        },
        assistantText: 'default route via runlog',
      })

      const snapshot = await fetch(`${started.url}/snapshot`).then((response) => response.json())
      expect(snapshot.runLog.runs).toEqual([
        expect.objectContaining({
          runId,
          sessionId: session.record.sessionId,
          status: 'completed',
          assistantText: 'default route via runlog',
        }),
      ])
      expect(snapshot.runs).toEqual([])
    } finally {
      await server.stop()
      runLog.close()
      appState.close()
    }
  })

  it('exposes sanitized RunLog cron grant preview and creation endpoints', async () => {
    const root = makeTempRoot('mainspring-gateway-cron-grant-route-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const runtime = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'legacy idle' } }]),
      pollIntervalMs: 10,
    })
    const session = runtime.sessions.create({
      sessionId: 'session_cron_grant_gateway',
      workspace: { root: workspaceRoot },
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'cron grant route ok' } }]),
      approvalReceiptKey: 'gateway-cron-grant-route-test-key',
    })
    const gateway = createLocalMainspringGateway({ runtime, runLog, appState })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    const started = await server.start()
    try {
      const schedule = appState.cronSchedules.create({
        scheduleId: 'schedule_cron_grant_route',
        sessionId: session.record.sessionId,
        label: 'Grant route',
        prompt: 'Cron grant prompt secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/hidden',
        cronExpr: '0 * * * *',
        allowedTools: ['file.write'],
        enabled: true,
      })

      const before = await fetch(
        `${started.url}/cron/${encodeURIComponent(schedule.scheduleId)}/grant`,
      ).then((response) => response.json())

      expect(before).toMatchObject({
        cronGrant: {
          scheduleId: schedule.scheduleId,
          grantRequired: true,
          grantPresent: false,
          decision: expect.objectContaining({ state: 'deny' }),
        },
      })
      expect(JSON.stringify(before)).not.toContain('Cron grant prompt')
      expect(JSON.stringify(before)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(before)).not.toContain('workspaceRoot')

      const created = await fetch(`${started.url}/cron/${encodeURIComponent(schedule.scheduleId)}/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expiresInMs: 60_000,
          maxExecutionCount: 1,
          actor: 'route-test-operator',
        }),
      }).then((response) => response.json())

      expect(created).toMatchObject({
        cronGrant: {
          scheduleId: schedule.scheduleId,
          grantRequired: true,
          grantPresent: true,
          decision: expect.objectContaining({ state: 'allow' }),
          grant: expect.objectContaining({
            maxExecutionCount: 1,
            executionCount: 0,
            allowedTools: ['file.write'],
          }),
        },
        cronSchedule: {
          scheduleId: schedule.scheduleId,
          promptPreview: expect.stringContaining('[redacted]'),
          cronGrant: expect.objectContaining({
            maxExecutionCount: 1,
            executionCount: 0,
            allowedTools: ['file.write'],
          }),
        },
      })
      expect(JSON.stringify(created)).not.toContain(
        'Cron grant prompt secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/hidden',
      )
      expect(JSON.stringify(created)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(created)).not.toContain('E:/hidden')

      const runNow = await fetch(`${started.url}/cron/${encodeURIComponent(schedule.scheduleId)}/run-now`, {
        method: 'POST',
      }).then((response) => response.json())
      expect(runNow.run.status).toBe('queued')
      await runLog.drainUntilIdle()
      expect(runLog.store.getRun(runNow.run.runId)?.status).toBe('completed')
      expect(appState.cronSchedules.get(schedule.scheduleId)?.metadata).toMatchObject({
        cronGrant: expect.objectContaining({
          grantId: created.cronGrant.grant.grantId,
          executionCount: 1,
        }),
        lastDecision: expect.objectContaining({ state: 'allow' }),
      })
    } finally {
      await server.stop()
      runLog.close()
      appState.close()
    }
  })

  it('routes deployment target create/update/plan/execute through the gateway deployment lane', async () => {
    const createInputs: unknown[] = []
    const updateInputs: unknown[] = []
    const planInputs: unknown[] = []
    const executeInputs: unknown[] = []
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
          approvals: [],
          artifacts: [],
          cronSchedules: [],
          budgets: [],
          usageLedger: [],
          auditEvents: [],
          deploymentTargets: [],
          deploymentRuns: [],
          cells: [],
          cellLeases: [],
          cellSnapshots: [],
        },
        sessions: [],
        runs: [],
        approvals: [],
        cron: { enabled: false, running: false, pollIntervalMs: 30000 },
        budgetStatus: { evaluations: [], blocked: 0, warnings: 0 },
      }),
      sessions: { list: () => [] },
      runs: {
        start: () => ({ runId: 'run_1', sessionId: 'session_1' }),
        startFromAppState: () => ({ runId: 'run_1', sessionId: 'session_1' }),
      },
      events: { list: () => [] },
      approvals: { list: () => [], approve: () => undefined, deny: () => undefined },
      deployments: {
        createTarget: (input: unknown) => {
          createInputs.push(input)
          return {
            targetId: 'deployment_target_1',
            workspaceId: 'workspace_1',
            label: 'Northline VPS',
            kind: 'vps',
            status: 'active',
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
            metadata: {
              secretRef: 'env:OPENROUTER_API_KEY',
              envFilePath: '/etc/mainspring/northline.env',
              remoteRoot: '/srv/mainspring',
              root: 'C:\\secret\\deployment-target',
            },
          }
        },
        updateTarget: (input: unknown) => {
          updateInputs.push(input)
          return {
            targetId: 'deployment_target_1',
            workspaceId: 'workspace_1',
            label: 'Northline VPS v2',
            kind: 'vps',
            status: 'archived',
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:10:00.000Z',
            metadata: {
              secretRef: 'managed:northline-deploy',
              envFilePath: '/etc/mainspring/northline.env',
              caddyConfigPath: '/etc/caddy/northline.conf',
              workspaceRoot: 'E:/Mainspring/hidden-workspace',
            },
          }
        },
        plan: (input: unknown) => {
          planInputs.push(input)
          return {
            operation: 'deploy',
            targetId: 'deployment_target_1',
            targetLabel: 'Northline VPS workspaceRoot=C:\\secret\\target',
            targetKind: 'vps',
            summary: 'Deploy Northline runtime from /srv/mainspring.',
            prerequisites: ['ssh available with envFilePath=/etc/mainspring/northline.env'],
            warnings: ['executes remote commands against remoteRoot=/srv/mainspring'],
            steps: [{ phase: 'local', label: 'Pack current package', command: 'npm pack --json --pack-destination C:\\secret\\package-output' }],
            releaseId: 'release-20260628010101',
          }
        },
        execute: (input: unknown) => {
          executeInputs.push(input)
          return {
            deploymentRun: {
              deploymentRunId: 'deployment_run_1',
              targetId: 'deployment_target_1',
              status: 'succeeded',
              createdAt: '2026-06-27T00:10:00.000Z',
              updatedAt: '2026-06-27T00:11:00.000Z',
              metadata: {
                secretRef: 'managed:northline-deploy',
                workspaceRoot: 'E:/Mainspring/hidden-workspace',
                root: '/srv/mainspring',
              },
            },
            plan: {
            operation: 'deploy',
            targetId: 'deployment_target_1',
            targetLabel: 'Northline VPS',
            targetKind: 'vps',
            summary: 'Deploy Northline runtime from /srv/mainspring.',
            prerequisites: ['ssh available with envFilePath=/etc/mainspring/northline.env'],
            warnings: ['uses remoteRoot=/srv/mainspring'],
            steps: [{ phase: 'remote', label: 'Restart service', command: 'ssh ubuntu@deploy.example.com "sudo systemctl restart mainspring-northline"' }],
          },
          execution: {
            ok: true,
            exitCode: 0,
            startedAt: '2026-06-27T00:10:00.000Z',
            completedAt: '2026-06-27T00:11:00.000Z',
            detail: 'Deployment completed for Northline VPS with filePath=/srv/mainspring/current.',
          },
        }
      },
      },
    } as unknown as ReturnType<typeof createLocalMainspringGateway>
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
    const started = await server.start()

    try {
      const created = await fetch(`${started.url}/deployment-targets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'workspace_1',
          label: 'Northline VPS',
          kind: 'vps',
          config: {
            sshHost: 'deploy.example.com',
            sshUser: 'ubuntu',
            remoteRoot: '/srv/mainspring',
            serviceName: 'mainspring-northline',
          },
        }),
      }).then((response) => response.json())
      expect(created).toMatchObject({
        deploymentTarget: {
          targetId: 'deployment_target_1',
          label: 'Northline VPS',
          kind: 'vps',
          executionSupported: true,
          executionMode: 'vps-ssh',
        },
      })
      expect(JSON.stringify(created)).not.toContain('secretRef')
      expect(JSON.stringify(created)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(created)).not.toContain('/etc/mainspring')
      expect(JSON.stringify(created)).not.toContain('/srv/mainspring')
      expect(JSON.stringify(created)).not.toContain('C:\\secret')

      const updated = await fetch(`${started.url}/deployment-targets/deployment_target_1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'Northline VPS v2',
          status: 'archived',
          config: {
            sshHost: 'deploy.example.com',
            sshUser: 'ubuntu',
            remoteRoot: '/srv/mainspring',
            serviceName: 'mainspring-northline',
            envFilePath: '/etc/mainspring/northline.env',
          },
        }),
      }).then((response) => response.json())
      expect(updated).toMatchObject({
        deploymentTarget: {
          targetId: 'deployment_target_1',
          label: 'Northline VPS v2',
          status: 'archived',
          executionSupported: true,
          executionMode: 'vps-ssh',
        },
      })
      expect(JSON.stringify(updated)).not.toContain('secretRef')
      expect(JSON.stringify(updated)).not.toContain('managed:northline-deploy')
      expect(JSON.stringify(updated)).not.toContain('/etc/mainspring')
      expect(JSON.stringify(updated)).not.toContain('/etc/caddy')
      expect(JSON.stringify(updated)).not.toContain('hidden-workspace')

      const plan = await fetch(`${started.url}/deployment-targets/deployment_target_1/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'deploy' }),
      }).then((response) => response.json())
      expect(plan).toMatchObject({
        deploymentPlan: {
          targetId: 'deployment_target_1',
          operation: 'deploy',
          targetKind: 'vps',
          releaseId: 'release-20260628010101',
          steps: [
            expect.objectContaining({
              phase: 'local',
              label: 'Pack current package',
              commandPreview: 'npm pack --json --pack-destination [redacted]',
            }),
          ],
        },
      })
      expect(JSON.stringify(plan)).not.toContain('"command"')
      expect(JSON.stringify(plan)).not.toContain('workspaceRoot')
      expect(JSON.stringify(plan)).not.toContain('envFilePath')
      expect(JSON.stringify(plan)).not.toContain('remoteRoot')
      expect(JSON.stringify(plan)).not.toContain('/srv/mainspring')
      expect(JSON.stringify(plan)).not.toContain('/etc/mainspring')
      expect(JSON.stringify(plan)).not.toContain('C:\\secret')

      const executed = await fetch(`${started.url}/deployment-targets/deployment_target_1/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'deploy', confirm: 'deploy' }),
      }).then((response) => response.json())
      expect(executed).toMatchObject({
        deploymentRun: {
          deploymentRunId: 'deployment_run_1',
          targetId: 'deployment_target_1',
          status: 'succeeded',
        },
        execution: {
          ok: true,
          exitCode: 0,
        },
      })
      expect(JSON.stringify(executed.deploymentRun)).not.toContain('secretRef')
      expect(JSON.stringify(executed.deploymentRun)).not.toContain('hidden-workspace')
      expect(JSON.stringify(executed.deploymentRun)).not.toContain('/srv/mainspring')
      expect(JSON.stringify(executed.plan)).not.toContain('"command"')
      expect(JSON.stringify(executed.plan)).not.toContain('/srv/mainspring')
      expect(JSON.stringify(executed.execution)).not.toContain('filePath')
      expect(JSON.stringify(executed.execution)).not.toContain('/srv/mainspring')

      expect(createInputs).toEqual([
        {
          workspaceId: 'workspace_1',
          label: 'Northline VPS',
          kind: 'vps',
          metadata: {
            sshHost: 'deploy.example.com',
            sshUser: 'ubuntu',
            remoteRoot: '/srv/mainspring',
            serviceName: 'mainspring-northline',
          },
        },
      ])
      expect(updateInputs).toEqual([
        {
          targetId: 'deployment_target_1',
          workspaceId: undefined,
          label: 'Northline VPS v2',
          kind: undefined,
          status: 'archived',
          metadata: {
            sshHost: 'deploy.example.com',
            sshUser: 'ubuntu',
            remoteRoot: '/srv/mainspring',
            serviceName: 'mainspring-northline',
            envFilePath: '/etc/mainspring/northline.env',
          },
        },
      ])
      expect(planInputs).toEqual([{ targetId: 'deployment_target_1', operation: 'deploy' }])
      expect(executeInputs).toEqual([
        { targetId: 'deployment_target_1', operation: 'deploy', confirm: 'deploy' },
      ])
    } finally {
      await server.stop()
    }
  })

  it('lists and installs trusted local marketplace templates through the gateway HTTP surface', async () => {
    const root = makeTempRoot('mainspring-gateway-server-marketplace-')
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
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: testCellBackendOptions(),
      marketplace: { repoRoot: process.cwd() },
    })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    await mainspring.start()
    try {
      const started = await server.start()
      const templates = await fetch(`${started.url}/marketplace/templates`).then((response) =>
        response.json(),
      )
      const installed = await fetch(
        `${started.url}/marketplace/templates/${encodeURIComponent('coding-agent')}/install`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceRoot: path.join(root, 'marketplace-installed'),
          }),
        },
      ).then((response) => response.json())

      expect(templates).toEqual({
        templates: expect.arrayContaining([
          expect.objectContaining({
            templateId: 'coding-agent',
            trusted: true,
            provenance: 'repo-examples',
            allowedTools: expect.arrayContaining(['file.read', 'file.write']),
          }),
        ]),
      })
      expect(JSON.stringify(templates)).not.toContain('defaults')
      expect(JSON.stringify(templates)).not.toContain('seedFiles')
      expect(JSON.stringify(templates)).not.toContain('exampleDir')
      expect(JSON.stringify(templates)).not.toContain('workspaceRoot')
      expect(JSON.stringify(templates)).not.toContain('secretRef')
      expect(installed).toMatchObject({
        template: {
          templateId: 'coding-agent',
          label: 'Coding Agent',
        },
        client: {
          name: 'Coding Client',
          status: 'active',
        },
        workspace: {
          name: 'Coding Workspace',
          status: 'active',
        },
        agent: {
          name: 'Coding Agent',
          status: 'active',
        },
        installedFiles: ['agent.config.json', 'policy.md', 'README.md', 'template-overview.md'],
      })
      expect(
        fs.existsSync(path.join(root, 'marketplace-installed', 'agent.config.json')),
      ).toBe(true)
      expect(fs.existsSync(path.join(root, 'marketplace-installed', 'run.mjs'))).toBe(false)

      await server.stop()
    } finally {
      appState.close()
      await mainspring.stop()
    }
  }, 30_000)

  it('streams snapshot and run-event updates over server-sent events', async () => {
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
          approvals: [],
          artifacts: [],
          cronSchedules: [],
          budgets: [],
          usageLedger: [],
          auditEvents: [],
        },
        sessions: [
          {
            sessionId: 'session_1',
            status: 'active',
            workspaceRoot: 'E:/hidden',
            sessionPath: 'E:/hidden/session.sqlite',
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
          },
        ],
        runs: [
          {
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'running',
            createdAt: '2026-06-27T00:00:00.000Z',
            lastEventAt: '2026-06-27T00:00:01.000Z',
            eventCount: 1,
            pendingInboundCount: 0,
          },
        ],
        approvals: [],
        cron: { enabled: false, running: false, pollIntervalMs: 30000 },
        budgetStatus: { evaluations: [], blocked: 0, warnings: 0 },
      }),
      sessions: { list: () => [] },
      runs: {
        start: () => ({ runId: 'run_1', sessionId: 'session_1' }),
        startFromAppState: () => ({ runId: 'run_1', sessionId: 'session_1' }),
      },
      events: {
        list: ({ runId }: { runId?: string }) =>
          runId
            ? [
                {
                  type: 'run.started',
                  runId: 'run_1',
                  sessionId: 'session_1',
                  timestamp: '2026-06-27T00:00:01.000Z',
                  seq: 1,
                  payload: {
                    note:
                      'stream workspaceRoot=E:/Mainspring/stream-hidden sessionPath=/tmp/mainspring/stream mailboxPath=C:\\secret\\stream remote=/srv/stream-hidden',
                  },
                },
              ]
            : [],
      },
      approvals: { list: () => [], approve: () => undefined, deny: () => undefined },
    } as unknown as ReturnType<typeof createLocalMainspringGateway>
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
    const started = await server.start()
    const controller = new AbortController()

    try {
      const response = await fetch(
        `${started.url}/events/stream?sessionId=session_1&runId=run_1`,
        { signal: controller.signal },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/event-stream')

      const reader = response.body?.getReader()
      expect(reader).toBeTruthy()

      const chunks: string[] = []
      while (chunks.join('').length < 80) {
        const result = await reader!.read()
        if (result.done) break
        chunks.push(Buffer.from(result.value).toString('utf8'))
        if (chunks.join('').includes('event: run.event')) break
      }
      const text = chunks.join('')
      expect(text).toContain('event: snapshot.updated')
      expect(text).toContain('event: run.event')
      expect(text).not.toContain('workspaceRoot')
      expect(text).not.toContain('sessionPath')
      expect(text).not.toContain('mailboxPath')
      expect(text).not.toContain('E:/Mainspring/stream-hidden')
      expect(text).not.toContain('/tmp/mainspring')
      expect(text).not.toContain('C:\\secret')
      expect(text).not.toContain('/srv/stream-hidden')

      controller.abort()
    } finally {
      await server.stop()
    }
  })

  it('lists, decides, and applies provenance reviews through sanitized HTTP routes', async () => {
    const root = makeTempRoot('mainspring-gateway-http-provenance-')
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(sessionsRoot, { recursive: true })
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new MockProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_provenance_http',
        name: 'HTTP Provenance Workspace',
        root: workspaceRoot,
      })
      const memoryText = `Remember concise reports without showing ${workspaceRoot}.`
      const staged = stageProvenanceReview({
        workspaceRoot,
        source: 'tool:memory.write',
        actor: 'agent_http_memory',
        runId: 'run_http_memory',
        mutation: {
          kind: 'memory',
          text: memoryText,
          scope: 'workspace',
          tags: ['http-review'],
        },
        scan: scanMemoryMutation({
          text: memoryText,
          scope: 'workspace',
          tags: ['http-review'],
        }),
      })
      const started = await server.start()

      const listed = await fetch(
        `${started.url}/provenance-reviews?workspaceId=${encodeURIComponent(workspace.workspaceId)}`,
      ).then((response) => response.json())
      expect(listed).toMatchObject({
        provenanceReviews: [
          {
            reviewId: staged.reviewId,
            workspaceId: workspace.workspaceId,
            status: 'pending',
            kind: 'memory',
            mutation: {
              kind: 'memory',
              scope: 'workspace',
              tags: ['http-review'],
            },
          },
        ],
      })
      expect(JSON.stringify(listed)).toContain('textPreview')
      expect(JSON.stringify(listed)).not.toContain(workspaceRoot)
      expect(JSON.stringify(listed)).not.toContain('workspaceRoot')

      const approved = await fetch(
        `${started.url}/provenance-reviews/${encodeURIComponent(staged.reviewId)}/decision`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspace.workspaceId,
            decision: 'approved',
            reviewer: 'operator',
          }),
        },
      ).then((response) => response.json())
      expect(approved).toMatchObject({
        provenanceReview: {
          reviewId: staged.reviewId,
          status: 'approved',
          decision: {
            reviewer: 'operator',
          },
        },
      })

      const applied = await fetch(
        `${started.url}/provenance-reviews/${encodeURIComponent(staged.reviewId)}/apply`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspace.workspaceId,
            reviewer: 'operator',
          }),
        },
      ).then((response) => response.json())
      expect(applied).toMatchObject({
        provenanceReviewApply: {
          kind: 'memory',
          reviewId: staged.reviewId,
          applied: true,
        },
      })
    } finally {
      await server.stop()
      appState.close()
      await mainspring.stop()
    }
  })
})
