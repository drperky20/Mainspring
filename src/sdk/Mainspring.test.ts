import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROVIDER_INIT_LOG_MESSAGE,
  type RunEventOfType,
} from '../contracts/runtime.js'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import { EchoProvider } from '../providers/EchoProvider.js'
import { MockProvider } from '../providers/MockProvider.js'
import { createMainspring } from './Mainspring.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeTempMainspringPaths(prefix: string) {
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

describe('Mainspring SDK', () => {
  it('creates sessions, runs a provider, and streams normalized events', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-echo-')
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        workspace: { root: workspaceRoot },
        metadata: { label: 'echo-session' },
      })
      const run = session.runs.start({
        input: 'Echo this back.',
        allowedTools: [],
        mode: 'chat',
      })

      const events = []
      for await (const event of run.events()) {
        events.push(event)
      }

      expect(events.map((event) => event.type)).toEqual([
        'run.started',
        'runtime.warning',
        'assistant.text.delta',
        'assistant.text.done',
        'run.completed',
      ])
      expect(await run.result()).toBe('Echo this back.')

      const snapshot = mainspring.monitoring.snapshot()
      expect(snapshot.sessions.total).toBe(1)
      expect(snapshot.runs.completed).toBe(1)
      expect(snapshot.health.running).toBe(true)
      expect(mainspring.sessions.get(session.record.sessionId)?.record.metadata).toMatchObject({
        label: 'echo-session',
      })
    } finally {
      await mainspring.stop()
    }
  })

  it('handles approval-gated tool execution and monitoring in-process', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-approval-')
    const provider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.write',
          input: { path: 'notes/output.txt', data: 'approved text' },
          toolCallId: 'toolcall_1',
        },
      },
      {
        type: 'await_push',
        produce: () => ({ type: 'progress', message: 'waiting for approval' }),
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string }
          return {
            type: 'result',
            text: parsed.status === 'completed' ? 'write complete' : 'write failed',
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

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        workspace: { root: workspaceRoot },
      })
      const run = session.runs.start({
        input: 'Write the output file.',
        allowedTools: ['file.write'],
        mode: 'chat',
      })

      const streamPromise = (async () => {
        const events = []
        for await (const event of run.events()) {
          events.push(event)
        }
        return events
      })()

      const pendingApproval = await waitFor(
        () => mainspring.approvals.list()[0],
        (value): value is NonNullable<typeof value> => Boolean(value),
      )
      expect(pendingApproval.status).toBe('pending')

      mainspring.approvals.approve({
        sessionId: pendingApproval.sessionId,
        runId: pendingApproval.runId,
        approvalId: pendingApproval.approvalId,
        reason: 'approved in sdk test',
      })

      const events = await streamPromise
      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          'run.started',
          'tool.call.requested',
          'approval.requested',
          'runtime.warning',
          'approval.approved',
          'tool.call.completed',
          'assistant.text.done',
          'run.completed',
        ]),
      )

      expect(fs.readFileSync(path.join(workspaceRoot, 'notes', 'output.txt'), 'utf8')).toBe(
        'approved text',
      )
      expect(await run.result()).toBe('write complete')

      const snapshot = mainspring.monitoring.snapshot()
      expect(snapshot.approvals.pending).toBe(0)
      expect(snapshot.runs.completed).toBe(1)
      expect(snapshot.tools.recent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'file.write', status: 'requested' }),
          expect.objectContaining({ name: 'file.write', status: 'completed' }),
        ]),
      )
    } finally {
      await mainspring.stop()
    }
  })

  it('routes runtime tool calls through each session workspace root', async () => {
    const { root, sessionsRoot } = makeTempMainspringPaths('mainspring-sdk-workspaces-')
    const firstWorkspace = path.join(root, 'workspaces', 'first')
    const secondWorkspace = path.join(root, 'workspaces', 'second')
    fs.mkdirSync(path.join(firstWorkspace, 'notes'), { recursive: true })
    fs.mkdirSync(path.join(secondWorkspace, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(firstWorkspace, 'notes', 'input.txt'), 'first workspace')
    fs.writeFileSync(path.join(secondWorkspace, 'notes', 'input.txt'), 'second workspace')

    const provider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.read',
          input: { path: 'notes/input.txt' },
          toolCallId: `read_${input.sessionId ?? 'unknown'}`,
        },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as {
            status?: string
            output?: { text?: string }
            error?: string
          }
          return {
            type: 'result',
            text: `${input.cwd}|${parsed.output?.text ?? parsed.error ?? parsed.status}`,
          }
        },
      },
    ])

    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot: root,
      provider,
      pollIntervalMs: 10,
    })

    await mainspring.start()
    try {
      const firstSession = mainspring.sessions.create({
        sessionId: 'first-session',
        workspace: { root: firstWorkspace },
      })
      const secondSession = mainspring.sessions.create({
        sessionId: 'second-session',
        workspace: { root: secondWorkspace },
      })

      const firstRun = firstSession.runs.start({
        input: 'Read the local note.',
        allowedTools: ['file.read'],
        mode: 'chat',
      })
      const secondRun = secondSession.runs.start({
        input: 'Read the local note.',
        allowedTools: ['file.read'],
        mode: 'chat',
      })

      await Promise.all([
        (async () => {
          for await (const _event of firstRun.events()) {
            // Drain to terminal event.
          }
        })(),
        (async () => {
          for await (const _event of secondRun.events()) {
            // Drain to terminal event.
          }
        })(),
      ])

      expect(await firstRun.result()).toBe(`${path.resolve(firstWorkspace)}|first workspace`)
      expect(await secondRun.result()).toBe(`${path.resolve(secondWorkspace)}|second workspace`)
    } finally {
      await mainspring.stop()
    }
  })

  it('preserves provider, model, computer, and runtime profile routing in mailbox dispatch', () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-dispatch-routing-')
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })

    const session = mainspring.sessions.create({
      sessionId: 'dispatch-routing-session',
      workspace: { root: workspaceRoot },
    })
    session.runs.start({
      input: 'Route this run.',
      allowedTools: ['memory.search'],
      allowBrowser: false,
      allowMemory: true,
      computerId: 'computer_custom',
      providerId: 'openai',
      modelId: 'gpt-5.5',
      mode: 'chat',
    })

    const [message] = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(1)
    if (!message?.dispatch.success) {
      throw new Error(`Expected a valid dispatch, got ${message?.dispatch.error?.message ?? 'none'}.`)
    }

    const dispatch = message.dispatch.data
    expect(dispatch.computerId).toBe('computer_custom')
    expect(dispatch.runtimeProfile).toBe('core-browser-memory')
    expect(dispatch.policy).toMatchObject({
      allowBrowser: false,
      allowMemory: true,
      allowedTools: ['memory.search'],
    })
    expect(dispatch.intent.runtimeOptions).toMatchObject({
      browser: false,
      memory: true,
      tools: ['memory.search'],
      providerId: 'openai',
      modelId: 'gpt-5.5',
    })
    expect(dispatch.intent.clientContext).toMatchObject({
      route: '/sdk',
      lane: 'platform',
      contextPack: {
        version: 1,
        strategy: 'latest-message-inline-session-memory',
        latestMessageBytes: Buffer.byteLength('Route this run.', 'utf8'),
        toolCount: 1,
        summaryStrategy: 'metadata-only',
      },
    })
    expect(dispatch.intent.clientContext?.contextPack?.estimatedTokens).toBeGreaterThan(0)
  })

  it('routes provider queries through the requested provider and model', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-provider-routing-')
    const defaultProvider = new MockProvider([{ type: 'event', event: { type: 'result', text: 'default' } }])
    const alternateProvider = new MockProvider((input) => [
      {
        type: 'event',
        event: {
          type: 'result',
          text: `${input.providerId ?? 'missing-provider'}:${input.model ?? 'missing-model'}`,
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

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        workspace: { root: workspaceRoot },
      })
      const run = session.runs.start({
        input: 'Use the alternate provider.',
        allowedTools: [],
        providerId: 'alternate',
        modelId: 'alternate/model',
        mode: 'chat',
      })

      for await (const _event of run.events()) {
        // Drain to terminal event.
      }

      expect(await run.result()).toBe('alternate:alternate/model')
    } finally {
      await mainspring.stop()
    }
  })

  it('exposes workspace and coding context helpers for a session workspace', () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-workspace-context-')
    fs.mkdirSync(path.join(workspaceRoot, 'src', 'agent'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'agent', 'Context.ts'), 'export const x = 1\n')
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'guide.md'), 'guide\n')

    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })

    const session = mainspring.sessions.create({
      workspace: { root: workspaceRoot },
    })
    const workspaceContext = session.workspace.context()
    const codingContext = session.workspace.codingContext('agent')

    expect(workspaceContext.exists).toBe(true)
    expect(workspaceContext.topLevelEntries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['docs', 'src']),
    )
    expect(codingContext.suggestedDirectories[0]?.path).toBe('src/agent')
    expect(codingContext.fileSafety.workspaceOnly).toBe(true)
  })

  it('exposes a scoped memory context for a session workspace', () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-memory-context-')
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })

    const session = mainspring.sessions.create({
      workspace: { root: workspaceRoot },
    })

    session.memory.remember({
      text: 'Workspace note for every later session.',
      scope: 'workspace',
      tags: ['workspace'],
    })
    session.memory.remember({
      text: 'Current session note only.',
      scope: 'session',
      tags: ['session'],
    })

    const visible = session.memory.read({ scope: 'all', limit: 10 })
    expect(visible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'workspace', tags: ['workspace'] }),
        expect.objectContaining({
          scope: 'session',
          sessionId: session.record.sessionId,
          tags: ['session'],
        }),
      ]),
    )
  })

  it('runs the SDK/runtime path with OpenRouter free-router metadata and usage without persisting secrets', async () => {
    const { sessionsRoot, workspaceRoot } = makeTempMainspringPaths('mainspring-sdk-openrouter-free-')
    const providerInputs: Array<{ providerId?: string; model?: string; credentialKey?: string }> = []
    const openrouterProvider = new MockProvider((input) => {
      providerInputs.push({
        providerId: input.providerId,
        model: input.model,
        credentialKey: input.credentialRef?.kind === 'env' ? input.credentialRef.key : undefined,
      })
      return [
        {
          type: 'event',
          event: {
            type: 'init',
            provider: 'openrouter',
            providerSessionId: 'openrouter_test_session',
            modelId: input.model,
          },
        },
        {
          type: 'event',
          event: {
            type: 'usage',
            usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            providerSessionId: 'openrouter_test_session',
          },
        },
        { type: 'event', event: { type: 'result', text: 'OPENROUTER_FREE_SDK_OK' } },
      ]
    })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      providers: { openrouter: openrouterProvider },
      pollIntervalMs: 10,
    })

    await mainspring.start()
    try {
      const session = mainspring.sessions.create({
        workspace: { root: workspaceRoot },
      })
      const run = session.runs.start({
        input: 'Use OpenRouter free router.',
        allowedTools: [],
        providerId: 'openrouter',
        modelId: 'openrouter/free',
        mode: 'chat',
      })

      const events = []
      for await (const event of run.events()) {
        events.push(event)
      }

      expect(await run.result()).toBe('OPENROUTER_FREE_SDK_OK')
      expect(providerInputs).toEqual([
        {
          providerId: 'openrouter',
          model: 'openrouter/free',
          credentialKey: undefined,
        },
      ])
      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          'run.started',
          'runtime.warning',
          'usage.updated',
          'assistant.text.done',
          'run.completed',
        ]),
      )
      expect(run.usage()).toEqual([
        expect.objectContaining({
          provider: 'openrouter',
          modelId: 'openrouter/free',
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7,
          providerSessionId: '[redacted]',
        }),
      ])
      expect(mainspring.monitoring.snapshot().providers.usage).toEqual([
        {
          provider: 'openrouter',
          model: 'openrouter/free',
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7,
        },
      ])
      const providerInitWarning = events.find(
        (event): event is RunEventOfType<'runtime.warning'> =>
          event.type === 'runtime.warning'
          && (event.payload as { message?: unknown }).message === PROVIDER_INIT_LOG_MESSAGE,
      )
      expect(providerInitWarning?.payload).toMatchObject({
        level: 'debug',
        message: PROVIDER_INIT_LOG_MESSAGE,
        payload: {
          provider: 'openrouter',
          providerSessionId: '[redacted]',
          modelId: 'openrouter/free',
        },
      })
      expect(JSON.stringify(events)).not.toContain('OPENROUTER_API_KEY')
      expect(JSON.stringify(events)).not.toContain('sk-or-')
    } finally {
      await mainspring.stop()
    }
  })

  it('blocks cross-workspace reads and approved writes during runtime tool execution', async () => {
    const { root, sessionsRoot } = makeTempMainspringPaths('mainspring-sdk-workspace-escape-')
    const firstWorkspace = path.join(root, 'workspaces', 'first')
    const secondWorkspace = path.join(root, 'workspaces', 'second')
    const secondSecretPath = path.join(secondWorkspace, 'notes', 'secret.txt')
    const secondIntrusionPath = path.join(secondWorkspace, 'notes', 'intrusion.txt')
    fs.mkdirSync(path.dirname(secondSecretPath), { recursive: true })
    fs.mkdirSync(firstWorkspace, { recursive: true })
    fs.writeFileSync(secondSecretPath, 'second workspace secret')

    const readProvider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.read',
          input: { path: secondSecretPath },
          toolCallId: 'cross_read',
        },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string; output?: unknown; error?: string }
          return { type: 'result', text: `read:${parsed.status ?? 'unknown'}` }
        },
      },
    ])

    const readMainspring = createMainspring({
      sessionsRoot,
      workspaceRoot: root,
      provider: readProvider,
      pollIntervalMs: 10,
    })

    await readMainspring.start()
    try {
      const session = readMainspring.sessions.create({
        sessionId: 'cross-read-session',
        workspace: { root: firstWorkspace },
      })
      const run = session.runs.start({
        input: 'Try to read another workspace.',
        allowedTools: ['file.read'],
        mode: 'chat',
      })

      const events = []
      for await (const event of run.events()) {
        events.push(event)
      }

      expect(await run.result()).toBe('read:failed')
      expect(events.map((event) => event.type)).toContain('tool.call.failed')
      expect(JSON.stringify(events)).not.toContain('second workspace secret')
    } finally {
      await readMainspring.stop()
    }

    const writeProvider = new MockProvider([
      {
        type: 'event',
        event: {
          type: 'tool_call',
          name: 'file.write',
          input: { path: secondIntrusionPath, data: 'cross workspace write' },
          toolCallId: 'cross_write',
        },
      },
      {
        type: 'await_push',
        produce: { type: 'progress', message: 'waiting for write approval' },
      },
      {
        type: 'await_push',
        produce: (message) => {
          const parsed = JSON.parse(message) as { status?: string }
          return { type: 'result', text: `write:${parsed.status ?? 'unknown'}` }
        },
      },
    ])
    const writeMainspring = createMainspring({
      sessionsRoot,
      workspaceRoot: root,
      provider: writeProvider,
      pollIntervalMs: 10,
    })

    await writeMainspring.start()
    try {
      const session = writeMainspring.sessions.create({
        sessionId: 'cross-write-session',
        workspace: { root: firstWorkspace },
      })
      const run = session.runs.start({
        input: 'Try to write another workspace.',
        allowedTools: ['file.write'],
        mode: 'chat',
      })
      const streamPromise = (async () => {
        const events = []
        for await (const event of run.events()) {
          events.push(event)
        }
        return events
      })()

      const pendingApproval = await waitFor(
        () => writeMainspring.approvals.list()[0],
        (value): value is NonNullable<typeof value> => Boolean(value),
      )
      writeMainspring.approvals.approve({
        sessionId: pendingApproval.sessionId,
        runId: pendingApproval.runId,
        approvalId: pendingApproval.approvalId,
        reason: 'approve attempt to verify containment',
      })

      const events = await streamPromise

      expect(await run.result()).toBe('write:failed')
      expect(events.map((event) => event.type)).toContain('tool.call.failed')
      expect(fs.existsSync(secondIntrusionPath)).toBe(false)
    } finally {
      await writeMainspring.stop()
    }
  })
})
