import { RunLogExecutor } from './RunLogExecutor.js'
import { RunLogScheduler } from './RunLogScheduler.js'
import type {
  AgentSpec,
  RunExecutionSummary,
  RunExecutorOptions,
  RunIntent,
  RunLogStore,
  RunRecord,
} from './types.js'

export interface RunLogKernelOptions extends Omit<RunExecutorOptions, 'store'> {
  store: RunLogStore
  workerId?: string
  leaseMs?: number
}

export class RunLogKernel {
  private readonly scheduler: RunLogScheduler
  private readonly executor: RunLogExecutor

  constructor(private readonly options: RunLogKernelOptions) {
    this.options.store.initialize()
    this.scheduler = new RunLogScheduler({
      store: options.store,
      workerId: options.workerId,
      leaseMs: options.leaseMs,
    })
    this.executor = new RunLogExecutor(options)
  }

  putAgent(spec: AgentSpec): void {
    this.options.store.putAgent(spec)
  }

  startRun(intent: RunIntent): RunRecord {
    const agent = this.options.store.getAgent(intent.agentId)
    if (!agent) throw new Error(`Unknown agent: ${intent.agentId}`)
    const run = this.options.store.createRun(intent, agent)
    this.options.store.appendEvent({
      runId: run.runId,
      type: 'run.created',
      payload: {
        agentId: run.agentId,
        sessionId: run.sessionId,
        parentRunId: run.parentRunId,
      },
      idempotencyKey: `run.created:${run.runId}`,
    })
    this.options.store.appendEvent({
      runId: run.runId,
      type: 'input.received',
      payload: {
        input: intent.input,
        requestedCapabilities: intent.requestedCapabilities ?? [],
      },
      idempotencyKey: `input.received:${run.runId}`,
    })
    this.options.store.appendEvent({
      runId: run.runId,
      type: 'run.queued',
      payload: {},
      idempotencyKey: `run.queued:${run.runId}`,
    })
    return run
  }

  async drainOnce(): Promise<RunExecutionSummary | null> {
    const run = this.scheduler.claimNext()
    if (!run) return null
    return await this.executor.execute(run)
  }

  async drainUntilIdle(maxRuns = 100): Promise<RunExecutionSummary[]> {
    const summaries: RunExecutionSummary[] = []
    for (let index = 0; index < maxRuns; index += 1) {
      const summary = await this.drainOnce()
      if (!summary) break
      summaries.push(summary)
    }
    return summaries
  }
}
