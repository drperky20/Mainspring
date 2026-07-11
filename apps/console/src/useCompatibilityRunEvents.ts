import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleGatewayRunEvent } from 'mainspring/gateway'
import type { LocalGatewayClient } from './localGatewayClient'

export type CompatibilityRunEventsState = {
  events: ConsoleGatewayRunEvent[]
  loading: boolean
  loaded: boolean
  error?: string
}

const initialState: CompatibilityRunEventsState = {
  events: [],
  loading: false,
  loaded: false,
}

/**
 * Loads the session-bound legacy event route only for the selected
 * compatibility run. Selection changes abort the previous request so a slow
 * mailbox response cannot paint another run's trace into the detail panel.
 */
export function useCompatibilityRunEvents(input: {
  enabled: boolean
  gatewayClient: LocalGatewayClient
  sessionId?: string
  runId?: string
  revision?: string
}): CompatibilityRunEventsState & { reload(): Promise<void> } {
  const [state, setState] = useState<CompatibilityRunEventsState>(initialState)
  const generationRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    if (inFlightRef.current) return await inFlightRef.current
    const sessionId = input.sessionId
    const runId = input.runId
    if (!sessionId || !runId) return

    const controller = new AbortController()
    const generation = generationRef.current
    abortControllerRef.current = controller
    const request = (async () => {
      const isCurrent = () => generation === generationRef.current && !controller.signal.aborted
      setState({ ...initialState, loading: true })
      try {
        const result = await input.gatewayClient.runEvents({
          sessionId,
          runId,
          signal: controller.signal,
        })
        if (!isCurrent()) return
        setState({ events: result.events, loading: false, loaded: true })
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return
        setState({ events: [], loading: false, loaded: false, error: errorMessage(error) })
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
  }, [input.gatewayClient, input.runId, input.sessionId])

  useEffect(() => {
    generationRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    inFlightRef.current = null
    if (!input.enabled || !input.sessionId || !input.runId) {
      setState(initialState)
      return
    }
    void load()
    return () => {
      generationRef.current += 1
      abortControllerRef.current?.abort()
    }
  }, [input.enabled, input.revision, input.runId, input.sessionId, load])

  const reload = useCallback(async () => {
    if (!input.enabled || !input.sessionId || !input.runId) return
    await load()
  }, [input.enabled, input.runId, input.sessionId, load])

  return { ...state, reload }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
