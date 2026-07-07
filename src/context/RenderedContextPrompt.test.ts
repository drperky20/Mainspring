import { describe, expect, it } from 'vitest'
import { ContextPromptCompiler } from './ContextPromptCompiler.js'
import {
  ContextRendererRegistry,
  createDeterministicSvgContextRenderer,
} from './ContextRenderer.js'
import { InMemoryRecoverableContextStore } from './RecoverableContextStore.js'
import { serializeRenderedContextPromptForProvider } from './RenderedContextPrompt.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) => `line ${index}: src/context/RenderedContextPrompt.ts CTX-${index} abc1234`,
  ).join('\n')
}

describe('serializeRenderedContextPromptForProvider', () => {
  it('renders image projections and attaches provider payload image data URIs', async () => {
    const store = new InMemoryRecoverableContextStore()
    const compiled = new ContextPromptCompiler({ store }).compile({
      providerId: 'openai',
      modelId: 'gpt-5',
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })
    const rendererRegistry = new ContextRendererRegistry()
    rendererRegistry.register(createDeterministicSvgContextRenderer())

    const bundle = await serializeRenderedContextPromptForProvider({
      compiled,
      store,
      rendererRegistry,
    })

    expect(bundle.renderedImages.length).toBeGreaterThan(0)
    expect(bundle.renderedImages[0]?.artifact.mediaType).toBe('image/svg+xml')
    expect(bundle.payload.imageBindings[0]?.uri).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(JSON.stringify(bundle.payload.payload)).toContain('data:image/svg+xml;base64')
  })

  it('binds each paginated image part to its own rendered page', async () => {
    const store = new InMemoryRecoverableContextStore()
    const compiled = new ContextPromptCompiler({
      store,
      imagePageTextChars: 1000,
      maxImagePagesPerBlock: 3,
    }).compile({
      modelSpec: {
        providerId: 'openai',
        modelId: 'gpt-5',
        inputModalities: ['text', 'image'],
        maxImages: 3,
      },
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })
    const rendererRegistry = new ContextRendererRegistry()
    rendererRegistry.register(createDeterministicSvgContextRenderer())

    const bundle = await serializeRenderedContextPromptForProvider({
      compiled,
      store,
      rendererRegistry,
    })

    expect(bundle.renderedImages).toHaveLength(3)
    expect(new Set(bundle.payload.imageBindings.map((binding) => binding.uri)).size).toBe(3)
  })
})
