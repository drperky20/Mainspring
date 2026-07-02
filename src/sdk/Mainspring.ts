import fs from 'node:fs'
import path from 'node:path'
import { MAINSPRING_APP_PROVIDER_ID, createMainspringRuntimeId } from '#protocol'
import type {
  CreateMainspringOptions,
  MainspringApprovalRecord,
  ProviderInitRunContext,
  ProviderInitWarningDetail,
  MainspringSessionRecord,
  MonitoringSnapshot,
  RunEvent,
  RunEventOfType,
  RunRecord,
  RuntimeDiagnostics,
  RuntimeHealth,
  StartRunInput,
  ToolCallBlockedRunEventPayload,
  ToolCallCompletedRunEventPayload,
  ToolCallFailedRunEventPayload,
  ToolCallRequestedRunEventPayload,
  ToolCallUpdatedRunEventPayload,
  UsageUpdatedRunEventPayload,
} from '../contracts/runtime.js'
import {
  latestProviderInitDetailFromRunEvents,
  providerInitDetailFromRunEvent,
} from '../contracts/runtime.js'
import { createPollingEventStream } from '../events/EventStream.js'
import { createDefaultRuntimeTools } from '../runtime/defaultTools.js'
import { RuntimeEngine } from '../runtime/RuntimeEngine.js'
import { createSqliteMainspringStorage } from '../storage/sqlite/SqliteMainspringStorage.js'
import {
  createRuntimeProviderFromEnv,
  runtimeProviderResolveOptionsFromEnv,
} from '../runner/RuntimeProviderConfig.js'
import { createDefaultProviderRegistry } from '../providers/ProviderRegistry.js'
import type { AgentProvider, RuntimeSecretResolver } from '../providers/types.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { ToolRegistry } from '../tools/ToolRegistry.js'
import type { RuntimeProviderInput } from '../runner/RuntimeKernel.js'
import { buildCodingContext } from '../agent/CodingContext.js'
import { buildWorkspaceContext } from '../agent/WorkspaceContext.js'
import { createMemoryContext } from '../memory/MemoryContext.js'

function isTerminalEvent(event: RunEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  )
}

function isRunEventType<T extends RunEvent['type']>(
  event: RunEvent,
  type: T,
): event is RunEventOfType<T> {
  return event.type === type
}

function isToolResultEvent(
  event: RunEvent,
): event is
  | RunEventOfType<'tool.call.completed'>
  | RunEventOfType<'tool.call.failed'>
  | RunEventOfType<'tool.call.blocked'> {
  return (
    event.type === 'tool.call.completed'
    || event.type === 'tool.call.failed'
    || event.type === 'tool.call.blocked'
  )
}

type DerivedProviderUsageContext = ProviderInitRunContext

function providerInitContextFromRunEvent(
  event: RunEvent,
): DerivedProviderUsageContext | null {
  return providerInitDetailFromRunEvent(event)
}

function usageWithDerivedProviderContext(
  payload: UsageUpdatedRunEventPayload,
  context: DerivedProviderUsageContext | null,
): UsageUpdatedRunEventPayload {
  if (!context) return payload
  return {
    ...context,
    ...payload,
    provider: payload.provider ?? context.provider,
    modelId: payload.modelId ?? context.modelId,
    modelFamily: payload.modelFamily ?? context.modelFamily,
    providerTransport: payload.providerTransport ?? context.providerTransport,
    providerSessionId: payload.providerSessionId ?? context.providerSessionId,
  }
}

class MainspringRunHandle {
  constructor(
    private readonly runtime: Mainspring,
    readonly session: MainspringSessionRecord,
    readonly record: RunRecord,
  ) {}

  events(): AsyncIterable<RunEvent> {
    return createPollingEventStream({
      pollIntervalMs: this.runtime.pollIntervalMs,
      loadAfterSeq: (afterSeq) =>
        this.runtime.storage.eventStore.listRunEvents({
          sessionId: this.session.sessionId,
          runId: this.record.runId,
          afterSeq,
          limit: 200,
        }),
      isTerminal: isTerminalEvent,
    })
  }

