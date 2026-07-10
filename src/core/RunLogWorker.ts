import { RunLogExecutionError, RunLogExecutor } from './RunLogExecutor.js'
import type {
  ExecutionClaim,
  ExecutionClaimInput,
  RunExecutionSummary,
  RunLogStore,
} from './types.js'

export interface RunLogWorkerOptions {
  store: RunLogStore
  executor: RunLogExecutor
  workerId?: string
  now?: () => Date
  random?: () => number
  maxConcurrentRuns?: number
  pollIntervalMs?: number
  leaseMs?: number
  heartbeatIntervalMs?: number
  retryBaseMs?: number
  retryCapMs?: number
}

export class RunLogWorker {
  private readonly workerId: string
  private readonly now: () => Date
  private readonly random: () => number
  private readonly maxConcurrentRuns: number
  private readonly pollIntervalMs: number
  private readonly leaseMs: number
  private readonly heartbeatIntervalMs: number
  private readonly retryBaseMs: number
  private readonly retryCapMs: number
  private pollTimer: NodeJS.Timeout | null = null
  private running = false
  private stopping = false
  private readonly active = new Map<string, Promise<RunExecutionSummary>>()

  constructor(private readonly options: RunLogWorkerOptions) {
    this.workerId = options.workerId ?? `worker_${process.pid}`
    this.now = options.now ?? (() => new Date())
    this.random = options.random ?? Math.random
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? 1
    if (!Number.isInteger(this.maxConcurrentRuns) || this.maxConcurrentRuns < 1) {
      throw new Error('RunLog maxConcurrentRuns must be a positive integer.')
    }
    this.pollIntervalMs = Math.max(10, options.pollIntervalMs ?? 250)
    this.leaseMs = Math.max(100, options.leaseMs ?? 60_000)
    this.heartbeatIntervalMs = Math.max(
      25,
      Math.min(options.heartbeatIntervalMs ?? Math.floor(this.leaseMs / 3), this.leaseMs - 1),
    )
    this.retryBaseMs = Math.max(1, options.retryBaseMs ?? 1_000)
    this.retryCapMs = Math.max(this.retryBaseMs, options.retryCapMs ?? 60_000)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.stopping = false
    this.schedulePoll(0)
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.running = false
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = null
    for (const runId of this.active.keys()) this.options.executor.cancel(runId)
    await Promise.allSettled(this.active.values())
  }

  async runOnce(): Promise<RunExecutionSummary | null> {
    const execution = this.startNextExecution()
    return execution ? await execution : null
  }

  async drainAvailable(maxRuns = this.maxConcurrentRuns): Promise<RunExecutionSummary[]> {
    const requested = Number.isInteger(maxRuns) && maxRuns > 0
      ? maxRuns
      : this.maxConcurrentRuns
    const executions = this.startAvailable(Math.min(requested, this.maxConcurrentRuns))
    return await Promise.all(executions)
  }

  heartbeatOnce(claim: ExecutionClaim): boolean {
    const current = this.claimInput(claim)
    const owned = this.options.store.heartbeatExecution({
      ...current,
      now: this.now().toISOString(),
      leaseMs: this.leaseMs,
    })
    if (!owned) this.options.executor.cancel(claim.run.runId)
    return owned
  }

  private async executeClaim(claim: ExecutionClaim): Promise<RunExecutionSummary> {
    const heartbeat = setInterval(() => {
      this.heartbeatOnce(claim)
    }, this.heartbeatIntervalMs)
    heartbeat.unref?.()
    try {
      const summary = await this.options.executor.execute(claim.run, claim)
      this.options.store.acknowledgeExecution(this.claimInput(claim))
      return { ...summary, eventsAppended: summary.eventsAppended + 1 }
    } catch (error) {
      if (error instanceof RunLogExecutionError && error.retryable) {
        const nextAttemptAt = new Date(
          this.now().getTime() + this.retryDelayMs(claim.outbox.attemptCount),
        ).toISOString()
        const outbox = this.options.store.scheduleExecutionRetry({
          claim: this.claimInput(claim),
          failure: {
            message: error.message,
            classification: error.classification,
            retryable: true,
            ...(error.details ? { details: error.details } : {}),
          },
          nextAttemptAt,
        })
        const run = this.options.store.getRun(claim.run.runId)
        return {
          runId: claim.run.runId,
          status: run?.status ?? (outbox?.status === 'failed' ? 'failed' : 'queued'),
          eventsAppended: 0,
          checkpointsAppended: 0,
        }
      }
      throw error
    } finally {
      clearInterval(heartbeat)
    }
  }

  private retryDelayMs(attemptCount: number): number {
    const exponential = Math.min(
      this.retryCapMs,
      this.retryBaseMs * 2 ** Math.max(0, attemptCount - 1),
    )
    const boundedRandom = Math.min(1, Math.max(0, this.random()))
    return Math.round(exponential * (0.8 + boundedRandom * 0.4))
  }

  private claimInput(claim: ExecutionClaim): ExecutionClaimInput {
    return {
      outboxId: claim.outbox.outboxId,
      runId: claim.run.runId,
      workerId: claim.workerId,
      claimToken: claim.claimToken,
      leaseEpoch: claim.leaseEpoch,
    }
  }

  private startAvailable(maxRuns: number): Array<Promise<RunExecutionSummary>> {
    const executions: Array<Promise<RunExecutionSummary>> = []
    while (!this.stopping && this.active.size < this.maxConcurrentRuns && executions.length < maxRuns) {
      const execution = this.startNextExecution()
      if (!execution) break
      executions.push(execution)
    }
    return executions
  }

  private startNextExecution(): Promise<RunExecutionSummary> | null {
    if (this.stopping || this.active.size >= this.maxConcurrentRuns) return null
    const claim = this.options.store.claimNextExecution({
      workerId: this.workerId,
      leaseMs: this.leaseMs,
      now: this.now().toISOString(),
    })
    if (!claim) return null

    const execution = this.executeClaim(claim)
    this.active.set(claim.run.runId, execution)
    void execution.then(
      () => this.releaseActiveClaim(claim.run.runId, execution),
      () => this.releaseActiveClaim(claim.run.runId, execution),
    )
    return execution
  }

  private releaseActiveClaim(runId: string, execution: Promise<RunExecutionSummary>): void {
    if (this.active.get(runId) !== execution) return
    this.active.delete(runId)
    if (this.running && !this.stopping) this.schedulePoll(0)
  }

  private schedulePoll(delayMs: number): void {
    if (!this.running || this.stopping) return
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      this.startAvailable(this.maxConcurrentRuns)
      if (this.active.size < this.maxConcurrentRuns) {
        this.schedulePoll(this.pollIntervalMs)
      }
    }, delayMs)
    this.pollTimer.unref?.()
  }
}
