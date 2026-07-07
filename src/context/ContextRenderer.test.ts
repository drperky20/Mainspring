import { describe, expect, it } from 'vitest'
import {
  ContextRendererRegistry,
  createDeterministicSvgContextRenderer,
} from './ContextRenderer.js'
import { ContextCodec } from './ContextCodec.js'
import { selectVisionModelProfile } from './ModelProfiles.js'
import { InMemoryRecoverableContextStore } from './RecoverableContextStore.js'
import type { ContextImageProjection } from './types.js'

const projection: ContextImageProjection = {
  level: 'dense',
  width: 800,
  height: 600,
  detail: 'high',
  visualTokens: 500,
  renderer: 'external-rasterizer',
  canary: 'MSCTX:test',
  charsPerVisualToken: 22,
}

describe('ContextRendererRegistry', () => {
  it('routes a recoverable context record to a supporting renderer', async () => {
    const store = new InMemoryRecoverableContextStore()
    const record = store.put({
      blockId: 'old-log',
      sourceKind: 'tool_result',
      content: 'render me',
    })
    const registry = new ContextRendererRegistry()
    registry.register({
      id: 'test-renderer',
      supports: (candidate) => candidate.level === 'dense',
      render: async (request) => ({
        recoverableId: request.recoverableId,
        canary: request.projection.canary,
        width: request.projection.width,
        height: request.projection.height,
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
        rendererId: 'test-renderer',
        fontId: 'test-font',
        density: request.projection.level,
      }),
    })

    const artifact = await registry.render({
      store,
      recoverableId: record.recoverableId,
      projection,
    })

    expect(registry.list()).toEqual(['test-renderer'])
    expect(artifact.recoverableId).toBe(record.recoverableId)
    expect(artifact.canary).toBe('MSCTX:test')
    expect(artifact.bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('fails closed when no renderer supports the projection', async () => {
    const store = new InMemoryRecoverableContextStore()
    const record = store.put({
      blockId: 'old-log',
      sourceKind: 'tool_result',
      content: 'render me',
    })
    const registry = new ContextRendererRegistry()

    await expect(
      registry.render({ store, recoverableId: record.recoverableId, projection }),
    ).rejects.toThrow('No context renderer registered')
  })

  it('renders deterministic SVG context artifacts with canaries and source metadata', async () => {
    const store = new InMemoryRecoverableContextStore()
    const record = store.put({
      blockId: 'old-log',
      sourceKind: 'tool_result',
      content: 'first line\nsecond line',
    })
    const registry = new ContextRendererRegistry()
    registry.register(createDeterministicSvgContextRenderer())

    const artifact = await registry.render({
      store,
      recoverableId: record.recoverableId,
      projection,
    })

    const svg = Buffer.from(artifact.bytes).toString('utf8')
    expect(artifact.mediaType).toBe('image/svg+xml')
    expect(artifact.rendererId).toBe('mainspring-svg-text-v1')
    expect(artifact.fontId).toBe('monospace-svg-v1')
    expect(svg).toContain('MSCTX:test')
    expect(svg).toContain('first line')
  })

  it('renders later pages from wrapped long lines instead of blank raw-line slices', async () => {
    const store = new InMemoryRecoverableContextStore()
    const codec = new ContextCodec({
      store,
      imagePageTextChars: 1000,
      maxImagePagesPerBlock: 2,
    })
    const encoded = codec.encodeBlock({
      profile: {
        ...selectVisionModelProfile('gpt-5'),
        id: 'two-page-test',
        maxImages: 2,
      },
      block: { blockId: 'one-line', kind: 'tool_result', content: 'a'.repeat(20_000), risk: 'gist' },
      imageSlotsRemaining: 2,
    })
    const secondPage = encoded.imagePages?.[1]
    expect(secondPage).toBeTruthy()
    const registry = new ContextRendererRegistry()
    registry.register(createDeterministicSvgContextRenderer())

    const artifact = await registry.render({
      store,
      recoverableId: encoded.recoverableId,
      projection: secondPage!,
    })
    const svg = Buffer.from(artifact.bytes).toString('utf8')

    expect(svg).toContain('aaaaaaaaaaaaaaaa')
    expect(artifact.metadata?.renderedLines).toBeGreaterThan(0)
  })
})
