import { describe, expect, it } from 'vitest'
import { appendAuditHistoryPage } from './useAuditHistoryPage'

describe('appendAuditHistoryPage', () => {
  it('preserves reverse page order while suppressing duplicate audit rows', () => {
    const first = [{ eventId: 'audit_3' }, { eventId: 'audit_2' }] as never[]
    const second = [{ eventId: 'audit_2' }, { eventId: 'audit_1' }] as never[]

    expect(appendAuditHistoryPage(first, second).map((event) => event.eventId)).toEqual([
      'audit_3',
      'audit_2',
      'audit_1',
    ])
  })
})