  status(): RunRecord['status'] {
    const events = this.runtime.storage.eventStore.listRunEvents({
      sessionId: this.session.sessionId,
      runId: this.record.runId,
      limit: 200,
    })
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event.type === 'run.completed') return 'completed'
      if (event.type === 'run.failed') return 'failed'
      if (event.type === 'run.cancelled') return 'cancelled'
      if (event.type === 'approval.requested') return 'waiting_approval'
      if (event.type === 'run.started') return 'running'
    }
    return 'queued'
  }

  async result(): Promise<string | null> {
    const events = this.runtime.storage.eventStore.listRunEvents({
      sessionId: this.session.sessionId,
      runId: this.record.runId,
      limit: 200,
    })
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event.type === 'assistant.text.done') {
        const doneEvent = event as RunEventOfType<'assistant.text.done'>
        return doneEvent.payload.text ?? null
      }
    }
    return null
  }

  usage() {
    return this.runtime.collectUsageForRun(this.session.sessionId, this.record.runId)
  }

  toolCalls() {
    return this.runtime.collectToolCallsForRun(this.session.sessionId, this.record.runId)
  }

  errors() {
    return this.runtime.collectErrorsForRun(this.session.sessionId, this.record.runId)
  }

  cancel(reason?: string): void {
    this.runtime.storage.commandStore.cancelRun(this.session.sessionId, this.record.runId, reason)
  }
}

class MainspringSessionHandle {
  readonly memory

  constructor(private readonly runtime: Mainspring, readonly record: MainspringSessionRecord) {
    this.memory = createMemoryContext({
      workspaceRoot: record.workspaceRoot,
      sessionId: record.sessionId,
    })
  }

  readonly runs = {
    start: (input: StartRunInput) => {
      const systemPrompt =
        input.systemPrompt ??
        (typeof this.record.metadata?.defaultSystemPrompt === 'string'
          ? this.record.metadata.defaultSystemPrompt
          : undefined)
      const run = this.runtime.storage.commandStore.enqueueRun(this.record, {
        ...input,
        ...(systemPrompt ? { systemPrompt } : {}),
      })
      return new MainspringRunHandle(this.runtime, this.record, run)
    },
  }

  readonly workspace = {
    context: () => buildWorkspaceContext(this.record.workspaceRoot),
    codingContext: (query?: string) =>
      buildCodingContext(this.record.workspaceRoot, { query }),
  }

}

export class Mainspring {
  readonly pollIntervalMs: number
  readonly storage
  private readonly engine: RuntimeEngine
  private readonly providerRegistry = new Map<string, AgentProvider>()
  private readonly builtInProviderRegistry = createDefaultProviderRegistry({
    defaultProviderId: MAINSPRING_APP_PROVIDER_ID,
  })
  private readonly builtInProviderDefaults = new Map<string, { credentialRef: string; options?: Record<string, unknown> }>()
  private readonly runtimeTools: RuntimeTool[]
  private readonly secretResolver?: RuntimeSecretResolver
  private activeProviderId = 'default'

