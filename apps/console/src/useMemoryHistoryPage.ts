import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayMemoryHistoryItem, LocalGatewayClient } from './localGatewayClient'

export type MemoryHistoryPageState = {
  entries: GatewayMemoryHistoryItem[]
  nextCursor?: string
  loading: boolean
  loaded: boolean
  error?: string
}

const initialState: MemoryHistoryPageState = {
  entries: [],
  loading: false,
  loaded: false,
}

export function appendMemoryHistoryPage(
  current: GatewayMemoryHistoryItem[],
  next: GatewayMemoryHistoryItem[],
): GatewayMemoryHistoryItem[] {
  const seen = new Set(current.map((entry) => entry.entryId))
  return [...current, ...next.filter((entry) => !seen.has(entry.entryId))]
}

/**
 * Fetches browser-safe memory previews only while Activity > Memory is open
 * for a selected workspace. The browser provides only the app-state workspace
 * ID; workspace roots and memory metadata remain host-side.
 */
export function useMemoryHistoryPage(input: {
  enabled: boolean
  gatewayClient: LocalGatewayClient
  revision?: string
  workspaceId?: string
  limit?: number
}): MemoryHistoryPageState & {
  reload(): Promise<void>
  loadMore(): Promise<void>
} {
  const [state, setState] = useState<MemoryHistoryPageState>(initialState)
  const generationRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const loadPage = useCallback(async (options: { append: boolean; cursor?: string }) => {
    if (inFlightRef.current) return await inFlightRef.current
    const workspaceId = input.workspaceId
    if (!workspaceId) return

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
        const page = await input.gatewayClient.memoryHistory({
          workspaceId,
          ...(options.cursor ? { cursor: options.cursor } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
          signal: controller.signal,
        })
        if (!isCurrent()) return
        setState((current) => ({
          entries: options.append
            ? appendMemoryHistoryPage(current.entries, page.entries)
            : page.entries,
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
  }, [input.gatewayClient, input.limit, input.workspaceId])

  useEffect(() => {
    generationRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    inFlightRef.current = null
    if (!input.enabled || !input.workspaceId) {
      setState(initialState)
      return
    }
    void loadPage({ append: false })
    return () => {
      generationRef.current += 1
      abortControllerRef.current?.abort()
    }
  }, [input.enabled, input.revision, input.workspaceId, loadPage])

  const reload = useCallback(async () => {
    if (!input.enabled || !input.workspaceId) return
    await loadPage({ append: false })
  }, [input.enabled, input.workspaceId, loadPage])

  const loadMore = useCallback(async () => {
    if (!input.enabled || !input.workspaceId || !state.nextCursor || state.loading) return
    await loadPage({ append: true, cursor: state.nextCursor })
  }, [input.enabled, input.workspaceId, loadPage, state.loading, state.nextCursor])

  return { ...state, reload, loadMore }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
