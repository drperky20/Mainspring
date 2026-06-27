import { describe, expect, it } from 'vitest'
import type { MainspringEvent } from '#protocol'
import {
  PROVIDER_INIT_LOG_MESSAGE,
  type RunEventType,
} from '../contracts/runtime.js'
import type { RuntimeEventRow } from '../mailbox/SqliteMailbox.js'
import { normalizeRuntimeEventRow } from './normalizeRuntimeEvent.js'

const EMITTED_RUN_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'assistant.text.delta',
  'assistant.text.done',
  'tool.call.requested',
  'tool.call.completed',
  'tool.call.failed',
  'tool.call.blocked',
  'approval.requested',
  'approval.approved',
  'approval.denied',
  'usage.updated',
  'runtime.warning',
  'runtime.error',
] as const satisfies readonly RunEventType[]

const allRunEventTypesCovered: Exclude<
  RunEventType,
  (typeof EMITTED_RUN_EVENT_TYPES)[number]
> extends never
  ? true
  : never = true

const nativeEventFixtures = {
  'run.status': { type: 'run.status', runId: 'run_1', status: 'running' },
  'assistant.text.delta': { type: 'assistant.text.delta', runId: 'run_1', text: 'hel' },
  'assistant.text.done': { type: 'assistant.text.done', runId: 'run_1', text: 'hello' },
  'tool.call': {
    type: 'tool.call',
    runId: 'run_1',
    toolCallId: 'tool_1',
    name: 'file.read',
    input: { path: 'README.md' },
  },
  'tool.update': {
    type: 'tool.update',
    runId: 'run_1',
    toolCallId: 'tool_1',
    message: 'reading',
  },
  'tool.result': {
    type: 'tool.result',
    runId: 'run_1',
    toolCallId: 'tool_1',
    name: 'file.read',
    status: 'completed',
    output: { text: 'done' },
  },
  'browser.event': { type: 'browser.event', runId: 'run_1', event: 'opened' },
  'browser.screenshot': {
    type: 'browser.screenshot',
    runId: 'run_1',
    artifactId: 'art_1',
    url: 'https://example.test',
  },
  'file.change': { type: 'file.change', runId: 'run_1', path: 'notes.md', action: 'updated' },
  'approval.requested': {
    type: 'approval.requested',
    runId: 'run_1',
    approval: { approvalId: 'approval_1', targetKey: 'file.write' },
  },
  'approval.resolved': {
    type: 'approval.resolved',
    runId: 'run_1',
    approval: { approvalId: 'approval_1', decision: 'approved' },
  },
  'artifact.created': {
    type: 'artifact.created',
    runId: 'run_1',
    artifactId: 'art_1',
    kind: 'file',
  },
  'memory.event': { type: 'memory.event', runId: 'run_1', action: 'stored' },
  'skill.event': { type: 'skill.event', runId: 'run_1', skillKey: 'summary', action: 'started' },
  log: { type: 'log', runId: 'run_1', level: 'warn', message: 'careful' },
  usage: {
    type: 'usage',
    runId: 'run_1',
    providerSessionId: 'provider_usage_1',
    usage: {
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      inputTokens: 3,
      outputTokens: 5,
      totalTokens: 8,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 4,
      rateLimit: {
        provider: 'openrouter',
        requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
      },
    },
  },
  error: { type: 'error', runId: 'run_1', message: 'boom', retryable: true },
} satisfies Record<MainspringEvent['type'], MainspringEvent>

const allNativeEventTypesCovered: Exclude<
  MainspringEvent['type'],
  keyof typeof nativeEventFixtures
> extends never
  ? true
  : never = true

function row(event: MainspringEvent, seq = 1): RuntimeEventRow {
  return {
    seq,
    runId: 'run_1',
    sessionId: 'session_1',
    type: event.type,
    timestamp: '2026-06-27T00:00:00.000Z',
    event,
  }
}

