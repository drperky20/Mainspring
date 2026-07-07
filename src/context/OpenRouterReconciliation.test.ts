import { describe, expect, it } from 'vitest'
import { compileContextModelSpec } from './ModelSpecCompiler.js'
import { reconcileOpenRouterRoutedModel } from './OpenRouterReconciliation.js'

describe('reconcileOpenRouterRoutedModel', () => {
  it('recompiles context profile when OpenRouter routes to a different model', () => {
    const requested = compileContextModelSpec({
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
    })

    const reconciled = reconcileOpenRouterRoutedModel({
      requested,
      routedModelId: 'anthropic/claude-fable-5',
    })

    expect(reconciled.changed).toBe(true)
    expect(reconciled.requestedModelId).toBe('openai/gpt-5')
    expect(reconciled.routedModelId).toBe('anthropic/claude-fable-5')
    expect(reconciled.compiled.profile.id).toBe('anthropic-high-resolution')
    expect(reconciled.warnings.join(' ')).toContain('use the routed model')
  })

  it('keeps the original compiled spec when routed model matches request', () => {
    const requested = compileContextModelSpec({
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
    })

    const reconciled = reconcileOpenRouterRoutedModel({
      requested,
      routedModelId: 'openai/gpt-5',
    })

    expect(reconciled.changed).toBe(false)
    expect(reconciled.compiled).toBe(requested)
  })
})
