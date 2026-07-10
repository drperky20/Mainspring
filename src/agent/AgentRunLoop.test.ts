import { describe, expect, it } from 'vitest'
import { MockProvider, type MockProviderStep } from '../providers/MockProvider.js'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from '../providers/types.js'
import { AgentRunLoop } from './AgentRunLoop.js'
import type { ProjectedTurnEvent } from './TurnLifecycle.js'

class DelayedProviderQuery implements AgentQuery {
  aborted = false
  private release: (() => void) | null = null
  private readonly done = new Promise<void>((resolve) => {
    this.release = resolve
  })
  readonly events: AsyncIterable<ProviderEvent>

  constructor(readonly input: QueryInput) {
    this.events = this.createEvents()
  }

  push(): void {}

  end(): void {}

  abort(): void {
    this.aborted = true
    this.release?.()
  }

  private async *createEvents(): AsyncIterable<ProviderEvent> {
    yield { type: 'init', providerSessionId: `provider_${this.input.prompt}` }
    await this.done
    if (this.aborted) return
    yield { type: 'result', text: `completed ${this.input.prompt}` }
  }
}

class DelayedProvider implements AgentProvider {
  readonly queries: DelayedProviderQuery[] = []

  query(input: QueryInput): AgentQuery {
    const query = new DelayedProviderQuery(input)
    this.queries.push(query)
    return query
  }
}

