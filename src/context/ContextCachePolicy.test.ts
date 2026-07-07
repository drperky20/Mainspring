import { describe, expect, it } from 'vitest'
import { ContextPromptCompiler } from './ContextPromptCompiler.js'
import { planContextPromptCache } from './ContextCachePolicy.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) => `line ${index}: src/context/ContextCachePolicy.ts CTX-${index} abc1234`,
  ).join('\n')
}

describe('planContextPromptCache', () => {
  it('marks deterministic exact, factsheet, image, and summary parts cacheable for cache-capable models', () => {
    const compiled = new ContextPromptCompiler().compile({
      providerId: 'openai',
      modelId: 'gpt-5',
      blocks: [
        { blockId: 'intent', kind: 'user_intent', content: 'Summarize.', recent: true },
        { blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' },
      ],
    })

    const plan = planContextPromptCache(compiled)

    expect(plan.supportsPromptCache).toBe(true)
    expect(plan.decisions.some((decision) => decision.kind === 'cache-read-write')).toBe(true)
    expect(plan.decisions.some((decision) => decision.reason.includes('image-projection'))).toBe(true)
    expect(plan.decisions.some((decision) => decision.kind === 'no-cache')).toBe(true)
  })

  it('disables cache decisions for models without prompt cache support', () => {
    const compiled = new ContextPromptCompiler().compile({
      modelSpec: {
        providerId: 'custom',
        modelId: 'vision-no-cache',
        inputModalities: ['text', 'image'],
        supportsPromptCache: false,
        imageTokenization: {
          kind: 'declared',
          fallbackTokens: 100,
        },
      },
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })

    const plan = planContextPromptCache(compiled)

    expect(plan.supportsPromptCache).toBe(false)
    expect(plan.decisions.every((decision) => decision.kind === 'no-cache')).toBe(true)
  })
})
