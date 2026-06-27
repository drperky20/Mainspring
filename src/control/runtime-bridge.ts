import {
  asRecord,
  coerceApprovalDecision,
  redactRuntimeSecrets,
  redactRuntimeSensitiveText,
  type MainspringEvent,
} from '#protocol'
import type { ToolCategory } from './events.js'
import type { TurnEventType, TurnStatus } from './index.js'

// Runtime to Turn event bridge. The channel client translates MainspringEvents
// into TurnEvent payloads before they move up the control channel.

export type BridgedRuntimeEvent = {
  type: TurnEventType
  payload: Record<string, unknown>
}

export function toolCategoryForName(name: string): ToolCategory {
  const lower = name.trim().toLowerCase()
  if (/ui\.flow|gui\.flow|agentic.*flow|workflow|flow/.test(lower)) return 'flow'
  if (/browser|page|tab|screenshot|viewport/.test(lower)) return 'browser'
  if (/file|workspace|fs|write|read/.test(lower)) return 'file'
  if (/shell|exec|terminal|command|bash/.test(lower)) return 'exec'
  if (/memory|note|remember/.test(lower)) return 'memory'
  if (/http|fetch|search|web/.test(lower)) return 'http'
  return 'skill'
}

function redactedText(value: string): string {
  return redactRuntimeSensitiveText(value, { marker: '[REDACTED]' })
}

function runtimeTurnStatus(status: string): TurnStatus | null {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'completed') return 'completed'
  if (normalized === 'failed') return 'failed'
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'aborted') {
    return 'cancelled'
  }
  if (normalized === 'running' || normalized === 'started') return 'running'
  if (normalized === 'waiting_approval' || normalized === 'awaiting_approval') {
    return 'awaiting_approval'
  }
  return null
}

