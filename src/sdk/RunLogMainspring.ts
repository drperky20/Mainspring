import path from 'node:path'
import type { RuntimePolicy } from '#protocol'
import { SqliteRunLogStore } from '../adapters/sqlite/SqliteRunLogStore.js'
import { LocalWorkspaceAdapter } from '../capabilities/workspace/LocalWorkspaceAdapter.js'
import {
  RunLogKernel,
  SingleProviderRouter,
  StaticProviderRouter,
  type AgentSpec,
  type DecideRunLogApprovalInput,
  type ListRunsInput,
  type ListRunLogToolCallSummariesInput,
  type ProviderRouter,
  type RunExecutionSummary,
  type RunIntent,
  type RunLogApprovalReceipt,
  type RunLogEvent,
  type RunLogStore,
  type RunLogToolCallSummary,
  type RunRecord,
  type RuntimeToolSessionFactory,
} from '../core/index.js'
import {
  projectRunLogRun,
  type RunLogRunProjection,
} from '../hosts/runlog/RunLogProjection.js'
import { RunLogProjector } from '../hosts/runlog/RunLogProjector.js'
import type { AgentProvider } from '../providers/types.js'
import type { RuntimeSecretResolver } from '../providers/types.js'
import { createDefaultRuntimeTools } from '../runtime/defaultTools.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { createRunLogId } from '../core/ids.js'
import { createHostDecisionRecord } from '../policy/DecisionRecord.js'

const DEFAULT_AGENT_ID = 'agent_default'

export interface CreateRunLogMainspringOptions {
  rootPath?: string
  dbPath?: string
  workspaceRoot?: string
  store?: RunLogStore
  provider?: AgentProvider
  providers?: Record<string, AgentProvider>
  defaultProviderId?: string
  providerRouter?: ProviderRouter
  agent?: Partial<AgentSpec> & Pick<AgentSpec, 'instructions'>
  agents?: AgentSpec[]
  tools?: RuntimeTool[]
  policy?: RuntimePolicy
  approvalReceiptKey?: string
  approvalReceiptKeyMode?: 'local-dev' | 'configured'
  secretResolver?: RuntimeSecretResolver
  workerId?: string
  leaseMs?: number
  maxConcurrentRuns?: number
  pollIntervalMs?: number
  heartbeatIntervalMs?: number
  retryBaseMs?: number
  retryCapMs?: number
  maxToolIterations?: number
  toolSessionFactory?: RuntimeToolSessionFactory
}

export type StartRunLogRunInput = Omit<RunIntent, 'agentId'> & {
  agentId?: string
}

/**
 * A child run is intentionally an attenuating operation. It can supply a new
 * prompt and metadata, but inherits execution identity and all authority
 * bearing fields from its parent rather than accepting caller-controlled
 * workspace, provider, credential, or tool overrides.
 */
export type StartChildRunLogInput = Pick<RunIntent, 'input' | 'runId' | 'metadata'> & {
  parentRunId: string
}

export class RunLogMainspringRunHandle {
  constructor(
    private readonly runtime: RunLogMainspring,
    readonly record: RunRecord,
  ) {}

  projection(limit?: number): RunLogRunProjection {
    return this.runtime.project(this.record.runId, limit)
  }

  events(limit?: number): RunLogEvent[] {
    return this.projection(limit).events
  }

  status(): RunRecord['status'] {
    return this.runtime.store.getRun(this.record.runId)?.status ?? this.record.status
  }

  result(): string | null {
    const text = this.projection().assistantText
    return text.length > 0 ? text : null
  }

  async drainUntilIdle(maxRuns?: number): Promise<RunExecutionSummary[]> {
    return await this.runtime.drainUntilIdle(maxRuns)
  }

  cancel(reason?: string): RunRecord {
    return this.runtime.runs.cancel(this.record.runId, reason)
  }

  approve(input: Omit<DecideRunLogApprovalInput, 'approvalId'> & { approvalId?: string } = {}): RunLogApprovalReceipt {
    return this.runtime.approvals.approve({
      ...input,
      approvalId: input.approvalId ?? this.requiredPendingApprovalId(),
    })
  }

