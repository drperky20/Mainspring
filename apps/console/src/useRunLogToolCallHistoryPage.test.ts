import { describe, expect, it } from 'vitest'
import { appendRunLogToolCallHistoryPage } from './useRunLogToolCallHistoryPage'

describe('appendRunLogToolCallHistoryPage', () => {
  it('keeps the first canonical row when a later page overlaps', () => {
    const first = [{
      source: 'runlog' as const,
      toolCallId: 'toolcall_1',
      runId: 'run_1',
      sessionId: 'session_1',
      agentId: 'agent_1',
      status: 'completed' as const,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:01.000Z',
    }]
    const second = [
      { ...first[0]!, status: 'failed' as const },
      {
        source: 'runlog' as const,
        toolCallId: 'toolcall_2',
        runId: 'run_2',
        sessionId: 'session_2',
        agentId: 'agent_2',
        status: 'requested' as const,
        createdAt: '2026-07-10T00:00:02.000Z',
        updatedAt: '2026-07-10T00:00:02.000Z',
      },
    ]

    expect(appendRunLogToolCallHistoryPage(first, second)).toEqual([
      first[0],
      second[1],
    ])
  })
})
