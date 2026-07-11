import { describe, expect, it } from 'vitest'
import { GatewayCronScheduler } from './GatewayCronScheduler.js'

describe('GatewayCronScheduler', () => {
  it('runs due schedules, skips future rows, and owns timer lifecycle', async () => {
    const now = new Date('2026-07-11T17:30:00.000Z')
    const runs: Array<{ scheduleId: string; at: Date }> = []
    const scheduler = new GatewayCronScheduler({
      enabled: true,
      pollIntervalMs: 1,
      now: () => now,
      listSchedules: () => [
        { scheduleId: 'due', enabled: true, nextRunAt: '2026-07-11T17:00:00.000Z' },
        { scheduleId: 'future', enabled: true, nextRunAt: '2026-07-11T18:00:00.000Z' },
        { scheduleId: 'disabled', enabled: false, nextRunAt: '2026-07-11T17:00:00.000Z' },
      ],
      runSchedule: (scheduleId, at) => {
        runs.push({ scheduleId, at })
      },
    })

    expect(scheduler.status()).toMatchObject({ enabled: true, running: false, pollIntervalMs: 1_000 })
    scheduler.start()
    expect(scheduler.status().running).toBe(true)
    scheduler.stop()
    expect(scheduler.status().running).toBe(false)

    await scheduler.tick()
    expect(runs).toEqual([{ scheduleId: 'due', at: now }])
    expect(scheduler.status()).toMatchObject({ lastTickAt: now.toISOString() })
  })

  it('coalesces overlapping ticks and records failures for operator status', async () => {
    const now = new Date('2026-07-11T17:30:00.000Z')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const scheduler = new GatewayCronScheduler({
      enabled: true,
      pollIntervalMs: 30_000,
      now: () => now,
      listSchedules: () => [{ scheduleId: 'due', enabled: true, nextRunAt: now.toISOString() }],
      runSchedule: async () => {
        calls += 1
        await gate
      },
    })

    const first = scheduler.tick()
    const second = scheduler.tick()
    expect(calls).toBe(1)
    release()
    await Promise.all([first, second])
    expect(calls).toBe(1)

    const failing = new GatewayCronScheduler({
      enabled: true,
      pollIntervalMs: 30_000,
      now: () => now,
      listSchedules: () => [{ scheduleId: 'failed', enabled: true, nextRunAt: now.toISOString() }],
      runSchedule: () => { throw new Error('cron run failed') },
    })
    await expect(failing.tick()).rejects.toThrow('cron run failed')
    expect(failing.status()).toMatchObject({ lastTickAt: now.toISOString(), lastError: 'cron run failed' })
  })
})
