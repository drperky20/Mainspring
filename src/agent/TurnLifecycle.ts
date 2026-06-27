import { redactRuntimeSensitiveText, sanitizeRuntimeResponse } from '#protocol'
import type { ProviderEvent } from '../providers/types.js'

export type TurnExitReason =
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval'
  | 'budget_exhausted'
  | 'stalled_after_tool'

export interface TurnContextInput {
  sessionId: string
  runId: string
  cwd: string
  userText: string
  systemPrompt?: string
  providerId?: string
  modelId?: string
  messages?: Array<{ role: string; content: string }>
  attachments?: Array<{ id: string; name: string; size?: number }>
  createdAt?: string
}

export interface TurnContext {
  sessionId: string
  runId: string
  cwd: string
  userText: string
  sanitizedUserText: string
  systemPrompt?: string
  providerId?: string
  modelId?: string
  messages: Array<{ role: string; content: string }>
  attachments: Array<{ id: string; name: string; size?: number }>
  flags: {
    hasSystemPrompt: boolean
    hasAttachments: boolean
    hasPriorMessages: boolean
  }
  metrics: {
    userTextChars: number
    sanitizedUserTextChars: number
    messageCount: number
    attachmentCount: number
  }
  createdAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function cleanText(value: string): string {
  return redactRuntimeSensitiveText(value).replace(/\r\n/g, '\n')
}

export function buildTurnContext(input: TurnContextInput): TurnContext {
  const messages = [...(input.messages ?? [])].map((message) => ({
    role: message.role,
    content: cleanText(message.content),
  }))
  const attachments = [...(input.attachments ?? [])]
  const sanitizedUserText = cleanText(input.userText)
  return {
    sessionId: input.sessionId,
    runId: input.runId,
    cwd: input.cwd,
    userText: input.userText,
    sanitizedUserText,
    ...(input.systemPrompt ? { systemPrompt: cleanText(input.systemPrompt) } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    messages,
    attachments,
    flags: {
      hasSystemPrompt: Boolean(input.systemPrompt?.trim()),
      hasAttachments: attachments.length > 0,
      hasPriorMessages: messages.length > 0,
    },
    metrics: {
      userTextChars: input.userText.length,
      sanitizedUserTextChars: sanitizedUserText.length,
      messageCount: messages.length,
      attachmentCount: attachments.length,
    },
    createdAt: input.createdAt ?? nowIso(),
  }
}

export class IterationBudget {
  private consumed = 0

  constructor(readonly maxTotal: number) {
    if (!Number.isInteger(maxTotal) || maxTotal < 0) {
      throw new Error('IterationBudget maxTotal must be a non-negative integer.')
    }
  }

  consume(count = 1): boolean {
    this.assertPositiveCount(count)
    if (this.consumed + count > this.maxTotal) return false
    this.consumed += count
    return true
  }

  refund(count = 1): void {
    this.assertPositiveCount(count)
    this.consumed = Math.max(0, this.consumed - count)
  }

  used(): number {
    return this.consumed
  }

  remaining(): number {
    return Math.max(0, this.maxTotal - this.consumed)
  }

  exhausted(): boolean {
    return this.remaining() === 0
  }

  snapshot(): { maxTotal: number; used: number; remaining: number; exhausted: boolean } {
    return {
      maxTotal: this.maxTotal,
      used: this.used(),
      remaining: this.remaining(),
      exhausted: this.exhausted(),
    }
  }

  private assertPositiveCount(count: number): void {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('IterationBudget count must be a positive integer.')
    }
  }
}

export interface TurnFailureInput {
  message: string
  classification?: string
  retryable?: boolean
}

export class TurnRetryState {
  private failures: Array<TurnFailureInput & { attempt: number }> = []

  recordFailure(input: TurnFailureInput): void {
    this.failures.push({
      attempt: this.failures.length + 1,
      message: redactRuntimeSensitiveText(input.message),
      classification: input.classification,
      retryable: input.retryable,
    })
  }

  attempts(): number {
    return this.failures.length
  }

  lastFailure(): (TurnFailureInput & { attempt: number }) | null {
    return this.failures.at(-1) ?? null
  }

  shouldRetry(options: { maxAttempts: number; retryableClassifications?: string[] }): boolean {
    const last = this.lastFailure()
    if (!last || this.attempts() >= options.maxAttempts) return false
    if (last.retryable === true) return true
    if (!last.classification) return false
    return new Set(options.retryableClassifications ?? []).has(last.classification)
  }

  snapshot(): Array<TurnFailureInput & { attempt: number }> {
    return [...this.failures]
  }
}

export type ToolResultClassification =
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'file_mutation_landed'
  | 'artifact_created'
  | 'unknown'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function classifyToolResult(toolName: string, result: unknown): ToolResultClassification {
  const record = asRecord(result)
  if (!record) return 'unknown'
  const status = stringField(record, 'status')?.toLowerCase()
  if (status === 'blocked' || status === 'denied') return 'blocked'
  if (status === 'failed' || status === 'error') return 'failed'
  if (stringField(record, 'artifactId') || stringField(record, 'artifact')) return 'artifact_created'
  if (
    (toolName === 'file.write' || toolName === 'apply_patch' || toolName.endsWith('.write')) &&
    (status === 'completed' || status === 'ok' || record.written === true || record.changed === true)
  ) {
    return 'file_mutation_landed'
  }
  if (status === 'completed' || status === 'ok' || record.ok === true) return 'completed'
  return 'unknown'
}

export type ProjectedTurnEvent =
  | {
      type: 'provider.init'
      runId: string
      providerSessionId: string
      provider?: string
      modelId?: string
      modelFamily?: string
      providerTransport?: string
    }
  | { type: 'assistant.delta'; runId: string; text: string }
  | { type: 'assistant.result'; runId: string; text: string | null }
  | { type: 'tool.call'; runId: string; toolCallId: string; name: string; input?: unknown }
  | {
      type: 'tool.result'
      runId: string
      toolCallId: string
      name: string
      output?: unknown
      classification: ToolResultClassification
    }
  | { type: 'runtime.error'; runId: string; message: string; retryable: boolean; classification?: string }
  | { type: 'runtime.progress'; runId: string; message: string }
  | { type: 'usage.updated'; runId: string; usage: unknown; providerSessionId?: string }

export type MeaningfulProjectedTurnEventType = Exclude<
  ProjectedTurnEvent['type'],
  'provider.init' | 'runtime.progress' | 'usage.updated'
>

function safeEventIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 96) || 'event'
}

