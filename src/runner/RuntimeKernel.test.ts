import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_INIT_LOG_MESSAGE } from '../contracts/runtime.js'
import {
  mailboxSessionIdFromSessionKey,
} from '#protocol'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from '../providers/types.js'
import { createFileTools } from '../tools/FileTools.js'
import { createShellTool } from '../tools/ShellTool.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { RuntimeKernel } from './RuntimeKernel.js'
import { dispatch, insertInbound, makeSession, readRows } from './test-fixtures.test-support.js'

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function query(events: AsyncIterable<ProviderEvent>): AgentQuery {
  return { push() {}, end() {}, abort() {}, events }
}

class RecordingProvider implements AgentProvider {
  readonly prompts: string[] = []
  readonly systemPrompts: Array<string | undefined> = []
  readonly models: Array<string | undefined> = []
  readonly toolChoices: Array<unknown> = []
  readonly tools: Array<Array<string>> = []
  readonly messages: Array<QueryInput['messages']> = []

  query(input: QueryInput): AgentQuery {
    this.prompts.push(input.prompt)
    this.systemPrompts.push(input.systemPrompt)
    this.models.push(input.model)
    this.toolChoices.push(input.toolChoice)
    this.tools.push((input.tools ?? []).map((tool) => tool.manifest.key))
    this.messages.push(input.messages)
    return query(
      (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'init', providerSessionId: `provider_${input.prompt}` }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } }
        yield { type: 'result', text: input.prompt }
      })(),
    )
  }
}

class StreamingProvider implements AgentProvider {
  readonly prompts: string[] = []

  query(input: QueryInput): AgentQuery {
    this.prompts.push(input.prompt)
    return query(
      (async function* (): AsyncIterable<ProviderEvent> {
        yield {
          type: 'init',
          provider: 'openrouter',
          providerSessionId: `provider_${input.prompt}`,
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
        }
        yield { type: 'delta', text: 'first part, ' }
        yield { type: 'delta', text: 'second part' }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
        yield { type: 'result', text: input.prompt }
      })(),
    )
  }
}

class HoldingQuery implements AgentQuery {
  readonly pushed: string[] = []
  aborted = false
  ended = false
  private release: (() => void) | undefined
  readonly events: AsyncIterable<ProviderEvent>

  constructor(readonly input: QueryInput) {
    this.events = this.createEvents()
  }

  push(message: string): void {
    this.pushed.push(message)
  }

  end(): void {
    this.ended = true
    this.release?.()
  }

  abort(): void {
    this.aborted = true
    this.release?.()
  }

  private async *createEvents(): AsyncIterable<ProviderEvent> {
    yield { type: 'init', providerSessionId: 'provider_active' }
    if (this.aborted) return
    if (!this.ended) {
      await new Promise<void>((resolve) => {
        this.release = resolve
      })
    }
    if (!this.aborted) {
      yield { type: 'result', text: this.input.prompt }
    }
  }
}

class HoldingProvider implements AgentProvider {
  readonly queries: HoldingQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new HoldingQuery(input)
    this.queries.push(query)
    return query
  }
}

class PostCancelQuery implements AgentQuery {
  aborted = false
  private readonly afterAbort: Promise<void>
  private releaseAfterAbort: () => void = () => {}
  readonly events: AsyncIterable<ProviderEvent>

  constructor(readonly input: QueryInput) {
    this.afterAbort = new Promise<void>((resolve) => {
      this.releaseAfterAbort = resolve
    })
    this.events = this.createEvents()
  }

  push(): void {}

  end(): void {
    this.releaseAfterAbort()
  }

  abort(): void {
    this.aborted = true
    this.releaseAfterAbort()
  }

  private async *createEvents(): AsyncIterable<ProviderEvent> {
    yield { type: 'init', providerSessionId: 'provider_post_cancel' }
    await this.afterAbort
    yield { type: 'delta', text: `late delta for ${this.input.prompt}` }
    yield { type: 'result', text: `late result for ${this.input.prompt}` }
  }
}

class PostCancelProvider implements AgentProvider {
  readonly queries: PostCancelQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PostCancelQuery(input)
    this.queries.push(query)
    return query
  }
}

class PushQuery implements AgentQuery {
  readonly pushed: string[] = []
  private releasePush: (() => void) | undefined
  readonly events: AsyncIterable<ProviderEvent>

  constructor(
    readonly input: QueryInput,
    private readonly script: (query: PushQuery) => AsyncIterable<ProviderEvent>,
  ) {
    this.events = script(this)
  }

  push(message: string): void {
    this.pushed.push(message)
    this.releasePush?.()
  }

  end(): void {
    this.releasePush?.()
  }

  abort(): void {
    this.releasePush?.()
  }

  async waitForPush(count = 1): Promise<void> {
    if (this.pushed.length < count) {
      await new Promise<void>((resolve) => {
        this.releasePush = resolve
      })
    }
  }
}

class ToolCallingProvider implements AgentProvider {
  readonly queries: PushQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PushQuery(input, async function* (q) {
      yield { type: 'init', providerSessionId: 'provider_tool_session' }
      yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } }
      await q.waitForPush()
      yield { type: 'result', text: `tool returned ${q.pushed[0] ?? 'nothing'}` }
    })
    this.queries.push(query)
    return query
  }
}

