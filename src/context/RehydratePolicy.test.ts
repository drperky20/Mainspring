import { describe, expect, it } from 'vitest'
import { ContextCodec } from './ContextCodec.js'
import { planContextRehydration } from './RehydratePolicy.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) =>
      `line ${index}: E:\\Mainspring\\src\\context\\RehydratePolicy.ts hash abc1234 command pnpm test`,
  ).join('\n')
}

describe('planContextRehydration', () => {
  it('requires rehydration for exact intents over lossy blocks', () => {
    const codec = new ContextCodec()
    const plan = codec.encodeBlocks({
      modelId: 'gpt-5',
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })

    const decisions = planContextRehydration({
      intent: 'edit',
      question: 'Patch the exact line that mentions abc1234.',
      blocks: plan.blocks,
    })

    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.urgency).toBe('required')
    expect(decisions[0]?.reasons).toContain('intent:edit')
    expect(decisions[0]?.reasons).toContain('question-demands-exactness')
  })

  it('recommends rehydration for summaries and precision facts during ordinary answers', () => {
    const codec = new ContextCodec()
    const vision = codec.encodeBlocks({
      modelId: 'claude-fable-5',
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })
    const textOnly = codec.encodeBlocks({
      profile: {
        ...vision.profile,
        id: 'no-image-test',
        maxImages: 0,
      },
      blocks: [{ blockId: 'summary', kind: 'run_history', content: largeLog(), risk: 'gist' }],
    })

    const decisions = planContextRehydration({
      intent: 'answer',
      blocks: [...vision.blocks, ...textOnly.blocks],
    })

    expect(decisions.some((decision) => decision.reasons.includes('compressed-block-has-precision-facts'))).toBe(true)
    expect(decisions.some((decision) => decision.reasons.includes('summary-is-not-source-text'))).toBe(true)
    expect(decisions.every((decision) => decision.urgency === 'recommended')).toBe(true)
  })
})
