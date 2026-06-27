import { sanitizeRuntimeResponse } from '#protocol'

const forbiddenKeys = new Set([
  'secretRef',
  'workspaceRoot',
  'sessionPath',
  'mailboxPath',
  'sessionsRoot',
  'gatewayToken',
])

export function sanitizeGatewayResponse<T>(value: T): T {
  return stripForbiddenKeys(sanitizeRuntimeResponse(value)) as T
}

function stripForbiddenKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripForbiddenKeys)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key)) continue
    result[key] = stripForbiddenKeys(nested)
  }
  return result
}
