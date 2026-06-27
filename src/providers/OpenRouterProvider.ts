import { OpenRouterChatCompletionsClient } from './HttpProviderClient.js'
import { ProviderShell, type ProviderShellConfig } from './ProviderShell.js'

function numberOption(
  options: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = options?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export class OpenRouterProvider extends ProviderShell {
  constructor(config: Omit<ProviderShellConfig, 'providerId'>) {
    super({
      ...config,
      providerId: 'openrouter',
      client:
        config.client ??
        new OpenRouterChatCompletionsClient({
          defaultModel: config.modelId,
          requestTimeoutMs: numberOption(config.options, 'requestTimeoutMs'),
        }),
    })
  }
}
