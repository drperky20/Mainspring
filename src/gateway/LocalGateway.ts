import {
  DEFAULT_MAINSPRING_RUNTIME_PROFILE,
  MAINSPRING_RUNTIME_PROFILES,
  MainspringRuntimeProfileIdSchema,
  type GatewayRunDispatch,
  type MainspringRuntimeProfile,
  type MainspringRuntimeProfileRegistration,
  type ProviderUsage,
  type RuntimePolicy,
} from '#protocol'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type {
  MainspringApprovalRecord,
  MainspringSessionRecord,
  RunEvent,
  RunRecord,
  RuntimeHealth,
  StartRunInput,
  UsageUpdatedRunEventPayload,
} from '../contracts/runtime.js'
import { latestProviderInitDetailFromRunEvents } from '../contracts/runtime.js'
import {
  MainspringMailbox,
  type InboundMessage,
  type RuntimeEventRow,
} from '../mailbox/SqliteMailbox.js'
import { normalizeRuntimeEventRow } from '../events/normalizeRuntimeEvent.js'
import type { Mainspring } from '../sdk/Mainspring.js'
import type { RunLogMainspring } from '../sdk/RunLogMainspring.js'
import type {
  AgentSpec,
  RunLogCapability,
  RunLogEvent,
  RunRecord as RunLogRunRecord,
} from '../core/types.js'
import type { RunLogRunProjection } from '../hosts/runlog/RunLogProjection.js'
import type { DecisionRecord } from '../policy/DecisionRecord.js'
import { estimateUsageCost } from '../usage/UsageAccounting.js'
import {
  describeModelPricingCatalog,
  modelPricingCatalogFromEnv,
  modelPricingCatalogPathFromEnv,
  modelPricingCatalogSourceLabel,
  type ModelPricing,
  type ModelPricingCatalogStatus,
} from '../usage/ModelPricing.js'
import { summarizeUsageLedger, type UsageLedgerSummary } from '../usage/UsageLedger.js'
import {
  cronMetadataWithDecision,
  decideRunLogCron,
  decisionRecordForRun,
  type RunLogCronJob,
  type RunLogCronPolicyMetadata,
} from '../capabilities/cron/RunLogCron.js'
import {
  nextCronOccurrence,
  parseCronExpression,
  type CronTimezone,
} from './CronExpression.js'
import {
  createDeploymentDriverRegistry,
  type DeploymentDriver,
  type DeploymentDriverRegistry,
  type LocalGatewayDeploymentCommandRunner,
  type LocalGatewayDeploymentExecutionResult,
  type LocalGatewayDeploymentOperation,
  type LocalGatewayDeploymentPlan,
} from './DeploymentWizard.js'
import {
  inspectExecutionBackends,
  type ExecutionBackendInventory,
} from '../tools/ExecutionBackend.js'
import {
  HyperCellScheduler,
  type AcquiredHyperCellRunLease,
  type HyperCellSchedulerStatus,
} from './HyperCellScheduler.js'
import {
  COMPATIBILITY_MAILBOX_REVISION_PROBE_MS,
  CompatibilityRunPageReader,
  compatibilityMailboxFingerprint,
  type CompatibilityRunPage,
} from './CompatibilityRunPage.js'
import {
  listLocalMarketplaceTemplates,
  type MarketplaceTemplateRecord,
} from './TemplateMarketplace.js'
import {
  RemoteMarketplaceRegistry,
  type RemoteMarketplaceFetchOptions,
  type RemoteMarketplaceSource,
} from './RemoteMarketplace.js'
import type { ProvenanceReviewItem } from '../provenance/ProvenanceReview.js'
import {
  GatewayMemoryControl,
  type LocalGatewayMemoryCorrectionInput,
  type LocalGatewayMemoryCorrectionResult,
  type LocalGatewayMemoryDeletionInput,
  type LocalGatewayMemoryDeletionResult,
} from './GatewayMemoryControl.js'
import {
  GatewayDeploymentControl,
  type CreateLocalGatewayDeploymentTargetDraftInput,
  type UpdateLocalGatewayDeploymentTargetDraftInput,
} from './GatewayDeploymentControl.js'
import {
  GatewayProvenanceReviewControl,
  type LocalGatewayAppliedProvenanceReview,
  type LocalGatewayProvenanceReviewApplyInput,
  type LocalGatewayProvenanceReviewDecisionInput,
  type LocalGatewayProvenanceReviewListInput,
} from './GatewayProvenanceReviewControl.js'
import {
  GatewayCronControl,
  type LocalGatewayCreateCronGrantInput,
  type LocalGatewayCronGrantPreview,
  type LocalGatewayCronScheduleDraftInput,
  type LocalGatewayCronTriggerAuthorization,
  type UpdateLocalGatewayCronScheduleDraftInput,
} from './GatewayCronControl.js'
import {
  GatewayBudgetControl,
  type LocalGatewayBudgetDraftInput,
  type UpdateLocalGatewayBudgetDraftInput,
} from './GatewayBudgetControl.js'
import {
  GatewayProviderProfileControl,
  type CreateLocalGatewayProviderProfileDraftInput,
  type UpdateLocalGatewayProviderProfileDraftInput,
} from './GatewayProviderProfileControl.js'
import { GatewayTopologyControl } from './GatewayTopologyControl.js'
import { GatewayMarketplaceControl } from './GatewayMarketplaceControl.js'
import { GatewayRunControl } from './GatewayRunControl.js'
export type {
  LocalGatewayMemoryCorrectionInput,
  LocalGatewayMemoryCorrectionResult,
  LocalGatewayMemoryDeletionInput,
  LocalGatewayMemoryDeletionResult,
} from './GatewayMemoryControl.js'
export type {
  CreateLocalGatewayDeploymentTargetDraftInput,
  UpdateLocalGatewayDeploymentTargetDraftInput,
} from './GatewayDeploymentControl.js'
export type {
  LocalGatewayAppliedProvenanceReview,
  LocalGatewayProvenanceReviewApplyInput,
  LocalGatewayProvenanceReviewDecisionInput,
  LocalGatewayProvenanceReviewListInput,
} from './GatewayProvenanceReviewControl.js'
export type {
  LocalGatewayCreateCronGrantInput,
  LocalGatewayCronGrantPreview,
  LocalGatewayCronScheduleDraftInput,
  LocalGatewayCronTriggerAuthorization,
  UpdateLocalGatewayCronScheduleDraftInput,
} from './GatewayCronControl.js'
export type {
  LocalGatewayBudgetDraftInput,
  UpdateLocalGatewayBudgetDraftInput,
} from './GatewayBudgetControl.js'
export type {
  CreateLocalGatewayProviderProfileDraftInput,
  UpdateLocalGatewayProviderProfileDraftInput,
} from './GatewayProviderProfileControl.js'
export type {
  LocalGatewayDeploymentCommandRunner,
  LocalGatewayDeploymentExecutionResult,
  LocalGatewayDeploymentOperation,
  LocalGatewayDeploymentPlan,
} from './DeploymentWizard.js'
import type {
  CreateLocalGatewayCronScheduleInput,
  LocalGatewayAgentRecord,
  LocalGatewayApprovalMetadataRecord,
  LocalGatewayAppStateStore,
  LocalGatewayArtifactRecord,
  LocalGatewayAuditEventRecord,
  LocalGatewayBudgetRecord,
  LocalGatewayBudgetScope,
  LocalGatewayCellLeaseRecord,
  LocalGatewayCellRecord,
  LocalGatewayCellSnapshotRecord,
  LocalGatewayClientRecord,
  LocalGatewayCronScheduleRecord,
  LocalGatewayDeploymentRunRecord,
  LocalGatewayDeploymentTargetRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayRunListCursor,
  LocalGatewayRunMetadataRecord,
  LocalGatewayToolCallRecord,
  UpdateLocalGatewayCronScheduleInput,
  LocalGatewayUsageLedgerEntryRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface CreateLocalMainspringGatewayOptions {
  runtime: Mainspring
  runLog?: RunLogMainspring
  appState?: LocalGatewayAppStateStore
  workspaceBaseRoot?: string
  cron?: {
    enabled?: boolean
    pollIntervalMs?: number
    now?: () => Date
  }
  deployments?: {
    repoRoot?: string
    commandRunner?: LocalGatewayDeploymentCommandRunner
    drivers?: DeploymentDriver[]
  }
  cells?: {
    inspectBackends?: () => ExecutionBackendInventory
    now?: () => Date
    leaseTtlMs?: number
    maxActiveLeasesPerCell?: number
  }
  marketplace?: {
    repoRoot?: string
    remote?: {
      sources: RemoteMarketplaceSource[]
      fetchImpl?: RemoteMarketplaceFetchOptions['fetchImpl']
      assertNetworkTarget?: RemoteMarketplaceFetchOptions['assertNetworkTarget']
      now?: RemoteMarketplaceFetchOptions['now']
    }
  }
  runtimeProfiles?: {
    profiles?: MainspringRuntimeProfileRegistration[]
  }
  pricingCatalog?: readonly ModelPricing[]
}

export interface CreateLocalGatewayClientWorkspaceInput {
  name: string
  workspaceRoot?: string
  workspaceName?: string
  contact?: string
  billingLabel?: string
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface CreateLocalGatewayClientWorkspaceResult {
  client: LocalGatewayClientRecord
  workspace?: LocalGatewayWorkspaceRecord
  session?: LocalGatewaySessionProjection
}

export interface CreateLocalGatewayWorkspaceSessionInput {
  clientId: string
  name: string
  workspaceRoot: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface CreateLocalGatewayWorkspaceSessionResult {
  workspace: LocalGatewayWorkspaceRecord
  session: LocalGatewaySessionProjection
}

export interface DeleteLocalGatewayWorkspaceResult {
  workspaceId: string
  deleted: true
}

export interface DeleteLocalGatewayClientResult {
  clientId: string
  deleted: true
}

export interface UpdateLocalGatewayClientWorkspaceInput {
  clientId: string
  name?: string
  status?: LocalGatewayClientRecord['status']
  contact?: string
  billingLabel?: string
  workspaceId?: string
  workspaceName?: string
  workspaceRoot?: string
  workspaceStatus?: LocalGatewayWorkspaceRecord['status']
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayClientWorkspaceResult {
  client: LocalGatewayClientRecord
  workspace?: LocalGatewayWorkspaceRecord
}

export interface CreateLocalGatewayAgentDraftInput {
  workspaceId: string
  name: string
  version?: string
  defaultModelId?: string
  instructions?: string
  outcome?: string
  voice?: string
  approvalMode?: string
  modelLabel?: string
  skills?: Record<string, boolean>
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayAgentDraftInput {
  agentId: string
  name?: string
  version?: string
  defaultModelId?: string
  instructions?: string
  outcome?: string
  voice?: string
  approvalMode?: string
  modelLabel?: string
  skills?: Record<string, boolean>
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewaySessionProjection {
  sessionId: string
  status: MainspringSessionRecord['status']
  workspaceRoot: string
  sessionPath: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayRunProjection {
  runId: string
  sessionId: string
  status: RunRecord['status']
  input?: string
  createdAt?: string
  lastEventAt?: string
  eventCount: number
  pendingInboundCount: number
  ownerId?: string
  workspaceId?: string
  agentId?: string
  computerId?: string
  providerId?: string
  providerProfileId?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  runtimeProfile?: MainspringRuntimeProfile
}

export interface LocalGatewayCompatibilityRunPage
  extends CompatibilityRunPage<LocalGatewayRunProjection> {}

export type LocalGatewayStartRunInput = StartRunInput & {
  sessionId: string
  providerProfileId?: string
  allowBudgetWarning?: boolean
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayEventListInput {
  sessionId: string
  runId?: string
  afterSeq?: number
  limit?: number
}

export interface LocalGatewayApprovalResponseInput {
  sessionId: string
  runId: string
  approvalId: string
  reason?: string
  response?: unknown
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayRunLogStartResult {
  run: RunLogRunRecord
  projection: RunLogRunProjection
}

export type LocalGatewayAppStateRunInput = LocalGatewayStartRunInput & {
  providerProfileId?: string
}

export interface LocalGatewayCronStatus {
  enabled: boolean
  running: boolean
  pollIntervalMs: number
  lastTickAt?: string
  lastError?: string
}

export interface InstallLocalMarketplaceTemplateInput {
  templateId: string
  workspaceRoot: string
  clientName?: string
  workspaceName?: string
  agentName?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface InstallLocalMarketplaceTemplateResult {
  template: MarketplaceTemplateRecord
  client: LocalGatewayClientRecord
  workspace?: LocalGatewayWorkspaceRecord
  session?: LocalGatewaySessionProjection
  agent: LocalGatewayAgentRecord
  installedFiles: string[]
}

export interface LocalGatewayBudgetEvaluation {
  budgetId: string
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  label: string
  scopeLabel: string
  status: 'ok' | 'warn' | 'blocked'
  maxEstimatedCostUsd: number
  warnAtUsd: number
  usedEstimatedCostUsd: number
  remainingEstimatedCostUsd: number
  usageEntryCount: number
  pricedUsageEntryCount: number
  unpricedUsageEntryCount: number
  estimateCoverage: 'complete' | 'incomplete'
  costSensitiveTools: {
    mode: 'allow' | 'approval' | 'block'
    reason: string
  }
}

export interface LocalGatewayBudgetStatus {
  evaluations: LocalGatewayBudgetEvaluation[]
  blocked: number
  warnings: number
  usageStatus: LocalGatewayUsageStatus
}

export type LocalGatewayPricingCatalogStatus = ModelPricingCatalogStatus

export interface LocalGatewayUsageRollup {
  scopeType: 'total' | LocalGatewayBudgetScope
  scopeId: string
  scopeLabel: string
  summary: UsageLedgerSummary
}

export interface LocalGatewayUsageStatus {
  total: LocalGatewayUsageRollup
  clients: LocalGatewayUsageRollup[]
  workspaces: LocalGatewayUsageRollup[]
  agents: LocalGatewayUsageRollup[]
  unpricedEntries: number
  pricedEntries: number
  estimatedCostUsd: number
}

function runtimeBudgetPolicyFromEvaluations(
  evaluations: readonly LocalGatewayBudgetEvaluation[],
): RuntimePolicy['budget'] | undefined {
  if (evaluations.length === 0) return undefined
  const severity = { blocked: 2, warn: 1, ok: 0 } as const
  const [selected] = [...evaluations].sort((left, right) => {
    const severityDelta = severity[right.status] - severity[left.status]
    if (severityDelta !== 0) return severityDelta
    return left.remainingEstimatedCostUsd - right.remainingEstimatedCostUsd
  })
  if (!selected) return undefined
  return {
    status: selected.status,
    scopeType: selected.scopeType,
    scopeId: selected.scopeId,
    budgetId: selected.budgetId,
    label: selected.label,
    reason:
      selected.status === 'blocked'
        ? `Budget blocked: ${selected.label} (${selected.scopeLabel})`
        : selected.status === 'warn'
          ? `Budget warning acknowledged: ${selected.label} (${selected.scopeLabel})`
          : `Budget ok: ${selected.label} (${selected.scopeLabel})`,
    estimatedCostUsd: selected.usedEstimatedCostUsd,
    remainingEstimatedCostUsd: selected.remainingEstimatedCostUsd,
    requireApproval: false,
    enforceUsageLimit: true,
    costSensitiveTools: selected.costSensitiveTools,
  }
}

export type LocalGatewayCellStatus = HyperCellSchedulerStatus | {
  enabled: false
  leaseTtlMs: number
  capacityEnforced: false
  cells: 0
  leases: {
    active: 0
    released: 0
    expired: 0
    total: 0
  }
  cellStatuses: []
}

class LocalGatewayRuntimeProfileRegistry {
  private readonly profiles = new Map<string, MainspringRuntimeProfileRegistration>()

  constructor(extraProfiles: readonly MainspringRuntimeProfileRegistration[] = []) {
    for (const [profileId, info] of Object.entries(MAINSPRING_RUNTIME_PROFILES)) {
      this.register({ profileId, ...info })
    }
    for (const profile of extraProfiles) this.register(profile)
  }

  register(profile: MainspringRuntimeProfileRegistration): void {
    const profileId = MainspringRuntimeProfileIdSchema.parse(profile.profileId)
    this.profiles.set(profileId, { ...profile, profileId })
  }

  assertRegistered(profileId: string | undefined): string | undefined {
    if (!profileId) return undefined
    const safeProfileId = MainspringRuntimeProfileIdSchema.parse(profileId)
    if (!this.profiles.has(safeProfileId)) {
      throw new Error(`Unknown runtime profile: ${safeProfileId}`)
    }
    return safeProfileId
  }

  defaultProfile(): string {
    return this.assertRegistered(DEFAULT_MAINSPRING_RUNTIME_PROFILE)!
  }
}

export interface LocalGatewaySnapshot {
  generatedAt: string
  health: RuntimeHealth
  executionBackends: ExecutionBackendInventory
  appState: {
    clients: LocalGatewayClientRecord[]
    workspaces: LocalGatewayWorkspaceRecord[]
    agents: LocalGatewayAgentRecord[]
    providerProfiles: LocalGatewayProviderProfileRecord[]
    runs: LocalGatewayRunMetadataRecord[]
    approvals: LocalGatewayApprovalMetadataRecord[]
    artifacts: LocalGatewayArtifactRecord[]
    toolCalls: LocalGatewayToolCallRecord[]
    deploymentTargets?: LocalGatewayDeploymentTargetRecord[]
    deploymentRuns?: LocalGatewayDeploymentRunRecord[]
    cells?: LocalGatewayCellRecord[]
    cellLeases?: LocalGatewayCellLeaseRecord[]
    cellSnapshots?: LocalGatewayCellSnapshotRecord[]
    cronSchedules?: LocalGatewayCronScheduleRecord[]
    budgets?: LocalGatewayBudgetRecord[]
    usageLedger: LocalGatewayUsageLedgerEntryRecord[]
    auditEvents: LocalGatewayAuditEventRecord[]
  }
  sessions: LocalGatewaySessionProjection[]
  runs: LocalGatewayRunProjection[]
  approvals: MainspringApprovalRecord[]
  runLog?: LocalGatewayRunLogSnapshot
  cron: LocalGatewayCronStatus
  pricingCatalog: LocalGatewayPricingCatalogStatus
  usageStatus: LocalGatewayUsageStatus
  budgetStatus: LocalGatewayBudgetStatus
  cellStatus: LocalGatewayCellStatus
}

export interface LocalGatewayRunLogSnapshot {
  configured: boolean
  worker: LocalGatewayRunLogWorkerStatus
  runs: LocalGatewayRunLogRunProjection[]
}

export interface LocalGatewayRunLogWorkerStatus {
  state: 'running' | 'stopped'
  queuedRuns: number
  outbox: {
    pending: number
    claimed: number
    retryable: number
    completed: number
    failed: number
    cancelled: number
  }
}

export interface LocalGatewayRunLogRunProjection {
  runId: string
  sessionId: string
  agentId: string
  status: RunLogRunRecord['status']
  workspaceId?: string
  providerId?: string
  modelId?: string
  createdAt: string
  updatedAt: string
  assistantText: string
  latestSeq: number
  eventCount: number
  lastEventType?: string
  pendingApprovals: Array<{
    approvalId?: string
    toolCallId?: string
  }>
  approvalDecisions: Array<{
    approvalId?: string
    receiptId?: string
    decision: 'approved' | 'denied'
  }>
  toolCalls: Array<{
    toolCallId?: string
    name?: string
    status: 'requested' | 'updated' | 'completed' | 'failed' | 'blocked'
  }>
  checkpoints: Array<{
    eventId: string
    seq: number
    kind?: string
  }>
  policyDecisions: DecisionRecord[]
  errors: Array<{
    eventId: string
    seq: number
    type: 'runtime.error' | 'run.failed'
    message?: string
  }>
}

function projectSession(session: MainspringSessionRecord): LocalGatewaySessionProjection {
  return {
    sessionId: session.sessionId,
    status: session.status,
    workspaceRoot: session.workspaceRoot,
    sessionPath: session.sessionPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.metadata ? { metadata: session.metadata } : {}),
  }
}

function requiredGatewayText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

function gatewayRunStatusFromEvents(events: RunEvent[]): RunRecord['status'] {
  let status: RunRecord['status'] = 'queued'
  for (const event of events) {
    switch (event.type) {
      case 'run.started':
        status = 'running'
        break
      case 'approval.requested':
        status = 'waiting_approval'
        break
      case 'approval.approved':
      case 'approval.denied':
        if (status === 'waiting_approval') status = 'running'
        break
      case 'run.completed':
        status = 'completed'
        break
      case 'run.failed':
        status = 'failed'
        break
      case 'run.cancelled':
        status = 'cancelled'
        break
      default:
        break
    }
  }
  return status
}

function projectionFromDispatch(
  message: InboundMessage,
  dispatch: GatewayRunDispatch,
): LocalGatewayRunProjection {
  const options = dispatch.intent.runtimeOptions
  return {
    runId: dispatch.runId,
    sessionId: message.sessionId,
    status: 'queued',
    input: dispatch.intent.message,
    createdAt: message.timestamp,
    eventCount: 0,
    pendingInboundCount: 1,
    ownerId: dispatch.ownerId,
    workspaceId: dispatch.workspaceId,
    agentId: dispatch.agentId,
    computerId: dispatch.computerId,
    runtimeProfile: dispatch.runtimeProfile,
    ...(options?.providerId ? { providerId: options.providerId } : {}),
    ...(options?.modelId ? { modelId: options.modelId } : {}),
  }
}

function compatibilityRunProjectionFromMetadata(
  record: LocalGatewayRunMetadataRecord,
): LocalGatewayRunProjection {
  return {
    runId: record.runId,
    sessionId: record.sessionId,
    status: 'queued',
    createdAt: record.createdAt,
    lastEventAt: record.updatedAt,
    eventCount: 0,
    pendingInboundCount: 0,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.providerProfileId ? { providerProfileId: record.providerProfileId } : {}),
    ...(record.providerId ? { providerId: record.providerId } : {}),
    ...(record.modelId ? { modelId: record.modelId } : {}),
    ...(record.runtimeProfile
      ? { runtimeProfile: record.runtimeProfile as MainspringRuntimeProfile }
      : {}),
  }
}

function mergeRunProjection(
  existing: LocalGatewayRunProjection | undefined,
  incoming: LocalGatewayRunProjection,
): LocalGatewayRunProjection {
  return {
    ...existing,
    ...incoming,
    input: incoming.input ?? existing?.input,
    createdAt: existing?.createdAt ?? incoming.createdAt,
    eventCount: (existing?.eventCount ?? 0) + incoming.eventCount,
    pendingInboundCount: (existing?.pendingInboundCount ?? 0) + incoming.pendingInboundCount,
    ownerId: incoming.ownerId ?? existing?.ownerId,
    workspaceId: incoming.workspaceId ?? existing?.workspaceId,
    agentId: incoming.agentId ?? existing?.agentId,
    computerId: incoming.computerId ?? existing?.computerId,
    providerId: existing?.providerId ?? incoming.providerId,
    providerProfileId: incoming.providerProfileId ?? existing?.providerProfileId,
    modelId: existing?.modelId ?? incoming.modelId,
    modelFamily: existing?.modelFamily ?? incoming.modelFamily,
    providerTransport: existing?.providerTransport ?? incoming.providerTransport,
    providerSessionId: existing?.providerSessionId ?? incoming.providerSessionId,
    runtimeProfile: incoming.runtimeProfile ?? existing?.runtimeProfile,
  }
}

function providerInitProjectionFromEvents(
  events: RunEvent[],
): Pick<
  LocalGatewayRunProjection,
  'providerId' | 'modelId' | 'modelFamily' | 'providerTransport' | 'providerSessionId'
> {
  const detail = latestProviderInitDetailFromRunEvents(events)
  if (!detail) return {}
  return {
    ...(detail.provider ? { providerId: detail.provider } : {}),
    ...(detail.modelId ? { modelId: detail.modelId } : {}),
    ...(detail.modelFamily ? { modelFamily: detail.modelFamily } : {}),
    ...(detail.providerTransport ? { providerTransport: detail.providerTransport } : {}),
    ...(detail.providerSessionId ? { providerSessionId: detail.providerSessionId } : {}),
  }
}

function approvalIdFromEvent(event: RunEvent): string | null {
  if (
    event.type !== 'approval.requested'
    && event.type !== 'approval.approved'
    && event.type !== 'approval.denied'
  ) {
    return null
  }
  const payload = event.payload as Record<string, unknown>
  if (typeof payload.id === 'string') return payload.id
  if (typeof payload.approvalId === 'string') return payload.approvalId
  return null
}

function runLogCapabilitiesFromGatewayInput(input: LocalGatewayStartRunInput): RunLogCapability[] {
  const capabilities = new Set<RunLogCapability>(['provider'])
  const allowedTools = input.allowedTools ?? []
  if (allowedTools.length > 0) capabilities.add('tools')
  if (allowedTools.some((tool) => tool.includes('file'))) capabilities.add('files')
  if (input.runtimeProfile?.includes('browser')) capabilities.add('browser')
  if (input.runtimeProfile?.includes('memory') || input.allowMemory) capabilities.add('memory')
  if (input.workspaceId) capabilities.add('workspace')
  return [...capabilities]
}

function gatewayRunBinding(
  input: LocalGatewayStartRunInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { actor: _actor, allowBudgetWarning: _allowBudgetWarning, ...binding } = input
  return { ...binding, ...extra }
}

function runLogCronCapabilitiesFromGatewayInput(input: LocalGatewayStartRunInput): RunLogCapability[] {
  return [...new Set<RunLogCapability>([...runLogCapabilitiesFromGatewayInput(input), 'cron'])]
}

function gatewayCronScheduleKey(input: {
  cronExpr: string
  timezone: CronTimezone
}): string {
  return `${input.cronExpr.trim()}|${input.timezone}`
}

function gatewayCronPolicyIntervalMs(): number {
  return 0
}

function approvalPolicyFromGatewayMode(value: unknown): RuntimePolicy['approvalPolicy'] | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.toLowerCase()
  if (normalized.includes('ask')) return 'ask-first'
  if (normalized.includes('manual')) return 'ask-first'
  if (normalized.includes('auto')) return 'balanced'
  if (normalized.includes('balanced')) return 'balanced'
  return undefined
}

function projectLocalRunLogRun(projection: RunLogRunProjection): LocalGatewayRunLogRunProjection {
  return {
    runId: projection.run.runId,
    sessionId: projection.run.sessionId,
    agentId: projection.run.agentId,
    status: projection.status,
    ...(projection.run.workspaceId ? { workspaceId: projection.run.workspaceId } : {}),
    ...(projection.run.providerId ? { providerId: projection.run.providerId } : {}),
    ...(projection.run.modelId ? { modelId: projection.run.modelId } : {}),
    createdAt: projection.run.createdAt,
    updatedAt: projection.run.updatedAt,
    assistantText: projection.assistantText,
    latestSeq: projection.latestSeq,
    eventCount: projection.eventCount,
    ...(projection.events.at(-1)?.type ? { lastEventType: projection.events.at(-1)?.type } : {}),
    pendingApprovals: projection.pendingApprovals.map((approval) => ({
      ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      ...(approval.toolCallId ? { toolCallId: approval.toolCallId } : {}),
    })),
    approvalDecisions: projection.approvalDecisions.map((approval) => ({
      ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      ...(approval.receiptId ? { receiptId: approval.receiptId } : {}),
      decision: approval.decision,
    })),
    toolCalls: projection.toolCalls.map((call) => ({
      ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
      ...(call.name ? { name: call.name } : {}),
      status: call.status,
    })),
    checkpoints: projection.checkpoints.map((checkpoint) => ({
      eventId: checkpoint.eventId,
      seq: checkpoint.seq,
      ...(checkpoint.kind ? { kind: checkpoint.kind } : {}),
    })),
    policyDecisions: projection.policyDecisions,
    errors: projection.errors.map((error) => ({
      eventId: error.eventId,
      seq: error.seq,
      type: error.type,
      ...(error.message ? { message: error.message } : {}),
    })),
  }
}

function usageEntryIdForEvent(event: RunEvent): string {
  return `usage_${event.eventId}`
}

function usageEntryIdForRunLogEvent(event: RunLogEvent): string {
  return `usage_runlog_${event.eventId}`
}

function providerUsageFromRunLogEvent(event: RunLogEvent): ProviderUsage | null {
  if (event.type !== 'usage.reported') return null
  const payload = recordValue(event.payload)
  const usage = recordValue(payload?.usage)
  if (!usage) return null

  const result: ProviderUsage = {}
  for (const key of ['provider', 'modelId', 'modelFamily', 'providerTransport'] as const) {
    const value = textValue(usage[key])
    if (value) result[key] = value
  }
  for (const key of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningTokens',
  ] as const) {
    const value = usage[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) result[key] = value
  }
  if (recordValue(usage.rateLimit)) {
    result.rateLimit = usage.rateLimit as ProviderUsage['rateLimit']
  }
  return result
}

function executionCellId(workspaceId: string, backendKey: string): string {
  return `cell_exec_${workspaceId}_${backendKey}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function executionLeaseId(toolCallId: string, backendSessionId?: string): string {
  return `lease_exec_${(backendSessionId ?? toolCallId)}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function artifactPathFromId(rootPath: string, artifactId: string): string | null {
  const normalizedArtifactId = artifactId.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalizedArtifactId)) {
    return null
  }
  const root = path.resolve(rootPath)
  const candidate = path.resolve(root, normalizedArtifactId)
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return candidate
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function assertPathContained(root: string, target: string, message: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(message)
  }
}

function nearestExistingPath(target: string): string | null {
  let current = path.resolve(target)
  for (;;) {
    if (fs.existsSync(current)) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function backendCapabilityMetadata(value: unknown): Record<string, unknown> | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const metadata: Record<string, unknown> = {}
  for (const key of [
    'isolationKind',
    'isolationStrength',
    'securityBoundary',
    'networkPolicy',
    'workspaceMapping',
  ]) {
    const text = textValue(record[key])
    if (text) metadata[key] = text
  }
  for (const key of ['requiresApproval', 'unsafeFallback']) {
    if (typeof record[key] === 'boolean') metadata[key] = record[key]
  }
  const limits = stringListValue(record.limits)
  if (limits.length > 0) metadata.limits = limits
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function emptyUsageRollup(): LocalGatewayUsageRollup {
  return {
    scopeType: 'total',
    scopeId: 'total',
    scopeLabel: 'All usage',
    summary: summarizeUsageLedger([]),
  }
}

function emptyUsageStatus(): LocalGatewayUsageStatus {
  const total = emptyUsageRollup()
  return {
    total,
    clients: [],
    workspaces: [],
    agents: [],
    unpricedEntries: 0,
    pricedEntries: 0,
    estimatedCostUsd: 0,
  }
}

type LocalGatewayUsageEvaluationContext = {
  usageEntries: LocalGatewayUsageLedgerEntryRecord[]
  runsById: Map<string, LocalGatewayRunMetadataRecord>
  workspacesById: Map<string, LocalGatewayWorkspaceRecord>
  agentsById: Map<string, LocalGatewayAgentRecord>
  clientsById: Map<string, LocalGatewayClientRecord>
}

type LocalGatewaySnapshotReadCache = {
  eventsBySessionId: Map<string, RunEvent[]>
  rawEventsBySessionId: Map<string, RuntimeEventRow[]>
  runMetadataBySessionId: Map<string, Map<string, LocalGatewayRunMetadataRecord>>
}

/**
 * In-process Local Gateway boundary over the SDK/runtime package.
 *
 * This is not a desktop shell, network server, secret store, or isolation
 * manager. It keeps command writes on the SDK command store so runs, cancels,
 * and approval responses still enter the per-session mailbox.
 */
export class LocalMainspringGateway {
  readonly appState?: LocalGatewayAppStateStore
  private readonly cronEnabled: boolean
  private readonly cronPollIntervalMs: number
  private readonly now: () => Date
  private readonly deploymentRepoRoot: string
  private readonly deploymentCommandRunner?: LocalGatewayDeploymentCommandRunner
  private readonly deploymentDrivers: DeploymentDriverRegistry
  private readonly inspectExecutionBackends: () => ExecutionBackendInventory
  private readonly marketplaceRepoRoot: string
  private readonly remoteMarketplace: RemoteMarketplaceRegistry | null
  private readonly workspaceBaseRoot: string
  private readonly runtimeProfiles: LocalGatewayRuntimeProfileRegistry
  private readonly pricingCatalog: readonly ModelPricing[]
  private readonly pricingCatalogStatus: LocalGatewayPricingCatalogStatus
  private readonly budgetEvaluationStateById = new Map<string, LocalGatewayBudgetEvaluation['status']>()
  private readonly hyperCells?: HyperCellScheduler
  private compatibilityMailboxRevision?: { checkedAtMs: number; fingerprint: string }
  private readonly compatibilityRunPageReader: CompatibilityRunPageReader<LocalGatewayRunProjection>
  private snapshotReadCache?: LocalGatewaySnapshotReadCache
  private cronTimer: NodeJS.Timeout | null = null
  private cronLastTickAt?: string
  private cronLastError?: string
  private cronTickInFlight: Promise<void> | null = null

  constructor(
    private readonly runtime: Mainspring,
    options: CreateLocalMainspringGatewayOptions = { runtime },
  ) {
    this.runLogRuntime = options.runLog
    this.appState = options.appState
    this.compatibilityRunPageReader = new CompatibilityRunPageReader({
      appState: () => this.appState,
      getSession: (sessionId) => this.runtime.storage.stateStore.getSession(sessionId),
      projectSession: (sessionId, knownSession) => this.listRuns(sessionId, knownSession),
      projectionFromMetadata: compatibilityRunProjectionFromMetadata,
    })
    this.cronEnabled = options.cron?.enabled ?? false
    this.cronPollIntervalMs = Math.max(1_000, options.cron?.pollIntervalMs ?? 30_000)
    this.now = options.cron?.now ?? (() => new Date())
    this.deploymentRepoRoot = options.deployments?.repoRoot ?? process.cwd()
    this.deploymentCommandRunner = options.deployments?.commandRunner
    this.deploymentDrivers = createDeploymentDriverRegistry(options.deployments?.drivers)
    this.inspectExecutionBackends = options.cells?.inspectBackends ?? (() => inspectExecutionBackends())
    this.marketplaceRepoRoot = options.marketplace?.repoRoot ?? process.cwd()
    this.remoteMarketplace = options.marketplace?.remote
      ? new RemoteMarketplaceRegistry(options.marketplace.remote.sources, {
          ...(options.marketplace.remote.fetchImpl ? { fetchImpl: options.marketplace.remote.fetchImpl } : {}),
          ...(options.marketplace.remote.assertNetworkTarget
            ? { assertNetworkTarget: options.marketplace.remote.assertNetworkTarget }
            : {}),
          ...(options.marketplace.remote.now ? { now: options.marketplace.remote.now } : {}),
        })
      : null
    this.runtimeProfiles = new LocalGatewayRuntimeProfileRegistry(options.runtimeProfiles?.profiles)
    this.workspaceBaseRoot = path.resolve(
      options.workspaceBaseRoot
        ?? (this.runtime.options.workspaceRoot
          ? path.dirname(this.runtime.options.workspaceRoot)
          : process.cwd()),
    )
    const envPricingCatalogPath = modelPricingCatalogPathFromEnv()
    this.pricingCatalog = options.pricingCatalog ?? modelPricingCatalogFromEnv()
    this.pricingCatalogStatus = describeModelPricingCatalog({
      catalog: this.pricingCatalog,
      configured: Boolean(options.pricingCatalog ?? envPricingCatalogPath),
      configuredEntries: options.pricingCatalog
        ? this.pricingCatalog.length
        : envPricingCatalogPath
          ? Math.max(0, this.pricingCatalog.length - describeModelPricingCatalog().builtInEntries)
          : 0,
      sourceLabel: options.pricingCatalog
        ? 'in-process catalog'
        : envPricingCatalogPath
          ? modelPricingCatalogSourceLabel(envPricingCatalogPath)
          : undefined,
    })
    this.hyperCells = this.appState
      ? new HyperCellScheduler({
          appState: this.appState,
          inspectBackends: this.inspectExecutionBackends,
          ...(options.cells?.now ? { now: options.cells.now } : {}),
          ...(typeof options.cells?.leaseTtlMs === 'number'
            ? { leaseTtlMs: options.cells.leaseTtlMs }
            : {}),
          ...(typeof options.cells?.maxActiveLeasesPerCell === 'number'
            ? { maxActiveLeasesPerCell: options.cells.maxActiveLeasesPerCell }
            : {}),
        })
      : undefined
    if (this.cronEnabled && this.appState) {
      this.startCronScheduler()
    }
  }

  private readonly runLogRuntime?: RunLogMainspring
  private runLogWorkerState: LocalGatewayRunLogWorkerStatus['state'] = 'stopped'

  readonly sessions = {
    list: (): LocalGatewaySessionProjection[] =>
      this.runtime.storage.stateStore.listSessions().map(projectSession),
    get: (sessionId: string): LocalGatewaySessionProjection | null => {
      const session = this.runtime.storage.stateStore.getSession(sessionId)
      return session ? projectSession(session) : null
    },
  }

  readonly clients = {
    create: (input: CreateLocalGatewayClientWorkspaceInput): CreateLocalGatewayClientWorkspaceResult =>
      this.createClientWorkspace(input),
    update: (input: UpdateLocalGatewayClientWorkspaceInput): UpdateLocalGatewayClientWorkspaceResult =>
      this.updateClientWorkspace(input),
    delete: (clientId: string, actor?: string): DeleteLocalGatewayClientResult =>
      this.deleteClient(clientId, actor),
  }

  readonly workspaces = {
    create: (input: CreateLocalGatewayWorkspaceSessionInput): CreateLocalGatewayWorkspaceSessionResult =>
      this.createWorkspaceSession(input),
    delete: (workspaceId: string, actor?: string): DeleteLocalGatewayWorkspaceResult =>
      this.deleteWorkspace(workspaceId, actor),
  }

  readonly agents = {
    create: (input: CreateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord =>
      this.createAgentDraft(input),
    update: (input: UpdateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord =>
      this.updateAgentDraft(input),
  }

  readonly providerProfiles = {
    create: (
      input: CreateLocalGatewayProviderProfileDraftInput,
    ): LocalGatewayProviderProfileRecord => this.providerProfileControl().create(input),
    update: (
      input: UpdateLocalGatewayProviderProfileDraftInput,
    ): LocalGatewayProviderProfileRecord => this.providerProfileControl().update(input),
  }

  readonly cron = {
    list: (): LocalGatewayCronScheduleRecord[] => this.cronControl().list(),
    create: (
      input: LocalGatewayCronScheduleDraftInput,
    ): LocalGatewayCronScheduleRecord => this.cronControl().create(input),
    update: (
      input: UpdateLocalGatewayCronScheduleDraftInput,
    ): LocalGatewayCronScheduleRecord => this.cronControl().update(input),
    delete: (scheduleId: string, actor?: string): { scheduleId: string; deleted: true } => {
      this.cronControl().delete(scheduleId, actor)
      return { scheduleId, deleted: true }
    },
    runNow: (scheduleId: string, actor?: string): RunRecord | RunLogRunRecord =>
      this.runCronScheduleNow(scheduleId, 'manual', this.now(), actor),
    grantPreview: (scheduleId: string): LocalGatewayCronGrantPreview =>
      this.cronControl().previewGrant(scheduleId),
    createGrant: (input: LocalGatewayCreateCronGrantInput): LocalGatewayCronGrantPreview =>
      this.cronControl().createGrant(input),
    status: (): LocalGatewayCronStatus => ({
      enabled: this.cronEnabled,
      running: this.cronTimer !== null,
      pollIntervalMs: this.cronPollIntervalMs,
      ...(this.cronLastTickAt ? { lastTickAt: this.cronLastTickAt } : {}),
      ...(this.cronLastError ? { lastError: this.cronLastError } : {}),
    }),
    tick: async (): Promise<void> => {
      await this.runCronTick()
    },
  }

  readonly budgets = {
    list: (): LocalGatewayBudgetRecord[] => this.budgetControl().list(),
    create: (input: LocalGatewayBudgetDraftInput): LocalGatewayBudgetRecord =>
      this.budgetControl().create(input),
    update: (input: UpdateLocalGatewayBudgetDraftInput): LocalGatewayBudgetRecord =>
      this.budgetControl().update(input),
    delete: (budgetId: string, actor?: string): { budgetId: string; deleted: true } => {
      this.budgetControl().delete(budgetId, actor)
      return { budgetId, deleted: true }
    },
    status: (): LocalGatewayBudgetStatus => this.budgetStatus(),
  }

  readonly usage = {
    status: (): LocalGatewayUsageStatus => this.usageStatus(),
  }

  readonly deployments = {
    listTargets: (workspaceId?: string): LocalGatewayDeploymentTargetRecord[] =>
      this.deploymentControl().listTargets(workspaceId),
    listRuns: (input: {
      targetId?: string
      status?: LocalGatewayDeploymentRunRecord['status']
    } = {}): LocalGatewayDeploymentRunRecord[] => this.deploymentControl().listRuns(input),
    createTarget: (
      input: CreateLocalGatewayDeploymentTargetDraftInput,
    ): LocalGatewayDeploymentTargetRecord => this.deploymentControl().createTarget(input),
    updateTarget: (
      input: UpdateLocalGatewayDeploymentTargetDraftInput,
    ): LocalGatewayDeploymentTargetRecord => this.deploymentControl().updateTarget(input),
    plan: (input: {
      targetId: string
      operation: LocalGatewayDeploymentOperation
    }): LocalGatewayDeploymentPlan =>
      this.deploymentControl().plan(input),
    execute: (input: {
      targetId: string
      operation: LocalGatewayDeploymentOperation
      confirm: string
    }): LocalGatewayDeploymentExecutionResult => this.deploymentControl().execute(input),
  }

  readonly marketplace = {
    listTemplates: (): MarketplaceTemplateRecord[] => [
      ...listLocalMarketplaceTemplates(this.marketplaceRepoRoot),
      ...(this.remoteMarketplace?.list() ?? []),
    ],
    syncRemoteCatalogs: async (actor?: string): Promise<MarketplaceTemplateRecord[]> => {
      return this.marketplaceControl().syncRemoteCatalogs(actor)
    },
    installTemplate: (
      input: InstallLocalMarketplaceTemplateInput,
    ): InstallLocalMarketplaceTemplateResult => this.installMarketplaceTemplate(input),
  }

  readonly provenanceReviews = {
    list: (input: LocalGatewayProvenanceReviewListInput): ProvenanceReviewItem[] =>
      this.provenanceReviewControl().list(input),
    decide: (input: LocalGatewayProvenanceReviewDecisionInput): ProvenanceReviewItem =>
      this.provenanceReviewControl().decide(input),
    apply: (input: LocalGatewayProvenanceReviewApplyInput): LocalGatewayAppliedProvenanceReview =>
      this.provenanceReviewControl().apply(input),
  }

  readonly memory = {
    correct: (input: LocalGatewayMemoryCorrectionInput): LocalGatewayMemoryCorrectionResult =>
      new GatewayMemoryControl(this.requireAppState()).correct(input),
    delete: (input: LocalGatewayMemoryDeletionInput): LocalGatewayMemoryDeletionResult =>
      new GatewayMemoryControl(this.requireAppState()).delete(input),
  }

  readonly runs = {
    list: (sessionId: string): LocalGatewayRunProjection[] => {
      this.syncDerivedAppState()
      return this.listRuns(sessionId)
    },
    start: (input: LocalGatewayStartRunInput): RunRecord => {
      return this.startRun(input)
    },
    startFromAppState: (input: LocalGatewayAppStateRunInput): RunRecord => {
      return this.startRun(this.resolveAppStateRunInput(input), {
        providerProfileId: input.providerProfileId,
      })
    },
    cancel: (sessionId: string, runId: string, reason?: string, actor?: string): void => {
      this.cancelCompatibilityRun(sessionId, runId, reason, actor)
    },
  }

  readonly compatibilityRuns = {
    listPage: (input: {
      sessionId?: string
      before?: LocalGatewayRunListCursor
      limit?: number
    } = {}): LocalGatewayCompatibilityRunPage => this.compatibilityRunPageReader.list(input),
  }

  readonly events = {
    list: (input: LocalGatewayEventListInput): RunEvent[] =>
      this.runtime.storage.eventStore.listRunEvents(input),
  }

  readonly approvals = {
    list: (): MainspringApprovalRecord[] => {
      this.syncDerivedAppState()
      return this.runtime.approvals.list()
    },
    approve: (input: LocalGatewayApprovalResponseInput): void => {
      this.assertCompatibilityApprovalBinding(input)
      const runControl = this.runControl()
      const authorization = runControl?.authorizeApproval({
        approvalId: input.approvalId,
        runId: input.runId,
        sessionId: input.sessionId,
        decision: 'approved',
        actor: input.actor,
        binding: { reason: input.reason, response: input.response },
      })
      try {
        this.runtime.approvals.approve(input)
        this.recordGatewayApprovalDecision(input, 'approved')
        if (authorization) runControl?.recordApprovalOutcome({ authorization })
      } catch (error) {
        if (authorization) runControl?.recordApprovalFailure({ authorization })
        throw error
      }
    },
    deny: (input: LocalGatewayApprovalResponseInput): void => {
      this.assertCompatibilityApprovalBinding(input)
      const runControl = this.runControl()
      const authorization = runControl?.authorizeApproval({
        approvalId: input.approvalId,
        runId: input.runId,
        sessionId: input.sessionId,
        decision: 'denied',
        actor: input.actor,
        binding: { reason: input.reason, response: input.response },
      })
      try {
        this.runtime.approvals.deny(input)
        this.recordGatewayApprovalDecision(input, 'denied')
        if (authorization) runControl?.recordApprovalOutcome({ authorization })
      } catch (error) {
        if (authorization) runControl?.recordApprovalFailure({ authorization })
        throw error
      }
    },
  }

  readonly runLog = {
    available: (): boolean => Boolean(this.runLogRuntime),
    runs: {
      start: async (input: LocalGatewayStartRunInput): Promise<LocalGatewayRunLogStartResult> => {
        const runtime = this.requireRunLogRuntime()
        // A configured app-state store is the authorization boundary for gateway identifiers.
        // Resolve every RunLog ingress through it, rather than only provider-profile starts: a
        // caller must not be able to pair a session from one workspace with an agent from another.
        const resolvedInput = this.appState ? this.resolveAppStateRunInput(input) : input
        const session = this.runtime.storage.stateStore.getSession(resolvedInput.sessionId)
        if (!session) throw new Error(`Unknown session: ${resolvedInput.sessionId}`)
        const runtimeProfile = this.runtimeProfiles.assertRegistered(resolvedInput.runtimeProfile)
        const budgetEvaluations = this.assertRunBudgetAllowed(resolvedInput, session)
        const agentId = resolvedInput.agentId ?? runtime.defaultAgentId
        const workspaceRoot = resolvedInput.workspaceId
          ? this.appState?.workspaces.get(resolvedInput.workspaceId)?.root
          : session.workspaceRoot
        const runControl = this.runControl()
        const authorization = runControl?.authorizeEnqueue({
          sessionId: resolvedInput.sessionId,
          actor: resolvedInput.actor,
          workspaceId: resolvedInput.workspaceId,
          binding: gatewayRunBinding(
            { ...resolvedInput, ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}) },
            { agentId },
          ),
        })
        try {
          this.ensureRunLogAgent(resolvedInput, agentId)
          const handle = runtime.runs.start({
            agentId,
            input: resolvedInput.input,
            sessionId: resolvedInput.sessionId,
            workspaceId: resolvedInput.workspaceId,
            ...(workspaceRoot ? { workspaceRoot } : {}),
            ...(resolvedInput.computerId ? { computerId: resolvedInput.computerId } : {}),
            providerId: resolvedInput.providerId,
            modelId: resolvedInput.modelId,
            credentialRef: resolvedInput.credentialRef,
            allowedTools: resolvedInput.allowedTools ?? [],
            requestedCapabilities: runLogCapabilitiesFromGatewayInput(resolvedInput),
            metadata: {
              gatewaySurface: 'runlog',
              ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
              ...(resolvedInput.runtimeProfile
                ? { runtimeProfile: this.runtimeProfiles.assertRegistered(resolvedInput.runtimeProfile) }
                : {}),
              ...(authorization ? { gatewayRunDecisionId: authorization.decision.decisionId } : {}),
            },
          })
          this.persistRunLogMetadata(
            handle.record,
            { ...resolvedInput, ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}) },
            budgetEvaluations,
            authorization ? { gatewayRunDecisionId: authorization.decision.decisionId } : {},
          )
          if (authorization) {
            runControl?.recordEnqueueOutcome({
              authorization,
              runId: handle.record.runId,
              runtime: 'runlog',
            })
          }
          return { run: handle.record, projection: handle.projection() }
        } catch (error) {
          if (authorization) runControl?.recordEnqueueFailure({ authorization })
          throw error
        }
      },
      list: (input?: Parameters<RunLogMainspring['runs']['list']>[0]): RunLogRunRecord[] =>
        this.requireRunLogRuntime().runs.list(input),
      get: (runId: string): RunLogRunRecord | null => this.requireRunLogRuntime().store.getRun(runId),
      project: (runId: string): RunLogRunProjection => this.requireRunLogRuntime().project(runId),
      projectSummary: (runId: string, limit?: number): LocalGatewayRunLogRunProjection =>
        projectLocalRunLogRun(this.requireRunLogRuntime().project(runId, limit)),
      events: (input: {
        runId: string
        afterSeq?: number
        beforeSeq?: number
        order?: 'asc' | 'desc'
        visibility?: RunLogEvent['visibility'] | RunLogEvent['visibility'][]
        limit?: number
      }): RunLogEvent[] =>
        this.requireRunLogRuntime().store.listEvents(input),
      cancel: (runId: string, reason?: string, actor?: string): RunLogRunRecord => {
        const runtime = this.requireRunLogRuntime()
        const existing = runtime.store.getRun(runId)
        if (!existing) throw new Error(`Unknown RunLog run: ${runId}`)
        const runControl = this.runControl()
        const authorization = runControl?.authorizeCancel({
          runId: existing.runId,
          sessionId: existing.sessionId,
          actor,
          binding: { reason },
        })
        try {
          const cancelled = runtime.runs.cancel(runId, reason)
          if (authorization) runControl?.recordCancelOutcome({ authorization, runtime: 'runlog' })
          return cancelled
        } catch (error) {
          if (authorization) runControl?.recordCancelFailure({ authorization })
          throw error
        }
      },
    },
    startWorker: (): void => {
      const runtime = this.requireRunLogRuntime()
      runtime.startWorker()
      this.runLogWorkerState = 'running'
    },
    stopWorker: async (): Promise<void> => {
      const runtime = this.requireRunLogRuntime()
      try {
        await runtime.stopWorker()
      } finally {
        this.runLogWorkerState = 'stopped'
      }
    },
    workerStatus: (): LocalGatewayRunLogWorkerStatus => this.runLogWorkerStatus(),
    toolCalls: {
      list: (input?: Parameters<RunLogMainspring['toolCalls']['list']>[0]) =>
        this.requireRunLogRuntime().toolCalls.list(input),
    },
    approvals: {
      list: (input?: Parameters<RunLogMainspring['store']['listApprovalRequests']>[0]) =>
        this.requireRunLogRuntime().store.listApprovalRequests(input),
      approve: async (input: LocalGatewayApprovalResponseInput): Promise<RunLogRunProjection> => {
        const runtime = this.requireRunLogRuntime()
        this.assertRunLogApprovalBinding(runtime, input)
        const runControl = this.runControl()
        const authorization = runControl?.authorizeApproval({
          approvalId: input.approvalId,
          runId: input.runId,
          sessionId: input.sessionId,
          decision: 'approved',
          actor: input.actor,
          binding: { reason: input.reason, response: input.response },
        })
        const actor = authorization?.actor ?? (input.actor?.trim() || 'local-gateway')
        try {
          const receipt = runtime.approvals.approve({
            approvalId: input.approvalId,
            actor,
          })
          this.recordGatewayApprovalDecision(input, 'approved')
          if (authorization) runControl?.recordApprovalOutcome({ authorization, receiptId: receipt.receiptId })
          return runtime.project(input.runId)
        } catch (error) {
          if (authorization) runControl?.recordApprovalFailure({ authorization })
          throw error
        }
      },
      deny: async (input: LocalGatewayApprovalResponseInput): Promise<RunLogRunProjection> => {
        const runtime = this.requireRunLogRuntime()
        this.assertRunLogApprovalBinding(runtime, input)
        const runControl = this.runControl()
        const authorization = runControl?.authorizeApproval({
          approvalId: input.approvalId,
          runId: input.runId,
          sessionId: input.sessionId,
          decision: 'denied',
          actor: input.actor,
          binding: { reason: input.reason, response: input.response },
        })
        const actor = authorization?.actor ?? (input.actor?.trim() || 'local-gateway')
        try {
          const receipt = runtime.approvals.deny({
            approvalId: input.approvalId,
            actor,
          })
          this.recordGatewayApprovalDecision(input, 'denied')
          if (authorization) runControl?.recordApprovalOutcome({ authorization, receiptId: receipt.receiptId })
          return runtime.project(input.runId)
        } catch (error) {
          if (authorization) runControl?.recordApprovalFailure({ authorization })
          throw error
        }
      },
    },
  }

  private requireRunLogRuntime(): RunLogMainspring {
    if (!this.runLogRuntime) throw new Error('RunLog gateway runtime is not configured.')
    return this.runLogRuntime
  }

  private ensureRunLogAgent(input: LocalGatewayStartRunInput, agentId: string): AgentSpec {
    const resolved = this.runLogAgentForInput(input, agentId)
    if (resolved.needsSync) {
      resolved.runtime.agents.put(resolved.agent)
    }
    return resolved.agent
  }

  /** Builds the agent view used by preview/policy evaluation without writing it. */
  private runLogAgentForInput(input: LocalGatewayStartRunInput, agentId: string): {
    runtime: RunLogMainspring
    agent: AgentSpec
    needsSync: boolean
  } {
    const runtime = this.requireRunLogRuntime()
    const existing = runtime.store.getAgent(agentId)
    const appAgent = input.agentId ? this.appState?.agents.get(input.agentId) : undefined
    if (existing && !appAgent) {
      return { runtime, agent: existing, needsSync: false }
    }
    const metadata = appAgent?.metadata && typeof appAgent.metadata === 'object'
      ? appAgent.metadata as Record<string, unknown>
      : {}
    const spec: AgentSpec = {
      agentId,
      instructions:
        typeof metadata.instructions === 'string'
          ? metadata.instructions
          : appAgent?.name
            ? `You are ${appAgent.name}.`
            : existing?.instructions ?? 'You are a Mainspring RunLog gateway agent.',
      providerId: input.providerId ?? existing?.providerId,
      modelId: input.modelId ?? appAgent?.defaultModelId ?? existing?.modelId,
      tools: input.allowedTools ?? existing?.tools ?? [],
      approvalPolicy:
        approvalPolicyFromGatewayMode(metadata.approvalMode) ?? existing?.approvalPolicy,
      capabilities:
        runLogCapabilitiesFromGatewayInput(input).length > 0
          ? runLogCapabilitiesFromGatewayInput(input)
          : existing?.capabilities,
      metadata: {
        ...existing?.metadata,
        gatewayAgent: true,
        ...(appAgent?.workspaceId ? { workspaceId: appAgent.workspaceId } : {}),
      },
    }
    return { runtime, agent: spec, needsSync: true }
  }

  private persistRunLogMetadata(
    run: RunLogRunRecord,
    input: LocalGatewayStartRunInput,
    budgetEvaluations: LocalGatewayBudgetEvaluation[],
    extraMetadata: Record<string, unknown> = {},
  ): void {
    this.appState?.runs.upsert({
      runId: run.runId,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.runtimeProfile
        ? { runtimeProfile: this.runtimeProfiles.assertRegistered(input.runtimeProfile) }
        : {}),
      metadata: {
        runtime: 'runlog',
        ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
        ...(budgetEvaluations.length > 0
          ? { budgetEvaluationIds: budgetEvaluations.map((evaluation) => evaluation.budgetId) }
          : {}),
        ...extraMetadata,
      },
    })
  }

  private recordGatewayApprovalDecision(
    input: LocalGatewayApprovalResponseInput,
    status: 'approved' | 'denied',
  ): void {
    if (!this.appState) return

    const existing = this.appState.approvals.get(input.approvalId)
    const runMetadata = this.appState.runs.get(input.runId)
    this.appState.approvals.upsert({
      approvalId: input.approvalId,
      runId: input.runId,
      sessionId: input.sessionId,
      ...(existing?.workspaceId ?? runMetadata?.workspaceId
        ? { workspaceId: existing?.workspaceId ?? runMetadata?.workspaceId }
        : {}),
      ...(existing?.agentId ?? runMetadata?.agentId
        ? { agentId: existing?.agentId ?? runMetadata?.agentId }
        : {}),
      status,
      ...(existing?.targetKey ? { targetKey: existing.targetKey } : {}),
      ...(existing?.requestedAt ? { requestedAt: existing.requestedAt } : {}),
      resolvedAt: new Date().toISOString(),
      ...(existing?.metadata ? { metadata: existing.metadata } : {}),
    })
  }

  private assertCompatibilityApprovalBinding(input: LocalGatewayApprovalResponseInput): void {
    const approval = this.runtime.approvals.list().find((candidate) => (
      candidate.approvalId === input.approvalId
    ))
    if (!approval) throw new Error(`Unknown approval: ${input.approvalId}`)
    if (approval.runId !== input.runId || approval.sessionId !== input.sessionId) {
      throw new Error(`Approval ${input.approvalId} does not belong to the requested run/session.`)
    }
  }

  private assertRunLogApprovalBinding(
    runtime: RunLogMainspring,
    input: LocalGatewayApprovalResponseInput,
  ): void {
    const request = runtime.store.getApprovalRequest(input.approvalId)
    if (!request) throw new Error(`Unknown RunLog approval request: ${input.approvalId}`)
    if (request.runId !== input.runId || request.sessionId !== input.sessionId) {
      throw new Error(`RunLog approval ${input.approvalId} does not belong to the requested run/session.`)
    }
  }

  snapshot(): LocalGatewaySnapshot {
    const sessions = this.sessions.list()
    this.snapshotReadCache = this.createSnapshotReadCache()
    try {
      this.syncDerivedAppState()
      // This aggregate has already synchronized derived state. Reuse its
      // bounded reads rather than traversing every compatibility mailbox again.
      const runs = sessions.flatMap((session) => this.listRuns(session.sessionId, session))
      return {
        generatedAt: new Date().toISOString(),
        health: this.runtime.health(),
        executionBackends: this.inspectExecutionBackends(),
        appState: {
          clients: this.appState?.clients.list() ?? [],
          workspaces: this.appState?.workspaces.list() ?? [],
          agents: this.appState?.agents.list() ?? [],
          providerProfiles: this.appState?.providerProfiles.list() ?? [],
          runs: this.appState?.runs.list() ?? [],
          approvals: this.appState?.approvals.list() ?? [],
          artifacts: this.appState?.artifacts.list() ?? [],
          toolCalls: this.appState?.toolCalls.list() ?? [],
          deploymentTargets: this.appState?.deploymentTargets.list() ?? [],
          deploymentRuns: this.appState?.deploymentRuns.list() ?? [],
          cells: this.appState?.cells.list() ?? [],
          cellLeases: this.appState?.cellLeases.list() ?? [],
          cellSnapshots: this.appState?.cellSnapshots.list() ?? [],
          cronSchedules: this.appState?.cronSchedules.list() ?? [],
          budgets: this.appState?.budgets.list() ?? [],
          usageLedger: this.appState?.usageLedger.list() ?? [],
          auditEvents: this.appState?.auditEvents.list() ?? [],
        },
        sessions,
        runs,
        approvals: this.snapshotApprovals(),
        ...(this.runLogRuntime ? { runLog: this.projectRunLogSnapshot() } : {}),
        cron: this.cron.status(),
        pricingCatalog: this.pricingCatalogStatus,
        usageStatus: this.usageStatus(),
        budgetStatus: this.budgetStatus(),
        cellStatus: this.cellStatus(),
      }
    } finally {
      this.snapshotReadCache = undefined
    }
  }

  /**
   * Cheap liveness state for transport probes. Full operator state belongs to
   * `snapshot()` and must not be rebuilt merely to answer `/health`.
   */
  health(): RuntimeHealth {
    return this.runtime.health()
  }

  /**
   * A server-only change token for revalidating the sanitized console snapshot.
   * It intentionally contains no projection data, paths, or credentials.
   */
  snapshotRevision(): string {
    const sessions = this.runtime.storage.stateStore.listSessions()
    const runLog = this.runLogRuntime
    const health = this.runtime.health()
    const runLogRevision = runLog
      ? runLog.runs.list().map((run) => [
          run.runId,
          run.status,
          run.attemptCount,
          runLog.store.latestEventSeq(run.runId),
        ].join(':'))
      : []
    const revisionMaterial = JSON.stringify({
      appStateRevision: this.appState?.revision() ?? 0,
      health: {
        ok: health.ok,
        running: health.running,
        activeSessions: health.activeSessions,
      },
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        updatedAt: session.updatedAt,
      })),
      mailbox: this.mailboxRevision(sessions),
      runLog: runLogRevision,
      runLogWorkerState: this.runLogWorkerState,
    })
    return createHash('sha256').update(revisionMaterial).digest('base64url')
  }

  private mailboxRevision(sessions: MainspringSessionRecord[]): string {
    const now = Date.now()
    const cached = this.compatibilityMailboxRevision
    const compatibilityRevision =
      !cached || now - cached.checkedAtMs >= COMPATIBILITY_MAILBOX_REVISION_PROBE_MS
        ? {
            checkedAtMs: now,
            fingerprint: sessions
              .map((session) => compatibilityMailboxFingerprint(session.sessionPath))
              .join('|'),
          }
        : cached
    this.compatibilityMailboxRevision = compatibilityRevision
    return `${MainspringMailbox.changeRevision()}:${compatibilityRevision.fingerprint}`
  }

  private projectRunLogSnapshot(): LocalGatewayRunLogSnapshot {
    const runtime = this.runLogRuntime
    if (!runtime) {
      return {
        configured: false,
        worker: {
          state: 'stopped',
          queuedRuns: 0,
          outbox: {
            pending: 0,
            claimed: 0,
            retryable: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
        runs: [],
      }
    }
    const runs = runtime.runs.list().flatMap((record) => {
      try {
        return [projectLocalRunLogRun(runtime.project(record.runId))]
      } catch {
        return []
      }
    })
    return { configured: true, worker: this.runLogWorkerStatus(), runs }
  }

  private runLogWorkerStatus(): LocalGatewayRunLogWorkerStatus {
    const runtime = this.runLogRuntime
    const outbox = {
      pending: 0,
      claimed: 0,
      retryable: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    }
    if (!runtime) {
      return { state: 'stopped', queuedRuns: 0, outbox }
    }
    for (const item of runtime.store.listExecutionOutbox()) {
      outbox[item.status] += 1
    }
    return {
      state: this.runLogWorkerState,
      queuedRuns: runtime.runs.list({ status: 'queued' }).length,
      outbox,
    }
  }

  private createSnapshotReadCache(): LocalGatewaySnapshotReadCache {
    const runMetadataBySessionId = new Map<string, Map<string, LocalGatewayRunMetadataRecord>>()
    for (const record of this.appState?.runs.list() ?? []) {
      const recordsForSession = runMetadataBySessionId.get(record.sessionId) ?? new Map()
      recordsForSession.set(record.runId, record)
      runMetadataBySessionId.set(record.sessionId, recordsForSession)
    }
    return {
      eventsBySessionId: new Map(),
      rawEventsBySessionId: new Map(),
      runMetadataBySessionId,
    }
  }

  private runMetadataByRunId(sessionId: string): Map<string, LocalGatewayRunMetadataRecord> {
    const cached = this.snapshotReadCache?.runMetadataBySessionId.get(sessionId)
    if (cached) return cached
    return new Map(
      (this.appState?.runs.list({ sessionId }) ?? []).map((record) => [record.runId, record] as const),
    )
  }

  private nativeMailboxEvents(session: MainspringSessionRecord): RuntimeEventRow[] {
    const cached = this.snapshotReadCache
    if (cached?.rawEventsBySessionId.has(session.sessionId)) {
      return cached.rawEventsBySessionId.get(session.sessionId)!
    }
    const rows = MainspringMailbox.fromSessionPath(session.sessionPath).readRecentEvents({
      sessionId: session.sessionId,
      limit: 500,
    })
    cached?.rawEventsBySessionId.set(session.sessionId, rows)
    return rows
  }

  private nativeSessionEvents(
    sessionId: string,
    knownSession?: MainspringSessionRecord,
  ): RunEvent[] {
    const cached = this.snapshotReadCache
    if (cached?.eventsBySessionId.has(sessionId)) {
      return cached.eventsBySessionId.get(sessionId)!
    }
    const session = knownSession ?? this.runtime.storage.stateStore.getSession(sessionId)
    const events = cached && session
      ? this.nativeMailboxEvents(session)
        .map(normalizeRuntimeEventRow)
        .filter((event): event is RunEvent => Boolean(event))
      : this.runtime.storage.eventStore.listSessionEvents({ sessionId, limit: 500 })
    cached?.eventsBySessionId.set(sessionId, events)
    return events
  }

  private snapshotApprovals(): MainspringApprovalRecord[] {
    if (!this.appState) return this.runtime.approvals.list()
    return this.appState.approvals
      .list({ status: 'pending' })
      .map((record) => {
        const metadata = recordValue(record.metadata)
        return {
          approvalId: record.approvalId,
          runId: record.runId,
          sessionId: record.sessionId,
          status: 'pending' as const,
          requestedAt: record.requestedAt,
          ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
          ...(record.targetKey ? { targetKey: record.targetKey } : {}),
          reasons: Array.isArray(metadata?.reasons) ? metadata.reasons.map(String) : [],
          permissionCategories: Array.isArray(metadata?.permissionCategories)
            ? metadata.permissionCategories.map(String)
            : [],
        }
      })
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
  }

  private listRuns(
    sessionId: string,
    knownSession?: MainspringSessionRecord,
  ): LocalGatewayRunProjection[] {
    const session = knownSession ?? this.runtime.storage.stateStore.getSession(sessionId)
    if (!session) return []

    const byRunId = new Map<string, LocalGatewayRunProjection>()

    for (const metadata of this.runMetadataByRunId(sessionId).values()) {
      const metadataRecord = metadata.metadata && typeof metadata.metadata === 'object'
        ? metadata.metadata as Record<string, unknown>
        : {}
      if (metadataRecord.runtime === 'runlog') continue
      byRunId.set(
        metadata.runId,
        mergeRunProjection(byRunId.get(metadata.runId), {
          runId: metadata.runId,
          sessionId: metadata.sessionId,
          status: 'queued',
          createdAt: metadata.createdAt,
          eventCount: 0,
          pendingInboundCount: 0,
          ...(metadata.workspaceId ? { workspaceId: metadata.workspaceId } : {}),
          ...(metadata.agentId ? { agentId: metadata.agentId } : {}),
          ...(metadata.providerProfileId ? { providerProfileId: metadata.providerProfileId } : {}),
          ...(metadata.providerId ? { providerId: metadata.providerId } : {}),
          ...(metadata.modelId ? { modelId: metadata.modelId } : {}),
          ...(metadata.runtimeProfile
            ? { runtimeProfile: metadata.runtimeProfile as MainspringRuntimeProfile }
            : {}),
        }),
      )
    }

    for (const pending of this.pendingRunProjections(session)) {
      byRunId.set(pending.runId, mergeRunProjection(byRunId.get(pending.runId), pending))
    }

    const events = this.nativeSessionEvents(sessionId, session)
    const eventsByRunId = new Map<string, RunEvent[]>()
    for (const event of events) {
      const existing = eventsByRunId.get(event.runId) ?? []
      existing.push(event)
      eventsByRunId.set(event.runId, existing)
    }

    for (const [runId, runEvents] of eventsByRunId) {
      const firstEvent = runEvents[0]
      const lastEvent = runEvents[runEvents.length - 1]
      const incoming: LocalGatewayRunProjection = {
        runId,
        sessionId,
        status: gatewayRunStatusFromEvents(runEvents),
        createdAt: firstEvent?.timestamp,
        lastEventAt: lastEvent?.timestamp,
        eventCount: runEvents.length,
        pendingInboundCount: 0,
        ...providerInitProjectionFromEvents(runEvents),
      }
      byRunId.set(runId, mergeRunProjection(byRunId.get(runId), incoming))
    }

    return [...byRunId.values()].sort((left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? ''),
    )
  }

  private pendingRunProjections(session: MainspringSessionRecord): LocalGatewayRunProjection[] {
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    const projections: LocalGatewayRunProjection[] = []
    for (const message of mailbox.readPending(500)) {
      if (message.kind !== 'chat' || !message.dispatch.success) continue
      projections.push(projectionFromDispatch(message, message.dispatch.data))
    }
    return projections
  }

  private startRun(
    input: LocalGatewayStartRunInput,
    metadata: { providerProfileId?: string } = {},
  ): RunRecord {
    const { sessionId, allowBudgetWarning: _allowBudgetWarning, actor, ...runInput } = input
    const session = this.runtime.storage.stateStore.getSession(sessionId)
    if (!session) throw new Error(`Unknown session: ${sessionId}`)
    const runtimeProfile = this.runtimeProfiles.assertRegistered(input.runtimeProfile)
    const budgetEvaluations = this.assertRunBudgetAllowed(input, session)
    const budgetPolicy = runtimeBudgetPolicyFromEvaluations(budgetEvaluations)
    const cellLeasePlan = this.hyperCells?.planRunLease({
      session,
      computerId: input.computerId,
      workspaceId: input.workspaceId,
    })
    const runControl = this.runControl()
    const authorization = runControl?.authorizeEnqueue({
      sessionId,
      actor,
      workspaceId: input.workspaceId,
      binding: gatewayRunBinding(input, {
        budgetIds: budgetEvaluations.map((evaluation) => evaluation.budgetId),
        ...(cellLeasePlan ? { cellLeasePlan } : {}),
      }),
    })
    try {
      const run = this.runtime.storage.commandStore.enqueueRun(session, {
        ...runInput,
        ...(runtimeProfile ? { runtimeProfile } : {}),
        ...(budgetPolicy ? { budget: budgetPolicy } : {}),
      })
      const cellLease =
        this.hyperCells && cellLeasePlan
          ? this.hyperCells.acquirePlannedRunLease({
              session,
              run,
              sessionId: input.sessionId,
              computerId: input.computerId,
              workspaceId: input.workspaceId,
              plan: cellLeasePlan,
            })
          : undefined
      this.persistRunMetadata(
        run,
        input,
        {
          ...metadata,
          ...(authorization ? { gatewayRunDecisionId: authorization.decision.decisionId } : {}),
        },
        cellLease,
      )
      if (authorization) {
        runControl?.recordEnqueueOutcome({
          authorization,
          runId: run.runId,
          runtime: 'compatibility',
          ...(cellLease
            ? {
                execution: {
                  cellId: cellLease.plan.cellId,
                  cellLeaseId: cellLease.leaseId,
                  backend: cellLease.plan.backend.key,
                  backendUnsafe: cellLease.plan.backend.unsafe,
                },
              }
            : {}),
        })
      }
      const warningBudgets = budgetEvaluations.filter((evaluation) => evaluation.status === 'warn')
      if (warningBudgets.length > 0) {
        this.appState?.auditEvents.create({
          category: 'billing',
          action: 'budget.warn',
          actor: authorization?.actor ?? (actor?.trim() || 'local-gateway'),
          targetType: 'run',
          targetId: run.runId,
          runId: run.runId,
          sessionId: input.sessionId,
          metadata: {
            budgetIds: warningBudgets.map((evaluation) => evaluation.budgetId),
          },
        })
      }
      return run
    } catch (error) {
      if (authorization) runControl?.recordEnqueueFailure({ authorization })
      throw error
    }
  }

  private cancelCompatibilityRun(
    sessionId: string,
    runId: string,
    reason?: string,
    actor?: string,
  ): void {
    this.assertCompatibilityRunBinding(sessionId, runId)
    const runControl = this.runControl()
    const authorization = runControl?.authorizeCancel({
      runId,
      sessionId,
      actor,
      binding: { reason },
    })
    try {
      this.runtime.storage.commandStore.cancelRun(sessionId, runId, reason)
      if (authorization) runControl?.recordCancelOutcome({ authorization, runtime: 'compatibility' })
    } catch (error) {
      if (authorization) runControl?.recordCancelFailure({ authorization })
      throw error
    }
  }

  private assertCompatibilityRunBinding(sessionId: string, runId: string): void {
    const session = this.runtime.storage.stateStore.getSession(sessionId)
    if (!session) throw new Error(`Unknown session: ${sessionId}`)
    const metadata = this.appState?.runs.get(runId)
    if (metadata) {
      if (metadata.sessionId !== sessionId) {
        throw new Error(`Run ${runId} does not belong to the requested session.`)
      }
      return
    }
    const projection = this.listRuns(sessionId, session).find((candidate) => candidate.runId === runId)
    if (!projection) throw new Error(`Unknown run: ${runId}`)
  }

  private persistRunMetadata(
    run: RunRecord,
    input: LocalGatewayStartRunInput,
    metadata: { providerProfileId?: string; gatewayRunDecisionId?: string },
    cellLease?: AcquiredHyperCellRunLease,
  ): void {
    const runMetadata = {
      ...(metadata.gatewayRunDecisionId ? { gatewayRunDecisionId: metadata.gatewayRunDecisionId } : {}),
      ...(cellLease
        ? {
            cellId: cellLease.plan.cellId,
            cellLeaseId: cellLease.leaseId,
            requestedComputerId: cellLease.plan.requestedComputerId,
            executionBackend: cellLease.plan.backend.key,
            executionBackendUnsafe: cellLease.plan.backend.unsafe,
          }
        : {}),
    }
    this.appState?.runs.upsert({
      runId: run.runId,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(metadata.providerProfileId ? { providerProfileId: metadata.providerProfileId } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.runtimeProfile
        ? { runtimeProfile: this.runtimeProfiles.assertRegistered(input.runtimeProfile) }
        : {}),
      ...(Object.keys(runMetadata).length > 0 ? { metadata: runMetadata } : {}),
    })
  }

  private syncApprovalMetadata(): void {
    if (!this.appState) return

    for (const session of this.runtime.storage.stateStore.listSessions()) {
      const runMetadataByRunId = this.runMetadataByRunId(session.sessionId)
      const events = this.nativeSessionEvents(session.sessionId, session)

      for (const event of events) {
        const approvalId = approvalIdFromEvent(event)
        if (!approvalId) continue

        const runMetadata = runMetadataByRunId.get(event.runId)
        const existing = this.appState.approvals.get(approvalId)
        const payload = event.payload as Record<string, unknown>
        const targetKey =
          typeof payload.targetKey === 'string'
            ? payload.targetKey
            : existing?.targetKey
        const status =
          event.type === 'approval.requested'
            ? existing && existing.status !== 'pending'
              ? existing.status
              : 'pending'
            : event.type === 'approval.approved'
              ? 'approved'
              : 'denied'
        const resolvedAt =
          event.type === 'approval.approved' || event.type === 'approval.denied'
            ? event.timestamp
            : existing && existing.status !== 'pending'
              ? existing.resolvedAt
              : undefined

        this.appState.approvals.upsert({
          approvalId,
          runId: event.runId,
          sessionId: event.sessionId,
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          ...(runMetadata?.agentId ? { agentId: runMetadata.agentId } : {}),
          status,
          ...(targetKey ? { targetKey } : {}),
          requestedAt: existing?.requestedAt ?? event.timestamp,
          ...(resolvedAt ? { resolvedAt } : {}),
          metadata: {
            ...(Array.isArray(payload.reasons)
              ? { reasons: payload.reasons.map(String) }
              : existing?.metadata && typeof existing.metadata === 'object'
                ? existing.metadata
                : {}),
            ...(Array.isArray(payload.permissionCategories)
              ? { permissionCategories: payload.permissionCategories.map(String) }
              : {}),
          },
        })
      }
    }
  }

  private syncUsageLedger(): void {
    if (!this.appState) return

    for (const session of this.runtime.storage.stateStore.listSessions()) {
      const runMetadataByRunId = this.runMetadataByRunId(session.sessionId)
      const sessionEvents = this.nativeSessionEvents(session.sessionId, session)
      const usageEvents = sessionEvents.filter(
        (event): event is RunEvent<UsageUpdatedRunEventPayload> => event.type === 'usage.updated',
      )

      for (const event of usageEvents) {
        const entryId = usageEntryIdForEvent(event)
        if (this.appState.usageLedger.get(entryId)) continue

        const budgetStatusBefore = new Map(
          this.evaluateBudgets(this.appState).map((evaluation) => [evaluation.budgetId, evaluation] as const),
        )
        const runMetadata = runMetadataByRunId.get(event.runId)
        const providerInitDetail = latestProviderInitDetailFromRunEvents(
          sessionEvents.filter((candidate) => candidate.runId === event.runId),
        )
        const payload: UsageUpdatedRunEventPayload = {
          ...providerInitDetail,
          ...event.payload,
          provider: event.payload.provider ?? providerInitDetail?.provider,
          modelId: event.payload.modelId ?? providerInitDetail?.modelId,
          modelFamily: event.payload.modelFamily ?? providerInitDetail?.modelFamily,
          providerTransport:
            event.payload.providerTransport ?? providerInitDetail?.providerTransport,
          providerSessionId:
            event.payload.providerSessionId ?? providerInitDetail?.providerSessionId,
        }
        const costEstimate = estimateUsageCost({ usage: payload, catalog: this.pricingCatalog })

        this.appState.usageLedger.create({
          entryId,
          runId: event.runId,
          sessionId: event.sessionId,
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          ...(payload.provider ?? runMetadata?.providerId
            ? { providerId: payload.provider ?? runMetadata?.providerId }
            : {}),
          ...(payload.modelId ?? runMetadata?.modelId
            ? { modelId: payload.modelId ?? runMetadata?.modelId }
            : {}),
          ...(typeof payload.inputTokens === 'number'
            ? { inputTokens: payload.inputTokens }
            : {}),
          ...(typeof payload.outputTokens === 'number'
            ? { outputTokens: payload.outputTokens }
            : {}),
          ...(typeof payload.totalTokens === 'number'
            ? { totalTokens: payload.totalTokens }
            : {}),
          ...(typeof costEstimate.estimatedCostUsd === 'number'
            ? { estimatedCostUsd: costEstimate.estimatedCostUsd }
            : {}),
          metadata: {
            sourceEventId: event.eventId,
            sourceSeq: event.seq,
            pricingStatus: costEstimate.pricingStatus,
            ...(costEstimate.pricing
              ? { pricingModelId: costEstimate.pricing.modelId }
              : {}),
            ...(payload.modelFamily ? { modelFamily: payload.modelFamily } : {}),
            ...(payload.providerTransport
              ? { providerTransport: payload.providerTransport }
              : {}),
            ...(payload.providerSessionId
              ? { providerSessionId: payload.providerSessionId }
              : {}),
            ...(typeof payload.cacheReadTokens === 'number'
              ? { cacheReadTokens: payload.cacheReadTokens }
              : {}),
            ...(typeof payload.cacheWriteTokens === 'number'
              ? { cacheWriteTokens: payload.cacheWriteTokens }
              : {}),
            ...(typeof payload.reasoningTokens === 'number'
              ? { reasoningTokens: payload.reasoningTokens }
              : {}),
            ...(payload.rateLimit ? { rateLimit: payload.rateLimit } : {}),
          },
        })
        this.recordBudgetTransitions({
          appState: this.appState,
          runId: event.runId,
          sessionId: event.sessionId,
          entryId,
          previousStatuses: budgetStatusBefore,
        })
      }
    }

    this.syncRunLogUsageLedger()
  }

  private syncRunLogUsageLedger(): void {
    const runtime = this.runLogRuntime
    if (!runtime || !this.appState) return

    for (const run of runtime.runs.list()) {
      const runMetadata = this.appState.runs.get(run.runId)
      const providerInit = runtime.store
        .listEvents({ runId: run.runId, types: ['provider.init'], limit: 500 })
        .at(-1)
      const providerInitPayload = recordValue(providerInit?.payload)
      const usageEvents = runtime.store.listEvents({
        runId: run.runId,
        types: ['usage.reported'],
        limit: 10_000,
      })

      for (const event of usageEvents) {
        const entryId = usageEntryIdForRunLogEvent(event)
        if (this.appState.usageLedger.get(entryId)) continue
        const usage = providerUsageFromRunLogEvent(event)
        if (!usage) continue

        const budgetStatusBefore = new Map(
          this.evaluateBudgets(this.appState).map((evaluation) => [evaluation.budgetId, evaluation] as const),
        )
        const providerSessionId = textValue(recordValue(event.payload)?.providerSessionId)
        const providerId = usage.provider ?? textValue(providerInitPayload?.provider) ?? runMetadata?.providerId ?? run.providerId
        const modelId = usage.modelId ?? textValue(providerInitPayload?.modelId) ?? runMetadata?.modelId ?? run.modelId
        const costEstimate = estimateUsageCost({ usage, catalog: this.pricingCatalog })

        this.appState.usageLedger.create({
          entryId,
          runId: run.runId,
          sessionId: run.sessionId,
          ...(runMetadata?.workspaceId ?? run.workspaceId
            ? { workspaceId: runMetadata?.workspaceId ?? run.workspaceId }
            : {}),
          ...(providerId ? { providerId } : {}),
          ...(modelId ? { modelId } : {}),
          ...(typeof usage.inputTokens === 'number' ? { inputTokens: usage.inputTokens } : {}),
          ...(typeof usage.outputTokens === 'number' ? { outputTokens: usage.outputTokens } : {}),
          ...(typeof usage.totalTokens === 'number' ? { totalTokens: usage.totalTokens } : {}),
          ...(typeof costEstimate.estimatedCostUsd === 'number'
            ? { estimatedCostUsd: costEstimate.estimatedCostUsd }
            : {}),
          metadata: {
            runtime: 'runlog',
            sourceEventId: event.eventId,
            sourceSeq: event.seq,
            pricingStatus: costEstimate.pricingStatus,
            ...(costEstimate.pricing ? { pricingModelId: costEstimate.pricing.modelId } : {}),
            ...(usage.modelFamily ? { modelFamily: usage.modelFamily } : {}),
            ...(usage.providerTransport ? { providerTransport: usage.providerTransport } : {}),
            ...(providerSessionId ? { providerSessionId } : {}),
            ...(typeof usage.cacheReadTokens === 'number'
              ? { cacheReadTokens: usage.cacheReadTokens }
              : {}),
            ...(typeof usage.cacheWriteTokens === 'number'
              ? { cacheWriteTokens: usage.cacheWriteTokens }
              : {}),
            ...(typeof usage.reasoningTokens === 'number'
              ? { reasoningTokens: usage.reasoningTokens }
              : {}),
            ...(usage.rateLimit ? { rateLimit: usage.rateLimit } : {}),
          },
        })
        this.recordBudgetTransitions({
          appState: this.appState,
          runId: run.runId,
          sessionId: run.sessionId,
          entryId,
          previousStatuses: budgetStatusBefore,
        })
      }
    }
  }

  private syncToolCalls(): void {
    if (!this.appState) return

    for (const session of this.runtime.storage.stateStore.listSessions()) {
      const runMetadataByRunId = this.runMetadataByRunId(session.sessionId)
      const events = this.nativeSessionEvents(session.sessionId, session)

      for (const event of events) {
        let status: LocalGatewayToolCallRecord['status'] | null = null
        if (event.type === 'tool.call.requested') status = 'requested'
        if (event.type === 'tool.call.updated') status = 'updated'
        if (event.type === 'tool.call.completed') status = 'completed'
        if (event.type === 'tool.call.failed') status = 'failed'
        if (event.type === 'tool.call.blocked') status = 'blocked'
        if (!status) continue

        const payload = recordValue(event.payload)
        const toolCallId = textValue(payload?.toolCallId)
        if (!toolCallId) continue
        const existingToolCall = this.appState.toolCalls.get(toolCallId)
        const toolName = textValue(payload?.name) ?? existingToolCall?.toolName ?? toolCallId

        const runMetadata = runMetadataByRunId.get(event.runId)
        const outputRecord =
          event.type === 'tool.call.completed' || event.type === 'tool.call.failed'
            ? recordValue(payload?.output)
            : event.type === 'tool.call.blocked'
              ? recordValue(payload?.output)
              : null
        const outputRef =
          textValue(outputRecord?.artifactId)
          ?? textValue(outputRecord?.artifact)
          ?? textValue(outputRecord?.url)

        this.appState.toolCalls.upsert({
          toolCallId,
          runId: event.runId,
          sessionId: event.sessionId,
          toolName,
          status,
          ...(runMetadata?.agentId ? { agentId: runMetadata.agentId } : {}),
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          ...(outputRef ? { outputRef } : {}),
          metadata: {
            sourceEventId: event.eventId,
            sourceSeq: event.seq,
            ...(event.type === 'tool.call.blocked' && typeof payload?.status === 'string'
              ? { blockedStatus: payload.status }
              : {}),
          },
        })
        this.syncExecutionCellProjection({
          event,
          runMetadata,
          toolCallId,
          toolName,
          outputRecord,
        })
      }
    }
  }

  private syncExecutionCellProjection(input: {
    event: RunEvent
    runMetadata: LocalGatewayRunMetadataRecord | undefined
    toolCallId: string
    toolName: string
    outputRecord: Record<string, unknown> | null
  }): void {
    if (!this.appState || !input.runMetadata?.workspaceId || !input.outputRecord) return

    const backendKey = textValue(input.outputRecord.backend)
    const backendLabel = textValue(input.outputRecord.backendLabel)
    if (!backendKey || !backendLabel) return

    const workspaceId = input.runMetadata.workspaceId
    const executionCellRecord = recordValue(input.outputRecord.executionCell)
    const executionLeaseRecord = recordValue(input.outputRecord.executionLease)
    const cellId = executionCellId(workspaceId, backendKey)
    const backendSessionId = textValue(input.outputRecord.sessionId)
    const executionStatus = textValue(input.outputRecord.status) ?? 'observed'
    const backendUnsafe = input.outputRecord.backendUnsafe === true
    const backendCapabilities =
      backendCapabilityMetadata(input.outputRecord.backendCapabilities)
      ?? backendCapabilityMetadata(executionCellRecord?.backendCapabilities)
    const leaseId =
      textValue(executionLeaseRecord?.leaseId)
      ?? executionLeaseId(input.toolCallId, backendSessionId)
    const existingCell = this.appState.cells.get(cellId)

    if (existingCell) {
      this.appState.cells.update({
        cellId,
        workspaceId,
        label: backendLabel,
        status: 'active',
        metadata: {
          source: 'execution-backend',
          backend: backendKey,
          backendLabel,
          backendUnsafe,
          ...(backendCapabilities ? { backendCapabilities } : {}),
          ...(textValue(executionCellRecord?.cellKey)
            ? { runtimeCellKey: textValue(executionCellRecord?.cellKey) }
            : {}),
          latestToolCallId: input.toolCallId,
          latestExecutionStatus: executionStatus,
        },
      })
    } else {
      this.appState.cells.create({
        cellId,
        workspaceId,
        label: backendLabel,
        metadata: {
          source: 'execution-backend',
          backend: backendKey,
          backendLabel,
          backendUnsafe,
          ...(backendCapabilities ? { backendCapabilities } : {}),
          ...(textValue(executionCellRecord?.cellKey)
            ? { runtimeCellKey: textValue(executionCellRecord?.cellKey) }
            : {}),
          latestToolCallId: input.toolCallId,
          latestExecutionStatus: executionStatus,
        },
      })
    }

    this.appState.cellLeases.upsert({
      leaseId,
      cellId,
      runId: input.event.runId,
      sessionId: input.event.sessionId,
      status: executionStatus === 'running' ? 'active' : 'released',
      metadata: {
        source: 'execution-backend',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        backend: backendKey,
        backendLabel,
        backendUnsafe,
        ...(backendCapabilities ? { backendCapabilities } : {}),
        ...(textValue(executionLeaseRecord?.cellKey)
          ? { runtimeCellKey: textValue(executionLeaseRecord?.cellKey) }
          : {}),
        ...(textValue(executionLeaseRecord?.status)
          ? { runtimeLeaseStatus: textValue(executionLeaseRecord?.status) }
          : {}),
        ...(textValue(executionLeaseRecord?.acquiredAt)
          ? { runtimeLeaseAcquiredAt: textValue(executionLeaseRecord?.acquiredAt) }
          : {}),
        ...(textValue(executionLeaseRecord?.releasedAt)
          ? { runtimeLeaseReleasedAt: textValue(executionLeaseRecord?.releasedAt) }
          : {}),
        sourceEventId: input.event.eventId,
        sourceSeq: input.event.seq,
      },
    })

    const snapshotId = `cell_snapshot_${input.event.eventId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    if (!this.appState.cellSnapshots.get(snapshotId)) {
      this.appState.cellSnapshots.create({
        snapshotId,
        cellId,
        leaseId,
        label: `${backendLabel} ${executionStatus}`,
        metadata: {
          source: 'execution-backend',
          toolCallId: input.toolCallId,
          toolName: input.toolName,
          backend: backendKey,
          backendLabel,
          backendUnsafe,
          ...(backendCapabilities ? { backendCapabilities } : {}),
          ...(textValue(executionCellRecord?.cellKey)
            ? { runtimeCellKey: textValue(executionCellRecord?.cellKey) }
            : {}),
          ...(textValue(executionLeaseRecord?.leaseId)
            ? { runtimeLeaseId: textValue(executionLeaseRecord?.leaseId) }
            : {}),
          executionStatus,
        },
      })
    }
  }

  private syncArtifacts(): void {
    if (!this.appState) return

    for (const session of this.runtime.storage.stateStore.listSessions()) {
      const runMetadataByRunId = this.runMetadataByRunId(session.sessionId)
      const rows = this.nativeMailboxEvents(session)

      for (const row of rows) {
        const event = row.event
        if (event.type === 'artifact.created') {
          const artifactId = textValue(event.artifactId)
          if (!artifactId || this.appState.artifacts.get(artifactId)) continue
          const artifactPath = artifactPathFromId(this.runtime.storage.artifactStore.rootPath, artifactId)
          if (!artifactPath) continue
          const runMetadata = runMetadataByRunId.get(event.runId)
          this.appState.artifacts.create({
            artifactId,
            runId: event.runId,
            sessionId: row.sessionId,
            ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
            kind: event.kind,
            path: artifactPath,
            metadata: {
              sourceEventId: `native:${row.seq}`,
              sourceSeq: row.seq,
              sourceType: event.type,
            },
          })
          continue
        }

        if (event.type !== 'tool.result' || event.status !== 'completed') continue
        const output = recordValue(event.output)
        const artifactId = textValue(output?.artifactId) ?? textValue(output?.artifact)
        if (!artifactId || this.appState.artifacts.get(artifactId)) continue
        const artifactPath = artifactPathFromId(this.runtime.storage.artifactStore.rootPath, artifactId)
        if (!artifactPath) continue

        const runMetadata = runMetadataByRunId.get(event.runId)
        const toolName = textValue(event.name) ?? 'runtime-artifact'
        const artifactLabel = textValue(output?.artifactLabel)
        const outputUrl = textValue(output?.url)
        const kind = toolName === 'browser.screenshot' ? 'image' : 'file'
        const mediaType =
          toolName === 'browser.screenshot'
            ? 'image/png'
            : textValue(output?.mediaType)

        this.appState.artifacts.create({
          artifactId,
          runId: event.runId,
          sessionId: row.sessionId,
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          kind,
          ...(artifactLabel ? { label: artifactLabel } : {}),
          path: artifactPath,
          ...(mediaType ? { mediaType } : {}),
          metadata: {
            sourceEventId: `native:${row.seq}`,
            sourceSeq: row.seq,
            sourceType: event.type,
            toolName,
            ...(outputUrl ? { url: outputUrl } : {}),
          },
        })
      }
    }
  }

  private syncRunCellLeases(): void {
    this.hyperCells?.releaseTerminalRunLeases({
      loadRunEvents: (lease) =>
        lease.runId && lease.sessionId
          ? this.runtime.storage.eventStore.listRunEvents({
              sessionId: lease.sessionId,
              runId: lease.runId,
              limit: 500,
            })
          : [],
      statusFromEvents: gatewayRunStatusFromEvents,
    })
  }

  private syncDerivedAppState(): void {
    if (!this.appState) return
    this.syncApprovalMetadata()
    this.syncToolCalls()
    this.syncUsageLedger()
    this.syncArtifacts()
    this.syncRunCellLeases()
  }

  private startCronScheduler(): void {
    if (this.cronTimer || !this.appState) return
    this.cronTimer = setInterval(() => {
      void this.runCronTick()
    }, this.cronPollIntervalMs)
    this.cronTimer.unref?.()
  }

  private async runCronTick(): Promise<void> {
    if (!this.appState) return
    if (this.cronTickInFlight) {
      await this.cronTickInFlight
      return
    }

    this.cronTickInFlight = (async () => {
      const now = this.now()
      const nowIso = now.toISOString()
      try {
        for (const schedule of this.appState!.cronSchedules.list({ enabled: true })) {
          if (!schedule.nextRunAt || schedule.nextRunAt > nowIso) continue
          this.runCronScheduleNow(schedule.scheduleId, 'scheduler', now)
        }
        this.cronLastTickAt = nowIso
        this.cronLastError = undefined
      } catch (error) {
        this.cronLastTickAt = nowIso
        this.cronLastError = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        this.cronTickInFlight = null
      }
    })()

    await this.cronTickInFlight
  }

  private requireAppState(): LocalGatewayAppStateStore {
    if (!this.appState) {
      throw new Error('Local gateway app state is not configured.')
    }
    return this.appState
  }

  private budgetStatus(): LocalGatewayBudgetStatus {
    const appState = this.appState
    if (!appState) {
      return {
        evaluations: [],
        blocked: 0,
        warnings: 0,
        usageStatus: emptyUsageStatus(),
      }
    }
    const evaluations = this.evaluateBudgets(appState)
    return {
      evaluations,
      blocked: evaluations.filter((evaluation) => evaluation.status === 'blocked').length,
      warnings: evaluations.filter((evaluation) => evaluation.status === 'warn').length,
      usageStatus: this.usageStatus(),
    }
  }

  private usageStatus(): LocalGatewayUsageStatus {
    const appState = this.appState
    if (!appState) return emptyUsageStatus()
    const context = this.usageContext(appState)
    const totalSummary = summarizeUsageLedger(context.usageEntries)
    return {
      total: {
        scopeType: 'total',
        scopeId: 'total',
        scopeLabel: 'All usage',
        summary: totalSummary,
      },
      clients: [...context.clientsById.values()].map((client) => ({
        scopeType: 'client',
        scopeId: client.clientId,
        scopeLabel: client.name,
        summary: summarizeUsageLedger(
          context.usageEntries.filter((entry) => {
            const workspaceId = this.usageEntryWorkspaceId(entry, context)
            return workspaceId ? context.workspacesById.get(workspaceId)?.clientId === client.clientId : false
          }),
        ),
      })),
      workspaces: [...context.workspacesById.values()].map((workspace) => ({
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        scopeLabel: workspace.name,
        summary: summarizeUsageLedger(
          context.usageEntries.filter((entry) => this.usageEntryWorkspaceId(entry, context) === workspace.workspaceId),
        ),
      })),
      agents: [...context.agentsById.values()].map((agent) => ({
        scopeType: 'agent',
        scopeId: agent.agentId,
        scopeLabel: agent.name,
        summary: summarizeUsageLedger(
          context.usageEntries.filter((entry) => context.runsById.get(entry.runId)?.agentId === agent.agentId),
        ),
      })),
      unpricedEntries: totalSummary.unpricedEntries,
      pricedEntries: totalSummary.pricedEntries,
      estimatedCostUsd: totalSummary.estimatedCostUsd,
    }
  }

  readonly cells = {
    status: (): LocalGatewayCellStatus => this.cellStatus(),
  }

  private cellStatus(): LocalGatewayCellStatus {
    return this.hyperCells?.status() ?? {
      enabled: false,
      leaseTtlMs: 0,
      capacityEnforced: false,
      cells: 0,
      leases: {
        active: 0,
        released: 0,
        expired: 0,
        total: 0,
      },
      cellStatuses: [],
    }
  }

  private createClientWorkspace(
    input: CreateLocalGatewayClientWorkspaceInput,
  ): CreateLocalGatewayClientWorkspaceResult {
    return this.topologyControl().createClientWorkspace(input)
  }

  private createWorkspaceSession(
    input: CreateLocalGatewayWorkspaceSessionInput,
  ): CreateLocalGatewayWorkspaceSessionResult {
    return this.topologyControl().createWorkspaceSession(input)
  }

  private deleteWorkspace(workspaceId: string, actor?: string): DeleteLocalGatewayWorkspaceResult {
    return this.topologyControl().deleteWorkspace(workspaceId, actor)
  }

  private deleteClient(clientId: string, actor?: string): DeleteLocalGatewayClientResult {
    return this.topologyControl().deleteClient(clientId, actor)
  }

  private updateClientWorkspace(
    input: UpdateLocalGatewayClientWorkspaceInput,
  ): UpdateLocalGatewayClientWorkspaceResult {
    return this.topologyControl().updateClientWorkspace(input)
  }

  private createAgentDraft(input: CreateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord {
    return this.topologyControl().createAgentDraft(input)
  }

  private updateAgentDraft(input: UpdateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord {
    return this.topologyControl().updateAgentDraft(input)
  }

  private resolveAppStateRunInput(input: LocalGatewayAppStateRunInput): LocalGatewayStartRunInput {
    const appState = this.requireAppState()
    const session = this.runtime.storage.stateStore.getSession(input.sessionId)
    if (!session) throw new Error(`Unknown session: ${input.sessionId}`)

    const sessionMetadata = recordValue(session.metadata) ?? {}
    const sessionWorkspaceId = textValue(sessionMetadata.workspaceId)
    const sessionWorkspace = this.resolveGatewayWorkspace(appState, sessionWorkspaceId)
    const workspace = this.resolveGatewayWorkspace(appState, input.workspaceId)
    const agent = this.resolveGatewayAgent(appState, input.agentId)
    const providerProfile = this.resolveGatewayProviderProfile(appState, input.providerProfileId)

    this.assertGatewayWorkspaceRunnable(appState, sessionWorkspace)
    this.assertGatewayWorkspaceRunnable(appState, workspace)
    this.assertGatewayAgentRunnable(agent)
    this.assertGatewayProviderProfileRunnable(providerProfile)

    if (
      workspace &&
      agent?.workspaceId &&
      workspace.workspaceId !== agent.workspaceId
    ) {
      throw new Error(
        `Agent ${agent.agentId} belongs to workspace ${agent.workspaceId}, not ${workspace.workspaceId}.`,
      )
    }

    if (
      sessionWorkspace &&
      workspace &&
      sessionWorkspace.workspaceId !== workspace.workspaceId
    ) {
      throw new Error(
        `Session ${session.sessionId} belongs to workspace ${sessionWorkspace.workspaceId}, not ${workspace.workspaceId}.`,
      )
    }

    if (
      sessionWorkspace &&
      agent?.workspaceId &&
      sessionWorkspace.workspaceId !== agent.workspaceId
    ) {
      throw new Error(
        `Session ${session.sessionId} belongs to workspace ${sessionWorkspace.workspaceId}, not agent ${agent.agentId}'s workspace ${agent.workspaceId}.`,
      )
    }

    if (agent?.workspaceId && !workspace && !appState.workspaces.get(agent.workspaceId)) {
      throw new Error(`Agent ${agent.agentId} references unknown workspace ${agent.workspaceId}.`)
    }

    if (
      providerProfile &&
      input.providerId &&
      providerProfile.providerId !== input.providerId
    ) {
      throw new Error(
        `Provider profile ${providerProfile.profileId} belongs to provider ${providerProfile.providerId}, not ${input.providerId}.`,
      )
    }

    const { providerProfileId: _providerProfileId, ...runInput } = input
    const workspaceId =
      workspace?.workspaceId ?? sessionWorkspace?.workspaceId ?? agent?.workspaceId ?? runInput.workspaceId
    const agentId = agent?.agentId ?? runInput.agentId
    const providerId = runInput.providerId ?? providerProfile?.providerId
    const modelId =
      runInput.modelId ?? providerProfile?.defaultModelId ?? agent?.defaultModelId

    return {
      ...runInput,
      ...(workspaceId ? { workspaceId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(providerId ? { providerId } : {}),
      ...(providerProfile?.secretRef ? { credentialRef: providerProfile.secretRef } : {}),
      ...(modelId ? { modelId } : {}),
    }
  }

  private assertGatewayWorkspaceRunnable(
    appState: LocalGatewayAppStateStore,
    workspace: LocalGatewayWorkspaceRecord | null,
  ): void {
    if (!workspace) return
    if (workspace.status !== 'active') {
      throw new Error(`Gateway workspace ${workspace.workspaceId} is archived and cannot run agents.`)
    }
    if (!workspace.clientId) return
    const client = appState.clients.get(workspace.clientId)
    if (!client) {
      throw new Error(
        `Gateway workspace ${workspace.workspaceId} references unknown client ${workspace.clientId}.`,
      )
    }
    if (client.status !== 'active') {
      throw new Error(
        `Gateway workspace ${workspace.workspaceId} belongs to archived client ${client.clientId}.`,
      )
    }
  }

  private assertGatewayAgentRunnable(agent: LocalGatewayAgentRecord | null): void {
    if (agent?.status === 'archived') {
      throw new Error(`Gateway agent ${agent.agentId} is archived and cannot run.`)
    }
  }

  private assertGatewayProviderProfileRunnable(
    providerProfile: LocalGatewayProviderProfileRecord | null,
  ): void {
    if (providerProfile?.status === 'archived') {
      throw new Error(`Gateway provider profile ${providerProfile.profileId} is archived and cannot run.`)
    }
  }

  private validateBudgetScope(
    appState: LocalGatewayAppStateStore,
    scopeType: LocalGatewayBudgetScope,
    scopeId: string,
  ): void {
    if (scopeType === 'client' && !appState.clients.get(scopeId)) {
      throw new Error(`Unknown gateway client: ${scopeId}`)
    }
    if (scopeType === 'workspace' && !appState.workspaces.get(scopeId)) {
      throw new Error(`Unknown gateway workspace: ${scopeId}`)
    }
    if (scopeType === 'agent' && !appState.agents.get(scopeId)) {
      throw new Error(`Unknown gateway agent: ${scopeId}`)
    }
  }

  private topologyControl(): GatewayTopologyControl {
    return new GatewayTopologyControl({
      appState: this.requireAppState(),
      resolveWorkspaceRoot: (value, label) => this.resolveGatewayWorkspaceRoot(value, label),
      createSession: ({ sessionId, workspaceRoot, metadata }) =>
        projectSession(
          this.runtime.sessions.create({
            sessionId,
            workspace: { root: workspaceRoot },
            metadata,
          }).record,
        ),
      listRuntimeSessions: () => this.runtime.storage.stateStore.listSessions(),
    })
  }

  private marketplaceControl(): GatewayMarketplaceControl {
    return new GatewayMarketplaceControl({
      appState: this.requireAppState(),
      repoRoot: this.marketplaceRepoRoot,
      workspaceBaseRoot: this.workspaceBaseRoot,
      remoteMarketplace: this.remoteMarketplace,
      topology: this.topologyControl(),
      resolveWorkspaceRoot: (value, label) => this.resolveGatewayWorkspaceRoot(value, label),
      resolveRuntimeProfile: (profileId) => this.runtimeProfiles.assertRegistered(profileId),
    })
  }

  private deploymentControl(): GatewayDeploymentControl {
    return new GatewayDeploymentControl({
      appState: this.requireAppState(),
      repoRoot: this.deploymentRepoRoot,
      drivers: this.deploymentDrivers,
      ...(this.deploymentCommandRunner ? { commandRunner: this.deploymentCommandRunner } : {}),
    })
  }

  private cronControl(): GatewayCronControl {
    return new GatewayCronControl({
      appState: this.requireAppState(),
      now: this.now,
      grantIntervalMs: gatewayCronPolicyIntervalMs,
      validateSchedule: (input) => this.validateCronScheduleInput(this.requireAppState(), input),
      computeNextRunAt: (input) => this.computeNextRunAt(input),
      prepareGrant: (schedule, now) => {
        const context = this.buildRunLogCronContext(schedule, now)
        return {
          agentId: context.agentId,
          ...(context.resolvedInput.workspaceId ? { workspaceId: context.resolvedInput.workspaceId } : {}),
          allowedTools: [...(context.resolvedInput.allowedTools ?? [])],
          scheduleKey: context.scheduleKey,
          metadata: context.metadata,
        }
      },
      previewGrant: (schedule, now) => {
        const context = this.buildRunLogCronContext(schedule, now)
        const decision = decideRunLogCron({
          job: context.job,
          agent: context.agent,
          now,
        })
        return this.cronGrantPreviewFromDecision({ schedule, context, decision })
      },
    })
  }

  private budgetControl(): GatewayBudgetControl {
    return new GatewayBudgetControl({
      appState: this.requireAppState(),
      validateScope: (scopeType, scopeId) =>
        this.validateBudgetScope(this.requireAppState(), scopeType, scopeId),
    })
  }

  private providerProfileControl(): GatewayProviderProfileControl {
    return new GatewayProviderProfileControl({ appState: this.requireAppState() })
  }

  private provenanceReviewControl(): GatewayProvenanceReviewControl {
    return new GatewayProvenanceReviewControl({ appState: this.requireAppState() })
  }

  private runControl(): GatewayRunControl | undefined {
    return this.appState ? new GatewayRunControl(this.appState) : undefined
  }

  private requireWorkspace(workspaceId: string): LocalGatewayWorkspaceRecord {
    const workspace = this.requireAppState().workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    return workspace
  }

  private installMarketplaceTemplate(
    input: InstallLocalMarketplaceTemplateInput,
  ): InstallLocalMarketplaceTemplateResult {
    return this.marketplaceControl().install(input)
  }

  private resolveGatewayWorkspaceRoot(value: string, label: string): string {
    const trimmed = value.trim()
    if (!trimmed) throw new Error(`${label} must be a non-empty string.`)
    const base = fs.existsSync(this.workspaceBaseRoot)
      ? fs.realpathSync.native(this.workspaceBaseRoot)
      : this.workspaceBaseRoot
    const resolved = path.resolve(path.isAbsolute(trimmed) ? trimmed : path.join(base, trimmed))
    const existing = nearestExistingPath(resolved)
    const canonicalResolved = existing
      ? path.join(fs.realpathSync.native(existing), path.relative(existing, resolved))
      : resolved
    assertPathContained(base, canonicalResolved, `${label} must stay inside the gateway workspace base.`)
    if (existing) {
      assertPathContained(
        base,
        fs.realpathSync.native(existing),
        `${label} must stay inside the gateway workspace base.`,
      )
    }
    return resolved
  }

  private assertRunBudgetAllowed(
    input: LocalGatewayStartRunInput,
    session: MainspringSessionRecord,
  ): LocalGatewayBudgetEvaluation[] {
    const appState = this.appState
    if (!appState) return []
    const evaluations = this.evaluateBudgetsForRun(appState, input, session)
    const blocked = evaluations.filter(
      (evaluation): evaluation is LocalGatewayBudgetEvaluation & { status: 'blocked' } => (
        evaluation.status === 'blocked'
      ),
    )
    if (blocked.length > 0) {
      this.budgetControl().recordRunDecision({
        sessionId: input.sessionId,
        ...(input.actor ? { actor: input.actor } : {}),
        runBinding: this.budgetRunBinding(input),
        evaluations: blocked,
        acknowledged: false,
      })
      throw new Error(
        `Run blocked by budget: ${blocked
          .map((evaluation) => `${evaluation.label} (${evaluation.scopeLabel})`)
          .join(', ')}.`,
      )
    }
    const warnings = evaluations.filter(
      (evaluation): evaluation is LocalGatewayBudgetEvaluation & { status: 'warn' } => (
        evaluation.status === 'warn'
      ),
    )
    if (warnings.length > 0) {
      this.budgetControl().recordRunDecision({
        sessionId: input.sessionId,
        ...(input.actor ? { actor: input.actor } : {}),
        runBinding: this.budgetRunBinding(input),
        evaluations: warnings,
        acknowledged: Boolean(input.allowBudgetWarning),
      })
    }
    if (warnings.length > 0 && !input.allowBudgetWarning) {
      throw new Error(
        `Run requires budget warning acknowledgement: ${warnings
          .map((evaluation) => `${evaluation.label} (${evaluation.scopeLabel})`)
          .join(', ')}. Retry with allowBudgetWarning=true after review.`,
      )
    }
    return evaluations
  }

  private budgetRunBinding(input: LocalGatewayStartRunInput): Record<string, unknown> {
    return {
      sessionId: input.sessionId,
      input: input.input,
      mode: input.mode,
      allowedTools: [...(input.allowedTools ?? [])],
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.providerProfileId ? { providerProfileId: input.providerProfileId } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.computerId ? { computerId: input.computerId } : {}),
      ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
    }
  }

  private evaluateBudgets(appState: LocalGatewayAppStateStore): LocalGatewayBudgetEvaluation[] {
    const budgets = appState.budgets.list({ status: 'active' })
    const context = this.usageContext(appState)
    return budgets.map((budget) => this.evaluateBudgetRecord(budget, context))
  }

  private evaluateBudgetsForRun(
    appState: LocalGatewayAppStateStore,
    input: LocalGatewayStartRunInput,
    session: MainspringSessionRecord,
  ): LocalGatewayBudgetEvaluation[] {
    const sessionMetadata = recordValue(session.metadata) ?? {}
    const workspaceId =
      input.workspaceId ?? textValue(sessionMetadata.workspaceId as string | undefined)
    const agentId = input.agentId
    const clientId =
      workspaceId
        ? appState.workspaces.get(workspaceId)?.clientId
        : textValue(sessionMetadata.clientId as string | undefined)
    const budgets = appState.budgets
      .list({ status: 'active' })
      .filter((budget) =>
        (budget.scopeType === 'client' && clientId === budget.scopeId)
        || (budget.scopeType === 'workspace' && workspaceId === budget.scopeId)
        || (budget.scopeType === 'agent' && agentId === budget.scopeId),
      )
    const allEvaluations = this.evaluateBudgets(appState)
    const evaluationsById = new Map(allEvaluations.map((evaluation) => [evaluation.budgetId, evaluation] as const))
    return budgets
      .map((budget) => evaluationsById.get(budget.budgetId))
      .filter((evaluation): evaluation is LocalGatewayBudgetEvaluation => Boolean(evaluation))
  }

  private evaluateBudgetRecord(
    budget: LocalGatewayBudgetRecord,
    context: LocalGatewayUsageEvaluationContext,
  ): LocalGatewayBudgetEvaluation {
    const matchedEntries = context.usageEntries.filter((entry) => {
      const workspaceId = this.usageEntryWorkspaceId(entry, context)
      if (budget.scopeType === 'workspace') return workspaceId === budget.scopeId
      if (budget.scopeType === 'agent') return context.runsById.get(entry.runId)?.agentId === budget.scopeId
      const clientId = workspaceId ? context.workspacesById.get(workspaceId)?.clientId : undefined
      return clientId === budget.scopeId
    })
    const summary = summarizeUsageLedger(matchedEntries)
    const usedEstimatedCostUsd = summary.estimatedCostUsd
    const remainingEstimatedCostUsd = budget.maxEstimatedCostUsd - usedEstimatedCostUsd
    const scopeLabel = this.budgetScopeLabel(budget, context)
    const hasUnpricedUsage = summary.unpricedEntries > 0
    const status =
      usedEstimatedCostUsd >= budget.maxEstimatedCostUsd
        ? 'blocked'
        : usedEstimatedCostUsd >= budget.warnAtUsd || hasUnpricedUsage
          ? 'warn'
          : 'ok'
    const costSensitiveReason =
      status === 'blocked'
        ? `Budget blocked cost-sensitive tools: ${budget.label} (${scopeLabel})`
        : hasUnpricedUsage
          ? `Budget has ${summary.unpricedEntries} unpriced usage ${summary.unpricedEntries === 1 ? 'entry' : 'entries'} requiring review: ${budget.label} (${scopeLabel})`
          : status === 'warn'
            ? `Budget warning requires review for cost-sensitive tools: ${budget.label} (${scopeLabel})`
            : `Budget allows cost-sensitive tools: ${budget.label} (${scopeLabel})`
    return {
      budgetId: budget.budgetId,
      scopeType: budget.scopeType,
      scopeId: budget.scopeId,
      label: budget.label,
      scopeLabel,
      status,
      maxEstimatedCostUsd: budget.maxEstimatedCostUsd,
      warnAtUsd: budget.warnAtUsd,
      usedEstimatedCostUsd,
      remainingEstimatedCostUsd,
      usageEntryCount: matchedEntries.length,
      pricedUsageEntryCount: summary.pricedEntries,
      unpricedUsageEntryCount: summary.unpricedEntries,
      estimateCoverage: hasUnpricedUsage ? 'incomplete' : 'complete',
      costSensitiveTools: {
        mode: status === 'warn' ? 'approval' : status === 'blocked' ? 'block' : 'allow',
        reason: costSensitiveReason,
      },
    }
  }

  private budgetScopeLabel(
    budget: LocalGatewayBudgetRecord,
    context: {
      workspacesById: Map<string, LocalGatewayWorkspaceRecord>
      agentsById: Map<string, LocalGatewayAgentRecord>
      clientsById: Map<string, LocalGatewayClientRecord>
    },
  ): string {
    if (budget.scopeType === 'client') {
      return context.clientsById.get(budget.scopeId)?.name ?? budget.scopeId
    }
    if (budget.scopeType === 'workspace') {
      return context.workspacesById.get(budget.scopeId)?.name ?? budget.scopeId
    }
    return context.agentsById.get(budget.scopeId)?.name ?? budget.scopeId
  }

  private usageContext(appState: LocalGatewayAppStateStore): LocalGatewayUsageEvaluationContext {
    return {
      usageEntries: appState.usageLedger.list(),
      runsById: new Map(appState.runs.list().map((run) => [run.runId, run] as const)),
      workspacesById: new Map(
        appState.workspaces.list().map((workspace) => [workspace.workspaceId, workspace] as const),
      ),
      agentsById: new Map(appState.agents.list().map((agent) => [agent.agentId, agent] as const)),
      clientsById: new Map(appState.clients.list().map((client) => [client.clientId, client] as const)),
    }
  }

  private usageEntryWorkspaceId(
    entry: LocalGatewayUsageLedgerEntryRecord,
    context: Pick<LocalGatewayUsageEvaluationContext, 'runsById'>,
  ): string | undefined {
    return entry.workspaceId ?? context.runsById.get(entry.runId)?.workspaceId
  }

  private recordBudgetTransitions(input: {
    appState: LocalGatewayAppStateStore
    runId: string
    sessionId: string
    entryId: string
    previousStatuses: Map<string, LocalGatewayBudgetEvaluation>
  }): void {
    const runMetadata = input.appState.runs.get(input.runId)
    for (const evaluation of this.evaluateBudgets(input.appState)) {
      const previousEvaluation = input.previousStatuses.get(evaluation.budgetId)
      const previousStatus =
        previousEvaluation && previousEvaluation.usageEntryCount > 0
          ? previousEvaluation.status
          : this.budgetEvaluationStateById.get(evaluation.budgetId) ?? 'ok'
      this.budgetEvaluationStateById.set(evaluation.budgetId, evaluation.status)
      if (previousStatus === evaluation.status) continue
      if (evaluation.status === 'warn' || evaluation.status === 'blocked') {
        input.appState.auditEvents.create({
          category: 'billing',
          action: evaluation.status === 'warn' ? 'budget.threshold.warn' : 'budget.threshold.blocked',
          actor: 'local-gateway',
          targetType: 'budget',
          targetId: evaluation.budgetId,
          runId: input.runId,
          sessionId: input.sessionId,
          metadata: {
            entryId: input.entryId,
            fromStatus: previousStatus,
            toStatus: evaluation.status,
            scopeType: evaluation.scopeType,
            scopeId: evaluation.scopeId,
            usedEstimatedCostUsd: evaluation.usedEstimatedCostUsd,
            remainingEstimatedCostUsd: evaluation.remainingEstimatedCostUsd,
            ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
            ...(runMetadata?.agentId ? { agentId: runMetadata.agentId } : {}),
          },
        })
      }
    }
  }

  private runCronScheduleNow(
    scheduleId: string,
    trigger: 'manual' | 'scheduler',
    now = this.now(),
    actor?: string,
  ): RunRecord | RunLogRunRecord {
    const appState = this.requireAppState()
    const schedule = appState.cronSchedules.get(scheduleId)
    if (!schedule) throw new Error(`Unknown cron schedule: ${scheduleId}`)

    const nextRunAt = schedule.enabled
      ? this.computeNextRunAt({
          cronExpr: schedule.cronExpr,
          timezone: schedule.timezone,
          after: now,
        })
      : undefined
    const triggerAuthorization = this.cronControl().authorizeTrigger({
      scheduleId,
      trigger,
      ...(actor ? { actor } : {}),
      ...(nextRunAt ? { nextRunAt } : {}),
    })
    try {
      const updatedSchedule = appState.cronSchedules.update({
        scheduleId,
        lastRunAt: now.toISOString(),
        nextRunAt: nextRunAt ?? '',
        lastError: '',
      })
      if (this.runLogRuntime) {
        return this.runRunLogCronSchedule(
          updatedSchedule,
          trigger,
          now,
          nextRunAt,
          triggerAuthorization,
        )
      }
      const run = this.runs.startFromAppState({
        sessionId: updatedSchedule.sessionId,
        input: updatedSchedule.prompt,
        mode: 'chat',
        allowedTools: updatedSchedule.allowedTools,
        actor: triggerAuthorization.actor,
        ...(updatedSchedule.workspaceId ? { workspaceId: updatedSchedule.workspaceId } : {}),
        ...(updatedSchedule.agentId ? { agentId: updatedSchedule.agentId } : {}),
        ...(updatedSchedule.providerProfileId
          ? { providerProfileId: updatedSchedule.providerProfileId }
          : {}),
        ...(updatedSchedule.computerId ? { computerId: updatedSchedule.computerId } : {}),
        ...(updatedSchedule.runtimeProfile
          ? { runtimeProfile: this.runtimeProfiles.assertRegistered(updatedSchedule.runtimeProfile) }
          : {}),
      })
      appState.runs.upsert({
        runId: run.runId,
        sessionId: updatedSchedule.sessionId,
        ...(updatedSchedule.workspaceId ? { workspaceId: updatedSchedule.workspaceId } : {}),
        ...(updatedSchedule.agentId ? { agentId: updatedSchedule.agentId } : {}),
        metadata: { scheduleId: updatedSchedule.scheduleId, trigger },
      })
      this.cronControl().recordTriggerOutcome({
        authorization: triggerAuthorization,
        runId: run.runId,
        ...(nextRunAt ? { nextRunAt } : {}),
      })
      return run
    } catch (error) {
      this.cronControl().recordTriggerFailure({ authorization: triggerAuthorization })
      throw error
    }
  }

  private buildRunLogCronContext(
    schedule: LocalGatewayCronScheduleRecord,
    now: Date,
  ): {
    runtime: RunLogMainspring
    resolvedInput: LocalGatewayStartRunInput
    agentId: string
    agent: AgentSpec
    metadata: Record<string, unknown> & RunLogCronPolicyMetadata
    job: RunLogCronJob
    scheduleKey: string
  } {
    const runtime = this.requireRunLogRuntime()
    const resolvedInput = this.resolveAppStateRunInput({
      sessionId: schedule.sessionId,
      input: schedule.prompt,
      mode: 'chat',
      allowedTools: schedule.allowedTools,
      ...(schedule.workspaceId ? { workspaceId: schedule.workspaceId } : {}),
      ...(schedule.agentId ? { agentId: schedule.agentId } : {}),
      ...(schedule.providerProfileId ? { providerProfileId: schedule.providerProfileId } : {}),
      ...(schedule.computerId ? { computerId: schedule.computerId } : {}),
      ...(schedule.runtimeProfile
        ? { runtimeProfile: this.runtimeProfiles.assertRegistered(schedule.runtimeProfile) }
        : {}),
    })
    const agentId = resolvedInput.agentId ?? runtime.defaultAgentId
    const { agent } = this.runLogAgentForInput(resolvedInput, agentId)
    const scheduleKey = gatewayCronScheduleKey({
      cronExpr: schedule.cronExpr,
      timezone: schedule.timezone,
    })
    const metadata: Record<string, unknown> & RunLogCronPolicyMetadata = {
      ...(schedule.metadata ?? {}),
      headless: true,
      cronScheduleKey: scheduleKey,
    }
    const job: RunLogCronJob = {
      cronId: schedule.scheduleId,
      agentId,
      input: schedule.prompt,
      intervalMs: gatewayCronPolicyIntervalMs(),
      nextRunAt: schedule.nextRunAt ?? now.toISOString(),
      enabled: schedule.enabled,
      ...(schedule.sessionId ? { sessionId: schedule.sessionId } : {}),
      ...(resolvedInput.workspaceId ? { workspaceId: resolvedInput.workspaceId } : {}),
      allowedTools: resolvedInput.allowedTools ?? [],
      metadata,
    }
    return { runtime, resolvedInput, agentId, agent, metadata, job, scheduleKey }
  }

  private cronGrantPreviewFromDecision(input: {
    schedule: LocalGatewayCronScheduleRecord
    context: ReturnType<LocalMainspringGateway['buildRunLogCronContext']>
    decision: DecisionRecord
  }): LocalGatewayCronGrantPreview {
    const grant = input.context.metadata.cronGrant
    const grantRequired =
      input.decision.permissionCategories.includes('side-effecting')
      || input.decision.reasons.some((reason) => reason.includes('grant'))
    return {
      scheduleId: input.schedule.scheduleId,
      sessionId: input.schedule.sessionId,
      agentId: input.context.agentId,
      ...(input.context.resolvedInput.workspaceId
        ? { workspaceId: input.context.resolvedInput.workspaceId }
        : {}),
      cronMode:
        input.context.metadata.cronMode
        ?? (grantRequired ? 'deny' : 'allowlist'),
      headless: true,
      grantRequired,
      grantPresent: Boolean(grant),
      scheduleKey: input.context.scheduleKey,
      allowedTools: [...(input.context.resolvedInput.allowedTools ?? [])],
      decision: {
        decisionId: input.decision.decisionId,
        state: input.decision.state,
        reasons: input.decision.reasons,
        permissionCategories: input.decision.permissionCategories,
        inputHash: input.decision.inputHash,
        manifestHash: input.decision.manifestHash,
        policyHash: input.decision.policyHash,
        ...(input.decision.metadata ? { metadata: input.decision.metadata } : {}),
      },
      ...(grant
        ? {
            grant: {
              grantId: grant.grantId,
              mode: grant.mode,
              promptHash: grant.promptHash,
              scheduleHash: grant.scheduleHash,
              allowedTools: [...grant.allowedTools],
              expiresAt: grant.expiresAt,
              maxExecutionCount: grant.maxExecutionCount,
              executionCount: grant.executionCount,
              createdAt: grant.createdAt,
            },
          }
        : {}),
      ...(input.context.metadata.lastDecision
        ? { lastDecision: input.context.metadata.lastDecision }
        : {}),
    }
  }

  private runRunLogCronSchedule(
    schedule: LocalGatewayCronScheduleRecord,
    trigger: 'manual' | 'scheduler',
    now: Date,
    nextRunAt?: string,
    triggerAuthorization?: LocalGatewayCronTriggerAuthorization,
  ): RunLogRunRecord {
    const session = this.runtime.storage.stateStore.getSession(schedule.sessionId)
    if (!session) throw new Error(`Unknown session: ${schedule.sessionId}`)
    const context = this.buildRunLogCronContext(schedule, now)
    const runtime = context.runtime
    const resolvedInput = {
      ...context.resolvedInput,
      ...(triggerAuthorization ? { actor: triggerAuthorization.actor } : {}),
    }
    const budgetEvaluations = this.assertRunBudgetAllowed(resolvedInput, session)
    const metadata: Record<string, unknown> & RunLogCronPolicyMetadata = {
      ...context.metadata,
      trigger,
    }
    const job: RunLogCronJob = { ...context.job, metadata }
    const decision = decideRunLogCron({ job, agent: context.agent, now })
    // Preview and policy evaluation are read-only. Persist the resolved agent
    // only after the RunLog cron decision has authorized a queued execution.
    if (decision.state === 'allow') {
      this.ensureRunLogAgent(resolvedInput, context.agentId)
    }
    const workspaceRoot = resolvedInput.workspaceId
      ? this.appState?.workspaces.get(resolvedInput.workspaceId)?.root
      : session.workspaceRoot
    const run = runtime.store.createRun(
      {
        agentId: context.agentId,
        input: resolvedInput.input,
        sessionId: resolvedInput.sessionId,
        workspaceId: resolvedInput.workspaceId,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        providerId: resolvedInput.providerId,
        modelId: resolvedInput.modelId,
        credentialRef: resolvedInput.credentialRef,
        allowedTools: resolvedInput.allowedTools ?? [],
        requestedCapabilities: runLogCronCapabilitiesFromGatewayInput(resolvedInput),
        metadata: {
          gatewaySurface: 'runlog',
          scheduleId: schedule.scheduleId,
          trigger,
          headless: true,
          cronMode: metadata.cronMode ?? (context.agent.tools?.length ? 'deny' : 'allowlist'),
          cronDecisionId: decision.decisionId,
          ...(triggerAuthorization
            ? { gatewayTriggerDecisionId: triggerAuthorization.decision.decisionId }
            : {}),
          ...(schedule.providerProfileId ? { providerProfileId: schedule.providerProfileId } : {}),
          ...(resolvedInput.computerId ? { computerId: resolvedInput.computerId } : {}),
          ...(resolvedInput.runtimeProfile
            ? { runtimeProfile: this.runtimeProfiles.assertRegistered(resolvedInput.runtimeProfile) }
            : {}),
        },
      },
      context.agent,
    )
    const runDecision = decisionRecordForRun(decision, run.runId, run.sessionId)
    runtime.store.appendEvent({
      runId: run.runId,
      type: 'run.created',
      payload: { agentId: run.agentId, sessionId: run.sessionId, source: 'cron', headless: true },
      idempotencyKey: `run.created:${run.runId}`,
    })
    runtime.store.appendEvent({
      runId: run.runId,
      type: 'cron.due',
      payload: {
        cronId: schedule.scheduleId,
        dueAt: schedule.nextRunAt ?? now.toISOString(),
        headless: true,
        trigger,
        decisionId: runDecision.decisionId,
      },
      idempotencyKey: `cron.due:${run.runId}`,
    })
    runtime.store.appendEvent({
      runId: run.runId,
      type: 'policy.decision.recorded',
      payload: runDecision,
      idempotencyKey: `policy.decision.recorded:${runDecision.decisionId}`,
    })
    if (runDecision.state === 'allow') {
      runtime.store.appendEvent({
        runId: run.runId,
        type: 'input.received',
        payload: { input: resolvedInput.input, source: 'cron', trigger },
        idempotencyKey: `input.received:${run.runId}`,
      })
      runtime.store.appendEvent({
        runId: run.runId,
        type: 'run.queued',
        payload: { source: 'cron', trigger, decisionId: runDecision.decisionId },
        idempotencyKey: `run.queued:${run.runId}`,
      })
    } else {
      runtime.store.updateRunStatus(run.runId, 'failed')
      runtime.store.appendEvent({
        runId: run.runId,
        type: 'run.failed',
        payload: {
          source: 'cron',
          trigger,
          cronId: schedule.scheduleId,
          decisionId: runDecision.decisionId,
          state: runDecision.state,
          reasons: runDecision.reasons,
        },
        idempotencyKey: `run.failed:${run.runId}:cron-policy`,
      })
    }
    const nextMetadata = cronMetadataWithDecision(metadata, runDecision, {
      incrementGrantUse: runDecision.state === 'allow' && Boolean(metadata.cronGrant),
    })
    this.requireAppState().cronSchedules.update({
      scheduleId: schedule.scheduleId,
      metadata: nextMetadata,
    })
    this.persistRunLogMetadata(
      runtime.store.getRun(run.runId) ?? run,
      {
        ...resolvedInput,
        ...(schedule.providerProfileId ? { providerProfileId: schedule.providerProfileId } : {}),
      },
      budgetEvaluations,
      {
        scheduleId: schedule.scheduleId,
        trigger,
        headless: true,
        cronMode: typeof runDecision.metadata?.cronMode === 'string'
          ? runDecision.metadata.cronMode
          : undefined,
        cronDecisionId: runDecision.decisionId,
        cronDecisionState: runDecision.state,
      },
    )
    if (triggerAuthorization) {
      this.cronControl().recordTriggerOutcome({
        authorization: triggerAuthorization,
        runId: run.runId,
        ...(nextRunAt ? { nextRunAt } : {}),
        executionDecision: runDecision,
      })
    }
    return runtime.store.getRun(run.runId) ?? run
  }

  private validateCronScheduleInput(
    appState: LocalGatewayAppStateStore,
    input: {
      sessionId: string
      workspaceId?: string
      agentId?: string
      providerProfileId?: string
      computerId?: string
      label: string
      prompt: string
      cronExpr: string
      timezone?: CronTimezone
      runtimeProfile?: MainspringRuntimeProfile
    },
  ): void {
    if (!this.runtime.storage.stateStore.getSession(input.sessionId)) {
      throw new Error(`Unknown session: ${input.sessionId}`)
    }
    requiredGatewayText(input.label, 'cron schedule label')
    requiredGatewayText(input.prompt, 'cron schedule prompt')
    parseCronExpression(input.cronExpr)
    this.resolveGatewayWorkspace(appState, input.workspaceId)
    this.resolveGatewayAgent(appState, input.agentId)
    this.resolveGatewayProviderProfile(appState, input.providerProfileId)
    this.runtimeProfiles.assertRegistered(input.runtimeProfile)
  }

  private computeNextRunAt(input: {
    cronExpr: string
    timezone: CronTimezone
    after: Date
  }): string | undefined {
    const next = nextCronOccurrence({
      expression: parseCronExpression(input.cronExpr),
      timezone: input.timezone,
      after: input.after,
    })
    return next?.toISOString()
  }

  private resolveGatewayWorkspace(
    appState: LocalGatewayAppStateStore,
    workspaceId: string | undefined,
  ): LocalGatewayWorkspaceRecord | null {
    if (!workspaceId) return null
    const workspace = appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    return workspace
  }

  private resolveGatewayAgent(
    appState: LocalGatewayAppStateStore,
    agentId: string | undefined,
  ): LocalGatewayAgentRecord | null {
    if (!agentId) return null
    const agent = appState.agents.get(agentId)
    if (!agent) throw new Error(`Unknown gateway agent: ${agentId}`)
    return agent
  }

  private resolveGatewayProviderProfile(
    appState: LocalGatewayAppStateStore,
    providerProfileId: string | undefined,
  ): LocalGatewayProviderProfileRecord | null {
    if (!providerProfileId) return null
    const providerProfile = appState.providerProfiles.get(providerProfileId)
    if (!providerProfile) {
      throw new Error(`Unknown gateway provider profile: ${providerProfileId}`)
    }
    return providerProfile
  }
}

export function createLocalMainspringGateway(
  options: CreateLocalMainspringGatewayOptions,
): LocalMainspringGateway {
  return new LocalMainspringGateway(options.runtime, options)
}
