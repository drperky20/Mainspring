import {
  ApprovalResponseInboundContentSchema,
  createMainspringRuntimeId,
  GatewayRunDispatchSchema,
  parseJsonValue,
  redactRuntimeSensitiveText,
  RunCancelInboundContentSchema,
  RuntimePolicySchema,
  RuntimeSecretRefSchema,
  ProviderUsageSchema,
  runtimeErrorMessage,
  sanitizeRuntimeResponse,
  type MainspringEvent,
  type GatewayRunDispatch,
  type RuntimePolicy,
} from '#protocol'
import path from 'node:path'
import { MainspringMailbox, type InboundMessage } from '../mailbox/SqliteMailbox.js'
import { PROVIDER_INIT_LOG_MESSAGE } from '../contracts/runtime.js'
import type {
  AgentProvider,
  AgentQuery,
  ProviderEvent,
  ProviderMessage,
  QueryInput,
  RuntimeSecretResolver,
} from '../providers/types.js'
import type { ProjectedTurnEvent } from '../agent/TurnLifecycle.js'
import { approvalRequestedEvent, buildApprovalRequest } from '../policy/ApprovalPolicy.js'
import { createApprovalReceipt, type ApprovalReceipt } from '../policy/ApprovalReceipt.js'
import { RuntimePolicyGuard } from '../policy/PolicyGuard.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { ToolResultStorage } from '../tools/ToolResultStorage.js'
import { ToolRegistry } from '../tools/ToolRegistry.js'
import { estimateUsageCost } from '../usage/UsageAccounting.js'
import { modelPricingCatalogFromEnv, type ModelPricing } from '../usage/ModelPricing.js'
import { CancellationController } from './CancellationController.js'
import { ContinuationStore } from './ContinuationStore.js'
import { AgentRunLoop } from '../agent/AgentRunLoop.js'

export interface RuntimeKernelResult {
  processed: number
  messageIds: string[]
  runIds: string[]
}

export interface RuntimeWorkspaceRootInput {
  runId: string
  sessionId: string
  dispatch?: GatewayRunDispatch
}

export interface RuntimeProviderInput {
  runId: string
  sessionId: string
  dispatch?: GatewayRunDispatch
  providerId?: string
  credentialRef?: string
}

export interface RuntimeKernelOptions {
  mailbox: MainspringMailbox
  provider: AgentProvider | ((input: RuntimeProviderInput) => AgentProvider)
  cwd: string | ((input: RuntimeWorkspaceRootInput) => string)
  systemPrompt?: string
  env?: Record<string, string | undefined>
  secretResolver?: RuntimeSecretResolver
  defaultModelId?: string
  tools?: RuntimeTool[]
  policy?: RuntimePolicy | RuntimePolicyGuard
  pricingCatalog?: readonly ModelPricing[]
  staleProcessingAckAfterMs?: number
}

export interface RunUntilIdleOptions {
  maxIterations?: number
  waitForActiveQueries?: boolean
}

type ActiveQuery = {
  runId: string
  sessionId: string
  messageId: string
  query: AgentQuery
  pump: Promise<void>
  providerError?: { message: string; retryable?: boolean }
  fallbackToolCallIds: Map<string, string[]>
  policy: RuntimePolicyGuard
  cwd: string
  computerId?: string
  abortController?: AbortController
  budgetEstimatedCostUsd: number
}

type ProviderPendingToolApproval = {
  kind: 'provider'
  active: ActiveQuery
  toolName: string
  input: unknown
  toolCallId: string
}

type PreProviderPendingToolApproval = {
  kind: 'pre_provider'
  runId: string
  sessionId: string
  toolName: string
  input: unknown
  toolCallId: string
  policy: RuntimePolicyGuard
  cwd?: string
  computerId?: string
}

type PendingToolApproval = ProviderPendingToolApproval | PreProviderPendingToolApproval
type ProviderToolEventMode = 'managed_tools' | 'warn_on_tool_events' | 'legacy_no_runtime_tools'
type ToolRegistryExecutionResult =
  | { status: 'completed'; output: unknown }
  | { status: 'approval_required'; approvalId: string }
  | { status: 'policy_blocked'; output: unknown }
  | { status: 'failed'; error: string }

const PRE_PROVIDER_APPROVAL_STATE_PREFIX = 'pendingPreProviderToolApproval:'

function preProviderApprovalStateKey(approvalId: string): string {
  return `${PRE_PROVIDER_APPROVAL_STATE_PREFIX}${approvalId}`
}

function pendingApprovalRunId(pending: PendingToolApproval): string {
  return pending.kind === 'provider' ? pending.active.runId : pending.runId
}

function parseStoredPreProviderApproval(value: unknown): PreProviderPendingToolApproval | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const policy = RuntimePolicySchema.safeParse(record.policy)
  const runId = typeof record.runId === 'string' && record.runId ? record.runId : null
  const sessionId =
    typeof record.sessionId === 'string' && record.sessionId ? record.sessionId : null
  const toolName = typeof record.toolName === 'string' && record.toolName ? record.toolName : null
  const toolCallId =
    typeof record.toolCallId === 'string' && record.toolCallId ? record.toolCallId : null
  if (!policy.success || !runId || !sessionId || !toolName || !toolCallId) return null
  return {
    kind: 'pre_provider',
    runId,
    sessionId,
    toolName,
    input: record.input,
    toolCallId,
    policy: new RuntimePolicyGuard(policy.data),
    cwd: typeof record.cwd === 'string' && record.cwd.trim() ? record.cwd : undefined,
    computerId:
      typeof record.computerId === 'string' && record.computerId.trim()
        ? record.computerId
        : undefined,
  }
}

