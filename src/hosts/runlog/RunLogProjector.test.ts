import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteRunLogStore } from '../../adapters/sqlite/SqliteRunLogStore.js'
import { projectRunLogRun } from './RunLogProjection.js'
import { RunLogProjector } from './RunLogProjector.js'

const roots: string[] = []
const stores: SqliteRunLogStore[] = []

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-runlog-projector-'))
  roots.push(root)
  const dbPath = path.join(root, 'runlog.sqlite')
  const store = new SqliteRunLogStore({ dbPath })
  stores.push(store)
  store.initialize()
  store.putAgent({ agentId: 'agent_projection', instructions: 'Project events.' })
  const run = store.createQueuedRun({ agentId: 'agent_projection', input: 'project' }, {
    agentId: 'agent_projection',
    instructions: 'Project events.',
  })
  return { root, dbPath, store, run }
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})
describe('RunLogProjector', () => {
  it('projects five thousand historical events then only the next three events', () => {
    const { store, run } = setup()
    for (let index = 0; index < 5_000; index += 1) {
      store.appendEvent({
        runId: run.runId,
        type: 'runtime.warning',
        payload: { message: `historical warning ${index}` },
      })
    }
    const projector = new RunLogProjector(store)
    const initial = projector.catchUp(6_000)
    const firstSummary = projector.summary(run.runId)

    expect(initial.processedEvents).toBe(5_003)
    expect(firstSummary).toMatchObject({ eventCount: 5_003, status: 'queued' })
    expect(projector.catchUp()).toMatchObject({ processedEvents: 0, lastSeq: initial.lastSeq })

    store.appendEvent({ runId: run.runId, type: 'assistant.delta', payload: { text: 'done ' } })
    store.appendEvent({ runId: run.runId, type: 'assistant.result', payload: { text: 'done now' } })
    store.appendEvent({ runId: run.runId, type: 'run.completed', payload: {} })

    const incremental = projector.catchUp()
    const projection = projectRunLogRun({ store, runId: run.runId, limit: 3 })

    expect(incremental.processedEvents).toBe(3)
    expect(projector.summary(run.runId)).toMatchObject({
      eventCount: 5_006,
      status: 'completed',
      assistantText: 'done now',
    })
    expect(projection).toMatchObject({
      eventCount: 5_006,
      status: 'completed',
      assistantText: 'done now',
    })
    expect(projection.events).toHaveLength(3)
    expect(projection.events.map((event) => event.type)).toEqual([
      'assistant.delta',
      'assistant.result',
      'run.completed',
    ])
  }, 90_000)

  it('persists the cursor across restart and does not reapply already projected events', () => {
    const { dbPath, store, run } = setup()
    store.appendEvent({ runId: run.runId, type: 'assistant.result', payload: { text: 'first' } })
    const projector = new RunLogProjector(store)
    expect(projector.catchUp()).toMatchObject({ processedEvents: 4 })
    store.close()
    stores.splice(stores.indexOf(store), 1)

    const reopened = new SqliteRunLogStore({ dbPath })
    stores.push(reopened)
    reopened.initialize()
    const resumed = new RunLogProjector(reopened)

    expect(resumed.catchUp()).toMatchObject({ processedEvents: 0 })
    expect(resumed.summary(run.runId)).toMatchObject({ eventCount: 4, assistantText: 'first' })
    reopened.appendEvent({ runId: run.runId, type: 'assistant.result', payload: { text: 'second' } })
    expect(resumed.catchUp()).toMatchObject({ processedEvents: 1 })
    expect(resumed.summary(run.runId)).toMatchObject({ eventCount: 5, assistantText: 'second' })
  })

  it('builds a restart-safe global tool-call projection without copying event payloads', () => {
    const { dbPath, store, run } = setup()
    const agent = store.getAgent('agent_projection')
    if (!agent) throw new Error('Projection test agent was not initialized.')
    const secondRun = store.createQueuedRun({
      agentId: agent.agentId,
      input: 'project another tool call',
      workspaceId: 'workspace_projection_two',
    }, agent)
    store.appendEvent({
      runId: run.runId,
      type: 'tool.call.requested',
      payload: {
        toolCallId: 'tool_shared',
        name: 'file.write',
        input: { privateInput: 'must remain only in the event stream' },
      },
    })
    store.appendEvent({
      runId: secondRun.runId,
      type: 'tool.call.requested',
      payload: { toolCallId: 'tool_shared', name: 'browser.open' },
    })
    store.appendEvent({
      runId: secondRun.runId,
      type: 'tool.call.updated',
      payload: { toolCallId: 'tool_shared', name: 'browser.open' },
    })
    store.appendEvent({
      runId: secondRun.runId,
      type: 'tool.call.blocked',
      payload: { toolCallId: 'tool_blocked', name: 'shell.exec', reasons: ['policy'] },
    })
    store.appendEvent({
      runId: run.runId,
      type: 'tool.call.completed',
      payload: {
        toolCallId: 'tool_shared',
        name: 'file.write',
        output: { privateOutput: 'must remain only in the event stream' },
      },
    })

    const projector = new RunLogProjector(store)
    expect(projector.catchUpToolCalls(100)).toMatchObject({
      projectionName: 'tool-call-summary-v1',
      processedEvents: 11,
    })
    const firstPage = store.listRunToolCallSummaries({ limit: 2 })
    const secondPage = store.listRunToolCallSummaries({
      before: { latestSeq: firstPage.at(-1)?.latestSeq ?? 0 },
      limit: 2,
    })
    const summaries = [...firstPage, ...secondPage]

    expect(summaries).toHaveLength(3)
    expect(new Set(summaries.map((summary) => [summary.runId, summary.toolCallId].join(':')))).toEqual(
      new Set([
        [run.runId, 'tool_shared'].join(':'),
        [secondRun.runId, 'tool_shared'].join(':'),
        [secondRun.runId, 'tool_blocked'].join(':'),
      ]),
    )
    expect(summaries.find((summary) => summary.runId === run.runId && summary.toolCallId === 'tool_shared'))
      .toMatchObject({ status: 'completed', toolName: 'file.write' })
    expect(summaries.find((summary) => summary.toolCallId === 'tool_blocked'))
      .toMatchObject({
        status: 'blocked',
        workspaceId: 'workspace_projection_two',
      })
    expect(projectRunLogRun({ store, runId: secondRun.runId }).toolCalls
      .filter((toolCall) => toolCall.toolCallId === 'tool_shared')
      .at(-1))
      .toMatchObject({ status: 'updated' })
    expect(JSON.stringify(summaries)).not.toContain('privateInput')
    expect(JSON.stringify(summaries)).not.toContain('privateOutput')

    store.close()
    stores.splice(stores.indexOf(store), 1)
    const reopened = new SqliteRunLogStore({ dbPath })
    stores.push(reopened)
    reopened.initialize()
    const resumed = new RunLogProjector(reopened)
    expect(resumed.catchUpToolCalls()).toMatchObject({
      projectionName: 'tool-call-summary-v1',
      processedEvents: 0,
    })
    reopened.appendEvent({
      runId: secondRun.runId,
      type: 'tool.call.failed',
      payload: { toolCallId: 'tool_blocked', name: 'shell.exec', message: 'host-only detail' },
    })
    expect(resumed.catchUpToolCalls()).toMatchObject({
      projectionName: 'tool-call-summary-v1',
      processedEvents: 1,
    })
    expect(reopened.listRunToolCallSummaries({
      runId: secondRun.runId,
      status: 'failed',
    })).toHaveLength(1)
  })

  it('projects normalized usage facts with provider attribution and restart-safe paging', () => {
    const { dbPath, store, run } = setup()
    store.appendEvent({
      runId: run.runId,
      type: 'provider.init',
      payload: {
        provider: 'provider_from_init',
        modelId: 'model_from_init',
        modelFamily: 'family_from_init',
        providerTransport: 'transport_from_init',
        providerSessionId: 'init_session_not_projected',
      },
    })
    const usageEvent = store.appendEvent({
      runId: run.runId,
      type: 'usage.reported',
      payload: {
        usage: {
          inputTokens: 7,
          outputTokens: 4,
          totalTokens: 11,
          cacheReadTokens: 2,
          cacheWriteTokens: 1,
          reasoningTokens: 3,
          rateLimit: {
            provider: 'provider_from_init',
            capturedAt: '2026-07-11T00:00:01.000Z',
            requestsMinute: { limit: 10, remaining: 9, resetSeconds: 42.5 },
          },
        },
        providerSessionId: 'usage_session_1',
        privatePayload: 'must remain only in the event stream',
      },
    })
    store.appendEvent({
      runId: run.runId,
      type: 'runtime.warning',
      payload: { message: 'not a usage row' },
    })

    const projector = new RunLogProjector(store)
    expect(projector.catchUpUsage(100)).toMatchObject({
      projectionName: 'usage-summary-v1',
      processedEvents: 6,
    })
    const summaries = store.listRunUsageSummaries()
    expect(summaries).toEqual([
      expect.objectContaining({
        eventId: usageEvent.eventId,
        runId: run.runId,
        sessionId: run.sessionId,
        agentId: run.agentId,
        providerId: 'provider_from_init',
        modelId: 'model_from_init',
        modelFamily: 'family_from_init',
        providerTransport: 'transport_from_init',
        providerSessionId: 'usage_session_1',
        inputTokens: 7,
        outputTokens: 4,
        totalTokens: 11,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        reasoningTokens: 3,
        rateLimit: {
          provider: 'provider_from_init',
          capturedAt: '2026-07-11T00:00:01.000Z',
          requestsMinute: { limit: 10, remaining: 9, resetSeconds: 42.5 },
        },
      }),
    ])
    expect(JSON.stringify(summaries)).not.toContain('privatePayload')
    expect(store.listRunUsageSummaries({ providerId: 'provider_from_init', limit: 1 })).toHaveLength(1)
    expect(store.listRunUsageSummaries({ before: { latestSeq: usageEvent.seq } })).toEqual([])

    store.close()
    stores.splice(stores.indexOf(store), 1)
    const reopened = new SqliteRunLogStore({ dbPath })
    stores.push(reopened)
    reopened.initialize()
    const resumed = new RunLogProjector(reopened)
    expect(resumed.catchUpUsage()).toMatchObject({
      projectionName: 'usage-summary-v1',
      processedEvents: 0,
    })
    reopened.appendEvent({
      runId: run.runId,
      type: 'usage.reported',
      payload: { usage: { provider: 'provider_next', modelId: 'model_next', totalTokens: 2 } },
    })
    expect(resumed.catchUpUsage()).toMatchObject({ processedEvents: 1 })
    expect(reopened.listRunUsageSummaries({ providerId: 'provider_next' })).toHaveLength(1)
  })

  it('migrates the v2 projection schema with a durable tool-call cursor', () => {
    const { dbPath, store } = setup()
    store.close()
    stores.splice(stores.indexOf(store), 1)
    const db = new Database(dbPath)
    db.exec(
      "DROP TABLE runlog_tool_call_summaries; DELETE FROM runlog_projection_cursors WHERE projection_name = 'tool-call-summary-v1';",
    )
    db.pragma('user_version = 2')
    db.close()

    const reopened = new SqliteRunLogStore({ dbPath })
    stores.push(reopened)
    reopened.initialize()
    const verify = new Database(dbPath, { readonly: true })
    try {
      expect(Number(verify.pragma('user_version', { simple: true }))).toBe(4)
      expect(verify.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runlog_tool_call_summaries'",
      ).get()).toBeTruthy()
      expect(verify.prepare(
        "SELECT projection_name FROM runlog_projection_cursors WHERE projection_name = 'tool-call-summary-v1'",
      ).get()).toMatchObject({ projection_name: 'tool-call-summary-v1' })
      expect(verify.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runlog_usage_summaries'",
      ).get()).toBeTruthy()
      expect(verify.prepare(
        "SELECT projection_name FROM runlog_projection_cursors WHERE projection_name = 'usage-summary-v1'",
      ).get()).toMatchObject({ projection_name: 'usage-summary-v1' })
    } finally {
      verify.close()
    }
  })
})
