import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  estimateUsageCost,
  loadModelPricingCatalogFile,
  modelPricingCatalogFromEnv,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-pricing-check-'))

try {
  const catalogPath = path.join(root, 'pricing.json')
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({
      models: [
        {
          providerId: 'openai',
          modelId: 'gpt-priced-check',
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 6,
          cacheReadUsdPerMillion: 1,
        },
      ],
    }),
  )

  const catalog = loadModelPricingCatalogFile(catalogPath, { includeBuiltins: true })
  const estimate = estimateUsageCost({
    catalog,
    usage: {
      provider: 'openai',
      modelId: 'gpt-priced-check',
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 250,
    },
  })
  assert(estimate.pricingStatus === 'estimated', `expected estimated pricing, got ${estimate.pricingStatus}`)
  assert(
    Math.abs((estimate.estimatedCostUsd ?? 0) - 0.00525) < 0.0000001,
    `unexpected estimated cost: ${estimate.estimatedCostUsd}`,
  )

  const envCatalog = modelPricingCatalogFromEnv({ MAINSPRING_MODEL_PRICING_CATALOG: catalogPath })
  const freeEstimate = estimateUsageCost({
    catalog: envCatalog,
    usage: {
      provider: 'openrouter',
      modelId: 'openrouter/free',
      inputTokens: 1,
      outputTokens: 1,
    },
  })
  assert(freeEstimate.pricingStatus === 'free', `expected built-in free pricing, got ${freeEstimate.pricingStatus}`)

  const badCatalogPath = path.join(root, 'bad-pricing.json')
  fs.writeFileSync(
    badCatalogPath,
    JSON.stringify({
      models: [
        {
          providerId: 'openai',
          modelId: 'bad',
          inputUsdPerMillion: -1,
          outputUsdPerMillion: 1,
        },
      ],
    }),
  )
  let failedClosed = false
  try {
    loadModelPricingCatalogFile(badCatalogPath)
  } catch (error) {
    failedClosed = String(error instanceof Error ? error.message : error).includes('inputUsdPerMillion')
  }
  assert(failedClosed, 'malformed pricing catalog did not fail closed')

  console.log('MAINSPRING_PRICING_CHECK_OK')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
