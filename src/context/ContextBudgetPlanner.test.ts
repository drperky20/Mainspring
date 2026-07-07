import { describe, expect, it } from 'vitest'
import { ContextPromptCompiler } from './ContextPromptCompiler.js'
import {
  analyzeContextBudget,
  rankContextBudgetDowngrades,
} from './ContextBudgetPlanner.js'

function largeLog(): string {
  return Array.from(
    { length: 500 },
    (_, index) => `line ${index}: src/context/ContextBudgetPlanner.ts CTX-${index} abc1234`,
  ).join('\n')
}

describe('ContextBudgetPlanner', () => {
  it('reports blocked findings when compiled visual context exceeds supplied limits', () => {
    const compiled = new ContextPromptCompiler().compile({
      providerId: 'openai',
      modelId: 'gpt-5',
      blocks: [{ blockId: 'old-log', kind: 'tool_result', content: largeLog(), risk: 'gist' }],
    })

    const report = analyzeContextBudget(compiled, {
      maxImages: 0,
      maxVisualTokens: 1,
      maxEstimatedPromptTokens: 10,
    })

    expect(report.withinBudget).toBe(false)
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'context-images-over-limit',
      'context-visual-tokens-over-limit',
      'context-prompt-tokens-over-limit',
    ])
  })

  it('ranks image blocks that can be downgraded to recover budget', () => {
    const compiled = new ContextPromptCompiler().compile({
      providerId: 'anthropic',
      modelId: 'claude-fable-5',
      blocks: [
        { blockId: 'old-log-a', kind: 'tool_result', content: largeLog(), risk: 'gist' },
        { blockId: 'old-log-b', kind: 'tool_result', content: `${largeLog()}\n${largeLog()}`, risk: 'gist' },
      ],
    })

    const downgrades = rankContextBudgetDowngrades(compiled)

    expect(downgrades).toHaveLength(2)
    expect(downgrades[0]?.estimatedSavingsTokens).toBeLessThanOrEqual(
      downgrades[1]?.estimatedSavingsTokens ?? 0,
    )
    expect(downgrades.every((candidate) => candidate.recoverableId.startsWith('ctx_'))).toBe(true)
  })
})
