import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import { EchoProvider } from '../providers/EchoProvider.js'
import { MockProvider } from '../providers/MockProvider.js'
import { createMainspring } from '../sdk/Mainspring.js'
import { createRunLogMainspring } from '../sdk/RunLogMainspring.js'
import { executionBackendCapabilities } from '../tools/ExecutionBackend.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
  gatewaySnapshotToConsoleState,
} from './index.js'

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
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

function makeTempGatewayPaths(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  return { root, sessionsRoot, workspaceRoot }
}

function fakeExecutionBackends(input: {
  wslAvailable?: boolean
  dockerAvailable?: boolean
} = {}) {
  return {
    defaultBackend: 'host' as const,
    backends: [
      {
        key: 'host' as const,
        label: 'Host shell (test)',
        available: true,
        unsafe: true,
        capabilities: executionBackendCapabilities('host'),
        reason: 'Host process execution is available but not isolated.',
      },
      {
        key: 'wsl' as const,
        label: 'WSL bash',
        available: input.wslAvailable ?? false,
        unsafe: false,
        capabilities: executionBackendCapabilities('wsl'),
        ...(input.wslAvailable ? {} : { reason: 'WSL unavailable in test.' }),
      },
      {
        key: 'docker' as const,
        label: 'Docker Linux container',
        available: input.dockerAvailable ?? false,
        unsafe: false,
        capabilities: executionBackendCapabilities('docker'),
        ...(input.dockerAvailable ? {} : { reason: 'Docker unavailable in test.' }),
      },
    ],
  }
}

