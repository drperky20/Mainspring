import { describe, expect, it } from 'vitest'
import { appendUsageHistoryPage } from './useUsageHistoryPage'

describe('appendUsageHistoryPage', () => {
  it('preserves reverse page order while suppressing duplicate ledger rows', () => {
    const first = [{ entryId: 'usage_3' }, { entryId: 'usage_2' }] as never[]
    const second = [{ entryId: 'usage_2' }, { entryId: 'usage_1' }] as never[]

    expect(appendUsageHistoryPage(first, second).map((entry) => entry.entryId)).toEqual([
      'usage_3',
      'usage_2',
      'usage_1',
    ])
  })
})
