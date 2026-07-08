import type { AgentProvider, ProviderAdapterCapabilities, RuntimeProviderClient } from './types.js'
import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import { CodexProvider } from './CodexProvider.js'
import { OpenAIProvider } from './OpenAIProvider.js'
import { OpenRouterProvider } from './OpenRouterProvider.js'
import { ProviderShell, type ProviderShellConfig } from './ProviderShell.js'

export interface ProviderRegistration {
  providerId: string
  modelId?: string
  credentialRef: string
  options?: Record<string, unknown>
  client?: RuntimeProviderClient
  capabilities?: ProviderAdapterCapabilities
  factory?: ProviderFactory
}

export interface ProviderResolveInput {
  providerId?: string
  modelId?: string
  credentialRef?: string
  options?: Record<string, unknown>
}

export interface DefaultProviderRegistryOptions {
  defaultProviderId?: string
  clients?: Record<string, RuntimeProviderClient | undefined>
  providers?: ProviderRegistration[]
}

export type ProviderFactory = (config: Omit<ProviderShellConfig, 'providerId'>) => AgentProvider

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/

export function assertSafeProviderId(providerId: string): string {
  const trimmed = providerId.trim()
  if (!trimmed || trimmed.length > 128 || !PROVIDER_ID_PATTERN.test(trimmed)) {
    throw new Error('Provider id must use only letters, numbers, dot, underscore, colon, or dash.')
  }
  return trimmed.toLowerCase()
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderRegistration>()
  private readonly factories = new Map<string, ProviderFactory>()
  private defaultProviderId: string | null

  constructor(defaultProviderId: string | null = null) {
    this.defaultProviderId = defaultProviderId ? assertSafeProviderId(defaultProviderId) : null
  }

  registerFactory(providerId: string, factory: ProviderFactory): this {
    this.factories.set(assertSafeProviderId(providerId), factory)
    return this
  }

  register(input: ProviderRegistration): this {
    const providerId = assertSafeProviderId(input.providerId)
    const registration = { ...input, providerId }
    createProviderShell(registration, this.factories)
    this.providers.set(providerId, registration)
    if (!this.defaultProviderId) {
      this.defaultProviderId = providerId
    }
    return this
  }

  resolve(input: ProviderResolveInput = {}): AgentProvider {
    const providerId = input.providerId ? assertSafeProviderId(input.providerId) : this.defaultProviderId
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
    }, this.factories)
  }

  listProviderIds(): string[] {
    return [...this.providers.keys()]
  }
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = new ProviderRegistry(
    options.defaultProviderId ? assertSafeProviderId(options.defaultProviderId) : MAINSPRING_APP_PROVIDER_ID,
  )
  registry
    .registerFactory('openrouter', (config) => new OpenRouterProvider(config))
    .registerFactory('openai', (config) => new OpenAIProvider(config))
    .registerFactory('codex', (config) => new CodexProvider(config))
  registry.register({
    providerId: MAINSPRING_APP_PROVIDER_ID,
    modelId: MAINSPRING_APP_MODEL_ID,
    credentialRef: MAINSPRING_APP_CREDENTIAL_REF,
    client: options.clients?.openrouter,
    capabilities: { structuredReplay: true },
  })
  registry.register({
    providerId: 'openai',
    modelId: MAINSPRING_APP_MODEL_ID,
    credentialRef: 'env:OPENAI_API_KEY',
    client: options.clients?.openai,
  })
  registry.register({
    providerId: 'codex',
    modelId: 'codex-auto',
    credentialRef: 'env:CODEX_HOME',
    client: options.clients?.codex,
    capabilities: { structuredReplay: true },
  })
  for (const provider of options.providers ?? []) registry.register(provider)
  return registry
}

function createProviderShell(
  input: ProviderRegistration,
  factories: ReadonlyMap<string, ProviderFactory>,
): AgentProvider {
  const factory = input.factory ?? factories.get(input.providerId)
  if (factory) {
    const provider = factory(input)
    if (input.capabilities && !provider.capabilities) {
      return Object.assign(provider, { capabilities: input.capabilities })
    }
    return provider
  }
  if (!input.client) {
    throw new Error(
      `Unsupported runtime provider: ${input.providerId}. Register a RuntimeProviderClient or provider factory.`,
    )
  }
  return new ProviderShell(input)
}
