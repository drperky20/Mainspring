import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleGatewayRunEvent } from 'mainspring/gateway'
import type { LocalGatewayClient } from './localGatewayClient'

export type RunLogTracePageState = {
  events: ConsoleGatewayRunEvent[]
  nextCursor?: string
  loading: boolean
  loaded: boolean
  error?: string
}

const initialState: RunLogTracePageState = {
  events: [],
  loading: false,
  loaded: false,
}

function traceEventKey(event: ConsoleGatewayRunEvent, index: number): string {
  return `${event.runId}:${event.seq ?? index}:${event.type}`
}

/**
 * Adds an older, chronologically ordered trace page before the currently
 * visible recent page while preserving stable event identities.
 */
export function prependRunLogTracePage(
  current: ConsoleGatewayRunEvent[],
  older: ConsoleGatewayRunEvent[],
): ConsoleGatewayRunEvent[] {
  const seen = new Set(current.map(traceEventKey))
  return [...older.filter((event, index) => {
    const key = traceEventKey(event, index)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }), ...current]
}

/**
 * Loads only the selected RunLog trace. Pages are reverse-cursor fetched by
 * the gateway, then assembled chronologically so operators can expand into
 * earlier events without transferring a full run projection.
 */
export function useRunLogTracePage(input: {
  enabled: boolean
  gatewayClient: LocalGatewayClient
  runId?: string
  revision?: string
  limit?: number
}): RunLogTracePageState & {
  reload(): Promise<void>
  loadMore(): Promise<void>
} {
  const [state, setState] = useState<RunLogTracePageState>(initialState)
  const generationRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const loadPage = useCallback(async (options: { append: boolean; cursor?: string }) => {
    if (inFlightRef.current) return await inFlightRef.current
    const runId = input.runId
    if (!runId) return

    const controller = new AbortController()
    const generation = generationRef.current
    abortControllerRef.current = controller
    const request = (async () => {
      const isCurrent = () => generation === generationRef.current && !controller.signal.aborted
      setState((current) => ({
        ...(options.append ? current : initialState),
        loading: true,
        error: undefined,
      }))
      try {
        const page = await input.gatewayClient.runLogTrace({
          runId,
          ...(options.cursor ? { cursor: options.cursor } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
          signal: controller.signal,
        })
        if (!isCurrent()) return
        setState((current) => ({
          events: options.append ? prependRunLogTracePage(current.events, page.events) : page.events,
          nextCursor: page.nextCursor,
          loading: false,
          loaded: true,
        }))
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return
        setState((current) => ({
          ...current,
          loading: false,
          error: errorMessage(error),
        }))
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null
      }
    })()
    inFlightRef.current = request
    try {
      await request
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null
    }
  }, [input.gatewayClient, input.limit, input.runId])

  useEffect(() => {
    generationRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    inFlightRef.current = null
    if (!input.enabled || !input.runId) {
      setState(initialState)
      return
    }
    void loadPage({ append: false })
    return () => {
      generationRef.current += 1
      abortControllerRef.current?.abort()
    }
  }, [input.enabled, input.revision, input.runId, loadPage])

  const reload = useCallback(async () => {
    if (!input.enabled || !input.runId) return
    await loadPage({ append: false })
  }, [input.enabled, input.runId, loadPage])

  const loadMore = useCallback(async () => {
    if (!input.enabled || !input.runId || !state.nextCursor || state.loading) return
    await loadPage({ append: true, cursor: state.nextCursor })
  }, [input.enabled, input.runId, loadPage, state.loading, state.nextCursor])

  return { ...state, reload, loadMore }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
