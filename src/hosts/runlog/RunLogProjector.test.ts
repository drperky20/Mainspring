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
  })

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

  it('only advances the SQLite schema version during projection migration', () => {
    const { dbPath, store } = setup()
    store.close()
    stores.splice(stores.indexOf(store), 1)
    const db = new Database(dbPath)
    db.pragma('user_version = 3')
    db.close()

    const reopened = new SqliteRunLogStore({ dbPath })
    stores.push(reopened)
    reopened.initialize()
    const verify = new Database(dbPath, { readonly: true })
    try {
      expect(Number(verify.pragma('user_version', { simple: true }))).toBe(3)
    } finally {
      verify.close()
    }
  })
})