  constructor(readonly options: CreateMainspringOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    const envProviderSelection = options.provider
      ? undefined
      : createRuntimeProviderFromEnv(process.env)
    const provider = options.provider ?? envProviderSelection?.provider
    if (!provider) throw new Error('No runtime provider is configured.')
    const defaultProviderId = envProviderSelection?.providerId ?? 'default'
    this.activeProviderId = defaultProviderId
    this.secretResolver = options.secretResolver
    this.runtimeTools = [...(options.tools ?? createDefaultRuntimeTools())]
    this.providerRegistry.set(defaultProviderId, provider)
    if (defaultProviderId !== 'default') this.providerRegistry.set('default', provider)
    for (const providerId of ['openrouter', 'openai'] as const) {
      const defaults = runtimeProviderResolveOptionsFromEnv({
        ...process.env,
        MAINSPRING_PROVIDER: providerId,
      })
      this.builtInProviderDefaults.set(providerId, {
        credentialRef: defaults.credentialRef,
        ...(defaults.options ? { options: defaults.options } : {}),
      })
    }
    for (const [providerId, registeredProvider] of Object.entries(options.providers ?? {})) {
      this.providerRegistry.set(providerId, registeredProvider)
    }
    this.storage = createSqliteMainspringStorage({
      sessionsRoot: path.resolve(options.sessionsRoot),
      workspaceRoot: path.resolve(options.workspaceRoot ?? process.cwd()),
    })
    const defaultModelId = options.modelId ?? envProviderSelection?.modelId
    this.engine = new RuntimeEngine({
      sessionsRoot: path.resolve(options.sessionsRoot),
      workspaceRoot: path.resolve(options.workspaceRoot ?? process.cwd()),
      provider: (input) => this.providerForRuntime(input),
      secretResolver: this.secretResolver,
      ...(defaultModelId ? { defaultModelId } : {}),
      tools: this.runtimeTools,
      policy: options.policy,
      pollIntervalMs: this.pollIntervalMs,
      listSessions: () => this.storage.stateStore.listSessions(),
    })
  }

  private providerForRuntime(input: RuntimeProviderInput): AgentProvider {
    const providerId = input.providerId ?? this.activeProviderId
    const staticProvider = this.providerRegistry.get(providerId)
    const wantsBuiltInCredentialOverride =
      Boolean(input.credentialRef) && (providerId === 'openrouter' || providerId === 'openai')

    if (staticProvider && !wantsBuiltInCredentialOverride) {
      return this.withSecretResolver(staticProvider)
    }

    let provider: AgentProvider
    if (providerId === 'openrouter' || providerId === 'openai') {
      const defaults = this.builtInProviderDefaults.get(providerId)
      provider = this.builtInProviderRegistry.resolve({
        providerId,
        credentialRef: input.credentialRef ?? defaults?.credentialRef,
        options: defaults?.options,
      })
      return this.withSecretResolver(provider)
    }

    if (!staticProvider) throw new Error(`Unknown runtime provider: ${providerId}`)
    return this.withSecretResolver(staticProvider)
  }

  private withSecretResolver(provider: AgentProvider): AgentProvider {
    if (!this.secretResolver) return provider
    return {
      query: (queryInput) =>
        provider.query({
          ...queryInput,
          resolveCredential: (ref) =>
            queryInput.resolveCredential?.(ref) ?? this.secretResolver?.(ref),
        }),
    }
  }

  async start(): Promise<void> {
    await this.engine.start()
  }

  async stop(): Promise<void> {
    await this.engine.stop()
  }

  health(): RuntimeHealth {
    return this.engine.health()
  }

  diagnostics(): RuntimeDiagnostics {
    return {
      engine: this.engine.health(),
      sessions: this.storage.stateStore.listSessions(),
      providers: Array.from(this.providerRegistry.keys()),
    }
  }

  readonly sessions = {
    create: (input: Parameters<Mainspring['storage']['stateStore']['createSession']>[0] = {}) =>
      new MainspringSessionHandle(this, this.storage.stateStore.createSession(input)),
    list: () => this.storage.stateStore.listSessions().map((record) => new MainspringSessionHandle(this, record)),
    get: (sessionId: string) => {
      const record = this.storage.stateStore.getSession(sessionId)
      return record ? new MainspringSessionHandle(this, record) : null
    },
    update: (sessionId: string, input: Parameters<Mainspring['storage']['stateStore']['updateSession']>[1]) =>
      new MainspringSessionHandle(this, this.storage.stateStore.updateSession(sessionId, input)),
    close: (sessionId: string) => this.storage.stateStore.updateSession(sessionId, { status: 'closed' }),
    delete: (sessionId: string) => this.storage.stateStore.deleteSession(sessionId),
    resume: (sessionId: string) => {
      const record = this.storage.stateStore.getSession(sessionId)
      if (!record) throw new Error(`Unknown session: ${sessionId}`)
      if (record.status !== 'open') {
        this.storage.stateStore.updateSession(sessionId, { status: 'open' })
      }
      const next = this.storage.stateStore.getSession(sessionId)
      if (!next) throw new Error(`Unknown session: ${sessionId}`)
      return new MainspringSessionHandle(this, next)
    },
  }