class ReplayAwareToolProvider implements AgentProvider {
  readonly providerId = 'openrouter'
  readonly queries: PushQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PushQuery(input, async function* (q) {
      yield { type: 'init', providerSessionId: `provider_replay_${q.input.prompt}` }
      if (q.input.messages?.length) {
        yield { type: 'result', text: 'replayed' }
        return
      }
      yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } }
      await q.waitForPush()
      yield { type: 'result', text: `tool returned ${q.pushed[0] ?? 'nothing'}` }
    })
    this.queries.push(query)
    return query
  }
}

class StallingToolProvider implements AgentProvider {
  readonly queries: PushQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PushQuery(input, async function* () {
      yield { type: 'init', providerSessionId: 'provider_stalled_tool_session' }
      yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } }
    })
    this.queries.push(query)
    return query
  }
}

class RepeatedToolEventProvider implements AgentProvider {
  query(): AgentQuery {
    return query(
      (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'init', providerSessionId: 'provider_repeated_tools' }
        yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/one.txt' } }
        yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/two.txt' } }
        yield { type: 'result', text: 'done' }
      })(),
    )
  }
}

class SensitiveToolCallingProvider implements AgentProvider {
  readonly queries: PushQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PushQuery(input, async function* (q) {
      yield {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'gen_sensitive_session_id',
        modelId: 'openrouter/free',
      }
      yield {
        type: 'tool_call',
        name: 'file.read',
        input: { path: 'notes/secret.txt', authorization: 'Bearer secret-runtime-token' },
      }
      await q.waitForPush()
      yield {
        type: 'result',
        text: 'assistant observed apiKey=sk-or-secret-secret token=secret-runtime-token',
      }
    })
    this.queries.push(query)
    return query
  }
}

class ApprovalGatedToolProvider implements AgentProvider {
  readonly queries: PushQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new PushQuery(input, async function* (q) {
      yield { type: 'init', providerSessionId: 'provider_approval_tool' }
      yield { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } }
      await q.waitForPush(2)
      yield { type: 'result', text: `approval tool returned ${q.pushed.at(-1) ?? 'nothing'}` }
    })
    this.queries.push(query)
    return query
  }
}

class ErrorProvider implements AgentProvider {
  query(input: QueryInput): AgentQuery {
    return query(
      (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'init', providerSessionId: `provider_${input.prompt}` }
        yield { type: 'error', message: 'provider auth failed', retryable: false }
      })(),
    )
  }
}

class ThrowingProvider implements AgentProvider {
  query(input: QueryInput): AgentQuery {
    return query(
      (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'init', providerSessionId: `provider_${input.prompt}` }
        throw new Error('provider exploded OPENROUTER_API_KEY=sk-or-secret-secret')
      })(),
    )
  }
}