function approvalRecordId(record: Record<string, unknown> | null): string | null {
  if (!record) return null
  for (const key of ['approvalId', 'id', 'requestId']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function approvalRecordTitle(record: Record<string, unknown> | null): string {
  if (record) {
    for (const key of ['message', 'title', 'action', 'targetKey', 'toolName']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return redactedText(value.trim())
    }
  }
  return 'Mainspring needs your approval to continue.'
}

function approvalRecordKind(record: Record<string, unknown> | null): 'tool' | 'secret' | 'policy' {
  const kind = typeof record?.kind === 'string' ? record.kind.trim().toLowerCase() : ''
  if (kind === 'secret') return 'secret'
  if (kind === 'policy') return 'policy'
  return 'tool'
}

function sanitizedRecord(value: unknown): Record<string, unknown> {
  return asRecord(redactRuntimeSecrets(value)) ?? {}
}

function sanitizedOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  const record = sanitizedRecord(value)
  return Object.keys(record).length > 0 ? record : undefined
}

export function bridgeRuntimeEventToTurnEvents(event: MainspringEvent): BridgedRuntimeEvent[] {
  switch (event.type) {
    case 'run.status': {
      const status = runtimeTurnStatus(event.status)
      return status ? [{ type: 'turn.status', payload: { status } }] : []
    }
    case 'assistant.text.delta':
      return [{ type: 'text.delta', payload: { text: redactedText(event.text) } }]
    case 'assistant.text.done':
      return [{ type: 'text.done', payload: { text: redactedText(event.text) } }]
    case 'tool.call':
      return [
        {
          type: 'tool.call',
          payload: {
            toolCallId: event.toolCallId,
            name: event.name,
            category: toolCategoryForName(event.name),
            input: redactRuntimeSecrets(event.input ?? {}),
          },
        },
      ]
    case 'tool.update':
      return [
        {
          type: 'tool.update',
          payload: {
            toolCallId: event.toolCallId,
            message: redactedText(event.message),
            payload: redactRuntimeSecrets(event.payload ?? null),
          },
        },
      ]
    case 'tool.result': {
      const normalized = event.status.trim().toLowerCase()
      const status =
        normalized === 'denied'
          ? 'denied'
          : normalized === 'error' || normalized === 'failed'
            ? 'error'
            : 'completed'
      return [
        {
          type: 'tool.result',
          payload: {
            toolCallId: event.toolCallId,
            name: event.name,
            status,
            output: redactRuntimeSecrets(event.output ?? null),
          },
        },
      ]
    }
    case 'browser.event':
      return [{ type: 'browser.preview', payload: { action: event.event } }]
    case 'browser.screenshot':
      return [
        {
          type: 'browser.preview',
          payload: {
            ...(event.artifactId ? { artifactId: event.artifactId } : {}),
            ...(event.url ? { url: event.url } : {}),
          },
        },
      ]
    case 'file.change': {
      const normalized = event.action.trim().toLowerCase()
      const action =
        normalized === 'created' || normalized === 'updated' || normalized === 'deleted'
          ? normalized
          : 'unknown'
      return [{ type: 'file.preview', payload: { path: event.path, action } }]
    }
    case 'approval.requested': {
      const record = sanitizedRecord(event.approval)
      const approvalId = approvalRecordId(record)
      if (!approvalId) return []
      return [
        {
          type: 'approval.requested',
          payload: {
            approvalId,
            kind: approvalRecordKind(record),
            title: approvalRecordTitle(record),
            ...(typeof record.reason === 'string' && record.reason.trim()
              ? { reason: redactedText(record.reason.trim()) }
              : {}),
            ...(typeof record.toolCallId === 'string' && record.toolCallId.trim()
              ? { toolCallId: record.toolCallId.trim() }
              : {}),
            request: record,
          },
        },
      ]
    }
    case 'approval.resolved': {
      const record = sanitizedRecord(event.approval)
      const approvalId = approvalRecordId(record)
      if (!approvalId) return []
      const decision =
        record.decision === 'expired'
          ? 'expired'
          : (coerceApprovalDecision(record.decision) ?? 'approved')
      return [{ type: 'approval.resolved', payload: { approvalId, decision } }]
    }
    case 'artifact.created':
      return [
        { type: 'artifact.created', payload: { artifactId: event.artifactId, kind: event.kind } },
      ]
    case 'memory.event':
      return [{ type: 'log', payload: { level: 'info', message: `Memory ${event.action}` } }]
    case 'skill.event':
      return [
        {
          type: 'log',
          payload: { level: 'info', message: `Skill ${event.skillKey} ${event.action}` },
        },
      ]
    case 'log': {
      const normalized = event.level.trim().toLowerCase()
      const level =
        normalized === 'debug' || normalized === 'warn' || normalized === 'error'
          ? normalized
          : 'info'
      const payload = sanitizedOptionalRecord(event.payload)
      return [
        {
          type: 'log',
          payload: {
            level,
            message: redactedText(event.message),
            ...(payload ? { payload } : {}),
          },
        },
      ]
    }
    case 'usage': {
      const usage = sanitizedRecord(event.usage)
      return [
        {
          type: 'usage',
          payload: {
            ...(typeof usage.provider === 'string' ? { provider: usage.provider } : {}),
            ...(typeof usage.modelId === 'string' ? { modelId: usage.modelId } : {}),
            ...(typeof usage.modelFamily === 'string' ? { modelFamily: usage.modelFamily } : {}),
            ...(typeof usage.providerTransport === 'string'
              ? { providerTransport: usage.providerTransport }
              : {}),
            ...(typeof usage.inputTokens === 'number' ? { inputTokens: usage.inputTokens } : {}),
            ...(typeof usage.outputTokens === 'number' ? { outputTokens: usage.outputTokens } : {}),
            ...(typeof usage.totalTokens === 'number' ? { totalTokens: usage.totalTokens } : {}),
            ...(typeof usage.cacheReadTokens === 'number'
              ? { cacheReadTokens: usage.cacheReadTokens }
              : {}),
            ...(typeof usage.cacheWriteTokens === 'number'
              ? { cacheWriteTokens: usage.cacheWriteTokens }
              : {}),
            ...(typeof usage.reasoningTokens === 'number'
              ? { reasoningTokens: usage.reasoningTokens }
              : {}),
            ...(usage.rateLimit && typeof usage.rateLimit === 'object'
              ? { rateLimit: usage.rateLimit }
              : {}),
            ...(typeof event.providerSessionId === 'string' && event.providerSessionId.trim()
              ? { providerSessionId: event.providerSessionId.trim() }
              : {}),
          },
        },
      ]
    }
    case 'error':
      return [
        {
          type: 'error',
          payload: {
            message: redactedText(event.message),
            ...(typeof event.retryable === 'boolean' ? { retryable: event.retryable } : {}),
          },
        },
      ]
    default:
      return []
  }
}
