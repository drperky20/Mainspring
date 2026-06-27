import { describe, expect, it } from 'vitest'
import {
  IterationBudget,
  TurnRetryState,
  buildTurnContext,
  classifyToolResult,
  finalizeTurn,
  projectProviderEvent,
} from './TurnLifecycle.js'

describe('Hermes-style turn lifecycle primitives', () => {
  it('builds a sanitized turn context with stable flags and metrics', () => {
    const context = buildTurnContext({
      sessionId: 'session_1',
      runId: 'run_1',
      cwd: '/workspace',
      userText: 'use apiKey=sk-or-secret-value',
      systemPrompt: 'token: sk-system-secret',
      messages: [{ role: 'assistant', content: 'Bearer secret-token' }],
      attachments: [{ id: 'att_1', name: 'notes.txt', size: 12 }],
      createdAt: '2026-06-27T00:00:00.000Z',
      providerId: 'openrouter',
      modelId: 'openrouter/free',
    })

    expect(context.sanitizedUserText).toBe('use apiKey=[redacted]')
    expect(context.systemPrompt).toBe('token: [redacted]')
    expect(context.messages[0]?.content).toBe('Bearer [redacted]')
    expect(context.flags).toEqual({
      hasSystemPrompt: true,
      hasAttachments: true,
      hasPriorMessages: true,
    })
    expect(context.metrics).toMatchObject({
      messageCount: 1,
      attachmentCount: 1,
    })
  })

  it('consumes and refunds an iteration budget without over-consuming', () => {
    const budget = new IterationBudget(2)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(false)
    expect(budget.snapshot()).toEqual({ maxTotal: 2, used: 2, remaining: 0, exhausted: true })
    budget.refund()
    expect(budget.snapshot()).toEqual({ maxTotal: 2, used: 1, remaining: 1, exhausted: false })
  })

  it('tracks retry decisions by retryable flag or classification', () => {
    const retry = new TurnRetryState()
    retry.recordFailure({
      message: 'provider failed OPENROUTER_API_KEY=sk-or-secret',
      classification: 'provider_request_failed',
    })

    expect(retry.attempts()).toBe(1)
    expect(retry.lastFailure()?.message).toBe('provider failed OPENROUTER_API_KEY=[redacted]')
    expect(
      retry.shouldRetry({
        maxAttempts: 2,
        retryableClassifications: ['provider_request_failed'],
      }),
    ).toBe(true)

    retry.recordFailure({ message: 'again', retryable: true })
    expect(retry.shouldRetry({ maxAttempts: 2 })).toBe(false)
  })

  it('classifies high-signal tool results', () => {
    expect(classifyToolResult('file.write', { status: 'completed' })).toBe('file_mutation_landed')
    expect(classifyToolResult('browser.screenshot', { artifactId: 'artifact_1' })).toBe('artifact_created')
    expect(classifyToolResult('shell.exec', { status: 'blocked' })).toBe('blocked')
    expect(classifyToolResult('web.fetch', { status: 'error' })).toBe('failed')
    expect(classifyToolResult('web.search', { ok: true })).toBe('completed')
  })

  it('projects provider events into deterministic canonical turn events', () => {
    expect(
      projectProviderEvent({
        runId: 'run_1',
        index: 7,
        event: { type: 'tool_call', name: 'file.read', input: { path: 'secret=sk-value' } },
      }),
    ).toEqual({
      type: 'tool.call',
      runId: 'run_1',
      toolCallId: 'tool_run_1_7_file.read',
      name: 'file.read',
      input: { path: 'secret=[redacted]' },
    })

    expect(
      projectProviderEvent({
        runId: 'run_1',
        index: 8,
        event: {
          type: 'error',
          message: 'bad apiKey=sk-or-secret',
          retryable: true,
          classification: 'provider_request_failed',
        },
      }),
    ).toEqual({
      type: 'runtime.error',
      runId: 'run_1',
      message: 'bad apiKey=[redacted]',
      retryable: true,
      classification: 'provider_request_failed',
    })
  })

  it('finalizes turns from projected events', () => {
    const projected = [
      projectProviderEvent({
        runId: 'run_1',
        index: 1,
        event: { type: 'tool_call', name: 'file.read', input: { path: 'README.md' } },
      }),
      projectProviderEvent({
        runId: 'run_1',
        index: 2,
        event: { type: 'result', text: 'done' },
      }),
    ]

    expect(finalizeTurn({ events: projected })).toEqual({
      exitReason: 'completed',
      errorCount: 0,
      toolCallCount: 1,
      assistantResult: 'done',
      lastMeaningfulEventType: 'assistant.result',
    })
  })

  it('marks tool-ending turns without a final assistant result as stalled_after_tool', () => {
    const projected = [
      projectProviderEvent({
        runId: 'run_1',
        index: 1,
        event: { type: 'tool_call', name: 'file.read', input: { path: 'README.md' } },
      }),
      projectProviderEvent({
        runId: 'run_1',
        index: 2,
        event: { type: 'tool_result', name: 'file.read', output: { ok: true } },
      }),
    ]

    expect(finalizeTurn({ events: projected })).toEqual({
      exitReason: 'stalled_after_tool',
      errorCount: 0,
      toolCallCount: 1,
      assistantResult: null,
      lastMeaningfulEventType: 'tool.result',
    })
  })
})
