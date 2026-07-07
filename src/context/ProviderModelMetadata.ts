import type { ProviderModelSpec } from './types.js'
import { providerModelSpecFromOpenRouterModel } from './ModelSpecCompiler.js'

export interface FetchProviderModelSpecOptions {
  providerId: string
  modelId: string
  fetch?: typeof fetch
  baseUrl?: string
  headers?: Record<string, string>
}

function fetcher(input: FetchProviderModelSpecOptions): typeof fetch {
  const candidate = input.fetch ?? globalThis.fetch
  if (!candidate) throw new Error('No fetch implementation available for provider model metadata.')
  return candidate
}

export async function fetchProviderModelSpec(
  input: FetchProviderModelSpecOptions,
): Promise<ProviderModelSpec> {
  const providerId = input.providerId.trim().toLowerCase()
  if (providerId !== 'openrouter') {
    return {
      providerId,
      modelId: input.modelId,
      metadata: {
        source: 'caller-supplied-model-id',
        note: 'No metadata fetcher is implemented for this provider.',
      },
    }
  }

  const baseUrl = input.baseUrl ?? 'https://openrouter.ai/api/v1/models'
  const response = await fetcher(input)(baseUrl, {
    headers: {
      Accept: 'application/json',
      ...(input.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`OpenRouter model metadata request failed with status ${response.status}.`)
  }
  const body = (await response.json()) as unknown
  const models = Array.isArray((body as { data?: unknown }).data)
    ? ((body as { data: unknown[] }).data)
    : Array.isArray(body)
      ? body
      : []
  const match = models.find((model) => {
    const id = (model as { id?: unknown }).id
    return typeof id === 'string' && id.toLowerCase() === input.modelId.toLowerCase()
  })
  if (!match) throw new Error(`OpenRouter model metadata not found for ${input.modelId}.`)
  return providerModelSpecFromOpenRouterModel(match)
}
