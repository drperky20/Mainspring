import type { ProviderUsage, RuntimePolicy } from '#protocol'
import type { ContextCodec } from '../context/ContextCodec.js'
import type { ContextLensAssembler } from '../context/ContextAssembly.js'
import type { MemoryStore } from '../memory/MemoryStore.js'
import type { AgentProvider, QueryInput, RuntimeSecretResolver } from '../providers/types.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'

export type RunLogCapability =
  | 'provider'
  | 'tools'
  | 'shell'
  | 'files'
  | 'browser'
  | 'memory'
  | 'workspace'
  | 'cron'
  | 'subagents'

export interface AgentSpec {
  agentId: string
  instructions: string
  providerId?: string
  modelId?: string
  tools?: string[]
  memoryScope?: string
  workspacePolicy?: 'none' | 'lazy' | 'required'
  approvalPolicy?: RuntimePolicy['approvalPolicy']
  capabilities?: readonly RunLogCapability[]
  metadata?: Record<string, unknown>
}

export interface RunIntent {
  agentId: string
  input: string
  sessionId?: string
  runId?: string
  parentRunId?: string
  workspaceId?: string
  workspaceRoot?: string
  computerId?: string
  requestedCapabilities?: RunLogCapability[]
  providerId?: string
  modelId?: string
  credentialRef?: string
  systemPrompt?: string
  allowedTools?: string[]
  approvalPolicy?: RuntimePolicy['approvalPolicy']
  metadata?: Record<string, unknown>
}

export type RunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface RunRecord {
  runId: string
  agentId: string
  sessionId: string
  status: RunStatus
  input: string
  createdAt: string
  updatedAt: string
  parentRunId?: string
  workspaceId?: string
  workspaceRoot?: string
  computerId?: string
  providerId?: string
  modelId?: string
  credentialRef?: string
  allowedTools?: string[]
  workerId?: string
  leaseUntil?: string
  executionGeneration?: number
  leaseEpoch?: number
  attemptCount?: number
  nextAttemptAt?: string
  failureClassification?: string
  metadata?: Record<string, unknown>
}

export type RunLogEventType =
  | 'run.created'
  | 'input.received'
  | 'run.queued'
  | 'run.claimed'
  | 'run.retry.scheduled'
  | 'provider.init'
  | 'policy.decision.recorded'
  | 'assistant.delta'
  | 'assistant.result'
  | 'tool.call.requested'
  | 'tool.call.updated'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'tool.call.blocked'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.denied'
  | 'approval.cancelled'
  | 'approval.receipt.used'
  | 'run.awaiting_approval'
  | 'checkpoint.saved'
  | 'artifact.created'
  | 'workspace.lease.created'
  | 'workspace.lease.released'
  | 'browser.lease.created'
  | 'browser.lease.released'
  | 'cron.due'
  | 'child_run.created'
  | 'usage.reported'
  | 'context.encoded'
  | 'context.assembled'
  | 'runtime.warning'
  | 'runtime.error'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'

export interface RunLogEvent<TPayload = unknown> {
  eventId: string
  seq: number
  runId: string
  agentId: string
  sessionId: string
  type: RunLogEventType
  timestamp: string
  payload: TPayload
  idempotencyKey?: string
  visibility: 'public' | 'sensitive' | 'artifact-only'
}

export interface RunCheckpoint {
  checkpointId: string
  runId: string
  seq: number
  kind: 'provider' | 'tool' | 'approval' | 'workspace' | 'manual'
  timestamp: string
  state: Record<string, unknown>
}

export interface RunLogApprovalRequestSnapshot {
  approvalId: string
  runId: string
  agentId: string
  sessionId: string
  parentRunId?: string
  toolCallId: string
  toolName: string
  toolInput: unknown
  toolInputHash: string
  cwd: string
  workspaceId: string
  workspaceHash: string
  policyHash: string
  toolManifestHash: string
  providerContextHash: string
  riskSnapshotHash: string
  requestedAt: string
}

export type RunLogApprovalRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

