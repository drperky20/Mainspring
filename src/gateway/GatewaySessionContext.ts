import { AsyncLocalStorage } from 'node:async_hooks'
import { redactRuntimeSensitiveText, sanitizeRuntimeResponse } from '#protocol'

export type GatewaySessionContextValue = string | number | boolean | null | undefined

export interface GatewaySessionContext {
  sessionId: string
  runId?: string
  routeKey?: string
  values?: Record<string, GatewaySessionContextValue>
}

const gatewaySessionContextStore = new AsyncLocalStorage<GatewaySessionContext>()

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? redactRuntimeSensitiveText(cleaned) : undefined
}

function cleanValues(
  values: Record<string, GatewaySessionContextValue> | undefined,
): Record<string, GatewaySessionContextValue> | undefined {
  if (!values) return undefined
  const sanitized = sanitizeRuntimeResponse(values)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, GatewaySessionContextValue>)
    : undefined
}

export function normalizeGatewaySessionContext(
  input: GatewaySessionContext,
): GatewaySessionContext {
  const sessionId = cleanText(input.sessionId)
  if (!sessionId) throw new Error('gateway session context requires sessionId.')
  return {
    sessionId,
    ...(cleanText(input.runId) ? { runId: cleanText(input.runId) } : {}),
    ...(cleanText(input.routeKey) ? { routeKey: cleanText(input.routeKey) } : {}),
    ...(cleanValues(input.values) ? { values: cleanValues(input.values) } : {}),
  }
}

export function withGatewaySessionContext<T>(
  context: GatewaySessionContext,
  fn: () => T,
): T {
  return gatewaySessionContextStore.run(normalizeGatewaySessionContext(context), fn)
}

export function getGatewaySessionContext(): GatewaySessionContext | null {
  return gatewaySessionContextStore.getStore() ?? null
}

export function getGatewaySessionValue(
  key: string,
): GatewaySessionContextValue {
  return getGatewaySessionContext()?.values?.[key]
}

export function clearGatewaySessionContext<T>(fn: () => T): T {
  return gatewaySessionContextStore.run(undefined as unknown as GatewaySessionContext, fn)
}