  deny(input: Omit<DecideRunLogApprovalInput, 'approvalId'> & { approvalId?: string } = {}): RunLogApprovalReceipt {
    return this.runtime.approvals.deny({
      ...input,
      approvalId: input.approvalId ?? this.requiredPendingApprovalId(),
    })
  }

  startChild(input: Omit<StartChildRunLogInput, 'parentRunId'>): RunLogMainspringRunHandle {
    return this.runtime.runs.startChild({ ...input, parentRunId: this.record.runId })
  }

  private requiredPendingApprovalId(): string {
    const approvalId = this.projection().pendingApprovals[0]?.approvalId
    if (!approvalId) throw new Error(`Run ${this.record.runId} has no pending RunLog approval.`)
    return approvalId
  }
}

export class RunLogMainspring {
  readonly store: RunLogStore
  readonly kernel: RunLogKernel
  readonly defaultAgentId: string

  constructor(readonly options: CreateRunLogMainspringOptions) {
    const rootPath = path.resolve(options.rootPath ?? process.cwd(), '.mainspring')
    const workspaceRoot = path.resolve(options.workspaceRoot ?? path.join(rootPath, 'workspaces'))
    this.store =
      options.store ??
      new SqliteRunLogStore({
        dbPath: path.resolve(options.dbPath ?? path.join(rootPath, 'runlog.sqlite')),
      })
    this.defaultAgentId = options.agent?.agentId ?? options.agents?.[0]?.agentId ?? DEFAULT_AGENT_ID
    this.kernel = new RunLogKernel({
      store: this.store,
      providerRouter: resolveProviderRouter(options),
      tools: options.tools ?? createDefaultRuntimeTools(),
      workspace: new LocalWorkspaceAdapter(workspaceRoot),
      defaultWorkspaceRoot: workspaceRoot,
      policy: options.policy,
      approvalReceiptKey: options.approvalReceiptKey,
      approvalReceiptKeyMode: options.approvalReceiptKeyMode ?? 'local-dev',
      secretResolver: options.secretResolver,
      workerId: options.workerId,
      leaseMs: options.leaseMs,
      maxConcurrentRuns: options.maxConcurrentRuns,
      pollIntervalMs: options.pollIntervalMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      retryBaseMs: options.retryBaseMs,
      retryCapMs: options.retryCapMs,
      maxToolIterations: options.maxToolIterations,
      toolSessionFactory: options.toolSessionFactory,
    })

    this.putAgent({
      agentId: this.defaultAgentId,
      instructions: options.agent?.instructions ?? 'You are a concise Mainspring RunLog agent.',
      providerId: options.agent?.providerId ?? options.defaultProviderId,
      modelId: options.agent?.modelId,
      tools: options.agent?.tools,
      memoryScope: options.agent?.memoryScope,
      workspacePolicy: options.agent?.workspacePolicy ?? 'lazy',
      approvalPolicy: options.agent?.approvalPolicy,
      capabilities: options.agent?.capabilities ?? ['provider'],
      metadata: options.agent?.metadata,
    })
    for (const agent of options.agents ?? []) this.putAgent(agent)
  }

  readonly agents = {
    put: (spec: AgentSpec): void => this.putAgent(spec),
    list: (): AgentSpec[] => this.store.listAgents(),
  }

