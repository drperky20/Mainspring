import { describe, expect, it } from 'vitest'
import {
  compileContextModelSpec,
  providerModelSpecFromOpenRouterModel,
} from './ModelSpecCompiler.js'

describe('compileContextModelSpec', () => {
  it('compiles OpenAI GPT and Codex presets from model ids', () => {
    const gpt = compileContextModelSpec({ providerId: 'openai', modelId: 'gpt-5' })
    const codex = compileContextModelSpec({ providerId: 'openai', modelId: 'gpt-5.3-codex' })

    expect(gpt.profile.id).toBe('openai-gpt-5-tile')
    expect(gpt.profile.imageCost(1024, 1024, 'high')).toBe(630)
    expect(codex.profile.id).toBe('openai-codex-patch')
    expect(codex.profile.imageCost(1024, 1024, 'high')).toBe(1659)
  })

  it('infers upstream model families through OpenRouter ids', () => {
    const routedClaude = compileContextModelSpec({
      providerId: 'openrouter',
      modelId: 'anthropic/claude-fable-5',
    })
    const routedGpt = compileContextModelSpec({
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
    })

    expect(routedClaude.profile.id).toBe('anthropic-high-resolution')
    expect(routedGpt.profile.id).toBe('openai-gpt-5-tile')
    expect(routedClaude.warnings.join(' ')).toContain('OpenRouter routing profile inferred')
  })

  it('compiles Gemini 3 media-resolution and earlier Gemini tile presets', () => {
    const gemini3 = compileContextModelSpec({
      providerId: 'google',
      modelId: 'gemini-3.5-flash',
    })
    const gemini25 = compileContextModelSpec({
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
    })

    expect(gemini3.profile.id).toBe('google-gemini-3-media-resolution')
    expect(gemini3.profile.imageCost(1200, 800, 'low')).toBe(280)
    expect(gemini3.profile.imageCost(1200, 800, 'high')).toBe(1120)
    expect(gemini3.profile.maxImages).toBe(3600)
    expect(gemini25.profile.id).toBe('google-gemini-tiles')
    expect(gemini25.profile.imageCost(960, 540, 'high')).toBe(1548)
  })

  it('uses conservative declared defaults for Grok frontier models', () => {
    const grok = compileContextModelSpec({ providerId: 'xai', modelId: 'grok-4.3' })

    expect(grok.profile.id).toBe('xai-grok-frontier-declared')
    expect(grok.hasVision).toBe(true)
    expect(grok.profile.imageCost(1024, 1024, 'high')).toBe(1120)
    expect(grok.warnings.join(' ')).toContain('xAI documents image prompts')
  })

  it('compiles custom provider-declared image tokenization', () => {
    const compiled = compileContextModelSpec({
      providerId: 'custom-provider',
      modelId: 'vision-xl',
      inputModalities: ['text', 'image'],
      imageTokenization: {
        kind: 'declared',
        lowTokens: 100,
        highTokens: 900,
        fallbackTokens: 600,
      },
      maxImages: 42,
    })

    expect(compiled.source).toBe('provider-spec')
    expect(compiled.hasVision).toBe(true)
    expect(compiled.profile.maxImages).toBe(42)
    expect(compiled.profile.imageCost(4000, 2000, 'low')).toBe(100)
    expect(compiled.profile.imageCost(4000, 2000, 'high')).toBe(900)
  })

  it('fails over to text when a model cannot prove vision support', () => {
    const compiled = compileContextModelSpec({
      providerId: 'custom',
      modelId: 'text-only-xl',
      inputModalities: ['text'],
    })

    expect(compiled.source).toBe('text-failover')
    expect(compiled.hasVision).toBe(false)
    expect(compiled.profile.id).toBe('text-only')
  })

  it('treats declared image input without tokenization as unusable vision', () => {
    const compiled = compileContextModelSpec({
      providerId: 'custom',
      modelId: 'declared-vision-xl',
      inputModalities: ['text', 'image'],
    })

    expect(compiled.source).toBe('text-failover')
    expect(compiled.hasVision).toBe(false)
    expect(compiled.profile.id).toBe('text-only')
    expect(compiled.warnings.join(' ')).toContain('declares image input')
  })

  it('compiles OpenRouter Models API metadata into provider specs', () => {
    const spec = providerModelSpecFromOpenRouterModel({
      id: 'google/gemini-3.5-flash',
      canonical_slug: 'google/gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      context_length: 1_000_000,
      architecture: {
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        tokenizer: 'Gemini',
      },
      pricing: {
        prompt: '0.0000001',
        completion: '0.0000002',
        image: '0',
        input_cache_read: '0.00000001',
      },
      top_provider: {
        context_length: 500_000,
      },
    })
    const compiled = compileContextModelSpec(spec)

    expect(spec.providerId).toBe('openrouter')
    expect(spec.inputModalities).toEqual(['text', 'image'])
    expect(spec.contextWindowTokens).toBe(500_000)
    expect(spec.supportsPromptCache).toBe(true)
    expect(compiled.profile.id).toBe('google-gemini-3-media-resolution')
  })
})