export function formatRuntimeInboundPrompt(message: InboundMessage): {
  dispatch?: GatewayRunDispatch
  prompt: string
  systemPrompt?: string
} {
  if (message.dispatch.success) {
    const dispatch = GatewayRunDispatchSchema.parse(message.dispatch.data)
    return {
      dispatch,
      prompt: dispatch.intent.message,
      systemPrompt: dispatch.intent.systemPrompt,
    }
  }

  return { prompt: message.content }
}

function createProviderToolCallId(toolName: string): string {
  return createMainspringRuntimeId(toolName)
}

function providerToolCallIdForCall(
  active: ActiveQuery,
  event: Extract<ProviderEvent, { type: 'tool_call' }>,
): string {
  if (event.toolCallId) return event.toolCallId
  const id = createProviderToolCallId(event.name)
  const existing = active.fallbackToolCallIds.get(event.name) ?? []
  existing.push(id)
  active.fallbackToolCallIds.set(event.name, existing)
  return id
}

function providerToolCallIdForResult(
  active: ActiveQuery,
  event: Extract<ProviderEvent, { type: 'tool_result' }>,
): string {
  if (event.toolCallId) return event.toolCallId
  const existing = active.fallbackToolCallIds.get(event.name)
  const id = existing?.shift() ?? createProviderToolCallId(event.name)
  if (existing && existing.length === 0) active.fallbackToolCallIds.delete(event.name)
  return id
}

function emptyResult(): RuntimeKernelResult {
  return { processed: 0, messageIds: [], runIds: [] }
}

function promptWithAssistantHistory(prompt: string, history: string[]): string {
  if (history.length === 0) return prompt
  return [
    'Authoritative conversation history from this same session:',
    'Use this history as real session state. If the current user asks you to remember, repeat, or continue something, answer from this history instead of denying memory.',
    'Previous assistant messages:',
    history.map((message, index) => `[${index + 1}] ${message}`).join('\n\n'),
    'Current user message:',
    prompt,
  ].join('\n\n')
}

function providerToolChoice(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
): { type: 'function'; name: string } | 'auto' {
  const dispatch = formatted.dispatch
  if (!dispatch || dispatch.intent.mode !== 'task') return 'auto'
  const [toolName] = dispatch.policy.allowedTools
  return dispatch.policy.allowedTools.length === 1 && toolName
    ? { type: 'function', name: toolName }
    : 'auto'
}

function runtimePolicyFromInput(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
  fallback: RuntimeKernelOptions['policy'],
): RuntimePolicyGuard {
  if (formatted.dispatch) return new RuntimePolicyGuard(formatted.dispatch.policy)
  if (fallback instanceof RuntimePolicyGuard) return fallback
  if (fallback) return new RuntimePolicyGuard(fallback)
  return new RuntimePolicyGuard(RuntimePolicyGuard.defaultPolicy())
}

function preProviderToolInput(toolKey: string, prompt: string): unknown {
  if (toolKey === 'shell.exec') {
    const command =
      prompt.match(/\bshell\s+command\s+(.+?)(?:\.|$)/i)?.[1]?.trim() ??
      prompt.match(/\b(?:command|run|running)\s+(.+?)(?:\.|$)/i)?.[1]?.trim()
    return { command: command || prompt }
  }
  return {}
}

function runtimeTextMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string') return redactRuntimeSensitiveText(value)
  return runtimeErrorMessage(value, fallback)
}

function runtimeFeedbackValue(value: unknown): unknown {
  return sanitizeRuntimeResponse(value)
}

function runtimeModelIdFromInput(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
  fallback?: string,
): string | undefined {
  return formatted.dispatch?.intent.runtimeOptions?.modelId ?? fallback
}

function runtimeProviderIdFromInput(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
): string | undefined {
  return formatted.dispatch?.intent.runtimeOptions?.providerId
}

function runtimeCredentialRefFromInput(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
): string | undefined {
  return formatted.dispatch?.intent.runtimeOptions?.credentialRef
}

function parsedRuntimeCredentialRefFromInput(
  formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
): import('../providers/types.js').RuntimeCredentialRef | undefined {
  const credentialRef = runtimeCredentialRefFromInput(formatted)
  return credentialRef ? RuntimeSecretRefSchema.parse(credentialRef) : undefined
}

function serializeReplayContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  return JSON.stringify(sanitizeRuntimeResponse(value))
}

export class RuntimeKernel {
  private readonly activeQueries = new Map<string, ActiveQuery>()
  private readonly cancellations = new CancellationController()
  private readonly cancelledRuns = new Set<string>()
  private readonly pendingToolApprovals = new Map<string, PendingToolApproval>()
  private readonly continuationStore: ContinuationStore
  private readonly toolResultStorage = new ToolResultStorage()
  private readonly pricingCatalog: readonly ModelPricing[]

