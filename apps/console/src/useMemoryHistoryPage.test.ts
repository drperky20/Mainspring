import { describe, expect, it } from 'vitest'
import { appendMemoryHistoryPage } from './useMemoryHistoryPage'

describe('appendMemoryHistoryPage', () => {
  it('deduplicates a continued workspace memory page by entry ID', () => {
    const first = [{
      entryId: 'memory_1',
      scope: 'workspace' as const,
      textPreview: 'Newest note',
      tags: [],
      createdAt: '2026-07-10T12:03:00.000Z',
    }]
    const second = [
      {
        entryId: 'memory_1',
        scope: 'workspace' as const,
        textPreview: 'Newest note',
        tags: [],
        createdAt: '2026-07-10T12:03:00.000Z',
      },
      {
        entryId: 'memory_2',
        scope: 'session' as const,
        sessionId: 'session_memory_history',
        textPreview: 'Older note',
        tags: ['session'],
        createdAt: '2026-07-10T12:02:00.000Z',
      },
    ]

    expect(appendMemoryHistoryPage(first, second).map((entry) => entry.entryId)).toEqual([
      'memory_1',
      'memory_2',
    ])
  })
})
