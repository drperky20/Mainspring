import { describe, expect, it } from 'vitest'
import type { MainspringEvent } from '#protocol'
import { PROVIDER_INIT_LOG_MESSAGE } from '../contracts/runtime.js'
import {
  TURN_EVENT_SCHEMA_VERSION,
  TurnEventSchema,
  bridgeRuntimeEventToTurnEvents,
  toolCategoryForName,
  type TurnEventType,
} from './index.js'

const RUNTIME_BRIDGED_TURN_EVENT_TYPES = [
  'turn.status',
  'text.delta',
  'text.done',
  'tool.call',
  'tool.update',
  'tool.result',
  'approval.requested',
  'approval.resolved',
  'browser.preview',
  'file.preview',
  'artifact.created',
  'usage',
  'log',
  'error',
] as const satisfies readonly TurnEventType[]

const CONTROL_ONLY_TURN_EVENT_TYPES = [
  'reasoning.delta',
  'reasoning.done',
  'progress',
  'source.reference',
  'result.summary',
  'agent.status',
  'provider.retry',
  'provider.fallback',
] as const satisfies readonly TurnEventType[]

const allTurnEventTypesClassified: Exclude<
  TurnEventType,
  | (typeof RUNTIME_BRIDGED_TURN_EVENT_TYPES)[number]
  | (typeof CONTROL_ONLY_TURN_EVENT_TYPES)[number]
> extends never
  ? true
  : never = true

