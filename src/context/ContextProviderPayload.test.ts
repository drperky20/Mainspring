import { describe, expect, it } from 'vitest'
import { ContextPromptCompiler } from './ContextPromptCompiler.js'
import { serializeContextPromptForProvider } from './ContextProviderPayload.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) =>
      `line ${index}: src/context/ContextProviderPayload.ts saw CTX-${index} and abc1234 while running pnpm test`,
  ).join('\n')
}

describe('serializeContextPromptForProvider', () => {
  it('serializes OpenAI Responses multimodal input with stable image bindings', () => {
    const compiled = new ContextPromptCompiler().compile({
      providerId: 'openai',
      modelId: 'gpt-5',
      blocks: [
        { blockId: 'intent', kind: 'user_intent', content: 'Summarize the run.', recent: true },
        { blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' },
      ],
    })

    const serialized = serializeContextPromptForProvider(compiled, {
      imageUriFor: (part) => `https://context.invalid/${part.recoverableId}.png`,
    })

    expect(serialized.kind).toBe('openai-responses')
    expect(serialized.imageBindings.length).toBeGreaterThan(0)
    expect(serialized.imageBindings[0]?.uri).toMatch(/^https:\/\/context\.invalid\//)
    expect(JSON.stringify(serialized.payload)).toContain('input_image')
  })

  it('uses provider-specific shapes for Anthropic, Gemini, and xAI chat', () => {
    const blocks = [{ blockId: 'old-log', kind: 'tool_result' as const, content: largeLog(), risk: 'gist' as const }]
    const anthropic = serializeContextPromptForProvider(
      new ContextPromptCompiler().compile({ providerId: 'anthropic', modelId: 'claude-fable-5', blocks }),
    )
    const gemini = serializeContextPromptForProvider(
      new ContextPromptCompiler().compile({ providerId: 'google', modelId: 'gemini-3.5-flash', blocks }),
    )
    const xai = serializeContextPromptForProvider(
      new ContextPromptCompiler().compile({ providerId: 'xai', modelId: 'grok-4.3', blocks }),
    )

    expect(anthropic.kind).toBe('anthropic-messages')
    expect(JSON.stringify(anthropic.payload)).toContain('"type":"image"')
    expect(gemini.kind).toBe('gemini-interactions')
    expect(JSON.stringify(gemini.payload)).toContain('fileData')
    expect(xai.kind).toBe('xai-chat')
    expect(JSON.stringify(xai.payload)).toContain('image_url')
  })

  it('collapses to text when the compiled prompt has no image parts', () => {
    const compiled = new ContextPromptCompiler().compile({
      modelSpec: {
        providerId: 'custom',
        modelId: 'text-only-xl',
        inputModalities: ['text'],
      },
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })

    const serialized = serializeContextPromptForProvider(compiled)

    expect(serialized.kind).toBe('text')
    expect(serialized.imageBindings).toHaveLength(0)
    expect(JSON.stringify(serialized.payload)).toContain('target model has no usable vision lane')
  })
})
