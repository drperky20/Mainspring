import { type ProviderUsage } from '#protocol'
import type {
  RunEvent,
  UsageUpdatedRunEventPayload,
} from '../contracts/runtime.js'
import type {
  RunLogEvent,
  RunRecord as RunLogRunRecord,
} from '../core/types.js'
import { estimateUsageCost } from '../usage/UsageAccounting.js'
import type { ModelPricing } from '../usage/ModelPricing.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayRunMetadataRecord,
} from './AppStateStore.js'

export interface GatewayBudgetEvaluationLike {
  budgetId: string
  status: string
}

export interface GatewayUsageProjectionOptions<
  TEvaluation extends GatewayBudgetEvaluationLike,
> {
  appState: LocalGatewayAppStateStore
  pricingCatalog: readonly ModelPricing[]
  evaluateBudgets: () => readonly TEvaluation[]
  recordBudgetTransitions: (input: {
    runId: string
    sessionId: string
    entryId: string
    previousStatuses: Map<string, TEvaluation>
  }) => void
}

function usageEntryIdForEvent(event: RunEvent): string {
  return `usage_${event.eventId}`
}

function usageEntryIdForRunLogEvent(event: RunLogEvent): string {
  return `usage_runlog_${event.eventId}`
}

function nonNegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function providerUsageFromRunLogEvent(event: RunLogEvent): ProviderUsage | null {
  if (event.type !== 'usage.reported') return null
  const usage = recordValue(recordValue(event.payload)?.usage)
  if (!usage) return null

  const result: ProviderUsage = {}
  for (const key of ['provider', 'modelId', 'modelFamily', 'providerTransport'] as const) {
    const value = textValue(usage[key])
    if (value) result[key] = value
  }
  for (const key of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningTokens',
  ] as const) {
    const value = nonNegativeSafeInteger(usage[key])
    if (value !== undefined) result[key] = value
  }
  if (recordValue(usage.rateLimit)) {
    result.rateLimit = usage.rateLimit as ProviderUsage['rateLimit']
  }
  return result
}

function normalizedNativePayload(
  payload: UsageUpdatedRunEventPayload,
  providerInitDetail?: Partial<UsageUpdatedRunEventPayload>,
): UsageUpdatedRunEventPayload {
  const merged: UsageUpdatedRunEventPayload = {
    ...providerInitDetail,
    ...payload,
    provider: payload.provider ?? providerInitDetail?.provider,
    modelId: payload.modelId ?? providerInitDetail?.modelId,
    modelFamily: payload.modelFamily ?? providerInitDetail?.modelFamily,
    providerTransport: payload.providerTransport ?? providerInitDetail?.providerTransport,
    providerSessionId: payload.providerSessionId ?? providerInitDetail?.providerSessionId,
  }
  for (const key of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningTokens',
  ] as const) {
    const value = nonNegativeSafeInteger(merged[key])
    if (value === undefined) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  return merged
}

function providerSessionIdFromRunLogEvent(event: RunLogEvent): string | undefined {
  const payload = event.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>).providerSessionId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function providerIdFromRunLogEvent(
  usage: ProviderUsage,
  providerInitPayload: Record<string, unknown> | undefined,
  runMetadata: LocalGatewayRunMetadataRecord | undefined,
  run: RunLogRunRecord,
): string | undefined {
  const providerFromInit = providerInitPayload?.provider
  return usage.provider
    ?? (typeof providerFromInit === 'string' && providerFromInit.trim() ? providerFromInit.trim() : undefined)
    ?? runMetadata?.providerId
    ?? run.providerId
}

function modelIdFromRunLogEvent(
  usage: ProviderUsage,
  providerInitPayload: Record<string, unknown> | undefined,
  runMetadata: LocalGatewayRunMetadataRecord | undefined,
  run: RunLogRunRecord,
): string | undefined {
  const modelFromInit = providerInitPayload?.modelId
  return usage.modelId
    ?? (typeof modelFromInit === 'string' && modelFromInit.trim() ? modelFromInit.trim() : undefined)
    ?? runMetadata?.modelId
    ?? run.modelId
}

function previousStatuses<TEvaluation extends GatewayBudgetEvaluationLike>(
  evaluations: readonly TEvaluation[],
): Map<string, TEvaluation> {
  return new Map(evaluations.map((evaluation) => [evaluation.budgetId, evaluation] as const))
}

/**
 * Projects authoritative runtime usage facts into the gateway ledger. The
 * facade remains responsible for finding native or RunLog events; this
 * collaborator owns normalization, pricing, idempotency, and budget transition
 * callbacks so projection writes cannot become an ad-hoc gateway mutation path.
 */
export class GatewayUsageProjection<TEvaluation extends GatewayBudgetEvaluationLike> {
  constructor(private readonly options: GatewayUsageProjectionOptions<TEvaluation>) {}

