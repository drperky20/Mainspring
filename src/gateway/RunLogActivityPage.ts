import {
  consoleRunLogRun,
  type ConsoleGatewayRunLogRun,
} from './ConsoleSnapshotAdapter.js'
import type { LocalGatewayRunLogRunProjection } from './LocalGateway.js'
import type {
  RunListCursor,
  RunLogEvent,
  RunRecord as RunLogRunRecord,
} from '../core/types.js'

/** Keep enough recent canonical activity to render an operator run row. */
export const RUNLOG_ACTIVITY_EVENT_TAIL = 64

export type RunLogActivityPageSource = {
  list(input?: {
    sessionId?: string
    before?: RunListCursor
    limit?: number
  }): RunLogRunRecord[]
  projectSummary(runId: string, limit?: number): LocalGatewayRunLogRunProjection
}

export type RunLogTracePageSource = {
  get(runId: string): RunLogRunRecord | null
  events(input: {
    runId: string
    afterSeq?: number
    beforeSeq?: number
    order?: 'asc' | 'desc'
    visibility?: RunLogEvent['visibility'] | RunLogEvent['visibility'][]
    limit?: number
  }): RunLogEvent[]
}

export type RunLogActivityPage = {
  runs: ConsoleGatewayRunLogRun[]
  nextCursor?: RunListCursor
}

export type PublicRunLogEvent = Pick<
  RunLogEvent,
  'eventId' | 'seq' | 'runId' | 'sessionId' | 'agentId' | 'type' | 'timestamp'
> & {
  visibility: 'public'
  payload?: unknown
}

export type RunLogTracePage = {
  sessionId: string
  runId: string
  events: PublicRunLogEvent[]
  nextCursor?: Pick<RunLogEvent, 'seq'>
}

/**
 * Bounded canonical activity feed. It knows only the RunLog read surface and
 * the console-safe summary projection; HTTP parsing, authorization, and
 * response transport remain with the local gateway server.
 */
export function listRunLogActivityPage(
  source: RunLogActivityPageSource,
  input: {
    sessionId?: string
    before?: RunListCursor
    limit: number
  },
): RunLogActivityPage {
  const records = source.list({
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.before ? { before: input.before } : {}),
    limit: input.limit + 1,
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)
  return {
    runs: page.map((record) =>
      consoleRunLogRun(source.projectSummary(record.runId, RUNLOG_ACTIVITY_EVENT_TAIL)),
    ),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.createdAt, runId: last.runId } }
      : {}),
  }
}

/**
 * Reads a reverse-paginated trace while enforcing the browser's public-event
 * boundary a second time. The store query is the primary filter; the local
 * filter prevents an accidental source regression from serializing a hidden
 * event into an operator response.
 */
export function readRunLogTracePage(
  source: RunLogTracePageSource,
  input: {
    runId: string
    beforeSeq?: number
    limit: number
  },
): RunLogTracePage | undefined {
  const run = source.get(input.runId)
  if (!run) return undefined
  const records = source.events({
    runId: input.runId,
    ...(input.beforeSeq ? { beforeSeq: input.beforeSeq } : {}),
    order: 'desc',
    visibility: 'public',
    limit: input.limit + 1,
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const oldest = page.at(-1)
  return {
    sessionId: run.sessionId,
    runId: input.runId,
    events: page
      .flatMap((event) => {
        const browserEvent = publicRunLogEvent(event)
        return browserEvent ? [browserEvent] : []
      })
      .reverse(),
    ...(hasMore && oldest ? { nextCursor: { seq: oldest.seq } } : {}),
  }
}

/** Returns a browser-safe event only when the record is explicitly public. */
export function publicRunLogEvent(event: RunLogEvent): PublicRunLogEvent | undefined {
  if (event.visibility !== 'public') return undefined
  return {
    eventId: event.eventId,
    seq: event.seq,
    runId: event.runId,
    sessionId: event.sessionId,
    agentId: event.agentId,
    type: event.type,
    timestamp: event.timestamp,
    visibility: 'public',
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
  }
}