  constructor(private readonly options: RuntimeKernelOptions) {
    this.pricingCatalog = options.pricingCatalog ?? modelPricingCatalogFromEnv(options.env)
    this.options.mailbox.recoverStaleProcessingAcks({
      staleAfterMs: options.staleProcessingAckAfterMs,
    })
    this.continuationStore = new ContinuationStore(options.mailbox.paths.outboundDbPath)
  }

  private resolveCwd(input: RuntimeWorkspaceRootInput): string {
    const raw =
      typeof this.options.cwd === 'function' ? this.options.cwd(input) : this.options.cwd
    const resolved = path.resolve(raw)
    if (!resolved.trim()) {
      throw new Error(`Unable to resolve workspace root for session ${input.sessionId}.`)
    }
    return resolved
  }

  private resolveProvider(input: RuntimeProviderInput): AgentProvider {
    return typeof this.options.provider === 'function'
      ? this.options.provider(input)
      : this.options.provider
  }

  async runOnce(): Promise<RuntimeKernelResult> {
    const [message] = this.options.mailbox.readPending(1)
    if (!message) return emptyResult()
    if (message.trigger !== 1) return emptyResult()

    const formatted = formatRuntimeInboundPrompt(message)
    const runId = formatted.dispatch?.runId ?? message.runId
    const sessionId = message.sessionId

    this.options.mailbox.touchHeartbeat()
    this.options.mailbox.markAck(message.id, 'processing')

    if (message.kind === 'run_cancel') {
      return this.handleRunCancel(message, runId, sessionId)
    }

    if (message.kind === 'approval_response') {
      return this.handleApprovalResponse(message, runId, sessionId)
    }

    const active = this.activeQueries.get(runId)
    if (active) {
      active.query.push(formatted.prompt)
      this.options.mailbox.markAck(message.id, 'completed')
      return { processed: 1, messageIds: [message.id], runIds: [runId] }
    }

    this.startProviderQuery(message, formatted, runId, sessionId)
    return { processed: 1, messageIds: [message.id], runIds: [runId] }
  }

  async runUntilIdle(options: RunUntilIdleOptions = {}): Promise<RuntimeKernelResult> {
    const maxIterations = options.maxIterations ?? 100
    const summary = emptyResult()

    for (let index = 0; index < maxIterations; index += 1) {
      const result = await this.runOnce()
      if (result.processed === 0) break
      summary.processed += result.processed
      summary.messageIds.push(...result.messageIds)
      summary.runIds.push(...result.runIds)
    }

    if (options.waitForActiveQueries) {
      await this.waitForActiveQueries()
    }

    return summary
  }

  async waitForActiveQueries(): Promise<void> {
    while (this.activeQueries.size > 0) {
      await Promise.all([...this.activeQueries.values()].map((active) => active.pump))
    }
  }

  private handleRunCancel(
    message: InboundMessage,
    fallbackRunId: string,
    sessionId: string,
  ): RuntimeKernelResult {
    const cancel = RunCancelInboundContentSchema.safeParse(
      parseJsonValue<unknown>(message.content, message.content),
    )
    const runId = cancel.success ? cancel.data.runId : fallbackRunId
    this.cancelledRuns.add(runId)
    this.cancellations.abort(runId)
    this.activeQueries.get(runId)?.abortController?.abort()
    for (const [approvalId, pending] of this.pendingToolApprovals) {
      if (pendingApprovalRunId(pending) === runId) {
        this.pendingToolApprovals.delete(approvalId)
      }
    }
    this.deleteStoredPreProviderApprovalsForRun(runId)
    this.status(runId, sessionId, 'cancelled', 'cancelled')
    this.options.mailbox.markAck(message.id, 'completed')
    return { processed: 1, messageIds: [message.id], runIds: [runId] }
  }

  private async handleApprovalResponse(
    message: InboundMessage,
    runId: string,
    sessionId: string,
  ): Promise<RuntimeKernelResult> {
    const approval = ApprovalResponseInboundContentSchema.safeParse(
      parseJsonValue<unknown>(message.content, message.content),
    )
    const resolved = approval.success ? approval.data : undefined
    const approvalId = resolved?.approvalId
    const pending = approvalId ? this.resolvePendingToolApprovalRecord(approvalId) : undefined
    this.ev(sessionId, {
      type: 'approval.resolved',
      runId: resolved ? resolved.runId : runId,
      approval: resolved ?? parseJsonValue<unknown>(message.content, message.content),
    })

    if (resolved && pending) {
      await this.resolvePendingToolApproval(pending, resolved.approvalId, resolved.decision)
    }

    this.options.mailbox.markAck(message.id, 'completed')
    return { processed: 1, messageIds: [message.id], runIds: [runId] }
  }

  private resolvePendingToolApprovalRecord(approvalId: string): PendingToolApproval | undefined {
    const pending = this.pendingToolApprovals.get(approvalId)
    if (pending) {
      this.pendingToolApprovals.delete(approvalId)
      this.continuationStore.deleteJson(preProviderApprovalStateKey(approvalId))
      return pending
    }

    const stored = parseStoredPreProviderApproval(
      this.continuationStore.getJson(preProviderApprovalStateKey(approvalId)),
    )
    if (stored) {
      this.continuationStore.deleteJson(preProviderApprovalStateKey(approvalId))
      return stored
    }

    return undefined
  }

