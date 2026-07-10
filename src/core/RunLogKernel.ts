import { RunLogExecutor } from './RunLogExecutor.js'
import { RunLogWorker } from './RunLogWorker.js'
import { createRunLogApprovalReceipt } from './RunLogApprovalReceipt.js'
import type {
  AgentSpec,
  RunExecutionSummary,
  RunExecutorOptions,
  RunIntent,
  RunLogApprovalReceipt,
  RunLogStore,
  RunRecord,
} from './types.js'

export interface RunLogKernelOptions extends Omit<RunExecutorOptions, 'store'> {
  store: RunLogStore
  workerId?: string
  leaseMs?: number
  now?: () => Date
  random?: () => number
  pollIntervalMs?: number
  heartbeatIntervalMs?: number
  retryBaseMs?: number
  retryCapMs?: number
}

export interface DecideRunLogApprovalInput {
  approvalId: string
  actor?: string
  expiresAt?: string
  expiresInMs?: number
}

export interface CancelRunLogRunInput {
  runId: string
  reason?: string
}

export class RunLogKernel {
  private readonly executor: RunLogExecutor
  private readonly worker: RunLogWorker

  constructor(private readonly options: RunLogKernelOptions) {
    this.options.store.initialize()
    this.executor = new RunLogExecutor(options)
    this.worker = new RunLogWorker({
      store: options.store,
      executor: this.executor,
      workerId: options.workerId,
      leaseMs: options.leaseMs,
      now: options.now,
      random: options.random,
      pollIntervalMs: options.pollIntervalMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      retryBaseMs: options.retryBaseMs,
      retryCapMs: options.retryCapMs,
    })
  }

  putAgent(spec: AgentSpec): void {
    this.options.store.putAgent(spec)
  }

  startRun(intent: RunIntent): RunRecord {
    const agent = this.options.store.getAgent(intent.agentId)
    if (!agent) throw new Error(`Unknown agent: ${intent.agentId}`)
    return this.options.store.createQueuedRun(intent, agent)
  }

  approveRunLogApproval(input: DecideRunLogApprovalInput): RunLogApprovalReceipt {
    const request = this.options.store.getApprovalRequest(input.approvalId)
    if (!request) throw new Error(`Unknown RunLog approval request: ${input.approvalId}`)
    this.assertApprovalDecisionAllowed(request.runId, request.approvalId)
    const receipt = createRunLogApprovalReceipt({
      request,
      decision: 'approved',
      actor: input.actor,
      expiresAt: input.expiresAt,
      expiresInMs: input.expiresInMs,
      key: this.options.approvalReceiptKey,
      keyMode: this.options.approvalReceiptKeyMode,
    })
    this.options.store.decideApprovalLifecycle({
      receipt,
      eventPayload: {
        approvalId: request.approvalId,
        receiptId: receipt.receiptId,
        toolCallId: request.toolCallId,
        actor: receipt.actor,
        expiresAt: receipt.expiresAt,
      },
    })
    return receipt
  }

  denyRunLogApproval(input: DecideRunLogApprovalInput): RunLogApprovalReceipt {
    const request = this.options.store.getApprovalRequest(input.approvalId)
    if (!request) throw new Error(`Unknown RunLog approval request: ${input.approvalId}`)
    this.assertApprovalDecisionAllowed(request.runId, request.approvalId)
    const receipt = createRunLogApprovalReceipt({
      request,
      decision: 'denied',
      actor: input.actor,
      expiresAt: input.expiresAt,
      expiresInMs: input.expiresInMs,
      key: this.options.approvalReceiptKey,
      keyMode: this.options.approvalReceiptKeyMode,
    })
    this.options.store.decideApprovalLifecycle({
      receipt,
      eventPayload: {
        approvalId: request.approvalId,
        receiptId: receipt.receiptId,
        toolCallId: request.toolCallId,
        actor: receipt.actor,
      },
    })
    return receipt
  }

  cancelRun(input: CancelRunLogRunInput): RunRecord {
    const existing = this.options.store.getRun(input.runId)
    if (!existing) throw new Error(`Unknown run: ${input.runId}`)
    if (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'cancelled') {
      return existing
    }

    const cancelled = this.options.store.cancelRunLifecycle({
      runId: input.runId,
      reason: input.reason ?? 'Cancelled by operator.',
    })
    this.executor.cancel(input.runId)
    return cancelled
  }

  private assertApprovalDecisionAllowed(runId: string, approvalId: string): void {
    const run = this.options.store.getRun(runId)
    if (!run) throw new Error(`Unknown run for RunLog approval request: ${runId}`)
    if (run.status !== 'awaiting_approval') {
      throw new Error(
        `RunLog approval request ${approvalId} cannot be decided while run ${runId} is ${run.status}.`,
      )
    }
  }

  async drainOnce(): Promise<RunExecutionSummary | null> {
    return await this.worker.runOnce()
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

  startWorker(): void {
    this.worker.start()
  }

  async stopWorker(): Promise<void> {
    await this.worker.stop()
  }
}
