import type { UsageUpdatedRunEventPayload } from '../contracts/runtime.js'
import {
  lookupModelPricing,
  type LookupModelPricingOptions,
  type ModelPricing,
} from './ModelPricing.js'

export interface EstimateUsageCostOptions extends LookupModelPricingOptions {
  usage: Pick<
    UsageUpdatedRunEventPayload,
    | 'provider'
    | 'modelId'
    | 'inputTokens'
    | 'outputTokens'
    | 'totalTokens'
    | 'cacheReadTokens'
    | 'cacheWriteTokens'
    | 'reasoningTokens'
  >
}

export interface UsageCostEstimate {
  estimatedCostUsd?: number
  pricingStatus: 'estimated' | 'free' | 'unpriced'
  pricing?: ModelPricing
}

function nonNegativeInt(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function usd(tokens: number, ratePerMillion: number | undefined): number {
  if (!ratePerMillion || tokens <= 0) return 0
  return (tokens / 1_000_000) * ratePerMillion
}

export function estimateUsageCost(options: EstimateUsageCostOptions): UsageCostEstimate {
  const pricing = lookupModelPricing({
    providerId: options.providerId ?? options.usage.provider,
    modelId: options.modelId ?? options.usage.modelId,
    catalog: options.catalog,
  })
  if (!pricing) return { pricingStatus: 'unpriced' }

  const estimatedCostUsd =
    usd(nonNegativeInt(options.usage.inputTokens), pricing.inputUsdPerMillion) +
    usd(nonNegativeInt(options.usage.outputTokens), pricing.outputUsdPerMillion) +
    usd(nonNegativeInt(options.usage.cacheReadTokens), pricing.cacheReadUsdPerMillion) +
    usd(nonNegativeInt(options.usage.cacheWriteTokens), pricing.cacheWriteUsdPerMillion) +
    usd(nonNegativeInt(options.usage.reasoningTokens), pricing.reasoningUsdPerMillion)

  const pricingStatus = estimatedCostUsd === 0 ? 'free' : 'estimated'
  return {
    estimatedCostUsd,
    pricingStatus,
    pricing,
  }
}
