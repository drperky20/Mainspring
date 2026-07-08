import type { AgentProvider, ProviderEvent } from '../providers/types.js'
import type { ContextEncodedRunEventPayload } from '../context/types.js'
import type {
  MainspringRuntimeProfile,
  RunIntentMode,
  ProviderRateLimitState,
  RunContextPack,
  RuntimePolicy,
} from '#protocol'
import type { RuntimeTool } from '../tools/ToolRegistry.js'

export type { ContextEncodedRunEventPayload } from '../context/types.js'

export type EventVisibility = 'public' | 'sensitive' | 'artifact-only'

export type RunEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.awaiting_approval'
  | 'assistant.text.delta'
  | 'assistant.text.done'
  | 'tool.call.requested'
  | 'tool.call.updated'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'tool.call.blocked'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.denied'
  | 'artifact.created'
  | 'browser.updated'
  | 'browser.screenshot.created'
  | 'file.changed'
  | 'memory.updated'
  | 'skill.updated'
  | 'usage.updated'
  | 'context.encoded'
  | 'runtime.warning'
  | 'runtime.error'

export interface RunLifecycleEventPayload {
  phase?: string
}

export interface AssistantTextRunEventPayload {
  text: string
}

export interface ToolCallRequestedRunEventPayload {
  toolCallId: string
  name: string
  input?: unknown
}

export interface ToolCallUpdatedRunEventPayload {
  toolCallId: string
  message: string
  payload?: unknown
}

export interface ToolCallCompletedRunEventPayload {
  toolCallId: string
  name: string
  output?: unknown
}

export interface ToolCallFailedRunEventPayload {
  toolCallId: string
  name: string
  output?: unknown
}

export interface ToolCallBlockedRunEventPayload {
  toolCallId: string
  name: string
  status: string
  output?: unknown
}

export type ApprovalRunEventPayload = Record<string, unknown>

export interface ArtifactCreatedRunEventPayload {
  artifactId: string
  kind: string
}

export interface BrowserUpdatedRunEventPayload {
  action: string
  payload?: unknown
}

export interface BrowserScreenshotCreatedRunEventPayload {
  artifactId?: string
  url?: string
}

export interface FileChangedRunEventPayload {
  path: string
  action: 'created' | 'updated' | 'deleted' | 'unknown'
}

export interface MemoryUpdatedRunEventPayload {
  action: string
  metadata?: unknown
}

export interface SkillUpdatedRunEventPayload {
  skillKey: string
  action: string
  metadata?: unknown
}

export interface UsageUpdatedRunEventPayload {
  provider?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  rateLimit?: ProviderRateLimitState
  providerSessionId?: string
}

export interface RuntimeWarningEventPayload {
  message: string
  level?: string
  phase?: string
  payload?: Record<string, unknown>
}

export interface RuntimeErrorEventPayload {
  message: string
  retryable: boolean
}

export interface ProviderInitWarningDetail {
  provider?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
}

export type ProviderInitRunContext = ProviderInitWarningDetail

// Public provider-init truth currently flows through sanitized log/warning
// payload detail. We intentionally do not expose a separate public
// `provider.init` RunEvent family until the runtime gains a stronger reason
// to widen the public event surface.
export const PROVIDER_INIT_LOG_MESSAGE = 'Provider session initialized'

