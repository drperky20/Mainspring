import type { RunLogStore, RunRecord } from './types.js'

export interface RunLogSchedulerOptions {
  store: RunLogStore
  workerId?: string
  leaseMs?: number
}

export class RunLogScheduler {
  private readonly workerId: string
  private readonly leaseMs: number

  constructor(private readonly options: RunLogSchedulerOptions) {
    this.workerId = options.workerId ?? `worker_${process.pid}`
    this.leaseMs = options.leaseMs ?? 60_000
  }

  claimNext(): RunRecord | null {
    return this.options.store.claimNextRun({
      workerId: this.workerId,
      leaseMs: this.leaseMs,
    })
  }
}