  projectNativeEvent(input: {
    event: RunEvent<UsageUpdatedRunEventPayload>
    runMetadata?: LocalGatewayRunMetadataRecord
    providerInitDetail?: Partial<UsageUpdatedRunEventPayload>
  }): void {
    const entryId = usageEntryIdForEvent(input.event)
    if (this.options.appState.usageLedger.get(entryId)) return

    const before = previousStatuses(this.options.evaluateBudgets())
    const payload = normalizedNativePayload(input.event.payload, input.providerInitDetail)
    const costEstimate = estimateUsageCost({
      usage: payload,
      catalog: this.options.pricingCatalog,
    })
    this.options.appState.projections.usageLedger.create({
      entryId,
      runId: input.event.runId,
      sessionId: input.event.sessionId,
      ...(input.runMetadata?.workspaceId ? { workspaceId: input.runMetadata.workspaceId } : {}),
      ...(payload.provider ?? input.runMetadata?.providerId
        ? { providerId: payload.provider ?? input.runMetadata?.providerId }
        : {}),
      ...(payload.modelId ?? input.runMetadata?.modelId
        ? { modelId: payload.modelId ?? input.runMetadata?.modelId }
        : {}),
      ...(payload.inputTokens !== undefined ? { inputTokens: payload.inputTokens } : {}),
      ...(payload.outputTokens !== undefined ? { outputTokens: payload.outputTokens } : {}),
      ...(payload.totalTokens !== undefined ? { totalTokens: payload.totalTokens } : {}),
      ...(costEstimate.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: costEstimate.estimatedCostUsd }
        : {}),
      metadata: {
        sourceEventId: input.event.eventId,
        sourceSeq: input.event.seq,
        pricingStatus: costEstimate.pricingStatus,
        ...(costEstimate.pricing ? { pricingModelId: costEstimate.pricing.modelId } : {}),
        ...(payload.modelFamily ? { modelFamily: payload.modelFamily } : {}),
        ...(payload.providerTransport ? { providerTransport: payload.providerTransport } : {}),
        ...(payload.providerSessionId ? { providerSessionId: payload.providerSessionId } : {}),
        ...(payload.cacheReadTokens !== undefined ? { cacheReadTokens: payload.cacheReadTokens } : {}),
        ...(payload.cacheWriteTokens !== undefined ? { cacheWriteTokens: payload.cacheWriteTokens } : {}),
        ...(payload.reasoningTokens !== undefined ? { reasoningTokens: payload.reasoningTokens } : {}),
        ...(payload.rateLimit ? { rateLimit: payload.rateLimit } : {}),
      },
    })
    this.options.recordBudgetTransitions({
      runId: input.event.runId,
      sessionId: input.event.sessionId,
      entryId,
      previousStatuses: before,
    })
  }

  projectRunLogEvent(input: {
    event: RunLogEvent
    run: RunLogRunRecord
    runMetadata?: LocalGatewayRunMetadataRecord
    providerInitPayload?: Record<string, unknown>
  }): void {
    const entryId = usageEntryIdForRunLogEvent(input.event)
    if (this.options.appState.usageLedger.get(entryId)) return
    const usage = providerUsageFromRunLogEvent(input.event)
    if (!usage) return

    const before = previousStatuses(this.options.evaluateBudgets())
    const providerSessionId = providerSessionIdFromRunLogEvent(input.event)
    const providerId = providerIdFromRunLogEvent(
      usage,
      input.providerInitPayload,
      input.runMetadata,
      input.run,
    )
    const modelId = modelIdFromRunLogEvent(
      usage,
      input.providerInitPayload,
      input.runMetadata,
      input.run,
    )
    const costEstimate = estimateUsageCost({
      usage,
      catalog: this.options.pricingCatalog,
    })
    this.options.appState.projections.usageLedger.create({
      entryId,
      runId: input.run.runId,
      sessionId: input.run.sessionId,
      ...(input.runMetadata?.workspaceId ?? input.run.workspaceId
        ? { workspaceId: input.runMetadata?.workspaceId ?? input.run.workspaceId }
        : {}),
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
      ...(costEstimate.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: costEstimate.estimatedCostUsd }
        : {}),
      metadata: {
        runtime: 'runlog',
        sourceEventId: input.event.eventId,
        sourceSeq: input.event.seq,
        pricingStatus: costEstimate.pricingStatus,
        ...(costEstimate.pricing ? { pricingModelId: costEstimate.pricing.modelId } : {}),
        ...(usage.modelFamily ? { modelFamily: usage.modelFamily } : {}),
        ...(usage.providerTransport ? { providerTransport: usage.providerTransport } : {}),
        ...(providerSessionId ? { providerSessionId } : {}),
        ...(usage.cacheReadTokens !== undefined
          ? { cacheReadTokens: usage.cacheReadTokens }
          : {}),
        ...(usage.cacheWriteTokens !== undefined
          ? { cacheWriteTokens: usage.cacheWriteTokens }
          : {}),
        ...(usage.reasoningTokens !== undefined
          ? { reasoningTokens: usage.reasoningTokens }
          : {}),
        ...(usage.rateLimit ? { rateLimit: usage.rateLimit } : {}),
      },
    })
    this.options.recordBudgetTransitions({
      runId: input.run.runId,
      sessionId: input.run.sessionId,
      entryId,
      previousStatuses: before,
    })
  }
}
