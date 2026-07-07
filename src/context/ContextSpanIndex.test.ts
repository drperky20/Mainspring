import { describe, expect, it } from 'vitest'
import { buildContextSpanIndex } from './ContextSpanIndex.js'
import { InMemoryRecoverableContextStore } from './RecoverableContextStore.js'

describe('buildContextSpanIndex', () => {
  it('builds line anchors with byte spans for text records', () => {
    const store = new InMemoryRecoverableContextStore()
    const record = store.put({
      blockId: 'text',
      sourceKind: 'tool_result',
      content: 'alpha\nbravo\ncharlie',
    })

    const index = buildContextSpanIndex(record)

    expect(index.lineCount).toBe(3)
    expect(index.lines?.[1]).toMatchObject({
      line: 2,
      startByte: 6,
      endByte: 11,
      preview: 'bravo',
    })
  })

  it('returns only byte-level metadata for binary records', () => {
    const store = new InMemoryRecoverableContextStore()
    const record = store.put({
      blockId: 'binary',
      sourceKind: 'file',
      content: new Uint8Array([0, 1, 2]),
      mediaType: 'application/octet-stream',
    })

    const index = buildContextSpanIndex(record)

    expect(index.mediaType).toBe('application/octet-stream')
    expect(index.lines).toBeUndefined()
    expect(index.lineCount).toBeUndefined()
  })
})
