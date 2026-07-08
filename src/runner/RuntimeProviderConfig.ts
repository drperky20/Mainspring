import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import type { AgentProvider } from '../providers/types.js'
import {
  assertSafeProviderId,
  createDefaultProviderRegistry,
  type DefaultProviderRegistryOptions,
} from '../providers/ProviderRegistry.js'

export type RuntimeProviderId = string

export interface RuntimeProviderSelection {
  provider: AgentProvider
  providerId: RuntimeProviderId
  modelId?: string
  credentialRef?: string
  fallbackReason?: string
}

export interface RuntimeProviderResolveOptions {
  providerId: RuntimeProviderId
  modelId?: string
  credentialRef: string
  options?: Record<string, unknown>
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeProviderId(value: string | undefined): RuntimeProviderId | undefined {
  const normalized = clean(value)
  return normalized ? assertSafeProviderId(normalized) : undefined
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const cleaned = clean(value)
  if (!cleaned) return undefined
  const parsed = Number.parseInt(cleaned, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function createRuntimeProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  registryOptions: DefaultProviderRegistryOptions = {},
): RuntimeProviderSelection {
  const resolved = runtimeProviderResolveOptionsFromEnv(env)
  const { providerId, modelId, credentialRef, options } = resolved
  const registry = createDefaultProviderRegistry({ ...registryOptions, defaultProviderId: providerId })
  return {
    provider: registry.resolve({
      providerId,
      modelId,
      credentialRef,
      options,
    }),
    providerId,
    modelId,
    credentialRef,
  }
}

export function runtimeProviderResolveOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): RuntimeProviderResolveOptions {
  const providerId = normalizeProviderId(env.MAINSPRING_PROVIDER) ?? MAINSPRING_APP_PROVIDER_ID
  const modelId =
    clean(env.MAINSPRING_MODEL) ??
    (providerId === 'openai'
      ? 'gpt-5.5'
      : providerId === 'codex'
        ? 'codex-auto'
      : providerId === MAINSPRING_APP_PROVIDER_ID
        ? MAINSPRING_APP_MODEL_ID
        : undefined)
  const credentialRef =
    clean(env.MAINSPRING_CREDENTIAL_REF) ??
    (providerId === 'openai'
      ? 'env:OPENAI_API_KEY'
      : providerId === 'codex'
        ? 'env:CODEX_HOME'
      : providerId === MAINSPRING_APP_PROVIDER_ID
        ? MAINSPRING_APP_CREDENTIAL_REF
        : `env:${providerId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`)
  const requestTimeoutMs = parsePositiveInteger(env.MAINSPRING_PROVIDER_REQUEST_TIMEOUT_MS)
  const baseUrl =
    clean(env.MAINSPRING_PROVIDER_BASE_URL)
    ?? clean(env.MAINSPRING_OPENAI_BASE_URL)
    ?? clean(env.OPENAI_BASE_URL)
  const responsesMode = clean(env.MAINSPRING_OPENAI_RESPONSES_MODE)
  const options: Record<string, unknown> = {}
  if (requestTimeoutMs) options.requestTimeoutMs = requestTimeoutMs
  if (baseUrl) options.baseUrl = baseUrl
  if (providerId === 'openai' && responsesMode) options.responsesMode = responsesMode
  if (providerId === 'codex') {
    const codexTransport = clean(env.MAINSPRING_CODEX_TRANSPORT)
    const codexCommand = clean(env.MAINSPRING_CODEX_COMMAND)
    if (codexTransport) options.transport = codexTransport
    if (codexCommand) options.command = codexCommand
  }
  return {
    providerId,
    modelId,
    credentialRef,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  }
}
