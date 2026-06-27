import { describe, expect, it } from 'vitest'
import { MAINSPRING_APP_MODEL_ID } from '#protocol'
import type { AgentQuery, ProviderEvent, QueryInput, RuntimeProviderClient } from './types.js'
import { ProviderRegistry, createDefaultProviderRegistry } from './ProviderRegistry.js'

function queryFromEvents(events: ProviderEvent[]): AgentQuery {
  return {
    push() {},
    end() {},
    abort() {},
    events: (async function* (): AsyncIterable<ProviderEvent> {
      for (const event of events) {
        yield event
      }
    })(),
  }
}

describe('ProviderRegistry', () => {
  it('rejects unknown providers before a query starts', () => {
    const registry = createDefaultProviderRegistry()

    expect(() =>
      registry.resolve({
        providerId: 'not-real',
        credentialRef: 'env:OPENROUTER_API_KEY',
      }),
    ).toThrow('Unknown runtime provider: not-real')
  })

  it('resolves the configured default provider with secret-ref-only config', () => {
    const seenInputs: QueryInput[] = []
    const client: RuntimeProviderClient = {
      query(input) {
        seenInputs.push(input)
        return queryFromEvents([
          {
            type: 'init',
            provider: 'openrouter',
            providerSessionId: 'openrouter_session_1',
            modelId: input.model,
          },
          { type: 'usage', usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 } },
          { type: 'result', text: 'done' },
        ])
      },
    }
    const registry = createDefaultProviderRegistry({
      clients: { openrouter: client },
    })

    const provider = registry.resolve({
      modelId: 'openrouter/free',
    })
    const query = provider.query({ prompt: 'hello', sessionId: 'default', cwd: '/tmp' })

    expect(seenInputs).toEqual([
      {
        prompt: 'hello',
        sessionId: 'default',
        cwd: '/tmp',
        model: 'openrouter/free',
        providerId: 'openrouter',
        credentialRef: { kind: 'env', key: 'OPENROUTER_API_KEY' },
      },
    ])
    expect(query.events).toBeDefined()
  })

  it('keeps non-OpenRouter providers out of the default app-level registry', () => {
    const registry = createDefaultProviderRegistry()

    expect(() =>
      registry.resolve({
        providerId: 'not-openrouter',
        modelId: 'non-openrouter-test-model',
        credentialRef: 'provider-profile:not-openrouter-local',
      }),
    ).toThrow('Unknown runtime provider: not-openrouter')
  })

  it('resolves OpenRouter with env secret refs through the default registry', () => {
    const seenInputs: QueryInput[] = []
    const registry = createDefaultProviderRegistry({
      defaultProviderId: 'openrouter',
      clients: {
        openrouter: {
          query(input) {
            seenInputs.push(input)
            return queryFromEvents([{ type: 'result', text: 'ok' }])
          },
        },
      },
    })

    registry
      .resolve({
        modelId: 'openrouter/free',
      })
      .query({ prompt: 'hello', sessionId: 'default', cwd: '/workspace' })

    expect(seenInputs).toEqual([
      {
        prompt: 'hello',
        sessionId: 'default',
        cwd: '/workspace',
        model: 'openrouter/free',
        providerId: 'openrouter',
        credentialRef: { kind: 'env', key: 'OPENROUTER_API_KEY' },
      },
    ])
  })

  it('allows explicit model selection for standalone Mainspring providers', () => {
    const seenInputs: QueryInput[] = []
    const registry = createDefaultProviderRegistry({
      clients: {
        openrouter: {
          query(input) {
            seenInputs.push(input)
            return queryFromEvents([{ type: 'result', text: 'ok' }])
          },
        },
      },
    })

    registry
      .resolve({
        modelId: 'openrouter/paid-router',
      })
      .query({
        prompt: 'hello',
        sessionId: 'default',
        cwd: '/workspace',
      })

    const provider = registry.resolve()
    provider.query({
      prompt: 'hello',
      sessionId: 'default',
      cwd: '/workspace',
      model: 'google/gemini-3-flash-preview',
    })

    expect(seenInputs.map((input) => input.model)).toEqual([
      'openrouter/paid-router',
      'google/gemini-3-flash-preview',
    ])
    expect(MAINSPRING_APP_MODEL_ID).toBe('openrouter/free')
  })

  it('rejects raw provider keys and sensitive provider config keys', () => {
    const registry = new ProviderRegistry()

    expect(() =>
      registry.register({
        providerId: 'openrouter',
        credentialRef: 'sk-raw-secret',
        client: { query: () => queryFromEvents([]) },
      }),
    ).toThrow('Runtime secret references must be opaque')

    expect(() =>
      registry.register({
        providerId: 'openrouter',
        credentialRef: 'env:OPENROUTER_API_KEY',
        options: { apiKey: 'sk-raw-secret' },
        client: { query: () => queryFromEvents([]) },
      }),
    ).toThrow('Provider options must not contain raw secret material')
  })
})