  private deleteStoredPreProviderApprovalsForRun(runId: string): void {
    for (const entry of this.continuationStore.listJsonByPrefix(
      PRE_PROVIDER_APPROVAL_STATE_PREFIX,
    )) {
      const pending = parseStoredPreProviderApproval(entry.value)
      if (pending?.runId === runId) this.continuationStore.deleteJson(entry.key)
    }
  }

  private async resolvePendingToolApproval(
    pending: PendingToolApproval,
    approvalId: string,
    decision: 'approved' | 'denied',
  ): Promise<void> {
    if (decision === 'denied') {
      this.writeDeniedToolResult(pending, approvalId)
      if (pending.kind === 'pre_provider') {
        this.status(pending.runId, pending.sessionId, 'failed', 'approval')
      }
      return
    }

    if (pending.kind === 'pre_provider') {
      await this.executePreProviderToolCall(pending, approvalId)
      return
    }

    const approvalReceipt = createApprovalReceipt({
      approvalId,
      runId: pending.active.runId,
      targetKey: pending.toolName,
      toolInput: pending.input,
      scope: `session:${pending.active.sessionId}`,
    })
    await this.executeToolCall(
      { type: 'tool_call', name: pending.toolName, input: pending.input },
      pending.active,
      { approvalReceipt, toolCallId: pending.toolCallId },
    )
  }

  private writeDeniedToolResult(pending: PendingToolApproval, approvalId: string): void {
    const runId = pending.kind === 'provider' ? pending.active.runId : pending.runId
    const sessionId = pending.kind === 'provider' ? pending.active.sessionId : pending.sessionId
    this.toolResult(runId, sessionId, pending.toolCallId, pending.toolName, {
      denied: true,
      approvalId,
    })
    if (pending.kind === 'provider') {
      this.pushTool(pending.active, {
        type: 'tool_result',
        name: pending.toolName,
        status: 'denied',
        approvalId,
      })
    }
  }

  private async executePreProviderToolCall(
    pending: PreProviderPendingToolApproval,
    approvalId: string,
  ): Promise<void> {
    const cwd =
      pending.cwd ??
      this.resolveCwd({
        runId: pending.runId,
        sessionId: pending.sessionId,
      })
    const result = await this.executeToolInRegistry({
      runId: pending.runId,
      sessionId: pending.sessionId,
      policy: pending.policy,
      cwd,
      ...(pending.computerId ? { computerId: pending.computerId } : {}),
      name: pending.toolName,
      input: pending.input,
      approvalReceipt: createApprovalReceipt({
        approvalId,
        runId: pending.runId,
        targetKey: pending.toolName,
        toolInput: pending.input,
        scope: `session:${pending.sessionId}`,
      }),
      failureMessage: 'Pre-provider tool execution failed.',
    })

    if (result.status === 'approval_required') {
      throw new Error('Approved pre-provider tool unexpectedly requested approval')
    }
    if (result.status === 'failed') {
      this.toolResult(pending.runId, pending.sessionId, pending.toolCallId, pending.toolName, {
        error: result.error,
      })
      this.err(pending.runId, pending.sessionId, result.error)
      this.status(pending.runId, pending.sessionId, 'failed', 'tool')
      return
    }

    this.toolResult(pending.runId, pending.sessionId, pending.toolCallId, pending.toolName, result.output, 'completed')
    this.status(pending.runId, pending.sessionId, 'completed', 'tool')
  }

