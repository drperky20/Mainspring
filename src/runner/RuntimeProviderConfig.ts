import {
  MAINSPRING_APP_CREDENTIAL_REF,
  MAINSPRING_APP_MODEL_ID,
  MAINSPRING_APP_PROVIDER_ID,
} from '#protocol'
import type { AgentProvider } from '../providers/types.js'
import { createDefaultProviderRegistry } from '../providers/ProviderRegistry.js'

export type RuntimeProviderId = 'openrouter' | 'openai'

export interface RuntimeProviderSelection {
  provider: AgentProvider
  providerId: RuntimeProviderId
  modelId?: string
  credentialRef?: string
  fallbackReason?: string
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeProviderId(value: string | undefined): RuntimeProviderId | undefined {
  const normalized = clean(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === MAINSPRING_APP_PROVIDER_ID || normalized === 'openai') {
    return normalized as RuntimeProviderId
  }
  throw new Error(`Unsupported Mainspring provider: ${value}`)
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const cleaned = clean(value)
  if (!cleaned) return undefined
  const parsed = Number.parseInt(cleaned, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function createRuntimeProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): RuntimeProviderSelection {
  const providerId = normalizeProviderId(env.MAINSPRING_PROVIDER) ?? MAINSPRING_APP_PROVIDER_ID
  const modelId =
    clean(env.MAINSPRING_MODEL) ??
    (providerId === 'openai' ? 'gpt-5.5' : MAINSPRING_APP_MODEL_ID)
  const credentialRef =
    clean(env.MAINSPRING_CREDENTIAL_REF) ??
    (providerId === 'openai' ? 'env:OPENAI_API_KEY' : MAINSPRING_APP_CREDENTIAL_REF)
  const registry = createDefaultProviderRegistry({ defaultProviderId: providerId })
  const requestTimeoutMs = parsePositiveInteger(env.MAINSPRING_PROVIDER_REQUEST_TIMEOUT_MS)
  const baseUrl = clean(env.MAINSPRING_OPENAI_BASE_URL) ?? clean(env.OPENAI_BASE_URL)
  const responsesMode = clean(env.MAINSPRING_OPENAI_RESPONSES_MODE)
  const options: Record<string, unknown> = {}
  if (requestTimeoutMs) options.requestTimeoutMs = requestTimeoutMs
  if (providerId === 'openai' && baseUrl) options.baseUrl = baseUrl
  if (providerId === 'openai' && responsesMode) options.responsesMode = responsesMode
  return {
    provider: registry.resolve({
      providerId,
      modelId,
      credentialRef,
      options: Object.keys(options).length ? options : undefined,
    }),
    providerId,
    modelId,
    credentialRef,
  }
}
