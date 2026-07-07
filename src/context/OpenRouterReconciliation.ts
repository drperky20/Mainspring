import type { CompiledContextModelSpec, ProviderModelSpec } from './types.js'
import { compileContextModelSpec } from './ModelSpecCompiler.js'

export interface OpenRouterRoutedModelReconciliation {
  changed: boolean
  requestedModelId: string
  routedModelId: string
  compiled: CompiledContextModelSpec
  warnings: string[]
}

export function reconcileOpenRouterRoutedModel(input: {
  requested: CompiledContextModelSpec | ProviderModelSpec
  routedModelId?: string | null
}): OpenRouterRoutedModelReconciliation {
  const requested =
    'profile' in input.requested ? input.requested : compileContextModelSpec(input.requested)
  const routedModelId = input.routedModelId?.trim() || requested.modelId
  const changed = routedModelId.toLowerCase() !== requested.modelId.toLowerCase()
  const compiled = changed
    ? compileContextModelSpec({
        providerId: 'openrouter',
        modelId: routedModelId,
        inputModalities: requested.hasVision ? ['text', 'image'] : ['text'],
        contextWindowTokens: requested.contextWindowTokens,
        supportsPromptCache: requested.profile.supportsPromptCache,
      })
    : requested

  return {
    changed,
    requestedModelId: requested.modelId,
    routedModelId,
    compiled,
    warnings: changed
      ? [
          `OpenRouter routed ${requested.modelId} to ${routedModelId}; use the routed model for context ROI and calibration.`,
          ...compiled.warnings,
        ]
      : [`OpenRouter routed model matched requested model ${requested.modelId}.`],
  }
}
