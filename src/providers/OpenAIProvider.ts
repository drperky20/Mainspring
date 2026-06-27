import { OpenAIResponsesClient } from './HttpProviderClient.js'
import { ProviderShell, type ProviderShellConfig } from './ProviderShell.js'

function stringOption(options: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = options?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export class OpenAIProvider extends ProviderShell {
  constructor(config: Omit<ProviderShellConfig, 'providerId'>) {
    super({
      ...config,
      providerId: 'openai',
      client:
        config.client ??
        new OpenAIResponsesClient({
          defaultModel: config.modelId,
          baseUrl: stringOption(config.options, 'baseUrl'),
          responsesMode:
            stringOption(config.options, 'responsesMode') === 'codex-proxy' ? 'codex-proxy' : 'standard',
        }),
    })
  }
}