function createApprovedShellLikeTool(output: unknown): RuntimeTool {
  return {
    manifest: {
      key: 'shell.exec',
      name: 'Approved Shell Command',
      description: 'Test shell command adapter that requires approval before execution.',
      version: '1.0.0',
      source: 'built-in',
      permissions: { shell: true, filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'shell',
    },
    execute: ({ input }) => ({ input, output }),
  }
}

function createThrowingFileReadTool(message: string): RuntimeTool {
  return {
    manifest: {
      key: 'file.read',
      name: 'Throwing File Read',
      description: 'Test file reader that throws a controlled error.',
      version: '1.0.0',
      source: 'built-in',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'file',
    },
    execute: () => {
      throw new Error(message)
    },
  }
}

describe('RuntimeKernel', () => {
  it('continuously processes pending inbound rows in timestamp order', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_late',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch({
        runId: 'run_late',
        intent: {
          ...dispatch().intent,
          message: 'late',
          systemPrompt: 'System prompt for late run.',
        },
      }),
    })
    insertInbound({
      mailbox,
      id: 'in_early',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        runId: 'run_early',
        intent: {
          ...dispatch().intent,
          message: 'early',
          systemPrompt: 'System prompt for early run.',
        },
      }),
    })

    const result = await new RuntimeKernel({ mailbox, provider, cwd: root }).runUntilIdle({
      waitForActiveQueries: true,
    })

    expect(result).toEqual({
      processed: 2,
      messageIds: ['in_early', 'in_late'],
      runIds: ['run_early', 'run_late'],
    })
    expect(provider.prompts).toEqual(['early', 'late'])
    expect(provider.systemPrompts).toEqual([
      'System prompt for early run.',
      'System prompt for late run.',
    ])
    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT key, value FROM session_state ORDER BY key'),
    ).toEqual([
      { key: 'providerSessionId:run_early', value: '"provider_early"' },
      { key: 'providerSessionId:run_late', value: '"provider_late"' },
    ])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'usage' ORDER BY seq ASC",
      ),
    ).toEqual([
      {
        type: 'usage',
        payload: JSON.stringify({
          type: 'usage',
          runId: 'run_early',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        }),
      },
      {
        type: 'usage',
        payload: JSON.stringify({
          type: 'usage',
          runId: 'run_late',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        }),
      },
    ])
  })

  it('recovers stale processing acks on startup so restarted runners can finish pending work', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_stale_processing',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'recover me' } }),
    })
    mailbox.ensureRunnerOwnedStores()
    const db = new Database(mailbox.paths.outboundDbPath)
    try {
      db.prepare(
        `INSERT INTO processing_ack (message_id, status, status_changed, error)
         VALUES (?, 'processing', ?, NULL)`,
      ).run('in_stale_processing', '2026-05-16T00:00:00.000Z')
    } finally {
      db.close()
    }

    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: root,
      staleProcessingAckAfterMs: 1,
    })
    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_stale_processing',
      status: 'failed',
      error: 'Recovered stale processing ack after runner restart.',
    })

    await kernel.runUntilIdle({ waitForActiveQueries: true })

    expect(provider.prompts).toEqual(['recover me'])
    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_stale_processing',
      status: 'completed',
      error: null,
    })
  })

  it('uses the inbound dispatch model override for provider queries', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_model_override',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          runtimeOptions: {
            modelId: 'openrouter/paid-router',
          },
        },
      }),
    })

    await new RuntimeKernel({ mailbox, provider, cwd: root }).runUntilIdle({
      waitForActiveQueries: true,
    })

    expect(provider.models).toEqual(['openrouter/paid-router'])
  })

  it('forces the single allowed task tool as the provider tool choice', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_single_tool',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Read notes/input.txt.',
        },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({ mailbox, provider, cwd: root }).runUntilIdle({
      waitForActiveQueries: true,
    })

    expect(provider.toolChoices).toEqual([{ type: 'function', name: 'file.read' }])
  })

  it('does not advertise tool manifests when runtime policy allows no tools', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_no_tools',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Try to read notes/input.txt.',
        },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: [],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: root,
      tools: createFileTools(),
    }).runUntilIdle({
      waitForActiveQueries: true,
    })

    expect(provider.tools).toEqual([[]])
    expect(provider.toolChoices).toEqual(['auto'])
  })

  it('uses the projected no-tools lane for a real kernel run with streaming assistant events', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new StreamingProvider()
    insertInbound({
      mailbox,
      id: 'in_no_tools_stream',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Report streamed answer.',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: root,
      tools: createFileTools(),
    }).runUntilIdle({
      waitForActiveQueries: true,
    })

    expect(provider.prompts).toEqual(['Report streamed answer.'])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type IN ('run.status','log','assistant.text.delta','assistant.text.done','usage','run.status') ORDER BY seq ASC",
      ),
    ).toEqual([
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'running',
          phase: 'provider',
        }),
      },
      {
        type: 'log',
        payload: JSON.stringify({
          type: 'log',
          runId: 'run_1',
          level: 'debug',
          message: PROVIDER_INIT_LOG_MESSAGE,
          payload: {
            provider: 'openrouter',
            providerSessionId: '[redacted]',
            modelId: 'anthropic/claude-sonnet-4',
            modelFamily: 'claude',
            providerTransport: 'openrouter-chat-completions',
          },
        }),
      },
      {
        type: 'assistant.text.delta',
        payload: JSON.stringify({
          type: 'assistant.text.delta',
          runId: 'run_1',
          text: 'first part, ',
        }),
      },
      {
        type: 'assistant.text.delta',
        payload: JSON.stringify({
          type: 'assistant.text.delta',
          runId: 'run_1',
          text: 'second part',
        }),
      },
      {
        type: 'usage',
        payload: JSON.stringify({
          type: 'usage',
          runId: 'run_1',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }),
      },
      {
        type: 'assistant.text.done',
        payload: JSON.stringify({
          type: 'assistant.text.done',
          runId: 'run_1',
          text: 'Report streamed answer.',
        }),
      },
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'completed',
          phase: 'provider',
        }),
      },
    ])
    expect(readRows(mailbox.paths.outboundDbPath, 'SELECT content FROM messages_out ORDER BY timestamp ASC')).toEqual([
      { content: JSON.stringify({ text: 'Report streamed answer.' }) },
    ])
    const processedRows = readRows(mailbox.paths.outboundDbPath, 'SELECT status FROM processing_ack ORDER BY message_id ASC')
    expect(processedRows).toEqual([{ status: 'completed' }])
  })

  it('includes prior assistant messages in resumed provider prompts', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new RecordingProvider()
    const kernel = new RuntimeKernel({ mailbox, provider, cwd: root })

    insertInbound({
      mailbox,
      id: 'in_first',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'Remember marker CLAW_PARITY_RESUME_STATE' },
      }),
    })
    await kernel.runUntilIdle({ waitForActiveQueries: true })
    mailbox.writeOutbound({
      runId: 'run_other',
      sessionId: mailboxSessionIdFromSessionKey('default'),
      kind: 'assistant_message',
      content: JSON.stringify({ text: 'CLAW_PARITY_FILE_OK' }),
    })

    insertInbound({
      mailbox,
      id: 'in_second',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'Repeat the remembered marker exactly.' },
      }),
    })
    await kernel.runUntilIdle({ waitForActiveQueries: true })

    expect(provider.prompts[1]).toContain(
      'Authoritative conversation history from this same session:',
    )
    expect(provider.prompts[1]).toContain('Use this history as real session state.')
    expect(provider.prompts[1]).toContain('Previous assistant messages:')
    expect(provider.prompts[1]).toContain('Remember marker CLAW_PARITY_RESUME_STATE')
    expect(provider.prompts[1]).not.toContain('CLAW_PARITY_FILE_OK')
    expect(provider.prompts[1]).toContain('Current user message:')
    expect(provider.prompts[1]).toContain('Repeat the remembered marker exactly.')
    expect(provider.messages[1]).toEqual([
      { role: 'user', content: 'Remember marker CLAW_PARITY_RESUME_STATE' },
      { role: 'assistant', content: 'Remember marker CLAW_PARITY_RESUME_STATE' },
    ])
  })

  it('builds structured replay messages for resumed openrouter turns from mailbox history', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'input.txt'), 'runtime tool data')
    const provider = new ReplayAwareToolProvider()
    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: createFileTools(),
    })

    insertInbound({
      mailbox,
      id: 'in_first',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'read my note first' },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })
    await kernel.runUntilIdle({ waitForActiveQueries: true })

    insertInbound({
      mailbox,
      id: 'in_second',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'continue from the tool result' },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })
    await kernel.runUntilIdle({ waitForActiveQueries: true })

    expect(provider.queries).toHaveLength(2)
    expect(provider.queries[1]?.input.prompt).toBe('continue from the tool result')
    expect(provider.queries[1]?.input.messages).toEqual([
      { role: 'user', content: 'read my note first' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: expect.stringMatching(/^file\.read_/), name: 'file.read', arguments: '{"path":"notes/input.txt"}' }],
      },
      {
        role: 'tool',
        toolCallId: expect.stringMatching(/^file\.read_/),
        name: 'file.read',
        content: '{"path":"notes/input.txt","text":"runtime tool data"}',
      },
      {
        role: 'assistant',
        content:
          'tool returned {"type":"tool_result","name":"file.read","status":"completed","output":{"path":"notes/input.txt","text":"runtime tool data"}}',
      },
    ])
  })

  it('pushes follow-up chat rows into an active provider query', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new HoldingProvider()
    insertInbound({
      mailbox,
      id: 'in_initial',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'initial' } }),
    })

    const kernel = new RuntimeKernel({ mailbox, provider, cwd: root })
    expect(await kernel.runOnce()).toMatchObject({
      processed: 1,
      messageIds: ['in_initial'],
      runIds: ['run_1'],
    })
    expect(provider.queries).toHaveLength(1)

    insertInbound({
      mailbox,
      id: 'in_followup',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'follow up' } }),
    })

    expect(await kernel.runOnce()).toMatchObject({
      processed: 1,
      messageIds: ['in_followup'],
      runIds: ['run_1'],
    })
    expect(provider.queries).toHaveLength(1)
    expect(provider.queries[0]?.pushed).toEqual(['follow up'])
    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT message_id, status FROM processing_ack'),
    ).toContainEqual({ message_id: 'in_followup', status: 'completed' })

    provider.queries[0]?.end()
    await kernel.waitForActiveQueries()
  })

  it('cancels an active no-tools provider query and writes cancelled run status', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new HoldingProvider()
    insertInbound({
      mailbox,
      id: 'in_initial',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'initial' } }),
    })

    const kernel = new RuntimeKernel({ mailbox, provider, cwd: root })
    await kernel.runOnce()

    insertInbound({
      mailbox,
      id: 'in_cancel',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'run_cancel',
      content: JSON.stringify({ type: 'run_cancel', runId: 'run_1', reason: 'stop' }),
    })

    expect(await kernel.runOnce()).toMatchObject({
      processed: 1,
      messageIds: ['in_cancel'],
      runIds: ['run_1'],
    })
    expect(provider.queries[0]?.aborted).toBe(true)
    await kernel.waitForActiveQueries()
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'run.status' ORDER BY seq ASC",
      ),
    ).toContainEqual({
      type: 'run.status',
      payload: JSON.stringify({
        type: 'run.status',
        runId: 'run_1',
        status: 'cancelled',
        phase: 'cancelled',
      }),
    })
  })

  it('drops provider assistant events emitted after a run is cancelled', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const provider = new PostCancelProvider()
    insertInbound({
      mailbox,
      id: 'in_initial',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'cancel race' } }),
    })

    const kernel = new RuntimeKernel({ mailbox, provider, cwd: root })
    await kernel.runOnce()

    insertInbound({
      mailbox,
      id: 'in_cancel',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'run_cancel',
      content: JSON.stringify({ type: 'run_cancel', runId: 'run_1', reason: 'stop' }),
    })

    await kernel.runOnce()
    expect(provider.queries[0]?.aborted).toBe(true)
    await kernel.waitForActiveQueries()

    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type FROM events_out WHERE type LIKE 'assistant.text.%' ORDER BY seq ASC",
      ),
    ).toEqual([])
    expect(readRows(mailbox.paths.outboundDbPath, 'SELECT kind FROM messages_out')).toEqual([])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'run.status' ORDER BY seq ASC",
      ),
    ).toEqual([
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'running',
          phase: 'provider',
        }),
      },
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'cancelled',
          phase: 'cancelled',
        }),
      },
    ])
  })

  it('executes provider-driven tool calls via AgentRunLoop and pushes results back to the query', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'input.txt'), 'runtime tool data')
    const provider = new ToolCallingProvider()
    insertInbound({
      mailbox,
      id: 'in_tool',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'read my note' },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: createFileTools(),
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(provider.queries[0]?.pushed).toEqual([
      JSON.stringify({
        type: 'tool_result',
        name: 'file.read',
        status: 'completed',
        output: {
          path: 'notes/input.txt',
          text: 'runtime tool data',
        },
      }),
    ])
    const eventRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('tool.call', 'tool.result', 'assistant.text.done') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(eventRows.map((row) => row.type)).toEqual([
      'tool.call',
      'tool.result',
      'assistant.text.done',
    ])
    const toolCallEvent = JSON.parse(eventRows[0]?.payload ?? '{}') as { toolCallId?: string }
    const toolResultEvent = JSON.parse(eventRows[1]?.payload ?? '{}') as { toolCallId?: string }
    expect(toolCallEvent).toMatchObject({
      type: 'tool.call',
      runId: 'run_1',
      toolCallId: expect.stringMatching(/^file\.read_/),
      name: 'file.read',
      input: { path: 'notes/input.txt' },
    })
    expect(toolResultEvent).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      toolCallId: expect.stringMatching(/^file\.read_/),
      name: 'file.read',
      output: {
        path: 'notes/input.txt',
        text: 'runtime tool data',
      },
      status: 'completed',
    })
    expect(toolResultEvent.toolCallId).toBe(toolCallEvent.toolCallId)
    expect(JSON.parse(eventRows[2]?.payload ?? '{}')).toEqual({
      type: 'assistant.text.done',
      runId: 'run_1',
      text: `tool returned ${JSON.stringify({
        type: 'tool_result',
        name: 'file.read',
        status: 'completed',
        output: {
          path: 'notes/input.txt',
          text: 'runtime tool data',
        },
      })}`,
    })
  })

  it('keeps repeated same-name provider tool events on distinct fallback ids', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    insertInbound({
      mailbox,
      id: 'in_repeated_tools',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'emit repeated tools' },
        policy: {
          ...dispatch().policy,
          allowedTools: ['file.read'],
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider: new RepeatedToolEventProvider(),
      cwd: root,
      tools: [
        {
          manifest: {
            key: 'file.read',
            name: 'Test File Read',
            description: 'Test file read tool for fallback id assertions.',
            version: '1.0.0',
            source: 'built-in',
            permissions: { filesystem: 'read' },
            approval: {},
            toolType: 'file',
          },
          execute: ({ input }) => {
            const pathValue = typeof input?.path === 'string' ? input.path : ''
            return { text: pathValue.includes('one') ? 'one' : pathValue.includes('two') ? 'two' : '' }
          },
        },
      ],
    }).runUntilIdle({ waitForActiveQueries: true })

    const eventRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('tool.call', 'tool.result') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    const toolCalls = eventRows
      .filter((row) => row.type === 'tool.call')
      .map((row) => JSON.parse(row.payload) as { toolCallId: string; input: unknown })
    const toolResults = eventRows
      .filter((row) => row.type === 'tool.result')
      .map((row) => JSON.parse(row.payload) as { toolCallId: string; output: unknown })

    expect(toolCalls).toHaveLength(2)
    expect(toolResults).toHaveLength(2)
    expect(toolCalls[0]?.toolCallId).toMatch(/^file\.read_/)
    expect(toolCalls[1]?.toolCallId).toMatch(/^file\.read_/)
    expect(toolCalls[0]?.toolCallId).not.toBe(toolCalls[1]?.toolCallId)
    expect(toolResults.map((result) => result.toolCallId)).toEqual(
      toolCalls.map((call) => call.toolCallId),
    )
    expect(toolCalls.map((call) => call.input)).toEqual([
      { path: 'notes/one.txt' },
      { path: 'notes/two.txt' },
    ])
    expect(toolResults.map((result) => result.output)).toEqual([{ text: 'one' }, { text: 'two' }])
  })

  it('emits structured approval before provider prose for approval-required single-tool tasks', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const provider = new RecordingProvider()
    insertInbound({
      mailbox,
      id: 'in_approval',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Request approval before running shell command echo CLAW_PARITY_APPROVAL_OK.',
          approvalPolicy: 'ask-first',
        },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['shell.exec'],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: [createShellTool()],
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(provider.prompts).toEqual([])
    const eventRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('tool.call', 'approval.requested', 'run.status') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(eventRows.map((row) => row.type)).toEqual([
      'run.status',
      'tool.call',
      'approval.requested',
      'run.status',
    ])
    expect(JSON.parse(eventRows[1]?.payload ?? '{}')).toMatchObject({
      type: 'tool.call',
      runId: 'run_1',
      name: 'shell.exec',
      input: { command: 'echo CLAW_PARITY_APPROVAL_OK' },
    })
    expect(JSON.parse(eventRows[2]?.payload ?? '{}')).toMatchObject({
      type: 'approval.requested',
      runId: 'run_1',
      approval: {
        kind: 'exec',
        targetKey: 'shell.exec',
        reasons: expect.arrayContaining([
          'approval policy requires review',
          'manifest requires approval',
          'shell execution requires approval',
        ]),
      },
    })
    expect(JSON.parse(eventRows[3]?.payload ?? '{}')).toEqual({
      type: 'run.status',
      runId: 'run_1',
      status: 'waiting_approval',
      phase: 'approval',
    })
  })

  it('executes approved pre-provider single-tool tasks without starting provider prose', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const provider = new RecordingProvider()
    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: [createApprovedShellLikeTool({ stdout: 'CLAW_PARITY_APPROVAL_OK' })],
    })
    insertInbound({
      mailbox,
      id: 'in_pre_approval',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Request approval before running shell command echo CLAW_PARITY_APPROVAL_OK.',
          approvalPolicy: 'ask-first',
        },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['shell.exec'],
          redaction: 'strict',
        },
      }),
    })

    await kernel.runOnce()
    const approvalRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'approval.requested' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const approvalEvent = JSON.parse(approvalRows[0]?.payload ?? '{}') as {
      approval?: { id?: string }
    }

    insertInbound({
      mailbox,
      id: 'in_pre_approval_response',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'approval_response',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId: approvalEvent.approval?.id,
        decision: 'approved',
      }),
    })

    await kernel.runUntilIdle({ waitForActiveQueries: true })

    expect(provider.prompts).toEqual([])
    const eventRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('approval.resolved', 'tool.result', 'run.status') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(eventRows.map((row) => row.type)).toEqual([
      'run.status',
      'run.status',
      'approval.resolved',
      'tool.result',
      'run.status',
    ])
    expect(JSON.parse(eventRows.at(-2)?.payload ?? '{}')).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      name: 'shell.exec',
      output: {
        input: { command: 'echo CLAW_PARITY_APPROVAL_OK' },
        output: { stdout: 'CLAW_PARITY_APPROVAL_OK' },
      },
      status: 'completed',
    })
    expect(JSON.parse(eventRows.at(-1)?.payload ?? '{}')).toEqual({
      type: 'run.status',
      runId: 'run_1',
      status: 'completed',
      phase: 'tool',
    })
  })

  it('restores approved pre-provider tool approvals after a runner restart', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const firstProvider = new RecordingProvider()
    const firstKernel = new RuntimeKernel({
      mailbox,
      provider: firstProvider,
      cwd: workspaceRoot,
      tools: [createApprovedShellLikeTool({ stdout: 'CLAW_RESTART_APPROVAL_OK' })],
    })
    insertInbound({
      mailbox,
      id: 'in_pre_restart_approval',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Request approval before running shell command echo CLAW_RESTART_APPROVAL_OK.',
          approvalPolicy: 'ask-first',
        },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['shell.exec'],
          redaction: 'strict',
        },
      }),
    })

    await firstKernel.runOnce()
    const approvalRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'approval.requested' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const approvalEvent = JSON.parse(approvalRows[0]?.payload ?? '{}') as {
      approval?: { id?: string }
    }

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        "SELECT key FROM session_state WHERE key LIKE 'pendingPreProviderToolApproval:%'",
      ),
    ).toHaveLength(1)

    insertInbound({
      mailbox,
      id: 'in_pre_restart_approval_response',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'approval_response',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId: approvalEvent.approval?.id,
        decision: 'approved',
      }),
    })

    const restartedProvider = new RecordingProvider()
    await new RuntimeKernel({
      mailbox,
      provider: restartedProvider,
      cwd: workspaceRoot,
      tools: [createApprovedShellLikeTool({ stdout: 'CLAW_RESTART_APPROVAL_OK' })],
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(firstProvider.prompts).toEqual([])
    expect(restartedProvider.prompts).toEqual([])
    const toolResultRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'tool.result' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    expect(JSON.parse(toolResultRows.at(-1)?.payload ?? '{}')).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      name: 'shell.exec',
      output: {
        input: { command: 'echo CLAW_RESTART_APPROVAL_OK' },
        output: { stdout: 'CLAW_RESTART_APPROVAL_OK' },
      },
      status: 'completed',
    })
    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        "SELECT key FROM session_state WHERE key LIKE 'pendingPreProviderToolApproval:%'",
      ),
    ).toEqual([])
  })

  it('fails denied pre-provider single-tool tasks without starting provider prose', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const provider = new RecordingProvider()
    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: [createApprovedShellLikeTool({ stdout: 'must not run' })],
    })
    insertInbound({
      mailbox,
      id: 'in_pre_denied',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          mode: 'task',
          message: 'Request approval before running shell command echo DENIED.',
          approvalPolicy: 'ask-first',
        },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['shell.exec'],
          redaction: 'strict',
        },
      }),
    })

    await kernel.runOnce()
    const approvalRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'approval.requested' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const approvalEvent = JSON.parse(approvalRows[0]?.payload ?? '{}') as {
      approval?: { id?: string }
    }

    insertInbound({
      mailbox,
      id: 'in_pre_denied_response',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'approval_response',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId: approvalEvent.approval?.id,
        decision: 'denied',
      }),
    })

    await kernel.runUntilIdle({ waitForActiveQueries: true })

    expect(provider.prompts).toEqual([])
    const eventRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('approval.resolved', 'tool.result', 'run.status') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(eventRows.map((row) => row.type)).toEqual([
      'run.status',
      'run.status',
      'approval.resolved',
      'tool.result',
      'run.status',
    ])
    expect(JSON.parse(eventRows.at(-2)?.payload ?? '{}')).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      name: 'shell.exec',
      output: { denied: true, approvalId: approvalEvent.approval?.id },
      status: 'failed',
    })
    expect(JSON.parse(eventRows.at(-1)?.payload ?? '{}')).toEqual({
      type: 'run.status',
      runId: 'run_1',
      status: 'failed',
      phase: 'approval',
    })
  })

  it('resumes a pending provider tool call after approval is accepted in the AgentRunLoop lane', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'input.txt'), 'approval file data')
    const provider = new ApprovalGatedToolProvider()
    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: createFileTools(),
    })
    insertInbound({
      mailbox,
      id: 'in_approval_tool',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, mode: 'chat', message: 'read gated note' },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await kernel.runOnce()
    while (provider.queries[0]?.pushed.length === 0) {
      await sleep(10)
    }

    const approvalRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'approval.requested' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const approvalEvent = JSON.parse(approvalRows[0]?.payload ?? '{}') as {
      approval?: { id?: string }
    }
    const approvalId = approvalEvent.approval?.id
    expect(approvalId).toMatch(/^ap_/)
    expect(JSON.parse(provider.queries[0]?.pushed[0] ?? '{}')).toMatchObject({
      type: 'tool_result',
      name: 'file.read',
      status: 'approval_required',
      approvalId,
    })

    insertInbound({
      mailbox,
      id: 'in_approval_response',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'approval_response',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId,
        decision: 'approved',
      }),
    })

    await kernel.runOnce()
    await kernel.waitForActiveQueries()

    expect(JSON.parse(provider.queries[0]?.pushed[1] ?? '{}')).toEqual({
      type: 'tool_result',
      name: 'file.read',
      status: 'completed',
      output: {
        path: 'notes/input.txt',
        text: 'approval file data',
      },
    })

    const toolResultRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'tool.result' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    expect(JSON.parse(toolResultRows.at(-1)?.payload ?? '{}')).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      name: 'file.read',
      status: 'completed',
      output: {
        path: 'notes/input.txt',
        text: 'approval file data',
      },
    })
  })

  it('returns a denied tool result when approval is rejected in the AgentRunLoop lane', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'input.txt'), 'must not read')
    const provider = new ApprovalGatedToolProvider()
    const kernel = new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: createFileTools(),
    })
    insertInbound({
      mailbox,
      id: 'in_denied_tool',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, mode: 'chat', message: 'read denied note' },
        policy: {
          approvalPolicy: 'ask-first',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await kernel.runOnce()
    while (provider.queries[0]?.pushed.length === 0) {
      await sleep(10)
    }
    const approvalRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'approval.requested' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const approvalEvent = JSON.parse(approvalRows[0]?.payload ?? '{}') as {
      approval?: { id?: string }
    }

    insertInbound({
      mailbox,
      id: 'in_denied_response',
      timestamp: new Date('2026-05-16T00:00:02.000Z').toISOString(),
      body: dispatch(),
      kind: 'approval_response',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId: approvalEvent.approval?.id,
        decision: 'denied',
      }),
    })

    await kernel.runOnce()
    await kernel.waitForActiveQueries()

    expect(JSON.parse(provider.queries[0]?.pushed[1] ?? '{}')).toMatchObject({
      type: 'tool_result',
      name: 'file.read',
      status: 'denied',
      approvalId: approvalEvent.approval?.id,
    })
    const toolResultRows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'tool.result' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    expect(JSON.parse(toolResultRows.at(-1)?.payload ?? '{}')).toMatchObject({
      type: 'tool.result',
      runId: 'run_1',
      name: 'file.read',
      output: { denied: true, approvalId: approvalEvent.approval?.id },
      status: 'failed',
    })
  })

  it('redacts secret-shaped runtime event and outbound payloads before mailbox persistence', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(
      path.join(workspaceRoot, 'notes', 'secret.txt'),
      'file payload apiKey=sk-or-secret-secret token=secret-runtime-token',
    )
    const provider = new SensitiveToolCallingProvider()
    insertInbound({
      mailbox,
      id: 'in_sensitive_tool',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'read sensitive note' },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: createFileTools(),
    }).runUntilIdle({ waitForActiveQueries: true })

    const eventPayloads = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type IN ('log', 'tool.call', 'tool.result', 'assistant.text.done') ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const outboundRows = readRows(
      mailbox.paths.outboundDbPath,
      'SELECT content FROM messages_out ORDER BY timestamp ASC, id ASC',
    ) as Array<{ content: string }>
    const persisted = JSON.stringify({
      events: eventPayloads.map((row) => JSON.parse(row.payload) as unknown),
      outbound: outboundRows.map((row) => JSON.parse(row.content) as unknown),
    })

    expect(persisted).not.toContain('sk-or-secret-secret')
    expect(persisted).not.toContain('secret-runtime-token')
    expect(persisted).not.toContain('gen_sensitive_session_id')
    expect(persisted).toContain('"providerSessionId":"[redacted]"')
    expect(persisted).toContain('apiKey=[redacted]')
    expect(persisted).toContain('"authorization":"[redacted]"')
    expect(persisted).toContain('token=[redacted]')

    const pushedFeedback = JSON.stringify(provider.queries[0]?.pushed ?? [])
    expect(pushedFeedback).not.toContain('sk-or-secret-secret')
    expect(pushedFeedback).not.toContain('secret-runtime-token')
    expect(pushedFeedback).toContain('apiKey=[redacted]')
    expect(pushedFeedback).toContain('token=[redacted]')
  })

  it('redacts tool exceptions before sending failed results back to the provider loop', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    const provider = new ToolCallingProvider()
    insertInbound({
      mailbox,
      id: 'in_tool_secret_error',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'read note with failing tool' },
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: ['file.read'],
          redaction: 'strict',
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider,
      cwd: workspaceRoot,
      tools: [createThrowingFileReadTool('tool failed OPENROUTER_API_KEY=sk-or-secret-secret')],
    }).runUntilIdle({ waitForActiveQueries: true })

    const pushed = JSON.parse(provider.queries[0]?.pushed[0] ?? '{}') as {
      error?: string
      status?: string
    }
    expect(pushed).toMatchObject({
      status: 'failed',
      error: 'tool failed OPENROUTER_API_KEY=[redacted]',
    })
    expect(JSON.stringify(provider.queries[0]?.pushed ?? [])).not.toContain('sk-or-secret-secret')

    const rows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT payload FROM events_out WHERE type = 'tool.result' ORDER BY seq ASC",
    ) as Array<{ payload: string }>
    const persisted = JSON.stringify(rows)
    expect(persisted).toContain('OPENROUTER_API_KEY=[redacted]')
    expect(persisted).not.toContain('sk-or-secret-secret')
  })

  it('marks a provider error event as a failed run instead of completing it', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    insertInbound({
      mailbox,
      id: 'in_error',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'fail provider' } }),
    })

    await new RuntimeKernel({
      mailbox,
      provider: new ErrorProvider(),
      cwd: root,
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_error',
      status: 'failed',
      error: 'provider auth failed',
    })
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type IN ('error', 'run.status') ORDER BY seq ASC",
      ),
    ).toEqual([
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'running',
          phase: 'provider',
        }),
      },
      {
        type: 'error',
        payload: JSON.stringify({
          type: 'error',
          runId: 'run_1',
          message: 'provider auth failed',
          retryable: false,
        }),
      },
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'failed',
          phase: 'provider',
        }),
      },
    ])
  })

  it('reports provider failures in managed tool mode through the unified pump', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    insertInbound({
      mailbox,
      id: 'in_managed_error',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: {
          ...dispatch().intent,
          message: 'managed-mode failure should still fail run',
        },
        policy: {
          ...dispatch().policy,
          allowedTools: ['file.read'],
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider: new ErrorProvider(),
      cwd: root,
      tools: createFileTools(),
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_managed_error',
      status: 'failed',
      error: 'provider auth failed',
    })
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type IN ('error', 'run.status') ORDER BY seq ASC",
      ),
    ).toEqual([
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'running',
          phase: 'provider',
        }),
      },
      {
        type: 'error',
        payload: JSON.stringify({
          type: 'error',
          runId: 'run_1',
          message: 'provider auth failed',
          retryable: false,
        }),
      },
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'failed',
          phase: 'provider',
        }),
      },
    ])
  })

  it('marks provider turns that stop after tool activity as failed instead of completed', async () => {
    const { root, mailbox } = makeSession('default', 'mainspring-runtime-kernel-')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'input.txt'), 'stalled tool data')
    insertInbound({
      mailbox,
      id: 'in_stalled_tool_turn',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({
        intent: { ...dispatch().intent, message: 'stalled tool turn should fail honestly' },
        policy: {
          ...dispatch().policy,
          allowedTools: ['file.read'],
        },
      }),
    })

    await new RuntimeKernel({
      mailbox,
      provider: new StallingToolProvider(),
      cwd: workspaceRoot,
      tools: createFileTools(),
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_stalled_tool_turn',
      status: 'failed',
      error: 'Provider stopped after tool activity without producing a final assistant response.',
    })

    const rows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('tool.call', 'tool.result', 'error', 'run.status') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(rows.map((row) => row.type)).toEqual([
      'run.status',
      'tool.call',
      'tool.result',
      'error',
      'run.status',
    ])
    expect(JSON.parse(rows.at(-2)?.payload ?? '{}')).toMatchObject({
      type: 'error',
      runId: 'run_1',
      message: 'Provider stopped after tool activity without producing a final assistant response.',
      retryable: false,
    })
    expect(JSON.parse(rows.at(-1)?.payload ?? '{}')).toMatchObject({
      type: 'run.status',
      runId: 'run_1',
      status: 'failed',
      phase: 'provider',
    })
  })

  it('marks a thrown provider exception as a failed run and redacts the error', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({
      mailbox,
      id: 'in_throw',
      timestamp: new Date('2026-05-16T00:00:01.000Z').toISOString(),
      body: dispatch({ intent: { ...dispatch().intent, message: 'throw provider' } }),
    })

    await new RuntimeKernel({
      mailbox,
      provider: new ThrowingProvider(),
      cwd: root,
    }).runUntilIdle({ waitForActiveQueries: true })

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toContainEqual({
      message_id: 'in_throw',
      status: 'failed',
      error: 'provider exploded OPENROUTER_API_KEY=[redacted]',
    })

    const rows = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('error', 'run.status') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>
    expect(rows.map((row) => row.type)).toEqual(['run.status', 'error', 'run.status'])
    expect(JSON.parse(rows.at(-1)?.payload ?? '{}')).toMatchObject({
      type: 'run.status',
      runId: 'run_1',
      status: 'failed',
      phase: 'provider',
    })
    const persisted = JSON.stringify(rows)
    expect(persisted).toContain('OPENROUTER_API_KEY=[redacted]')
    expect(persisted).not.toContain('sk-or-secret-secret')
  })
})