const runtimeEventFixtures = {
  'run.status': { type: 'run.status', runId: 'run_1', status: 'running' },
  'assistant.text.delta': {
    type: 'assistant.text.delta',
    runId: 'run_1',
    text: 'hel',
  },
  'assistant.text.done': {
    type: 'assistant.text.done',
    runId: 'run_1',
    text: 'hello',
  },
  'tool.call': {
    type: 'tool.call',
    runId: 'run_1',
    toolCallId: 'tool_1',
    name: 'shell.exec',
    input: { command: 'pwd' },
  },
  'tool.update': {
    type: 'tool.update',
    runId: 'run_1',
    toolCallId: 'tool_1',
    message: 'running',
  },
  'tool.result': {
    type: 'tool.result',
    runId: 'run_1',
    toolCallId: 'tool_1',
    name: 'shell.exec',
    status: 'completed',
    output: { exitCode: 0 },
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
    approval: {
      approvalId: 'approval_1',
      kind: 'tool',
      title: 'Run shell command',
      reason: 'needs operator review',
    },
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
  error: { type: 'error', runId: 'run_1', message: 'boom', retryable: false },
} satisfies Record<MainspringEvent['type'], MainspringEvent>

const allRuntimeEventTypesCovered: Exclude<
  MainspringEvent['type'],
  keyof typeof runtimeEventFixtures
> extends never
  ? true
  : never = true

function parseEnvelope(type: TurnEventType, payload: Record<string, unknown>, seq = 1) {
  return TurnEventSchema.parse({
    v: TURN_EVENT_SCHEMA_VERSION,
    turnId: 'turn_1',
    seq,
    type,
    at: '2026-06-27T00:00:00.000Z',
    payload,
  })
}

describe('bridgeRuntimeEventToTurnEvents', () => {
  it('classifies every public TurnEventType as runtime-bridged or control-only', () => {
    expect(allTurnEventTypesClassified).toBe(true)
    expect(RUNTIME_BRIDGED_TURN_EVENT_TYPES as readonly string[]).not.toContain('provider.init')
    expect(CONTROL_ONLY_TURN_EVENT_TYPES as readonly string[]).not.toContain('provider.init')
    expect(CONTROL_ONLY_TURN_EVENT_TYPES).toEqual([
      'reasoning.delta',
      'reasoning.done',
      'progress',
      'source.reference',
      'result.summary',
      'agent.status',
      'provider.retry',
      'provider.fallback',
    ])
  })

  it('bridges every native runtime event variant into parseable TurnEvents', () => {
    expect(allRuntimeEventTypesCovered).toBe(true)

    for (const event of Object.values(runtimeEventFixtures)) {
      const bridged = bridgeRuntimeEventToTurnEvents(event)
      expect(bridged.length, event.type).toBeGreaterThan(0)
      for (const [index, output] of bridged.entries()) {
        expect(parseEnvelope(output.type, output.payload, index + 1).type).toBe(output.type)
      }
    }
  })

  it('documents the runtime event to TurnEvent projection table', () => {
    const cases: Array<[string, MainspringEvent, TurnEventType]> = [
      ['run status', { type: 'run.status', runId: 'run_1', status: 'running' }, 'turn.status'],
      [
        'assistant delta',
        { type: 'assistant.text.delta', runId: 'run_1', text: 'hel' },
        'text.delta',
      ],
      [
        'assistant done',
        { type: 'assistant.text.done', runId: 'run_1', text: 'hello' },
        'text.done',
      ],
      [
        'tool call',
        {
          type: 'tool.call',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'shell.exec',
          input: { command: 'pwd' },
        },
        'tool.call',
      ],
      [
        'tool update',
        {
          type: 'tool.update',
          runId: 'run_1',
          toolCallId: 'tool_1',
          message: 'running',
        },
        'tool.update',
      ],
      [
        'tool result',
        {
          type: 'tool.result',
          runId: 'run_1',
          toolCallId: 'tool_1',
          name: 'shell.exec',
          status: 'completed',
        },
        'tool.result',
      ],
      ['browser event', { type: 'browser.event', runId: 'run_1', event: 'opened' }, 'browser.preview'],
      [
        'browser screenshot',
        { type: 'browser.screenshot', runId: 'run_1', artifactId: 'art_1' },
        'browser.preview',
      ],
      [
        'file change',
        { type: 'file.change', runId: 'run_1', path: 'notes.md', action: 'updated' },
        'file.preview',
      ],
      [
        'approval requested',
        {
          type: 'approval.requested',
          runId: 'run_1',
          approval: { approvalId: 'approval_1', title: 'Approve tool' },
        },
        'approval.requested',
      ],
      [
        'approval resolved',
        {
          type: 'approval.resolved',
          runId: 'run_1',
          approval: { approvalId: 'approval_1', decision: 'denied' },
        },
        'approval.resolved',
      ],
      [
        'artifact',
        { type: 'artifact.created', runId: 'run_1', artifactId: 'art_1', kind: 'file' },
        'artifact.created',
      ],
      ['memory', { type: 'memory.event', runId: 'run_1', action: 'stored' }, 'log'],
      ['skill', { type: 'skill.event', skillKey: 'summary', action: 'started' }, 'log'],
      ['log', { type: 'log', level: 'info', message: 'hello' }, 'log'],
      [
        'usage',
        {
          type: 'usage',
          runId: 'run_1',
          usage: {
            inputTokens: 1,
            totalTokens: 2,
            cacheReadTokens: 1,
            reasoningTokens: 3,
            rateLimit: {
              provider: 'openai',
              requestsMinute: { limit: 120, remaining: 117, resetSeconds: 21 },
            },
          },
        },
        'usage',
      ],
      ['error', { type: 'error', message: 'boom', retryable: false }, 'error'],
    ]

    for (const [label, event, expectedType] of cases) {
      expect(bridgeRuntimeEventToTurnEvents(event)[0]?.type, label).toBe(expectedType)
    }
  })

  it('normalizes statuses, result states, and tool categories for the control channel', () => {
    expect(bridgeRuntimeEventToTurnEvents({ type: 'run.status', runId: 'run_1', status: 'started' })).toEqual([
      { type: 'turn.status', payload: { status: 'running' } },
    ])
    expect(
      bridgeRuntimeEventToTurnEvents({
        type: 'run.status',
        runId: 'run_1',
        status: 'awaiting_approval',
      }),
    ).toEqual([{ type: 'turn.status', payload: { status: 'awaiting_approval' } }])
    expect(bridgeRuntimeEventToTurnEvents({ type: 'run.status', runId: 'run_1', status: 'unknown' })).toEqual([])

    expect(
      bridgeRuntimeEventToTurnEvents({
        type: 'tool.result',
        runId: 'run_1',
        toolCallId: 'tool_1',
        name: 'file.write',
        status: 'denied',
      })[0]?.payload,
    ).toMatchObject({ status: 'denied' })
    expect(
      bridgeRuntimeEventToTurnEvents({
        type: 'tool.result',
        runId: 'run_1',
        toolCallId: 'tool_1',
        name: 'shell.exec',
        status: 'failed',
      })[0]?.payload,
    ).toMatchObject({ status: 'error' })

    expect(toolCategoryForName('browser.open')).toBe('browser')
    expect(toolCategoryForName('shell.exec')).toBe('exec')
    expect(toolCategoryForName('file.read')).toBe('file')
    expect(toolCategoryForName('memory.search')).toBe('memory')
    expect(toolCategoryForName('web.fetch')).toBe('http')
  })

  it('redacts runtime secrets before events move up the control channel', () => {
    const textEvent = bridgeRuntimeEventToTurnEvents({
      type: 'assistant.text.done',
      runId: 'run_1',
      text: 'apiKey=sk-ant-secret123456789',
    })[0]
    expect(textEvent?.payload.text).toBe('apiKey=[REDACTED]')

    const toolEvent = bridgeRuntimeEventToTurnEvents({
      type: 'tool.call',
      runId: 'run_1',
      toolCallId: 'tool_1',
      name: 'shell.exec',
      input: { apiKey: 'sk-ant-secret123456789' },
    })[0]
    const payloadJson = JSON.stringify(toolEvent?.payload)
    expect(payloadJson).toContain('[REDACTED]')
    expect(payloadJson).not.toContain('sk-ant-secret123456789')
  })

  it('preserves extended usage detail in bridged usage events', () => {
    expect(
      bridgeRuntimeEventToTurnEvents({
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
    ).toEqual([
        {
          type: 'usage',
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
            rateLimit: {
              provider: 'openrouter',
              requestsMinute: { limit: 60, remaining: 58, resetSeconds: 12 },
            },
            providerSessionId: 'provider_usage_1',
          },
        },
      ])
  })

  it('preserves sanitized log payload detail in bridged log events', () => {
    expect(
      bridgeRuntimeEventToTurnEvents({
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
    ).toEqual([
      {
        type: 'log',
        payload: {
          level: 'debug',
          message: PROVIDER_INIT_LOG_MESSAGE,
          payload: {
            provider: 'openrouter',
            providerSessionId: 'provider_init_1',
            modelId: 'anthropic/claude-sonnet-4',
            modelFamily: 'claude',
            providerTransport: 'openrouter-chat-completions',
            apiKey: '[REDACTED]',
          },
        },
      },
    ])
  })

  it('keeps provider-init detail on bridged log events instead of inventing a dedicated public control event', () => {
    const bridged = bridgeRuntimeEventToTurnEvents({
      type: 'log',
      runId: 'run_1',
      level: 'debug',
      message: PROVIDER_INIT_LOG_MESSAGE,
      payload: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4',
      },
    })

    expect(bridged).toEqual([
      {
        type: 'log',
        payload: {
          level: 'debug',
          message: PROVIDER_INIT_LOG_MESSAGE,
          payload: {
            provider: 'openrouter',
            modelId: 'anthropic/claude-sonnet-4',
          },
        },
      },
    ])
    expect(bridged.map((event) => event.type)).not.toContain('provider.init')
  })
})
