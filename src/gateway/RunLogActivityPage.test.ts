import { describe, expect, it } from 'vitest'
import type {
  RunLogEvent,
  RunRecord as RunLogRunRecord,
} from '../core/types.js'
import type { LocalGatewayRunLogRunProjection } from './LocalGateway.js'
import {
  listRunLogActivityPage,
  readRunLogTracePage,
  RUNLOG_ACTIVITY_EVENT_TAIL,
} from './RunLogActivityPage.js'

function runRecord(runId: string, createdAt: string): RunLogRunRecord {
  return {
    runId,
    agentId: 'runlog-page-agent',
    sessionId: 'runlog-page-session',
    status: 'completed',
    input: `private input for ${runId}`,
    createdAt,
    updatedAt: createdAt,
  }
}

function runSummary(run: RunLogRunRecord): LocalGatewayRunLogRunProjection {
  return {
    runId: run.runId,
    sessionId: run.sessionId,
    agentId: run.agentId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    assistantText: `safe assistant result for ${run.runId}`,
    latestSeq: 4,
    eventCount: 4,
    pendingApprovals: [],
    approvalDecisions: [],
    toolCalls: [],
    checkpoints: [],
    policyDecisions: [],
    errors: [],
  }
}

function runEvent(
  seq: number,
  visibility: RunLogEvent['visibility'],
  payload: Record<string, string>,
): RunLogEvent<Record<string, string>> {
  return {
    eventId: `event_${seq}`,
    seq,
    runId: 'run_trace',
    sessionId: 'runlog-page-session',
    agentId: 'runlog-page-agent',
    type: 'runtime.warning',
    timestamp: `2026-07-10T12:00:0${seq}.000Z`,
    visibility,
    payload,
  }
}

describe('RunLog activity and trace page readers', () => {
  it('projects a bounded canonical activity page with a stable cursor', () => {
    const records = [
      runRecord('run_newest', '2026-07-10T12:03:00.000Z'),
      runRecord('run_middle', '2026-07-10T12:02:00.000Z'),
      runRecord('run_oldest', '2026-07-10T12:01:00.000Z'),
    ]
    const listCalls: Array<{ limit?: number }> = []
    const summaryCalls: Array<[string, number | undefined]> = []
    const source = {
      list: (input: { before?: { createdAt: string; runId: string }; limit?: number } = {}) => {
        listCalls.push(input)
        return records
          .filter((record) => !input.before
            || record.createdAt < input.before.createdAt
            || (
              record.createdAt === input.before.createdAt
              && record.runId < input.before.runId
            ))
          .slice(0, input.limit)
      },
      projectSummary: (runId: string, limit?: number) => {
        summaryCalls.push([runId, limit])
        const run = records.find((record) => record.runId === runId)
        if (!run) throw new Error(`Unknown test run: ${runId}`)
        return runSummary(run)
      },
    }

    const first = listRunLogActivityPage(source, { limit: 2 })
    expect(first.runs.map((run) => run.runId)).toEqual(['run_newest', 'run_middle'])
    expect(first.nextCursor).toEqual({
      createdAt: '2026-07-10T12:02:00.000Z',
      runId: 'run_middle',
    })
    expect(listCalls).toEqual([{ limit: 3 }])
    expect(summaryCalls).toEqual([
      ['run_newest', RUNLOG_ACTIVITY_EVENT_TAIL],
      ['run_middle', RUNLOG_ACTIVITY_EVENT_TAIL],
    ])
    expect(JSON.stringify(first)).not.toContain('private input')

    const second = listRunLogActivityPage(source, {
      limit: 2,
      before: first.nextCursor,
    })
    expect(second.runs.map((run) => run.runId)).toEqual(['run_oldest'])
    expect(second.nextCursor).toBeUndefined()
  })

  it('defensively excludes non-public trace events even if a source returns one', () => {
    const events = [
      runEvent(6, 'public', { label: 'public-six' }),
      runEvent(5, 'sensitive', { secret: 'must-not-cross-the-browser-boundary' }),
      runEvent(4, 'public', { label: 'public-four' }),
      runEvent(3, 'public', { label: 'public-three' }),
    ]
    const eventCalls: Array<Record<string, unknown>> = []
    const source = {
      get: (runId: string) => runId === 'run_trace'
        ? runRecord(runId, '2026-07-10T12:00:00.000Z')
        : null,
      events: (input: {
        beforeSeq?: number
        limit?: number
      }) => {
        eventCalls.push(input)
        return events
          .filter((event) => !input.beforeSeq || event.seq < input.beforeSeq)
          .slice(0, input.limit)
      },
    }

    const first = readRunLogTracePage(source, { runId: 'run_trace', limit: 2 })
    expect(first).toMatchObject({
      runId: 'run_trace',
      events: [expect.objectContaining({ seq: 6, visibility: 'public' })],
      nextCursor: { seq: 5 },
    })
    expect(JSON.stringify(first)).not.toContain('must-not-cross-the-browser-boundary')
    expect(eventCalls).toEqual([
      { runId: 'run_trace', order: 'desc', visibility: 'public', limit: 3 },
    ])

    const second = readRunLogTracePage(source, {
      runId: 'run_trace',
      limit: 2,
      beforeSeq: first?.nextCursor?.seq,
    })
    expect(second?.events.map((event) => event.seq)).toEqual([3, 4])
    expect(second?.nextCursor).toBeUndefined()
  })
})