describe('AgentRunLoop', () => {
  it('returns completed summary for provider events', async () => {
    const provider = new MockProvider([
      { type: 'event', event: { type: 'init', providerSessionId: 'provider_completed', provider: 'mock' } },
      { type: 'event', event: { type: 'delta', text: 'hi ' } },
      { type: 'event', event: { type: 'result', text: 'done' } },
    ])

    const result = await new AgentRunLoop(provider, {
      runId: 'run_completed',
      queryInput: { prompt: 'hello', cwd: '/workspace' },
    }).run()

    expect(result.exitReason).toBe('completed')
    expect(result.events).toHaveLength(3)
    expect(result.retries).toHaveLength(0)
    expect(result.errorCount).toBe(0)
    expect(result.toolCallCount).toBe(0)
    expect(result.budget.used).toBe(0)
    expect(result.budget.maxTotal).toBe(16)
  })

  it('retries on retryable provider error and returns retry summary', async () => {
    let attempts = 0
    const provider = new MockProvider((): MockProviderStep[] => {
      attempts += 1
      if (attempts === 1) {
        return [
          { type: 'event', event: { type: 'init', providerSessionId: 'provider_retry_1', provider: 'mock' } },
          {
            type: 'event',
            event: {
              type: 'error',
              message: 'retryable provider fail',
              retryable: true,
              classification: 'provider_request_failed',
            },
          },
        ]
      }

      return [
        { type: 'event', event: { type: 'init', providerSessionId: 'provider_retry_2', provider: 'mock' } },
        { type: 'event', event: { type: 'result', text: 'recovered' } },
      ]
    })

    const result = await new AgentRunLoop(provider, {
      runId: 'run_retry',
      queryInput: { prompt: 'retry', cwd: '/workspace' },
      maxRetryAttempts: 2,
      retryableClassifications: ['provider_request_failed'],
    }).run()

    expect(result.exitReason).toBe('completed')
    expect(result.retries).toHaveLength(1)
    expect(result.retries[0]).toMatchObject({
      attempt: 1,
      classification: 'provider_request_failed',
      message: 'retryable provider fail',
      retryable: true,
    })
    expect(result.errorCount).toBe(1)
    expect(result.events).toEqual([
      {
        type: 'provider.init',
        runId: 'run_retry',
        providerSessionId: 'provider_retry_1',
        provider: 'mock',
      },
      {
        type: 'runtime.error',
        runId: 'run_retry',
        message: 'retryable provider fail',
        retryable: true,
        classification: 'provider_request_failed',
      },
      {
        type: 'provider.init',
        runId: 'run_retry',
        providerSessionId: 'provider_retry_2',
        provider: 'mock',
      },
      {
        type: 'assistant.result',
        runId: 'run_retry',
        text: 'recovered',
      },
    ])
  })

  it('exhausts iteration budget when too many tool calls arrive', async () => {
    const provider = new MockProvider([
      { type: 'event', event: { type: 'init', providerSessionId: 'provider_budget' } },
      { type: 'event', event: { type: 'tool_call', name: 'file.read', input: { path: 'one.txt' } } },
      { type: 'event', event: { type: 'tool_call', name: 'file.read', input: { path: 'two.txt' } } },
      { type: 'event', event: { type: 'tool_call', name: 'file.read', input: { path: 'three.txt' } } },
      { type: 'event', event: { type: 'result', text: 'never reached' } },
    ])

    const result = await new AgentRunLoop(provider, {
      runId: 'run_budget',
      queryInput: { prompt: 'tool loop', cwd: '/workspace' },
      maxIterations: 2,
    }).run()

    expect(result.exitReason).toBe('budget_exhausted')
    expect(result.budget.used).toBe(2)
    expect(result.budget.remaining).toBe(0)
    expect(result.budget.exhausted).toBe(true)
    expect(result.toolCallCount).toBe(2)
    expect(result.events).toEqual([
      { type: 'provider.init', runId: 'run_budget', providerSessionId: 'provider_budget' },
      {
        type: 'tool.call',
        runId: 'run_budget',
        toolCallId: 'tool_run_budget_1_file.read',
        name: 'file.read',
        input: { path: 'one.txt' },
      },
      {
        type: 'tool.call',
        runId: 'run_budget',
        toolCallId: 'tool_run_budget_2_file.read',
        name: 'file.read',
        input: { path: 'two.txt' },
      },
    ])
  })

  it('cancels an active query with AbortSignal', async () => {
    const provider = new DelayedProvider()
    const controller = new AbortController()
    const run = new AgentRunLoop(provider, {
      runId: 'run_abort',
      queryInput: { prompt: 'wait', cwd: '/workspace' },
      signal: controller.signal,
    })

    const resultPromise = run.run()
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    const result = await resultPromise

    expect(result.exitReason).toBe('cancelled')
    expect(provider.queries[0]?.aborted).toBe(true)
    expect(result.events).toEqual([
      { type: 'provider.init', runId: 'run_abort', providerSessionId: 'provider_wait' },
    ])
    expect(result.budget.used).toBe(0)
  })

  it('invokes hooks and still reaches provider abort', async () => {
    const provider = new DelayedProvider()
    const controller = new AbortController()
    let queryFromHook: DelayedProviderQuery | undefined
    const projectedEvents: ProjectedTurnEvent[] = []

    const loop = new AgentRunLoop(provider, {
      runId: 'run_hooked',
      queryInput: { prompt: 'hooked', cwd: '/workspace' },
      signal: controller.signal,
      onQuery: (query) => {
        queryFromHook = query as DelayedProviderQuery
      },
      onEvent: (event) => {
        projectedEvents.push(event)
      },
    })

    const resultPromise = loop.run()
    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
    expect(queryFromHook).toBe(provider.queries[0])

    controller.abort()
    const result = await resultPromise

    expect(result.exitReason).toBe('cancelled')
    expect(projectedEvents.map((event) => event.type)).toEqual(['provider.init'])
    expect(queryFromHook?.aborted).toBe(true)
    expect(provider.queries[0]?.aborted).toBe(true)
  })

  it('invokes tool-call hooks with raw and projected tool events', async () => {
    const provider = new MockProvider([
      { type: 'event', event: { type: 'init', providerSessionId: 'provider_tools' } },
      { type: 'event', event: { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } } },
      { type: 'event', event: { type: 'tool_result', name: 'file.read', output: { path: 'notes/input.txt', ok: true } } },
      { type: 'event', event: { type: 'result', text: 'done' } },
    ])
    const order: string[] = []
    const toolCallEvents: Array<{
      eventName: string
      runId: string
      isFallbackToolCallId: boolean
    }> = []
    const toolResultEvents: Array<{
      eventName: string
      runId: string
      hasOutput: boolean
    }> = []

    const result = await new AgentRunLoop(provider, {
      runId: 'run_tools',
      queryInput: { prompt: 'tool callbacks', cwd: '/workspace' },
      onEvent: (event) => {
        order.push(`event:${event.type}`)
      },
      onToolCall: ({ event, projectedEvent, runId }) => {
        order.push('toolCall')
        toolCallEvents.push({
          eventName: event.name,
          runId,
          isFallbackToolCallId: /^tool_/.test(projectedEvent.toolCallId),
        })
      },
      onToolResult: ({ event, projectedEvent, runId }) => {
        order.push('toolResult')
        toolResultEvents.push({
          eventName: event.name,
          runId,
          hasOutput: Boolean(projectedEvent.output),
        })
      },
    }).run()

    expect(result).toMatchObject({
      exitReason: 'completed',
      events: [
        {
          type: 'provider.init',
          runId: 'run_tools',
          providerSessionId: 'provider_tools',
        },
        {
          type: 'tool.call',
          runId: 'run_tools',
          toolCallId: expect.stringMatching(/^tool_run_tools_\d+_file\.read$/),
          name: 'file.read',
          input: { path: 'notes/input.txt' },
        },
        {
          type: 'tool.result',
          runId: 'run_tools',
          toolCallId: expect.stringMatching(/^tool_run_tools_\d+_file\.read$/),
          name: 'file.read',
          output: { path: 'notes/input.txt', ok: true },
          classification: 'completed',
        },
        {
          type: 'assistant.result',
          runId: 'run_tools',
          text: 'done',
        },
      ],
      retries: [],
      budget: { maxTotal: 16, used: 1, remaining: 15, exhausted: false },
      errorCount: 0,
      toolCallCount: 1,
      assistantResult: 'done',
      lastMeaningfulEventType: 'assistant.result',
    })
    expect(order).toEqual([
      'event:provider.init',
      'event:tool.call',
      'toolCall',
      'event:tool.result',
      'toolResult',
      'event:assistant.result',
    ])
    expect(toolCallEvents).toEqual([
      {
        eventName: 'file.read',
        runId: 'run_tools',
        isFallbackToolCallId: true,
      },
    ])
    expect(toolResultEvents).toEqual([
      {
        eventName: 'file.read',
        runId: 'run_tools',
        hasOutput: true,
      },
    ])
  })

  it('marks turns as stalled_after_tool when tool activity ends without a final assistant result', async () => {
    const provider = new MockProvider([
      { type: 'event', event: { type: 'init', providerSessionId: 'provider_stalled' } },
      { type: 'event', event: { type: 'tool_call', name: 'file.read', input: { path: 'notes/input.txt' } } },
      { type: 'event', event: { type: 'tool_result', name: 'file.read', output: { ok: true } } },
    ])

    const result = await new AgentRunLoop(provider, {
      runId: 'run_stalled_after_tool',
      queryInput: { prompt: 'stalled tool turn', cwd: '/workspace' },
    }).run()

    expect(result).toMatchObject({
      exitReason: 'stalled_after_tool',
      errorCount: 0,
      toolCallCount: 1,
      assistantResult: null,
      lastMeaningfulEventType: 'tool.result',
      budget: { used: 1, remaining: 15, exhausted: false },
    })
  })
})