async function waitFor<T>(
  load: () => T | null | undefined,
  predicate: (value: T | null | undefined) => value is T,
  timeoutMs = 5_000,
  intervalMs = 25,
): Promise<T> {
  const startedAt = Date.now()
  for (;;) {
    const value = load()
    if (predicate(value)) return value
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms.`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

describe('LocalMainspringGateway', () => {
  it('creates a workspace-linked runtime session for gateway-created clients', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-client-session-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    const clientWorkspaceRoot = path.join(root, 'workspaces', 'northline')

    try {
      const created = gateway.clients.create({
        name: 'Northline Dental',
        workspaceRoot: clientWorkspaceRoot,
        workspaceName: 'Northline Workspace',
        contact: 'ops@northline.test',
        billingLabel: 'northline',
      })

      expect(created.client).toMatchObject({
        name: 'Northline Dental',
        status: 'active',
        metadata: expect.objectContaining({
          contact: 'ops@northline.test',
          billingLabel: 'northline',
        }),
      })
      expect(created.workspace).toMatchObject({
        clientId: created.client.clientId,
        name: 'Northline Workspace',
        root: path.resolve(clientWorkspaceRoot),
        status: 'active',
      })
      expect(created.session).toMatchObject({
        status: 'open',
        workspaceRoot: path.resolve(clientWorkspaceRoot),
        metadata: {
          clientId: created.client.clientId,
          workspaceId: created.workspace?.workspaceId,
        },
      })
      expect(gateway.sessions.get(created.session!.sessionId)).toMatchObject({
        sessionId: created.session!.sessionId,
        workspaceRoot: path.resolve(clientWorkspaceRoot),
        metadata: {
          clientId: created.client.clientId,
          workspaceId: created.workspace?.workspaceId,
        },
      })
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'client.created',
            targetType: 'client',
            targetId: created.client.clientId,
            metadata: { workspaceId: created.workspace?.workspaceId },
          }),
          expect.objectContaining({
            action: 'workspace.created',
            targetType: 'workspace',
            targetId: created.workspace?.workspaceId,
            metadata: { clientId: created.client.clientId },
          }),
          expect.objectContaining({
            action: 'session.created',
            targetType: 'session',
            targetId: created.session?.sessionId,
            sessionId: created.session?.sessionId,
            metadata: {
              clientId: created.client.clientId,
              workspaceId: created.workspace?.workspaceId,
            },
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('updates gateway-backed agent drafts and records additive audit rows', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-agent-update-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_acme',
        name: 'Acme Workspace',
        root: workspaceRoot,
      })
      const agent = gateway.agents.create({
        workspaceId: workspace.workspaceId,
        name: 'Research Agent',
        instructions: 'Stay careful.',
        skills: { 'File tools': true },
      })

      const updated = gateway.agents.update({
        agentId: agent.agentId,
        name: 'Research Agent v2',
        version: '1.1.0',
        defaultModelId: 'openrouter/free',
        instructions: 'Stay concise.',
        outcome: 'Produce client-ready drafts.',
        approvalMode: 'Balanced',
        modelLabel: 'Saved model: default chat',
        skills: { 'File tools': true, Memory: true },
      })

      expect(updated).toMatchObject({
        agentId: agent.agentId,
        workspaceId: workspace.workspaceId,
        name: 'Research Agent v2',
        version: '1.1.0',
        defaultModelId: 'openrouter/free',
        metadata: {
          instructions: 'Stay concise.',
          outcome: 'Produce client-ready drafts.',
          approvalMode: 'Balanced',
          modelLabel: 'Saved model: default chat',
          skills: { 'File tools': true, Memory: true },
        },
      })
      expect(appState.agents.get(agent.agentId)).toMatchObject({
        agentId: agent.agentId,
        name: 'Research Agent v2',
        version: '1.1.0',
      })
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'agent.created',
            targetType: 'agent',
            targetId: agent.agentId,
          }),
          expect.objectContaining({
            action: 'agent.updated',
            targetType: 'agent',
            targetId: agent.agentId,
            metadata: { workspaceId: workspace.workspaceId },
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('creates and updates provider profiles while recording gateway audit rows', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-provider-profile-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const created = gateway.providerProfiles.create({
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
      })
      const updated = gateway.providerProfiles.update({
        profileId: created.profileId,
        label: 'OpenRouter Archived',
        status: 'archived',
      })

      expect(created).toMatchObject({
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
        status: 'active',
      })
      expect(updated).toMatchObject({
        profileId: created.profileId,
        label: 'OpenRouter Archived',
        status: 'archived',
      })
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'provider-profile.created',
            targetType: 'provider-profile',
            targetId: created.profileId,
          }),
          expect.objectContaining({
            action: 'provider-profile.updated',
            targetType: 'provider-profile',
            targetId: created.profileId,
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('updates gateway-backed clients and linked workspaces without exposing runtime paths', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-client-update-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    const clientWorkspaceRoot = path.join(root, 'workspaces', 'northline')

    try {
      const created = gateway.clients.create({
        name: 'Northline Dental',
        workspaceRoot: clientWorkspaceRoot,
        workspaceName: 'Northline Workspace',
        contact: 'ops@northline.test',
        billingLabel: 'northline',
      })

      const updated = gateway.clients.update({
        clientId: created.client.clientId,
        name: 'Northline Dental Group',
        status: 'archived',
        contact: 'support@northline.test',
        billingLabel: 'northline-updated',
        workspaceId: created.workspace?.workspaceId,
        workspaceName: 'Northline Operations',
        workspaceRoot: path.join(root, 'workspaces', 'northline-ops'),
      })

      expect(updated.client).toMatchObject({
        clientId: created.client.clientId,
        name: 'Northline Dental Group',
        status: 'archived',
        metadata: expect.objectContaining({
          contact: 'support@northline.test',
          billingLabel: 'northline-updated',
        }),
      })
      expect(updated.workspace).toMatchObject({
        workspaceId: created.workspace?.workspaceId,
        clientId: created.client.clientId,
        name: 'Northline Operations',
        root: path.resolve(path.join(root, 'workspaces', 'northline-ops')),
        status: 'archived',
      })
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'client.updated',
            targetType: 'client',
            targetId: created.client.clientId,
            metadata: { workspaceId: created.workspace?.workspaceId },
          }),
          expect.objectContaining({
            action: 'workspace.updated',
            targetType: 'workspace',
            targetId: created.workspace?.workspaceId,
            metadata: { clientId: created.client.clientId },
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('creates an additional workspace-linked runtime session for an existing client', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-additional-workspace-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const created = gateway.clients.create({
        name: 'Northline Dental',
        workspaceRoot: path.join(root, 'workspaces', 'northline-primary'),
        workspaceName: 'Northline Primary',
      })

      const followUp = gateway.workspaces.create({
        clientId: created.client.clientId,
        name: 'Northline Follow-up',
        workspaceRoot: path.join(root, 'workspaces', 'northline-follow-up'),
      })

      expect(followUp.workspace).toMatchObject({
        clientId: created.client.clientId,
        name: 'Northline Follow-up',
        root: path.resolve(path.join(root, 'workspaces', 'northline-follow-up')),
        status: 'active',
      })
      expect(followUp.session).toMatchObject({
        status: 'open',
        metadata: {
          clientId: created.client.clientId,
          workspaceId: followUp.workspace.workspaceId,
        },
      })
      expect(appState.workspaces.list({ clientId: created.client.clientId })).toHaveLength(2)
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'workspace.created',
            targetType: 'workspace',
            targetId: followUp.workspace.workspaceId,
            metadata: { clientId: created.client.clientId },
          }),
          expect.objectContaining({
            action: 'session.created',
            targetType: 'session',
            targetId: followUp.session.sessionId,
            sessionId: followUp.session.sessionId,
            metadata: {
              clientId: created.client.clientId,
              workspaceId: followUp.workspace.workspaceId,
            },
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('deletes an empty workspace only when no linked runtime or app-state records remain', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-delete-workspace-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Disposable Workspace',
        root: path.join(root, 'workspaces', 'disposable'),
      })

      expect(gateway.workspaces.delete(workspace.workspaceId)).toEqual({
        workspaceId: workspace.workspaceId,
        deleted: true,
      })
      expect(appState.workspaces.get(workspace.workspaceId)).toBeNull()
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'workspace.deleted',
            targetType: 'workspace',
            targetId: workspace.workspaceId,
            metadata: { clientId: client.clientId },
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('refuses to delete a workspace when linked records or runtime sessions still exist', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-delete-workspace-guard-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Protected Workspace',
        root: path.join(root, 'workspaces', 'protected'),
      })
      appState.agents.create({
        workspaceId: workspace.workspaceId,
        name: 'Attached Agent',
      })
      expect(() => gateway.workspaces.delete(workspace.workspaceId)).toThrow(
        'cannot be deleted while agents are attached',
      )

      const cleanWorkspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Session Workspace',
        root: path.join(root, 'workspaces', 'session'),
      })
      mainspring.sessions.create({
        sessionId: 'linked-session',
        workspace: { root: cleanWorkspace.root },
        metadata: { clientId: client.clientId, workspaceId: cleanWorkspace.workspaceId },
      })
      expect(() => gateway.workspaces.delete(cleanWorkspace.workspaceId)).toThrow(
        'cannot be deleted while runtime sessions are linked',
      )
    } finally {
      appState.close()
    }
  })

  it('deletes an empty client only when no linked workspaces or runtime sessions remain', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-delete-client-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ name: 'Northline Dental' })

      expect(gateway.clients.delete(client.clientId)).toEqual({
        clientId: client.clientId,
        deleted: true,
      })
      expect(appState.clients.get(client.clientId)).toBeNull()
      expect(appState.auditEvents.list({ category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'client.deleted',
            targetType: 'client',
            targetId: client.clientId,
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('refuses to delete a client when linked workspaces or runtime sessions still exist', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-delete-client-guard-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      appState.workspaces.create({
        clientId: client.clientId,
        name: 'Protected Workspace',
        root: path.join(root, 'workspaces', 'protected-client'),
      })
      expect(() => gateway.clients.delete(client.clientId)).toThrow(
        'cannot be deleted while workspaces are attached',
      )

      const cleanClient = appState.clients.create({ name: 'Beacon Smile' })
      mainspring.sessions.create({
        sessionId: 'linked-client-session',
        workspace: { root: path.join(root, 'workspaces', 'client-session') },
        metadata: { clientId: cleanClient.clientId },
      })
      expect(() => gateway.clients.delete(cleanClient.clientId)).toThrow(
        'cannot be deleted while runtime sessions are linked',
      )
    } finally {
      appState.close()
    }
  })

  it('projects sessions and queued runs while enqueueing through the mailbox seam', () => {
    const { sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-queued-')
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring })

    const session = mainspring.sessions.create({
      sessionId: 'gateway-session',
      workspace: { root: workspaceRoot },
      metadata: { clientId: 'client_1' },
    })
    const run = gateway.runs.start({
      sessionId: session.record.sessionId,
      input: 'Queue through the gateway.',
      allowedTools: [],
      providerId: 'openai',
      modelId: 'gpt-5.5',
      allowMemory: true,
      computerId: 'computer_custom',
      mode: 'chat',
    })

    const [pending] = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)
    if (!pending?.dispatch.success) {
      throw new Error(`Expected a valid mailbox dispatch, got ${pending?.dispatch.error.message ?? 'none'}.`)
    }
    expect(pending.runId).toBe(run.runId)
    expect(pending.dispatch.data.intent.message).toBe('Queue through the gateway.')
    expect(pending.dispatch.data.intent.runtimeOptions).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-5.5',
      memory: true,
    })

    expect(gateway.sessions.get(session.record.sessionId)).toMatchObject({
      sessionId: 'gateway-session',
      workspaceRoot,
      metadata: { clientId: 'client_1' },
    })
    expect(gateway.sessions.list()).toHaveLength(1)
    expect(gateway.runs.list(session.record.sessionId)).toEqual([
      expect.objectContaining({
        runId: run.runId,
        status: 'queued',
        input: 'Queue through the gateway.',
        pendingInboundCount: 1,
        eventCount: 0,
        providerId: 'openai',
        modelId: 'gpt-5.5',
        runtimeProfile: 'core-browser-memory',
        computerId: 'computer_custom',
      }),
    ])
  })

  it('starts queued runs from app-state metadata without leaking provider secrets', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-app-state-queued-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_acme',
        name: 'Acme Workspace',
        root: path.join(root, 'workspaces', 'acme'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_research',
        workspaceId: workspace.workspaceId,
        name: 'Research Agent',
        defaultModelId: 'agent/default-model',
      })
      const providerProfile = appState.providerProfiles.create({
        profileId: 'provider_profile_alternate',
        providerId: 'alternate',
        label: 'Alternate Provider',
        secretRef: 'env:ALTERNATE_API_KEY',
        defaultModelId: 'alternate/default-model',
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-app-state-session',
        workspace: { root: workspaceRoot },
      })

      const run = gateway.runs.startFromAppState({
        sessionId: session.record.sessionId,
        input: 'Route from app state.',
        allowedTools: [],
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        mode: 'chat',
      })

      const [pending] = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)
      if (!pending?.dispatch.success) {
        throw new Error(`Expected a valid mailbox dispatch, got ${pending?.dispatch.error.message ?? 'none'}.`)
      }
      const dispatch = pending.dispatch.data
      expect(pending.runId).toBe(run.runId)
      expect(dispatch.workspaceId).toBe(workspace.workspaceId)
      expect(dispatch.agentId).toBe(agent.agentId)
      expect(dispatch.intent.runtimeOptions).toMatchObject({
        providerId: 'alternate',
        modelId: 'alternate/default-model',
      })
      expect(JSON.stringify(dispatch)).toContain('"credentialRef":"env:ALTERNATE_API_KEY"')
      expect(JSON.stringify(dispatch)).not.toContain('sk-')
      expect(appState.runs.get(run.runId)).toMatchObject({
        runId: run.runId,
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: 'alternate',
        modelId: 'alternate/default-model',
      })
      expect(gateway.runs.list(session.record.sessionId)).toEqual([
        expect.objectContaining({
          runId: run.runId,
          workspaceId: workspace.workspaceId,
          agentId: agent.agentId,
          providerProfileId: providerProfile.profileId,
          providerId: 'alternate',
          modelId: 'alternate/default-model',
          pendingInboundCount: 1,
        }),
      ])
      expect(appState.auditEvents.list({ runId: run.runId })).toEqual([
        expect.objectContaining({
          category: 'gateway',
          action: 'run.enqueued',
          actor: 'local-gateway',
          targetType: 'run',
          targetId: run.runId,
          runId: run.runId,
          sessionId: session.record.sessionId,
        }),
      ])
    } finally {
      appState.close()
    }
  })

  it('fails closed before enqueueing when a requested execution backend is unavailable', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-cell-unavailable-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: { inspectBackends: () => fakeExecutionBackends({ wslAvailable: false }) },
    })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_unavailable_cell',
        name: 'Unavailable Cell Workspace',
        root: workspaceRoot,
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-cell-unavailable-session',
        workspace: { root: workspaceRoot },
        metadata: { workspaceId: workspace.workspaceId },
      })

      expect(() =>
        gateway.runs.start({
          sessionId: session.record.sessionId,
          workspaceId: workspace.workspaceId,
          input: 'This must not enter the mailbox.',
          allowedTools: [],
          computerId: 'computer_wsl',
          mode: 'chat',
        }),
      ).toThrow('Execution backend "wsl" is unavailable: WSL unavailable in test.')

      expect(MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)).toEqual([])
      expect(appState.runs.list({ sessionId: session.record.sessionId })).toEqual([])
      expect(appState.cellLeases.list()).toEqual([])
    } finally {
      appState.close()
    }
  })

  it('acquires and releases a gateway run cell lease around runtime completion', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-run-cell-lease-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: { inspectBackends: () => fakeExecutionBackends() },
    })

    await mainspring.start()
    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_run_cell',
        name: 'Run Cell Workspace',
        root: workspaceRoot,
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-run-cell-session',
        workspace: { root: workspaceRoot },
        metadata: { workspaceId: workspace.workspaceId },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        input: 'Complete through a leased host cell.',
        allowedTools: [],
        computerId: 'computer_local',
        mode: 'chat',
      })
      const leaseId = `lease_run_${run.runId}`
      const cellId = 'cell_run_workspace_run_cell_host'

      expect(appState.cells.get(cellId)).toMatchObject({
        cellId,
        workspaceId: workspace.workspaceId,
        label: 'Host shell (test)',
        metadata: expect.objectContaining({
          source: 'run-scheduler',
          backend: 'host',
          backendUnsafe: true,
          backendCapabilities: expect.objectContaining({
            isolationKind: 'host-process',
            isolationStrength: 'none',
            networkPolicy: 'host-inherited',
            unsafeFallback: true,
          }),
          requestedComputerId: 'computer_local',
          latestRunId: run.runId,
        }),
      })
      expect(appState.cellLeases.get(leaseId)).toMatchObject({
        leaseId,
        cellId,
        runId: run.runId,
        sessionId: session.record.sessionId,
        status: 'active',
      })

      await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )

      expect(appState.cellLeases.get(leaseId)).toMatchObject({
        leaseId,
        status: 'released',
        metadata: expect.objectContaining({
          source: 'run-scheduler',
          backendCapabilities: expect.objectContaining({
            isolationKind: 'host-process',
            isolationStrength: 'none',
            networkPolicy: 'host-inherited',
          }),
          terminalRunStatus: 'completed',
        }),
      })
      expect(appState.auditEvents.list({ runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'cells',
            action: 'lease.acquired',
            targetId: leaseId,
          }),
          expect.objectContaining({
            category: 'cells',
            action: 'lease.released',
            targetId: leaseId,
            metadata: expect.objectContaining({ terminalRunStatus: 'completed' }),
          }),
        ]),
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  })

  it('enforces configured HyperCell capacity before enqueueing another run for the same cell', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-run-cell-capacity-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cells: {
        inspectBackends: () => fakeExecutionBackends(),
        maxActiveLeasesPerCell: 1,
      },
    })

    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_capacity_cell',
        name: 'Capacity Cell Workspace',
        root: workspaceRoot,
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-run-cell-capacity-session',
        workspace: { root: workspaceRoot },
        metadata: { workspaceId: workspace.workspaceId },
      })

      const firstRun = gateway.runs.start({
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        input: 'Hold the only configured cell slot.',
        allowedTools: [],
        computerId: 'computer_local',
        mode: 'chat',
      })

      expect(() =>
        gateway.runs.start({
          sessionId: session.record.sessionId,
          workspaceId: workspace.workspaceId,
          input: 'This should be blocked by cell capacity.',
          allowedTools: [],
          computerId: 'computer_local',
          mode: 'chat',
        }),
      ).toThrow('HyperCell capacity exhausted for cell_run_workspace_capacity_cell_host: 1/1 active leases.')

      const pending = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)
      expect(pending.map((message) => message.runId)).toEqual([firstRun.runId])
      expect(appState.cellLeases.list({ status: 'active' })).toEqual([
        expect.objectContaining({
          leaseId: `lease_run_${firstRun.runId}`,
          runId: firstRun.runId,
        }),
      ])
      expect(appState.auditEvents.list({ category: 'cells' })).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'lease.acquired' }),
        expect.objectContaining({
          action: 'capacity.blocked',
          targetId: 'cell_run_workspace_capacity_cell_host',
          metadata: expect.objectContaining({
            workspaceId: workspace.workspaceId,
            backend: 'host',
            backendUnsafe: true,
            backendCapabilities: expect.objectContaining({
              isolationKind: 'host-process',
              isolationStrength: 'none',
              networkPolicy: 'host-inherited',
            }),
            requestedComputerId: 'computer_local',
            activeLeases: 1,
            maxActiveLeases: 1,
          }),
        }),
      ]))
      expect(gateway.cells.status()).toMatchObject({
        capacityEnforced: true,
        maxActiveLeasesPerCell: 1,
        leases: { active: 1, released: 0, expired: 0, total: 1 },
        lastCapacityBlock: expect.objectContaining({
          cellId: 'cell_run_workspace_capacity_cell_host',
          workspaceId: workspace.workspaceId,
          requestedComputerId: 'computer_local',
          backend: 'host',
          activeLeases: 1,
          maxActiveLeases: 1,
        }),
      })
    } finally {
      appState.close()
    }
  })

  it('routes app-state-backed runs through the runtime kernel and selected provider', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-app-state-live-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const defaultProvider = new MockProvider([
      { type: 'event', event: { type: 'result', text: 'default provider' } },
    ])
    const alternateProvider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'result',
          text: `${input.providerId ?? 'missing'}:${input.model ?? 'missing'}`,
        },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: defaultProvider,
      providers: { alternate: alternateProvider },
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_live',
        name: 'Live Workspace',
        root: workspaceRoot,
      })
      const agent = appState.agents.create({
        agentId: 'agent_live',
        workspaceId: workspace.workspaceId,
        name: 'Live Agent',
        defaultModelId: 'agent/default-model',
      })
      const providerProfile = appState.providerProfiles.create({
        profileId: 'provider_profile_live',
        providerId: 'alternate',
        label: 'Live Alternate',
        secretRef: 'managed:alternate-profile',
        defaultModelId: 'alternate/live-model',
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-app-state-live-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.startFromAppState({
        sessionId: session.record.sessionId,
        input: 'Use app-state routing.',
        allowedTools: [],
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        mode: 'chat',
      })

      const completed = await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      expect(completed).toMatchObject({
        status: 'completed',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: 'alternate',
        modelId: 'alternate/live-model',
      })
      expect(completed.eventCount).toBeGreaterThan(0)
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'assistant.text.done',
            payload: { text: 'alternate:alternate/live-model' },
          }),
          expect.objectContaining({ type: 'run.completed' }),
        ]),
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  })

  it('builds a read-only snapshot from app-state and runtime projections', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-snapshot-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const defaultProvider = new MockProvider([
      { type: 'event', event: { type: 'result', text: 'default provider' } },
    ])
    const alternateProvider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'result',
          text: `${input.providerId ?? 'missing'}:${input.model ?? 'missing'}`,
        },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: defaultProvider,
      providers: { alternate: alternateProvider },
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const client = appState.clients.create({ clientId: 'client_snapshot', name: 'Snapshot Client' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_snapshot',
        clientId: client.clientId,
        name: 'Snapshot Workspace',
        root: workspaceRoot,
      })
      const agent = appState.agents.create({
        agentId: 'agent_snapshot',
        workspaceId: workspace.workspaceId,
        name: 'Snapshot Agent',
      })
      const providerProfile = appState.providerProfiles.create({
        profileId: 'provider_profile_snapshot',
        providerId: 'alternate',
        label: 'Snapshot Provider',
        secretRef: 'managed:snapshot-profile',
        defaultModelId: 'alternate/snapshot-model',
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-snapshot-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.startFromAppState({
        sessionId: session.record.sessionId,
        input: 'Snapshot this run.',
        allowedTools: [],
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        mode: 'chat',
      })

      await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )

      appState.approvals.upsert({
        approvalId: 'approval_snapshot',
        runId: run.runId,
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        status: 'approved',
        targetKey: 'file.write',
        requestedAt: '2026-06-27T12:00:00.000Z',
        resolvedAt: '2026-06-27T12:00:02.000Z',
      })
      appState.artifacts.create({
        artifactId: 'artifact_snapshot',
        runId: run.runId,
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        kind: 'report',
        label: 'Snapshot report',
        path: path.join(root, 'artifacts', 'snapshot.md'),
        mediaType: 'text/markdown',
        sizeBytes: 256,
      })
      appState.usageLedger.create({
        entryId: 'usage_snapshot',
        runId: run.runId,
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        providerId: 'alternate',
        modelId: 'alternate/snapshot-model',
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        estimatedCostUsd: 0.003,
      })
      appState.auditEvents.create({
        eventId: 'audit_snapshot',
        category: 'run',
        action: 'completed',
        actor: 'runtime',
        targetType: 'run',
        targetId: run.runId,
        runId: run.runId,
        sessionId: session.record.sessionId,
      })
      const deploymentTarget = appState.deploymentTargets.create({
        targetId: 'deployment_target_snapshot',
        workspaceId: workspace.workspaceId,
        label: 'Snapshot VPS',
        kind: 'vps',
      })
      appState.deploymentRuns.upsert({
        deploymentRunId: 'deployment_run_snapshot',
        targetId: deploymentTarget.targetId,
        runId: run.runId,
        sessionId: session.record.sessionId,
        status: 'succeeded',
      })
      const cell = appState.cells.create({
        cellId: 'cell_snapshot',
        workspaceId: workspace.workspaceId,
        label: 'Snapshot Cell',
      })
      appState.cellLeases.upsert({
        leaseId: 'cell_lease_snapshot',
        cellId: cell.cellId,
        runId: run.runId,
        sessionId: session.record.sessionId,
        status: 'active',
      })
      appState.cellSnapshots.create({
        snapshotId: 'cell_snapshot_image',
        cellId: cell.cellId,
        leaseId: 'cell_lease_snapshot',
        label: 'Post-login snapshot',
      })

      const snapshot = gateway.snapshot()
      expect(snapshot.health.running).toBe(true)
      expect(snapshot.appState.clients).toEqual([
        expect.objectContaining({ clientId: client.clientId }),
      ])
      expect(snapshot.appState.workspaces).toEqual([
        expect.objectContaining({ workspaceId: workspace.workspaceId }),
      ])
      expect(snapshot.appState.agents).toEqual([
        expect.objectContaining({ agentId: agent.agentId }),
      ])
      expect(snapshot.appState.providerProfiles).toEqual([
        expect.objectContaining({
          profileId: providerProfile.profileId,
          secretRef: 'managed:snapshot-profile',
        }),
      ])
      expect(snapshot.appState.runs).toEqual([
        expect.objectContaining({
          runId: run.runId,
          providerProfileId: providerProfile.profileId,
          providerId: 'alternate',
          modelId: 'alternate/snapshot-model',
        }),
      ])
      expect(snapshot.appState.approvals).toEqual([
        expect.objectContaining({
          approvalId: 'approval_snapshot',
          status: 'approved',
          targetKey: 'file.write',
        }),
      ])
      expect(snapshot.appState.artifacts).toEqual([
        expect.objectContaining({
          artifactId: 'artifact_snapshot',
          kind: 'report',
          path: path.resolve(path.join(root, 'artifacts', 'snapshot.md')),
        }),
      ])
      expect(snapshot.appState.usageLedger).toEqual([
        expect.objectContaining({
          entryId: 'usage_snapshot',
          totalTokens: 30,
          estimatedCostUsd: 0.003,
        }),
      ])
      expect(snapshot.appState.auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'gateway',
            action: 'run.enqueued',
            targetType: 'run',
            targetId: run.runId,
          }),
          expect.objectContaining({
            eventId: 'audit_snapshot',
            category: 'run',
            action: 'completed',
          }),
        ]),
      )
      expect(snapshot.appState.deploymentTargets).toEqual([
        expect.objectContaining({
          targetId: 'deployment_target_snapshot',
          workspaceId: workspace.workspaceId,
          label: 'Snapshot VPS',
          kind: 'vps',
        }),
      ])
      expect(snapshot.appState.deploymentRuns).toEqual([
        expect.objectContaining({
          deploymentRunId: 'deployment_run_snapshot',
          targetId: 'deployment_target_snapshot',
          runId: run.runId,
          status: 'succeeded',
        }),
      ])
      expect(snapshot.appState.cells).toEqual([
        expect.objectContaining({
          cellId: 'cell_snapshot',
          workspaceId: workspace.workspaceId,
          label: 'Snapshot Cell',
        }),
      ])
      expect(snapshot.appState.cellLeases).toEqual([
        expect.objectContaining({
          leaseId: 'cell_lease_snapshot',
          cellId: 'cell_snapshot',
          runId: run.runId,
          status: 'active',
        }),
      ])
      expect(snapshot.appState.cellSnapshots).toEqual([
        expect.objectContaining({
          snapshotId: 'cell_snapshot_image',
          cellId: 'cell_snapshot',
          label: 'Post-login snapshot',
        }),
      ])
      expect(snapshot.executionBackends).toEqual(
        expect.objectContaining({
          defaultBackend: 'host',
          backends: expect.arrayContaining([
            expect.objectContaining({
              key: 'host',
              available: true,
              unsafe: true,
            }),
          ]),
        }),
      )
      expect(snapshot.sessions).toEqual([
        expect.objectContaining({ sessionId: session.record.sessionId }),
      ])
      expect(snapshot.runs).toEqual([
        expect.objectContaining({
          runId: run.runId,
          status: 'completed',
          providerProfileId: providerProfile.profileId,
          providerId: 'alternate',
          modelId: 'alternate/snapshot-model',
        }),
      ])
      expect(snapshot.approvals).toEqual([])
      expect(JSON.stringify(snapshot)).not.toContain('sk-')
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'assistant.text.done' }),
          expect.objectContaining({ type: 'run.completed' }),
        ]),
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('projects runtime events and approval state without bypassing the kernel', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-live-')
    const provider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.write',
          input: { path: 'notes/output.txt', data: 'approved by gateway' },
          toolCallId: 'toolcall_1',
        },
      },
      {
        type: 'await_push',
        produce: { type: 'progress', message: 'waiting for approval' },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string }
          return {
            type: 'result',
            text: parsed.status === 'completed' ? 'gateway write complete' : 'gateway write failed',
          }
        },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-live-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Write through the gateway.',
        allowedTools: ['file.write'],
        mode: 'chat',
      })

      const pendingApproval = await waitFor(
        () => gateway.approvals.list()[0],
        (value): value is NonNullable<typeof value> => Boolean(value),
      )
      expect(pendingApproval).toMatchObject({
        runId: run.runId,
        sessionId: session.record.sessionId,
        status: 'pending',
        targetKey: 'file.write',
      })
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'approval.requested' })]),
      )

      gateway.approvals.approve({
        sessionId: pendingApproval.sessionId,
        runId: pendingApproval.runId,
        approvalId: pendingApproval.approvalId,
        reason: 'approved through local gateway boundary',
      })
      const immediateConsoleState = gatewaySnapshotToConsoleState(gateway.snapshot())
      expect(immediateConsoleState.approvalMetadata).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            approvalId: pendingApproval.approvalId,
            runId: run.runId,
            sessionId: session.record.sessionId,
            status: 'approved',
            targetKey: 'file.write',
          }),
        ]),
      )

      const completed = await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      expect(completed.eventCount).toBeGreaterThan(0)
      expect(gateway.approvals.list()).toEqual([])
      expect(appState.approvals.get(pendingApproval.approvalId)).toMatchObject({
        approvalId: pendingApproval.approvalId,
        runId: run.runId,
        sessionId: session.record.sessionId,
        status: 'approved',
        targetKey: 'file.write',
        metadata: expect.objectContaining({
          reasons: expect.arrayContaining([expect.any(String)]),
          permissionCategories: expect.arrayContaining(['filesystem:workspace-write']),
        }),
      })
      expect(appState.approvals.get(pendingApproval.approvalId)?.resolvedAt).toBeTruthy()
      expect(appState.auditEvents.list({ runId: run.runId, category: 'gateway' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'run.enqueued',
            targetType: 'run',
            targetId: run.runId,
          }),
          expect.objectContaining({
            action: 'approval.approved',
            targetType: 'approval',
            targetId: pendingApproval.approvalId,
          }),
        ]),
      )
      expect(fs.readFileSync(path.join(workspaceRoot, 'notes', 'output.txt'), 'utf8')).toBe(
        'approved by gateway',
      )
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'approval.approved' }),
          expect.objectContaining({ type: 'tool.call.completed' }),
          expect.objectContaining({ type: 'run.completed' }),
        ]),
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('keeps denied approval metadata fresh without allowing the mutation', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-denied-approval-',
    )
    const provider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.write',
          input: { path: 'denied.txt', data: 'must not be written\n' },
          toolCallId: 'toolcall_gateway_denied_write',
        },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string }
          return {
            type: 'result',
            text: parsed.status === 'denied' ? 'denied write respected' : 'unexpected write status',
          }
        },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const created = gateway.clients.create({
        name: 'Denied Client',
        workspaceName: 'Denied Workspace',
        workspaceRoot: path.join(root, 'denied-workspace'),
      })
      const sessionId = created.session!.sessionId
      const run = gateway.runs.start({
        sessionId,
        workspaceId: created.workspace!.workspaceId,
        input: 'Try to write a denied file.',
        allowedTools: ['file.write'],
        mode: 'chat',
      })

      const pendingApproval = await waitFor(
        () => gateway.approvals.list()[0],
        (value): value is NonNullable<typeof value> => Boolean(value),
      )
      gateway.approvals.deny({
        sessionId: pendingApproval.sessionId,
        runId: pendingApproval.runId,
        approvalId: pendingApproval.approvalId,
        reason: 'deny through gateway read model',
      })

      const immediateConsoleState = gatewaySnapshotToConsoleState(gateway.snapshot())
      expect(immediateConsoleState.approvalMetadata).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            approvalId: pendingApproval.approvalId,
            runId: run.runId,
            sessionId,
            workspaceId: created.workspace!.workspaceId,
            status: 'denied',
            targetKey: 'file.write',
          }),
        ]),
      )
      await waitFor(
        () => gateway.events.list({ sessionId, runId: run.runId, limit: 500 }),
        (events) => events.some((event) => event.type === 'approval.denied'),
      )
      await waitFor(
        () => gateway.runs.list(sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      expect(fs.existsSync(path.join(created.workspace!.root, 'denied.txt'))).toBe(false)
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('keeps SDK, gateway, and console projections aligned without leaking paths or secrets', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-projection-parity-',
    )
    const secretToken = 'sk-paritysecret123'
    const provider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'init',
          provider: 'openrouter',
          providerSessionId: `provider_session_${secretToken}`,
          modelId: 'openrouter/free',
          modelFamily: 'parity',
          providerTransport: 'openrouter-chat-completions',
        },
      },
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.write',
          input: { path: 'notes/parity.txt', data: `approved ${secretToken}` },
          toolCallId: 'toolcall_projection_parity',
        },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string }
          return {
            type: 'result',
            text: parsed.status === 'completed' ? 'projection parity complete' : 'projection parity failed',
          }
        },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const created = gateway.clients.create({
        name: 'Projection Client',
        workspaceName: 'Projection Workspace',
        workspaceRoot: path.join(root, 'client-workspace-secret-path'),
      })
      expect(created.session).toBeTruthy()
      expect(created.workspace).toBeTruthy()
      const sessionId = created.session!.sessionId
      const run = gateway.runs.start({
        sessionId,
        workspaceId: created.workspace!.workspaceId,
        input: 'Write projection parity note.',
        allowedTools: ['file.write'],
        modelId: 'openrouter/free',
        mode: 'chat',
      })

      const pendingApproval = await waitFor(
        () => gateway.approvals.list()[0],
        (value): value is NonNullable<typeof value> => Boolean(value),
      )
      gateway.approvals.approve({
        sessionId: pendingApproval.sessionId,
        runId: pendingApproval.runId,
        approvalId: pendingApproval.approvalId,
        reason: 'projection parity approval',
      })

      await waitFor(
        () => gateway.runs.list(sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      await waitFor(
        () => gateway.events.list({ sessionId, runId: run.runId, limit: 500 }),
        (events) => events.some((event) => event.type === 'approval.approved'),
      )
      const sdkEvents = mainspring.storage.eventStore.listRunEvents({
        sessionId,
        runId: run.runId,
        limit: 500,
      })
      const gatewayEvents = gateway.events.list({ sessionId, runId: run.runId, limit: 500 })
      expect(gatewayEvents.map((event) => event.seq)).toEqual(sdkEvents.map((event) => event.seq))
      expect(gatewayEvents.map((event) => event.type)).toEqual(sdkEvents.map((event) => event.type))
      expect(gatewayEvents).toEqual(sdkEvents)
      const projectedRun = gateway.runs.list(sessionId).find((candidate) => candidate.runId === run.runId)
      expect(projectedRun?.eventCount).toBe(sdkEvents.length)

      const serializedEvents = JSON.stringify(sdkEvents)
      expect(serializedEvents).not.toContain(secretToken)
      expect(serializedEvents).not.toContain(`provider_session_${secretToken}`)
      expect(serializedEvents).not.toContain(root)
      expect(serializedEvents).not.toContain(created.workspace!.root)

      const sessionRecord = mainspring.storage.stateStore.getSession(sessionId)
      expect(sessionRecord).toBeTruthy()
      const consoleSnapshot = gatewaySnapshotToConsoleState(gateway.snapshot())
      expect(consoleSnapshot.runs).toEqual([
        expect.objectContaining({
          runId: run.runId,
          sessionId,
          status: 'completed',
          workspaceId: created.workspace!.workspaceId,
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          modelFamily: 'parity',
          providerTransport: 'openrouter-chat-completions',
          providerSessionId: '[redacted]',
          eventCount: sdkEvents.length,
        }),
      ])
      expect(consoleSnapshot.approvalMetadata).toEqual([
        expect.objectContaining({
          approvalId: pendingApproval.approvalId,
          runId: run.runId,
          sessionId,
          workspaceId: created.workspace!.workspaceId,
          status: 'approved',
          targetKey: 'file.write',
        }),
      ])
      expect(consoleSnapshot.toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            toolCallId: 'toolcall_projection_parity',
            runId: run.runId,
            sessionId,
            workspaceId: created.workspace!.workspaceId,
            toolName: 'file.write',
            status: 'completed',
          }),
        ]),
      )
      const serializedConsole = JSON.stringify(consoleSnapshot)
      expect(serializedConsole).not.toContain(secretToken)
      expect(serializedConsole).not.toContain(`provider_session_${secretToken}`)
      expect(serializedConsole).not.toContain(root)
      expect(serializedConsole).not.toContain(created.workspace!.root)
      expect(serializedConsole).not.toContain(sessionRecord!.sessionPath)
      expect(fs.readFileSync(path.join(created.workspace!.root, 'notes', 'parity.txt'), 'utf8')).toBe(
        `approved ${secretToken}`,
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('derives provider and model metadata for completed runs from persisted provider-init warnings', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-derived-provider-')
    const provider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'init',
          provider: 'openrouter',
          providerSessionId: 'provider_runtime_session',
          modelId: input.model ?? 'openrouter/free',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
        },
      },
      {
        type: 'event',
        event: { type: 'result', text: 'derived metadata complete' },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-derived-provider-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Derive provider metadata from runtime events.',
        allowedTools: [],
        modelId: 'openrouter/free',
        mode: 'chat',
      })

      const completed = await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      expect(completed).toMatchObject({
        runId: run.runId,
        status: 'completed',
        providerId: 'openrouter',
        modelId: 'openrouter/free',
        modelFamily: 'claude',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: '[redacted]',
      })

      const snapshot = gateway.snapshot()
      expect(snapshot.runs).toEqual([
        expect.objectContaining({
          runId: run.runId,
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          providerSessionId: '[redacted]',
        }),
      ])
    } finally {
      await mainspring.stop()
    }
  }, 30_000)

  it('syncs runtime usage events into additive gateway usage-ledger rows', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-usage-ledger-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const provider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'init',
          provider: 'openrouter',
          providerSessionId: 'provider_runtime_session',
          modelId: input.model ?? 'openrouter/free',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
        },
      },
      {
        type: 'event',
        event: {
          type: 'usage',
          providerSessionId: 'provider_runtime_session',
          usage: {
            inputTokens: 3,
            outputTokens: 4,
            totalTokens: 7,
            cacheReadTokens: 1,
            reasoningTokens: 2,
          },
        },
      },
      {
        type: 'event',
        event: { type: 'result', text: 'usage metadata complete' },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-usage-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Capture usage metadata.',
        allowedTools: [],
        modelId: 'openrouter/free',
        mode: 'chat',
      })

      await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )

      const usageEntries = appState.usageLedger.list({ runId: run.runId })
      expect(usageEntries).toEqual([
        expect.objectContaining({
          runId: run.runId,
          sessionId: session.record.sessionId,
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7,
          estimatedCostUsd: 0,
          metadata: expect.objectContaining({
            pricingStatus: 'free',
            pricingModelId: 'openrouter/free',
            modelFamily: 'claude',
            providerTransport: 'openrouter-chat-completions',
            providerSessionId: '[redacted]',
            cacheReadTokens: 1,
            reasoningTokens: 2,
          }),
        }),
      ])

      const snapshot = gateway.snapshot()
      expect(snapshot.appState.usageLedger).toEqual([
        expect.objectContaining({
          runId: run.runId,
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          totalTokens: 7,
          estimatedCostUsd: 0,
        }),
      ])
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('prices gateway usage-ledger rows from a configured local catalog', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-priced-usage-ledger-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const provider = new MockProvider(() => [
      {
        type: 'event',
        event: {
          type: 'init',
          provider: 'openai',
          providerSessionId: 'provider_priced_session',
          modelId: 'gpt-priced',
          providerTransport: 'openai-compatible-responses',
        },
      },
      {
        type: 'event',
        event: {
          type: 'usage',
          providerSessionId: 'provider_priced_session',
          usage: {
            inputTokens: 1_000,
            outputTokens: 500,
            totalTokens: 1_500,
          },
        },
      },
      {
        type: 'event',
        event: { type: 'result', text: 'priced usage complete' },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      pricingCatalog: [
        {
          providerId: 'openai',
          modelId: 'gpt-priced',
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 6,
        },
      ],
    })
    expect(gateway.snapshot().pricingCatalog).toEqual({
      source: 'configured',
      configured: true,
      entries: 1,
      builtInEntries: 1,
      configuredEntries: 1,
      sourceLabel: 'in-process catalog',
    })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-priced-usage-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Capture priced usage metadata.',
        allowedTools: [],
        modelId: 'gpt-priced',
        mode: 'chat',
      })

      await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )

      expect(appState.usageLedger.list({ runId: run.runId })).toEqual([
        expect.objectContaining({
          runId: run.runId,
          sessionId: session.record.sessionId,
          providerId: 'openai',
          modelId: 'gpt-priced',
          inputTokens: 1_000,
          outputTokens: 500,
          totalTokens: 1_500,
          estimatedCostUsd: 0.005,
          metadata: expect.objectContaining({
            pricingStatus: 'estimated',
            pricingModelId: 'gpt-priced',
            providerTransport: 'openai-compatible-responses',
            providerSessionId: '[redacted]',
          }),
        }),
      ])
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('records budget threshold transition audits when synced usage pushes a scope into blocked status', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-budget-threshold-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const provider = new MockProvider(() => [
      {
        type: 'event',
        event: {
          type: 'init',
          provider: 'openrouter',
          providerSessionId: 'provider_runtime_session',
          modelId: 'openrouter/free',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
        },
      },
      {
        type: 'event',
        event: {
          type: 'usage',
          providerSessionId: 'provider_runtime_session',
          usage: {
            inputTokens: 3,
            outputTokens: 4,
            totalTokens: 7,
          },
        },
      },
      {
        type: 'event',
        event: { type: 'result', text: 'usage metadata complete' },
      },
    ])
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider,
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    await mainspring.start()
    try {
      const client = appState.clients.create({ clientId: 'client_budget_threshold', name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_budget_threshold',
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_budget_threshold',
        workspaceId: workspace.workspaceId,
        name: 'Budget Agent',
      })
      const session = mainspring.sessions.create({
        sessionId: 'budget-threshold-session',
        workspace: { root: workspace.root },
        metadata: {
          clientId: client.clientId,
          workspaceId: workspace.workspaceId,
        },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Capture usage metadata.',
        allowedTools: [],
        modelId: 'openrouter/free',
        mode: 'chat',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
      })
      const budget = gateway.budgets.create({
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Zero-dollar workspace budget',
        maxEstimatedCostUsd: 0,
        warnAtUsd: 0,
      })

      await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )

      expect(appState.auditEvents.list({ category: 'billing' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'budget.threshold.blocked',
            targetType: 'budget',
            targetId: budget.budgetId,
            runId: run.runId,
            sessionId: session.record.sessionId,
            metadata: expect.objectContaining({
              fromStatus: 'ok',
              toStatus: 'blocked',
              workspaceId: workspace.workspaceId,
              agentId: agent.agentId,
            }),
          }),
        ]),
      )
    } finally {
      await mainspring.stop()
      appState.close()
    }
  }, 30_000)

  it('syncs runtime tool-call events into additive gateway tool-call rows', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-tool-calls-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-tool-call-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Read the note.',
        allowedTools: [],
        mode: 'chat',
      })
      const mailbox = MainspringMailbox.fromSessionPath(session.record.sessionPath)

      mailbox.writeEvent(
        {
          type: 'tool.call',
          runId: run.runId,
          toolCallId: 'call_1',
          name: 'file.read',
          input: { path: 'notes/input.txt' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'tool.result',
          runId: run.runId,
          toolCallId: 'call_1',
          name: 'file.read',
          status: 'completed',
          output: { artifactId: 'artifact_tool_result' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'tool.update',
          runId: run.runId,
          toolCallId: 'call_2',
          message: 'still running',
          payload: { progress: 0.5 },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'file.change',
          runId: run.runId,
          path: 'notes/output.md',
          action: 'updated',
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'memory.event',
          runId: run.runId,
          action: 'stored',
          metadata: { scope: 'workspace' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'skill.event',
          runId: run.runId,
          skillKey: 'summary',
          action: 'installed',
          metadata: { version: '1.0.0' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'browser.event',
          runId: run.runId,
          event: 'navigated',
          payload: { url: 'https://example.test' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'browser.screenshot',
          runId: run.runId,
          artifactId: 'artifact_browser_1',
          url: 'https://example.test/screenshot.png',
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'run.status',
          runId: run.runId,
          status: 'waiting_approval',
          phase: 'tool-policy',
        },
        session.record.sessionId,
      )

      const snapshot = gateway.snapshot()
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file.changed',
            payload: {
              path: 'notes/output.md',
              action: 'updated',
            },
          }),
          expect.objectContaining({
            type: 'memory.updated',
            payload: {
              action: 'stored',
              metadata: { scope: 'workspace' },
            },
          }),
          expect.objectContaining({
            type: 'skill.updated',
            payload: {
              skillKey: 'summary',
              action: 'installed',
              metadata: { version: '1.0.0' },
            },
          }),
          expect.objectContaining({
            type: 'browser.updated',
            payload: {
              action: 'navigated',
              payload: { url: 'https://example.test' },
            },
          }),
          expect.objectContaining({
            type: 'browser.screenshot.created',
            payload: {
              artifactId: 'artifact_browser_1',
              url: 'https://example.test/screenshot.png',
            },
          }),
          expect.objectContaining({
            type: 'run.awaiting_approval',
            payload: {
              phase: 'tool-policy',
            },
          }),
        ]),
      )
      const toolCalls = appState.toolCalls.list({ runId: run.runId })
      expect(toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            toolCallId: 'call_1',
            runId: run.runId,
            sessionId: session.record.sessionId,
            toolName: 'file.read',
            status: 'completed',
            outputRef: 'artifact_tool_result',
            metadata: expect.objectContaining({
              sourceSeq: expect.any(Number),
            }),
          }),
          expect.objectContaining({
            toolCallId: 'call_2',
            runId: run.runId,
            sessionId: session.record.sessionId,
            toolName: 'call_2',
            status: 'updated',
          }),
        ]),
      )

      expect(snapshot.appState.toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            toolCallId: 'call_1',
            runId: run.runId,
            sessionId: session.record.sessionId,
            toolName: 'file.read',
            status: 'completed',
            outputRef: 'artifact_tool_result',
          }),
          expect.objectContaining({
            toolCallId: 'call_2',
            runId: run.runId,
            sessionId: session.record.sessionId,
            toolName: 'call_2',
            status: 'updated',
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('projects execution-backed tool results into cell, lease, and snapshot rows', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-execution-cells-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ clientId: 'client_exec', name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_exec',
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const session = mainspring.sessions.create({
        sessionId: 'gateway-execution-cell-session',
        workspace: { root: workspace.root },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Run through the execution backend.',
        allowedTools: [],
        mode: 'chat',
        workspaceId: workspace.workspaceId,
      })
      const mailbox = MainspringMailbox.fromSessionPath(session.record.sessionPath)

      mailbox.writeEvent(
        {
          type: 'tool.call',
          runId: run.runId,
          toolCallId: 'call_exec_1',
          name: 'terminal.start',
          input: { command: 'printf ok', backend: 'wsl' },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'tool.result',
          runId: run.runId,
          toolCallId: 'call_exec_1',
          name: 'terminal.start',
          status: 'completed',
          output: {
            sessionId: 'terminal_exec_1',
            backend: 'wsl',
            backendLabel: 'WSL bash',
            backendUnsafe: false,
            backendCapabilities: {
              isolationKind: 'wsl-distro',
              isolationStrength: 'userland-boundary',
              securityBoundary: 'distro-process',
              networkPolicy: 'host-inherited',
              workspaceMapping: 'wsl-mount',
              requiresApproval: true,
              unsafeFallback: false,
              limits: [
                'Available only when WSL is installed and a distro can execute bash.',
                'Does not disable network access.',
                'Maps the workspace through /mnt/<drive>; it is not a VM isolation guarantee.',
              ],
              verificationCommand: {
                command: 'wsl.exe',
                args: ['bash', '-lc', 'printf MAINSPRING_WSL_OK'],
              },
              accidentalHostPath: 'C:\\secret\\workspace',
            },
            executionCell: {
              cellKey: 'cell_exec_wsl_runtimekey1',
              label: 'WSL bash',
              backend: 'wsl',
              backendLabel: 'WSL bash',
              backendUnsafe: false,
              backendCapabilities: {
                isolationKind: 'wsl-distro',
                isolationStrength: 'userland-boundary',
                securityBoundary: 'distro-process',
                networkPolicy: 'host-inherited',
                workspaceMapping: 'wsl-mount',
                requiresApproval: true,
                unsafeFallback: false,
                limits: ['fallback capability record should not be used when top-level exists'],
              },
            },
            executionLease: {
              leaseId: 'lease_exec_terminal_exec_1',
              cellKey: 'cell_exec_wsl_runtimekey1',
              status: 'active',
              acquiredAt: '2026-06-30T13:59:00.000Z',
            },
            status: 'running',
          },
        },
        session.record.sessionId,
      )

      const snapshot = gateway.snapshot()
      const cells = appState.cells.list({ workspaceId: workspace.workspaceId })
      expect(cells).toEqual([
        expect.objectContaining({
          cellId: 'cell_exec_workspace_exec_wsl',
          workspaceId: workspace.workspaceId,
          label: 'WSL bash',
          metadata: expect.objectContaining({
            source: 'execution-backend',
            backend: 'wsl',
            backendUnsafe: false,
            backendCapabilities: expect.objectContaining({
              isolationKind: 'wsl-distro',
              isolationStrength: 'userland-boundary',
              networkPolicy: 'host-inherited',
              workspaceMapping: 'wsl-mount',
              requiresApproval: true,
              unsafeFallback: false,
              limits: expect.arrayContaining(['Does not disable network access.']),
            }),
            runtimeCellKey: 'cell_exec_wsl_runtimekey1',
            latestToolCallId: 'call_exec_1',
            latestExecutionStatus: 'running',
          }),
        }),
      ])
      expect(appState.cellLeases.list()).toEqual([
        expect.objectContaining({
          leaseId: 'lease_exec_terminal_exec_1',
          cellId: 'cell_exec_workspace_exec_wsl',
          runId: run.runId,
          sessionId: session.record.sessionId,
          status: 'active',
          metadata: expect.objectContaining({
            source: 'execution-backend',
            toolCallId: 'call_exec_1',
            toolName: 'terminal.start',
            backend: 'wsl',
            backendCapabilities: expect.objectContaining({
              isolationKind: 'wsl-distro',
              networkPolicy: 'host-inherited',
            }),
            runtimeCellKey: 'cell_exec_wsl_runtimekey1',
            runtimeLeaseStatus: 'active',
            runtimeLeaseAcquiredAt: '2026-06-30T13:59:00.000Z',
          }),
        }),
      ])
      expect(appState.cellSnapshots.list({ cellId: 'cell_exec_workspace_exec_wsl' })).toEqual([
        expect.objectContaining({
          cellId: 'cell_exec_workspace_exec_wsl',
          leaseId: 'lease_exec_terminal_exec_1',
          label: 'WSL bash running',
          metadata: expect.objectContaining({
            source: 'execution-backend',
            runtimeCellKey: 'cell_exec_wsl_runtimekey1',
            runtimeLeaseId: 'lease_exec_terminal_exec_1',
            backendCapabilities: expect.not.objectContaining({
              verificationCommand: expect.anything(),
              accidentalHostPath: expect.anything(),
            }),
            executionStatus: 'running',
          }),
        }),
      ])

      expect(snapshot.appState.cells).toEqual([
        expect.objectContaining({
          cellId: 'cell_exec_workspace_exec_wsl',
          label: 'WSL bash',
        }),
      ])
      expect(snapshot.appState.cellLeases).toEqual([
        expect.objectContaining({
          leaseId: 'lease_exec_terminal_exec_1',
          status: 'active',
        }),
      ])
      expect(snapshot.appState.cellSnapshots).toEqual([
        expect.objectContaining({
          cellId: 'cell_exec_workspace_exec_wsl',
          label: 'WSL bash running',
        }),
      ])
    } finally {
      appState.close()
    }
  })

  it('syncs runtime artifact truth into additive gateway artifact rows', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-artifacts-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'gateway-artifact-session',
        workspace: { root: workspaceRoot },
      })
      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Capture artifact metadata.',
        allowedTools: [],
        mode: 'chat',
      })
      const mailbox = MainspringMailbox.fromSessionPath(session.record.sessionPath)

      mailbox.writeEvent(
        {
          type: 'tool.result',
          runId: run.runId,
          toolCallId: 'tool_1',
          name: 'browser.screenshot',
          status: 'completed',
          output: {
            artifactId: 'shot_1',
            artifactLabel: 'Homepage',
            url: 'artifact://shot-1',
          },
        },
        session.record.sessionId,
      )
      mailbox.writeEvent(
        {
          type: 'artifact.created',
          runId: run.runId,
          artifactId: 'report_1',
          kind: 'file',
        },
        session.record.sessionId,
      )

      const snapshot = gateway.snapshot()
      expect(gateway.events.list({ sessionId: session.record.sessionId, runId: run.runId })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'artifact.created',
            payload: {
              artifactId: 'report_1',
              kind: 'file',
            },
          }),
        ]),
      )
      expect(snapshot.appState.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'shot_1',
            runId: run.runId,
            sessionId: session.record.sessionId,
            kind: 'image',
            label: 'Homepage',
            path: path.resolve(path.join(mainspring.storage.artifactStore.rootPath, 'shot_1')),
            mediaType: 'image/png',
            metadata: expect.objectContaining({
              sourceType: 'tool.result',
              toolName: 'browser.screenshot',
              url: 'artifact://shot-1',
            }),
          }),
          expect.objectContaining({
            artifactId: 'report_1',
            runId: run.runId,
            sessionId: session.record.sessionId,
            kind: 'file',
            path: path.resolve(path.join(mainspring.storage.artifactStore.rootPath, 'report_1')),
            metadata: expect.objectContaining({
              sourceType: 'artifact.created',
            }),
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('creates, updates, and manually triggers cron schedules through the gateway runtime path', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-cron-manual-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_cron',
        workspaceId: workspace.workspaceId,
        name: 'Cron Agent',
      })
      const providerProfile = appState.providerProfiles.create({
        profileId: 'provider_profile_cron',
        providerId: 'openrouter',
        label: 'OpenRouter',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
      })
      const session = mainspring.sessions.create({
        sessionId: 'cron-session',
        workspace: { root: workspace.root },
      })

      const schedule = gateway.cron.create({
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        label: 'Daily report',
        prompt: 'Build the morning report.',
        cronExpr: '0 9 * * 1',
        allowedTools: ['file.write'],
        runtimeProfile: 'core-browser-memory',
      })
      const updated = gateway.cron.update({
        scheduleId: schedule.scheduleId,
        cronExpr: '30 9 * * 1',
        enabled: false,
      })
      const run = gateway.cron.runNow(schedule.scheduleId)
      const [pending] = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)
      if (!pending?.dispatch.success) {
        throw new Error(`Expected cron mailbox dispatch, got ${pending?.dispatch.error.message ?? 'none'}.`)
      }

      expect(schedule).toMatchObject({
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        cronExpr: '0 9 * * 1',
        allowedTools: ['file.write'],
      })
      expect(updated).toMatchObject({
        scheduleId: schedule.scheduleId,
        cronExpr: '30 9 * * 1',
        enabled: false,
      })
      expect(pending.runId).toBe(run.runId)
      expect(pending.dispatch.data.intent.message).toBe('Build the morning report.')
      expect(pending.dispatch.data.intent.runtimeOptions).toMatchObject({
        providerId: 'openrouter',
        modelId: 'openrouter/free',
      })
      expect(appState.auditEvents.list({ category: 'cron' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'schedule.created', targetId: schedule.scheduleId }),
          expect.objectContaining({ action: 'schedule.updated', targetId: schedule.scheduleId }),
          expect.objectContaining({
            action: 'schedule.run-now',
            targetId: schedule.scheduleId,
            runId: run.runId,
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('persists budget status and blocks over-budget runs before they enter the mailbox', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-budget-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ clientId: 'client_budget', name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_budget',
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_budget',
        workspaceId: workspace.workspaceId,
        name: 'Budget Agent',
      })
      const session = mainspring.sessions.create({
        sessionId: 'budget-session',
        workspace: { root: workspace.root },
        metadata: {
          clientId: client.clientId,
          workspaceId: workspace.workspaceId,
        },
      })
      const budget = gateway.budgets.create({
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Northline workspace budget',
        maxEstimatedCostUsd: 1,
        warnAtUsd: 0.5,
      })
      const runMetadata = appState.runs.upsert({
        runId: 'run_prior',
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
      })
      appState.usageLedger.create({
        entryId: 'usage_prior',
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        workspaceId: workspace.workspaceId,
        estimatedCostUsd: 1.25,
      })

      expect(gateway.budgets.status()).toMatchObject({
        blocked: 1,
        warnings: 0,
        usageStatus: expect.objectContaining({
          unpricedEntries: 0,
          pricedEntries: 1,
          estimatedCostUsd: 1.25,
          total: expect.objectContaining({
            summary: expect.objectContaining({
              entries: 1,
              estimatedCostUsd: 1.25,
            }),
          }),
          workspaces: expect.arrayContaining([
            expect.objectContaining({
              scopeId: workspace.workspaceId,
              scopeLabel: 'Northline Workspace',
              summary: expect.objectContaining({
                entries: 1,
                estimatedCostUsd: 1.25,
              }),
            }),
          ]),
          agents: expect.arrayContaining([
            expect.objectContaining({
              scopeId: agent.agentId,
              scopeLabel: 'Budget Agent',
              summary: expect.objectContaining({
                entries: 1,
                estimatedCostUsd: 1.25,
              }),
            }),
          ]),
        }),
        evaluations: [
          expect.objectContaining({
            budgetId: budget.budgetId,
            scopeType: 'workspace',
            scopeId: workspace.workspaceId,
            status: 'blocked',
            usedEstimatedCostUsd: 1.25,
          }),
        ],
      })
      expect(() =>
        gateway.runs.start({
          sessionId: session.record.sessionId,
          input: 'Try to run despite budget.',
          mode: 'chat',
          allowedTools: ['file.read'],
          workspaceId: workspace.workspaceId,
          agentId: agent.agentId,
        }),
      ).toThrow('Run blocked by budget')
      expect(MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)).toEqual([])

      const snapshot = gateway.snapshot()
      expect(snapshot.appState.budgets).toEqual([
        expect.objectContaining({
          budgetId: budget.budgetId,
          scopeType: 'workspace',
          scopeId: workspace.workspaceId,
        }),
      ])
      expect(snapshot.budgetStatus.evaluations).toEqual([
        expect.objectContaining({
          budgetId: budget.budgetId,
          status: 'blocked',
        }),
      ])
      expect(snapshot.usageStatus.total.summary).toMatchObject({
        entries: 1,
        estimatedCostUsd: 1.25,
      })
      expect(appState.auditEvents.list({ category: 'billing' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'budget.created',
            targetType: 'workspace',
            targetId: workspace.workspaceId,
          }),
          expect.objectContaining({
            action: 'budget.blocked',
            targetType: 'session',
            targetId: session.record.sessionId,
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('requires explicit acknowledgement before starting a run against warning-band budgets', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-budget-warn-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ clientId: 'client_warn', name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_warn',
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_warn',
        workspaceId: workspace.workspaceId,
        name: 'Budget Agent',
      })
      const session = mainspring.sessions.create({
        sessionId: 'budget-warn-session',
        workspace: { root: workspace.root },
        metadata: {
          clientId: client.clientId,
          workspaceId: workspace.workspaceId,
        },
      })
      const budget = gateway.budgets.create({
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Northline workspace budget',
        maxEstimatedCostUsd: 1,
        warnAtUsd: 0.5,
      })
      appState.runs.upsert({
        runId: 'run_prior_warn',
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
      })
      appState.usageLedger.create({
        entryId: 'usage_prior_warn',
        runId: 'run_prior_warn',
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        estimatedCostUsd: 0.6,
      })

      expect(() =>
        gateway.runs.start({
          sessionId: session.record.sessionId,
          input: 'Start without acknowledging the warning budget.',
          mode: 'chat',
          allowedTools: ['file.read'],
          workspaceId: workspace.workspaceId,
          agentId: agent.agentId,
        }),
      ).toThrow('Run requires budget warning acknowledgement')

      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Start after acknowledging the warning budget.',
        mode: 'chat',
        allowedTools: ['file.read'],
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        allowBudgetWarning: true,
      })
      expect(run.runId).toMatch(/^run_/)
      const pending = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)
      const dispatch = pending.find((message) => message.runId === run.runId)?.dispatch
      expect(dispatch?.success ? dispatch.data.policy.budget : undefined).toEqual({
        status: 'warn',
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        budgetId: budget.budgetId,
        label: 'Northline workspace budget',
        reason: 'Budget warning acknowledged: Northline workspace budget (Northline Workspace)',
        estimatedCostUsd: 0.6,
        remainingEstimatedCostUsd: 0.4,
        requireApproval: false,
        enforceUsageLimit: true,
        costSensitiveTools: {
          mode: 'approval',
          reason: 'Budget warning requires review for cost-sensitive tools: Northline workspace budget (Northline Workspace)',
        },
      })

      expect(appState.auditEvents.list({ category: 'billing' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'budget.warning_ack_required',
            targetType: 'session',
            targetId: session.record.sessionId,
            metadata: expect.objectContaining({ budgetIds: [budget.budgetId] }),
          }),
          expect.objectContaining({
            action: 'budget.warn',
            runId: run.runId,
            sessionId: session.record.sessionId,
          }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('requires explicit acknowledgement before starting a run against budgets with unpriced usage', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-budget-unpriced-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })

    try {
      const client = appState.clients.create({ clientId: 'client_unpriced', name: 'Northline Dental' })
      const workspace = appState.workspaces.create({
        workspaceId: 'workspace_unpriced',
        clientId: client.clientId,
        name: 'Northline Workspace',
        root: path.join(root, 'workspaces', 'northline'),
      })
      const agent = appState.agents.create({
        agentId: 'agent_unpriced',
        workspaceId: workspace.workspaceId,
        name: 'Budget Agent',
      })
      const session = mainspring.sessions.create({
        sessionId: 'budget-unpriced-session',
        workspace: { root: workspace.root },
        metadata: {
          clientId: client.clientId,
          workspaceId: workspace.workspaceId,
        },
      })
      const budget = gateway.budgets.create({
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Northline workspace budget',
        maxEstimatedCostUsd: 1,
        warnAtUsd: 0.5,
      })
      appState.runs.upsert({
        runId: 'run_prior_unpriced',
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
      })
      appState.usageLedger.create({
        entryId: 'usage_prior_unpriced',
        runId: 'run_prior_unpriced',
        sessionId: session.record.sessionId,
        workspaceId: workspace.workspaceId,
      })

      expect(gateway.budgets.status().evaluations).toEqual([
        expect.objectContaining({
          budgetId: budget.budgetId,
          status: 'warn',
          usedEstimatedCostUsd: 0,
          usageEntryCount: 1,
          pricedUsageEntryCount: 0,
          unpricedUsageEntryCount: 1,
          estimateCoverage: 'incomplete',
          costSensitiveTools: {
            mode: 'approval',
            reason: 'Budget has 1 unpriced usage entry requiring review: Northline workspace budget (Northline Workspace)',
          },
        }),
      ])

      expect(() =>
        gateway.runs.start({
          sessionId: session.record.sessionId,
          input: 'Start without acknowledging unpriced usage.',
          mode: 'chat',
          allowedTools: ['file.read'],
          workspaceId: workspace.workspaceId,
          agentId: agent.agentId,
        }),
      ).toThrow('Run requires budget warning acknowledgement')

      const run = gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Start after reviewing unpriced usage.',
        mode: 'chat',
        allowedTools: ['file.read'],
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        allowBudgetWarning: true,
      })
      const pending = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)
      const dispatch = pending.find((message) => message.runId === run.runId)?.dispatch
      expect(dispatch?.success ? dispatch.data.policy.budget : undefined).toMatchObject({
        status: 'warn',
        budgetId: budget.budgetId,
        estimatedCostUsd: 0,
        remainingEstimatedCostUsd: 1,
        enforceUsageLimit: true,
        costSensitiveTools: {
          mode: 'approval',
          reason: 'Budget has 1 unpriced usage entry requiring review: Northline workspace budget (Northline Workspace)',
        },
      })
    } finally {
      appState.close()
    }
  })

  it('ticks due cron schedules into real queued runs without bypassing the mailbox', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-cron-tick-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const tickNow = new Date('2026-06-30T14:00:00.000Z')
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      cron: {
        enabled: false,
        now: () => tickNow,
      },
      cells: { inspectBackends: () => fakeExecutionBackends({ wslAvailable: true }) },
    })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'cron-tick-session',
        workspace: { root: workspaceRoot },
      })
      appState.cronSchedules.create({
        scheduleId: 'schedule_tick',
        sessionId: session.record.sessionId,
        computerId: 'computer_wsl',
        label: 'Due schedule',
        prompt: 'Run from scheduler.',
        cronExpr: '0 * * * *',
        enabled: true,
        nextRunAt: '2026-06-30T13:00:00.000Z',
      })

      await gateway.cron.tick()

      const [pending] = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)
      if (!pending?.dispatch.success) {
        throw new Error(`Expected scheduled mailbox dispatch, got ${pending?.dispatch.error.message ?? 'none'}.`)
      }

      expect(pending.dispatch.data.intent.message).toBe('Run from scheduler.')
      expect(pending.dispatch.data.computerId).toBe('computer_wsl')
      expect(appState.cronSchedules.get('schedule_tick')).toMatchObject({
        scheduleId: 'schedule_tick',
        computerId: 'computer_wsl',
        lastRunAt: tickNow.toISOString(),
        nextRunAt: '2026-06-30T15:00:00.000Z',
      })
      expect(gateway.cron.status()).toMatchObject({
        enabled: false,
        running: false,
        lastTickAt: tickNow.toISOString(),
      })
    } finally {
      appState.close()
    }
  })

  it('ticks due cron schedules into RunLog runs when the gateway has a RunLog host', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-cron-runlog-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'cron ok' } }]),
    })
    const tickNow = new Date('2026-06-30T14:00:00.000Z')
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      runLog,
      appState,
      cron: {
        enabled: false,
        now: () => tickNow,
      },
    })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'cron-runlog-session',
        workspace: { root: workspaceRoot },
      })
      appState.cronSchedules.create({
        scheduleId: 'schedule_runlog',
        sessionId: session.record.sessionId,
        label: 'RunLog due schedule',
        prompt: 'Run through RunLog.',
        cronExpr: '0 * * * *',
        enabled: true,
        nextRunAt: '2026-06-30T13:00:00.000Z',
      })

      await gateway.cron.tick()
      await runLog.drainUntilIdle()

      expect(MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)).toEqual([])
      const runMetadata = appState.runs.list({ sessionId: session.record.sessionId })[0]
      expect(runMetadata).toMatchObject({
        sessionId: session.record.sessionId,
        metadata: expect.objectContaining({
          runtime: 'runlog',
          scheduleId: 'schedule_runlog',
          trigger: 'scheduler',
          headless: true,
          cronDecisionState: 'allow',
        }),
      })
      expect(runMetadata?.runId).toBeTruthy()
      const run = runLog.store.getRun(runMetadata!.runId)
      expect(run).toMatchObject({ status: 'completed', input: 'Run through RunLog.' })
      expect(runLog.store.listEvents({ runId: runMetadata!.runId }).map((event) => event.type)).toEqual(
        expect.arrayContaining([
          'cron.due',
          'policy.decision.recorded',
          'input.received',
          'run.queued',
          'run.completed',
        ]),
      )
      expect(appState.cronSchedules.get('schedule_runlog')?.metadata).toMatchObject({
        headless: true,
        trigger: 'scheduler',
        cronScheduleKey: '0 * * * *|local',
        lastDecision: expect.objectContaining({ state: 'allow' }),
      })
    } finally {
      runLog.close()
      appState.close()
    }
  })

  it('fails side-effecting RunLog cron schedules closed without a scoped grant', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-cron-runlog-deny-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'should not run' } }]),
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      runLog,
      appState,
    })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'cron-runlog-deny-session',
        workspace: { root: workspaceRoot },
      })
      const schedule = gateway.cron.create({
        sessionId: session.record.sessionId,
        label: 'Unsafe headless schedule',
        prompt: 'Write a file without a cron grant.',
        cronExpr: '0 * * * *',
        allowedTools: ['file.write'],
      })

      const run = gateway.cron.runNow(schedule.scheduleId)

      expect(run.status).toBe('failed')
      expect(MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)).toEqual([])
      expect(runLog.store.listEvents({ runId: run.runId }).map((event) => event.type)).toEqual(
        expect.arrayContaining(['cron.due', 'policy.decision.recorded', 'run.failed']),
      )
      expect(runLog.store.listEvents({ runId: run.runId }).map((event) => event.type)).not.toContain(
        'input.received',
      )
      const decision = runLog.store
        .listEvents({ runId: run.runId })
        .find((event) => event.type === 'policy.decision.recorded')?.payload as
        | { state?: string; reasons?: string[] }
        | undefined
      expect(decision).toMatchObject({
        state: 'deny',
        reasons: expect.arrayContaining(['headless cron side effects require a scoped grant']),
      })
      expect(appState.cronSchedules.get(schedule.scheduleId)?.metadata).toMatchObject({
        lastDecision: expect.objectContaining({ state: 'deny' }),
      })
    } finally {
      runLog.close()
      appState.close()
    }
  })

  it('creates scoped RunLog cron grants for side-effecting gateway schedules', async () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-cron-runlog-grant-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const runLog = createRunLogMainspring({
      rootPath: path.join(root, 'runlog'),
      provider: new MockProvider([{ type: 'event', event: { type: 'result', text: 'grant ok' } }]),
    })
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      runLog,
      appState,
    })

    try {
      const session = mainspring.sessions.create({
        sessionId: 'cron-runlog-grant-session',
        workspace: { root: workspaceRoot },
      })
      const schedule = gateway.cron.create({
        sessionId: session.record.sessionId,
        label: 'Grant headless schedule',
        prompt: 'Run a granted file-capable schedule.',
        cronExpr: '0 * * * *',
        allowedTools: ['file.write'],
      })

      const before = gateway.cron.grantPreview(schedule.scheduleId)
      expect(before).toMatchObject({
        scheduleId: schedule.scheduleId,
        grantRequired: true,
        grantPresent: false,
        scheduleKey: '0 * * * *|local',
        decision: expect.objectContaining({ state: 'deny' }),
      })

      const granted = gateway.cron.createGrant({
        scheduleId: schedule.scheduleId,
        maxExecutionCount: 1,
        expiresInMs: 60_000,
        actor: 'test-operator',
      })

      expect(granted).toMatchObject({
        scheduleId: schedule.scheduleId,
        grantRequired: true,
        grantPresent: true,
        decision: expect.objectContaining({ state: 'allow' }),
        grant: expect.objectContaining({
          maxExecutionCount: 1,
          executionCount: 0,
          allowedTools: ['file.write'],
        }),
      })
      const run = gateway.cron.runNow(schedule.scheduleId)
      expect(run.status).toBe('queued')
      await runLog.drainUntilIdle()
      const completed = runLog.store.getRun(run.runId)
      expect(completed?.status).toBe('completed')
      expect(runLog.store.listEvents({ runId: run.runId }).map((event) => event.type)).toEqual(
        expect.arrayContaining(['cron.due', 'policy.decision.recorded', 'input.received', 'run.completed']),
      )
      expect(appState.cronSchedules.get(schedule.scheduleId)?.metadata).toMatchObject({
        cronMode: 'allowlist',
        cronGrant: expect.objectContaining({
          grantId: granted.grant?.grantId,
          executionCount: 1,
          maxExecutionCount: 1,
        }),
        lastDecision: expect.objectContaining({ state: 'allow' }),
      })
      expect(appState.auditEvents.list({ category: 'cron' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'schedule.grant.created',
            targetId: schedule.scheduleId,
            metadata: expect.objectContaining({ grantId: granted.grant?.grantId }),
          }),
        ]),
      )
    } finally {
      runLog.close()
      appState.close()
    }
  })

  it('installs a trusted local template into a real client/workspace/agent set', () => {
    const { root, sessionsRoot, workspaceRoot } = makeTempGatewayPaths(
      'mainspring-gateway-marketplace-install-',
    )
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const installRoot = path.join(root, 'installed-template')
    const gateway = createLocalMainspringGateway({
      runtime: mainspring,
      appState,
      marketplace: { repoRoot: process.cwd() },
    })

    try {
      const templates = gateway.marketplace.listTemplates()
      expect(templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            templateId: 'coding-agent',
            provenance: 'repo-examples',
            trusted: true,
          }),
        ]),
      )

      const installed = gateway.marketplace.installTemplate({
        templateId: 'coding-agent',
        workspaceRoot: installRoot,
      })

      expect(installed.template).toMatchObject({
        templateId: 'coding-agent',
        label: 'Coding Agent',
      })
      expect(installed.client).toMatchObject({
        name: 'Coding Client',
        status: 'active',
      })
      expect(installed.workspace).toMatchObject({
        name: 'Coding Workspace',
        root: path.resolve(installRoot),
      })
      expect(installed.agent).toMatchObject({
        workspaceId: installed.workspace?.workspaceId,
        name: 'Coding Agent',
        defaultModelId: 'gpt-4.1-mini',
        metadata: expect.objectContaining({
          templateId: 'coding-agent',
          templateProvenance: 'repo-examples',
          allowedTools: expect.arrayContaining(['file.read', 'file.write', 'shell.exec']),
        }),
      })
      expect(installed.installedFiles).toEqual([
        'agent.config.json',
        'policy.md',
        'README.md',
        'template-overview.md',
      ])
      expect(fs.existsSync(path.join(installRoot, 'agent.config.json'))).toBe(true)
      expect(fs.existsSync(path.join(installRoot, 'policy.md'))).toBe(true)
      expect(fs.existsSync(path.join(installRoot, 'README.md'))).toBe(true)
      expect(fs.existsSync(path.join(installRoot, 'run.mjs'))).toBe(false)
      expect(appState.auditEvents.list({ category: 'marketplace' })).toEqual([
        expect.objectContaining({
          action: 'template.installed',
          targetType: 'template',
          targetId: 'coding-agent',
        }),
      ])
    } finally {
      appState.close()
    }
  })
})
