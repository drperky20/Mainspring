import { sanitizeRuntimeResponse } from '#protocol'

export type ToolResultClassificationKind = 'inline' | 'artifact_like' | 'error_like' | 'large'

export interface ToolResultClassification {
  kind: ToolResultClassificationKind
  bytes: number
  summary: unknown
  artifactLike: boolean
  errorLike: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textSummary(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

export function summarizeToolResult(value: unknown, maxLength = 240): unknown {
  const sanitized = sanitizeRuntimeResponse(value)
  if (typeof sanitized === 'string') return textSummary(sanitized, maxLength)
  if (Array.isArray(sanitized)) return sanitized.slice(0, 5).map((entry) => summarizeToolResult(entry, maxLength))
  if (!isRecord(sanitized)) return sanitized

  const entries = Object.entries(sanitized).slice(0, 8)
  return Object.fromEntries(entries.map(([key, entry]) => [key, summarizeToolResult(entry, maxLength)]))
}

export function classifyToolResult(
  _toolName: string,
  output: unknown,
  inlineThresholdBytes = 8 * 1024,
): ToolResultClassification {
  const sanitized = sanitizeRuntimeResponse(output)
  const serialized = JSON.stringify(sanitized ?? null)
  const bytes = Buffer.byteLength(serialized)
  const record = isRecord(sanitized) ? sanitized : null
  const artifactLike = Boolean(
    record &&
      (typeof record.artifactId === 'string' ||
        typeof record.artifact === 'string' ||
        typeof record.url === 'string'),
  )
  const errorLike = Boolean(
    record &&
      (typeof record.error === 'string' ||
        record.denied === true ||
        typeof record.approvalId === 'string'),
  )
  const kind: ToolResultClassificationKind = artifactLike
    ? 'artifact_like'
    : errorLike
      ? 'error_like'
      : bytes > inlineThresholdBytes
        ? 'large'
        : 'inline'

  return {
    kind,
    bytes,
    summary: summarizeToolResult(sanitized),
    artifactLike,
    errorLike,
  }
}