/**
 * Browser-safe summary of a durable approval request. The full snapshot keeps
 * workspace paths, hashes, and tool input host-side for receipt verification.
 */
export interface RunLogApprovalRequestSummary {
  approvalId: string
  runId: string
  agentId: string
  sessionId: string
  toolCallId: string
  toolName: string
  status: RunLogApprovalRequestStatus
  requestedAt: string
  decidedAt?: string
}

export interface RunLogApprovalListCursor {
  requestedAt: string
  approvalId: string
}

export interface ListRunLogApprovalRequestsInput {
  status?: RunLogApprovalRequestStatus | RunLogApprovalRequestStatus[]
  before?: RunLogApprovalListCursor
  limit?: number
}

export interface RunLogApprovalReceipt {
  version: 1
  receiptId: string
  approvalId: string
  runId: string
  agentId: string
  sessionId: string
  parentRunId?: string
  toolCallId: string
  toolName: string
  decision: 'approved' | 'denied'
  actor: string
  requestedAt: string
  decidedAt: string
  expiresAt: string
  toolInputHash: string
  workspaceHash: string
  policyHash: string
  toolManifestHash: string
  providerContextHash: string
  riskSnapshotHash: string
  nonce: string
  idempotencyKey: string
  keyId: string
  signature: string
}

export interface AppendRunEventInput<TPayload = unknown> {
  runId: string
  type: RunLogEventType
  payload?: TPayload
  idempotencyKey?: string
  visibility?: RunLogEvent['visibility']
}

export interface ListRunEventsInput {
  runId?: string
  sessionId?: string
  afterSeq?: number
  beforeSeq?: number
  order?: 'asc' | 'desc'
  visibility?: RunLogEvent['visibility'] | RunLogEvent['visibility'][]
  types?: RunLogEventType[]
  limit?: number
}

export interface RunLogRunSummary {
  runId: string
  status: RunStatus
  eventCount: number
  latestSeq: number
  assistantText: string
  lastEventType?: RunLogEventType
  updatedAt: string
}

/**
 * The latest durable state for one canonical tool call. It intentionally
 * excludes tool input, output, policy payloads, and error details so hosts can
 * build a global operational read model without duplicating sensitive event
 * payloads.
 */
export type RunLogToolCallStatus =
  | 'requested'
  | 'updated'
  | 'completed'
  | 'failed'
  | 'blocked'

export interface RunLogToolCallSummary {
  runId: string
  sessionId: string
  agentId: string
  workspaceId?: string
  toolCallId: string
  toolName?: string
  status: RunLogToolCallStatus
  createdAt: string
  updatedAt: string
  latestSeq: number
}

/** Stable reverse-chronological cursor for durable tool-call summaries. */
export interface RunLogToolCallListCursor {
  latestSeq: number
}

export interface ListRunLogToolCallSummariesInput {
  runId?: string
  sessionId?: string
  workspaceId?: string
  status?: RunLogToolCallStatus | RunLogToolCallStatus[]
  before?: RunLogToolCallListCursor
  limit?: number
}

export interface RunLogProjectionCatchupResult {
  projectionName: 'run-summary-v1' | 'tool-call-summary-v1'
  processedEvents: number
  lastSeq: number
}

/**
 * Stable cursor for reverse-chronological RunLog activity pages. Both values
 * are persisted run fields, so callers never need to depend on SQLite rowids.
 */
export interface RunListCursor {
  createdAt: string
  runId: string
}

export interface ListRunsInput {
  sessionId?: string
  agentId?: string
  status?: RunStatus | RunStatus[]
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: RunListCursor
  limit?: number
}

export interface TransitionRunStatusInput {
  runId: string
  from: RunStatus[]
  to: RunStatus
  patch?: Partial<RunRecord>
}

export interface ClaimRunInput {
  workerId: string
  leaseMs: number
}