export function deterministicToolCallId(input: {
  runId: string
  name: string
  index: number
  providerToolCallId?: string
}): string {
  if (input.providerToolCallId?.trim()) return input.providerToolCallId
  return `tool_${safeEventIdPart(input.runId)}_${input.index}_${safeEventIdPart(input.name)}`
}

export function projectProviderEvent(input: {
  runId: string
  event: ProviderEvent
  index: number
}): ProjectedTurnEvent {
  const { runId, event, index } = input
  if (event.type === 'init') {
    return {
      type: 'provider.init',
      runId,
      providerSessionId: event.providerSessionId,
      ...(event.provider ? { provider: event.provider } : {}),
      ...(event.modelId ? { modelId: event.modelId } : {}),
      ...(event.modelFamily ? { modelFamily: event.modelFamily } : {}),
      ...(event.providerTransport ? { providerTransport: event.providerTransport } : {}),
    }
  }
  if (event.type === 'delta') return { type: 'assistant.delta', runId, text: event.text }
  if (event.type === 'result') return { type: 'assistant.result', runId, text: event.text }
  if (event.type === 'tool_call') {
    return {
      type: 'tool.call',
      runId,
      toolCallId: deterministicToolCallId({
        runId,
        name: event.name,
        index,
        providerToolCallId: event.toolCallId,
      }),
      name: event.name,
      ...(event.input === undefined ? {} : { input: sanitizeRuntimeResponse(event.input) }),
    }
  }
  if (event.type === 'tool_result') {
    return {
      type: 'tool.result',
      runId,
      toolCallId: deterministicToolCallId({
        runId,
        name: event.name,
        index,
        providerToolCallId: event.toolCallId,
      }),
      name: event.name,
      ...(event.output === undefined ? {} : { output: sanitizeRuntimeResponse(event.output) }),
      classification: classifyToolResult(event.name, event.output),
    }
  }
  if (event.type === 'error') {
    return {
      type: 'runtime.error',
      runId,
      message: redactRuntimeSensitiveText(event.message),
      retryable: event.retryable,
      ...(event.classification ? { classification: event.classification } : {}),
    }
  }
  if (event.type === 'progress') {
    return { type: 'runtime.progress', runId, message: redactRuntimeSensitiveText(event.message) }
  }
  return {
    type: 'usage.updated',
    runId,
    usage: sanitizeRuntimeResponse(event.usage),
    ...(event.providerSessionId ? { providerSessionId: event.providerSessionId } : {}),
  }
}

export function finalizeTurn(input: {
  events: ProjectedTurnEvent[]
  cancelled?: boolean
  awaitingApproval?: boolean
  budgetExhausted?: boolean
}): {
  exitReason: TurnExitReason
  errorCount: number
  toolCallCount: number
  assistantResult: string | null
  lastMeaningfulEventType: MeaningfulProjectedTurnEventType | null
} {
  const errorCount = input.events.filter((event) => event.type === 'runtime.error').length
  const toolCallCount = input.events.filter((event) => event.type === 'tool.call').length
  const assistantResult =
    [...input.events].reverse().find((event): event is Extract<ProjectedTurnEvent, { type: 'assistant.result' }> =>
      event.type === 'assistant.result'
    )?.text ?? null
  const lastMeaningfulEventType =
    [...input.events].reverse().find(
      (event): event is Extract<ProjectedTurnEvent, { type: MeaningfulProjectedTurnEventType }> =>
        event.type !== 'provider.init' &&
        event.type !== 'runtime.progress' &&
        event.type !== 'usage.updated',
    )?.type ?? null

  if (input.cancelled) {
    return { exitReason: 'cancelled', errorCount, toolCallCount, assistantResult, lastMeaningfulEventType }
  }
  if (input.awaitingApproval) {
    return {
      exitReason: 'awaiting_approval',
      errorCount,
      toolCallCount,
      assistantResult,
      lastMeaningfulEventType,
    }
  }
  if (input.budgetExhausted) {
    return {
      exitReason: 'budget_exhausted',
      errorCount,
      toolCallCount,
      assistantResult,
      lastMeaningfulEventType,
    }
  }
  if (
    toolCallCount > 0 &&
    !assistantResult &&
    (lastMeaningfulEventType === 'tool.call' ||
      lastMeaningfulEventType === 'tool.result' ||
      lastMeaningfulEventType === 'assistant.delta')
  ) {
    return {
      exitReason: 'stalled_after_tool',
      errorCount,
      toolCallCount,
      assistantResult,
      lastMeaningfulEventType,
    }
  }
  return {
    exitReason: errorCount > 0 && !assistantResult ? 'failed' : 'completed',
    errorCount,
    toolCallCount,
    assistantResult,
    lastMeaningfulEventType,
  }
}
