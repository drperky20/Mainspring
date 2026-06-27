import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import { EchoProvider } from '../providers/EchoProvider.js'
import { MockProvider } from '../providers/MockProvider.js'
import { createMainspring } from '../sdk/Mainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from './index.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeTempGatewayPaths(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  return { root, sessionsRoot, workspaceRoot }
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
      expect(JSON.stringify(dispatch)).not.toContain(providerProfile.secretRef)
      expect(JSON.stringify(dispatch)).not.toContain('ALTERNATE_API_KEY')
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
  })

  it('projects runtime events and approval state without bypassing the kernel', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempGatewayPaths('mainspring-gateway-live-')
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
    const gateway = createLocalMainspringGateway({ runtime: mainspring })

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

      const completed = await waitFor(
        () => gateway.runs.list(session.record.sessionId).find((candidate) => candidate.runId === run.runId),
        (value): value is NonNullable<typeof value> => value?.status === 'completed',
      )
      expect(completed.eventCount).toBeGreaterThan(0)
      expect(gateway.approvals.list()).toEqual([])
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
    }
  })

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
  })
})
