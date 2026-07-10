import { describe, expect, it } from 'vitest'
import { prependRunLogTracePage } from './useRunLogTracePage'

describe('prependRunLogTracePage', () => {
  it('keeps a chronological trace while suppressing page-boundary duplicates', () => {
    const recent = [
      { runId: 'run_1', seq: 4, type: 'run.claimed' },
      { runId: 'run_1', seq: 5, type: 'assistant.result' },
    ] as never[]
    const older = [
      { runId: 'run_1', seq: 2, type: 'input.received' },
      { runId: 'run_1', seq: 4, type: 'run.claimed' },
    ] as never[]

    expect(prependRunLogTracePage(recent, older).map((event) => event.seq)).toEqual([2, 4, 5])
  })
})
