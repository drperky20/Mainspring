import { describe, expect, it } from 'vitest'
import { appendRunLogActivityPage } from './useRunLogActivityPage'

describe('appendRunLogActivityPage', () => {
  it('keeps page ordering while suppressing duplicate run rows', () => {
    const first = [{ runId: 'run_3' }, { runId: 'run_2' }] as never[]
    const second = [{ runId: 'run_2' }, { runId: 'run_1' }] as never[]

    expect(appendRunLogActivityPage(first, second).map((run) => run.runId)).toEqual([
      'run_3',
      'run_2',
      'run_1',
    ])
  })
})
