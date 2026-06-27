import { describe, expect, it } from 'vitest'
import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import { OpenAIProvider } from '../providers/OpenAIProvider.js'
import { OpenRouterProvider } from '../providers/OpenRouterProvider.js'
import { createRuntimeProviderFromEnv } from './RuntimeProviderConfig.js'

describe('RuntimeProviderConfig', () => {
  it('defaults Mainspring app-level AI calls to OpenRouter free router', () => {
    const selection = createRuntimeProviderFromEnv({})

    expect(selection.providerId).toBe(MAINSPRING_APP_PROVIDER_ID)
    expect(selection.provider).toBeInstanceOf(OpenRouterProvider)
    expect(selection.credentialRef).toBe(MAINSPRING_APP_CREDENTIAL_REF)
    expect(selection.modelId).toBe(MAINSPRING_APP_MODEL_ID)
    expect(selection.fallbackReason).toBeUndefined()
  })

  it('keeps OpenRouter free router even when other provider keys are configured', () => {
    const selection = createRuntimeProviderFromEnv({
      ANTHROPIC_API_KEY: 'sk-ant-realish',
      OPENAI_API_KEY: 'sk-openai-realish',
      OPENROUTER_API_KEY: 'sk-or-realish',
    })

    expect(selection.providerId).toBe('openrouter')
    expect(selection.credentialRef).toBe('env:OPENROUTER_API_KEY')
    expect(selection.modelId).toBe('openrouter/free')
  })

  it('accepts explicit OpenRouter free-router config', () => {
    const selection = createRuntimeProviderFromEnv({
      MAINSPRING_PROVIDER: 'openrouter',
      MAINSPRING_MODEL: 'openrouter/free',
      MAINSPRING_CREDENTIAL_REF: 'env:OPENROUTER_API_KEY',
      MAINSPRING_PROVIDER_REQUEST_TIMEOUT_MS: '45000',
    })

    expect(selection.providerId).toBe('openrouter')
    expect(selection.modelId).toBe('openrouter/free')
    expect(selection.credentialRef).toBe('env:OPENROUTER_API_KEY')
    expect((selection.provider as OpenRouterProvider).options).toMatchObject({
      requestTimeoutMs: 45000,
    })
  })

  it('accepts an OpenAI-compatible proxy config', () => {
    const selection = createRuntimeProviderFromEnv({
      MAINSPRING_PROVIDER: 'openai',
      MAINSPRING_MODEL: 'gpt-5.5',
      MAINSPRING_CREDENTIAL_REF: 'env:OPENAI_API_KEY',
      MAINSPRING_OPENAI_BASE_URL: 'http://127.0.0.1:8645/v1',
      MAINSPRING_OPENAI_RESPONSES_MODE: 'codex-proxy',
    })

    expect(selection.providerId).toBe('openai')
    expect(selection.provider).toBeInstanceOf(OpenAIProvider)
    expect(selection.modelId).toBe('gpt-5.5')
    expect(selection.credentialRef).toBe('env:OPENAI_API_KEY')
    expect((selection.provider as OpenAIProvider).options).toMatchObject({
      baseUrl: 'http://127.0.0.1:8645/v1',
      responsesMode: 'codex-proxy',
    })
  })

  it('still rejects unsupported providers', () => {
    expect(() =>
      createRuntimeProviderFromEnv({
        MAINSPRING_PROVIDER: 'anthropic',
      }),
    ).toThrow('Unsupported Mainspring provider: anthropic')
  })
})