  private startProviderQuery(
    message: InboundMessage,
    formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
    runId: string,
    sessionId: string,
  ): void {
    this.cancelledRuns.delete(runId)
    this.status(runId, sessionId, 'running', 'provider')
    const cwd = this.resolveCwd({ runId, sessionId, dispatch: formatted.dispatch })

    const resumeAt = this.continuationStore.getProviderSessionId(runId) ?? undefined
    const policy = runtimePolicyFromInput(formatted, this.options.policy)
    if (this.requestPreProviderApprovalIfNeeded(message, formatted, runId, sessionId, policy, cwd)) {
      return
    }
    const allowedTools = new Set(policy.policy.allowedTools)
    const tools = (this.options.tools ?? []).filter((tool) => allowedTools.has(tool.manifest.key))
    const providerId = runtimeProviderIdFromInput(formatted)
    const provider = this.resolveProvider({
      runId,
      sessionId,
      dispatch: formatted.dispatch,
      providerId,
      credentialRef: runtimeCredentialRefFromInput(formatted),
    })
    const replayMessages = resumeAt
      ? this.buildStructuredReplayMessages({
          runId,
          sessionId,
          beforeTimestamp: message.timestamp,
        })
      : []
    const model = runtimeModelIdFromInput(formatted, this.options.defaultModelId)
    const credentialRef = parsedRuntimeCredentialRefFromInput(formatted)
    const prefersStructuredReplay = this.prefersStructuredReplayPrompt(provider, providerId)
    const history =
      resumeAt && !prefersStructuredReplay
        ? this.options.mailbox.readRecentAssistantMessages(sessionId, 6, runId)
        : []
    const queryInput = {
      prompt:
        replayMessages.length > 0 && prefersStructuredReplay
          ? formatted.prompt
          : promptWithAssistantHistory(formatted.prompt, history),
      sessionId,
      cwd,
      systemPrompt: formatted.systemPrompt ?? this.options.systemPrompt,
      env: this.options.env,
      resolveCredential: (ref: import('../providers/types.js').RuntimeCredentialRef) =>
        ref.kind === 'env'
          ? this.options.env?.[ref.key] ?? process.env[ref.key]
          : this.options.secretResolver?.(ref),
      ...(credentialRef ? { credentialRef } : {}),
      ...(model ? { model } : {}),
      ...(providerId ? { providerId } : {}),
      resumeAt,
      ...(replayMessages.length > 0 ? { messages: replayMessages } : {}),
      tools: tools.map((tool) => ({ manifest: tool.manifest })),
      toolChoice: providerToolChoice(formatted),
    }
    let query: AgentQuery
    try {
      query = provider.query(queryInput)
    } catch (error) {
      const messageText = runtimeTextMessage(error, 'Provider query failed to start.')
      this.options.mailbox.markAck(message.id, 'failed', messageText)
      this.err(runId, sessionId, messageText)
      this.status(runId, sessionId, 'failed', 'provider')
      return
    }
    const active: ActiveQuery = {
      runId,
      sessionId,
      messageId: message.id,
      query,
      pump: Promise.resolve(),
      fallbackToolCallIds: new Map(),
      policy,
      cwd,
      budgetEstimatedCostUsd: 0,
      ...(formatted.dispatch?.computerId ? { computerId: formatted.dispatch.computerId } : {}),
    }
    const hasRuntimeTools = (this.options.tools?.length ?? 0) > 0
    const toolEventMode: ProviderToolEventMode = hasRuntimeTools
      ? tools.length > 0
        ? 'managed_tools'
        : 'warn_on_tool_events'
      : 'legacy_no_runtime_tools'

    active.abortController = new AbortController()
    active.pump = this.pumpProviderEvents(active, queryInput, toolEventMode)
    this.activeQueries.set(runId, active)
    this.cancellations.track(runId, query)
  }

  private async pumpProviderEvents(
    active: ActiveQuery,
    queryInput: QueryInput,
    toolEventMode: ProviderToolEventMode,
  ): Promise<void> {
    const shouldWarnOnToolEvents = toolEventMode === 'warn_on_tool_events'
    try {
      const onToolCall =
        toolEventMode === 'managed_tools'
          ? async ({ event }: { event: Extract<ProviderEvent, { type: 'tool_call' }> }) => {
              await this.executeProviderToolCall(event, active)
            }
          : toolEventMode === 'legacy_no_runtime_tools'
            ? async ({ event }: { event: Extract<ProviderEvent, { type: 'tool_call' }> }) => {
                this.emitProviderToolCall(event, active)
              }
            : undefined

      const onToolResult =
        toolEventMode === 'legacy_no_runtime_tools' || toolEventMode === 'managed_tools'
          ? ({ event }: { event: Extract<ProviderEvent, { type: 'tool_result' }> }) => {
              this.applyProviderToolResult(event, active)
            }
          : undefined

      const loop = new AgentRunLoop(
        {
          query: () => active.query,
        },
        {
          runId: active.runId,
          queryInput,
          signal: active.abortController?.signal,
          onEvent: (event) =>
            this.handleProjectedProviderEvent(event, active, {
              warnOnToolEvents: shouldWarnOnToolEvents,
            }),
          ...(onToolCall ? { onToolCall } : {}),
          ...(onToolResult ? { onToolResult } : {}),
        },
      )
      const summary = await loop.run()
      this.options.mailbox.touchHeartbeat()

      if (this.cancelledRuns.has(active.runId)) {
        this.activeQueries.delete(active.runId)
        this.options.mailbox.markAck(active.messageId, 'completed')
      } else if (active.providerError) {
        this.activeQueries.delete(active.runId)
        this.options.mailbox.markAck(active.messageId, 'failed', active.providerError.message)
        this.status(active.runId, active.sessionId, 'failed', 'provider')
      } else if (summary.exitReason === 'completed') {
        this.activeQueries.delete(active.runId)
        this.options.mailbox.markAck(active.messageId, 'completed')
        this.status(active.runId, active.sessionId, 'completed', 'provider')
      } else {
        const failureMessage =
          summary.exitReason === 'budget_exhausted'
            ? runtimeErrorMessage(
                new Error('Provider iteration budget exhausted.'),
                'Provider iteration budget exhausted.',
              )
            : summary.exitReason === 'stalled_after_tool'
              ? runtimeErrorMessage(
                  new Error(
                    'Provider stopped after tool activity without producing a final assistant response.',
                  ),
                  'Provider stopped after tool activity without producing a final assistant response.',
                )
            : 'Provider query failed.'
        this.activeQueries.delete(active.runId)
        this.options.mailbox.markAck(active.messageId, 'failed', failureMessage)
        if (!active.providerError) {
          this.err(active.runId, active.sessionId, failureMessage)
        }
        this.status(active.runId, active.sessionId, 'failed', 'provider')
      }
    } finally {
      this.activeQueries.delete(active.runId)
      this.cancellations.untrack(active.runId, active.query)
    }
  }

