import path from 'node:path'
import { RuntimeSecretRefSchema, type RuntimePolicy } from '#protocol'
import type { ProviderEvent, ProviderMessage, QueryInput } from '../providers/types.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import type { DecisionRecord } from '../policy/DecisionRecord.js'
import { ToolRegistry, type RuntimeTool } from '../tools/ToolRegistry.js'
import {
  assertRunLogApprovalReceipt,
  createRunLogApprovalRequestSnapshot,
  legacyApprovalReceiptFromRunLog,
} from './RunLogApprovalReceipt.js'
import type {
  AgentSpec,
  RunCheckpoint,
  RunExecutionSummary,
  RunExecutorOptions,
  RunLogApprovalReceipt,
  RunLogApprovalRequestSnapshot,
  RunLogEvent,
  RunLogStore,
  RunRecord,
  WorkspaceAdapter,
  WorkspaceLease,
} from './types.js'

function defaultPolicy(agent: AgentSpec, policy?: RuntimePolicy): RuntimePolicy {
  return RuntimePolicyGuard.defaultPolicy({
    approvalPolicy: agent.approvalPolicy ?? policy?.approvalPolicy ?? 'balanced',
    allowBrowser: agent.capabilities?.includes('browser') ?? false,
    allowMemory: agent.capabilities?.includes('memory') ?? false,
    allowedTools: agent.tools ?? policy?.allowedTools ?? [],
    budget: policy?.budget,
    redaction: policy?.redaction ?? 'strict',
  })
}

function toolSchemaSubset(tools: readonly RuntimeTool[], agent: AgentSpec): RuntimeTool[] {
  if (!agent.tools || agent.tools.length === 0) return []
  const allowed = new Set(agent.tools)
  return tools.filter((tool) => allowed.has(tool.manifest.key))
}

function fallbackWorkspaceRoot(run: RunRecord, root?: string): string {
  if (run.workspaceRoot) return path.resolve(run.workspaceRoot)
  return path.resolve(root ?? process.cwd(), run.workspaceId ?? run.runId)
}

function providerQueryInput(input: {
  run: RunRecord
  agent: AgentSpec
  workspaceRoot: string
  tools: RuntimeTool[]
  messages?: ProviderMessage[]
  prompt?: string
  secretResolver?: QueryInput['resolveCredential']
}): QueryInput {
  const credentialRef = input.run.credentialRef
    ? RuntimeSecretRefSchema.parse(input.run.credentialRef)
    : undefined
  return {
    prompt: input.prompt ?? input.run.input,
    sessionId: input.run.sessionId,
    cwd: input.workspaceRoot,
    systemPrompt: input.agent.instructions,
    providerId: input.run.providerId ?? input.agent.providerId,
    model: input.run.modelId ?? input.agent.modelId,
    ...(credentialRef ? { credentialRef } : {}),
    ...(credentialRef && input.secretResolver ? { resolveCredential: input.secretResolver } : {}),
    messages: input.messages,
    tools: input.tools.map((tool) => ({ manifest: tool.manifest })),
  }
}

function providerContinuationMessages(input: {
  run: RunRecord
  request: RunLogApprovalRequestSnapshot
  output: unknown
}): ProviderMessage[] {
  return [
    {
      role: 'user',
      content: input.run.input,
    },
    {
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: input.request.toolCallId,
          name: input.request.toolName,
          arguments: JSON.stringify(input.request.toolInput ?? {}),
        },
      ],
    },
    {
      role: 'tool',
      toolCallId: input.request.toolCallId,
      name: input.request.toolName,
      content: JSON.stringify({
        toolCallId: input.request.toolCallId,
        status: 'completed',
        output: input.output,
      }),
    },
  ]
}

function publicApprovalRequestSnapshot(
  snapshot: RunLogApprovalRequestSnapshot,
): Omit<RunLogApprovalRequestSnapshot, 'toolInput'> {
  const { toolInput: _toolInput, ...publicSnapshot } = snapshot
  return publicSnapshot
}

