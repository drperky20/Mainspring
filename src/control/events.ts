import { ProviderRateLimitStateSchema } from '#protocol'
import { z } from 'zod'
import {
  providerInitDetailFromLogPayload,
  type ProviderInitWarningDetail,
} from '../contracts/runtime.js'
import { TurnStatusSchema } from './turn.js'

// ============================================================
// Turn event taxonomy (D3) — the single source of truth.
// Every event row: { turnId, seq, type, schemaVersion, payload }.
// Turn status, approvals, transcript, timeline are ALL projected
// from this stream in exactly one place (turn-lifecycle).
// ============================================================

export const TURN_EVENT_SCHEMA_VERSION = 1

export const TurnEventTypeSchema = z.enum([
  'turn.status',
  'text.delta',
  'text.done',
  'reasoning.delta',
  'reasoning.done',
  'tool.call',
  'tool.update',
  'tool.result',
  'approval.requested',
  'approval.resolved',
  'progress',
  'source.reference',
  'browser.preview',
  'file.preview',
  'artifact.created',
  'result.summary',
  'agent.status',
  'provider.retry',
  'provider.fallback',
  'usage',
  'log',
  'error',
])
export type TurnEventType = z.infer<typeof TurnEventTypeSchema>

export const ToolCategorySchema = z.enum([
  'browser',
  'exec',
  'file',
  'memory',
  'http',
  'skill',
  'flow',
])
export type ToolCategory = z.infer<typeof ToolCategorySchema>

export const ToolResultStatusSchema = z.enum(['completed', 'error', 'denied'])
export type ToolResultStatus = z.infer<typeof ToolResultStatusSchema>

export const ApprovalKindSchema = z.enum(['tool', 'secret', 'policy'])
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>

export const ApprovalDecisionSchema = z.enum(['approved', 'denied', 'expired'])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

// --- payloads -------------------------------------------------

export const TurnStatusEventPayloadSchema = z.object({
  status: TurnStatusSchema,
  reason: z.string().optional(),
})

export const TextEventPayloadSchema = z.object({ text: z.string() })

export const ToolCallEventPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  category: ToolCategorySchema,
  input: z.unknown().optional(),
})

export const ToolUpdateEventPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  message: z.string(),
  payload: z.unknown().optional(),
})

export const ToolResultEventPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  status: ToolResultStatusSchema,
  output: z.unknown().optional(),
})

export const ApprovalRequestedEventPayloadSchema = z.object({
  approvalId: z.string().min(1),
  kind: ApprovalKindSchema,
  title: z.string().min(1),
  reason: z.string().optional(),
  toolCallId: z.string().optional(),
  expiresAt: z.string().optional(),
  request: z.record(z.string(), z.unknown()).default({}),
})

export const ApprovalResolvedEventPayloadSchema = z.object({
  approvalId: z.string().min(1),
  decision: ApprovalDecisionSchema,
  resolvedBy: z.string().optional(),
})

export const ProgressEventPayloadSchema = z.object({
  label: z.string().min(1),
  step: z.number().int().positive().optional(),
  totalSteps: z.number().int().positive().optional(),
})

export const SourceReferenceEventPayloadSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum(['url', 'file', 'message', 'artifact', 'memory', 'other']),
  title: z.string().min(1),
  uri: z.string().optional(),
  excerpt: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const BrowserPreviewEventPayloadSchema = z.object({
  artifactId: z.string().optional(),
  url: z.string().optional(),
  action: z.string().optional(),
  title: z.string().optional(),
  screenshotArtifactId: z.string().optional(),
  status: z.enum(['loading', 'ready', 'error']).optional(),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
})

export const FilePreviewEventPayloadSchema = z.object({
  path: z.string().min(1),
  action: z.enum(['created', 'updated', 'deleted', 'unknown']),
  artifactId: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  diff: z
    .object({
      added: z.number().int().nonnegative().optional(),
      removed: z.number().int().nonnegative().optional(),
      summary: z.string().optional(),
    })
    .optional(),
})

