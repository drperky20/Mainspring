import { describe, expect, it } from 'vitest'
import { appendApprovalHistoryPage } from './useApprovalHistoryPage'

describe('appendApprovalHistoryPage', () => {
  it('keeps reverse-chronological page ordering while suppressing duplicate mirrors', () => {
    const first = [
      { approvalId: 'approval_3', source: 'runlog' },
      { approvalId: 'approval_2', source: 'compatibility' },
    ] as never[]
    const second = [
      { approvalId: 'approval_2', source: 'runlog' },
      { approvalId: 'approval_1', source: 'compatibility' },
    ] as never[]

    expect(appendApprovalHistoryPage(first, second).map((approval) => approval.approvalId)).toEqual([
      'approval_3',
      'approval_2',
      'approval_1',
    ])
  })
})
