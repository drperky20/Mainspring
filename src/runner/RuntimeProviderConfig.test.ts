import { describe, expect, it } from 'vitest'
import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import { OpenAIProvider } from '../providers/OpenAIProvider.js'
import { OpenRouterProvider } from '../providers/OpenRouterProvider.js'
import { CodexProvider } from '../providers/CodexProvider.js'
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

  it('accepts Codex CLI config backed by Codex home auth', () => {
    const selection = createRuntimeProviderFromEnv({
      MAINSPRING_PROVIDER: 'codex',
      CODEX_HOME: '/codex-home',
      MAINSPRING_CODEX_COMMAND: 'codex',
    })

    expect(selection.providerId).toBe('codex')
    expect(selection.provider).toBeInstanceOf(CodexProvider)
    expect(selection.modelId).toBe('codex-auto')
    expect(selection.credentialRef).toBe('env:CODEX_HOME')
    expect((selection.provider as CodexProvider).options).toMatchObject({
      command: 'codex',
    })
  })

  it('still rejects unsupported providers', () => {
    expect(() =>
      createRuntimeProviderFromEnv({
        MAINSPRING_PROVIDER: 'anthropic',
      }),
    ).toThrow('Unknown runtime provider: anthropic')
  })

  it('parses custom provider env config when a provider is explicitly registered', () => {
    const seenInputs: unknown[] = []
    const selection = createRuntimeProviderFromEnv(
      {
        MAINSPRING_PROVIDER: 'acme-ai',
        MAINSPRING_MODEL: 'acme/model',
        MAINSPRING_PROVIDER_BASE_URL: 'https://acme.example/v1',
      },
      {
        providers: [
          {
            providerId: 'acme-ai',
            credentialRef: 'env:ACME_AI_API_KEY',
            client: {
              query(input) {
                seenInputs.push(input)
                return {
                  push() {},
                  end() {},
                  abort() {},
                  events: (async function* () {
                    yield { type: 'result' as const, text: 'ok' }
                  })(),
                }
              },
            },
          },
        ],
      },
    )

    selection.provider.query({ prompt: 'hello', cwd: '/workspace' })

    expect(selection.providerId).toBe('acme-ai')
    expect(selection.modelId).toBe('acme/model')
    expect(selection.credentialRef).toBe('env:ACME_AI_API_KEY')
    expect(seenInputs).toEqual([
      expect.objectContaining({
        model: 'acme/model',
        providerId: 'acme-ai',
        credentialRef: { kind: 'env', key: 'ACME_AI_API_KEY' },
        baseUrl: 'https://acme.example/v1',
      }),
    ])
  })
})
