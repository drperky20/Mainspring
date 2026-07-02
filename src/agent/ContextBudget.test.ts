import { describe, expect, it } from 'vitest'
import { estimateTextTokens, summarizeContextBudget } from './ContextBudget.js'
import { createContextCompressionPlan } from './ContextCompressionPlan.js'
import { buildRunContextPack } from './ContextPack.js'

describe('ContextBudget', () => {
  it('estimates text tokens and context summary conservatively', () => {
    expect(estimateTextTokens('abcd')).toBe(1)
    expect(estimateTextTokens('abcdefgh')).toBe(2)

    const summary = summarizeContextBudget({
      latestMessage: 'latest prompt '.repeat(120),
      historyMessages: ['one'.repeat(80), 'two'.repeat(80)],
      systemPrompt: 'system',
      toolCount: 2,
      maxTokens: 20,
    })

    expect(summary).toMatchObject({
      messageCount: 3,
      toolCount: 2,
      maxTokens: 256,
    })
    expect(summary.latestMessageBytes).toBeGreaterThan(0)
    expect(summary.estimatedTokens).toBeGreaterThan(0)
    expect(summary.compressionNeeded).toBe(true)
  })

  it('creates a metadata-only compression plan', () => {
    const plan = createContextCompressionPlan({
      latestMessage: 'x'.repeat(2_000),
      historyMessages: ['older'],
      maxTokens: 50,
    })

    expect(plan).toMatchObject({
      required: true,
      reason: 'over_budget',
      summaryStrategy: 'metadata-only',
    })
    expect(plan.overflowTokens).toBeGreaterThan(0)
  })

  it('builds a run context pack compatible with the protocol schema', () => {
    const pack = buildRunContextPack({
      latestMessage: 'hello',
      historyMessages: ['prior'],
      systemPrompt: 'system',
      toolCount: 1,
    })

    expect(pack).toMatchObject({
      version: 1,
      strategy: 'latest-message-inline-session-memory',
      messageCount: 2,
      delivery: {
        latestMessage: 'inline',
        history: 'session-memory',
        systemPrompt: 'inline',
        files: 'manifest-refs',
      },
      summaryStrategy: 'metadata-only',
    })
    expect(pack.contentHash).toMatch(/^[a-f0-9]{16}$/)
    expect(pack.packBytes).toBeGreaterThan(0)
  })
})
