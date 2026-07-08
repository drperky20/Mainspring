import { CodexCliClient } from './CodexCliClient.js'
import { OpenAIResponsesClient } from './HttpProviderClient.js'
import { ProviderShell, type ProviderShellConfig } from './ProviderShell.js'

function stringOption(options: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = options?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberOption(options: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = options?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArrayOption(options: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = options?.[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

export class CodexProvider extends ProviderShell {
  constructor(config: Omit<ProviderShellConfig, 'providerId'>) {
    const transport = stringOption(config.options, 'transport') ?? 'cli'
    super({
      ...config,
      providerId: 'codex',
      client:
        config.client ??
        (transport === 'openai-responses-codex-proxy'
          ? new OpenAIResponsesClient({
            defaultModel: config.modelId,
            baseUrl: stringOption(config.options, 'baseUrl'),
            responsesMode: 'codex-proxy',
          })
          : new CodexCliClient({
            command: stringOption(config.options, 'command'),
            defaultModel: config.modelId,
            timeoutMs: numberOption(config.options, 'timeoutMs'),
            extraArgs: stringArrayOption(config.options, 'extraArgs'),
          })),
    })
  }
}
