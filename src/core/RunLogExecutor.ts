import path from 'node:path'
import type { RuntimePolicy } from '#protocol'
import type { ProviderEvent, QueryInput } from '../providers/types.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import { ToolRegistry, type RuntimeTool } from '../tools/ToolRegistry.js'
import type {
  AgentSpec,
  RunCheckpoint,
  RunExecutionSummary,
  RunExecutorOptions,
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
}): QueryInput {
  return {
    prompt: input.run.input,
    sessionId: input.run.sessionId,
    cwd: input.workspaceRoot,
    systemPrompt: input.agent.instructions,
    providerId: input.run.providerId ?? input.agent.providerId,
    model: input.run.modelId ?? input.agent.modelId,
    tools: input.tools.map((tool) => ({ manifest: tool.manifest })),
  }
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
      const provider = this.options.providerRouter.resolve({ run, agent })
      const query = provider.query(
        providerQueryInput({
          run,
          agent,
          workspaceRoot: workspaceLease.root,
          tools: selectedTools,
        }),
      )
      const toolRegistry = new ToolRegistry({
        runId: run.runId,
        sessionId: run.sessionId,
        workspaceRoot: workspaceLease.root,
        policy: defaultPolicy(agent, this.options.policy),
        emitEvent: () => {},
        readRecentEvents: ({ limit }) => this.store.listEvents({ runId: run.runId, limit }),
      })
      toolRegistry.registerMany(selectedTools)

      for await (const event of query.events) {
        await this.recordProviderEvent({
          run,
          agent,
          event,
          query,
          toolRegistry,
        })
        if (event.type === 'tool_call') {
          checkpointsAppended += this.checkpoint(run.runId, 'tool', {
            toolName: event.name,
            toolCallId: event.toolCallId,
          })
        }
        if (event.type === 'usage') {
          checkpointsAppended += this.checkpoint(run.runId, 'provider', { usage: event.usage })
        }
        const latest = this.store.getRun(run.runId)
        if (latest?.status === 'awaiting_approval' || latest?.status === 'failed') break
      }

      const latest = this.store.getRun(run.runId)
      if (latest?.status === 'awaiting_approval' || latest?.status === 'failed') {
        finalStatus = latest.status
      } else {
        finalStatus = 'completed'
        this.store.updateRunStatus(run.runId, 'completed')
        this.store.appendEvent({ runId: run.runId, type: 'run.completed', payload: {} })
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

  private async recordProviderEvent(input: {
    run: RunRecord
    agent: AgentSpec
    event: ProviderEvent
    query: { push(message: string): void }
    toolRegistry: ToolRegistry
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
        return await this.executeToolCall({ run, event, query, toolRegistry })
      default:
        return null
    }
  }

  private async executeToolCall(input: {
    run: RunRecord
    event: Extract<ProviderEvent, { type: 'tool_call' }>
    query: { push(message: string): void }
    toolRegistry: ToolRegistry
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
    })
    if (result.status === 'approval_required') {
      this.store.updateRunStatus(input.run.runId, 'awaiting_approval')
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'approval.requested',
        payload: result.approval,
      })
      return this.store.appendEvent({
        runId: input.run.runId,
        type: 'run.awaiting_approval',
        payload: { approvalId: result.approval.id, toolCallId },
      })
    }
    if (result.status === 'policy_blocked') {
      const payload = {
        toolCallId,
        name: input.event.name,
        reasons: result.reasons,
        permissionCategories: result.permissionCategories,
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
      },
    })
  }
}
