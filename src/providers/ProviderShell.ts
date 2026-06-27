import {
  RuntimeSecretRefSchema,
  sanitizeRuntimeResponse,
} from '#protocol'
import type {
  AgentProvider,
  AgentQuery,
  QueryInput,
  RuntimeCredentialRef,
  RuntimeProviderClient,
} from './types.js'

export interface ProviderShellConfig {
  providerId: string
  modelId?: string
  credentialRef: string
  options?: Record<string, unknown>
  client?: RuntimeProviderClient
}

export class ProviderShell implements AgentProvider {
  readonly providerId: string
  readonly modelId?: string
  readonly credentialRef: RuntimeCredentialRef
  readonly options: Record<string, unknown>

  constructor(config: ProviderShellConfig) {
    this.providerId = config.providerId
    this.modelId = config.modelId
    this.credentialRef = RuntimeSecretRefSchema.parse(config.credentialRef)
    this.options = assertSafeProviderOptions(config.options ?? {})
    this.client = config.client ?? missingProviderClient(config.providerId)
  }

  private readonly client: RuntimeProviderClient

  query(input: QueryInput): AgentQuery {
    return this.client.query({
      ...input,
      ...this.options,
      model: input.model ?? this.modelId,
      providerId: this.providerId,
      credentialRef: this.credentialRef,
    })
  }
}

export function assertSafeProviderOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeRuntimeResponse(options)
  if (JSON.stringify(sanitized) !== JSON.stringify(options)) {
    throw new Error('Provider options must not contain raw secret material.')
  }
  return options
}

function missingProviderClient(providerId: string): RuntimeProviderClient {
  return {
    query() {
      return {
        push() {},
        end() {},
        abort() {},
        events: (async function* () {
          yield {
            type: 'error' as const,
            message: `Provider client is not configured for ${providerId}.`,
            retryable: false,
            classification: 'provider_not_configured',
          }
        })(),
      }
    },
  }
}
