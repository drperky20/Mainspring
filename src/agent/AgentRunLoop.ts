import { createMainspringRuntimeId } from '#protocol'
import type { QueryInput } from '../providers/types.js'
import type { AgentProvider, AgentQuery, ProviderEvent } from '../providers/types.js'
import {
  finalizeTurn,
  IterationBudget,
  projectProviderEvent,
  TurnRetryState,
  type ProjectedTurnEvent,
  type TurnExitReason,
} from './TurnLifecycle.js'

export interface AgentRunLoopOptions {
  runId?: string
  queryInput: QueryInput
  maxIterations?: number
  maxRetryAttempts?: number
  retryableClassifications?: string[]
  signal?: AbortSignal
  onQuery?: (query: AgentQuery) => void
  onEvent?: (event: ProjectedTurnEvent) => void
  onToolCall?: (input: {
    event: Extract<ProviderEvent, { type: 'tool_call' }>
    projectedEvent: Extract<ProjectedTurnEvent, { type: 'tool.call' }>
    query: AgentQuery
    runId: string
  }) => Promise<void> | void
  onToolResult?: (input: {
    event: Extract<ProviderEvent, { type: 'tool_result' }>
    projectedEvent: Extract<ProjectedTurnEvent, { type: 'tool.result' }>
    query: AgentQuery
    runId: string
  }) => Promise<void> | void
}

export interface AgentRunLoopSummary {
  exitReason: TurnExitReason
  events: ProjectedTurnEvent[]
  retries: ReturnType<TurnRetryState['snapshot']>
  budget: {
    maxTotal: number
    used: number
    remaining: number
    exhausted: boolean
  }
  errorCount: number
  toolCallCount: number
  assistantResult: string | null
  lastMeaningfulEventType: ReturnType<typeof finalizeTurn>['lastMeaningfulEventType']
}

export class AgentRunLoop {
  constructor(
    private readonly provider: AgentProvider,
    private readonly options: AgentRunLoopOptions,
  ) {}

  async run(): Promise<AgentRunLoopSummary> {
    const runId = this.options.runId ?? this.options.queryInput.sessionId ?? createMainspringRuntimeId('run')
    const budget = new IterationBudget(this.options.maxIterations ?? 16)
    const retryState = new TurnRetryState()
    const events: ProjectedTurnEvent[] = []
    let cancelled = false
    let budgetExhausted = false
    let currentQuery: AgentQuery | null = null
    const maxRetryAttempts = this.options.maxRetryAttempts ?? 2
    const retryableClassifications = this.options.retryableClassifications ?? []
    let projectedEventIndex = 0

    const signal = this.options.signal
    const onAbort = (): void => {
      cancelled = true
      currentQuery?.abort()
    }

    if (signal?.aborted) {
      return this.finalize({ events, budget, retryState, cancelled: true, budgetExhausted })
    }

    signal?.addEventListener('abort', onAbort)

    try {
      while (true) {
        if (budgetExhausted) break
        if (cancelled || signal?.aborted) break

        const query = this.provider.query(this.options.queryInput)
        currentQuery = query
        this.options.onQuery?.(query)
        let shouldRetry = false

        try {
          for await (const event of query.events) {
            if (signal?.aborted) {
              cancelled = true
              break
            }

            if (event.type === 'tool_call') {
              if (!budget.consume()) {
                budgetExhausted = true
                query.abort()
                break
              }
            }

            const projected = projectProviderEvent({
              runId,
              event,
              index: projectedEventIndex++,
            })
            events.push(projected)
            this.options.onEvent?.(projected)

            if (projected.type === 'tool.call' && this.options.onToolCall && event.type === 'tool_call') {
              await this.options.onToolCall({
                event,
                projectedEvent: projected,
                query,
                runId,
              })
            }

            if (
              projected.type === 'tool.result' &&
              this.options.onToolResult &&
              event.type === 'tool_result'
            ) {
              await this.options.onToolResult({
                event,
                projectedEvent: projected,
                query,
                runId,
              })
            }

            if (projected.type === 'runtime.error') {
              retryState.recordFailure({
                message: projected.message,
                classification: projected.classification,
                retryable: projected.retryable,
              })
              shouldRetry = retryState.shouldRetry({
                maxAttempts: maxRetryAttempts,
                retryableClassifications,
              })
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const projected: ProjectedTurnEvent = {
            type: 'runtime.error',
            runId,
            message,
            retryable: false,
          }
          events.push(projected)
          this.options.onEvent?.(projected)

          retryState.recordFailure({
            message,
            retryable: false,
          })
          shouldRetry = retryState.shouldRetry({
            maxAttempts: maxRetryAttempts,
            retryableClassifications,
          })
        }

        if (cancelled || budgetExhausted) break
        if (!shouldRetry) break
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) {
        cancelled = true
        currentQuery?.abort()
      }
    }

    return this.finalize({
      events,
      budget,
      retryState,
      cancelled,
      budgetExhausted,
    })
  }

  private finalize(input: {
    events: ProjectedTurnEvent[]
    budget: IterationBudget
    retryState: TurnRetryState
    cancelled: boolean
    budgetExhausted: boolean
  }): AgentRunLoopSummary {
    const finalized = finalizeTurn({
      events: input.events,
      cancelled: input.cancelled,
      budgetExhausted: input.budgetExhausted,
    })
    return {
      events: input.events,
      ...finalized,
      retries: input.retryState.snapshot(),
      budget: input.budget.snapshot(),
    }
  }
}
