import { describe, expect, it } from 'vitest'
import { InMemoryContextUsageLedger } from './ContextUsageLedger.js'

describe('InMemoryContextUsageLedger', () => {
  it('aggregates ROI, rehydrate, correction, and acceptance rates by model profile', () => {
    const ledger = new InMemoryContextUsageLedger()

    ledger.record({
      modelId: 'gpt-5',
      profileId: 'openai-gpt-5-tile',
      blockId: 'a',
      encodingKind: 'image+factsheet',
      estimatedTextTokens: 1000,
      estimatedVisualTokens: 300,
      estimatedSavingsTokens: 650,
      rehydrated: false,
      accepted: true,
    })
    ledger.record({
      modelId: 'gpt-5',
      profileId: 'openai-gpt-5-tile',
      blockId: 'b',
      encodingKind: 'image+factsheet',
      estimatedTextTokens: 900,
      estimatedVisualTokens: 300,
      estimatedSavingsTokens: 500,
      rehydrated: true,
      accepted: false,
      corrected: true,
    })

    const roi = ledger.roiFor({
      modelId: 'gpt-5',
      profileId: 'openai-gpt-5-tile',
      encodingKind: 'image+factsheet',
    })

    expect(roi.observations).toBe(2)
    expect(roi.averageSavingsTokens).toBe(575)
    expect(roi.rehydrateRate).toBe(0.5)
    expect(roi.correctionRate).toBe(0.5)
    expect(roi.acceptanceRate).toBe(0.5)
    expect(ledger.snapshot().entries).toHaveLength(1)
  })
})
