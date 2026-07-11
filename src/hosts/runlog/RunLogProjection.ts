import type { RunLogEvent, RunLogStore, RunRecord, RunStatus } from '../../core/types.js'
import type { DecisionRecord } from '../../policy/DecisionRecord.js'
import { RunLogProjector } from './RunLogProjector.js'

export interface RunLogRunProjection {
  run: RunRecord
  events: RunLogEvent[]
  eventCount: number
  status: RunStatus
  assistantText: string
  checkpoints: Array<{
    eventId: string
    seq: number
    kind?: string
    payload: unknown
  }>
  pendingApprovals: Array<{
    approvalId?: string
    toolCallId?: string
    payload: unknown
  }>
  approvalDecisions: Array<{
    approvalId?: string
    receiptId?: string
    decision: 'approved' | 'denied'
    payload: unknown
  }>
  toolCalls: Array<{
    toolCallId?: string
    name?: string
    status: 'requested' | 'updated' | 'completed' | 'failed' | 'blocked'
    payload: unknown
  }>
  policyDecisions: DecisionRecord[]
  artifacts: unknown[]
  usage: unknown[]
  contextEncodings: unknown[]
  errors: Array<{
    eventId: string
    seq: number
    type: 'runtime.error' | 'run.failed'
    message?: string
    payload: unknown
  }>
  latestSeq: number
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const RUN_EVENT_PAGE_SIZE = 1_000

function listAllRunEvents(store: RunLogStore, runId: string): RunLogEvent[] {
  const events: RunLogEvent[] = []
  let afterSeq = 0
  while (true) {
    const page = store.listEvents({ runId, afterSeq, limit: RUN_EVENT_PAGE_SIZE })
    if (page.length === 0) break
    events.push(...page)
    const nextSeq = page.at(-1)?.seq ?? afterSeq
    if (nextSeq <= afterSeq) {
      throw new Error(`RunLog event pagination did not advance for run ${runId}.`)
    }
    afterSeq = nextSeq
    if (page.length < RUN_EVENT_PAGE_SIZE) break
  }
  return events
}

function visibleEvents(events: RunLogEvent[], limit?: number): RunLogEvent[] {
  if (limit === undefined) return events
  const normalized = Math.floor(limit)
  if (!Number.isFinite(normalized) || normalized <= 0) return []
  return events.slice(-normalized)
}

function boundedRunEventTail(store: RunLogStore, runId: string, latestSeq: number, limit: number): RunLogEvent[] {
  return store.listEvents({
    runId,
    beforeSeq: latestSeq + 1,
    order: 'desc',
    limit,
  }).reverse()
}

export function projectRunLogRun(input: {
  store: RunLogStore
  runId: string
  limit?: number
}): RunLogRunProjection {
  const run = input.store.getRun(input.runId)
  if (!run) throw new Error(`Unknown run: ${input.runId}`)
  const projector = new RunLogProjector(input.store)
  projector.catchUpUntilIdle()
  const summary = projector.summary(input.runId)
  const allEvents = input.limit === undefined
    ? listAllRunEvents(input.store, input.runId)
    : boundedRunEventTail(input.store, input.runId, summary?.latestSeq ?? input.store.latestEventSeq(input.runId), input.limit)
  const events = visibleEvents(allEvents, input.limit)
  let assistantText = summary?.assistantText ?? ''
  const pendingApprovals: RunLogRunProjection['pendingApprovals'] = []
  const approvalDecisions: RunLogRunProjection['approvalDecisions'] = []
  const resolvedApprovals = new Set<string>()
  const toolCalls: RunLogRunProjection['toolCalls'] = []
  const checkpoints: RunLogRunProjection['checkpoints'] = []
  const policyDecisions: DecisionRecord[] = []
  const artifacts: unknown[] = []
  const usage: unknown[] = []
  const contextEncodings: unknown[] = []
  const errors: RunLogRunProjection['errors'] = []

  for (const event of allEvents) {
    const payload = payloadRecord(event.payload)
    if (!summary && event.type === 'assistant.delta') {
      assistantText += typeof payload.text === 'string' ? payload.text : ''
    }
    if (!summary && event.type === 'assistant.result' && typeof payload.text === 'string') {
      assistantText = payload.text
    }
    if (event.type === 'approval.requested') {
      pendingApprovals.push({
        approvalId: typeof payload.approvalId === 'string' ? payload.approvalId : undefined,
        toolCallId: typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined,
        payload: event.payload,
      })
    }
    if (
      event.type === 'approval.approved'
      || event.type === 'approval.denied'
      || event.type === 'approval.cancelled'
    ) {
      const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId : undefined
      if (approvalId) resolvedApprovals.add(approvalId)
      if (event.type !== 'approval.cancelled') {
        approvalDecisions.push({
          approvalId,
          receiptId: typeof payload.receiptId === 'string' ? payload.receiptId : undefined,
          decision: event.type === 'approval.approved' ? 'approved' : 'denied',
          payload: event.payload,
        })
      }
    }
    if (event.type.startsWith('tool.call.')) {
      const status = event.type.slice('tool.call.'.length)
      toolCalls.push({
        toolCallId: typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        status:
          status === 'updated' || status === 'completed' || status === 'failed' || status === 'blocked'
            ? status
            : 'requested',
        payload: event.payload,
      })
    }
    if (event.type === 'policy.decision.recorded') {
      policyDecisions.push(event.payload as DecisionRecord)
    }
    if (event.type === 'checkpoint.saved') {
      checkpoints.push({
        eventId: event.eventId,
        seq: event.seq,
        kind: typeof payload.kind === 'string' ? payload.kind : undefined,
        payload: event.payload,
      })
    }
    if (event.type === 'artifact.created') artifacts.push(event.payload)
    if (event.type === 'usage.reported') usage.push(event.payload)
    if (event.type === 'context.encoded') contextEncodings.push(event.payload)
    if (event.type === 'runtime.error' || event.type === 'run.failed') {
      errors.push({
        eventId: event.eventId,
        seq: event.seq,
        type: event.type,
        message: typeof payload.message === 'string' ? payload.message : undefined,
        payload: event.payload,
      })
    }
  }

  return {
    run,
    events,
    eventCount: summary?.eventCount ?? input.store.countEvents({ runId: input.runId }),
    status: summary?.status ?? run.status,
    assistantText,
    pendingApprovals: run.status === 'awaiting_approval'
      ? pendingApprovals.filter(
          (approval) => !approval.approvalId || !resolvedApprovals.has(approval.approvalId),
        )
      : [],
    approvalDecisions,
    toolCalls,
    checkpoints,
    policyDecisions,
    artifacts,
    usage,
    contextEncodings,
    errors,
    latestSeq: summary?.latestSeq ?? input.store.latestEventSeq(input.runId),
  }
}