export class RunLogExecutor {
  private readonly store: RunLogStore
  private readonly tools: RuntimeTool[]
  private readonly workspace?: WorkspaceAdapter

  constructor(private readonly options: RunExecutorOptions) {
    this.store = options.store
    this.tools = options.tools ?? []
    this.workspace = options.workspace
  }

  async execute(run: RunRecord): Promise<RunExecutionSummary> {
    const agent = this.store.getAgent(run.agentId)
    if (!agent) throw new Error(`Unknown agent for run ${run.runId}: ${run.agentId}`)
    let eventsBefore = this.store.listEvents({ runId: run.runId }).length
    let checkpointsAppended = 0
    let workspaceLease: WorkspaceLease | null = null
    let finalStatus = run.status

    try {
      this.store.updateRunStatus(run.runId, 'running')
      this.store.appendEvent({
        runId: run.runId,
        type: 'run.claimed',
        payload: { workerId: run.workerId, leaseUntil: run.leaseUntil },
        idempotencyKey: `run.claimed:${run.runId}:${run.workerId ?? 'unknown'}`,
      })

      workspaceLease = await this.leaseWorkspace(run, agent)
      const selectedTools = toolSchemaSubset(this.tools, agent)
      const policy = defaultPolicy(agent, this.options.policy)
      const approvedReceipt = this.store.getApprovedUnusedReceipt(run.runId)

      if (approvedReceipt) {
        checkpointsAppended += await this.resumeApprovedTool({
          run,
          agent,
          receipt: approvedReceipt,
          workspaceLease,
          selectedTools,
          policy,
        })
        finalStatus = this.store.getRun(run.runId)?.status ?? 'failed'
      } else {
        const result = await this.runProviderQuery({
          run,
          agent,
          workspaceRoot: workspaceLease.root,
          selectedTools,
          policy,
          queryInput: providerQueryInput({
            run,
            agent,
            workspaceRoot: workspaceLease.root,
            tools: selectedTools,
            secretResolver: this.options.secretResolver,
          }),
        })
        checkpointsAppended += result.checkpointsAppended
        finalStatus = result.status
      }
    } catch (error) {
      finalStatus = 'failed'
      const message = error instanceof Error ? error.message : String(error)
      this.store.updateRunStatus(run.runId, 'failed')
      this.store.appendEvent({
        runId: run.runId,
        type: 'runtime.error',
        payload: { message, retryable: false },
      })
      this.store.appendEvent({ runId: run.runId, type: 'run.failed', payload: { message } })
    } finally {
      if (workspaceLease) {
        await workspaceLease.release()
        this.store.appendEvent({
          runId: run.runId,
          type: 'workspace.lease.released',
          payload: {
            workspaceId: workspaceLease.workspaceId,
            root: workspaceLease.root,
          },
        })
      }
    }

    const eventsAfter = this.store.listEvents({ runId: run.runId }).length
    return {
      runId: run.runId,
      status: finalStatus,
      eventsAppended: eventsAfter - eventsBefore,
      checkpointsAppended,
    }
  }

  private async leaseWorkspace(run: RunRecord, agent: AgentSpec): Promise<WorkspaceLease> {
    const needsWorkspace =
      run.workspaceRoot ||
      agent.workspacePolicy === 'required' ||
      agent.workspacePolicy === 'lazy' ||
      agent.capabilities?.includes('workspace') ||
      agent.capabilities?.includes('files') ||
      agent.capabilities?.includes('shell')
    const lease =
      needsWorkspace && this.workspace
        ? await this.workspace.lease({ run, agent })
        : {
            runId: run.runId,
            workspaceId: run.workspaceId ?? run.runId,
            root: fallbackWorkspaceRoot(run, this.options.defaultWorkspaceRoot),
            materialized: false,
            release: () => {},
          }
    if (lease.materialized) {
      this.store.appendEvent({
        runId: run.runId,
        type: 'workspace.lease.created',
        payload: { workspaceId: lease.workspaceId, root: lease.root },
      })
    }
    return lease
  }

