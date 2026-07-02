import { sanitizeRuntimeResponse } from '#protocol'
import { redactBrowserUnsafeGatewayText } from '../browserSafety.js'

const forbiddenKeys = new Set([
  'secretRef',
  'secretValue',
  'workspaceRoot',
  'sessionPath',
  'mailboxPath',
  'sessionsRoot',
  'gatewayToken',
])

const forbiddenAbsolutePathKeys = new Set([
  'artifactPath',
  'caddyConfigPath',
  'databasePath',
  'dbPath',
  'envFilePath',
  'eventsDbPath',
  'filePath',
  'heartbeatPath',
  'inboundDbPath',
  'inboxPath',
  'keyPath',
  'mailboxRoot',
  'outboundDbPath',
  'outboxPath',
  'path',
  'root',
  'remoteRoot',
  'sessionRoot',
  'stateRoot',
  'workspacePath',
])

export function sanitizeGatewayResponse<T>(value: T): T {
  return stripForbiddenKeys(sanitizeRuntimeResponse(value)) as T
}

function stripForbiddenKeys(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeGatewayText(value)
  if (Array.isArray(value)) return value.map(stripForbiddenKeys)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key)) continue
    if (
      forbiddenAbsolutePathKeys.has(key)
      && typeof nested === 'string'
      && looksLikeAbsoluteFilesystemPath(nested)
    ) {
      continue
    }
    result[key] = stripForbiddenKeys(nested)
  }
  return result
}

function looksLikeAbsoluteFilesystemPath(value: string): boolean {
  const trimmed = value.trim()
  return (
    /^[a-zA-Z]:[\\/]/.test(trimmed)
    || trimmed.startsWith('\\\\')
    || trimmed.startsWith('/')
  )
}

function sanitizeGatewayText(value: string): string {
  return redactBrowserUnsafeGatewayText(value)
}