export interface RunEventPayloadByType {
  'run.started': RunLifecycleEventPayload
  'run.completed': RunLifecycleEventPayload
  'run.failed': RunLifecycleEventPayload
  'run.cancelled': RunLifecycleEventPayload
  'run.awaiting_approval': RunLifecycleEventPayload
  'assistant.text.delta': AssistantTextRunEventPayload
  'assistant.text.done': AssistantTextRunEventPayload
  'tool.call.requested': ToolCallRequestedRunEventPayload
  'tool.call.updated': ToolCallUpdatedRunEventPayload
  'tool.call.completed': ToolCallCompletedRunEventPayload
  'tool.call.failed': ToolCallFailedRunEventPayload
  'tool.call.blocked': ToolCallBlockedRunEventPayload
  'approval.requested': ApprovalRunEventPayload
  'approval.approved': ApprovalRunEventPayload
  'approval.denied': ApprovalRunEventPayload
  'artifact.created': ArtifactCreatedRunEventPayload
  'browser.updated': BrowserUpdatedRunEventPayload
  'browser.screenshot.created': BrowserScreenshotCreatedRunEventPayload
  'file.changed': FileChangedRunEventPayload
  'memory.updated': MemoryUpdatedRunEventPayload
  'skill.updated': SkillUpdatedRunEventPayload
  'usage.updated': UsageUpdatedRunEventPayload
  'context.encoded': ContextEncodedRunEventPayload
  'runtime.warning': RuntimeWarningEventPayload
  'runtime.error': RuntimeErrorEventPayload
}

export interface RunEvent<TPayload = unknown> {
  eventId: string
  seq: number
  runId: string
  sessionId: string
  timestamp: string
  type: RunEventType
  payload: TPayload
  visibility: EventVisibility
  traceId: string
  spanId: string
}

export type RunEventOfType<T extends RunEventType> = RunEvent<RunEventPayloadByType[T]> & { type: T }

export type MainspringRunEvent = {
  [K in RunEventType]: RunEventOfType<K>
}[RunEventType]

export function providerInitDetailFromLogPayload(
  message: string,
  payload?: Record<string, unknown>,
): ProviderInitWarningDetail | null {
  if (message !== PROVIDER_INIT_LOG_MESSAGE || !payload) return null
  const detail = payload
  const parsed: ProviderInitWarningDetail = {}
  if (typeof detail.provider === 'string' && detail.provider.trim()) parsed.provider = detail.provider
  if (typeof detail.modelId === 'string' && detail.modelId.trim()) parsed.modelId = detail.modelId
  if (typeof detail.modelFamily === 'string' && detail.modelFamily.trim()) {
    parsed.modelFamily = detail.modelFamily
  }
  if (typeof detail.providerTransport === 'string' && detail.providerTransport.trim()) {
    parsed.providerTransport = detail.providerTransport
  }
  if (typeof detail.providerSessionId === 'string' && detail.providerSessionId.trim()) {
    parsed.providerSessionId = detail.providerSessionId
  }
  return Object.keys(parsed).length > 0 ? parsed : null
}

export function providerInitWarningDetailFromRunEvent(
  event: RunEvent,
): ProviderInitWarningDetail | null {
  return providerInitDetailFromRunEvent(event)
}

export function providerInitDetailFromRunEvent(
  event: RunEvent,
): ProviderInitRunContext | null {
  if (event.type !== 'runtime.warning') return null
  const payload = event.payload as RuntimeWarningEventPayload
  return providerInitDetailFromLogPayload(payload.message, payload.payload)
}

export function latestProviderInitDetailFromRunEvents(
  events: readonly RunEvent[],
): ProviderInitRunContext | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const detail = providerInitDetailFromRunEvent(events[index]!)
    if (detail) return detail
  }
  return null
}

export function latestProviderInitWarningDetailFromRunEvents(
  events: readonly RunEvent[],
): ProviderInitWarningDetail | null {
  return latestProviderInitDetailFromRunEvents(events)
}

