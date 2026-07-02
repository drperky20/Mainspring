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
  'run.awaiting_approval',
  'assistant.text.delta',
  'assistant.text.done',
  'tool.call.requested',
  'tool.call.updated',
  'tool.call.completed',
  'tool.call.failed',
  'tool.call.blocked',
  'approval.requested',
  'approval.approved',
  'approval.denied',
  'artifact.created',
  'browser.updated',
  'browser.screenshot.created',
  'file.changed',
  'memory.updated',
  'skill.updated',
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
    expect(EMITTED_RUN_EVENT_TYPES).toHaveLength(24)
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
        'run awaiting approval',
        { type: 'run.status', runId: 'run_1', status: 'waiting_approval', phase: 'tools' },
        'run.awaiting_approval',
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
        'tool update',
        {
          type: 'tool.update',
          runId: 'run_1',
          toolCallId: 'tool_1',
          message: 'running tool',
          payload: { progress: 0.5 },
        },
        'tool.call.updated',
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
        'artifact created',
        {
          type: 'artifact.created',
          runId: 'run_1',
          artifactId: 'artifact_1',
          kind: 'file',
        },
        'artifact.created',
      ],
      [
        'browser updated',
        {
          type: 'browser.event',
          runId: 'run_1',
          event: 'opened',
          payload: { url: 'https://example.test' },
        },
        'browser.updated',
      ],
      [
        'browser screenshot created',
        {
          type: 'browser.screenshot',
          runId: 'run_1',
          artifactId: 'artifact_browser_1',
          url: 'https://example.test/screenshot.png',
        },
        'browser.screenshot.created',
      ],
      [
        'file changed',
        {
          type: 'file.change',
          runId: 'run_1',
          path: 'notes/output.md',
          action: 'updated',
        },
        'file.changed',
      ],
      [
        'memory updated',
        {
          type: 'memory.event',
          runId: 'run_1',
          action: 'stored',
          metadata: { scope: 'workspace' },
        },
        'memory.updated',
      ],
      [
        'skill updated',
        {
          type: 'skill.event',
          runId: 'run_1',
          skillKey: 'summary',
          action: 'installed',
          metadata: { version: '1.0.0' },
        },
        'skill.updated',
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

  it('preserves waiting approval run status as a typed SDK run lifecycle event', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'run.status',
        runId: 'run_1',
        status: 'waiting_approval',
        phase: 'tool-policy',
      }),
    )

    expect(normalized).toMatchObject({
      type: 'run.awaiting_approval',
      payload: {
        phase: 'tool-policy',
      },
      visibility: 'public',
    })
  })

  it('preserves sanitized tool update detail as a typed SDK run event', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'tool.update',
        runId: 'run_1',
        toolCallId: 'tool_1',
        message: 'streaming shell output',
        payload: {
          stdout: 'apiKey=sk-ant-secret123456789',
          stderr: 'ok',
          exitCode: 0,
        },
      }),
    )

    expect(normalized).toMatchObject({
      type: 'tool.call.updated',
      payload: {
        toolCallId: 'tool_1',
        message: 'streaming shell output',
      },
    })
    const payloadJson = JSON.stringify(normalized?.payload)
    expect(payloadJson).toContain('[redacted]')
    expect(payloadJson).not.toContain('sk-ant-secret123456789')
  })

  it('preserves artifact creation rows as typed SDK run events', () => {
    const normalized = normalizeRuntimeEventRow(
      row({
        type: 'artifact.created',
        runId: 'run_1',
        artifactId: 'artifact_1',
        kind: 'file',
      }),
    )

    expect(normalized).toMatchObject({
      type: 'artifact.created',
      payload: {
        artifactId: 'artifact_1',
        kind: 'file',
      },
      visibility: 'artifact-only',
    })
  })

  it('preserves browser events as typed SDK run events with sanitized details', () => {
    const event = normalizeRuntimeEventRow(
      row({
        type: 'browser.event',
        runId: 'run_1',
        event: 'navigated',
        payload: {
          url: 'https://example.test/?apiKey=sk-ant-secret123456789',
          note: 'token=sk-ant-secret123456789',
        },
      }),
    )

    expect(event).toMatchObject({
      type: 'browser.updated',
      payload: {
        action: 'navigated',
        payload: {
          url: 'https://example.test/?apiKey=[redacted]',
          note: 'token=[redacted]',
        },
      },
      visibility: 'sensitive',
    })

    const screenshot = normalizeRuntimeEventRow(
      row({
        type: 'browser.screenshot',
        runId: 'run_1',
        artifactId: 'artifact_browser_1',
        url: 'https://example.test/screenshot.png?access_token=sk-ant-secret123456789',
      }),
    )

    expect(screenshot).toMatchObject({
      type: 'browser.screenshot.created',
      payload: {
        artifactId: 'artifact_browser_1',
        url: 'https://example.test/screenshot.png?access_token=%5Bredacted%5D',
      },
      visibility: 'sensitive',
    })
    expect(JSON.stringify(screenshot?.payload)).not.toContain('sk-ant-secret123456789')
  })

  it('preserves file changes as typed SDK run events with normalized action', () => {
    expect(
      normalizeRuntimeEventRow(
        row({
          type: 'file.change',
          runId: 'run_1',
          path: 'notes/output.md',
          action: 'created',
        }),
      ),
    ).toMatchObject({
      type: 'file.changed',
      payload: {
        path: 'notes/output.md',
        action: 'created',
      },
      visibility: 'sensitive',
    })

    expect(
      normalizeRuntimeEventRow(
        row({
          type: 'file.change',
          runId: 'run_1',
          path: 'notes/output.md',
          action: 'renamed',
        }),
      )?.payload,
    ).toEqual({
      path: 'notes/output.md',
      action: 'unknown',
    })
  })

  it('preserves memory and skill updates as typed SDK run events with sanitized metadata', () => {
    const memory = normalizeRuntimeEventRow(
      row({
        type: 'memory.event',
        runId: 'run_1',
        action: 'stored',
        metadata: {
          scope: 'workspace',
          note: 'apiKey=sk-ant-secret123456789',
        },
      }),
    )

    expect(memory).toMatchObject({
      type: 'memory.updated',
      payload: {
        action: 'stored',
        metadata: {
          scope: 'workspace',
          note: 'apiKey=[redacted]',
        },
      },
      visibility: 'sensitive',
    })

    const skill = normalizeRuntimeEventRow(
      row({
        type: 'skill.event',
        runId: 'run_1',
        skillKey: 'summary',
        action: 'installed',
        metadata: {
          source: 'apiKey=sk-ant-secret123456789',
        },
      }),
    )

    expect(skill).toMatchObject({
      type: 'skill.updated',
      payload: {
        skillKey: 'summary',
        action: 'installed',
        metadata: {
          source: 'apiKey=[redacted]',
        },
      },
      visibility: 'sensitive',
    })
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