export const ArtifactCreatedEventPayloadSchema = z.object({
  artifactId: z.string().min(1),
  kind: z.string().min(1),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  sessionId: z.string().optional(),
  turnId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const ResultSummaryEventPayloadSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(['completed', 'partial', 'failed']).default('completed'),
  artifactIds: z.array(z.string().min(1)).default([]),
  sourceIds: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
})

export const AgentStatusEventPayloadSchema = z.object({
  label: z.string().min(1),
})

export const ProviderRetryEventPayloadSchema = z.object({
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  reason: z.string().optional(),
})

export const ProviderFallbackEventPayloadSchema = z.object({
  fromProfile: z.string().min(1),
  toProfile: z.string().min(1),
  reason: z.string().optional(),
})

export const UsageEventPayloadSchema = z.object({
  provider: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  modelFamily: z.string().min(1).optional(),
  providerTransport: z.string().min(1).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  rateLimit: ProviderRateLimitStateSchema.optional(),
  providerSessionId: z.string().min(1).optional(),
})

export type UsageEventPayload = z.infer<typeof UsageEventPayloadSchema>

export const LogEventPayloadSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const ErrorEventPayloadSchema = z.object({
  message: z.string(),
  retryable: z.boolean().optional(),
})

// --- envelope -------------------------------------------------

const eventVariant = <T extends TurnEventType, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    v: z.literal(TURN_EVENT_SCHEMA_VERSION),
    turnId: z.string().min(1),
    seq: z.number().int().positive(),
    type: z.literal(type),
    at: z.string(),
    payload,
  })

export const TurnEventSchema = z.discriminatedUnion('type', [
  eventVariant('turn.status', TurnStatusEventPayloadSchema),
  eventVariant('text.delta', TextEventPayloadSchema),
  eventVariant('text.done', TextEventPayloadSchema),
  eventVariant('reasoning.delta', TextEventPayloadSchema),
  eventVariant('reasoning.done', TextEventPayloadSchema),
  eventVariant('tool.call', ToolCallEventPayloadSchema),
  eventVariant('tool.update', ToolUpdateEventPayloadSchema),
  eventVariant('tool.result', ToolResultEventPayloadSchema),
  eventVariant('approval.requested', ApprovalRequestedEventPayloadSchema),
  eventVariant('approval.resolved', ApprovalResolvedEventPayloadSchema),
  eventVariant('progress', ProgressEventPayloadSchema),
  eventVariant('source.reference', SourceReferenceEventPayloadSchema),
  eventVariant('browser.preview', BrowserPreviewEventPayloadSchema),
  eventVariant('file.preview', FilePreviewEventPayloadSchema),
  eventVariant('artifact.created', ArtifactCreatedEventPayloadSchema),
  eventVariant('result.summary', ResultSummaryEventPayloadSchema),
  eventVariant('agent.status', AgentStatusEventPayloadSchema),
  eventVariant('provider.retry', ProviderRetryEventPayloadSchema),
  eventVariant('provider.fallback', ProviderFallbackEventPayloadSchema),
  eventVariant('usage', UsageEventPayloadSchema),
  eventVariant('log', LogEventPayloadSchema),
  eventVariant('error', ErrorEventPayloadSchema),
])
export type TurnEvent = z.infer<typeof TurnEventSchema>

export type TurnEventOfType<T extends TurnEventType> = Extract<TurnEvent, { type: T }>

export function parseTurnEvent(value: unknown): TurnEvent {
  return TurnEventSchema.parse(value)
}

export function safeParseTurnEvent(value: unknown): TurnEvent | null {
  const parsed = TurnEventSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function providerInitLogDetailFromTurnEvent(
  event: TurnEvent,
): ProviderInitWarningDetail | null {
  if (event.type !== 'log') return null
  return providerInitDetailFromLogPayload(event.payload.message, event.payload.payload)
}

// Status projection reducer: the ONE rule for turn status from events.
export function turnStatusFromEvent(event: TurnEvent): z.infer<typeof TurnStatusSchema> | null {
  switch (event.type) {
    case 'turn.status':
      return event.payload.status
    case 'approval.requested':
      return 'awaiting_approval'
    case 'approval.resolved':
      return event.payload.decision === 'approved' ? 'running' : null
    case 'error':
      return event.payload.retryable ? null : 'failed'
    default:
      return null
  }
}
