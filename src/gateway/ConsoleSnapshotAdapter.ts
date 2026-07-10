import { sanitizeRuntimeResponse } from '#protocol'
import type { RunEvent, RuntimeHealth } from '../contracts/runtime.js'
import type { RunRecord } from '../contracts/runtime.js'
import type { RunLogCronPolicyMetadata } from '../capabilities/cron/RunLogCron.js'
import type { ProvenanceReviewItem } from '../provenance/ProvenanceReview.js'
import type { RunRecord as RunLogRunRecord } from '../core/types.js'
import { listStoredMemoryEntries } from '../memory/MemoryStore.js'
import { redactBrowserUnsafeGatewayText } from './browserSafety.js'
import type {
  InstallLocalMarketplaceTemplateResult,
  LocalGatewaySnapshot,
  LocalGatewayBudgetStatus,
  LocalGatewayCellStatus,
  LocalGatewayCronStatus,
  LocalGatewayDeploymentExecutionResult,
  LocalGatewayDeploymentPlan,
  LocalGatewayUsageRollup,
  LocalGatewayUsageStatus,
  LocalGatewayRunProjection,
  LocalGatewayRunLogRunProjection,
  LocalGatewaySessionProjection,
} from './LocalGateway.js'
import { deploymentTargetSupport } from './DeploymentWizard.js'
import type { MarketplaceTemplateRecord } from './TemplateMarketplace.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayApprovalMetadataRecord,
  LocalGatewayArtifactRecord,
  LocalGatewayAuditEventRecord,
  LocalGatewayBudgetRecord,
  LocalGatewayCellLeaseRecord,
  LocalGatewayCellRecord,
  LocalGatewayCellSnapshotRecord,
  LocalGatewayClientRecord,
  LocalGatewayCronScheduleRecord,
  LocalGatewayDeploymentRunRecord,
  LocalGatewayDeploymentTargetRecord,
  LocalGatewayProviderProfileRecord,
  LocalGatewayToolCallRecord,
  LocalGatewayUsageLedgerEntryRecord,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface ConsoleGatewayClient {
  clientId: string
  name: string
  contact?: string
  billingLabel?: string
  status: LocalGatewayClientRecord['status']
}

export interface ConsoleGatewayWorkspace {
  workspaceId: string
  clientId?: string
  name: string
  status: LocalGatewayWorkspaceRecord['status']
}

export interface ConsoleGatewayAgent {
  agentId: string
  workspaceId?: string
  name: string
  version: string
  defaultModelId?: string
  instructions?: string
  outcome?: string
  voice?: string
  approvalMode?: string
  modelLabel?: string
  skills?: Record<string, boolean>
  status: LocalGatewayAgentRecord['status']
}

export interface ConsoleGatewayProviderProfile {
  profileId: string
  providerId: string
  label: string
  status: LocalGatewayProviderProfileRecord['status']
  defaultModelId?: string
  credentialState: 'configured' | 'missing' | 'unavailable' | 'unverified'
}

