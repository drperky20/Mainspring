import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import type { ConsoleConnectionState } from './OperatorConsoleScreens'
import type { LocalGatewayClient } from './localGatewayClient'

const ACTIVE_REFRESH_MS = 5_000
const HIDDEN_REFRESH_MS = 30_000
const MAX_REFRESH_MS = 30_000

export type GatewaySnapshotAuth = Awaited<ReturnType<LocalGatewayClient['health']>>['auth']

export function gatewaySnapshotRefreshDelay(input: {
  visible: boolean
  consecutiveFailures: number
}): number {
  const failures = Math.max(0, Math.floor(input.consecutiveFailures))
  const retryDelay = Math.min(MAX_REFRESH_MS, ACTIVE_REFRESH_MS * 2 ** Math.min(failures, 8))
  return input.visible
    ? retryDelay
    : Math.max(HIDDEN_REFRESH_MS, retryDelay)
}

export function useGatewaySnapshot(gatewayClient: LocalGatewayClient): {
  snapshot: ConsoleGatewaySnapshot | null
  auth: GatewaySnapshotAuth
  connectionState: ConsoleConnectionState
  connectionError?: string
  lastUpdatedAt?: string
  refresh(): Promise<void>
  retry(): Promise<void>
} {
  const [snapshot, setSnapshot] = useState<ConsoleGatewaySnapshot | null>(null)
  const [auth, setAuth] = useState<GatewaySnapshotAuth>()
  const [connectionState, setConnectionState] = useState<ConsoleConnectionState>('loading')
  const [connectionError, setConnectionError] = useState<string>()
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>()
  const snapshotRef = useRef<ConsoleGatewaySnapshot | null>(null)
  const etagRef = useRef<string | undefined>(undefined)
  const failureCountRef = useRef(0)
  const generationRef = useRef(0)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    inFlightRef.current = null
    etagRef.current = undefined
    failureCountRef.current = 0
    snapshotRef.current = null
    setSnapshot(null)
    setAuth(undefined)
    setConnectionState('loading')
    setConnectionError(undefined)
    setLastUpdatedAt(undefined)
    return () => {
      if (generationRef.current === generation) generationRef.current += 1
      abortControllerRef.current?.abort()
    }
  }, [gatewayClient])

  const requestRefresh = useCallback(async (force: boolean): Promise<void> => {
    const currentRequest = inFlightRef.current
    if (currentRequest) {
      if (!force) return await currentRequest
      await currentRequest.catch(() => undefined)
    }

    const controller = new AbortController()
    const generation = generationRef.current
    abortControllerRef.current = controller
    const request = (async () => {
      const isCurrent = () =>
        generation === generationRef.current && !controller.signal.aborted
      try {
        const health = await gatewayClient.health({ signal: controller.signal })
        if (!isCurrent()) return
        setAuth(health.auth)
        if (health.auth?.authMode === 'hosted' && !health.auth.authenticated) {
          etagRef.current = undefined
          snapshotRef.current = null
          setSnapshot(null)
          setConnectionState('unauthorized')
          setConnectionError('Sign in to read the local operator snapshot.')
          setLastUpdatedAt(undefined)
          return
        }

        const result = await gatewayClient.snapshotIfChanged({
          etag: etagRef.current,
          signal: controller.signal,
        })
        if (!isCurrent()) return
        if (result.kind === 'updated') {
          etagRef.current = result.etag
          snapshotRef.current = result.snapshot
          setSnapshot(result.snapshot)
          setLastUpdatedAt(result.snapshot.generatedAt || new Date().toISOString())
        } else if (result.etag) {
          etagRef.current = result.etag
        }
        failureCountRef.current = 0
        setConnectionState('ready')
        setConnectionError(undefined)
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return
        failureCountRef.current += 1
        setConnectionState((current) => current === 'ready' || current === 'stale' ? 'stale' : 'offline')
        setConnectionError(errorMessage(error))
        throw error
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
  }, [gatewayClient])

  const refresh = useCallback(async () => {
    await requestRefresh(true)
  }, [requestRefresh])

  const retry = useCallback(async () => {
    setConnectionState(snapshotRef.current ? 'stale' : 'loading')
    setConnectionError(undefined)
    await requestRefresh(true)
  }, [requestRefresh])

  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
    }
    const schedule = (delayMs: number) => {
      clearTimer()
      timer = window.setTimeout(() => {
        void tick()
      }, delayMs)
    }
    const tick = async () => {
      if (disposed) return
      try {
        await requestRefresh(false)
      } catch {
        // Connection state and bounded backoff are owned by requestRefresh.
      }
      if (disposed) return
      schedule(gatewaySnapshotRefreshDelay({
        visible: visible(),
        consecutiveFailures: failureCountRef.current,
      }))
    }
    const onVisibilityChange = () => {
      if (disposed) return
      if (visible()) {
        setConnectionState((current) => current === 'ready' ? 'stale' : current)
        schedule(0)
        return
      }
      schedule(gatewaySnapshotRefreshDelay({
        visible: false,
        consecutiveFailures: failureCountRef.current,
      }))
    }

    schedule(0)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    return () => {
      disposed = true
      clearTimer()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [requestRefresh])

  return { snapshot, auth, connectionState, connectionError, lastUpdatedAt, refresh, retry }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
