import { describe, expect, it } from 'vitest'
import { extractPrecisionFacts, rankPrecisionFacts } from './PrecisionFacts.js'

describe('PrecisionFacts', () => {
  it('ranks paths, hashes, commands, and ids above lower-value counts and symbols', () => {
    const ranked = rankPrecisionFacts([
      { kind: 'symbol', value: 'foo.bar', confidence: 0.99 },
      { kind: 'count', value: '42 tokens', confidence: 0.99 },
      { kind: 'path', value: 'src/context/PrecisionFacts.ts', confidence: 0.9 },
      { kind: 'hash', value: 'abc1234', confidence: 0.94 },
      { kind: 'command', value: 'pnpm test', confidence: 0.9 },
    ])

    expect(ranked.slice(0, 3).map((fact) => fact.kind)).toEqual(['path', 'hash', 'command'])
  })

  it('applies ranking before maxFacts truncation', () => {
    const facts = extractPrecisionFacts(
      [
        '100 tokens',
        'foo.bar',
        'src/context/PrecisionFacts.ts',
        'abc1234',
        'pnpm test',
      ].join('\n'),
      2,
    )

    expect(facts.map((fact) => fact.kind)).toEqual(['path', 'hash'])
  })
})