export interface ConsoleGatewaySession {
  sessionId: string
  status: LocalGatewaySessionProjection['status']
  clientId?: string
  workspaceId?: string
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayRun {
  runId: string
  sessionId: string
  status: LocalGatewayRunProjection['status']
  workspaceId?: string
  agentId?: string
  computerId?: string
  providerProfileId?: string
  providerId?: string
  modelId?: string
  modelFamily?: string
  providerTransport?: string
  providerSessionId?: string
  createdAt?: string
  lastEventAt?: string
  eventCount: number
  pendingInboundCount: number
}

export interface ConsoleGatewayRunEvent {
  type: RunEvent['type']
  runId: string
  sessionId?: string
  timestamp?: string
  seq?: number
  payload?: unknown
}

export interface ConsoleGatewayRunDispatch {
  runId: string
  sessionId: string
  status: RunRecord['status'] | RunLogRunRecord['status']
  createdAt?: string
}

export interface ConsoleGatewayRunLogRun {
  runId: string
  sessionId: string
  agentId: string
  status: LocalGatewayRunLogRunProjection['status']
  workspaceId?: string
  providerId?: string
  modelId?: string
  createdAt: string
  updatedAt: string
  assistantText?: string
  latestSeq: number
  eventCount: number
  lastEventType?: string
  pendingApprovalCount: number
  approvalDecisionCount: number
  toolCallCount: number
  checkpointCount: number
  policyDecisionCount: number
  errorCount: number
  pendingApprovals: Array<{
    approvalId?: string
    toolCallId?: string
  }>
  toolCalls: Array<{
    toolCallId?: string
    name?: string
    status: 'requested' | 'completed' | 'failed' | 'blocked'
  }>
  checkpoints: Array<{
    eventId: string
    seq: number
    kind?: string
  }>
  policyDecisions: Array<{
    decisionId: string
    state: string
    surface: string
    targetKey: string
    toolCallId?: string
  }>
  errors: Array<{
    eventId: string
    seq: number
    type: 'runtime.error' | 'run.failed'
    message?: string
  }>
}

export interface ConsoleGatewayRunLogSnapshot {
  configured: boolean
  /** Omitted by older gateway snapshots during rolling local upgrades. */
  worker?: NonNullable<LocalGatewaySnapshot['runLog']>['worker']
  runs: ConsoleGatewayRunLogRun[]
}

export interface ConsoleGatewayApproval {
  approvalId: string
  runId: string
  sessionId: string
  status: string
  requestedAt: string
  resolvedAt?: string
  targetKey?: string
}

export interface ConsoleGatewayApprovalMetadata {
  approvalId: string
  runId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  status: LocalGatewayApprovalMetadataRecord['status']
  targetKey?: string
  requestedAt: string
  resolvedAt?: string
}

export interface ConsoleGatewayArtifact {
  artifactId: string
  runId: string
  sessionId: string
  workspaceId?: string
  kind: string
  label?: string
  mediaType?: string
  sizeBytes?: number
  createdAt: string
}

export interface ConsoleGatewayToolCall {
  toolCallId: string
  runId: string
  sessionId: string
  toolName: string
  status: LocalGatewayToolCallRecord['status']
  agentId?: string
  workspaceId?: string
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayDeploymentTarget {
  targetId: string
  workspaceId?: string
  label: string
  kind: LocalGatewayDeploymentTargetRecord['kind']
  status: LocalGatewayDeploymentTargetRecord['status']
  executionSupported: boolean
  executionMode: string
  executionUnavailableReason?: string
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayDeploymentRun {
  deploymentRunId: string
  targetId: string
  runId?: string
  sessionId?: string
  status: LocalGatewayDeploymentRunRecord['status']
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayDeploymentPlanStep {
  phase: 'local' | 'remote'
  label: string
  commandPreview: string
}

export interface ConsoleGatewayDeploymentPlan {
  operation: LocalGatewayDeploymentPlan['operation']
  targetId: string
  targetLabel: string
  targetKind: LocalGatewayDeploymentPlan['targetKind']
  summary: string
  prerequisites: string[]
  warnings: string[]
  steps: ConsoleGatewayDeploymentPlanStep[]
  releaseId?: string
  rollbackReleaseId?: string
}

export interface ConsoleGatewayDeploymentExecutionResult {
  deploymentRun: ConsoleGatewayDeploymentRun
  plan: ConsoleGatewayDeploymentPlan
  execution: {
    ok: boolean
    exitCode: number
    startedAt: string
    completedAt: string
    detail: string
  }
}

export interface ConsoleGatewayBackendCapabilities {
  isolationKind?: string
  isolationStrength?: string
  securityBoundary?: string
  networkPolicy?: string
  workspaceMapping?: string
  requiresApproval?: boolean
  unsafeFallback?: boolean
  limits?: string[]
}

export interface ConsoleGatewayBackendSummary {
  backend?: string
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ConsoleGatewayBackendCapabilities
}

export interface ConsoleExecutionBackendInventory {
  defaultBackend: LocalGatewaySnapshot['executionBackends']['defaultBackend']
  backends: Array<{
    key: string
    label: string
    available: boolean
    unsafe: boolean
    reason?: string
    capabilities?: ConsoleGatewayBackendCapabilities
  }>
}

export interface ConsoleExecutionBackendStatus {
  generatedAt: string
  defaultBackend: LocalGatewaySnapshot['executionBackends']['defaultBackend']
  backends: Array<{
    key: string
    label: string
    available: boolean
    unsafe: boolean
    reason?: string
    capabilities: ConsoleGatewayBackendCapabilities
    observedCells: number
    activeLeases: number
    latestCell?: ConsoleGatewayCell
    latestLease?: ConsoleGatewayCellLease
    latestSnapshot?: ConsoleGatewayCellSnapshot
  }>
}

export interface ConsoleGatewayCell {
  cellId: string
  workspaceId?: string
  label: string
  status: LocalGatewayCellRecord['status']
  createdAt: string
  updatedAt: string
  backend?: ConsoleGatewayBackendSummary
}

export interface ConsoleGatewayCellLease {
  leaseId: string
  cellId: string
  runId?: string
  sessionId?: string
  status: LocalGatewayCellLeaseRecord['status']
  createdAt: string
  updatedAt: string
  backend?: ConsoleGatewayBackendSummary
}

export interface ConsoleGatewayCellSnapshot {
  snapshotId: string
  cellId: string
  leaseId?: string
  label: string
  createdAt: string
  backend?: ConsoleGatewayBackendSummary
}

export interface ConsoleGatewayCellCapacityBlock {
  cellId: string
  workspaceId?: string
  requestedComputerId: string
  backend: string
  activeLeases: number
  maxActiveLeases: number
  blockedAt: string
}

export interface ConsoleGatewayCellRuntimeStatus {
  cellId: string
  workspaceId?: string
  label: string
  status: 'active' | 'archived'
  activeLeases: number
  releasedLeases: number
  expiredLeases: number
  maxActiveLeases?: number
  capacityAvailable?: number
  lastCapacityBlock?: ConsoleGatewayCellCapacityBlock
}

export interface ConsoleGatewayCellStatus {
  enabled: boolean
  leaseTtlMs: number
  capacityEnforced: boolean
  maxActiveLeasesPerCell?: number
  cells: number
  leases: {
    active: number
    released: number
    expired: number
    total: number
  }
  lastCapacityBlock?: ConsoleGatewayCellCapacityBlock
  cellStatuses: ConsoleGatewayCellRuntimeStatus[]
}

export type ConsoleGatewayPricingCatalogStatus = LocalGatewaySnapshot['pricingCatalog']

export interface ConsoleGatewayCronSchedule {
  scheduleId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label: string
  promptPreview: string
  cronExpr: string
  timezone: 'local' | 'utc'
  allowedTools: string[]
  runtimeProfile?: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  lastError?: string
  cronGrant?: {
    mode?: string
    grantId?: string
    expiresAt?: string
    executionCount?: number
    maxExecutionCount?: number
    allowedTools: string[]
    lastDecision?: {
      decisionId: string
      state: string
      decidedAt: string
      reasons: string[]
    }
  }
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayCronRuntimeStatus {
  enabled: boolean
  running: boolean
  pollIntervalMs: number
  lastTickAt?: string
  lastError?: string
}

export interface ConsoleGatewayProvenanceReview {
  reviewId: string
  workspaceId: string
  kind: 'memory' | 'skill' | 'template'
  status: string
  source: string
  runId?: string
  agentId?: string
  actor?: string
  createdAt: string
  updatedAt: string
  mutation:
    | {
        kind: 'memory'
        scope: string
        tags: string[]
        textPreview: string
        sessionId?: string
      }
    | {
        kind: 'skill'
        action: string
        manifest: {
          key: string
          name: string
          description: string
          version: string
          source: string
          permissionSummary: string
        }
      }
    | {
        kind: 'template'
        summary: string
      }
  scan: {
    status: string
    contentHash: string
    findings: Array<{
      ruleId: string
      severity: string
      message: string
      evidence?: string
    }>
  }
  decision?: {
    decidedAt: string
    reviewer: string
    reason?: string
  }
}

export interface ConsoleGatewayUsageLedgerEntry {
  entryId: string
  runId: string
  sessionId: string
  workspaceId?: string
  providerId?: string
  modelId?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  createdAt: string
}

export interface ConsoleGatewayBudget {
  budgetId: string
  scopeType: LocalGatewayBudgetRecord['scopeType']
  scopeId: string
  label: string
  maxEstimatedCostUsd: number
  warnAtUsd: number
  status: LocalGatewayBudgetRecord['status']
  createdAt: string
  updatedAt: string
}

export interface ConsoleGatewayBudgetEvaluation {
  budgetId: string
  scopeType: LocalGatewayBudgetRecord['scopeType']
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

export interface ConsoleGatewayUsageSummary {
  entries: number
  pricedEntries: number
  unpricedEntries: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  providers: string[]
  models: string[]
}

export interface ConsoleGatewayUsageRollup {
  scopeType: LocalGatewayUsageRollup['scopeType']
  scopeId: string
  scopeLabel: string
  summary: ConsoleGatewayUsageSummary
}

export interface ConsoleGatewayUsageStatus {
  total: ConsoleGatewayUsageRollup
  clients: ConsoleGatewayUsageRollup[]
  workspaces: ConsoleGatewayUsageRollup[]
  agents: ConsoleGatewayUsageRollup[]
  unpricedEntries: number
  pricedEntries: number
  estimatedCostUsd: number
}

export interface ConsoleGatewayBudgetStatus {
  evaluations: ConsoleGatewayBudgetEvaluation[]
  blocked: number
  warnings: number
  usageStatus: ConsoleGatewayUsageStatus
}

export interface ConsoleGatewayAuditEvent {
  eventId: string
  category: string
  action: string
  actor: string
  targetType: string
  targetId: string
  runId?: string
  sessionId?: string
  createdAt: string
}

export interface ConsoleGatewayMemoryEntry {
  entryId: string
  workspaceId?: string
  sessionId?: string
  scope: 'workspace' | 'session'
  textPreview: string
  tags: string[]
  createdAt: string
}

export interface ConsoleGatewayMarketplaceInstall {
  template: ConsoleGatewayMarketplaceTemplate
  client: ConsoleGatewayClient
  workspace?: ConsoleGatewayWorkspace
  session?: ConsoleGatewaySession
  agent: ConsoleGatewayAgent
  installedFiles: string[]
}

export interface ConsoleGatewayMarketplaceTemplate {
  templateId: string
  label: string
  description: string
  trusted: true
  provenance: 'repo-examples' | 'signed-remote'
  publisherId?: string
  keyId?: string
  catalogHash?: string
  provenanceScanStatus?: 'pass' | 'review' | 'block'
  providerId?: string
  modelId?: string
  runtimeProfile?: string
  allowedTools: string[]
  approvalMode?: string
}

export interface ConsoleGatewaySnapshot {
  generatedAt: string
  executionBackends?: ConsoleExecutionBackendInventory
  health: Pick<RuntimeHealth, 'ok' | 'running' | 'activeSessions'> & {
    lastError?: string
  }
  counts: {
    clients: number
    workspaces: number
    agents: number
    providerProfiles: number
    sessions: number
    runs: number
    storedApprovals: number
    artifacts: number
    cronSchedules?: number
    budgets?: number
    usageLedgerEntries: number
    auditEvents: number
    memoryEntries: number
    pendingApprovals: number
    runLogRuns?: number
    runLogPendingApprovals?: number
  }
  clients: ConsoleGatewayClient[]
  workspaces: ConsoleGatewayWorkspace[]
  agents: ConsoleGatewayAgent[]
  providerProfiles: ConsoleGatewayProviderProfile[]
  sessions: ConsoleGatewaySession[]
  runs: ConsoleGatewayRun[]
  approvals: ConsoleGatewayApproval[]
  runLog?: ConsoleGatewayRunLogSnapshot
  approvalMetadata: ConsoleGatewayApprovalMetadata[]
  artifacts: ConsoleGatewayArtifact[]
  toolCalls?: ConsoleGatewayToolCall[]
  deploymentTargets?: ConsoleGatewayDeploymentTarget[]
  deploymentRuns?: ConsoleGatewayDeploymentRun[]
  cells?: ConsoleGatewayCell[]
  cellLeases?: ConsoleGatewayCellLease[]
  cellSnapshots?: ConsoleGatewayCellSnapshot[]
  cellStatus?: ConsoleGatewayCellStatus
  pricingCatalog?: ConsoleGatewayPricingCatalogStatus
  usageStatus?: ConsoleGatewayUsageStatus
  cronSchedules?: ConsoleGatewayCronSchedule[]
  budgets?: ConsoleGatewayBudget[]
  budgetEvaluations?: ConsoleGatewayBudgetEvaluation[]
  usageLedger: ConsoleGatewayUsageLedgerEntry[]
  auditEvents: ConsoleGatewayAuditEvent[]
  memoryEntries: ConsoleGatewayMemoryEntry[]
}

export function gatewaySnapshotToConsoleState(
  snapshot: LocalGatewaySnapshot,
): ConsoleGatewaySnapshot {
  const clients = snapshot.appState.clients.map(consoleClient)
  const workspaces = snapshot.appState.workspaces.map(consoleWorkspace)
  const agents = snapshot.appState.agents.map(consoleAgent)
  const providerProfiles = snapshot.appState.providerProfiles.map(consoleProviderProfile)
  const sessions = snapshot.sessions.map(consoleSession)
  const runs = snapshot.runs.map(consoleRun)
  const approvals = snapshot.approvals.map(consoleApproval)
  const runLog = snapshot.runLog ? consoleRunLogSnapshot(snapshot.runLog) : undefined
  const approvalMetadata = snapshot.appState.approvals.map(consoleApprovalMetadata)
  const artifacts = snapshot.appState.artifacts.map(consoleArtifact)
  const toolCalls = (snapshot.appState.toolCalls ?? []).map(consoleToolCall)
  const deploymentTargets = (snapshot.appState.deploymentTargets ?? []).map(consoleDeploymentTarget)
  const deploymentRuns = (snapshot.appState.deploymentRuns ?? []).map(consoleDeploymentRun)
  const cells = (snapshot.appState.cells ?? []).map(consoleCell)
  const cellLeases = (snapshot.appState.cellLeases ?? []).map(consoleCellLease)
  const cellSnapshots = (snapshot.appState.cellSnapshots ?? []).map(consoleCellSnapshot)
  const cronSchedules = (snapshot.appState.cronSchedules ?? []).map(consoleCronSchedule)
  const budgets = (snapshot.appState.budgets ?? []).map(consoleBudget)
  const budgetEvaluations = (snapshot.budgetStatus?.evaluations ?? []).map(consoleBudgetEvaluation)
  const usageLedger = snapshot.appState.usageLedger.map(consoleUsageLedgerEntry)
  const auditEvents = snapshot.appState.auditEvents.map(consoleAuditEvent)
  const memoryEntries = consoleMemoryEntries(snapshot)

  return {
    generatedAt: snapshot.generatedAt,
    executionBackends: consoleExecutionBackends(snapshot.executionBackends),
    health: {
      ok: snapshot.health.ok,
      running: snapshot.health.running,
      activeSessions: snapshot.health.activeSessions,
      ...(snapshot.health.lastError ? { lastError: snapshot.health.lastError } : {}),
    },
    counts: {
      clients: clients.length,
      workspaces: workspaces.length,
      agents: agents.length,
      providerProfiles: providerProfiles.length,
      sessions: sessions.length,
      runs: runs.length,
      storedApprovals: approvalMetadata.length,
      artifacts: artifacts.length,
      cronSchedules: cronSchedules.length,
      budgets: budgets.length,
      usageLedgerEntries: usageLedger.length,
      auditEvents: auditEvents.length,
      memoryEntries: memoryEntries.length,
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
      ...(runLog
        ? {
            runLogRuns: runLog.runs.length,
            runLogPendingApprovals: runLog.runs.reduce(
              (total, run) => total + run.pendingApprovalCount,
              0,
            ),
          }
        : {}),
    },
    clients,
    workspaces,
    agents,
    providerProfiles,
    sessions,
    runs,
    approvals,
    ...(runLog ? { runLog } : {}),
    approvalMetadata,
    artifacts,
    toolCalls,
    deploymentTargets,
    deploymentRuns,
    cells,
    cellLeases,
    cellSnapshots,
    cellStatus: consoleCellStatus(snapshot.cellStatus),
    pricingCatalog: snapshot.pricingCatalog,
    usageStatus: consoleUsageStatus(snapshot.usageStatus),
    cronSchedules,
    budgets,
    budgetEvaluations,
    usageLedger,
    auditEvents,
    memoryEntries,
  }
}

function consoleExecutionBackends(
  inventory: LocalGatewaySnapshot['executionBackends'] | undefined,
): ConsoleExecutionBackendInventory | undefined {
  if (!inventory) return undefined
  return {
    defaultBackend: inventory.defaultBackend,
    backends: inventory.backends.map((backend) => ({
      key: backend.key,
      label: browserSafePreviewText(backend.label),
      available: backend.available,
      unsafe: backend.unsafe,
      ...(backend.reason ? { reason: browserSafePreviewText(backend.reason) } : {}),
      ...(consoleBackendCapabilities(backend.capabilities)
        ? { capabilities: consoleBackendCapabilities(backend.capabilities) }
        : {}),
    })),
  }
}

export function gatewaySnapshotToExecutionBackendStatus(
  snapshot: LocalGatewaySnapshot,
): ConsoleExecutionBackendStatus {
  const consoleSnapshot = gatewaySnapshotToConsoleState(snapshot)
  const cells = consoleSnapshot.cells ?? []
  const leases = consoleSnapshot.cellLeases ?? []
  const snapshots = consoleSnapshot.cellSnapshots ?? []
  return {
    generatedAt: consoleSnapshot.generatedAt,
    defaultBackend: consoleSnapshot.executionBackends?.defaultBackend ?? 'host',
    backends: (consoleSnapshot.executionBackends?.backends ?? []).map((backend) => {
      const matchingCells = cells.filter((cell) => cell.backend?.backend === backend.key)
      const matchingCellIds = new Set(matchingCells.map((cell) => cell.cellId))
      const matchingLeases = leases.filter((lease) =>
        lease.backend?.backend === backend.key || matchingCellIds.has(lease.cellId),
      )
      const matchingSnapshots = snapshots.filter((snapshotRecord) =>
        snapshotRecord.backend?.backend === backend.key
        || matchingCellIds.has(snapshotRecord.cellId)
        || (snapshotRecord.leaseId
          ? matchingLeases.some((lease) => lease.leaseId === snapshotRecord.leaseId)
          : false),
      )
      const capabilities =
        consoleBackendCapabilities(backend.capabilities)
        ?? matchingCells.find((cell) => cell.backend?.backendCapabilities)?.backend?.backendCapabilities
        ?? matchingLeases.find((lease) => lease.backend?.backendCapabilities)?.backend?.backendCapabilities
        ?? matchingSnapshots.find((snapshotRecord) => snapshotRecord.backend?.backendCapabilities)?.backend?.backendCapabilities
        ?? {}
      return {
        key: backend.key,
        label: backend.label,
        available: backend.available,
        unsafe: backend.unsafe,
        ...(backend.reason ? { reason: backend.reason } : {}),
        capabilities,
        observedCells: matchingCells.length,
        activeLeases: matchingLeases.filter((lease) => lease.status === 'active').length,
        ...(latestBy(matchingCells, (cell) => cell.updatedAt) ? { latestCell: latestBy(matchingCells, (cell) => cell.updatedAt) } : {}),
        ...(latestBy(matchingLeases, (lease) => lease.updatedAt) ? { latestLease: latestBy(matchingLeases, (lease) => lease.updatedAt) } : {}),
        ...(latestBy(matchingSnapshots, (snapshotRecord) => snapshotRecord.createdAt)
          ? { latestSnapshot: latestBy(matchingSnapshots, (snapshotRecord) => snapshotRecord.createdAt) }
          : {}),
      }
    }),
  }
}

function latestBy<T>(items: T[], getTimestamp: (item: T) => string): T | undefined {
  return [...items].sort((left, right) =>
    getTimestamp(right).localeCompare(getTimestamp(left)),
  )[0]
}

function consoleRunLogSnapshot(
  snapshot: NonNullable<LocalGatewaySnapshot['runLog']>,
): ConsoleGatewayRunLogSnapshot {
  return {
    configured: snapshot.configured,
    worker: snapshot.worker,
    runs: snapshot.runs.map(consoleRunLogRun),
  }
}

/**
 * Projects one canonical RunLog row for bounded activity endpoints without
 * materializing the broader console snapshot.
 */
export function consoleRunLogRun(run: LocalGatewayRunLogRunProjection): ConsoleGatewayRunLogRun {
  return {
    runId: run.runId,
    sessionId: run.sessionId,
    agentId: browserSafePreviewText(run.agentId),
    status: run.status,
    ...(run.workspaceId ? { workspaceId: run.workspaceId } : {}),
    ...(run.providerId ? { providerId: browserSafePreviewText(run.providerId) } : {}),
    ...(run.modelId ? { modelId: browserSafePreviewText(run.modelId) } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.assistantText ? { assistantText: browserSafePreviewText(run.assistantText) } : {}),
    latestSeq: run.latestSeq,
    eventCount: run.eventCount,
    ...(run.lastEventType ? { lastEventType: browserSafePreviewText(run.lastEventType) } : {}),
    pendingApprovalCount: run.pendingApprovals.length,
    approvalDecisionCount: run.approvalDecisions.length,
    toolCallCount: run.toolCalls.length,
    checkpointCount: run.checkpoints.length,
    policyDecisionCount: run.policyDecisions.length,
    errorCount: run.errors.length,
    pendingApprovals: run.pendingApprovals.map((approval) => ({
      ...(approval.approvalId ? { approvalId: browserSafePreviewText(approval.approvalId) } : {}),
      ...(approval.toolCallId ? { toolCallId: browserSafePreviewText(approval.toolCallId) } : {}),
    })),
    toolCalls: run.toolCalls.map((call) => ({
      ...(call.toolCallId ? { toolCallId: browserSafePreviewText(call.toolCallId) } : {}),
      ...(call.name ? { name: browserSafePreviewText(call.name) } : {}),
      status: call.status,
    })),
    checkpoints: run.checkpoints.map((checkpoint) => ({
      eventId: browserSafePreviewText(checkpoint.eventId),
      seq: checkpoint.seq,
      ...(checkpoint.kind ? { kind: browserSafePreviewText(checkpoint.kind) } : {}),
    })),
    policyDecisions: run.policyDecisions.map((decision) => ({
      decisionId: browserSafePreviewText(decision.decisionId),
      state: browserSafePreviewText(decision.state),
      surface: browserSafePreviewText(decision.surface),
      targetKey: browserSafePreviewText(decision.targetKey),
      ...(decision.toolCallId ? { toolCallId: browserSafePreviewText(decision.toolCallId) } : {}),
    })),
    errors: run.errors.map((error) => ({
      eventId: browserSafePreviewText(error.eventId),
      seq: error.seq,
      type: error.type,
      ...(error.message ? { message: browserSafePreviewText(error.message) } : {}),
    })),
  }
}

function consoleMemoryEntries(snapshot: LocalGatewaySnapshot): ConsoleGatewayMemoryEntry[] {
  return snapshot.appState.workspaces.flatMap((workspace) => {
    try {
      return listStoredMemoryEntries(workspace.root).map((entry) => ({
        entryId: entry.entryId,
        workspaceId: workspace.workspaceId,
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        scope: entry.scope,
        textPreview: memoryPreview(entry.text),
        tags: entry.tags.map(browserSafePreviewText),
        createdAt: entry.createdAt,
      }))
    } catch {
      return []
    }
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function memoryPreview(text: string): string {
  const sanitized = browserSafePreviewText(text)
  return sanitized.length <= 140 ? sanitized : `${sanitized.slice(0, 137)}...`
}

export function consoleClient(record: LocalGatewayClientRecord): ConsoleGatewayClient {
  const metadata =
    record.metadata && typeof record.metadata === 'object' ? record.metadata : undefined
  return {
    clientId: record.clientId,
    name: browserSafePreviewText(record.name),
    ...(typeof metadata?.contact === 'string'
      ? { contact: browserSafePreviewText(metadata.contact) }
      : {}),
    ...(typeof metadata?.billingLabel === 'string'
      ? { billingLabel: browserSafePreviewText(metadata.billingLabel) }
      : {}),
    status: record.status,
  }
}

export function consoleWorkspace(record: LocalGatewayWorkspaceRecord): ConsoleGatewayWorkspace {
  return {
    workspaceId: record.workspaceId,
    ...(record.clientId ? { clientId: record.clientId } : {}),
    name: browserSafePreviewText(record.name),
    status: record.status,
  }
}

export function consoleAgent(record: LocalGatewayAgentRecord): ConsoleGatewayAgent {
  const metadata =
    record.metadata && typeof record.metadata === 'object' ? record.metadata : undefined
  return {
    agentId: record.agentId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    name: browserSafePreviewText(record.name),
    version: browserSafePreviewText(record.version),
    ...(record.defaultModelId ? { defaultModelId: browserSafePreviewText(record.defaultModelId) } : {}),
    ...(typeof metadata?.instructions === 'string'
      ? { instructions: browserSafePreviewText(metadata.instructions) }
      : {}),
    ...(typeof metadata?.outcome === 'string' ? { outcome: browserSafePreviewText(metadata.outcome) } : {}),
    ...(typeof metadata?.voice === 'string' ? { voice: browserSafePreviewText(metadata.voice) } : {}),
    ...(typeof metadata?.approvalMode === 'string'
      ? { approvalMode: browserSafePreviewText(metadata.approvalMode) }
      : {}),
    ...(typeof metadata?.modelLabel === 'string' ? { modelLabel: browserSafePreviewText(metadata.modelLabel) } : {}),
    ...(metadata?.skills && typeof metadata.skills === 'object' && !Array.isArray(metadata.skills)
      ? { skills: metadata.skills as Record<string, boolean> }
      : {}),
    status: record.status,
  }
}

export function consoleProviderProfile(
  record: LocalGatewayProviderProfileRecord,
): ConsoleGatewayProviderProfile {
  return {
    profileId: record.profileId,
    providerId: browserSafePreviewText(record.providerId),
    label: browserSafePreviewText(record.label),
    status: record.status,
    ...(record.defaultModelId ? { defaultModelId: browserSafePreviewText(record.defaultModelId) } : {}),
    credentialState: resolveCredentialState(record),
  }
}

function resolveCredentialState(
  record: LocalGatewayProviderProfileRecord,
): ConsoleGatewayProviderProfile['credentialState'] {
  const secretRef = record.secretRef
  const trimmed = secretRef.trim()
  if (!trimmed) return 'missing'
  if (trimmed.startsWith('env:')) {
    const envKey = trimmed.slice(4).trim()
    if (!envKey) return 'missing'
    return process.env[envKey]?.trim() ? 'configured' : 'missing'
  }
  if (trimmed.startsWith('managed:')) {
    return record.managedSecretStored ? 'configured' : 'missing'
  }
  return 'unavailable'
}

export function consoleSession(record: LocalGatewaySessionProjection): ConsoleGatewaySession {
  const metadata =
    record.metadata && typeof record.metadata === 'object' ? record.metadata : undefined
  return {
    sessionId: record.sessionId,
    status: record.status,
    ...(typeof metadata?.clientId === 'string' ? { clientId: metadata.clientId } : {}),
    ...(typeof metadata?.workspaceId === 'string' ? { workspaceId: metadata.workspaceId } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function consoleRun(record: LocalGatewayRunProjection): ConsoleGatewayRun {
  return {
    runId: record.runId,
    sessionId: record.sessionId,
    status: record.status,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.computerId ? { computerId: browserSafePreviewText(record.computerId) } : {}),
    ...(record.providerProfileId ? { providerProfileId: record.providerProfileId } : {}),
    ...(record.providerId ? { providerId: browserSafePreviewText(record.providerId) } : {}),
    ...(record.modelId ? { modelId: browserSafePreviewText(record.modelId) } : {}),
    ...(record.modelFamily ? { modelFamily: browserSafePreviewText(record.modelFamily) } : {}),
    ...(record.providerTransport ? { providerTransport: browserSafePreviewText(record.providerTransport) } : {}),
    ...(record.providerSessionId
      ? { providerSessionId: browserSafePreviewText(record.providerSessionId) }
      : {}),
    ...(record.createdAt ? { createdAt: record.createdAt } : {}),
    ...(record.lastEventAt ? { lastEventAt: record.lastEventAt } : {}),
    eventCount: record.eventCount,
    pendingInboundCount: record.pendingInboundCount,
  }
}

export function consoleRunDispatch(record: RunRecord | RunLogRunRecord): ConsoleGatewayRunDispatch {
  return {
    runId: record.runId,
    sessionId: record.sessionId,
    status: record.status,
    ...(record.createdAt ? { createdAt: record.createdAt } : {}),
  }
}

export function consoleRunEvent(event: RunEvent): ConsoleGatewayRunEvent {
  return {
    type: event.type,
    runId: event.runId,
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    ...(typeof event.seq === 'number' ? { seq: event.seq } : {}),
    ...(event.payload !== undefined ? { payload: browserSafeJsonValue(event.payload) } : {}),
  }
}

function consoleApproval(
  record: LocalGatewaySnapshot['approvals'][number],
): ConsoleGatewayApproval {
  return {
    approvalId: record.approvalId,
    runId: record.runId,
    sessionId: record.sessionId,
    status: record.status,
    requestedAt: record.requestedAt,
    ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
    ...(record.targetKey ? { targetKey: browserSafePreviewText(record.targetKey) } : {}),
  }
}

function consoleApprovalMetadata(
  record: LocalGatewayApprovalMetadataRecord,
): ConsoleGatewayApprovalMetadata {
  return {
    approvalId: record.approvalId,
    runId: record.runId,
    sessionId: record.sessionId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.agentId ? { agentId: record.agentId } : {}),
    status: record.status,
    ...(record.targetKey ? { targetKey: browserSafePreviewText(record.targetKey) } : {}),
    requestedAt: record.requestedAt,
    ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
  }
}

function consoleArtifact(record: LocalGatewayArtifactRecord): ConsoleGatewayArtifact {
  return {
    artifactId: record.artifactId,
    runId: record.runId,
    sessionId: record.sessionId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    kind: browserSafePreviewText(record.kind),
    ...(record.label ? { label: browserSafePreviewText(record.label) } : {}),
    ...(record.mediaType ? { mediaType: browserSafePreviewText(record.mediaType) } : {}),
    ...(typeof record.sizeBytes === 'number' ? { sizeBytes: record.sizeBytes } : {}),
    createdAt: record.createdAt,
  }
}

function consoleToolCall(record: LocalGatewayToolCallRecord): ConsoleGatewayToolCall {
  return {
    toolCallId: record.toolCallId,
    runId: record.runId,
    sessionId: record.sessionId,
    toolName: browserSafePreviewText(record.toolName),
    status: record.status,
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function consoleMarketplaceInstall(
  result: InstallLocalMarketplaceTemplateResult,
): ConsoleGatewayMarketplaceInstall {
  return {
    template: consoleMarketplaceTemplate(result.template),
    client: consoleClient(result.client),
    ...(result.workspace ? { workspace: consoleWorkspace(result.workspace) } : {}),
    ...(result.session ? { session: consoleSession(result.session) } : {}),
    agent: consoleAgent(result.agent),
    installedFiles: [...result.installedFiles],
  }
}

export function consoleMarketplaceTemplate(
  template: MarketplaceTemplateRecord,
): ConsoleGatewayMarketplaceTemplate {
  return {
    templateId: template.templateId,
    label: browserSafePreviewText(template.label),
    description: browserSafePreviewText(template.description),
    trusted: true,
    provenance: template.provenance,
    ...('publisherId' in template ? { publisherId: browserSafePreviewText(template.publisherId) } : {}),
    ...('keyId' in template ? { keyId: browserSafePreviewText(template.keyId) } : {}),
    ...('catalogHash' in template ? { catalogHash: template.catalogHash } : {}),
    ...('scan' in template ? { provenanceScanStatus: template.scan.status } : {}),
    ...(template.providerId ? { providerId: browserSafePreviewText(template.providerId) } : {}),
    ...(template.modelId ? { modelId: browserSafePreviewText(template.modelId) } : {}),
    ...(template.runtimeProfile ? { runtimeProfile: template.runtimeProfile } : {}),
    allowedTools: template.allowedTools.map(browserSafePreviewText),
    ...(template.approvalMode ? { approvalMode: browserSafePreviewText(template.approvalMode) } : {}),
  }
}

export function consoleDeploymentTarget(
  record: LocalGatewayDeploymentTargetRecord,
): ConsoleGatewayDeploymentTarget {
  const support = consoleDeploymentTargetSupport(record)
  return {
    targetId: record.targetId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    label: browserSafePreviewText(record.label),
    kind: record.kind,
    status: record.status,
    executionSupported: support.executionSupported,
    executionMode: browserSafePreviewText(support.executionMode),
    ...(support.executionUnavailableReason
      ? { executionUnavailableReason: browserSafePreviewText(support.executionUnavailableReason) }
      : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function consoleDeploymentTargetSupport(
  record: LocalGatewayDeploymentTargetRecord,
): {
  executionSupported: boolean
  executionMode: string
  executionUnavailableReason?: string
} {
  const metadata = metadataRecord(record.metadata)
  const driver = metadataRecord(metadata?.deploymentDriver)
  if (driver) {
    const executionMode = metadataText(driver.executionMode)
    return {
      executionSupported: driver.executionSupported === true,
      executionMode: executionMode ?? 'metadata-only',
      ...(metadataText(driver.executionUnavailableReason)
        ? { executionUnavailableReason: metadataText(driver.executionUnavailableReason) }
        : {}),
    }
  }
  return deploymentTargetSupport(record)
}

export function consoleDeploymentRun(
  record: LocalGatewayDeploymentRunRecord,
): ConsoleGatewayDeploymentRun {
  return {
    deploymentRunId: record.deploymentRunId,
    targetId: record.targetId,
    ...(record.runId ? { runId: record.runId } : {}),
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function consoleDeploymentPlan(
  plan: LocalGatewayDeploymentPlan,
): ConsoleGatewayDeploymentPlan {
  return {
    operation: plan.operation,
    targetId: plan.targetId,
    targetLabel: browserSafePreviewText(plan.targetLabel),
    targetKind: plan.targetKind,
    summary: browserSafePreviewText(plan.summary),
    prerequisites: plan.prerequisites.map(browserSafePreviewText),
    warnings: plan.warnings.map(browserSafePreviewText),
    steps: plan.steps.map((step) => ({
      phase: step.phase,
      label: browserSafePreviewText(step.label),
      commandPreview: browserSafePreviewText(step.command),
    })),
    ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
    ...(plan.rollbackReleaseId ? { rollbackReleaseId: plan.rollbackReleaseId } : {}),
  }
}

export function consoleDeploymentExecution(
  result: LocalGatewayDeploymentExecutionResult,
): ConsoleGatewayDeploymentExecutionResult {
  return {
    deploymentRun: consoleDeploymentRun(result.deploymentRun),
    plan: consoleDeploymentPlan(result.plan),
    execution: {
      ok: result.execution.ok,
      exitCode: result.execution.exitCode,
      startedAt: result.execution.startedAt,
      completedAt: result.execution.completedAt,
      detail: browserSafePreviewText(result.execution.detail),
    },
  }
}

function consoleCell(record: LocalGatewayCellRecord): ConsoleGatewayCell {
  return {
    cellId: record.cellId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    label: browserSafePreviewText(record.label),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(consoleBackendSummary(record.metadata) ? { backend: consoleBackendSummary(record.metadata) } : {}),
  }
}

function consoleCellLease(record: LocalGatewayCellLeaseRecord): ConsoleGatewayCellLease {
  return {
    leaseId: record.leaseId,
    cellId: record.cellId,
    ...(record.runId ? { runId: record.runId } : {}),
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(consoleBackendSummary(record.metadata) ? { backend: consoleBackendSummary(record.metadata) } : {}),
  }
}

function consoleCellSnapshot(record: LocalGatewayCellSnapshotRecord): ConsoleGatewayCellSnapshot {
  return {
    snapshotId: record.snapshotId,
    cellId: record.cellId,
    ...(record.leaseId ? { leaseId: record.leaseId } : {}),
    label: browserSafePreviewText(record.label),
    createdAt: record.createdAt,
    ...(consoleBackendSummary(record.metadata) ? { backend: consoleBackendSummary(record.metadata) } : {}),
  }
}

export function consoleCellStatus(
  status: LocalGatewayCellStatus | undefined,
): ConsoleGatewayCellStatus {
  if (!status) return emptyConsoleCellStatus()
  return {
    enabled: status.enabled,
    leaseTtlMs: status.leaseTtlMs,
    capacityEnforced: status.capacityEnforced,
    ...('maxActiveLeasesPerCell' in status && status.maxActiveLeasesPerCell !== undefined
      ? { maxActiveLeasesPerCell: status.maxActiveLeasesPerCell }
      : {}),
    cells: status.cells,
    leases: {
      active: status.leases.active,
      released: status.leases.released,
      expired: status.leases.expired,
      total: status.leases.total,
    },
    ...('lastCapacityBlock' in status && status.lastCapacityBlock
      ? { lastCapacityBlock: consoleCellCapacityBlock(status.lastCapacityBlock) }
      : {}),
    cellStatuses: status.cellStatuses.map((cellStatus) => ({
      cellId: cellStatus.cellId,
      ...(cellStatus.workspaceId ? { workspaceId: cellStatus.workspaceId } : {}),
      label: browserSafePreviewText(cellStatus.label),
      status: cellStatus.status,
      activeLeases: cellStatus.activeLeases,
      releasedLeases: cellStatus.releasedLeases,
      expiredLeases: cellStatus.expiredLeases,
      ...(cellStatus.maxActiveLeases !== undefined
        ? { maxActiveLeases: cellStatus.maxActiveLeases }
        : {}),
      ...(cellStatus.capacityAvailable !== undefined
        ? { capacityAvailable: cellStatus.capacityAvailable }
        : {}),
      ...(cellStatus.lastCapacityBlock
        ? { lastCapacityBlock: consoleCellCapacityBlock(cellStatus.lastCapacityBlock) }
        : {}),
    })),
  }
}

function emptyConsoleCellStatus(): ConsoleGatewayCellStatus {
  return {
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

function consoleCellCapacityBlock(
  block: {
    cellId: string
    workspaceId?: string
    requestedComputerId: string
    backend: string
    activeLeases: number
    maxActiveLeases: number
    blockedAt: string
  },
): ConsoleGatewayCellCapacityBlock {
  return {
    cellId: block.cellId,
    ...(block.workspaceId ? { workspaceId: block.workspaceId } : {}),
    requestedComputerId: browserSafePreviewText(block.requestedComputerId),
    backend: browserSafePreviewText(block.backend),
    activeLeases: block.activeLeases,
    maxActiveLeases: block.maxActiveLeases,
    blockedAt: block.blockedAt,
  }
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function metadataText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function metadataStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function consoleBackendCapabilities(value: unknown): ConsoleGatewayBackendCapabilities | undefined {
  const record = metadataRecord(value)
  if (!record) return undefined
  const capabilities: ConsoleGatewayBackendCapabilities = {}
  for (const key of [
    'isolationKind',
    'isolationStrength',
    'securityBoundary',
    'networkPolicy',
    'workspaceMapping',
  ] as const) {
    const text = metadataText(record[key])
    if (text) capabilities[key] = browserSafePreviewText(text)
  }
  if (typeof record.requiresApproval === 'boolean') {
    capabilities.requiresApproval = record.requiresApproval
  }
  if (typeof record.unsafeFallback === 'boolean') {
    capabilities.unsafeFallback = record.unsafeFallback
  }
  const limits = metadataStringList(record.limits)
  if (limits.length > 0) capabilities.limits = limits.map(browserSafePreviewText)
  return Object.keys(capabilities).length > 0 ? capabilities : undefined
}

function consoleBackendSummary(metadata: unknown): ConsoleGatewayBackendSummary | undefined {
  const record = metadataRecord(metadata)
  if (!record) return undefined
  const backend = metadataText(record.backend)
  const backendLabel = metadataText(record.backendLabel)
  const backendUnsafe = typeof record.backendUnsafe === 'boolean' ? record.backendUnsafe : undefined
  const backendCapabilities = consoleBackendCapabilities(record.backendCapabilities)
  if (!backend && !backendLabel && backendUnsafe === undefined && !backendCapabilities) return undefined
  return {
    ...(backend ? { backend } : {}),
    ...(backendLabel ? { backendLabel: browserSafePreviewText(backendLabel) } : {}),
    ...(backendUnsafe !== undefined ? { backendUnsafe } : {}),
    ...(backendCapabilities ? { backendCapabilities } : {}),
  }
}

export function consoleCronSchedule(record: LocalGatewayCronScheduleRecord): ConsoleGatewayCronSchedule {
  const prompt = browserSafePreviewText(record.prompt)
  const cronGrant = consoleCronGrant(record.metadata)
  return {
    scheduleId: record.scheduleId,
    sessionId: record.sessionId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.providerProfileId ? { providerProfileId: record.providerProfileId } : {}),
    ...(record.computerId ? { computerId: browserSafePreviewText(record.computerId) } : {}),
    label: browserSafePreviewText(record.label),
    promptPreview: prompt.length <= 140 ? prompt : `${prompt.slice(0, 137)}...`,
    cronExpr: record.cronExpr,
    timezone: record.timezone,
    allowedTools: record.allowedTools.map(browserSafePreviewText),
    ...(record.runtimeProfile ? { runtimeProfile: record.runtimeProfile } : {}),
    enabled: record.enabled,
    ...(record.lastRunAt ? { lastRunAt: record.lastRunAt } : {}),
    ...(record.nextRunAt ? { nextRunAt: record.nextRunAt } : {}),
    ...(record.lastError ? { lastError: browserSafePreviewText(record.lastError) } : {}),
    ...(cronGrant ? { cronGrant } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function consoleCronGrant(
  metadata: LocalGatewayCronScheduleRecord['metadata'],
): ConsoleGatewayCronSchedule['cronGrant'] | undefined {
  const cronMetadata = metadata as RunLogCronPolicyMetadata | undefined
  const grant = cronMetadata?.cronGrant
  const lastDecision = cronMetadata?.lastDecision
  if (!grant && !lastDecision && !cronMetadata?.cronMode) return undefined
  return {
    ...(cronMetadata?.cronMode ? { mode: browserSafePreviewText(cronMetadata.cronMode) } : {}),
    ...(grant
      ? {
          grantId: browserSafePreviewText(grant.grantId),
          expiresAt: grant.expiresAt,
          executionCount: grant.executionCount,
          maxExecutionCount: grant.maxExecutionCount,
          allowedTools: grant.allowedTools.map(browserSafePreviewText),
        }
      : { allowedTools: [] }),
    ...(lastDecision
      ? {
          lastDecision: {
            decisionId: browserSafePreviewText(lastDecision.decisionId),
            state: browserSafePreviewText(lastDecision.state),
            decidedAt: lastDecision.decidedAt,
            reasons: lastDecision.reasons.map(browserSafePreviewText),
          },
        }
      : {}),
  }
}

export function consoleCronRuntimeStatus(
  record: LocalGatewayCronStatus,
): ConsoleGatewayCronRuntimeStatus {
  return {
    enabled: record.enabled,
    running: record.running,
    pollIntervalMs: record.pollIntervalMs,
    ...(record.lastTickAt ? { lastTickAt: record.lastTickAt } : {}),
    ...(record.lastError ? { lastError: browserSafePreviewText(record.lastError) } : {}),
  }
}

export function consoleProvenanceReview(input: {
  workspaceId: string
  item: ProvenanceReviewItem
}): ConsoleGatewayProvenanceReview {
  return {
    reviewId: browserSafePreviewText(input.item.reviewId),
    workspaceId: input.workspaceId,
    kind: input.item.kind,
    status: browserSafePreviewText(input.item.status),
    source: browserSafePreviewText(input.item.source),
    ...(input.item.runId ? { runId: browserSafePreviewText(input.item.runId) } : {}),
    ...(input.item.agentId ? { agentId: browserSafePreviewText(input.item.agentId) } : {}),
    ...(input.item.actor ? { actor: browserSafePreviewText(input.item.actor) } : {}),
    createdAt: input.item.createdAt,
    updatedAt: input.item.updatedAt,
    mutation: consoleProvenanceMutation(input.item.mutation),
    scan: {
      status: browserSafePreviewText(input.item.scan.status),
      contentHash: browserSafePreviewText(input.item.scan.contentHash),
      findings: input.item.scan.findings.map((finding) => ({
        ruleId: browserSafePreviewText(finding.ruleId),
        severity: browserSafePreviewText(finding.severity),
        message: browserSafePreviewText(finding.message),
        ...(finding.evidence ? { evidence: browserSafePreviewText(finding.evidence) } : {}),
      })),
    },
    ...(input.item.decision
      ? {
          decision: {
            decidedAt: input.item.decision.decidedAt,
            reviewer: browserSafePreviewText(input.item.decision.reviewer),
            ...(input.item.decision.reason
              ? { reason: browserSafePreviewText(input.item.decision.reason) }
              : {}),
          },
        }
      : {}),
  }
}

function consoleProvenanceMutation(
  mutation: ProvenanceReviewItem['mutation'],
): ConsoleGatewayProvenanceReview['mutation'] {
  if (mutation.kind === 'memory') {
    return {
      kind: 'memory',
      scope: browserSafePreviewText(mutation.scope),
      tags: mutation.tags.map(browserSafePreviewText),
      textPreview: browserSafePreviewText(mutation.text),
      ...(mutation.sessionId ? { sessionId: browserSafePreviewText(mutation.sessionId) } : {}),
    }
  }
  if (mutation.kind === 'skill') {
    const permissions = mutation.manifest.permissions
    const permissionSummary = [
      permissions.filesystem ? `fs:${permissions.filesystem}` : undefined,
      permissions.network ? `net:${permissions.network}` : undefined,
      permissions.shell ? 'shell' : undefined,
      permissions.secrets?.length ? `secrets:${permissions.secrets.length}` : undefined,
    ].filter((value): value is string => Boolean(value)).join(', ') || 'none'
    return {
      kind: 'skill',
      action: browserSafePreviewText(mutation.action),
      manifest: {
        key: browserSafePreviewText(mutation.manifest.key),
        name: browserSafePreviewText(mutation.manifest.name),
        description: browserSafePreviewText(mutation.manifest.description),
        version: browserSafePreviewText(mutation.manifest.version),
        source: browserSafePreviewText(mutation.manifest.source),
        permissionSummary: browserSafePreviewText(permissionSummary),
      },
    }
  }
  return {
    kind: 'template',
    summary: 'Template review item',
  }
}

function browserSafePreviewText(value: unknown): string {
  return redactBrowserUnsafeGatewayText(String(sanitizeRuntimeResponse(value)))
    .replace(/\s+/g, ' ')
    .trim()
}

function browserSafeJsonValue(value: unknown): unknown {
  const sanitized = sanitizeRuntimeResponse(value)
  if (typeof sanitized === 'string') return browserSafePreviewText(sanitized)
  if (Array.isArray(sanitized)) return sanitized.map(browserSafeJsonValue)
  if (!sanitized || typeof sanitized !== 'object') return sanitized
  return Object.fromEntries(
    Object.entries(sanitized as Record<string, unknown>).map(([key, nested]) => [
      key,
      browserSafeJsonValue(nested),
    ]),
  )
}

function consoleUsageLedgerEntry(
  record: LocalGatewayUsageLedgerEntryRecord,
): ConsoleGatewayUsageLedgerEntry {
  return {
    entryId: record.entryId,
    runId: record.runId,
    sessionId: record.sessionId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.providerId ? { providerId: browserSafePreviewText(record.providerId) } : {}),
    ...(record.modelId ? { modelId: browserSafePreviewText(record.modelId) } : {}),
    ...(typeof record.inputTokens === 'number' ? { inputTokens: record.inputTokens } : {}),
    ...(typeof record.outputTokens === 'number' ? { outputTokens: record.outputTokens } : {}),
    ...(typeof record.totalTokens === 'number' ? { totalTokens: record.totalTokens } : {}),
    ...(typeof record.estimatedCostUsd === 'number'
      ? { estimatedCostUsd: record.estimatedCostUsd }
      : {}),
    createdAt: record.createdAt,
  }
}

export function consoleBudget(record: LocalGatewayBudgetRecord): ConsoleGatewayBudget {
  return {
    budgetId: record.budgetId,
    scopeType: record.scopeType,
    scopeId: record.scopeId,
    label: browserSafePreviewText(record.label),
    maxEstimatedCostUsd: record.maxEstimatedCostUsd,
    warnAtUsd: record.warnAtUsd,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function consoleBudgetStatus(
  status: LocalGatewayBudgetStatus,
): ConsoleGatewayBudgetStatus {
  const evaluations = status.evaluations.map(consoleBudgetEvaluation)
  return {
    evaluations,
    blocked: evaluations.filter((evaluation) => evaluation.status === 'blocked').length,
    warnings: evaluations.filter((evaluation) => evaluation.status === 'warn').length,
    usageStatus: consoleUsageStatus(status.usageStatus),
  }
}

export function consoleUsageStatus(
  status: LocalGatewayUsageStatus | undefined,
): ConsoleGatewayUsageStatus {
  if (!status) return emptyConsoleUsageStatus()
  return {
    total: consoleUsageRollup(status.total),
    clients: status.clients.map(consoleUsageRollup),
    workspaces: status.workspaces.map(consoleUsageRollup),
    agents: status.agents.map(consoleUsageRollup),
    unpricedEntries: status.unpricedEntries,
    pricedEntries: status.pricedEntries,
    estimatedCostUsd: status.estimatedCostUsd,
  }
}

function emptyConsoleUsageStatus(): ConsoleGatewayUsageStatus {
  return {
    total: {
      scopeType: 'total',
      scopeId: 'total',
      scopeLabel: 'All usage',
      summary: {
        entries: 0,
        pricedEntries: 0,
        unpricedEntries: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        providers: [],
        models: [],
      },
    },
    clients: [],
    workspaces: [],
    agents: [],
    unpricedEntries: 0,
    pricedEntries: 0,
    estimatedCostUsd: 0,
  }
}

function consoleUsageRollup(rollup: LocalGatewayUsageRollup): ConsoleGatewayUsageRollup {
  return {
    scopeType: rollup.scopeType,
    scopeId: rollup.scopeId,
    scopeLabel: browserSafePreviewText(rollup.scopeLabel),
    summary: {
      entries: rollup.summary.entries,
      pricedEntries: rollup.summary.pricedEntries,
      unpricedEntries: rollup.summary.unpricedEntries,
      inputTokens: rollup.summary.inputTokens,
      outputTokens: rollup.summary.outputTokens,
      totalTokens: rollup.summary.totalTokens,
      estimatedCostUsd: rollup.summary.estimatedCostUsd,
      providers: rollup.summary.providers.map(browserSafePreviewText),
      models: rollup.summary.models.map(browserSafePreviewText),
    },
  }
}

function consoleBudgetEvaluation(
  evaluation: LocalGatewaySnapshot['budgetStatus']['evaluations'][number],
): ConsoleGatewayBudgetEvaluation {
  return {
    ...evaluation,
    label: browserSafePreviewText(evaluation.label),
    scopeLabel: browserSafePreviewText(evaluation.scopeLabel),
    costSensitiveTools: {
      mode: evaluation.costSensitiveTools.mode,
      reason: browserSafePreviewText(evaluation.costSensitiveTools.reason),
    },
  }
}

function consoleAuditEvent(record: LocalGatewayAuditEventRecord): ConsoleGatewayAuditEvent {
  return {
    eventId: record.eventId,
    category: browserSafePreviewText(record.category),
    action: browserSafePreviewText(record.action),
    actor: browserSafePreviewText(record.actor),
    targetType: browserSafePreviewText(record.targetType),
    targetId: browserSafePreviewText(record.targetId),
    ...(record.runId ? { runId: record.runId } : {}),
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    createdAt: record.createdAt,
  }
}
