import path from 'node:path'
import { RuntimeSecretRefSchema, sanitizeRuntimeResponse, type RuntimePolicy } from '#protocol'
import {
  ContextBudgetExceededError,
  type ContextCandidate,
} from '../context/ContextAssembly.js'
import type { ContextBlock } from '../context/types.js'
import type { AgentQuery, ProviderEvent, ProviderMessage, QueryInput } from '../providers/types.js'
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
  ExecutionClaim,
  ExecutionClaimInput,
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

export class RunLogExecutionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly classification: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'RunLogExecutionError'
  }
}

function effectiveAllowedTools(
  agent: AgentSpec,
  run: RunRecord,
  policy?: RuntimePolicy,
): string[] {
  const base = agent.tools ?? policy?.allowedTools ?? []
  if (!run.allowedTools) return [...base]
  const scoped = new Set(run.allowedTools)
  return base.filter((tool) => scoped.has(tool))
}

function defaultPolicy(agent: AgentSpec, run: RunRecord, policy?: RuntimePolicy): RuntimePolicy {
  return RuntimePolicyGuard.defaultPolicy({
    approvalPolicy: agent.approvalPolicy ?? policy?.approvalPolicy ?? 'balanced',
    allowBrowser: agent.capabilities?.includes('browser') ?? false,
    allowMemory: agent.capabilities?.includes('memory') ?? false,
    allowedTools: effectiveAllowedTools(agent, run, policy),
    budget: policy?.budget,
    redaction: policy?.redaction ?? 'strict',
  })
}

