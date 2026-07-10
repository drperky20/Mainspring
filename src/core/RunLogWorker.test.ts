import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteRunLogStore } from '../adapters/sqlite/SqliteRunLogStore.js'
import { MockProvider } from '../providers/MockProvider.js'
import { RunLogKernel } from './RunLogKernel.js'
import { SingleProviderRouter } from './ProviderRouter.js'

const roots: string[] = []
const stores: SqliteRunLogStore[] = []

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-worker-'))
  roots.push(value)
  return value
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true })
})

describe('durable RunLog worker', () => {
  it('rolls back run, lifecycle events, and outbox when enqueue fails before commit', () => {
    const dbPath = path.join(root(), 'runlog.sqlite')
    let fail = true
    const store = new SqliteRunLogStore({
      dbPath,
      transactionHook: (step) => {
        if (fail && step === 'createQueuedRun.beforeCommit') throw new Error('simulated crash')
      },
    })
    stores.push(store)
    const kernel = new RunLogKernel({
      store,
      providerRouter: new SingleProviderRouter(new MockProvider([])),
    })
    kernel.putAgent({ agentId: 'atomic-agent', instructions: 'Be atomic.' })

    expect(() => kernel.startRun({ agentId: 'atomic-agent', input: 'atomic' }))
      .toThrow('simulated crash')
    expect(store.listRuns()).toEqual([])
    expect(store.listEvents()).toEqual([])
    expect(store.listExecutionOutbox()).toEqual([])

    fail = false
    expect(kernel.startRun({ agentId: 'atomic-agent', input: 'commit' }).status).toBe('queued')
    expect(store.listExecutionOutbox()).toHaveLength(1)
  })

  it('fences an expired owner after another worker reclaims the outbox item', () => {
    const dbPath = path.join(root(), 'runlog.sqlite')
    let now = new Date('2026-07-09T12:00:00.000Z')
    const first = new SqliteRunLogStore({ dbPath, now: () => now })
    const second = new SqliteRunLogStore({ dbPath, now: () => now })
    stores.push(first, second)
    first.putAgent({ agentId: 'lease-agent', instructions: 'Respect fencing.' })
    const run = first.createQueuedRun({ agentId: 'lease-agent', input: 'lease' }, first.getAgent('lease-agent')!)
    const firstClaim = first.claimNextExecution({
      workerId: 'worker-a', leaseMs: 1_000, now: now.toISOString(),
    })
    expect(firstClaim?.run.runId).toBe(run.runId)
    expect(second.claimNextExecution({
      workerId: 'worker-b', leaseMs: 1_000, now: now.toISOString(),
    })).toBeNull()

    now = new Date(now.getTime() + 500)
    expect(first.heartbeatExecution({
      outboxId: firstClaim!.outbox.outboxId,
      runId: run.runId,
      workerId: 'worker-a',
      claimToken: firstClaim!.claimToken,
      leaseEpoch: firstClaim!.leaseEpoch,
      now: now.toISOString(),
      leaseMs: 1_000,
    })).toBe(true)

    now = new Date(now.getTime() + 1_001)
    const secondClaim = second.claimNextExecution({
      workerId: 'worker-b', leaseMs: 1_000, now: now.toISOString(),
    })
    expect(secondClaim?.leaseEpoch).toBe(firstClaim!.leaseEpoch + 1)
    expect(first.completeExecution({
      claim: {
        outboxId: firstClaim!.outbox.outboxId,
        runId: run.runId,
        workerId: 'worker-a',
        claimToken: firstClaim!.claimToken,
        leaseEpoch: firstClaim!.leaseEpoch,
      },
    })).toBeNull()
    expect(second.completeExecution({
      claim: {
        outboxId: secondClaim!.outbox.outboxId,
        runId: run.runId,
        workerId: 'worker-b',
        claimToken: secondClaim!.claimToken,
        leaseEpoch: secondClaim!.leaseEpoch,
      },
    })?.status).toBe('completed')
  })

  it('schedules deterministic bounded retries and fails after the outbox attempt limit', async () => {
    let now = new Date('2026-07-09T12:00:00.000Z')
    const store = new SqliteRunLogStore({ dbPath: path.join(root(), 'runlog.sqlite'), now: () => now })
    stores.push(store)
    const kernel = new RunLogKernel({
      store,
      now: () => now,
      random: () => 0.5,
      retryBaseMs: 100,
      retryCapMs: 1_000,
      providerRouter: new SingleProviderRouter(new MockProvider([{
        type: 'event',
        event: {
          type: 'error', message: 'try later', retryable: true, classification: 'upstream_busy',
        },
      }])),
    })
    kernel.putAgent({ agentId: 'retry-agent', instructions: 'Retry safely.' })
    const run = kernel.startRun({ agentId: 'retry-agent', input: 'retry' })

    expect((await kernel.drainOnce())?.status).toBe('queued')
    expect(store.listExecutionOutbox({ runId: run.runId })[0]).toMatchObject({
      status: 'retryable', attemptCount: 1,
      nextAttemptAt: '2026-07-09T12:00:00.100Z',
    })
    expect(await kernel.drainOnce()).toBeNull()

    now = new Date('2026-07-09T12:00:00.100Z')
    expect((await kernel.drainOnce())?.status).toBe('queued')
    expect(store.listExecutionOutbox({ runId: run.runId })[0]?.nextAttemptAt)
      .toBe('2026-07-09T12:00:00.300Z')

    now = new Date('2026-07-09T12:00:00.300Z')
    expect((await kernel.drainOnce())?.status).toBe('failed')
    expect(store.getRun(run.runId)).toMatchObject({
      status: 'failed', attemptCount: 3, failureClassification: 'upstream_busy',
    })
    expect(store.listExecutionOutbox({ runId: run.runId })[0]).toMatchObject({
      status: 'failed', attemptCount: 3,
    })
    expect(store.listEvents({ runId: run.runId }).map((event) => event.type))
      .toEqual(expect.arrayContaining(['run.retry.scheduled', 'runtime.error', 'run.failed']))
  })
})
