import fs from 'node:fs'
import path from 'node:path'

export interface ModelPricing {
  providerId?: string
  modelId: string
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  cacheReadUsdPerMillion?: number
  cacheWriteUsdPerMillion?: number
  reasoningUsdPerMillion?: number
}

export interface LookupModelPricingOptions {
  providerId?: string
  modelId?: string
  catalog?: readonly ModelPricing[]
}

export interface LoadModelPricingCatalogOptions {
  includeBuiltins?: boolean
}

export interface ModelPricingCatalogStatus {
  source: 'built-in' | 'configured'
  configured: boolean
  entries: number
  builtInEntries: number
  configuredEntries: number
  sourceLabel?: string
}

export interface DescribeModelPricingCatalogOptions {
  catalog?: readonly ModelPricing[]
  configured?: boolean
  configuredEntries?: number
  sourceLabel?: string
}

const BUILTIN_MODEL_PRICING: readonly ModelPricing[] = [
  {
    providerId: 'openrouter',
    modelId: 'openrouter/free',
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    cacheReadUsdPerMillion: 0,
    cacheWriteUsdPerMillion: 0,
    reasoningUsdPerMillion: 0,
  },
]

const OPTIONAL_PRICE_FIELDS = [
  'cacheReadUsdPerMillion',
  'cacheWriteUsdPerMillion',
  'reasoningUsdPerMillion',
] as const

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : undefined
}

function requiredText(record: Record<string, unknown>, key: string, index: number): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`pricing entry ${index} must include a non-empty ${key}.`)
  }
  return value.trim()
}

function optionalText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredUsd(record: Record<string, unknown>, key: string, index: number): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`pricing entry ${index} must include non-negative finite ${key}.`)
  }
  return value
}

function optionalUsd(record: Record<string, unknown>, key: string, index: number): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`pricing entry ${index} has invalid ${key}; expected a non-negative finite number.`)
  }
  return value
}

function pricingEntriesFromJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.models)) return record.models
    if (Array.isArray(record.pricing)) return record.pricing
  }
  throw new Error('pricing catalog must be a JSON array or an object with a models array.')
}

function parsedPricingEntry(value: unknown, index: number): ModelPricing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`pricing entry ${index} must be an object.`)
  }
  const record = value as Record<string, unknown>
  const entry: ModelPricing = {
    modelId: requiredText(record, 'modelId', index),
    inputUsdPerMillion: requiredUsd(record, 'inputUsdPerMillion', index),
    outputUsdPerMillion: requiredUsd(record, 'outputUsdPerMillion', index),
  }
  const providerId = optionalText(record, 'providerId')
  if (providerId) entry.providerId = providerId
  for (const field of OPTIONAL_PRICE_FIELDS) {
    const price = optionalUsd(record, field, index)
    if (price !== undefined) entry[field] = price
  }
  return entry
}

export function parseModelPricingCatalog(value: unknown): ModelPricing[] {
  return pricingEntriesFromJson(value).map((entry, index) => parsedPricingEntry(entry, index))
}

export function defaultModelPricingCatalog(): readonly ModelPricing[] {
  return BUILTIN_MODEL_PRICING
}

export function modelPricingCatalogPathFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const catalogPath = env.MAINSPRING_MODEL_PRICING_CATALOG ?? env.MAINSPRING_PRICING_CATALOG_PATH
  return catalogPath?.trim() ? catalogPath.trim() : undefined
}

export function modelPricingCatalogSourceLabel(filePath: string): string {
  return path.basename(path.resolve(filePath)) || 'pricing catalog'
}

export function describeModelPricingCatalog(
  options: DescribeModelPricingCatalogOptions = {},
): ModelPricingCatalogStatus {
  const catalog = options.catalog ?? BUILTIN_MODEL_PRICING
  const builtInEntries = BUILTIN_MODEL_PRICING.length
  const configured = options.configured ?? false
  const configuredEntries = configured
    ? options.configuredEntries ?? Math.max(0, catalog.length - builtInEntries)
    : 0
  return {
    source: configured ? 'configured' : 'built-in',
    configured,
    entries: catalog.length,
    builtInEntries,
    configuredEntries,
    ...(options.sourceLabel ? { sourceLabel: options.sourceLabel } : {}),
  }
}

export function loadModelPricingCatalogFile(
  filePath: string,
  options: LoadModelPricingCatalogOptions = {},
): readonly ModelPricing[] {
  const resolved = path.resolve(filePath)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read model pricing catalog ${resolved}: ${message}`)
  }
  const catalog = parseModelPricingCatalog(parsed)
  return options.includeBuiltins ? [...BUILTIN_MODEL_PRICING, ...catalog] : catalog
}

export function modelPricingCatalogFromEnv(
  env: Record<string, string | undefined> = process.env,
): readonly ModelPricing[] {
  const catalogPath = modelPricingCatalogPathFromEnv(env)
  if (!catalogPath) return defaultModelPricingCatalog()
  return loadModelPricingCatalogFile(catalogPath, { includeBuiltins: true })
}

export function lookupModelPricing(options: LookupModelPricingOptions): ModelPricing | null {
  const providerId = normalized(options.providerId)
  const modelId = normalized(options.modelId)
  if (!modelId) return null

  for (const entry of options.catalog ?? BUILTIN_MODEL_PRICING) {
    if (normalized(entry.modelId) !== modelId) continue
    const entryProviderId = normalized(entry.providerId)
    if (!entryProviderId || !providerId || entryProviderId === providerId) return entry
  }

  return null
}
