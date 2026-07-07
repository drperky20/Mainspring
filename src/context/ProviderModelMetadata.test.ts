import { describe, expect, it } from 'vitest'
import { fetchProviderModelSpec } from './ProviderModelMetadata.js'

describe('fetchProviderModelSpec', () => {
  it('fetches and converts OpenRouter model metadata', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'openai/gpt-5',
              architecture: {
                input_modalities: ['text', 'image'],
                output_modalities: ['text'],
                tokenizer: 'OpenAI',
              },
              pricing: {
                input_cache_read: '0.00000001',
              },
              top_provider: {
                context_length: 200_000,
              },
            },
          ],
        }),
        { status: 200 },
      )

    const spec = await fetchProviderModelSpec({
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
      fetch,
    })

    expect(spec.providerId).toBe('openrouter')
    expect(spec.modelId).toBe('openai/gpt-5')
    expect(spec.inputModalities).toEqual(['text', 'image'])
    expect(spec.contextWindowTokens).toBe(200_000)
    expect(spec.supportsPromptCache).toBe(true)
  })

  it('returns a caller-supplied stub for providers without metadata fetchers', async () => {
    const spec = await fetchProviderModelSpec({
      providerId: 'anthropic',
      modelId: 'claude-fable-5',
    })

    expect(spec.providerId).toBe('anthropic')
    expect(spec.modelId).toBe('claude-fable-5')
    expect(spec.metadata?.source).toBe('caller-supplied-model-id')
  })
})