  readonly messages = {
    send: (sessionId: string, input: Omit<StartRunInput, 'mode'>) => {
      const session = this.sessions.get(sessionId)
      if (!session) throw new Error(`Unknown session: ${sessionId}`)
      return session.runs.start({ ...input, mode: 'chat' })
    },
    appendSystem: (sessionId: string, systemPrompt: string) =>
      this.storage.stateStore.updateSession(sessionId, {
        metadata: {
          ...(this.storage.stateStore.getSession(sessionId)?.metadata ?? {}),
          defaultSystemPrompt: systemPrompt,
        },
      }),
    history: (sessionId: string) =>
      this.storage.eventStore.listSessionEvents({ sessionId, limit: 500 }).filter((event) =>
        event.type.startsWith('assistant.text'),
      ),
    exportTranscript: (sessionId: string) =>
      this.messages
        .history(sessionId)
        .map((event) => JSON.stringify(event))
        .join('\n'),
  }

  readonly approvals = {
    list: () => this.collectPendingApprovals(),
    approve: (input: { sessionId: string; runId: string; approvalId: string; reason?: string; response?: unknown }) =>
      this.storage.commandStore.resolveApproval({
        ...input,
        decision: 'approved',
      }),
    deny: (input: { sessionId: string; runId: string; approvalId: string; reason?: string; response?: unknown }) =>
      this.storage.commandStore.resolveApproval({
        ...input,
        decision: 'denied',
      }),
    respond: (input: {
      sessionId: string
      runId: string
      approvalId: string
      decision: 'approved' | 'denied'
      reason?: string
      response?: unknown
    }) => this.storage.commandStore.resolveApproval(input),
  }

  readonly monitoring = {
    snapshot: (): MonitoringSnapshot => this.buildSnapshot(),
    events: (): AsyncIterable<RunEvent> => {
      const lastSeqBySession = new Map<string, number>()
      return createPollingEventStream({
        pollIntervalMs: this.pollIntervalMs,
        loadAfterSeq: () => {
          const events: RunEvent[] = []
          for (const session of this.storage.stateStore.listSessions()) {
            const afterSeq = lastSeqBySession.get(session.sessionId) ?? 0
            const next = this.storage.eventStore.listSessionEvents({
              sessionId: session.sessionId,
              afterSeq,
              limit: 200,
            })
            if (next.length > 0) {
              lastSeqBySession.set(session.sessionId, next[next.length - 1]?.seq ?? afterSeq)
              events.push(...next)
            }
          }
          return events.sort((left, right) =>
            left.timestamp === right.timestamp ? left.seq - right.seq : left.timestamp.localeCompare(right.timestamp),
          )
        },
      })
    },
    auditLog: () =>
      this.storage
        .stateStore
        .listSessions()
        .flatMap((session) => this.storage.eventStore.listSessionEvents({ sessionId: session.sessionId, limit: 200 })),
  }

  readonly tools = {
    register: (tool: RuntimeTool) => {
      const existingIndex = this.runtimeTools.findIndex(
        (candidate) => candidate.manifest.key === tool.manifest.key,
      )
      if (existingIndex >= 0) {
        this.runtimeTools.splice(existingIndex, 1, tool)
        return
      }
      this.runtimeTools.push(tool)
    },
    unregister: (key: string) => {
      const index = this.runtimeTools.findIndex((tool) => tool.manifest.key === key)
      if (index >= 0) this.runtimeTools.splice(index, 1)
    },
    list: () => [...this.runtimeTools],
    describe: (key: string) => this.runtimeTools.find((tool) => tool.manifest.key === key)?.manifest ?? null,
    call: async (input: {
      sessionId: string
      key: string
      toolInput?: unknown
      approvalReceipt?: import('../policy/ApprovalReceipt.js').ApprovalReceipt
    }) => {
      const session = this.storage.stateStore.getSession(input.sessionId)
      if (!session) throw new Error(`Unknown session: ${input.sessionId}`)
      const registry = new ToolRegistry({
        runId: createMainspringRuntimeId('tool'),
        sessionId: input.sessionId,
        workspaceRoot: session.workspaceRoot,
        policy: this.options.policy ?? {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: this.runtimeTools.map((tool) => tool.manifest.key),
          redaction: 'strict',
        },
      })
      registry.registerMany(this.runtimeTools)
      return registry.execute({
        key: input.key,
        input: input.toolInput,
        approvalReceipt: input.approvalReceipt,
      })
    },
  }

