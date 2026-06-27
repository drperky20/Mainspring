import {
  asRecord,
  type MainspringEvent,
  sanitizeRuntimeResponse,
} from '#protocol'
import type { EventVisibility, RunEvent } from '../contracts/runtime.js'
import type { RuntimeEventRow } from '../mailbox/SqliteMailbox.js'

function textPreview(value: string): { preview: string; truncated: boolean; bytes: number } {
  const trimmed = value.trim()
  const preview = trimmed.slice(0, 240)
  return {
    preview,
    truncated: preview.length < trimmed.length,
    bytes: Buffer.byteLength(trimmed),
  }
}

function summarizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return textPreview(value)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return { itemCount: value.length }
  }

  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') {
    return {
      ...('path' in record && typeof record.path === 'string' ? { path: record.path } : {}),
      ...textPreview(record.text),
    }
  }

  if (typeof record.stdout === 'string' || typeof record.stderr === 'string') {
    return sanitizeRuntimeResponse({
      command: typeof record.command === 'string' ? record.command : undefined,
      exitCode: record.exitCode,
      stdout: typeof record.stdout === 'string' ? textPreview(record.stdout) : undefined,
      stderr: typeof record.stderr === 'string' ? textPreview(record.stderr) : undefined,
    })
  }

  return sanitizeRuntimeResponse(record)
}

function sanitizedObject(value: unknown): Record<string, unknown> | undefined {
  const sanitized = asRecord(sanitizeRuntimeResponse(value))
  if (!sanitized) return undefined
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function visibilityForEvent(event: MainspringEvent): EventVisibility {
  switch (event.type) {
    case 'assistant.text.delta':
    case 'assistant.text.done':
    case 'run.status':
    case 'usage':
      return 'public'
    case 'tool.call':
    case 'tool.result':
    case 'approval.requested':
    case 'approval.resolved':
    case 'memory.event':
    case 'skill.event':
    case 'browser.event':
    case 'browser.screenshot':
    case 'file.change':
      return 'sensitive'
    case 'error':
    case 'log':
      return 'public'
    default:
      return 'artifact-only'
  }
}

function createBaseEvent(
  row: RuntimeEventRow,
  type: RunEvent['type'],
  payload: unknown,
  visibility = visibilityForEvent(row.event),
): RunEvent {
  return {
    eventId: `evt_${row.sessionId}_${row.seq}_${type.replace(/[^\w]+/g, '_')}`,
    seq: row.seq,
    runId: row.runId,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    type,
    payload,
    visibility,
    traceId: row.runId,
    spanId: `${row.runId}:${row.seq}`,
  }
}

export function normalizeRuntimeEventRow(row: RuntimeEventRow): RunEvent | null {
  const event = row.event

  switch (event.type) {
    case 'run.status': {
      if (event.status === 'running') return createBaseEvent(row, 'run.started', { phase: event.phase })
      if (event.status === 'completed')
        return createBaseEvent(row, 'run.completed', { phase: event.phase })
      if (event.status === 'failed')
        return createBaseEvent(row, 'run.failed', { phase: event.phase })
      if (event.status === 'cancelled')
        return createBaseEvent(row, 'run.cancelled', { phase: event.phase })
      if (event.status === 'waiting_approval') {
        return createBaseEvent(row, 'runtime.warning', {
          message: 'Run is waiting for approval.',
          phase: event.phase,
        })
      }
      return createBaseEvent(row, 'runtime.warning', {
        message: `Unhandled run status ${event.status}.`,
        phase: event.phase,
      })
    }
    case 'assistant.text.delta':
      return createBaseEvent(row, 'assistant.text.delta', { text: event.text })
    case 'assistant.text.done':
      return createBaseEvent(row, 'assistant.text.done', { text: event.text })
    case 'tool.call':
      return createBaseEvent(row, 'tool.call.requested', {
        toolCallId: event.toolCallId,
        name: event.name,
        input: summarizeUnknown(event.input),
      })
    case 'tool.result': {
      if (event.status === 'denied' || event.status === 'approval_required') {
        return createBaseEvent(row, 'tool.call.blocked', {
          toolCallId: event.toolCallId,
          name: event.name,
          status: event.status,
          output: summarizeUnknown(event.output),
        })
      }
      if (event.status === 'failed') {
        return createBaseEvent(row, 'tool.call.failed', {
          toolCallId: event.toolCallId,
          name: event.name,
          output: summarizeUnknown(event.output),
        })
      }
      return createBaseEvent(row, 'tool.call.completed', {
        toolCallId: event.toolCallId,
        name: event.name,
        output: summarizeUnknown(event.output),
      })
    }
    case 'approval.requested': {
      const approval = event.approval as Record<string, unknown> | null
      return createBaseEvent(row, 'approval.requested', sanitizeRuntimeResponse(approval ?? {}))
    }
    case 'approval.resolved': {
      const approval = event.approval as Record<string, unknown> | null
      const decision =
        approval && typeof approval.decision === 'string' ? approval.decision : undefined
      const type = decision === 'denied' ? 'approval.denied' : 'approval.approved'
      return createBaseEvent(row, type, sanitizeRuntimeResponse(approval ?? {}))
    }
    case 'usage': {
      const usage = event.usage as Record<string, unknown> | null
      const payload = asRecord(sanitizeRuntimeResponse(usage ?? {}))
      return createBaseEvent(row, 'usage.updated', {
        ...payload,
        ...(typeof event.providerSessionId === 'string' && event.providerSessionId.trim()
          ? { providerSessionId: event.providerSessionId.trim() }
          : {}),
      })
    }
    case 'error':
      return createBaseEvent(row, 'runtime.error', {
        message: event.message,
        retryable: event.retryable ?? false,
      })
    case 'log': {
      const payload = sanitizedObject(event.payload)
      return createBaseEvent(row, 'runtime.warning', {
        level: event.level,
        message: event.message,
        ...(payload ? { payload } : {}),
      })
    }
    default:
      return createBaseEvent(row, 'runtime.warning', {
        message: `Unhandled runtime event ${event.type}.`,
        payload: summarizeUnknown(event),
      })
  }
}
