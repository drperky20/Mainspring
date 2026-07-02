import type { ProviderUsage, RuntimePolicy } from '#protocol'
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
  capabilities?: RunLogCapability[]
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
  providerId?: string
  modelId?: string
  credentialRef?: string
  workerId?: string
  leaseUntil?: string
  metadata?: Record<string, unknown>
}

export type RunLogEventType =
  | 'run.created'
  | 'input.received'
  | 'run.queued'
  | 'run.claimed'
  | 'provider.init'
  | 'policy.decision.recorded'
  | 'assistant.delta'
  | 'assistant.result'
  | 'tool.call.requested'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'tool.call.blocked'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.denied'
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
  limit?: number
}

export interface ClaimRunInput {
  workerId: string
  leaseMs: number
}

export interface RunLogStore {
  initialize(): void
  putAgent(spec: AgentSpec): void
  getAgent(agentId: string): AgentSpec | null
  listAgents(): AgentSpec[]
  createRun(intent: RunIntent, agent: AgentSpec): RunRecord
  getRun(runId: string): RunRecord | null
  updateRunStatus(runId: string, status: RunStatus, patch?: Partial<RunRecord>): RunRecord
  claimNextRun(input: ClaimRunInput): RunRecord | null
  appendEvent<TPayload = unknown>(input: AppendRunEventInput<TPayload>): RunLogEvent<TPayload>
  listEvents(input?: ListRunEventsInput): RunLogEvent[]
  appendCheckpoint(input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp'>): RunCheckpoint
  latestCheckpoint(runId: string): RunCheckpoint | null
  putApprovalRequest(snapshot: RunLogApprovalRequestSnapshot): void
  getApprovalRequest(approvalId: string): RunLogApprovalRequestSnapshot | null
  putApprovalReceipt(receipt: RunLogApprovalReceipt): void
  getApprovalReceipt(receiptId: string): RunLogApprovalReceipt | null
  getApprovedUnusedReceipt(runId: string): RunLogApprovalReceipt | null
  markApprovalReceiptUsed(receiptId: string, runId: string): boolean
}

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
  approvalReceiptKey?: string
  secretResolver?: RuntimeSecretResolver
  maxToolIterations?: number
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