  readonly providers = {
    register: (providerId: string, provider: AgentProvider) => {
      this.providerRegistry.set(providerId, provider)
    },
    route: (providerId?: string) => this.providerRegistry.get(providerId ?? this.activeProviderId) ?? null,
    fallback: (providerId: string) => {
      if (!this.providerRegistry.has(providerId)) {
        throw new Error(`Unknown provider: ${providerId}`)
      }
      this.activeProviderId = providerId
    },
    usage: () => this.buildSnapshot().providers.usage,
    list: () => Array.from(this.providerRegistry.keys()),
  }

  collectUsageForRun(sessionId: string, runId: string) {
    const events = this.storage.eventStore.listRunEvents({ sessionId, runId, limit: 200 })
    const providerInitContext = latestProviderInitDetailFromRunEvents(events)
    return events
      .filter((event): event is RunEventOfType<'usage.updated'> => isRunEventType(event, 'usage.updated'))
      .map((event) => usageWithDerivedProviderContext(event.payload, providerInitContext))
  }

  collectToolCallsForRun(sessionId: string, runId: string) {
    return this.storage.eventStore
      .listRunEvents({ sessionId, runId, limit: 200 })
      .filter(
        (
          event,
        ): event is
          | RunEventOfType<'tool.call.requested'>
          | RunEventOfType<'tool.call.updated'>
          | RunEventOfType<'tool.call.completed'>
          | RunEventOfType<'tool.call.failed'>
          | RunEventOfType<'tool.call.blocked'> => event.type.startsWith('tool.call'),
      )
  }

  collectErrorsForRun(sessionId: string, runId: string) {
    return this.storage.eventStore
      .listRunEvents({ sessionId, runId, limit: 200 })
      .filter((event) => event.type === 'runtime.error' || event.type === 'run.failed')
  }

  private collectPendingApprovals(): MainspringApprovalRecord[] {
    const pending = new Map<string, MainspringApprovalRecord>()
    for (const session of this.storage.stateStore.listSessions()) {
      const events = this.storage.eventStore.listSessionEvents({ sessionId: session.sessionId, limit: 500 })
      for (const event of events) {
        if (event.type === 'approval.requested') {
          const payload = event.payload as Record<string, unknown>
          const approvalId =
            typeof payload.id === 'string'
              ? payload.id
              : typeof payload.approvalId === 'string'
                ? payload.approvalId
                : createMainspringRuntimeId('approval')
          pending.set(approvalId, {
            approvalId,
            runId: event.runId,
            sessionId: event.sessionId,
            status: 'pending',
            requestedAt: event.timestamp,
            targetKey: typeof payload.targetKey === 'string' ? payload.targetKey : undefined,
            reasons: Array.isArray(payload.reasons) ? payload.reasons.map(String) : [],
            permissionCategories: Array.isArray(payload.permissionCategories)
              ? payload.permissionCategories.map(String)
              : [],
          })
        }
        if (event.type === 'approval.approved' || event.type === 'approval.denied') {
          const payload = event.payload as Record<string, unknown>
          const approvalId =
            typeof payload.id === 'string'
              ? payload.id
              : typeof payload.approvalId === 'string'
                ? payload.approvalId
                : null
          if (!approvalId) continue
          const existing = pending.get(approvalId)
          if (!existing) continue
          existing.status = event.type === 'approval.approved' ? 'approved' : 'denied'
          existing.resolvedAt = event.timestamp
          pending.delete(approvalId)
        }
      }
    }
    return [...pending.values()].sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
  }