export type ExecutionOutboxStatus =
  | 'pending'
  | 'claimed'
  | 'retryable'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ExecutionOutboxRecord {
  outboxId: string
  runId: string
  generation: number
  kind: 'run.advance'
  status: ExecutionOutboxStatus
  idempotencyKey: string
  payload: Record<string, unknown>
  attemptCount: number
  maxAttempts: number
  nextAttemptAt: string
  claimedBy?: string
  claimToken?: string
  claimExpiresAt?: string
  lastHeartbeatAt?: string
  lastErrorClassification?: string
  lastErrorMessage?: string
  lastErrorRetryable?: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface ExecutionClaim {
  run: RunRecord
  outbox: ExecutionOutboxRecord
  workerId: string
  claimToken: string
  leaseEpoch: number
}

export interface ClaimExecutionInput {
  workerId: string
  leaseMs: number
  now: string
}

export interface ExecutionClaimInput {
  outboxId: string
  runId: string
  workerId: string
  claimToken: string
  leaseEpoch: number
}

export interface ExecutionFailure {
  message: string
  classification: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface PauseRunForApprovalInput {
  claim: ExecutionClaimInput
  request: RunLogApprovalRequestSnapshot
  approvalEventPayload: Record<string, unknown>
  checkpoint: Omit<RunCheckpoint, 'checkpointId' | 'timestamp' | 'seq'> & {
    state: Record<string, unknown>
  }
}

export interface DecideApprovalLifecycleInput {
  receipt: RunLogApprovalReceipt
  eventPayload: Record<string, unknown>
}

export interface RunLogStore {
  initialize(): void
  putAgent(spec: AgentSpec): void
  getAgent(agentId: string): AgentSpec | null
  listAgents(): AgentSpec[]
  createRun(intent: RunIntent, agent: AgentSpec): RunRecord
  createQueuedRun(intent: RunIntent, agent: AgentSpec): RunRecord
  getRun(runId: string): RunRecord | null
  listRuns(input?: ListRunsInput): RunRecord[]
  updateRunStatus(runId: string, status: RunStatus, patch?: Partial<RunRecord>): RunRecord
  transitionRunStatus(input: TransitionRunStatusInput): RunRecord | null
  claimNextRun(input: ClaimRunInput): RunRecord | null
  claimNextExecution(input: ClaimExecutionInput): ExecutionClaim | null
  heartbeatExecution(input: ExecutionClaimInput & { now: string; leaseMs: number }): boolean
  acknowledgeExecution(input: ExecutionClaimInput, status?: 'completed' | 'cancelled'): boolean
  scheduleExecutionRetry(input: {
    claim: ExecutionClaimInput
    failure: ExecutionFailure
    nextAttemptAt: string
  }): ExecutionOutboxRecord | null
  completeExecution(input: {
    claim: ExecutionClaimInput
    payload?: Record<string, unknown>
  }): RunRecord | null
  failExecution(input: {
    claim: ExecutionClaimInput
    failure: ExecutionFailure
    idempotencySuffix?: string
  }): RunRecord | null
  cancelRunLifecycle(input: { runId: string; reason: string }): RunRecord
  pauseRunForApproval(input: PauseRunForApprovalInput): RunRecord | null
  decideApprovalLifecycle(input: DecideApprovalLifecycleInput): RunLogApprovalReceipt
  getExecutionOutbox(outboxId: string): ExecutionOutboxRecord | null
  listExecutionOutbox(input?: { runId?: string; status?: ExecutionOutboxStatus }): ExecutionOutboxRecord[]
  appendEvent<TPayload = unknown>(input: AppendRunEventInput<TPayload>): RunLogEvent<TPayload>
  listEvents(input?: ListRunEventsInput): RunLogEvent[]
  countEvents(input?: Omit<ListRunEventsInput, 'limit'>): number
  latestEventSeq(runId: string): number
  catchUpRunProjection(input?: { limit?: number }): RunLogProjectionCatchupResult
  getRunProjectionSummary(runId: string): RunLogRunSummary | null
  catchUpRunToolCallProjection(input?: { limit?: number }): RunLogProjectionCatchupResult
  listRunToolCallSummaries(input?: ListRunLogToolCallSummariesInput): RunLogToolCallSummary[]
  appendCheckpoint(input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp'>): RunCheckpoint
  appendCheckpointWithEvent(
    input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp' | 'seq'>,
  ): RunCheckpoint
  latestCheckpoint(runId: string): RunCheckpoint | null
  putApprovalRequest(snapshot: RunLogApprovalRequestSnapshot): void
  getApprovalRequest(approvalId: string): RunLogApprovalRequestSnapshot | null
  listApprovalRequests(input?: ListRunLogApprovalRequestsInput): RunLogApprovalRequestSummary[]
  putApprovalReceipt(receipt: RunLogApprovalReceipt): void
  getApprovalReceipt(receiptId: string): RunLogApprovalReceipt | null
  getApprovedUnusedReceipt(runId: string): RunLogApprovalReceipt | null
  markApprovalReceiptUsed(receiptId: string, runId: string): boolean
}

/**
 * A per-execution tool session can add run-scoped tools (for example, a
 * browser lease) and release them when the execution attempt ends. Session
 * events are appended through the executor's run-bound emitter so adapters
 * cannot write facts into another run.
 */
export type RuntimeToolSessionEvent = Omit<AppendRunEventInput, 'runId'>

export type RuntimeToolSessionEventEmitter = (
  event: RuntimeToolSessionEvent,
) => RunLogEvent

export interface RuntimeToolSession {
  tools: RuntimeTool[]
  close?: () => void | Promise<void>
}

export interface RuntimeToolSessionFactoryInput {
  run: RunRecord
  workspaceRoot: string
  signal: AbortSignal
  emitEvent: RuntimeToolSessionEventEmitter
}

export type RuntimeToolSessionFactory = (
  input: RuntimeToolSessionFactoryInput,
) => RuntimeToolSession | Promise<RuntimeToolSession>

export interface ProviderRouter {
  resolve(input: {
    run: RunRecord
    agent: AgentSpec
    intent?: RunIntent
  }): AgentProvider
}

export interface ProviderRouterMap {
  defaultProviderId: string
  providers: Record<string, AgentProvider>
}

export interface BlobWriteInput {
  bytes: string | Uint8Array
  mediaType?: string
  metadata?: Record<string, unknown>
}

export interface BlobRef {
  blobId: string
  sha256: string
  byteLength: number
  uri: string
  mediaType?: string
  metadata?: Record<string, unknown>
}

export interface BlobAdapter {
  write(input: BlobWriteInput): Promise<BlobRef> | BlobRef
  read(ref: BlobRef | string): Promise<Uint8Array> | Uint8Array
}

export interface WorkspaceLease {
  runId: string
  workspaceId: string
  root: string
  materialized: boolean
  release(): Promise<void> | void
}

export interface WorkspaceAdapter {
  lease(input: {
    run: RunRecord
    agent: AgentSpec
    intent?: RunIntent
  }): Promise<WorkspaceLease> | WorkspaceLease
}

export interface RunExecutorOptions {
  store: RunLogStore
  providerRouter: ProviderRouter
  tools?: RuntimeTool[]
  workspace?: WorkspaceAdapter
  defaultWorkspaceRoot?: string
  policy?: RuntimePolicy
  contextCodec?: ContextCodec
  contextAssembler?: ContextLensAssembler
  contextMemoryStore?: MemoryStore
  contextMemoryLimit?: number
  contextHistoryLimit?: number
  approvalReceiptKey?: string
  approvalReceiptKeyMode?: 'local-dev' | 'configured'
  secretResolver?: RuntimeSecretResolver
  maxToolIterations?: number
  /** Creates run-scoped tools and releases their external resources per attempt. */
  toolSessionFactory?: RuntimeToolSessionFactory
}

export interface RunExecutionSummary {
  runId: string
  status: RunStatus
  eventsAppended: number
  checkpointsAppended: number
  usage?: ProviderUsage
}

export interface BuildProviderQueryInput {
  run: RunRecord
  agent: AgentSpec
  workspaceRoot: string
  tools: RuntimeTool[]
}

export type ProviderQueryBuilder = (input: BuildProviderQueryInput) => QueryInput
