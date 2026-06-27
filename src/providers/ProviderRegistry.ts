import type { AgentProvider, RuntimeProviderClient } from './types.js'
import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import { OpenAIProvider } from './OpenAIProvider.js'
import { OpenRouterProvider } from './OpenRouterProvider.js'
import { ProviderShell, type ProviderShellConfig } from './ProviderShell.js'

export interface ProviderRegistration {
  providerId: string
  modelId?: string
  credentialRef: string
  options?: Record<string, unknown>
  client?: RuntimeProviderClient
}

export interface ProviderResolveInput {
  providerId?: string
  modelId?: string
  credentialRef?: string
  options?: Record<string, unknown>
}

export interface DefaultProviderRegistryOptions {
  defaultProviderId?: string
  clients?: Partial<Record<'openrouter' | 'openai', RuntimeProviderClient>>
}

type ProviderFactory = (config: Omit<ProviderShellConfig, 'providerId'>) => AgentProvider

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderRegistration>()

  constructor(private defaultProviderId: string | null = null) {}

  register(input: ProviderRegistration): this {
    createProviderShell(input)
    this.providers.set(input.providerId, input)
    if (!this.defaultProviderId) {
      this.defaultProviderId = input.providerId
    }
    return this
  }

  resolve(input: ProviderResolveInput = {}): AgentProvider {
    const providerId = input.providerId ?? this.defaultProviderId
    if (!providerId) {
      throw new Error('No runtime provider is configured.')
    }

    const registered = this.providers.get(providerId)
    if (!registered) {
      throw new Error(`Unknown runtime provider: ${providerId}`)
    }

    return createProviderShell({
      ...registered,
      ...input,
      providerId,
      credentialRef: input.credentialRef ?? registered.credentialRef,
      options: { ...(registered.options ?? {}), ...(input.options ?? {}) },
    })
  }
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = new ProviderRegistry(options.defaultProviderId ?? MAINSPRING_APP_PROVIDER_ID)
  registry.register({
    providerId: MAINSPRING_APP_PROVIDER_ID,
    modelId: MAINSPRING_APP_MODEL_ID,
    credentialRef: MAINSPRING_APP_CREDENTIAL_REF,
    client: options.clients?.openrouter,
  })
  registry.register({
    providerId: 'openai',
    modelId: MAINSPRING_APP_MODEL_ID,
    credentialRef: 'env:OPENAI_API_KEY',
    client: options.clients?.openai,
  })
  return registry
}

function createProviderShell(input: ProviderRegistration): AgentProvider {
  const factories: Record<string, ProviderFactory> = {
    openai: (config) => new OpenAIProvider(config),
    openrouter: (config) => new OpenRouterProvider(config),
  }
  const factory = factories[input.providerId]
  if (factory) {
    return factory(input)
  }
  if (!input.client) {
    throw new Error(
      `Unsupported runtime provider: ${input.providerId}. Register a RuntimeProviderClient or use openrouter/openai.`,
    )
  }
  return new ProviderShell(input)
}
