import { sanitizeRuntimeResponse } from '#protocol'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from '../tools/ToolRegistry.js'
import type { ContextRehydrateSpan, RecoverableContextStore } from './types.js'

export interface ContextRehydrateAuditEvent {
  recoverableId: string
  reason?: string
  span: ContextRehydrateSpan
  returnedBytes?: number
  truncated?: boolean
  status: 'completed' | 'failed'
  error?: string
}

export interface ContextRehydrateToolOptions {
  maxBytesDefault?: number
  maxBytesLimit?: number
  requireReason?: boolean
  audit?: (event: ContextRehydrateAuditEvent) => void
}

function optionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function createContextRehydrateTool(
  store: RecoverableContextStore,
  options: ContextRehydrateToolOptions = {},
): RuntimeTool {
  const maxBytesDefault = options.maxBytesDefault ?? 64 * 1024
  const maxBytesLimit = options.maxBytesLimit ?? 512 * 1024
  return {
    manifest: builtinManifest({
      key: 'context.rehydrate',
      name: 'Context Rehydrate',
      description:
        'Reads exact canonical context bytes by recoverable id when compressed context is insufficient.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'builtin',
    }),
    execute: ({ input }) => {
      const record = inputRecord(input, 'context.rehydrate input must be an object.')
      const recoverableId = typeof record.recoverableId === 'string' ? record.recoverableId.trim() : ''
      if (!recoverableId) throw new Error('context.rehydrate requires input.recoverableId.')
      const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
      if (options.requireReason && !reason) {
        throw new Error('context.rehydrate requires input.reason when reason governance is enabled.')
      }
      const span = {
        startByte: optionalInt(record.startByte),
        endByte: optionalInt(record.endByte),
        startLine: optionalInt(record.startLine),
        endLine: optionalInt(record.endLine),
        maxBytes: positiveInt(record.maxBytes, maxBytesDefault, maxBytesLimit),
      }
      try {
        const result = store.rehydrate(recoverableId, span)
        options.audit?.({
          recoverableId,
          ...(reason ? { reason } : {}),
          span,
          returnedBytes: result.returnedBytes,
          truncated: result.truncated,
          status: 'completed',
        })
        return sanitizeRuntimeResponse(result)
      } catch (error) {
        options.audit?.({
          recoverableId,
          ...(reason ? { reason } : {}),
          span,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}
