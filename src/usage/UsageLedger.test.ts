import { describe, expect, it } from 'vitest'
import { summarizeUsageLedger } from './UsageLedger.js'

describe('summarizeUsageLedger', () => {
  it('does not let invalid negative projection values reduce operator totals', () => {
    expect(summarizeUsageLedger([
      {
        providerId: 'provider-a',
        modelId: 'model-a',
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        estimatedCostUsd: 0.25,
      },
      {
        providerId: 'provider-b',
        modelId: 'model-b',
        inputTokens: -10,
        outputTokens: Number.NaN,
        totalTokens: -20,
        estimatedCostUsd: -1,
      },
    ])).toMatchObject({
      entries: 2,
      pricedEntries: 1,
      unpricedEntries: 1,
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      estimatedCostUsd: 0.25,
      providers: ['provider-a', 'provider-b'],
      models: ['model-a', 'model-b'],
    })
  })
})