  private checkpoint(
    runId: string,
    kind: RunCheckpoint['kind'],
    state: Record<string, unknown>,
  ): number {
    const latestSeq = this.store.listEvents({ runId, limit: 1 }).at(-1)?.seq ?? 0
    this.store.appendCheckpoint({ runId, seq: latestSeq, kind, state })
    this.store.appendEvent({
      runId,
      type: 'checkpoint.saved',
      payload: { kind, seq: latestSeq },
    })
    return 1
  }

  private async runProviderQuery(input: {
    run: RunRecord
    agent: AgentSpec
    workspaceRoot: string
    selectedTools: RuntimeTool[]
    policy: RuntimePolicy
    queryInput: QueryInput
  }): Promise<{ status: RunRecord['status']; checkpointsAppended: number }> {
    let checkpointsAppended = 0
    const provider = this.options.providerRouter.resolve({ run: input.run, agent: input.agent })
    const query = provider.query(input.queryInput)
    const toolRegistry = this.createToolRegistry({
      run: input.run,
      workspaceRoot: input.workspaceRoot,
      policy: input.policy,
      tools: input.selectedTools,
    })

    for await (const event of query.events) {
      await this.recordProviderEvent({
        run: input.run,
        agent: input.agent,
        event,
        query,
        toolRegistry,
        selectedTools: input.selectedTools,
        workspaceRoot: input.workspaceRoot,
        policy: input.policy,
      })
      if (event.type === 'tool_call') {
        checkpointsAppended += this.checkpoint(input.run.runId, 'tool', {
          toolName: event.name,
          toolCallId: event.toolCallId,
        })
      }
      if (event.type === 'usage') {
        checkpointsAppended += this.checkpoint(input.run.runId, 'provider', { usage: event.usage })
      }
      const latest = this.store.getRun(input.run.runId)
      if (latest?.status === 'awaiting_approval' || latest?.status === 'failed') {
        return { status: latest.status, checkpointsAppended }
      }
    }

    const latest = this.store.getRun(input.run.runId)
    if (latest?.status === 'awaiting_approval' || latest?.status === 'failed') {
      return { status: latest.status, checkpointsAppended }
    }
    this.store.updateRunStatus(input.run.runId, 'completed')
    this.store.appendEvent({ runId: input.run.runId, type: 'run.completed', payload: {} })
    return { status: 'completed', checkpointsAppended }
  }

