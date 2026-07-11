import {
  DEFAULT_MAINSPRING_RUNTIME_PROFILE,
  MAINSPRING_RUNTIME_PROFILES,
  MainspringRuntimeProfileIdSchema,
  type GatewayRunDispatch,
  type MainspringRuntimeProfile,
  type MainspringRuntimeProfileRegistration,
  type RuntimePolicy,
} from '#protocol'
import fs from 'node:fs'
import path from 'node:path'
import type {
  MainspringApprovalRecord,
  MainspringSessionRecord,
  RunEvent,
  RunRecord,
  RuntimeHealth,
  StartRunInput,
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
  CompatibilityRunPageReader,
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
import { GatewayRunInputResolver } from './GatewayRunInputResolver.js'
import { GatewayCronScheduler } from './GatewayCronScheduler.js'
import { GatewayArtifactAccess, type LocalGatewayArtifactFile } from './GatewayArtifactAccess.js'
import { GatewayArtifactProjection } from './GatewayArtifactProjection.js'
import { GatewayUsageProjection } from './GatewayUsageProjection.js'
import { GatewaySnapshotReader, projectLocalGatewayRunLogRun } from './GatewaySnapshotReader.js'
import { GatewayBudgetEvaluator } from './GatewayBudgetEvaluator.js'
import { GatewayProjectionSynchronizer } from './GatewayProjectionSynchronizer.js'
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

export interface LocalGatewayUsageBreakdown {
  id: string
  label: string
  entries: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  unpricedEntries: number
}

export interface LocalGatewayUsageStatus {
  total: LocalGatewayUsageRollup
  clients: LocalGatewayUsageRollup[]
  workspaces: LocalGatewayUsageRollup[]
  agents: LocalGatewayUsageRollup[]
  unpricedEntries: number
  pricedEntries: number
  estimatedCostUsd: number
  breakdowns?: {
    providers: LocalGatewayUsageBreakdown[]
    models: LocalGatewayUsageBreakdown[]
  }
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
    historyCounts?: {
      artifacts: number
      toolCalls: number
      usageLedger: number
      auditEvents: number
    }
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
  private readonly artifactAccess?: GatewayArtifactAccess
  private readonly artifactProjection?: GatewayArtifactProjection
  private readonly usageProjection?: GatewayUsageProjection<LocalGatewayBudgetEvaluation>
  private readonly budgetEvaluationStateById = new Map<string, LocalGatewayBudgetEvaluation['status']>()
  private readonly hyperCells?: HyperCellScheduler
  private readonly compatibilityRunPageReader: CompatibilityRunPageReader<LocalGatewayRunProjection>
  private readonly snapshotReader: GatewaySnapshotReader
  private readonly budgetEvaluator = new GatewayBudgetEvaluator()
  private readonly runInputResolver?: GatewayRunInputResolver
  private readonly projectionSynchronizer?: GatewayProjectionSynchronizer<LocalGatewayBudgetEvaluation>
  private readonly cronScheduler: GatewayCronScheduler
  private snapshotReadCache?: LocalGatewaySnapshotReadCache

  constructor(
    private readonly runtime: Mainspring,
    options: CreateLocalMainspringGatewayOptions = { runtime },
  ) {
    this.runLogRuntime = options.runLog
    this.appState = options.appState
    this.artifactAccess = this.appState
      ? new GatewayArtifactAccess({
          appState: this.appState,
          rootPath: this.runtime.storage.artifactStore.rootPath,
        })
      : undefined
    this.artifactProjection = this.appState
      ? new GatewayArtifactProjection({
          appState: this.appState,
          rootPath: this.runtime.storage.artifactStore.rootPath,
        })
      : undefined
    this.compatibilityRunPageReader = new CompatibilityRunPageReader({
      appState: () => this.appState,
      getSession: (sessionId) => this.runtime.storage.stateStore.getSession(sessionId),
      projectSession: (sessionId, knownSession) => this.listRuns(sessionId, knownSession),
      projectionFromMetadata: compatibilityRunProjectionFromMetadata,
    })
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
    this.runInputResolver = this.appState
      ? new GatewayRunInputResolver({
          appState: this.appState,
          getSession: (sessionId) => this.runtime.storage.stateStore.getSession(sessionId),
          assertRuntimeProfile: (profileId) => this.runtimeProfiles.assertRegistered(profileId),
        })
      : undefined
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
    const appState = this.appState
    this.usageProjection = appState
      ? new GatewayUsageProjection({
          appState,
          pricingCatalog: this.pricingCatalog,
          evaluateBudgets: () => this.budgetEvaluator.evaluate(appState),
          recordBudgetTransitions: (input) => this.recordBudgetTransitions({
            appState,
            ...input,
          }),
        })
      : undefined
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
    this.projectionSynchronizer = appState
      ? new GatewayProjectionSynchronizer<LocalGatewayBudgetEvaluation>({
          appState,
          listSessions: () => this.runtime.storage.stateStore.listSessions(),
          runMetadataByRunId: (sessionId) => this.runMetadataByRunId(sessionId),
          nativeMailboxEvents: (session) => this.nativeMailboxEvents(session),
          nativeSessionEvents: (sessionId, knownSession) => this.nativeSessionEvents(sessionId, knownSession),
          ...(this.runLogRuntime ? { runLog: this.runLogRuntime } : {}),
          ...(this.usageProjection ? { usageProjection: this.usageProjection } : {}),
          ...(this.artifactProjection ? { artifactProjection: this.artifactProjection } : {}),
          ...(this.hyperCells ? { hyperCells: this.hyperCells } : {}),
          loadRunEventsForLease: (lease) =>
            lease.runId && lease.sessionId
              ? this.runtime.storage.eventStore.listRunEvents({
                  sessionId: lease.sessionId,
                  runId: lease.runId,
                  limit: 500,
                })
              : [],
          statusFromEvents: gatewayRunStatusFromEvents,
      })
      : undefined
    this.cronScheduler = new GatewayCronScheduler({
      enabled: options.cron?.enabled ?? false,
      pollIntervalMs: options.cron?.pollIntervalMs ?? 30_000,
      now: this.now,
      ...(this.appState
        ? { listSchedules: () => this.appState!.cronSchedules.list({ enabled: true }) }
        : {}),
      runSchedule: (scheduleId, now) => {
        this.runCronScheduleNow(scheduleId, 'scheduler', now)
      },
    })
    this.snapshotReader = new GatewaySnapshotReader({
      runtime: this.runtime,
      ...(this.runLogRuntime ? { runLog: this.runLogRuntime } : {}),
      ...(this.appState ? { appState: this.appState } : {}),
      inspectExecutionBackends: this.inspectExecutionBackends,
      syncDerivedAppState: () => this.syncDerivedAppState(),
      listSessions: () => this.sessions.list(),
      listRuns: (sessionId, knownSession) => this.listRuns(sessionId, knownSession),
      snapshotApprovals: () => this.snapshotApprovals(),
      cronStatus: () => this.cron.status(),
      pricingCatalog: this.pricingCatalogStatus,
      usageStatus: () => this.usageStatus(),
      budgetStatus: () => this.budgetStatus(),
      cellStatus: () => this.cellStatus(),
      workerState: () => this.runLogWorkerState,
    })
    this.cronScheduler.start()
  }

  private readonly runLogRuntime?: RunLogMainspring
  private runLogWorkerState: LocalGatewayRunLogWorkerStatus['state'] = 'stopped'

  /**
   * Resolve a browser-downloadable artifact without returning its host path
   * through a browser DTO. The server owns the response stream; this gateway
   * boundary owns root containment, symlink validation, and file opening.
   */
  async resolveArtifactFile(artifactId: string): Promise<LocalGatewayArtifactFile | null> {
    return this.artifactAccess?.open(artifactId) ?? null
  }

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
    status: (): LocalGatewayCronStatus => this.cronScheduler.status(),
    tick: async (): Promise<void> => {
      await this.cronScheduler.tick()
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
        projectLocalGatewayRunLogRun(this.requireRunLogRuntime().project(runId, limit)),
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
    workerStatus: (): LocalGatewayRunLogWorkerStatus => this.snapshotReader.workerStatus(),
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
    this.snapshotReadCache = this.createSnapshotReadCache()
    try {
      return this.snapshotReader.snapshot()
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
    return this.snapshotReader.revision()
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

  private syncDerivedAppState(): void {
    this.projectionSynchronizer?.sync()
  }

  private requireAppState(): LocalGatewayAppStateStore {
    if (!this.appState) {
      throw new Error('Local gateway app state is not configured.')
    }
    return this.appState
  }

  private requireRunInputResolver(): GatewayRunInputResolver {
    if (!this.runInputResolver) {
      throw new Error('Local gateway app state is not configured.')
    }
    return this.runInputResolver
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
    return this.budgetEvaluator.usageStatus(appState)
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
    return this.requireRunInputResolver().resolve(input)
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
      validateSchedule: (input) => this.validateCronScheduleInput(input),
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
    return this.budgetEvaluator.evaluate(appState)
  }

  private evaluateBudgetsForRun(
    appState: LocalGatewayAppStateStore,
    input: LocalGatewayStartRunInput,
    session: MainspringSessionRecord,
  ): LocalGatewayBudgetEvaluation[] {
    return this.budgetEvaluator.evaluateForRun(appState, input, session.metadata)
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
    const resolver = this.requireRunInputResolver()
    resolver.resolveWorkspace(input.workspaceId)
    resolver.resolveAgent(input.agentId)
    resolver.resolveProviderProfile(input.providerProfileId)
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

}

export function createLocalMainspringGateway(
  options: CreateLocalMainspringGatewayOptions,
): LocalMainspringGateway {
  return new LocalMainspringGateway(options.runtime, options)
}
