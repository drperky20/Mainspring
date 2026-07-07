import { describe, expect, it } from 'vitest'
import { ContextPromptCompiler } from './ContextPromptCompiler.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) =>
      `line ${index}: src/context/ContextPromptCompiler.ts saw ticket CTX-${index} and hash abc1234 while running pnpm test`,
  ).join('\n')
}

describe('ContextPromptCompiler', () => {
  it('assembles a multimodal prompt with image parts and rehydrate hints', () => {
    const compiler = new ContextPromptCompiler()
    const compiled = compiler.compile({
      providerId: 'openai',
      modelId: 'gpt-5',
      blocks: [
        {
          blockId: 'intent',
          kind: 'user_intent',
          content: 'Please explain what changed.',
          recent: true,
        },
        {
          blockId: 'old-log',
          kind: 'tool_result',
          content: largeLog(),
          risk: 'gist',
        },
      ],
    })

    expect(compiled.model.profile.id).toBe('openai-gpt-5-tile')
    expect(compiled.stats.imageParts).toBeGreaterThan(0)
    expect(compiled.parts.some((part) => part.type === 'text' && part.purpose === 'exact')).toBe(true)
    expect(compiled.parts.some((part) => part.type === 'text' && part.purpose === 'factsheet')).toBe(true)
    expect(compiled.textFallback).toContain('image projection omitted in text fallback')
    expect(compiled.requiredTools).toContain('context.rehydrate')
  })

  it('uses text-only failover for models without vision', () => {
    const compiler = new ContextPromptCompiler()
    const compiled = compiler.compile({
      modelSpec: {
        providerId: 'custom',
        modelId: 'text-only-xl',
        inputModalities: ['text'],
      },
      blocks: [
        {
          blockId: 'old-log',
          kind: 'tool_result',
          content: largeLog(),
          risk: 'gist',
        },
      ],
    })

    expect(compiled.model.hasVision).toBe(false)
    expect(compiled.stats.imageParts).toBe(0)
    expect(compiled.warnings.join(' ')).toContain('text-only failover')
    expect(compiled.textFallback).toContain('target model has no usable vision lane')
  })

  it('can force text-only compilation for a vision model', () => {
    const compiler = new ContextPromptCompiler({ forceTextOnly: true })
    const compiled = compiler.compile({
      providerId: 'google',
      modelId: 'gemini-3.5-flash',
      blocks: [
        {
          blockId: 'history',
          kind: 'run_history',
          content: largeLog(),
          risk: 'gist',
        },
      ],
    })

    expect(compiled.model.hasVision).toBe(true)
    expect(compiled.model.profile.id).toBe('google-gemini-3-media-resolution')
    expect(compiled.stats.imageParts).toBe(0)
    expect(compiled.plan.profile.id).toBe('text-only')
  })
})