  private handleProjectedProviderEvent(
    event: ProjectedTurnEvent,
    active: ActiveQuery,
    options: { warnOnToolEvents?: boolean } = {},
  ): void {
    this.options.mailbox.touchHeartbeat()
    const runId = active.runId
    const sessionId = active.sessionId
    switch (event.type) {
      case 'provider.init':
        this.continuationStore.setProviderSessionId(runId, event.providerSessionId)
        this.ev(sessionId, {
          type: 'log',
          runId,
          level: 'debug',
          message: PROVIDER_INIT_LOG_MESSAGE,
          payload: {
            provider: event.provider,
            providerSessionId: event.providerSessionId,
            modelId: event.modelId,
            modelFamily: event.modelFamily,
            providerTransport: event.providerTransport,
          },
        })
        return
      case 'assistant.delta':
        this.ev(sessionId, { type: 'assistant.text.delta', runId, text: event.text })
        return
      case 'assistant.result':
        if (event.text) {
          this.ev(sessionId, { type: 'assistant.text.done', runId, text: event.text })
          this.options.mailbox.writeOutbound({
            runId,
            sessionId,
            kind: 'assistant_message',
            content: JSON.stringify({ text: event.text }),
          })
        }
        return
      case 'usage.updated':
        this.ev(sessionId, {
          type: 'usage',
          runId,
          usage: event.usage,
          ...(event.providerSessionId ? { providerSessionId: event.providerSessionId } : {}),
        })
        if (active.policy.policy.budget?.status === 'blocked') {
          const message =
            active.policy.policy.budget.reason
            ?? `Runtime budget blocked${active.policy.policy.budget.label ? `: ${active.policy.policy.budget.label}` : ''}`
          active.providerError = { message, retryable: false }
          this.ev(sessionId, {
            type: 'log',
            runId,
            level: 'warning',
            message,
            payload: sanitizeRuntimeResponse({
              category: 'budget',
              budget: active.policy.policy.budget,
              usage: event.usage,
            }),
          })
          this.err(runId, sessionId, message, false)
          active.abortController?.abort()
          return
        }
        this.enforceRuntimeUsageBudget(active, event.usage)
        return
      case 'runtime.error':
        active.providerError = { message: runtimeTextMessage(event.message, 'Provider query failed.'), retryable: event.retryable }
        this.err(runId, sessionId, active.providerError.message, event.retryable)
        return
      case 'runtime.progress':
        this.ev(sessionId, { type: 'log', runId, level: 'info', message: event.message })
        return
      case 'tool.call':
        if (options.warnOnToolEvents) {
          this.ev(sessionId, {
            type: 'log',
            runId,
            level: 'warning',
            message: 'Tool call received in no-tools provider loop.',
            payload: sanitizeRuntimeResponse(event),
          })
        }
        return
      case 'tool.result':
        if (options.warnOnToolEvents) {
          this.ev(sessionId, {
            type: 'log',
            runId,
            level: 'warning',
            message: 'Tool result received in no-tools provider loop.',
            payload: sanitizeRuntimeResponse(event),
          })
        }
        return
    }
  }

