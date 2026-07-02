import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  describeModelPricingCatalog,
  loadModelPricingCatalogFile,
  lookupModelPricing,
  modelPricingCatalogFromEnv,
  modelPricingCatalogPathFromEnv,
  modelPricingCatalogSourceLabel,
  parseModelPricingCatalog,
} from './ModelPricing.js'
import { estimateUsageCost } from './UsageAccounting.js'
import { summarizeUsageLedger } from './UsageLedger.js'

describe('usage accounting primitives', () => {
  it('resolves the built-in free-router pricing entry', () => {
    expect(
      lookupModelPricing({
        providerId: 'openrouter',
        modelId: 'openrouter/free',
      }),
    ).toMatchObject({
      providerId: 'openrouter',
      modelId: 'openrouter/free',
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    })
  })

  it('estimates usage cost from a supplied catalog when pricing exists', () => {
    const estimate = estimateUsageCost({
      catalog: [
        {
          providerId: 'openai',
          modelId: 'gpt-test',
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 6,
          cacheReadUsdPerMillion: 1,
        },
      ],
      usage: {
        provider: 'openai',
        modelId: 'gpt-test',
        inputTokens: 1_000,
        outputTokens: 500,
        cacheReadTokens: 250,
      },
    })

    expect(estimate.pricingStatus).toBe('estimated')
    expect(estimate.estimatedCostUsd).toBeCloseTo(0.00525)
  })

  it('loads a local pricing catalog from a JSON file with built-ins preserved', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-pricing-test-'))
    try {
      const catalogPath = path.join(root, 'pricing.json')
      fs.writeFileSync(
        catalogPath,
        JSON.stringify({
          models: [
            {
              providerId: 'openai',
              modelId: 'gpt-priced',
              inputUsdPerMillion: 1.25,
              outputUsdPerMillion: 5,
              reasoningUsdPerMillion: 2,
            },
          ],
        }),
      )

      const catalog = loadModelPricingCatalogFile(catalogPath, { includeBuiltins: true })
      expect(lookupModelPricing({ providerId: 'openrouter', modelId: 'openrouter/free', catalog })).toMatchObject({
        modelId: 'openrouter/free',
        inputUsdPerMillion: 0,
      })
      expect(lookupModelPricing({ providerId: 'openai', modelId: 'gpt-priced', catalog })).toMatchObject({
        providerId: 'openai',
        modelId: 'gpt-priced',
        inputUsdPerMillion: 1.25,
        outputUsdPerMillion: 5,
      })
      expect(modelPricingCatalogFromEnv({ MAINSPRING_MODEL_PRICING_CATALOG: catalogPath })).toEqual(catalog)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('describes pricing catalog source without exposing full host paths', () => {
    const catalogPath = path.join('C:\\private\\mainspring', 'pricing.local.json')
    expect(modelPricingCatalogPathFromEnv({ MAINSPRING_PRICING_CATALOG_PATH: catalogPath })).toBe(catalogPath)
    expect(modelPricingCatalogSourceLabel(catalogPath)).toBe('pricing.local.json')
    expect(
      describeModelPricingCatalog({
        catalog: [
          {
            providerId: 'openai',
            modelId: 'gpt-priced',
            inputUsdPerMillion: 1,
            outputUsdPerMillion: 2,
          },
        ],
        configured: true,
        configuredEntries: 1,
        sourceLabel: modelPricingCatalogSourceLabel(catalogPath),
      }),
    ).toEqual({
      source: 'configured',
      configured: true,
      entries: 1,
      builtInEntries: 1,
      configuredEntries: 1,
      sourceLabel: 'pricing.local.json',
    })
  })

  it('rejects malformed pricing catalog entries instead of treating them as unpriced', () => {
    expect(() =>
      parseModelPricingCatalog({
        models: [
          {
            providerId: 'openai',
            modelId: 'gpt-bad',
            inputUsdPerMillion: -1,
            outputUsdPerMillion: 5,
          },
        ],
      }),
    ).toThrow('pricing entry 0 must include non-negative finite inputUsdPerMillion')
  })

  it('marks known free usage as free instead of unpriced', () => {
    const estimate = estimateUsageCost({
      usage: {
        provider: 'openrouter',
        modelId: 'openrouter/free',
        inputTokens: 3,
        outputTokens: 4,
      },
    })

    expect(estimate).toMatchObject({
      pricingStatus: 'free',
      estimatedCostUsd: 0,
    })
  })

  it('summarizes priced and unpriced ledger entries', () => {
    expect(
      summarizeUsageLedger([
        {
          providerId: 'openrouter',
          modelId: 'openrouter/free',
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7,
          estimatedCostUsd: 0,
        },
        {
          providerId: 'openai',
          modelId: 'gpt-test',
          inputTokens: 10,
          outputTokens: 2,
          totalTokens: 12,
        },
      ]),
    ).toEqual({
      entries: 2,
      pricedEntries: 1,
      unpricedEntries: 1,
      inputTokens: 13,
      outputTokens: 6,
      totalTokens: 19,
      estimatedCostUsd: 0,
      providers: ['openai', 'openrouter'],
      models: ['gpt-test', 'openrouter/free'],
    })
  })
})