describe('normalizeRuntimeEventRow', () => {
  it('keeps the public RunEventType contract fully classified', () => {
    expect(allRunEventTypesCovered).toBe(true)
    expect(EMITTED_RUN_EVENT_TYPES).toHaveLength(16)
    expect(EMITTED_RUN_EVENT_TYPES as readonly string[]).not.toContain('provider.init')
  })

  it('normalizes every native runtime event variant without dropping rows', () => {
    expect(allNativeEventTypesCovered).toBe(true)

    for (const event of Object.values(nativeEventFixtures)) {
      const normalized = normalizeRuntimeEventRow(row(event))
      expect(normalized, event.type).not.toBeNull()
      expect(normalized?.runId).toBe('run_1')
      expect(normalized?.sessionId).toBe('session_1')
    }
  })

  it('emits every public RunEventType from current native runtime rows', () => {
    const cases: Array<[string, MainspringEvent, RunEventType]> = [
      ['run started', { type: 'run.status', runId: 'run_1', status: 'running' }, 'run.started'],
      [
        'run completed',
        { type: 'run.status', runId: 'run_1', status: 'completed' },
        'run.completed',
      ],
      ['run failed', { type: 'run.status', runId: 'run_1', status: 'failed' }, 'run.failed'],
      [
        'run cancelled',
        { type: 'run.status', runId: 'run_1', status: 'cancelled' },
        'run.cancelled',
      ],
      [
        'assistant delta',
        { type: 'assistant.text.delta', runId: 'run_1', text: 'hel' },
        'assistant.text.delta',
      ],
      [
        'assistant done',
        { type: 'assistant.text.done', runId: 'run_1', text: 'hello' },
        'assistant.text.done',
      ],
      [
        'tool requested',
        {
          type: 'tool.call',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'file.read',
          input: { path: 'README.md' },
        },
        'tool.call.requested',
      ],
      [
        'tool completed',
        {
          type: 'tool.result',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'file.read',
          status: 'completed',
          output: { text: 'ok' },
        },
        'tool.call.completed',
      ],
      [
        'tool failed',
        {
          type: 'tool.result',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'file.read',
          status: 'failed',
          output: { stderr: 'nope' },
        },
        'tool.call.failed',
      ],
      [
        'tool blocked',
        {
          type: 'tool.result',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'file.write',
          status: 'approval_required',
          output: { reason: 'needs approval' },
        },
        'tool.call.blocked',
      ],
      [
        'approval requested',
        {
          type: 'approval.requested',
          runId: 'run_1',
          approval: { approvalId: 'approval_1', targetKey: 'file.write' },
        },
        'approval.requested',
      ],
      [
        'approval approved',
        {
          type: 'approval.resolved',
          runId: 'run_1',
          approval: { approvalId: 'approval_1', decision: 'approved' },
        },
        'approval.approved',
      ],
      [
        'approval denied',
        {
          type: 'approval.resolved',
          runId: 'run_1',
          approval: { approvalId: 'approval_1', decision: 'denied' },
        },
        'approval.denied',
      ],
      [
        'usage',
        {
          type: 'usage',
          runId: 'run_1',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
        'usage.updated',
      ],
      ['warning', { type: 'log', runId: 'run_1', level: 'warn', message: 'careful' }, 'runtime.warning'],
      ['error', { type: 'error', runId: 'run_1', message: 'boom' }, 'runtime.error'],
    ]

    for (const [label, event, expectedType] of cases) {
      expect(normalizeRuntimeEventRow(row(event))?.type, label).toBe(expectedType)
    }
  })

  it('summarizes and redacts sensitive tool output before exposing SDK events', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'tool.result',
        runId: 'run_1',
        toolCallId: 'tool_1',
        name: 'shell.exec',
        status: 'completed',
        output: {
          command: 'echo hidden',
          exitCode: 0,
          stdout: 'apiKey=sk-ant-secret123456789',
          stderr: 'ok',
        },
      }),
    )

    expect(normalized?.type).toBe('tool.call.completed')
    const payloadJson = JSON.stringify(normalized?.payload)
    expect(payloadJson).toContain('[redacted]')
    expect(payloadJson).not.toContain('sk-ant-secret123456789')
  })

  it('preserves extended usage detail in normalized runtime usage events', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'usage',
        runId: 'run_1',
        providerSessionId: 'provider_usage_1',
        usage: {
          provider: 'openrouter',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          inputTokens: 3,
          outputTokens: 5,
          totalTokens: 8,
          cacheReadTokens: 2,
          cacheWriteTokens: 1,
          reasoningTokens: 4,
          rateLimit: {
            provider: 'openrouter',
            requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
          },
        },
      }),
    )

    expect(normalized).toMatchObject({
      type: 'usage.updated',
      payload: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4',
        modelFamily: 'claude',
        providerTransport: 'openrouter-chat-completions',
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        reasoningTokens: 4,
        providerSessionId: 'provider_usage_1',
        rateLimit: {
          provider: 'openrouter',
          requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
        },
      },
    })
  })

  it('preserves sanitized log payload detail in normalized runtime warning events', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'log',
        runId: 'run_1',
        level: 'debug',
        message: PROVIDER_INIT_LOG_MESSAGE,
        payload: {
          provider: 'openrouter',
          providerSessionId: 'provider_init_1',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          apiKey: 'sk-ant-secret123456789',
        },
      }),
    )

    expect(normalized).toMatchObject({
      type: 'runtime.warning',
      payload: {
        level: 'debug',
        message: PROVIDER_INIT_LOG_MESSAGE,
        payload: {
          provider: 'openrouter',
          providerSessionId: 'provider_init_1',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          apiKey: '[redacted]',
        },
      },
    })
  })

  it('keeps provider-init detail on runtime.warning instead of inventing a dedicated public event type', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'log',
        runId: 'run_1',
        level: 'debug',
        message: PROVIDER_INIT_LOG_MESSAGE,
        payload: {
          provider: 'openrouter',
          modelId: 'anthropic/claude-sonnet-4',
        },
      }),
    )

    expect(normalized?.type).toBe('runtime.warning')
    expect((normalized as { type?: string } | null)?.type).not.toBe('provider.init')
  })
})