export interface MainspringSessionRecord {
  sessionId: string
  sessionPath: string
  workspaceRoot: string
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface CreateMainspringSessionInput {
  sessionId?: string
  workspace?: {
    root: string
  }
  metadata?: Record<string, unknown>
}

export interface UpdateMainspringSessionInput {
  workspace?: {
    root: string
  }
  status?: MainspringSessionRecord['status']
  metadata?: Record<string, unknown>
}

export interface StartRunInput {
  input: string
  resumeRunId?: string
  systemPrompt?: string
  agentId?: string
  ownerId?: string
  workspaceId?: string
  computerId?: string
  providerId?: string
  credentialRef?: string
  modelId?: string
  runtimeProfile?: MainspringRuntimeProfile
  mode?: RunIntentMode
  approvalPolicy?: RuntimePolicy['approvalPolicy']
  allowBrowser?: boolean
  allowMemory?: boolean
  allowedTools?: string[]
  budget?: RuntimePolicy['budget']
  redaction?: RuntimePolicy['redaction']
  clientContext?: {
    route?: string
    lane?: 'home' | 'platform'
    contextPack?: RunContextPack
  }
  metadata?: Record<string, unknown>
}

export interface RunRecord {
  runId: string
  sessionId: string
  createdAt: string
  input: string
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
}

export interface MainspringApprovalRecord {
  approvalId: string
  runId: string
  sessionId: string
  status: 'pending' | 'approved' | 'denied'
  requestedAt: string
  resolvedAt?: string
  targetKey?: string
  reasons: string[]
  permissionCategories: string[]
}

export interface UsageSummary {
  provider?: string
  model?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd?: number
}

export interface MonitoringSnapshot {
  sessions: {
    total: number
    open: number
  }
  runs: {
    active: number
    completed: number
    failed: number
    cancelled: number
  }
  approvals: {
    pending: number
    recent: MainspringApprovalRecord[]
  }
  tools: {
    recent: Array<{
      runId: string
      sessionId: string
      name: string
      status: 'requested' | 'updated' | 'completed' | 'failed' | 'blocked'
      timestamp: string
    }>
  }
  providers: {
    usage: UsageSummary[]
  }
  health: RuntimeHealth
}

export interface RuntimeHealth {
  ok: boolean
  running: boolean
  sessionsRoot: string
  lastTickAt?: string
  lastError?: string
  activeSessions: number
}

export interface CommandStore {
  enqueueRun(session: MainspringSessionRecord, input: StartRunInput): RunRecord
  cancelRun(sessionId: string, runId: string, reason?: string): void
  resolveApproval(input: {
    sessionId: string
    runId: string
    approvalId: string
    decision: 'approved' | 'denied'
    reason?: string
    response?: unknown
  }): void
}

export interface EventStore {
  listRunEvents(input: {
    sessionId: string
    runId?: string
    afterSeq?: number
    limit?: number
  }): RunEvent[]
  listSessionEvents(input: {
    sessionId: string
    afterSeq?: number
    limit?: number
  }): RunEvent[]
}

export interface StateStore {
  createSession(input: CreateMainspringSessionInput): MainspringSessionRecord
  listSessions(): MainspringSessionRecord[]
  getSession(sessionId: string): MainspringSessionRecord | null
  updateSession(sessionId: string, input: UpdateMainspringSessionInput): MainspringSessionRecord
  deleteSession(sessionId: string): void
}

export interface ArtifactStore {
  rootPath: string
}

export interface MainspringStorage {
  commandStore: CommandStore
  eventStore: EventStore
  stateStore: StateStore
  artifactStore: ArtifactStore
}

export interface CreateMainspringOptions {
  sessionsRoot: string
  workspaceRoot?: string
  provider?: AgentProvider
  providers?: Record<string, AgentProvider>
  secretResolver?: import('../providers/types.js').RuntimeSecretResolver
  modelId?: string
  tools?: RuntimeTool[]
  policy?: RuntimePolicy
  pollIntervalMs?: number
}

export interface RuntimeDiagnostics {
  engine: RuntimeHealth
  sessions: MainspringSessionRecord[]
  providers: string[]
}

export interface MainspringProviderRegistrySnapshot {
  activeProviderId: string
  registeredProviderIds: string[]
}

export type ProviderAdapter = AgentProvider & {
  models?: () => Promise<string[]> | string[]
  health?: () => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string }
}

export interface ProviderRouterInput {
  task: {
    prompt: string
    systemPrompt?: string
  }
  budget?: {
    maxUsd?: number
  }
  policy?: RuntimePolicy
}

export interface ProviderRouter {
  route(input: ProviderRouterInput): ProviderAdapter
}

export type ProviderEventStream = AsyncIterable<ProviderEvent>