  private buildSnapshot(): MonitoringSnapshot {
    const sessions = this.storage.stateStore.listSessions()
    const allEvents = sessions.flatMap((session) =>
      this.storage.eventStore.listSessionEvents({ sessionId: session.sessionId, limit: 500 }),
    )
    const activeRuns = new Map<string, RunRecord['status']>()
    const providerInitContextByRun = new Map<string, DerivedProviderUsageContext>()
    const recentTools: MonitoringSnapshot['tools']['recent'] = []
    const usage: MonitoringSnapshot['providers']['usage'] = []

    for (const event of allEvents) {
      const providerInitContext = providerInitContextFromRunEvent(event)
      if (providerInitContext) providerInitContextByRun.set(event.runId, providerInitContext)
      if (event.type === 'run.started') activeRuns.set(event.runId, 'running')
      if (event.type === 'approval.requested') activeRuns.set(event.runId, 'waiting_approval')
      if (event.type === 'run.completed') activeRuns.set(event.runId, 'completed')
      if (event.type === 'run.failed') activeRuns.set(event.runId, 'failed')
      if (event.type === 'run.cancelled') activeRuns.set(event.runId, 'cancelled')
      if (event.type === 'tool.call.requested') {
        const payload = (event as RunEventOfType<'tool.call.requested'>).payload
        recentTools.push({
          runId: event.runId,
          sessionId: event.sessionId,
          name: payload.name,
          status: 'requested',
          timestamp: event.timestamp,
        })
      }
      if (event.type === 'tool.call.updated') {
        const payload: ToolCallUpdatedRunEventPayload =
          (event as RunEventOfType<'tool.call.updated'>).payload
        recentTools.push({
          runId: event.runId,
          sessionId: event.sessionId,
          name: payload.toolCallId,
          status: 'updated',
          timestamp: event.timestamp,
        })
      }
      if (isToolResultEvent(event)) {
        const payload:
          | ToolCallCompletedRunEventPayload
          | ToolCallFailedRunEventPayload
          | ToolCallBlockedRunEventPayload = event.payload
        recentTools.push({
          runId: event.runId,
          sessionId: event.sessionId,
          name: payload.name,
          status:
            event.type === 'tool.call.completed'
              ? 'completed'
              : event.type === 'tool.call.failed'
                ? 'failed'
                : 'blocked',
          timestamp: event.timestamp,
        })
      }
      if (event.type === 'usage.updated') {
        const payload = usageWithDerivedProviderContext(
          (event as RunEventOfType<'usage.updated'>).payload,
          providerInitContextByRun.get(event.runId) ?? null,
        )
        if (
          typeof payload.inputTokens === 'number'
          && typeof payload.outputTokens === 'number'
          && typeof payload.totalTokens === 'number'
        ) {
          usage.push({
            provider: payload.provider,
            model: payload.modelId,
            inputTokens: payload.inputTokens,
            outputTokens: payload.outputTokens,
            totalTokens: payload.totalTokens,
          })
        }
      }
    }

    return {
      sessions: {
        total: sessions.length,
        open: sessions.filter((session) => session.status === 'open').length,
      },
      runs: {
        active: [...activeRuns.values()].filter((status) => status === 'running' || status === 'waiting_approval').length,
        completed: [...activeRuns.values()].filter((status) => status === 'completed').length,
        failed: [...activeRuns.values()].filter((status) => status === 'failed').length,
        cancelled: [...activeRuns.values()].filter((status) => status === 'cancelled').length,
      },
      approvals: {
        pending: this.collectPendingApprovals().length,
        recent: this.collectPendingApprovals().slice(-10),
      },
      tools: {
        recent: recentTools.slice(-20),
      },
      providers: {
        usage: usage.slice(-20),
      },
      health: this.health(),
    }
  }
}

export function createMainspring(options: CreateMainspringOptions): Mainspring {
  return new Mainspring(options)
}