  readonly runs = {
    start: (input: StartRunLogRunInput): RunLogMainspringRunHandle => {
      const run = this.kernel.startRun({
        ...input,
        agentId: input.agentId ?? this.defaultAgentId,
      })
      return new RunLogMainspringRunHandle(this, run)
    },
    startChild: (input: StartChildRunLogInput): RunLogMainspringRunHandle => {
      const parent = this.store.getRun(input.parentRunId)
      if (!parent) throw new Error(`Unknown parent RunLog run: ${input.parentRunId}`)
      const childRunId = input.runId ?? createRunLogId('run')
      if (this.store.getRun(childRunId)) throw new Error(`Run already exists: ${childRunId}`)
      const decision = createHostDecisionRecord({
        runId: parent.runId,
        sessionId: parent.sessionId,
        surface: 'subagent',
        operation: 'subagent.create',
        targetKey: childRunId,
        state: 'allow',
        reasons: ['Child run authority is attenuated to the parent execution scope.'],
        permissionCategories: ['subagent', 'authority-attenuation'],
        input: {
          childRunId,
          parentRunId: parent.runId,
          agentId: parent.agentId,
          workspaceId: parent.workspaceId,
          computerId: parent.computerId,
          providerId: parent.providerId,
          modelId: parent.modelId,
          allowedTools: parent.allowedTools,
        },
        metadata: { childRunId, parentRunId: parent.runId, authority: 'inherited' },
      })
      this.store.appendEvent({
        runId: parent.runId,
        type: 'policy.decision.recorded',
        visibility: 'public',
        payload: decision,
      })
      const run = this.kernel.startRun({
        runId: childRunId,
        parentRunId: parent.runId,
        agentId: parent.agentId,
        sessionId: parent.sessionId,
        input: input.input,
        workspaceId: parent.workspaceId,
        workspaceRoot: parent.workspaceRoot,
        computerId: parent.computerId,
        providerId: parent.providerId,
        modelId: parent.modelId,
        credentialRef: parent.credentialRef,
        allowedTools: parent.allowedTools,
        metadata: input.metadata,
      })
      return new RunLogMainspringRunHandle(this, run)
    },
    project: (runId: string, limit?: number): RunLogRunProjection => this.project(runId, limit),
    list: (input?: ListRunsInput): RunRecord[] => this.store.listRuns(input),
    cancel: (runId: string, reason?: string): RunRecord =>
      this.kernel.cancelRun({ runId, reason }),
    drainOnce: async (): Promise<RunExecutionSummary | null> => await this.kernel.drainOnce(),
    drainUntilIdle: async (maxRuns?: number): Promise<RunExecutionSummary[]> =>
      await this.kernel.drainUntilIdle(maxRuns),
  }

  readonly approvals = {
    approve: (input: DecideRunLogApprovalInput): RunLogApprovalReceipt =>
      this.kernel.approveRunLogApproval(input),
    deny: (input: DecideRunLogApprovalInput): RunLogApprovalReceipt =>
      this.kernel.denyRunLogApproval(input),
  }

  readonly toolCalls = {
    list: (input?: ListRunLogToolCallSummariesInput): RunLogToolCallSummary[] => {
      new RunLogProjector(this.store).catchUpToolCallsUntilIdle()
      return this.store.listRunToolCallSummaries(input)
    },
  }

  putAgent(spec: AgentSpec): void {
    this.kernel.putAgent(spec)
  }

  project(runId: string, limit?: number): RunLogRunProjection {
    return projectRunLogRun({ store: this.store, runId, limit })
  }

  async drainUntilIdle(maxRuns?: number): Promise<RunExecutionSummary[]> {
    return await this.kernel.drainUntilIdle(maxRuns)
  }

  startWorker(): void {
    this.kernel.startWorker()
  }

  async stopWorker(): Promise<void> {
    await this.kernel.stopWorker()
  }

  close(): void {
    const maybeClose = this.store as RunLogStore & { close?: () => void }
    maybeClose.close?.()
  }
}

function resolveProviderRouter(options: CreateRunLogMainspringOptions): ProviderRouter {
  if (options.providerRouter) return options.providerRouter
  if (options.provider) return new SingleProviderRouter(options.provider)
  const providers = options.providers ?? {}
  const providerIds = Object.keys(providers)
  if (providerIds.length === 0) {
    throw new Error('No RunLog provider is configured.')
  }
  return new StaticProviderRouter({
    defaultProviderId: options.defaultProviderId ?? providerIds[0] ?? 'default',
    providers,
  })
}

export function createRunLogMainspring(options: CreateRunLogMainspringOptions): RunLogMainspring {
  return new RunLogMainspring(options)
}
