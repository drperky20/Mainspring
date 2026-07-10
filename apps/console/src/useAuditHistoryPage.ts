import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayAuditHistoryItem, LocalGatewayClient } from './localGatewayClient'

export type AuditHistoryPageState = {
  events: GatewayAuditHistoryItem[]
  nextCursor?: string
  loading: boolean
  loaded: boolean
  error?: string
}

const initialState: AuditHistoryPageState = {
  events: [],
  loading: false,
  loaded: false,
}

export function appendAuditHistoryPage(
  current: GatewayAuditHistoryItem[],
  next: GatewayAuditHistoryItem[],
): GatewayAuditHistoryItem[] {
  const seen = new Set(current.map((event) => event.eventId))
  return [...current, ...next.filter((event) => !seen.has(event.eventId))]
}

/**
 * Requests browser-safe audit rows only while Activity > Audit is visible.
 * Durable audit metadata remains host-side and is not used as browser state.
 */
export function useAuditHistoryPage(input: {
  enabled: boolean
  gatewayClient: LocalGatewayClient
  revision?: string
  limit?: number
}): AuditHistoryPageState & {
  reload(): Promise<void>
  loadMore(): Promise<void>
} {
  const [state, setState] = useState<AuditHistoryPageState>(initialState)
  const generationRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const loadPage = useCallback(async (options: { append: boolean; cursor?: string }) => {
    if (inFlightRef.current) return await inFlightRef.current

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
        const page = await input.gatewayClient.auditHistory({
          ...(options.cursor ? { cursor: options.cursor } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
          signal: controller.signal,
        })
        if (!isCurrent()) return
        setState((current) => ({
          events: options.append
            ? appendAuditHistoryPage(current.events, page.events)
            : page.events,
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
  }, [input.gatewayClient, input.limit])

  useEffect(() => {
    generationRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    inFlightRef.current = null
    if (!input.enabled) {
      setState(initialState)
      return
    }
    void loadPage({ append: false })
    return () => {
      generationRef.current += 1
      abortControllerRef.current?.abort()
    }
  }, [input.enabled, input.revision, loadPage])

  const reload = useCallback(async () => {
    if (!input.enabled) return
    await loadPage({ append: false })
  }, [input.enabled, loadPage])

  const loadMore = useCallback(async () => {
    if (!input.enabled || !state.nextCursor || state.loading) return
    await loadPage({ append: true, cursor: state.nextCursor })
  }, [input.enabled, loadPage, state.loading, state.nextCursor])

  return { ...state, reload, loadMore }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
