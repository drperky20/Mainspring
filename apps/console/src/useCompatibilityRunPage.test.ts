import { describe, expect, it } from 'vitest'
import { appendCompatibilityRunPage } from './useCompatibilityRunPage'

describe('appendCompatibilityRunPage', () => {
  it('keeps descending history pages while suppressing repeated compatibility rows', () => {
    const first = [{ runId: 'run_3' }, { runId: 'run_2' }] as never[]
    const second = [{ runId: 'run_2' }, { runId: 'run_1' }] as never[]

    expect(appendCompatibilityRunPage(first, second).map((run) => run.runId)).toEqual([
      'run_3',
      'run_2',
      'run_1',
    ])
  })
})
