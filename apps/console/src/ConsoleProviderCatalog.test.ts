import { describe, expect, it } from 'vitest'
import { providerCatalog, providerModels } from './ConsoleProviderCatalog'

describe('provider catalog', () => {
  it('keeps connectable profiles separate from connector and catalog-only choices', () => {
    expect(providerCatalog.filter((provider) => provider.profileProviderId).map((provider) => provider.id)).toEqual([
      'openrouter',
      'openai',
      'codex',
    ])
    const anthropic = providerCatalog.find((provider) => provider.id === 'anthropic')
    expect(anthropic).toMatchObject({ status: 'connector' })
    expect(anthropic?.profileProviderId).toBeUndefined()
  })

  it('returns a stable, de-duplicated model list for agent settings', () => {
    const models = providerModels()

    expect(models.map((model) => model.id)).toContain('openrouter/auto')
    expect(models.map((model) => model.id)).toContain('gpt-4.1-mini')
    expect(new Set(models.map((model) => model.id)).size).toBe(models.length)
  })
})