function toolSchemaSubset(tools: readonly RuntimeTool[], allowedTools: readonly string[]): RuntimeTool[] {
  if (allowedTools.length === 0) return []
  const allowed = new Set(allowedTools)
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

function sanitizeContextText(value: unknown): string {
  const sanitized = sanitizeRuntimeResponse(value)
  if (typeof sanitized === 'string') return sanitized
  try {
    return JSON.stringify(sanitized)
  } catch {
    return '[unserializable runtime context]'
  }
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
  private readonly maxToolIterations: number
  private readonly activeQueries = new Map<string, AgentQuery>()
  private readonly activeToolControllers = new Map<string, AbortController>()
  private readonly activeClaims = new Map<string, ExecutionClaim>()

  constructor(private readonly options: RunExecutorOptions) {
    this.store = options.store
    this.tools = options.tools ?? []
    this.workspace = options.workspace
    this.maxToolIterations = options.maxToolIterations ?? 16
    if (!Number.isInteger(this.maxToolIterations) || this.maxToolIterations < 0) {
      throw new Error('RunLog maxToolIterations must be a non-negative integer.')
    }
  }

  cancel(runId: string): boolean {
    const query = this.activeQueries.get(runId)
    const toolController = this.activeToolControllers.get(runId)
    if (query) this.abortQuery(runId, query)
    if (toolController) toolController.abort()
    return Boolean(query || toolController)
  }

  private abortQuery(runId: string, query: AgentQuery): void {
    try {
      query.abort()
    } catch (error) {
      this.store.appendEvent({
        runId,
        type: 'runtime.warning',
        payload: {
          message: 'Provider query abort threw after the run entered a terminal state.',
          phase: 'provider.abort',
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  async execute(run: RunRecord, claim?: ExecutionClaim): Promise<RunExecutionSummary> {
    if (claim) this.activeClaims.set(run.runId, claim)
    const agent = this.store.getAgent(run.agentId)
    if (!agent) throw new Error(`Unknown agent for run ${run.runId}: ${run.agentId}`)
    const eventsBefore = this.store.countEvents({ runId: run.runId })
    let checkpointsAppended = 0
    let workspaceLease: WorkspaceLease | null = null
    let finalStatus = run.status

    try {
      const current = this.store.getRun(run.runId)
      if (!current) throw new Error(`Unknown run: ${run.runId}`)
      if (current.status !== 'running') {
        finalStatus = current.status
      } else {
        workspaceLease = await this.leaseWorkspace(run, agent)
        if (this.store.getRun(run.runId)?.status === 'cancelled') {
          finalStatus = 'cancelled'
        } else {
          const allowedTools = effectiveAllowedTools(agent, run, this.options.policy)
          const selectedTools = toolSchemaSubset(this.tools, allowedTools)
          const policy = defaultPolicy(agent, run, this.options.policy)
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
        }
      }
    } catch (error) {
      if (error instanceof RunLogExecutionError && error.retryable) throw error
      const current = this.store.getRun(run.runId)
      if (current?.status === 'cancelled' || current?.status === 'failed') {
        finalStatus = current.status
      } else {
        const message = error instanceof Error ? error.message : String(error)
        const contextBudgetDetails = error instanceof ContextBudgetExceededError
          ? {
              code: error.code,
              ...(error.candidateId ? { candidateId: error.candidateId } : {}),
              availableTokens: error.availableTokens,
              requiredTokens: error.requiredTokens,
            }
          : undefined
        const failed = this.failRun({
          runId: run.runId,
          message,
          retryable: false,
          classification: error instanceof ContextBudgetExceededError
            ? 'context_budget_exceeded'
            : 'runtime_execution_failed',
          ...(contextBudgetDetails ? { details: contextBudgetDetails } : {}),
        })
        finalStatus = failed ? 'failed' : (this.store.getRun(run.runId)?.status ?? 'failed')
      }
    } finally {
      if (claim && this.activeClaims.get(run.runId) === claim) {
        this.activeClaims.delete(run.runId)
      }
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

    const eventsAfter = this.store.countEvents({ runId: run.runId })
    return {
      runId: run.runId,
      status: finalStatus,
      eventsAppended: eventsAfter - eventsBefore,
      checkpointsAppended,
    }
  }

  private failRun(input: {
    runId: string
    message: string
    retryable: boolean
    classification: string
    details?: Record<string, unknown>
    idempotencySuffix?: string
  }): RunLogEvent | null {
    const claim = this.activeClaims.get(input.runId)
    if (claim) {
      const failed = this.store.failExecution({
        claim: this.claimInput(claim),
        failure: {
          message: input.message,
          retryable: input.retryable,
          classification: input.classification,
          ...(input.details ? { details: input.details } : {}),
        },
        idempotencySuffix: input.idempotencySuffix,
      })
      if (!failed) return null
      return this.store.listEvents({
        runId: input.runId,
        types: ['runtime.error'],
        limit: 10_000,
      }).at(-1) ?? null
    }
    const failed = this.store.transitionRunStatus({
      runId: input.runId,
      from: ['queued', 'running', 'awaiting_approval'],
      to: 'failed',
      patch: { workerId: undefined, leaseUntil: undefined },
    })
    if (!failed) return null
    const runtimeError = this.store.appendEvent({
      runId: input.runId,
      type: 'runtime.error',
      payload: {
        message: input.message,
        retryable: input.retryable,
        classification: input.classification,
        ...(input.details ?? {}),
      },
      ...(input.idempotencySuffix
        ? { idempotencyKey: `runtime.error:${input.runId}:${input.idempotencySuffix}` }
        : {}),
    })
    this.store.appendEvent({
      runId: input.runId,
      type: 'run.failed',
      payload: {
        message: input.message,
        classification: input.classification,
        ...(input.details ?? {}),
      },
      idempotencyKey: `run.failed:${input.runId}:${input.idempotencySuffix ?? 'executor'}`,
    })
    return runtimeError
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
    const latestSeq = this.store.latestEventSeq(runId)
    this.store.appendCheckpoint({ runId, seq: latestSeq, kind, state })
    this.store.appendEvent({
      runId,
      type: 'checkpoint.saved',
      payload: { kind, seq: latestSeq },
    })
    return 1
  }

  private appendContextEncodingEvents(input: {
    run: RunRecord
    agent: AgentSpec
    queryInput: QueryInput
  }): void {
    const codec = this.options.contextCodec
    if (!codec) return
    const blocks: ContextBlock[] = [
      {
        blockId: `${input.run.runId}:user-intent`,
        kind: 'user_intent',
        label: 'current user intent',
        content: input.queryInput.prompt || input.run.input,
        recent: true,
        exactSensitive: true,
      },
    ]
    if (input.queryInput.systemPrompt?.trim()) {
      blocks.push({
        blockId: `${input.run.runId}:system-prompt`,
        kind: 'system_prompt',
        label: 'system prompt',
        content: input.queryInput.systemPrompt,
        exactSensitive: true,
        risk: 'policy',
      })
    }
    const plan = codec.encodeBlocks({
      modelId: input.queryInput.model ?? input.run.modelId ?? input.agent.modelId,
      blocks,
    })
    for (const block of plan.blocks) {
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'context.encoded',
        payload: block.eventPayload,
        visibility: 'artifact-only',
        idempotencyKey: `context.encoded:${input.run.runId}:${block.blockId}:${block.sourceSha256}`,
      })
    }
  }

  private async assembleProviderQuery(input: {
    run: RunRecord
    agent: AgentSpec
    workspaceRoot: string
    queryInput: QueryInput
  }): Promise<{ queryInput: QueryInput; assemblyId?: string }> {
    const assembler = this.options.contextAssembler
    if (!assembler) return { queryInput: input.queryInput }
    const assembly = await assembler.assemble({
      query: input.queryInput,
      candidates: this.contextCandidates(input),
    })
    this.store.appendEvent({
      runId: input.run.runId,
      type: 'context.assembled',
      payload: assembly.telemetry,
      visibility: 'artifact-only',
      idempotencyKey: `context.assembled:${input.run.runId}:${assembly.assemblyId}`,
    })
    return { queryInput: assembly.queryInput, assemblyId: assembly.assemblyId }
  }

  /**
   * Context sources are intentionally bounded at the executor boundary. The
   * assembler decides what reaches the model; this method only exposes durable
   * candidates and sanitizes tool output before it can become context.
   */
  private contextCandidates(input: {
    run: RunRecord
    agent: AgentSpec
    workspaceRoot: string
    queryInput: QueryInput
  }): ContextCandidate[] {
    const candidates: ContextCandidate[] = []
    const historyLimit = this.contextHistoryLimit()
    const events = this.store.listEvents({ runId: input.run.runId, limit: historyLimit })
    for (const event of events) {
      const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {}
      if (event.type === 'assistant.result' && typeof payload.text === 'string' && payload.text.trim()) {
        candidates.push({
          candidateId: `run:${input.run.runId}:assistant:${event.eventId}`,
          source: 'working_memory',
          content: sanitizeContextText(payload.text),
          label: 'recent assistant result',
          priority: 75,
          recency: event.seq,
          relevance: 50,
          compressionEligible: true,
          sensitivity: 'sensitive',
          provenance: { runId: input.run.runId, eventId: event.eventId },
        })
      }
      if (
        event.type === 'tool.call.completed'
        && typeof payload.name === 'string'
        && payload.output !== undefined
      ) {
        candidates.push({
          candidateId: `run:${input.run.runId}:tool:${event.eventId}`,
          source: 'tool_result',
          content: sanitizeContextText({ name: payload.name, output: payload.output }),
          label: `recent tool result: ${payload.name}`,
          priority: 70,
          recency: event.seq,
          relevance: 45,
          compressionEligible: true,
          sensitivity: 'sensitive',
          provenance: { runId: input.run.runId, eventId: event.eventId },
        })
      }
    }

    const memoryStore = this.options.contextMemoryStore
    const canReadMemory = input.agent.capabilities?.includes('memory') || Boolean(input.agent.memoryScope)
    if (!memoryStore || !canReadMemory) return candidates
    const memories = memoryStore.list({
      workspaceRoot: input.workspaceRoot,
      sessionId: input.run.sessionId,
      scope: input.agent.memoryScope === 'session' ? 'session' : 'all',
      query: input.run.input,
      limit: this.contextMemoryLimit(),
    })
    for (const memory of memories) {
      candidates.push({
        candidateId: `memory:${memory.entryId}`,
        source: memory.scope === 'session' ? 'working_memory' : 'long_term_memory',
        content: memory.text,
        label: memory.tags.length > 0 ? `memory: ${memory.tags.join(', ')}` : 'workspace memory',
        priority: memory.scope === 'session' ? 68 : 60,
        recency: Date.parse(memory.createdAt) || 0,
        relevance: 60,
        compressionEligible: true,
        sensitivity: 'workspace',
        provenance: {
          sourceId: memory.entryId,
          workspaceId: input.run.workspaceId,
        },
      })
    }
    return candidates
  }

  private contextHistoryLimit(): number {
    const limit = Math.floor(this.options.contextHistoryLimit ?? 32)
    return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 128) : 32
  }

  private contextMemoryLimit(): number {
    const limit = Math.floor(this.options.contextMemoryLimit ?? 8)
    return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 32) : 8
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
    const context = await this.assembleProviderQuery(input)
    if (!this.options.contextAssembler) {
      this.appendContextEncodingEvents({
        run: input.run,
        agent: input.agent,
        queryInput: context.queryInput,
      })
    }
    const query = provider.query(context.queryInput)
    this.activeQueries.set(input.run.runId, query)
    const toolRegistry = this.createToolRegistry({
      run: input.run,
      workspaceRoot: input.workspaceRoot,
      policy: input.policy,
      tools: input.selectedTools,
    })

    try {
      for await (const event of query.events) {
        const statusBeforeEvent = this.store.getRun(input.run.runId)?.status
        if (statusBeforeEvent === 'cancelled') {
          return { status: 'cancelled', checkpointsAppended }
        }
        if (event.type === 'tool_call') {
          const priorToolIterations = this.store.countEvents({
            runId: input.run.runId,
            types: ['tool.call.requested'],
          })
          if (priorToolIterations >= this.maxToolIterations) {
            const message = `RunLog tool iteration limit exceeded (${this.maxToolIterations}).`
            this.failRun({
              runId: input.run.runId,
              message,
              retryable: false,
              classification: 'tool_iteration_limit',
              details: { maxToolIterations: this.maxToolIterations },
              idempotencySuffix: 'tool-iteration-limit',
            })
            this.abortQuery(input.run.runId, query)
            return {
              status: this.store.getRun(input.run.runId)?.status ?? 'failed',
              checkpointsAppended,
            }
          }
        }
        await this.recordProviderEvent({
          run: input.run,
          agent: input.agent,
          event,
          query,
          toolRegistry,
          selectedTools: input.selectedTools,
          workspaceRoot: input.workspaceRoot,
          policy: input.policy,
          contextAssemblyId: context.assemblyId,
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
        if (
          latest?.status === 'awaiting_approval' ||
          latest?.status === 'failed' ||
          latest?.status === 'cancelled'
        ) {
          return { status: latest.status, checkpointsAppended }
        }
      }
    } finally {
      if (this.activeQueries.get(input.run.runId) === query) {
        this.activeQueries.delete(input.run.runId)
      }
    }

    const latest = this.store.getRun(input.run.runId)
    if (
      latest?.status === 'awaiting_approval' ||
      latest?.status === 'failed' ||
      latest?.status === 'cancelled'
    ) {
      return { status: latest.status, checkpointsAppended }
    }
    const claim = this.activeClaims.get(input.run.runId)
    const completed = claim
      ? this.store.completeExecution({ claim: this.claimInput(claim), payload: {} })
      : this.store.transitionRunStatus({
          runId: input.run.runId,
          from: ['running'],
          to: 'completed',
          patch: { workerId: undefined, leaseUntil: undefined },
        })
    if (!completed) {
      return {
        status: this.store.getRun(input.run.runId)?.status ?? 'failed',
        checkpointsAppended,
      }
    }
    if (!claim) {
      this.store.appendEvent({ runId: input.run.runId, type: 'run.completed', payload: {} })
    }
    return { status: 'completed', checkpointsAppended }
  }

  private async recordProviderEvent(input: {
    run: RunRecord
    agent: AgentSpec
    event: ProviderEvent
    query: AgentQuery
    toolRegistry: ToolRegistry
    selectedTools: RuntimeTool[]
    workspaceRoot: string
    policy: RuntimePolicy
    contextAssemblyId?: string
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
            ...(input.contextAssemblyId ? { contextAssemblyId: input.contextAssemblyId } : {}),
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
          payload: {
            usage: event.usage,
            providerSessionId: event.providerSessionId,
            ...(input.contextAssemblyId ? { contextAssemblyId: input.contextAssemblyId } : {}),
          },
        })
      case 'progress':
        return this.store.appendEvent({
          runId: run.runId,
          type: 'runtime.warning',
          payload: { message: event.message, phase: 'provider.progress' },
        })
      case 'error':
        if (event.retryable && this.activeClaims.has(run.runId)) {
          this.abortQuery(run.runId, query)
          throw new RunLogExecutionError(
            event.message,
            true,
            event.classification ?? 'provider_error',
          )
        }
        const failure = this.failRun({
          runId: run.runId,
          message: event.message,
          retryable: event.retryable,
          classification: event.classification ?? 'provider_error',
          idempotencySuffix: 'provider-error',
        })
        this.abortQuery(run.runId, query)
        return failure
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
    query: AgentQuery
    toolRegistry: ToolRegistry
    selectedTools: RuntimeTool[]
    workspaceRoot: string
    policy: RuntimePolicy
  }): Promise<RunLogEvent> {
    const toolCallId = input.event.toolCallId ?? `${input.event.name}_${Date.now()}`
    const requestedEvent = this.store.appendEvent({
      runId: input.run.runId,
      type: 'tool.call.requested',
      payload: {
        toolCallId,
        name: input.event.name,
        input: input.event.input,
      },
    })
    const toolController = new AbortController()
    this.activeToolControllers.set(input.run.runId, toolController)
    let result: Awaited<ReturnType<ToolRegistry['execute']>>
    try {
      result = await input.toolRegistry.execute({
        key: input.event.name,
        input: input.event.input,
        toolCallId,
        signal: toolController.signal,
      })
    } catch (error) {
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.failed',
        payload: {
          toolCallId,
          name: input.event.name,
          message: error instanceof Error ? error.message : String(error),
          cancelled: this.store.getRun(input.run.runId)?.status === 'cancelled',
        },
      })
      throw error
    } finally {
      if (this.activeToolControllers.get(input.run.runId) === toolController) {
        this.activeToolControllers.delete(input.run.runId)
      }
    }
    const cancelled = this.store.getRun(input.run.runId)?.status === 'cancelled'
    if (result.status === 'approval_required') {
      if (cancelled) return requestedEvent
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
      const approvalEventPayload = {
        approvalId: result.approval.id,
        toolCallId,
        targetKey: result.approval.targetKey,
        reasons: result.approval.reasons,
        permissionCategories: result.approval.permissionCategories,
        decisionId: result.decisionRecord.decisionId,
        request: publicApprovalRequestSnapshot(snapshot),
      }
      const claim = this.activeClaims.get(input.run.runId)
      if (claim) {
        const awaitingApproval = this.store.pauseRunForApproval({
          claim: this.claimInput(claim),
          request: snapshot,
          approvalEventPayload,
          checkpoint: {
            runId: input.run.runId,
            kind: 'approval',
            state: {
              approvalId: result.approval.id,
              toolCallId,
              targetKey: result.approval.targetKey,
              decisionId: result.decisionRecord.decisionId,
            },
          },
        })
        if (!awaitingApproval) return requestedEvent
        return this.store.listEvents({ runId: input.run.runId, limit: 10_000 }).at(-1) ?? requestedEvent
      }
      const awaitingApproval = this.store.transitionRunStatus({
        runId: input.run.runId,
        from: ['running'],
        to: 'awaiting_approval',
        patch: { workerId: undefined, leaseUntil: undefined },
      })
      if (!awaitingApproval) return requestedEvent
      this.store.putApprovalRequest(snapshot)
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'approval.requested',
        payload: approvalEventPayload,
      })
      if (this.store.getRun(input.run.runId)?.status === 'cancelled') {
        return this.store.appendEvent({
          runId: input.run.runId,
          type: 'approval.cancelled',
          payload: {
            approvalId: result.approval.id,
            toolCallId,
            reason: 'Run was cancelled while the approval request was being persisted.',
          },
          idempotencyKey: `approval.cancelled:${result.approval.id}`,
        })
      }
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
      if (!cancelled) {
        input.query.push(JSON.stringify({ toolCallId, status: 'policy_blocked', payload }))
      }
      return this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.blocked',
        payload,
      })
    }
    const completedEvent = this.store.appendEvent({
      runId: input.run.runId,
      type: 'tool.call.completed',
      payload: {
        toolCallId,
        name: input.event.name,
        output: result.output,
        decisionId: result.decisionRecord.decisionId,
      },
    })
    if (!cancelled) {
      input.query.push(JSON.stringify({ toolCallId, status: 'completed', output: result.output }))
    }
    return completedEvent
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
      ...(input.run.computerId ? { computerId: input.run.computerId } : {}),
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
      keyMode: this.options.approvalReceiptKeyMode,
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
    const toolController = new AbortController()
    this.activeToolControllers.set(input.run.runId, toolController)
    let result: Awaited<ReturnType<ToolRegistry['execute']>>
    try {
      result = await toolRegistry.execute({
        key: request.toolName,
        input: request.toolInput,
        toolCallId: request.toolCallId,
        approvalReceipt: legacyApprovalReceiptFromRunLog(input.receipt, currentRequest),
        signal: toolController.signal,
      })
    } catch (error) {
      this.store.appendEvent({
        runId: input.run.runId,
        type: 'tool.call.failed',
        payload: {
          toolCallId: request.toolCallId,
          name: request.toolName,
          source: 'approved-resume',
          message: error instanceof Error ? error.message : String(error),
          cancelled: this.store.getRun(input.run.runId)?.status === 'cancelled',
        },
      })
      throw error
    } finally {
      if (this.activeToolControllers.get(input.run.runId) === toolController) {
        this.activeToolControllers.delete(input.run.runId)
      }
    }
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
      if (this.store.getRun(input.run.runId)?.status === 'cancelled') return 0
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
      this.failRun({
        runId: input.run.runId,
        message: 'Approved tool was blocked by policy during resume.',
        retryable: false,
        classification: 'approved_tool_policy_blocked',
        idempotencySuffix: 'approved-tool-policy-blocked',
      })
      return 0
    }
    this.failRun({
      runId: input.run.runId,
      message: 'Approved tool requested a second approval during resume.',
      retryable: false,
      classification: 'approval_reentry_blocked',
      idempotencySuffix: 'approval-reentry-blocked',
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