  private enforceRuntimeUsageBudget(active: ActiveQuery, usagePayload: unknown): void {
    const budget = active.policy.policy.budget
    if (!budget?.enforceUsageLimit || active.providerError) return
    const remainingEstimatedCostUsd = budget.remainingEstimatedCostUsd
    if (typeof remainingEstimatedCostUsd !== 'number' || !Number.isFinite(remainingEstimatedCostUsd)) return

    const parsed = ProviderUsageSchema.safeParse(usagePayload)
    if (!parsed.success) {
      const message = `Runtime budget usage payload is invalid; cannot enforce budget safely.`
      this.failRuntimeBudget(active, message, {
        category: 'budget',
        budget,
        usage: usagePayload,
        validationIssues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const estimate = estimateUsageCost({ usage: parsed.data, catalog: this.pricingCatalog })
    if (estimate.pricingStatus === 'unpriced') {
      const modelLabel = parsed.data.modelId ? ` for ${parsed.data.modelId}` : ''
      const providerLabel = parsed.data.provider ? ` on ${parsed.data.provider}` : ''
      const message = `Runtime budget usage is unpriced${modelLabel}${providerLabel}; cannot enforce budget safely.`
      this.failRuntimeBudget(active, message, {
        category: 'budget',
        budget,
        usage: parsed.data,
        pricingStatus: estimate.pricingStatus,
      })
      return
    }

    active.budgetEstimatedCostUsd += estimate.estimatedCostUsd ?? 0
    if (active.budgetEstimatedCostUsd > remainingEstimatedCostUsd) {
      const message = `Runtime budget exceeded${budget.label ? `: ${budget.label}` : ''}.`
      this.failRuntimeBudget(active, message, {
        category: 'budget',
        budget,
        usage: parsed.data,
        pricingStatus: estimate.pricingStatus,
        estimatedCostUsd: estimate.estimatedCostUsd,
        cumulativeEstimatedCostUsd: active.budgetEstimatedCostUsd,
        remainingEstimatedCostUsd,
      })
    }
  }

  private failRuntimeBudget(active: ActiveQuery, message: string, payload: unknown): void {
    active.providerError = { message, retryable: false }
    this.ev(active.sessionId, {
      type: 'log',
      runId: active.runId,
      level: 'warning',
      message,
      payload: sanitizeRuntimeResponse(payload),
    })
    this.err(active.runId, active.sessionId, message, false)
    active.abortController?.abort()
  }

  private requestPreProviderApprovalIfNeeded(
    message: InboundMessage,
    formatted: ReturnType<typeof formatRuntimeInboundPrompt>,
    runId: string,
    sessionId: string,
    policy: RuntimePolicyGuard,
    cwd: string,
  ): boolean {
    const dispatch = formatted.dispatch
    if (!dispatch || dispatch.intent.mode !== 'task') return false
    if (dispatch.policy.allowedTools.length !== 1) return false

    const [toolKey] = dispatch.policy.allowedTools
    const tool = (this.options.tools ?? []).find((candidate) => candidate.manifest.key === toolKey)
    if (!tool) return false

    const input = preProviderToolInput(toolKey, formatted.prompt)
    const decision = policy.decide({
      operation: 'tool.execute',
      manifest: tool.manifest,
      input,
    })
    if (!decision.approvalRequired) return false

    const toolCallId = createProviderToolCallId(toolKey)
    this.ev(sessionId, {
      type: 'tool.call',
      runId,
      toolCallId,
      name: toolKey,
      input,
    })
    const approval = buildApprovalRequest({
      runId,
      kind: 'exec',
      targetKey: toolKey,
      reasons: decision.reasons,
      permissionCategories: decision.permissionCategories,
      metadata: { capability: 'tool', toolType: tool.manifest.toolType },
    })
    this.pendingToolApprovals.set(approval.id, {
      kind: 'pre_provider',
      runId,
      sessionId,
      toolName: toolKey,
      input,
      toolCallId,
      policy,
      cwd,
      ...(dispatch.computerId ? { computerId: dispatch.computerId } : {}),
    })
    this.continuationStore.setJson(preProviderApprovalStateKey(approval.id), {
      runId,
      sessionId,
      toolName: toolKey,
      input,
      toolCallId,
      policy: policy.policy,
      cwd,
      ...(dispatch.computerId ? { computerId: dispatch.computerId } : {}),
    })
    this.ev(sessionId, approvalRequestedEvent({ runId, approval }))
    this.status(runId, sessionId, 'waiting_approval', 'approval')
    this.options.mailbox.markAck(message.id, 'completed')
    return true
  }

  private async executeProviderToolCall(
    event: Extract<ProviderEvent, { type: 'tool_call' }>,
    active: ActiveQuery,
  ): Promise<void> {
    const toolCallId = providerToolCallIdForCall(active, event)
    this.emitProviderToolCall(event, active, { toolCallId })
    await this.executeToolCall(event, active, { toolCallId })
  }

  private emitProviderToolCall(
    event: Extract<ProviderEvent, { type: 'tool_call' }>,
    active: ActiveQuery,
    options: { toolCallId?: string } = {},
  ): void {
    const toolCallId = options.toolCallId ?? providerToolCallIdForCall(active, event)
    this.ev(active.sessionId, {
      type: 'tool.call',
      runId: active.runId,
      toolCallId,
      name: event.name,
      input: event.input,
    })
  }

  private applyProviderToolResult(
    event: Extract<ProviderEvent, { type: 'tool_result' }>,
    active: ActiveQuery,
  ): void {
    this.toolResult(
      active.runId,
      active.sessionId,
      providerToolCallIdForResult(active, event),
      event.name,
      event.output,
      'completed',
    )
  }

  private async executeToolCall(
    event: Extract<ProviderEvent, { type: 'tool_call' }>,
    active: ActiveQuery,
    options: { approvalReceipt?: ApprovalReceipt; toolCallId?: string } = {},
  ): Promise<void> {
    const toolCallId = options.toolCallId ?? providerToolCallIdForCall(active, event)
    const result = await this.executeToolInRegistry({
      runId: active.runId,
      sessionId: active.sessionId,
      policy: active.policy,
      cwd: active.cwd,
      ...(active.computerId ? { computerId: active.computerId } : {}),
      name: event.name,
      input: event.input,
      approvalReceipt: options.approvalReceipt,
    })

    if (result.status === 'approval_required') {
      this.pendingToolApprovals.set(result.approvalId, {
        kind: 'provider',
        active,
        toolName: event.name,
        input: event.input,
        toolCallId,
      })
      this.pushTool(active, {
        type: 'tool_result',
        name: event.name,
        status: 'approval_required',
        approvalId: result.approvalId,
      })
      return
    }

    if (result.status === 'policy_blocked') {
      this.toolResult(active.runId, active.sessionId, toolCallId, event.name, result.output, 'denied')
      this.pushTool(active, {
        type: 'tool_result',
        name: event.name,
        status: 'denied',
        output: result.output,
      })
      return
    }

    if (result.status === 'failed') {
      this.toolResult(active.runId, active.sessionId, toolCallId, event.name, {
        error: result.error,
      })
      this.pushTool(active, {
        type: 'tool_result',
        name: event.name,
        status: 'failed',
        error: result.error,
      })
      return
    }

    this.toolResult(active.runId, active.sessionId, toolCallId, event.name, result.output, 'completed')
    this.pushTool(active, { type: 'tool_result', name: event.name, status: 'completed', output: result.output })
  }

  private async executeToolInRegistry(input: {
    runId: string
    sessionId: string
    policy: RuntimePolicyGuard
    cwd: string
    computerId?: string
    name: string
    input: unknown
    approvalReceipt?: ApprovalReceipt
    failureMessage?: string
  }): Promise<ToolRegistryExecutionResult> {
    const tools = this.options.tools ?? []
    if (tools.length === 0) {
      return { status: 'failed', error: 'Runtime tool call failed: no runtime tools are configured.' }
    }

    const registry = this.registry(
      input.runId,
      input.sessionId,
      input.policy,
      input.cwd,
      input.computerId,
    )
    registry.registerMany(tools)

    try {
      const result = await registry.execute({
        key: input.name,
        input: input.input,
        approvalReceipt: input.approvalReceipt,
      })
      if (result.status === 'approval_required') {
        return { status: 'approval_required', approvalId: result.approval.id }
      }
      if (result.status === 'policy_blocked') {
        return {
          status: 'policy_blocked',
          output: {
            blocked: true,
            reasons: result.reasons,
            permissionCategories: result.permissionCategories,
          },
        }
      }
      return {
        status: 'completed',
        output: this.toolResultStorage.prepare({
          runId: input.runId,
          workspaceRoot: input.cwd,
          toolName: input.name,
          output: runtimeFeedbackValue(result.output),
        }).output,
      }
    } catch (error) {
      return {
        status: 'failed',
        error: runtimeTextMessage(error, input.failureMessage ?? 'Runtime tool execution failed.'),
      }
    }
  }

  private toolResult(
    runId: string,
    sessionId: string,
    toolCallId: string,
    name: string,
    output: unknown,
    status: Extract<MainspringEvent, { type: 'tool.result' }>['status'] = 'failed',
  ): void {
    this.ev(sessionId, { type: 'tool.result', runId, toolCallId, name, output, status })
  }

  private err(runId: string, sessionId: string, message: string, retryable = false): void {
    this.ev(sessionId, { type: 'error', runId, message, retryable })
  }

  private pushTool(active: ActiveQuery, payload: unknown): void {
    active.query.push(JSON.stringify(payload))
  }

  private buildStructuredReplayMessages(input: {
    runId: string
    sessionId: string
    beforeTimestamp: string
  }): ProviderMessage[] {
    const prompts = this.options.mailbox.readRunTaskPrompts({
      sessionId: input.sessionId,
      runId: input.runId,
      beforeTimestamp: input.beforeTimestamp,
      limit: 8,
    })
    const events = this.options.mailbox.readRecentEvents({
      sessionId: input.sessionId,
      runId: input.runId,
      limit: 64,
    })

    const entries: Array<{ timestamp: string; order: number; message: ProviderMessage }> = []
    for (const prompt of prompts) {
      entries.push({
        timestamp: prompt.timestamp,
        order: 0,
        message: { role: 'user', content: prompt.prompt },
      })
    }
    for (const row of events) {
      switch (row.event.type) {
        case 'assistant.text.done':
          entries.push({
            timestamp: row.timestamp,
            order: 1,
            message: { role: 'assistant', content: row.event.text },
          })
          break
        case 'tool.call':
          entries.push({
            timestamp: row.timestamp,
            order: 1,
            message: {
              role: 'assistant',
              content: null,
              toolCalls: [
                {
                  id: row.event.toolCallId,
                  name: row.event.name,
                  arguments: JSON.stringify(sanitizeRuntimeResponse(row.event.input ?? {})),
                },
              ],
            },
          })
          break
        case 'tool.result':
          entries.push({
            timestamp: row.timestamp,
            order: 2,
            message: {
              role: 'tool',
              content: serializeReplayContent(row.event.output),
              toolCallId: row.event.toolCallId,
              name: row.event.name,
            },
          })
          break
      }
    }

    return entries
      .sort((left, right) => {
        const timestampOrder = left.timestamp.localeCompare(right.timestamp)
        return timestampOrder !== 0 ? timestampOrder : left.order - right.order
      })
      .map((entry) => entry.message)
  }

  private prefersStructuredReplayPrompt(provider: AgentProvider, providerId?: string): boolean {
    if (providerId === 'openrouter') return true
    const candidate = provider as { providerId?: unknown }
    return candidate.providerId === 'openrouter'
  }

  private registry(
    runId: string,
    sessionId: string,
    policy: RuntimePolicyGuard,
    cwd: string,
    computerId?: string,
  ): ToolRegistry {
    return new ToolRegistry({
      runId,
      sessionId,
      workspaceRoot: cwd,
      ...(computerId ? { computerId } : {}),
      policy,
      readRecentEvents: ({ runId: id, limit }) =>
        this.options.mailbox.readRecentEvents({ sessionId, runId: id, limit }),
      emitEvent: (event) => this.ev(sessionId, event),
    })
  }

  private status(
    runId: string,
    sessionId: string,
    status: Extract<MainspringEvent, { type: 'run.status' }>['status'],
    phase: string,
  ): void {
    this.ev(sessionId, { type: 'run.status', runId, status, phase })
  }

  private ev(sessionId: string, event: MainspringEvent): void {
    this.options.mailbox.writeEvent(event, sessionId)
  }
}
