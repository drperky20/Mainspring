export interface UsageLedgerEntryLike {
  providerId?: string
  modelId?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
}

export interface UsageLedgerSummary {
  entries: number
  pricedEntries: number
  unpricedEntries: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  providers: string[]
  models: string[]
}

function addNumber(total: number, value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? total + value : total
}

export function summarizeUsageLedger(
  entries: readonly UsageLedgerEntryLike[],
): UsageLedgerSummary {
  const providers = new Set<string>()
  const models = new Set<string>()
  let pricedEntries = 0
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let estimatedCostUsd = 0

  for (const entry of entries) {
    if (entry.providerId) providers.add(entry.providerId)
    if (entry.modelId) models.add(entry.modelId)
    inputTokens = addNumber(inputTokens, entry.inputTokens)
    outputTokens = addNumber(outputTokens, entry.outputTokens)
    totalTokens = addNumber(totalTokens, entry.totalTokens)
    if (typeof entry.estimatedCostUsd === 'number' && Number.isFinite(entry.estimatedCostUsd)) {
      pricedEntries += 1
      estimatedCostUsd += entry.estimatedCostUsd
    }
  }

  return {
    entries: entries.length,
    pricedEntries,
    unpricedEntries: Math.max(0, entries.length - pricedEntries),
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    providers: [...providers].sort(),
    models: [...models].sort(),
  }
}