  private async recordProviderEvent(input: {
    run: RunRecord
    agent: AgentSpec
    event: ProviderEvent
    query: { push(message: string): void }
    toolRegistry: ToolRegistry
    selectedTools: RuntimeTool[]
    workspaceRoot: string
    policy: RuntimePolicy
  }): Promise<RunLogEvent | null> {
    const { run, event, query, toolRegistry } = input
    switch (event.type) {
      case 'init':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'provider.init',
          payload: {
            provider: event.provider,
            modelId: event.modelId,
            modelFamily: event.modelFamily,
            providerTransport: event.providerTransport,
            providerSessionId: event.providerSessionId,
          },
        })
      case 'delta':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'assistant.delta',
          payload: { text: event.text },
        })
      case 'result':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'assistant.result',
          payload: { text: event.text },
        })
      case 'usage':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'usage.reported',
          payload: { usage: event.usage, providerSessionId: event.providerSessionId },
        })
      case 'progress':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'runtime.warning',
          payload: { message: event.message, phase: 'provider.progress' },
        })
      case 'error':
        this.store.updateRunStatus(run.runId, 'failed')
        return this.store.appendEvent({
          runId: run.runId,
          type: 'runtime.error',
          payload: {
            message: event.message,
            retryable: event.retryable,
            classification: event.classification,
          },
        })
      case 'tool_result':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'tool.call.completed',
          payload: {
            toolCallId: event.toolCallId,
            name: event.name,
            output: event.output,
            source: 'provider',
          },
        })
      case 'tool_call':
        return await this.executeToolCall({
          run: input.run,
          agent: input.agent,
          event,
          query: input.query,
          toolRegistry: input.toolRegistry,
          selectedTools: input.selectedTools,
          workspaceRoot: input.workspaceRoot,
          policy: input.policy,
        })
      default:
        return null
    }
  }

  private async executeToolCall(input: {
    run: RunRecord
    agent: AgentSpec
    event: Extract<ProviderEvent, { type: 'tool_call' }>
    query: { push(message: string): void }
    toolRegistry: ToolRegistry
    selectedTools: RuntimeTool[]
    workspaceRoot: string
    policy: RuntimePolicy
  }): Promise<RunLogEvent> {
    const toolCallId = input.event.toolCallId ?? `${input.event.name}_${Date.now()}`
    this.store.appendEvent({
      runId: input.run.runId,
      type: 'tool.call.requested',
      payload: {
        toolCallId,
        name: input.event.name,
        input: input.event.input,
      },
    })
    const result = await input.toolRegistry.execute({
      key: input.event.name,
      input: input.event.input,
      toolCallId,
    })
    if (result.status === 'approval_required') {
      const tool = input.selectedTools.find((candidate) => candidate.manifest.key === input.event.name)
      if (!tool) throw new Error(`Approval requested for unregistered tool: ${input.event.name}`)
      const snapshot = createRunLogApprovalRequestSnapshot({
        approvalId: result.approval.id,
        run: input.run,
        agent: input.agent,
        tool,
        toolCallId,
        toolInput: input.event.input,
        cwd: input.workspaceRoot,
        policy: input.policy,
      })
      this.store.putApprovalRequest(snapshot)
      this.store.updateRunStatus(input.run.runId, 'awaiting_approval')
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'approval.requested',
        payload: {
          approvalId: result.approval.id,
          toolCallId,
          targetKey: result.approval.targetKey,
          reasons: result.approval.reasons,
          permissionCategories: result.approval.permissionCategories,
          decisionId: result.decisionRecord.decisionId,
          request: publicApprovalRequestSnapshot(snapshot),
        },
      })
      this.checkpoint(input.run.runId, 'approval', {
        approvalId: result.approval.id,
        toolCallId,
        targetKey: result.approval.targetKey,
        decisionId: result.decisionRecord.decisionId,
      })
      return this.store.appendEvent({
        runId: input.run.runId,
        type: 'run.awaiting_approval',
        payload: { approvalId: result.approval.id, toolCallId, targetKey: result.approval.targetKey },
      })
    }
    if (result.status === 'policy_blocked') {
      const payload = {
        toolCallId,
        name: input.event.name,
        reasons: result.reasons,
        permissionCategories: result.permissionCategories,
        decisionId: result.decisionRecord.decisionId,
        hardBlocked: result.decisionRecord.hardBlocked,
      }
      input.query.push(JSON.stringify({ toolCallId, status: 'policy_blocked', payload }))
      return this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.blocked',
        payload,
      })
    }
    input.query.push(JSON.stringify({ toolCallId, status: 'completed', output: result.output }))
    return this.store.appendEvent({
      runId: input.run.runId,
      type: 'tool.call.completed',
      payload: {
        toolCallId,
        name: input.event.name,
        output: result.output,
        decisionId: result.decisionRecord.decisionId,
      },
    })
  }

  private createToolRegistry(input: {
    run: RunRecord
    workspaceRoot: string
    policy: RuntimePolicy
    tools: RuntimeTool[]
  }): ToolRegistry {
    const toolRegistry = new ToolRegistry({
      runId: input.run.runId,
      sessionId: input.run.sessionId,
      workspaceRoot: input.workspaceRoot,
      policy: input.policy,
      emitEvent: () => {},
      recordDecision: (record) => this.recordPolicyDecision(input.run.runId, record),
      readRecentEvents: ({ limit }) => this.store.listEvents({ runId: input.run.runId, limit }),
    })
    toolRegistry.registerMany(input.tools)
    return toolRegistry
  }

  private async resumeApprovedTool(input: {
    run: RunRecord
    agent: AgentSpec
    receipt: RunLogApprovalReceipt
    workspaceLease: WorkspaceLease
    selectedTools: RuntimeTool[]
    policy: RuntimePolicy
  }): Promise<number> {
    const request = this.store.getApprovalRequest(input.receipt.approvalId)
    if (!request) throw new Error(`Missing approval request snapshot: ${input.receipt.approvalId}`)
    const tool = input.selectedTools.find((candidate) => candidate.manifest.key === request.toolName)
    if (!tool) throw new Error(`Approved tool is no longer registered: ${request.toolName}`)
    const currentRequest = createRunLogApprovalRequestSnapshot({
      approvalId: request.approvalId,
      run: input.run,
      agent: input.agent,
      tool,
      toolCallId: request.toolCallId,
      toolInput: request.toolInput,
      cwd: input.workspaceLease.root,
      policy: input.policy,
      requestedAt: request.requestedAt,
    })
    assertRunLogApprovalReceipt({
      receipt: input.receipt,
      request: currentRequest,
      key: this.options.approvalReceiptKey,
    })
    const marked = this.store.markApprovalReceiptUsed(input.receipt.receiptId, input.run.runId)
    if (!marked) throw new Error(`RunLog approval receipt was already used: ${input.receipt.receiptId}`)
    this.store.appendEvent({
      runId: input.run.runId,
      type: 'approval.receipt.used',
      payload: {
        receiptId: input.receipt.receiptId,
        approvalId: input.receipt.approvalId,
        toolCallId: input.receipt.toolCallId,
      },
      idempotencyKey: `approval.receipt.used:${input.receipt.receiptId}`,
    })
    const toolRegistry = this.createToolRegistry({
      run: input.run,
      workspaceRoot: input.workspaceLease.root,
      policy: input.policy,
      tools: input.selectedTools,
    })
    const result = await toolRegistry.execute({
      key: request.toolName,
      input: request.toolInput,
      toolCallId: request.toolCallId,
      approvalReceipt: legacyApprovalReceiptFromRunLog(input.receipt, currentRequest),
    })
    if (result.status === 'completed') {
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.completed',
        payload: {
          toolCallId: request.toolCallId,
          name: request.toolName,
          output: result.output,
          source: 'approved-resume',
          decisionId: result.decisionRecord.decisionId,
        },
      })
      const checkpoints = this.checkpoint(input.run.runId, 'tool', {
        toolName: request.toolName,
        toolCallId: request.toolCallId,
        resumedFromApproval: input.receipt.approvalId,
      })
      const continuation = await this.runProviderQuery({
        run: input.run,
        agent: input.agent,
        workspaceRoot: input.workspaceLease.root,
        selectedTools: input.selectedTools,
        policy: input.policy,
        queryInput: providerQueryInput({
          run: input.run,
          agent: input.agent,
          workspaceRoot: input.workspaceLease.root,
          tools: input.selectedTools,
          prompt: '',
          secretResolver: this.options.secretResolver,
          messages: providerContinuationMessages({
            run: input.run,
            request,
            output: result.output,
          }),
        }),
      })
      return checkpoints + continuation.checkpointsAppended
    }
    if (result.status === 'policy_blocked') {
      this.store.updateRunStatus(input.run.runId, 'failed')
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.blocked',
        payload: {
          toolCallId: request.toolCallId,
          name: request.toolName,
          reasons: result.reasons,
          permissionCategories: result.permissionCategories,
          decisionId: result.decisionRecord.decisionId,
          hardBlocked: result.decisionRecord.hardBlocked,
        },
      })
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'run.failed',
        payload: { message: 'Approved tool was blocked by policy during resume.' },
      })
      return 0
    }
    this.store.updateRunStatus(input.run.runId, 'failed')
    this.store.appendEvent({
      runId: input.run.runId,
      type: 'run.failed',
      payload: { message: 'Approved tool requested a second approval during resume.' },
    })
    return 0
  }

  private recordPolicyDecision(runId: string, record: DecisionRecord): void {
    this.store.appendEvent({
      runId,
      type: 'policy.decision.recorded',
      payload: record,
      idempotencyKey: `policy.decision.recorded:${record.decisionId}`,
      visibility: 'public',
    })
  }
}
