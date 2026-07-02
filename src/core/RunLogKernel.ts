import { RunLogExecutor } from './RunLogExecutor.js'
import { RunLogScheduler } from './RunLogScheduler.js'
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
}

export interface DecideRunLogApprovalInput {
  approvalId: string
  actor?: string
  expiresAt?: string
  expiresInMs?: number
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
    })
    this.options.store.putApprovalReceipt(receipt)
    this.options.store.appendEvent({
      runId: request.runId,
      type: 'approval.approved',
      payload: {
        approvalId: request.approvalId,
        receiptId: receipt.receiptId,
        toolCallId: request.toolCallId,
        actor: receipt.actor,
        expiresAt: receipt.expiresAt,
      },
      idempotencyKey: receipt.idempotencyKey,
    })
    this.options.store.updateRunStatus(request.runId, 'queued', {
      workerId: undefined,
      leaseUntil: undefined,
    })
    this.options.store.appendEvent({
      runId: request.runId,
      type: 'run.queued',
      payload: { resumedFromApproval: request.approvalId },
      idempotencyKey: `run.queued:${request.runId}:approval:${request.approvalId}`,
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
    })
    this.options.store.putApprovalReceipt(receipt)
    this.options.store.appendEvent({
      runId: request.runId,
      type: 'approval.denied',
      payload: {
        approvalId: request.approvalId,
        receiptId: receipt.receiptId,
        toolCallId: request.toolCallId,
        actor: receipt.actor,
      },
      idempotencyKey: receipt.idempotencyKey,
    })
    this.options.store.updateRunStatus(request.runId, 'failed', {
      workerId: undefined,
      leaseUntil: undefined,
    })
    this.options.store.appendEvent({
      runId: request.runId,
      type: 'run.failed',
      payload: { message: 'RunLog approval denied.', approvalId: request.approvalId },
      idempotencyKey: `run.failed:${request.runId}:approval-denied:${request.approvalId}`,
    })
    return receipt
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
