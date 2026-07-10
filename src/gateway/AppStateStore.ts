import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import {
  decryptManagedSecret,
  encryptManagedSecret,
  loadOrCreateManagedSecretKeyResult,
  type ManagedSecretCredentialStoreAdapter,
  type ManagedSecretKeyStorageMode,
  type ManagedSecretKeyStorageStatus,
} from './ManagedSecretCrypto.js'
import type { CronTimezone } from './CronExpression.js'
import {
  RuntimeSecretRefSchema,
  createMainspringRuntimeId,
  currentIsoTimestamp,
  redactRuntimeSensitiveText,
  sanitizeRuntimeResponse,
} from '#protocol'

export interface LocalGatewayClientRecord {
  clientId: string
  name: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayWorkspaceRecord {
  workspaceId: string
  clientId?: string
  name: string
  root: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayAgentRecord {
  agentId: string
  workspaceId?: string
  name: string
  version: string
  defaultModelId?: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayProviderProfileRecord {
  profileId: string
  providerId: string
  label: string
  secretRef: string
  managedSecretStored?: boolean
  defaultModelId?: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayRunMetadataRecord {
  runId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  providerId?: string
  modelId?: string
  runtimeProfile?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayRunListCursor {
  createdAt: string
  runId: string
}

export interface LocalGatewayRunListInput {
  sessionId?: string
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: LocalGatewayRunListCursor
  limit?: number
  order?: 'asc' | 'desc'
}

export interface LocalGatewayApprovalMetadataRecord {
  approvalId: string
  runId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  status: 'pending' | 'approved' | 'denied'
  targetKey?: string
  requestedAt: string
  resolvedAt?: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayApprovalListCursor {
  requestedAt: string
  approvalId: string
}

export interface LocalGatewayApprovalListInput {
  runId?: string
  status?: LocalGatewayApprovalMetadataRecord['status']
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: LocalGatewayApprovalListCursor
  limit?: number
  order?: 'asc' | 'desc'
}

export interface LocalGatewayArtifactRecord {
  artifactId: string
  runId: string
  sessionId: string
  workspaceId?: string
  kind: string
  label?: string
  path: string
  mediaType?: string
  sizeBytes?: number
  createdAt: string
  metadata?: Record<string, unknown>
}

/** Stable reverse-chronological cursor for bounded artifact history. */
export interface LocalGatewayArtifactCursor {
  createdAt: string
  artifactId: string
}

export interface LocalGatewayArtifactListInput {
  runId?: string
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: LocalGatewayArtifactCursor
  limit?: number
  order?: 'asc' | 'desc'
}

export interface LocalGatewayUsageLedgerEntryRecord {
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
  metadata?: Record<string, unknown>
}

/** Stable reverse-chronological cursor for bounded usage-ledger history. */
export interface LocalGatewayUsageLedgerCursor {
  createdAt: string
  entryId: string
}

export interface LocalGatewayUsageLedgerListInput {
  runId?: string
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: LocalGatewayUsageLedgerCursor
  limit?: number
  order?: 'asc' | 'desc'
}

export type LocalGatewayBudgetScope = 'client' | 'workspace' | 'agent'

export interface LocalGatewayBudgetRecord {
  budgetId: string
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  label: string
  maxEstimatedCostUsd: number
  warnAtUsd: number
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayAuthUserRecord {
  userId: string
  username: string
  passwordSalt: string
  passwordHash: string
  passwordAlgorithm: 'scrypt-v1'
  role: 'admin' | 'operator' | 'viewer'
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayAuthSessionRecord {
  authSessionId: string
  userId: string
  tokenHash: string
  status: 'active' | 'revoked' | 'expired'
  createdAt: string
  updatedAt: string
  expiresAt: string
  lastUsedAt?: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayAuditEventRecord {
  eventId: string
  category: string
  action: string
  actor: string
  targetType: string
  targetId: string
  runId?: string
  sessionId?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

/** Stable reverse-chronological cursor for bounded audit history. */
export interface LocalGatewayAuditEventCursor {
  createdAt: string
  eventId: string
}

export interface LocalGatewayAuditEventListInput {
  runId?: string
  category?: string
  /** Return rows strictly older than this reverse-chronological cursor. */
  before?: LocalGatewayAuditEventCursor
  limit?: number
  order?: 'asc' | 'desc'
}

export interface LocalGatewayToolCallRecord {
  toolCallId: string
  runId: string
  sessionId: string
  toolName: string
  status: 'requested' | 'updated' | 'completed' | 'failed' | 'blocked'
  agentId?: string
  workspaceId?: string
  outputRef?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayDeploymentTargetRecord {
  targetId: string
  workspaceId?: string
  label: string
  kind: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayDeploymentRunRecord {
  deploymentRunId: string
  targetId: string
  runId?: string
  sessionId?: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayCellRecord {
  cellId: string
  workspaceId?: string
  label: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayCellLeaseRecord {
  leaseId: string
  cellId: string
  runId?: string
  sessionId?: string
  status: 'active' | 'released' | 'expired'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayCellSnapshotRecord {
  snapshotId: string
  cellId: string
  leaseId?: string
  label: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayCronScheduleRecord {
  scheduleId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label: string
  prompt: string
  cronExpr: string
  timezone: CronTimezone
  allowedTools: string[]
  runtimeProfile?: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayClientInput {
  clientId?: string
  name: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayWorkspaceInput {
  workspaceId?: string
  clientId?: string
  name: string
  root: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayClientInput {
  clientId: string
  name?: string
  status?: LocalGatewayClientRecord['status']
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayWorkspaceInput {
  workspaceId: string
  name?: string
  root?: string
  status?: LocalGatewayWorkspaceRecord['status']
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayAgentInput {
  agentId?: string
  workspaceId?: string
  name: string
  version?: string
  defaultModelId?: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayAgentInput {
  agentId: string
  name?: string
  version?: string
  defaultModelId?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayProviderProfileInput {
  profileId?: string
  providerId: string
  label: string
  secretRef?: string
  secretValue?: string
  defaultModelId?: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayProviderProfileInput {
  profileId: string
  providerId?: string
  label?: string
  secretRef?: string
  secretValue?: string
  defaultModelId?: string
  status?: LocalGatewayProviderProfileRecord['status']
  metadata?: Record<string, unknown>
}

export interface UpsertLocalGatewayRunMetadataInput {
  runId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  providerId?: string
  modelId?: string
  runtimeProfile?: string
  metadata?: Record<string, unknown>
}

export interface UpsertLocalGatewayApprovalMetadataInput {
  approvalId: string
  runId: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  status: 'pending' | 'approved' | 'denied'
  targetKey?: string
  requestedAt?: string
  resolvedAt?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayArtifactInput {
  artifactId?: string
  runId: string
  sessionId: string
  workspaceId?: string
  kind: string
  label?: string
  path: string
  mediaType?: string
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayUsageLedgerEntryInput {
  entryId?: string
  runId: string
  sessionId: string
  workspaceId?: string
  providerId?: string
  modelId?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayBudgetInput {
  budgetId?: string
  scopeType: LocalGatewayBudgetScope
  scopeId: string
  label: string
  maxEstimatedCostUsd: number
  warnAtUsd?: number
  status?: LocalGatewayBudgetRecord['status']
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayBudgetInput {
  budgetId: string
  label?: string
  maxEstimatedCostUsd?: number
  warnAtUsd?: number
  status?: LocalGatewayBudgetRecord['status']
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayAuthUserInput {
  userId?: string
  username: string
  passwordSalt: string
  passwordHash: string
  passwordAlgorithm?: LocalGatewayAuthUserRecord['passwordAlgorithm']
  role?: LocalGatewayAuthUserRecord['role']
  status?: LocalGatewayAuthUserRecord['status']
  lastLoginAt?: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayAuthUserInput {
  userId: string
  username?: string
  passwordSalt?: string
  passwordHash?: string
  passwordAlgorithm?: LocalGatewayAuthUserRecord['passwordAlgorithm']
  role?: LocalGatewayAuthUserRecord['role']
  status?: LocalGatewayAuthUserRecord['status']
  lastLoginAt?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayAuthSessionInput {
  authSessionId?: string
  userId: string
  tokenHash: string
  expiresAt: string
  status?: LocalGatewayAuthSessionRecord['status']
  lastUsedAt?: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayAuthSessionInput {
  authSessionId: string
  tokenHash?: string
  expiresAt?: string
  status?: LocalGatewayAuthSessionRecord['status']
  lastUsedAt?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayAuditEventInput {
  eventId?: string
  category: string
  action: string
  actor: string
  targetType: string
  targetId: string
  runId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export interface UpsertLocalGatewayToolCallInput {
  toolCallId: string
  runId: string
  sessionId: string
  toolName: string
  status: LocalGatewayToolCallRecord['status']
  agentId?: string
  workspaceId?: string
  outputRef?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayDeploymentTargetInput {
  targetId?: string
  workspaceId?: string
  label: string
  kind: LocalGatewayDeploymentTargetRecord['kind']
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayDeploymentTargetInput {
  targetId: string
  workspaceId?: string
  label?: string
  kind?: LocalGatewayDeploymentTargetRecord['kind']
  status?: LocalGatewayDeploymentTargetRecord['status']
  metadata?: Record<string, unknown>
}

export interface UpsertLocalGatewayDeploymentRunInput {
  deploymentRunId: string
  targetId: string
  runId?: string
  sessionId?: string
  status: LocalGatewayDeploymentRunRecord['status']
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayCellInput {
  cellId?: string
  workspaceId?: string
  label: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayCellInput {
  cellId: string
  workspaceId?: string
  label?: string
  status?: LocalGatewayCellRecord['status']
  metadata?: Record<string, unknown>
}

export interface UpsertLocalGatewayCellLeaseInput {
  leaseId: string
  cellId: string
  runId?: string
  sessionId?: string
  status: LocalGatewayCellLeaseRecord['status']
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayCellSnapshotInput {
  snapshotId?: string
  cellId: string
  leaseId?: string
  label: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayCronScheduleInput {
  scheduleId?: string
  sessionId: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label: string
  prompt: string
  cronExpr: string
  timezone?: CronTimezone
  allowedTools?: string[]
  runtimeProfile?: string
  enabled?: boolean
  nextRunAt?: string
  lastRunAt?: string
  lastError?: string
  metadata?: Record<string, unknown>
}

export interface UpdateLocalGatewayCronScheduleInput {
  scheduleId: string
  sessionId?: string
  workspaceId?: string
  agentId?: string
  providerProfileId?: string
  computerId?: string
  label?: string
  prompt?: string
  cronExpr?: string
  timezone?: CronTimezone
  allowedTools?: string[]
  runtimeProfile?: string
  enabled?: boolean
  nextRunAt?: string
  lastRunAt?: string
  lastError?: string
  metadata?: Record<string, unknown>
}

export interface LocalGatewayAppStateStore {
  readonly dbPath: string
  readonly schemaVersion: number
  readonly managedSecretKeyPath: string
  readonly managedSecretKeyStorage: ManagedSecretKeyStorageStatus
  /** Monotonic for writes performed through this process-local store connection. */
  revision(): number
  clients: {
    create(input: CreateLocalGatewayClientInput): LocalGatewayClientRecord
    update(input: UpdateLocalGatewayClientInput): LocalGatewayClientRecord
    delete(clientId: string): void
    get(clientId: string): LocalGatewayClientRecord | null
    list(): LocalGatewayClientRecord[]
  }
  workspaces: {
    create(input: CreateLocalGatewayWorkspaceInput): LocalGatewayWorkspaceRecord
    update(input: UpdateLocalGatewayWorkspaceInput): LocalGatewayWorkspaceRecord
    delete(workspaceId: string): void
    get(workspaceId: string): LocalGatewayWorkspaceRecord | null
    list(input?: { clientId?: string }): LocalGatewayWorkspaceRecord[]
  }
  agents: {
    create(input: CreateLocalGatewayAgentInput): LocalGatewayAgentRecord
    update(input: UpdateLocalGatewayAgentInput): LocalGatewayAgentRecord
    get(agentId: string): LocalGatewayAgentRecord | null
    list(input?: { workspaceId?: string }): LocalGatewayAgentRecord[]
  }
  providerProfiles: {
    create(input: CreateLocalGatewayProviderProfileInput): LocalGatewayProviderProfileRecord
    update(input: UpdateLocalGatewayProviderProfileInput): LocalGatewayProviderProfileRecord
    get(profileId: string): LocalGatewayProviderProfileRecord | null
    list(input?: { providerId?: string }): LocalGatewayProviderProfileRecord[]
  }
  resolveSecretRef(secretRef: string): string | null
  runs: {
    upsert(input: UpsertLocalGatewayRunMetadataInput): LocalGatewayRunMetadataRecord
    get(runId: string): LocalGatewayRunMetadataRecord | null
    list(input?: LocalGatewayRunListInput): LocalGatewayRunMetadataRecord[]
  }
  approvals: {
    upsert(input: UpsertLocalGatewayApprovalMetadataInput): LocalGatewayApprovalMetadataRecord
    get(approvalId: string): LocalGatewayApprovalMetadataRecord | null
    list(input?: LocalGatewayApprovalListInput): LocalGatewayApprovalMetadataRecord[]
  }
  artifacts: {
    create(input: CreateLocalGatewayArtifactInput): LocalGatewayArtifactRecord
    get(artifactId: string): LocalGatewayArtifactRecord | null
    list(input?: LocalGatewayArtifactListInput): LocalGatewayArtifactRecord[]
  }
  usageLedger: {
    create(input: CreateLocalGatewayUsageLedgerEntryInput): LocalGatewayUsageLedgerEntryRecord
    get(entryId: string): LocalGatewayUsageLedgerEntryRecord | null
    list(input?: LocalGatewayUsageLedgerListInput): LocalGatewayUsageLedgerEntryRecord[]
  }
  budgets: {
    create(input: CreateLocalGatewayBudgetInput): LocalGatewayBudgetRecord
    update(input: UpdateLocalGatewayBudgetInput): LocalGatewayBudgetRecord
    delete(budgetId: string): void
    get(budgetId: string): LocalGatewayBudgetRecord | null
    list(input?: {
      scopeType?: LocalGatewayBudgetScope
      scopeId?: string
      status?: LocalGatewayBudgetRecord['status']
    }): LocalGatewayBudgetRecord[]
  }
  authUsers: {
    create(input: CreateLocalGatewayAuthUserInput): LocalGatewayAuthUserRecord
    update(input: UpdateLocalGatewayAuthUserInput): LocalGatewayAuthUserRecord
    get(userId: string): LocalGatewayAuthUserRecord | null
    getByUsername(username: string): LocalGatewayAuthUserRecord | null
    list(input?: { status?: LocalGatewayAuthUserRecord['status'] }): LocalGatewayAuthUserRecord[]
  }
  authSessions: {
    create(input: CreateLocalGatewayAuthSessionInput): LocalGatewayAuthSessionRecord
    update(input: UpdateLocalGatewayAuthSessionInput): LocalGatewayAuthSessionRecord
    delete(authSessionId: string): void
    get(authSessionId: string): LocalGatewayAuthSessionRecord | null
    getByTokenHash(tokenHash: string): LocalGatewayAuthSessionRecord | null
    list(input?: {
      userId?: string
      status?: LocalGatewayAuthSessionRecord['status']
    }): LocalGatewayAuthSessionRecord[]
  }
  auditEvents: {
    create(input: CreateLocalGatewayAuditEventInput): LocalGatewayAuditEventRecord
    get(eventId: string): LocalGatewayAuditEventRecord | null
    list(input?: LocalGatewayAuditEventListInput): LocalGatewayAuditEventRecord[]
  }
  toolCalls: {
    upsert(input: UpsertLocalGatewayToolCallInput): LocalGatewayToolCallRecord
    get(toolCallId: string): LocalGatewayToolCallRecord | null
    list(input?: { runId?: string; status?: LocalGatewayToolCallRecord['status'] }): LocalGatewayToolCallRecord[]
  }
  deploymentTargets: {
    create(input: CreateLocalGatewayDeploymentTargetInput): LocalGatewayDeploymentTargetRecord
    update(input: UpdateLocalGatewayDeploymentTargetInput): LocalGatewayDeploymentTargetRecord
    get(targetId: string): LocalGatewayDeploymentTargetRecord | null
    list(input?: { workspaceId?: string }): LocalGatewayDeploymentTargetRecord[]
  }
  deploymentRuns: {
    upsert(input: UpsertLocalGatewayDeploymentRunInput): LocalGatewayDeploymentRunRecord
    get(deploymentRunId: string): LocalGatewayDeploymentRunRecord | null
    list(input?: { targetId?: string; status?: LocalGatewayDeploymentRunRecord['status'] }): LocalGatewayDeploymentRunRecord[]
  }
  cells: {
    create(input: CreateLocalGatewayCellInput): LocalGatewayCellRecord
    update(input: UpdateLocalGatewayCellInput): LocalGatewayCellRecord
    get(cellId: string): LocalGatewayCellRecord | null
    list(input?: { workspaceId?: string }): LocalGatewayCellRecord[]
  }
  cellLeases: {
    upsert(input: UpsertLocalGatewayCellLeaseInput): LocalGatewayCellLeaseRecord
    get(leaseId: string): LocalGatewayCellLeaseRecord | null
    list(input?: { cellId?: string; status?: LocalGatewayCellLeaseRecord['status'] }): LocalGatewayCellLeaseRecord[]
  }
  cellSnapshots: {
    create(input: CreateLocalGatewayCellSnapshotInput): LocalGatewayCellSnapshotRecord
    get(snapshotId: string): LocalGatewayCellSnapshotRecord | null
    list(input?: { cellId?: string }): LocalGatewayCellSnapshotRecord[]
  }
  cronSchedules: {
    create(input: CreateLocalGatewayCronScheduleInput): LocalGatewayCronScheduleRecord
    update(input: UpdateLocalGatewayCronScheduleInput): LocalGatewayCronScheduleRecord
    delete(scheduleId: string): void
    get(scheduleId: string): LocalGatewayCronScheduleRecord | null
    list(input?: { sessionId?: string; enabled?: boolean }): LocalGatewayCronScheduleRecord[]
  }
  close(): void
}

export interface CreateSqliteLocalGatewayAppStateStoreOptions {
  dbPath: string
  managedSecretKey?: string
  managedSecretKeyPath?: string
  managedSecretKeyStorageMode?: ManagedSecretKeyStorageMode
  managedSecretCredentialName?: string
  managedSecretCredentialStore?: ManagedSecretCredentialStoreAdapter
}

const LOCAL_GATEWAY_APP_STATE_SCHEMA_VERSION = 6

const LOCAL_GATEWAY_APP_STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS gateway_schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS gateway_workspaces (
  workspace_id TEXT PRIMARY KEY,
  client_id TEXT,
  name TEXT NOT NULL,
  root TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_workspaces_client ON gateway_workspaces(client_id);

CREATE TABLE IF NOT EXISTS gateway_agents (
  agent_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  default_model_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_agents_workspace ON gateway_agents(workspace_id);

CREATE TABLE IF NOT EXISTS gateway_provider_profiles (
  profile_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  managed_secret_ciphertext TEXT,
  managed_secret_iv TEXT,
  managed_secret_auth_tag TEXT,
  default_model_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_provider_profiles_provider ON gateway_provider_profiles(provider_id);

CREATE TABLE IF NOT EXISTS gateway_runs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  agent_id TEXT,
  provider_profile_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  runtime_profile TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_runs_session ON gateway_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_gateway_runs_activity ON gateway_runs(created_at DESC, run_id DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_runs_session_activity
  ON gateway_runs(session_id, created_at DESC, run_id DESC);

CREATE TABLE IF NOT EXISTS gateway_approvals (
  approval_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  agent_id TEXT,
  status TEXT NOT NULL,
  target_key TEXT,
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_approvals_run ON gateway_approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_gateway_approvals_status ON gateway_approvals(status);
CREATE INDEX IF NOT EXISTS idx_gateway_approvals_activity ON gateway_approvals(requested_at DESC, approval_id DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_approvals_status_activity
  ON gateway_approvals(status, requested_at DESC, approval_id DESC);

CREATE TABLE IF NOT EXISTS gateway_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  kind TEXT NOT NULL,
  label TEXT,
  path TEXT NOT NULL,
  media_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_artifacts_run ON gateway_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_gateway_artifacts_activity
  ON gateway_artifacts(created_at DESC, artifact_id DESC);

CREATE TABLE IF NOT EXISTS gateway_usage_ledger_entries (
  entry_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd REAL,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_run ON gateway_usage_ledger_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_activity
  ON gateway_usage_ledger_entries(created_at DESC, entry_id DESC);

CREATE TABLE IF NOT EXISTS gateway_budgets (
  budget_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  label TEXT NOT NULL,
  max_estimated_cost_usd REAL NOT NULL,
  warn_at_usd REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_budgets_scope
  ON gateway_budgets(scope_type, scope_id, status);

CREATE TABLE IF NOT EXISTS gateway_auth_users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_algorithm TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_auth_users_status ON gateway_auth_users(status);

CREATE TABLE IF NOT EXISTS gateway_auth_sessions (
  auth_session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_auth_sessions_user_status
  ON gateway_auth_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_gateway_auth_sessions_expires ON gateway_auth_sessions(expires_at, status);

CREATE TABLE IF NOT EXISTS gateway_audit_events (
  event_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  run_id TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_run ON gateway_audit_events(run_id);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_category ON gateway_audit_events(category);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_activity
  ON gateway_audit_events(created_at DESC, event_id DESC);

CREATE TABLE IF NOT EXISTS gateway_tool_calls (
  tool_call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  agent_id TEXT,
  workspace_id TEXT,
  output_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_tool_calls_run ON gateway_tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_gateway_tool_calls_status ON gateway_tool_calls(status);

CREATE TABLE IF NOT EXISTS gateway_deployment_targets (
  target_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_deployment_targets_workspace
  ON gateway_deployment_targets(workspace_id);

CREATE TABLE IF NOT EXISTS gateway_deployment_runs (
  deployment_run_id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  run_id TEXT,
  session_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_deployment_runs_target
  ON gateway_deployment_runs(target_id);
CREATE INDEX IF NOT EXISTS idx_gateway_deployment_runs_status
  ON gateway_deployment_runs(status);

CREATE TABLE IF NOT EXISTS gateway_cells (
  cell_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_cells_workspace ON gateway_cells(workspace_id);

CREATE TABLE IF NOT EXISTS gateway_cell_leases (
  lease_id TEXT PRIMARY KEY,
  cell_id TEXT NOT NULL,
  run_id TEXT,
  session_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_cell_leases_cell ON gateway_cell_leases(cell_id);
CREATE INDEX IF NOT EXISTS idx_gateway_cell_leases_status ON gateway_cell_leases(status);

CREATE TABLE IF NOT EXISTS gateway_cell_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  cell_id TEXT NOT NULL,
  lease_id TEXT,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_cell_snapshots_cell ON gateway_cell_snapshots(cell_id);

CREATE TABLE IF NOT EXISTS gateway_cron_schedules (
  schedule_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  agent_id TEXT,
  provider_profile_id TEXT,
  computer_id TEXT,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL,
  allowed_tools_json TEXT NOT NULL,
  runtime_profile TEXT,
  enabled INTEGER NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_cron_schedules_session ON gateway_cron_schedules(session_id);
CREATE INDEX IF NOT EXISTS idx_gateway_cron_schedules_enabled_next_run
  ON gateway_cron_schedules(enabled, next_run_at);
`

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  const parsed = JSON.parse(value) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined
}

function parseStringArray(value: string | null): string[] {
  if (!value) return []
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
}

function stringArrayJson(value: readonly string[] | undefined): string {
  return JSON.stringify(value ?? [])
}

function metadataJson(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null
  assertNoRawSecretMaterial(value, 'metadata')
  return JSON.stringify(value)
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function requiredUsdAmount(value: number | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  return value
}

function stableSecretRef(value: string): string {
  const parsed = RuntimeSecretRefSchema.parse(value)
  return `${parsed.kind}:${parsed.key}`
}

function assertNoRawSecretMaterial(value: unknown, label: string): void {
  const sanitized = sanitizeRuntimeResponse(value)
  if (JSON.stringify(sanitized) !== JSON.stringify(value)) {
    throw new Error(`${label} must not contain raw secret material.`)
  }

  if (typeof value === 'string' && redactRuntimeSensitiveText(value) !== value) {
    throw new Error(`${label} must not contain raw secret material.`)
  }
}

function requireSecretInput(input: {
  secretRef?: string
  secretValue?: string
  existingSecretRef?: string
}): { secretRef: string; secretValue?: string } {
  const secretRef = optionalText(input.secretRef)
  const secretValue = optionalText(input.secretValue)
  if (secretValue) return { secretRef: secretRef ?? '', secretValue }
  if (secretRef) return { secretRef }
  if (input.existingSecretRef) return { secretRef: input.existingSecretRef }
  throw new Error('Provider profile secret ref or managed secret value is required.')
}

function ensureTableColumns(
  db: Database.Database,
  table: string,
  columns: Array<[name: string, type: string]>,
): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  )
  for (const [name, type] of columns) {
    if (existing.has(name)) continue
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
  }
}

function clientFromRow(row: unknown): LocalGatewayClientRecord {
  const value = row as {
    client_id: string
    name: string
    status: 'active' | 'archived'
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    clientId: value.client_id,
    name: value.name,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
  }
}

function workspaceFromRow(row: unknown): LocalGatewayWorkspaceRecord {
  const value = row as {
    workspace_id: string
    client_id: string | null
    name: string
    root: string
    status: 'active' | 'archived'
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    workspaceId: value.workspace_id,
    ...(value.client_id ? { clientId: value.client_id } : {}),
    name: value.name,
    root: value.root,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
  }
}

function agentFromRow(row: unknown): LocalGatewayAgentRecord {
  const value = row as {
    agent_id: string
    workspace_id: string | null
    name: string
    version: string
    default_model_id: string | null
    status: 'active' | 'archived'
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    agentId: value.agent_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    name: value.name,
    version: value.version,
    ...(value.default_model_id ? { defaultModelId: value.default_model_id } : {}),
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
  }
}

function providerProfileFromRow(row: unknown): LocalGatewayProviderProfileRecord {
  const value = row as {
    profile_id: string
    provider_id: string
    label: string
    secret_ref: string
    managed_secret_ciphertext: string | null
    default_model_id: string | null
    status: 'active' | 'archived'
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    profileId: value.profile_id,
    providerId: value.provider_id,
    label: value.label,
    secretRef: value.secret_ref,
    ...(value.managed_secret_ciphertext ? { managedSecretStored: true } : {}),
    ...(value.default_model_id ? { defaultModelId: value.default_model_id } : {}),
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
  }
}

function cronScheduleFromRow(row: unknown): LocalGatewayCronScheduleRecord {
  const value = row as {
    schedule_id: string
    session_id: string
    workspace_id: string | null
    agent_id: string | null
    provider_profile_id: string | null
    computer_id: string | null
    label: string
    prompt: string
    cron_expr: string
    timezone: CronTimezone
    allowed_tools_json: string | null
    runtime_profile: string | null
    enabled: number
    last_run_at: string | null
    next_run_at: string | null
    last_error: string | null
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    scheduleId: value.schedule_id,
    sessionId: value.session_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    ...(value.agent_id ? { agentId: value.agent_id } : {}),
    ...(value.provider_profile_id ? { providerProfileId: value.provider_profile_id } : {}),
    ...(value.computer_id ? { computerId: value.computer_id } : {}),
    label: value.label,
    prompt: value.prompt,
    cronExpr: value.cron_expr,
    timezone: value.timezone,
    allowedTools: parseStringArray(value.allowed_tools_json),
    ...(value.runtime_profile ? { runtimeProfile: value.runtime_profile } : {}),
    enabled: Boolean(value.enabled),
    ...(value.last_run_at ? { lastRunAt: value.last_run_at } : {}),
    ...(value.next_run_at ? { nextRunAt: value.next_run_at } : {}),
    ...(value.last_error ? { lastError: value.last_error } : {}),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function runMetadataFromRow(row: unknown): LocalGatewayRunMetadataRecord {
  const value = row as {
    run_id: string
    session_id: string
    workspace_id: string | null
    agent_id: string | null
    provider_profile_id: string | null
    provider_id: string | null
    model_id: string | null
    runtime_profile: string | null
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    runId: value.run_id,
    sessionId: value.session_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    ...(value.agent_id ? { agentId: value.agent_id } : {}),
    ...(value.provider_profile_id ? { providerProfileId: value.provider_profile_id } : {}),
    ...(value.provider_id ? { providerId: value.provider_id } : {}),
    ...(value.model_id ? { modelId: value.model_id } : {}),
    ...(value.runtime_profile ? { runtimeProfile: value.runtime_profile } : {}),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
  }
}

function approvalMetadataFromRow(row: unknown): LocalGatewayApprovalMetadataRecord {
  const value = row as {
    approval_id: string
    run_id: string
    session_id: string
    workspace_id: string | null
    agent_id: string | null
    status: 'pending' | 'approved' | 'denied'
    target_key: string | null
    requested_at: string
    resolved_at: string | null
    metadata_json: string | null
  }
  return {
    approvalId: value.approval_id,
    runId: value.run_id,
    sessionId: value.session_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    ...(value.agent_id ? { agentId: value.agent_id } : {}),
    status: value.status,
    ...(value.target_key ? { targetKey: value.target_key } : {}),
    requestedAt: value.requested_at,
    ...(value.resolved_at ? { resolvedAt: value.resolved_at } : {}),
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function artifactFromRow(row: unknown): LocalGatewayArtifactRecord {
  const value = row as {
    artifact_id: string
    run_id: string
    session_id: string
    workspace_id: string | null
    kind: string
    label: string | null
    path: string
    media_type: string | null
    size_bytes: number | null
    created_at: string
    metadata_json: string | null
  }
  return {
    artifactId: value.artifact_id,
    runId: value.run_id,
    sessionId: value.session_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    kind: value.kind,
    ...(value.label ? { label: value.label } : {}),
    path: value.path,
    ...(value.media_type ? { mediaType: value.media_type } : {}),
    ...(typeof value.size_bytes === 'number' ? { sizeBytes: value.size_bytes } : {}),
    createdAt: value.created_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function usageLedgerEntryFromRow(row: unknown): LocalGatewayUsageLedgerEntryRecord {
  const value = row as {
    entry_id: string
    run_id: string
    session_id: string
    workspace_id: string | null
    provider_id: string | null
    model_id: string | null
    input_tokens: number | null
    output_tokens: number | null
    total_tokens: number | null
    estimated_cost_usd: number | null
    created_at: string
    metadata_json: string | null
  }
  return {
    entryId: value.entry_id,
    runId: value.run_id,
    sessionId: value.session_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    ...(value.provider_id ? { providerId: value.provider_id } : {}),
    ...(value.model_id ? { modelId: value.model_id } : {}),
    ...(typeof value.input_tokens === 'number' ? { inputTokens: value.input_tokens } : {}),
    ...(typeof value.output_tokens === 'number' ? { outputTokens: value.output_tokens } : {}),
    ...(typeof value.total_tokens === 'number' ? { totalTokens: value.total_tokens } : {}),
    ...(typeof value.estimated_cost_usd === 'number'
      ? { estimatedCostUsd: value.estimated_cost_usd }
      : {}),
    createdAt: value.created_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function budgetFromRow(row: unknown): LocalGatewayBudgetRecord {
  const value = row as {
    budget_id: string
    scope_type: LocalGatewayBudgetScope
    scope_id: string
    label: string
    max_estimated_cost_usd: number
    warn_at_usd: number
    status: LocalGatewayBudgetRecord['status']
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    budgetId: value.budget_id,
    scopeType: value.scope_type,
    scopeId: value.scope_id,
    label: value.label,
    maxEstimatedCostUsd: value.max_estimated_cost_usd,
    warnAtUsd: value.warn_at_usd,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function authUserFromRow(row: unknown): LocalGatewayAuthUserRecord {
  const value = row as {
    user_id: string
    username: string
    password_salt: string
    password_hash: string
    password_algorithm: LocalGatewayAuthUserRecord['passwordAlgorithm']
    role: LocalGatewayAuthUserRecord['role']
    status: LocalGatewayAuthUserRecord['status']
    created_at: string
    updated_at: string
    last_login_at: string | null
    metadata_json: string | null
  }
  return {
    userId: value.user_id,
    username: value.username,
    passwordSalt: value.password_salt,
    passwordHash: value.password_hash,
    passwordAlgorithm: value.password_algorithm,
    role: value.role,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(value.last_login_at ? { lastLoginAt: value.last_login_at } : {}),
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function authSessionFromRow(row: unknown): LocalGatewayAuthSessionRecord {
  const value = row as {
    auth_session_id: string
    user_id: string
    token_hash: string
    status: LocalGatewayAuthSessionRecord['status']
    created_at: string
    updated_at: string
    expires_at: string
    last_used_at: string | null
    metadata_json: string | null
  }
  return {
    authSessionId: value.auth_session_id,
    userId: value.user_id,
    tokenHash: value.token_hash,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    expiresAt: value.expires_at,
    ...(value.last_used_at ? { lastUsedAt: value.last_used_at } : {}),
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function auditEventFromRow(row: unknown): LocalGatewayAuditEventRecord {
  const value = row as {
    event_id: string
    category: string
    action: string
    actor: string
    target_type: string
    target_id: string
    run_id: string | null
    session_id: string | null
    created_at: string
    metadata_json: string | null
  }
  return {
    eventId: value.event_id,
    category: value.category,
    action: value.action,
    actor: value.actor,
    targetType: value.target_type,
    targetId: value.target_id,
    ...(value.run_id ? { runId: value.run_id } : {}),
    ...(value.session_id ? { sessionId: value.session_id } : {}),
    createdAt: value.created_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function toolCallFromRow(row: unknown): LocalGatewayToolCallRecord {
  const value = row as {
    tool_call_id: string
    run_id: string
    session_id: string
    tool_name: string
    status: LocalGatewayToolCallRecord['status']
    agent_id: string | null
    workspace_id: string | null
    output_ref: string | null
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    toolCallId: value.tool_call_id,
    runId: value.run_id,
    sessionId: value.session_id,
    toolName: value.tool_name,
    status: value.status,
    ...(value.agent_id ? { agentId: value.agent_id } : {}),
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    ...(value.output_ref ? { outputRef: value.output_ref } : {}),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function deploymentTargetFromRow(row: unknown): LocalGatewayDeploymentTargetRecord {
  const value = row as {
    target_id: string
    workspace_id: string | null
    label: string
    kind: LocalGatewayDeploymentTargetRecord['kind']
    status: LocalGatewayDeploymentTargetRecord['status']
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    targetId: value.target_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    label: value.label,
    kind: value.kind,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function deploymentRunFromRow(row: unknown): LocalGatewayDeploymentRunRecord {
  const value = row as {
    deployment_run_id: string
    target_id: string
    run_id: string | null
    session_id: string | null
    status: LocalGatewayDeploymentRunRecord['status']
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    deploymentRunId: value.deployment_run_id,
    targetId: value.target_id,
    ...(value.run_id ? { runId: value.run_id } : {}),
    ...(value.session_id ? { sessionId: value.session_id } : {}),
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function cellFromRow(row: unknown): LocalGatewayCellRecord {
  const value = row as {
    cell_id: string
    workspace_id: string | null
    label: string
    status: LocalGatewayCellRecord['status']
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    cellId: value.cell_id,
    ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
    label: value.label,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function cellLeaseFromRow(row: unknown): LocalGatewayCellLeaseRecord {
  const value = row as {
    lease_id: string
    cell_id: string
    run_id: string | null
    session_id: string | null
    status: LocalGatewayCellLeaseRecord['status']
    created_at: string
    updated_at: string
    metadata_json: string | null
  }
  return {
    leaseId: value.lease_id,
    cellId: value.cell_id,
    ...(value.run_id ? { runId: value.run_id } : {}),
    ...(value.session_id ? { sessionId: value.session_id } : {}),
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

function cellSnapshotFromRow(row: unknown): LocalGatewayCellSnapshotRecord {
  const value = row as {
    snapshot_id: string
    cell_id: string
    lease_id: string | null
    label: string
    created_at: string
    metadata_json: string | null
  }
  return {
    snapshotId: value.snapshot_id,
    cellId: value.cell_id,
    ...(value.lease_id ? { leaseId: value.lease_id } : {}),
    label: value.label,
    createdAt: value.created_at,
    ...(parseMetadata(value.metadata_json) ? { metadata: parseMetadata(value.metadata_json) } : {}),
  }
}

export class SqliteLocalGatewayAppStateStore implements LocalGatewayAppStateStore {
  private readonly db: Database.Database
  private readonly managedSecretKey: Buffer
  readonly schemaVersion = LOCAL_GATEWAY_APP_STATE_SCHEMA_VERSION
  readonly managedSecretKeyPath: string
  readonly managedSecretKeyStorage: ManagedSecretKeyStorageStatus

  constructor(
    readonly dbPath: string,
    options: {
      managedSecretKey?: string
      managedSecretKeyPath?: string
      managedSecretKeyStorageMode?: ManagedSecretKeyStorageMode
      managedSecretCredentialName?: string
      managedSecretCredentialStore?: ManagedSecretCredentialStoreAdapter
    } = {},
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.managedSecretKeyPath = path.resolve(
      options.managedSecretKeyPath ?? `${dbPath}.managed-key`,
    )
    const managedSecretKey = loadOrCreateManagedSecretKeyResult({
      keyPath: this.managedSecretKeyPath,
      providedKey: options.managedSecretKey,
      storageMode: options.managedSecretKeyStorageMode,
      credentialName: options.managedSecretCredentialName,
      credentialStore: options.managedSecretCredentialStore,
    })
    this.managedSecretKey = managedSecretKey.key
    this.managedSecretKeyStorage = managedSecretKey.storage
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(LOCAL_GATEWAY_APP_STATE_SCHEMA)
    ensureTableColumns(this.db, 'gateway_provider_profiles', [
      ['managed_secret_ciphertext', 'TEXT'],
      ['managed_secret_iv', 'TEXT'],
      ['managed_secret_auth_tag', 'TEXT'],
    ])
    ensureTableColumns(this.db, 'gateway_cron_schedules', [['computer_id', 'TEXT']])
    this.db.pragma(`user_version = ${LOCAL_GATEWAY_APP_STATE_SCHEMA_VERSION}`)
    this.db
      .prepare(
        `INSERT INTO gateway_schema_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(LOCAL_GATEWAY_APP_STATE_SCHEMA_VERSION))
  }

  readonly clients = {
    create: (input: CreateLocalGatewayClientInput): LocalGatewayClientRecord => {
      const now = currentIsoTimestamp()
      const record = {
        clientId: optionalText(input.clientId) ?? createMainspringRuntimeId('client'),
        name: requiredText(input.name, 'client name'),
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db
        .prepare(
          `INSERT INTO gateway_clients (
            client_id, name, status, created_at, updated_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.clientId,
          record.name,
          record.status,
          record.createdAt,
          record.updatedAt,
          metadataJson(record.metadata),
        )
      return record
    },
    update: (input: UpdateLocalGatewayClientInput): LocalGatewayClientRecord => {
      const existing = this.clients.get(input.clientId)
      if (!existing) throw new Error(`Unknown gateway client: ${input.clientId}`)
      const now = currentIsoTimestamp()
      const record = {
        clientId: existing.clientId,
        name: optionalText(input.name) ?? existing.name,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: now,
        metadata: input.metadata ?? existing.metadata,
      }
      this.db
        .prepare(
          `UPDATE gateway_clients
           SET name = ?, status = ?, updated_at = ?, metadata_json = ?
           WHERE client_id = ?`,
        )
        .run(
          record.name,
          record.status,
          record.updatedAt,
          metadataJson(record.metadata),
          record.clientId,
        )
      return {
        clientId: record.clientId,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.metadata ? { metadata: record.metadata } : {}),
      }
    },
    delete: (clientId: string): void => {
      this.db.prepare('DELETE FROM gateway_clients WHERE client_id = ?').run(clientId)
    },
    get: (clientId: string): LocalGatewayClientRecord | null => {
      const row = this.db
        .prepare('SELECT * FROM gateway_clients WHERE client_id = ?')
        .get(clientId)
      return row ? clientFromRow(row) : null
    },
    list: (): LocalGatewayClientRecord[] =>
      (this.db
        .prepare('SELECT * FROM gateway_clients ORDER BY created_at ASC, client_id ASC')
        .all() as unknown[]).map(clientFromRow),
  }

  readonly workspaces = {
    create: (input: CreateLocalGatewayWorkspaceInput): LocalGatewayWorkspaceRecord => {
      const now = currentIsoTimestamp()
      const record = {
        workspaceId: optionalText(input.workspaceId) ?? createMainspringRuntimeId('workspace'),
        ...(optionalText(input.clientId) ? { clientId: optionalText(input.clientId) } : {}),
        name: requiredText(input.name, 'workspace name'),
        root: path.resolve(requiredText(input.root, 'workspace root')),
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db
        .prepare(
          `INSERT INTO gateway_workspaces (
            workspace_id, client_id, name, root, status, created_at, updated_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.workspaceId,
          record.clientId ?? null,
          record.name,
          record.root,
          record.status,
          record.createdAt,
          record.updatedAt,
          metadataJson(record.metadata),
        )
      return record
    },
    update: (input: UpdateLocalGatewayWorkspaceInput): LocalGatewayWorkspaceRecord => {
      const existing = this.workspaces.get(input.workspaceId)
      if (!existing) throw new Error(`Unknown gateway workspace: ${input.workspaceId}`)
      const now = currentIsoTimestamp()
      const record = {
        workspaceId: existing.workspaceId,
        ...(existing.clientId ? { clientId: existing.clientId } : {}),
        name: optionalText(input.name) ?? existing.name,
        root: optionalText(input.root) ? path.resolve(optionalText(input.root)!) : existing.root,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: now,
        metadata: input.metadata ?? existing.metadata,
      }
      this.db
        .prepare(
          `UPDATE gateway_workspaces
           SET name = ?, root = ?, status = ?, updated_at = ?, metadata_json = ?
           WHERE workspace_id = ?`,
        )
        .run(
          record.name,
          record.root,
          record.status,
          record.updatedAt,
          metadataJson(record.metadata),
          record.workspaceId,
        )
      return {
        workspaceId: record.workspaceId,
        ...(record.clientId ? { clientId: record.clientId } : {}),
        name: record.name,
        root: record.root,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.metadata ? { metadata: record.metadata } : {}),
      }
    },
    delete: (workspaceId: string): void => {
      this.db.prepare('DELETE FROM gateway_workspaces WHERE workspace_id = ?').run(workspaceId)
    },
    get: (workspaceId: string): LocalGatewayWorkspaceRecord | null => {
      const row = this.db
        .prepare('SELECT * FROM gateway_workspaces WHERE workspace_id = ?')
        .get(workspaceId)
      return row ? workspaceFromRow(row) : null
    },
    list: (input: { clientId?: string } = {}): LocalGatewayWorkspaceRecord[] => {
      if (input.clientId) {
        return (this.db
          .prepare(
            `SELECT * FROM gateway_workspaces
             WHERE client_id = ?
             ORDER BY created_at ASC, workspace_id ASC`,
          )
          .all(input.clientId) as unknown[]).map(workspaceFromRow)
      }
      return (this.db
        .prepare('SELECT * FROM gateway_workspaces ORDER BY created_at ASC, workspace_id ASC')
        .all() as unknown[]).map(workspaceFromRow)
    },
  }

  readonly agents = {
    create: (input: CreateLocalGatewayAgentInput): LocalGatewayAgentRecord => {
      const now = currentIsoTimestamp()
      const record = {
        agentId: optionalText(input.agentId) ?? createMainspringRuntimeId('agent'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        name: requiredText(input.name, 'agent name'),
        version: optionalText(input.version) ?? 'v1',
        ...(optionalText(input.defaultModelId)
          ? { defaultModelId: optionalText(input.defaultModelId) }
          : {}),
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db
        .prepare(
          `INSERT INTO gateway_agents (
            agent_id, workspace_id, name, version, default_model_id, status,
            created_at, updated_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.agentId,
          record.workspaceId ?? null,
          record.name,
          record.version,
          record.defaultModelId ?? null,
          record.status,
          record.createdAt,
          record.updatedAt,
          metadataJson(record.metadata),
        )
      return record
    },
    get: (agentId: string): LocalGatewayAgentRecord | null => {
      const row = this.db
        .prepare('SELECT * FROM gateway_agents WHERE agent_id = ?')
        .get(agentId)
      return row ? agentFromRow(row) : null
    },
    update: (input: UpdateLocalGatewayAgentInput): LocalGatewayAgentRecord => {
      const existing = this.agents.get(input.agentId)
      if (!existing) throw new Error(`Unknown gateway agent: ${input.agentId}`)
      const now = currentIsoTimestamp()
      const record = {
        agentId: existing.agentId,
        workspaceId: existing.workspaceId,
        name: optionalText(input.name) ?? existing.name,
        version: optionalText(input.version) ?? existing.version,
        defaultModelId: optionalText(input.defaultModelId) ?? existing.defaultModelId,
        status: existing.status,
        createdAt: existing.createdAt,
        updatedAt: now,
        metadata: input.metadata ?? existing.metadata,
      }
      this.db
        .prepare(
          `UPDATE gateway_agents
           SET name = ?, version = ?, default_model_id = ?, updated_at = ?, metadata_json = ?
           WHERE agent_id = ?`,
        )
        .run(
          record.name,
          record.version,
          record.defaultModelId ?? null,
          record.updatedAt,
          metadataJson(record.metadata),
          record.agentId,
        )
      return {
        agentId: record.agentId,
        ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
        name: record.name,
        version: record.version,
        ...(record.defaultModelId ? { defaultModelId: record.defaultModelId } : {}),
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.metadata ? { metadata: record.metadata } : {}),
      }
    },
    list: (input: { workspaceId?: string } = {}): LocalGatewayAgentRecord[] => {
      if (input.workspaceId) {
        return (this.db
          .prepare(
            `SELECT * FROM gateway_agents
             WHERE workspace_id = ?
             ORDER BY created_at ASC, agent_id ASC`,
          )
          .all(input.workspaceId) as unknown[]).map(agentFromRow)
      }
      return (this.db
        .prepare('SELECT * FROM gateway_agents ORDER BY created_at ASC, agent_id ASC')
        .all() as unknown[]).map(agentFromRow)
    },
  }

  readonly providerProfiles = {
    create: (
      input: CreateLocalGatewayProviderProfileInput,
    ): LocalGatewayProviderProfileRecord => {
      assertNoRawSecretMaterial(input.metadata, 'provider profile metadata')
      const now = currentIsoTimestamp()
      const profileId = optionalText(input.profileId) ?? createMainspringRuntimeId('provider_profile')
      const secret = requireSecretInput(input)
      const managedSecret =
        secret.secretValue
          ? encryptManagedSecret(secret.secretValue, this.managedSecretKey)
          : undefined
      const record = {
        profileId,
        providerId: requiredText(input.providerId, 'provider id'),
        label: requiredText(input.label, 'provider profile label'),
        secretRef: secret.secretValue
          ? `managed:${profileId}`
          : stableSecretRef(secret.secretRef),
        ...(managedSecret ? { managedSecretStored: true } : {}),
        ...(optionalText(input.defaultModelId)
          ? { defaultModelId: optionalText(input.defaultModelId) }
          : {}),
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db
        .prepare(
          `INSERT INTO gateway_provider_profiles (
            profile_id, provider_id, label, secret_ref, default_model_id, status,
            created_at, updated_at, metadata_json, managed_secret_ciphertext,
            managed_secret_iv, managed_secret_auth_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.profileId,
          record.providerId,
          record.label,
          record.secretRef,
          record.defaultModelId ?? null,
          record.status,
          record.createdAt,
          record.updatedAt,
          metadataJson(record.metadata),
          managedSecret?.ciphertext ?? null,
          managedSecret?.iv ?? null,
          managedSecret?.authTag ?? null,
        )
      return record
    },
    update: (
      input: UpdateLocalGatewayProviderProfileInput,
    ): LocalGatewayProviderProfileRecord => {
      const existing = this.providerProfiles.get(input.profileId)
      if (!existing) throw new Error(`Unknown gateway provider profile: ${input.profileId}`)
      assertNoRawSecretMaterial(input.metadata, 'provider profile metadata')
      const now = currentIsoTimestamp()
      const secret = requireSecretInput({
        secretRef: input.secretRef,
        secretValue: input.secretValue,
        existingSecretRef: existing.secretRef,
      })
      const managedSecret =
        secret.secretValue
          ? encryptManagedSecret(secret.secretValue, this.managedSecretKey)
          : undefined
      const record = {
        profileId: existing.profileId,
        providerId: optionalText(input.providerId) ?? existing.providerId,
        label: optionalText(input.label) ?? existing.label,
        secretRef: secret.secretValue
          ? `managed:${existing.profileId}`
          : stableSecretRef(secret.secretRef),
        managedSecretStored:
          secret.secretValue ? true : existing.secretRef.startsWith('managed:') && existing.managedSecretStored,
        defaultModelId: optionalText(input.defaultModelId) ?? existing.defaultModelId,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: now,
        metadata: input.metadata ?? existing.metadata,
      }
      this.db
        .prepare(
          `UPDATE gateway_provider_profiles
           SET provider_id = ?, label = ?, secret_ref = ?, default_model_id = ?, status = ?,
               updated_at = ?, metadata_json = ?, managed_secret_ciphertext = ?,
               managed_secret_iv = ?, managed_secret_auth_tag = ?
           WHERE profile_id = ?`,
        )
        .run(
          record.providerId,
          record.label,
          record.secretRef,
          record.defaultModelId ?? null,
          record.status,
          record.updatedAt,
          metadataJson(record.metadata),
          record.secretRef.startsWith('managed:')
            ? managedSecret?.ciphertext ?? this.managedSecretColumns(record.profileId).ciphertext
            : null,
          record.secretRef.startsWith('managed:')
            ? managedSecret?.iv ?? this.managedSecretColumns(record.profileId).iv
            : null,
          record.secretRef.startsWith('managed:')
            ? managedSecret?.authTag ?? this.managedSecretColumns(record.profileId).authTag
            : null,
          record.profileId,
        )
      return {
        profileId: record.profileId,
        providerId: record.providerId,
        label: record.label,
        secretRef: record.secretRef,
        ...(record.managedSecretStored ? { managedSecretStored: true } : {}),
        ...(record.defaultModelId ? { defaultModelId: record.defaultModelId } : {}),
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.metadata ? { metadata: record.metadata } : {}),
      }
    },
    get: (profileId: string): LocalGatewayProviderProfileRecord | null => {
      const row = this.db
        .prepare('SELECT * FROM gateway_provider_profiles WHERE profile_id = ?')
        .get(profileId)
      return row ? providerProfileFromRow(row) : null
    },
    list: (input: { providerId?: string } = {}): LocalGatewayProviderProfileRecord[] => {
      if (input.providerId) {
        return (this.db
          .prepare(
            `SELECT * FROM gateway_provider_profiles
             WHERE provider_id = ?
             ORDER BY created_at ASC, profile_id ASC`,
          )
          .all(input.providerId) as unknown[]).map(providerProfileFromRow)
      }
      return (this.db
        .prepare(
          'SELECT * FROM gateway_provider_profiles ORDER BY created_at ASC, profile_id ASC',
        )
        .all() as unknown[]).map(providerProfileFromRow)
    },
  }

  resolveSecretRef(secretRef: string): string | null {
    const parsed = RuntimeSecretRefSchema.parse(secretRef)
    if (parsed.kind === 'env') {
      const value = process.env[parsed.key]
      return value?.trim() ? value : null
    }
    if (parsed.kind !== 'managed') return null

    const row = this.db.prepare(
      `SELECT managed_secret_ciphertext, managed_secret_iv, managed_secret_auth_tag
       FROM gateway_provider_profiles
       WHERE secret_ref = ?`,
    ).get(`managed:${parsed.key}`) as
      | {
          managed_secret_ciphertext: string | null
          managed_secret_iv: string | null
          managed_secret_auth_tag: string | null
        }
      | undefined

    if (!row?.managed_secret_ciphertext || !row.managed_secret_iv || !row.managed_secret_auth_tag) {
      return null
    }

    return decryptManagedSecret(
      {
        ciphertext: row.managed_secret_ciphertext,
        iv: row.managed_secret_iv,
        authTag: row.managed_secret_auth_tag,
      },
      this.managedSecretKey,
    )
  }

  readonly runs = {
    upsert: (input: UpsertLocalGatewayRunMetadataInput): LocalGatewayRunMetadataRecord => {
      const existing = this.runs.get(input.runId)
      const now = currentIsoTimestamp()
      const record: LocalGatewayRunMetadataRecord = {
        runId: requiredText(input.runId, 'run id'),
        sessionId: requiredText(input.sessionId, 'session id'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        ...(optionalText(input.agentId) ? { agentId: optionalText(input.agentId) } : {}),
        ...(optionalText(input.providerProfileId)
          ? { providerProfileId: optionalText(input.providerProfileId) }
          : {}),
        ...(optionalText(input.providerId) ? { providerId: optionalText(input.providerId) } : {}),
        ...(optionalText(input.modelId) ? { modelId: optionalText(input.modelId) } : {}),
        ...(optionalText(input.runtimeProfile)
          ? { runtimeProfile: optionalText(input.runtimeProfile) }
          : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : existing?.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db
        .prepare(
          `INSERT INTO gateway_runs (
            run_id, session_id, workspace_id, agent_id, provider_profile_id,
            provider_id, model_id, runtime_profile, created_at, updated_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            session_id = excluded.session_id,
            workspace_id = excluded.workspace_id,
            agent_id = excluded.agent_id,
            provider_profile_id = excluded.provider_profile_id,
            provider_id = excluded.provider_id,
            model_id = excluded.model_id,
            runtime_profile = excluded.runtime_profile,
            updated_at = excluded.updated_at,
            metadata_json = excluded.metadata_json`,
        )
        .run(
          record.runId,
          record.sessionId,
          record.workspaceId ?? null,
          record.agentId ?? null,
          record.providerProfileId ?? null,
          record.providerId ?? null,
          record.modelId ?? null,
          record.runtimeProfile ?? null,
          record.createdAt,
          record.updatedAt,
          metadataJson(record.metadata),
        )
      return record
    },
    get: (runId: string): LocalGatewayRunMetadataRecord | null => {
      const row = this.db
        .prepare('SELECT * FROM gateway_runs WHERE run_id = ?')
        .get(runId)
      return row ? runMetadataFromRow(row) : null
    },
    list: (input: LocalGatewayRunListInput = {}): LocalGatewayRunMetadataRecord[] => {
      const clauses: string[] = []
      const params: Record<string, unknown> = {}
      if (input.sessionId) {
        clauses.push('session_id = @sessionId')
        params.sessionId = input.sessionId
      }
      if (input.before) {
        const createdAt = input.before.createdAt.trim()
        const runId = input.before.runId.trim()
        if (!createdAt || !runId) {
          throw new Error('Gateway run cursor requires non-empty createdAt and runId values.')
        }
        clauses.push(
          '(created_at < @beforeCreatedAt OR (created_at = @beforeCreatedAt AND run_id < @beforeRunId))',
        )
        params.beforeCreatedAt = createdAt
        params.beforeRunId = runId
      }
      if (input.limit !== undefined) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
          throw new Error('Gateway run list limit must be a positive integer.')
        }
        params.limit = input.limit
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const order = input.order === 'desc' ? 'DESC' : 'ASC'
      const limit = input.limit === undefined ? '' : ' LIMIT @limit'
      return (this.db
        .prepare(`SELECT * FROM gateway_runs ${where} ORDER BY created_at ${order}, run_id ${order}${limit}`)
        .all(params) as unknown[]).map(runMetadataFromRow)
    },
  }

  readonly approvals = {
    upsert: (input: UpsertLocalGatewayApprovalMetadataInput): LocalGatewayApprovalMetadataRecord => {
      const existing = this.approvals.get(input.approvalId)
      const record: LocalGatewayApprovalMetadataRecord = {
        approvalId: requiredText(input.approvalId, 'approval id'),
        runId: requiredText(input.runId, 'approval run id'),
        sessionId: requiredText(input.sessionId, 'approval session id'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        ...(optionalText(input.agentId) ? { agentId: optionalText(input.agentId) } : {}),
        status: input.status,
        ...(optionalText(input.targetKey) ? { targetKey: optionalText(input.targetKey) } : {}),
        requestedAt: input.requestedAt ?? existing?.requestedAt ?? currentIsoTimestamp(),
        ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
        ...(input.metadata ? { metadata: input.metadata } : existing?.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_approvals (
          approval_id, run_id, session_id, workspace_id, agent_id, status,
          target_key, requested_at, resolved_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(approval_id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          workspace_id = excluded.workspace_id,
          agent_id = excluded.agent_id,
          status = excluded.status,
          target_key = excluded.target_key,
          requested_at = excluded.requested_at,
          resolved_at = excluded.resolved_at,
          metadata_json = excluded.metadata_json`,
      ).run(
        record.approvalId,
        record.runId,
        record.sessionId,
        record.workspaceId ?? null,
        record.agentId ?? null,
        record.status,
        record.targetKey ?? null,
        record.requestedAt,
        record.resolvedAt ?? null,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (approvalId: string): LocalGatewayApprovalMetadataRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_approvals WHERE approval_id = ?').get(approvalId)
      return row ? approvalMetadataFromRow(row) : null
    },
    list: (input: LocalGatewayApprovalListInput = {}) => {
      const clauses: string[] = []
      const params: Record<string, unknown> = {}
      if (input.runId) {
        clauses.push('run_id = @runId')
        params.runId = input.runId
      }
      if (input.status) {
        clauses.push('status = @status')
        params.status = input.status
      }
      if (input.before) {
        const requestedAt = input.before.requestedAt.trim()
        const approvalId = input.before.approvalId.trim()
        if (!requestedAt || !approvalId) {
          throw new Error('Gateway approval cursor requires non-empty requestedAt and approvalId values.')
        }
        clauses.push(
          '(requested_at < @beforeRequestedAt OR (requested_at = @beforeRequestedAt AND approval_id < @beforeApprovalId))',
        )
        params.beforeRequestedAt = requestedAt
        params.beforeApprovalId = approvalId
      }
      if (input.limit !== undefined) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
          throw new Error('Gateway approval list limit must be a positive integer.')
        }
        params.limit = input.limit
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const order = input.order === 'desc' ? 'DESC' : 'ASC'
      const limit = input.limit === undefined ? '' : ' LIMIT @limit'
      return (this.db.prepare(
        `SELECT * FROM gateway_approvals ${where}
         ORDER BY requested_at ${order}, approval_id ${order}${limit}`,
      ).all(params) as unknown[]).map(approvalMetadataFromRow)
    },
  }

  readonly artifacts = {
    create: (input: CreateLocalGatewayArtifactInput): LocalGatewayArtifactRecord => {
      const record: LocalGatewayArtifactRecord = {
        artifactId: optionalText(input.artifactId) ?? createMainspringRuntimeId('artifact'),
        runId: requiredText(input.runId, 'artifact run id'),
        sessionId: requiredText(input.sessionId, 'artifact session id'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        kind: requiredText(input.kind, 'artifact kind'),
        ...(optionalText(input.label) ? { label: optionalText(input.label) } : {}),
        path: path.resolve(requiredText(input.path, 'artifact path')),
        ...(optionalText(input.mediaType) ? { mediaType: optionalText(input.mediaType) } : {}),
        ...(typeof input.sizeBytes === 'number' ? { sizeBytes: input.sizeBytes } : {}),
        createdAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_artifacts (
          artifact_id, run_id, session_id, workspace_id, kind, label, path,
          media_type, size_bytes, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.artifactId,
        record.runId,
        record.sessionId,
        record.workspaceId ?? null,
        record.kind,
        record.label ?? null,
        record.path,
        record.mediaType ?? null,
        record.sizeBytes ?? null,
        record.createdAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (artifactId: string): LocalGatewayArtifactRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_artifacts WHERE artifact_id = ?').get(artifactId)
      return row ? artifactFromRow(row) : null
    },
    list: (input: LocalGatewayArtifactListInput = {}) => {
      const clauses: string[] = []
      const params: unknown[] = []
      if (input.runId) {
        clauses.push('run_id = ?')
        params.push(input.runId)
      }
      if (input.before) {
        clauses.push('(created_at < ? OR (created_at = ? AND artifact_id < ?))')
        params.push(input.before.createdAt, input.before.createdAt, input.before.artifactId)
      }
      const order = input.order === 'desc' ? 'DESC' : 'ASC'
      const limit = input.limit === undefined ? '' : ' LIMIT ?'
      if (input.limit !== undefined) params.push(input.limit)
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
      return (this.db.prepare(
        `SELECT * FROM gateway_artifacts${where}
         ORDER BY created_at ${order}, artifact_id ${order}${limit}`,
      ).all(...params) as unknown[]).map(artifactFromRow)
    },
  }

  readonly usageLedger = {
    create: (input: CreateLocalGatewayUsageLedgerEntryInput): LocalGatewayUsageLedgerEntryRecord => {
      const record: LocalGatewayUsageLedgerEntryRecord = {
        entryId: optionalText(input.entryId) ?? createMainspringRuntimeId('usage'),
        runId: requiredText(input.runId, 'usage run id'),
        sessionId: requiredText(input.sessionId, 'usage session id'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        ...(optionalText(input.providerId) ? { providerId: optionalText(input.providerId) } : {}),
        ...(optionalText(input.modelId) ? { modelId: optionalText(input.modelId) } : {}),
        ...(typeof input.inputTokens === 'number' ? { inputTokens: input.inputTokens } : {}),
        ...(typeof input.outputTokens === 'number' ? { outputTokens: input.outputTokens } : {}),
        ...(typeof input.totalTokens === 'number' ? { totalTokens: input.totalTokens } : {}),
        ...(typeof input.estimatedCostUsd === 'number'
          ? { estimatedCostUsd: input.estimatedCostUsd }
          : {}),
        createdAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_usage_ledger_entries (
          entry_id, run_id, session_id, workspace_id, provider_id, model_id,
          input_tokens, output_tokens, total_tokens, estimated_cost_usd,
          created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.entryId,
        record.runId,
        record.sessionId,
        record.workspaceId ?? null,
        record.providerId ?? null,
        record.modelId ?? null,
        record.inputTokens ?? null,
        record.outputTokens ?? null,
        record.totalTokens ?? null,
        record.estimatedCostUsd ?? null,
        record.createdAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (entryId: string): LocalGatewayUsageLedgerEntryRecord | null => {
      const row = this.db.prepare(
        'SELECT * FROM gateway_usage_ledger_entries WHERE entry_id = ?',
      ).get(entryId)
      return row ? usageLedgerEntryFromRow(row) : null
    },
    list: (input: LocalGatewayUsageLedgerListInput = {}) => {
      const clauses: string[] = []
      const params: unknown[] = []
      if (input.runId) {
        clauses.push('run_id = ?')
        params.push(input.runId)
      }
      if (input.before) {
        clauses.push('(created_at < ? OR (created_at = ? AND entry_id < ?))')
        params.push(input.before.createdAt, input.before.createdAt, input.before.entryId)
      }
      const order = input.order === 'desc' ? 'DESC' : 'ASC'
      const limit = input.limit === undefined ? '' : ' LIMIT ?'
      if (input.limit !== undefined) params.push(input.limit)
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
      return (this.db.prepare(
        `SELECT * FROM gateway_usage_ledger_entries${where}
         ORDER BY created_at ${order}, entry_id ${order}${limit}`,
      ).all(...params) as unknown[]).map(usageLedgerEntryFromRow)
    },
  }

  readonly budgets = {
    create: (input: CreateLocalGatewayBudgetInput): LocalGatewayBudgetRecord => {
      assertNoRawSecretMaterial(input.metadata, 'budget metadata')
      const now = currentIsoTimestamp()
      const maxEstimatedCostUsd = requiredUsdAmount(
        input.maxEstimatedCostUsd,
        'budget max estimated cost usd',
      )
      const warnAtUsd = requiredUsdAmount(
        input.warnAtUsd ?? maxEstimatedCostUsd * 0.8,
        'budget warn at usd',
      )
      if (warnAtUsd > maxEstimatedCostUsd) {
        throw new Error('budget warn at usd must be less than or equal to the max estimated cost usd.')
      }
      const record: LocalGatewayBudgetRecord = {
        budgetId: optionalText(input.budgetId) ?? createMainspringRuntimeId('budget'),
        scopeType: input.scopeType,
        scopeId: requiredText(input.scopeId, 'budget scope id'),
        label: requiredText(input.label, 'budget label'),
        maxEstimatedCostUsd,
        warnAtUsd,
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_budgets (
          budget_id, scope_type, scope_id, label, max_estimated_cost_usd, warn_at_usd,
          status, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.budgetId,
        record.scopeType,
        record.scopeId,
        record.label,
        record.maxEstimatedCostUsd,
        record.warnAtUsd,
        record.status,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayBudgetInput): LocalGatewayBudgetRecord => {
      const existing = this.budgets.get(input.budgetId)
      if (!existing) throw new Error(`Unknown budget: ${input.budgetId}`)
      assertNoRawSecretMaterial(input.metadata, 'budget metadata')
      const maxEstimatedCostUsd =
        input.maxEstimatedCostUsd !== undefined
          ? requiredUsdAmount(input.maxEstimatedCostUsd, 'budget max estimated cost usd')
          : existing.maxEstimatedCostUsd
      const warnAtUsd =
        input.warnAtUsd !== undefined
          ? requiredUsdAmount(input.warnAtUsd, 'budget warn at usd')
          : existing.warnAtUsd
      if (warnAtUsd > maxEstimatedCostUsd) {
        throw new Error('budget warn at usd must be less than or equal to the max estimated cost usd.')
      }
      const record: LocalGatewayBudgetRecord = {
        budgetId: existing.budgetId,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        label: optionalText(input.label) ?? existing.label,
        maxEstimatedCostUsd,
        warnAtUsd,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_budgets
         SET label = ?, max_estimated_cost_usd = ?, warn_at_usd = ?, status = ?, updated_at = ?, metadata_json = ?
         WHERE budget_id = ?`,
      ).run(
        record.label,
        record.maxEstimatedCostUsd,
        record.warnAtUsd,
        record.status,
        record.updatedAt,
        metadataJson(record.metadata),
        record.budgetId,
      )
      return record
    },
    delete: (budgetId: string): void => {
      this.db.prepare('DELETE FROM gateway_budgets WHERE budget_id = ?').run(budgetId)
    },
    get: (budgetId: string): LocalGatewayBudgetRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_budgets WHERE budget_id = ?').get(budgetId)
      return row ? budgetFromRow(row) : null
    },
    list: (
      input: {
        scopeType?: LocalGatewayBudgetScope
        scopeId?: string
        status?: LocalGatewayBudgetRecord['status']
      } = {},
    ): LocalGatewayBudgetRecord[] => {
      if (input.scopeType && input.scopeId && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_budgets
           WHERE scope_type = ? AND scope_id = ? AND status = ?
           ORDER BY created_at ASC, budget_id ASC`,
        ).all(input.scopeType, input.scopeId, input.status) as unknown[]).map(budgetFromRow)
      }
      if (input.scopeType && input.scopeId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_budgets
           WHERE scope_type = ? AND scope_id = ?
           ORDER BY created_at ASC, budget_id ASC`,
        ).all(input.scopeType, input.scopeId) as unknown[]).map(budgetFromRow)
      }
      if (input.scopeType && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_budgets
           WHERE scope_type = ? AND status = ?
           ORDER BY created_at ASC, budget_id ASC`,
        ).all(input.scopeType, input.status) as unknown[]).map(budgetFromRow)
      }
      if (input.scopeType) {
        return (this.db.prepare(
          `SELECT * FROM gateway_budgets
           WHERE scope_type = ?
           ORDER BY created_at ASC, budget_id ASC`,
        ).all(input.scopeType) as unknown[]).map(budgetFromRow)
      }
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_budgets
           WHERE status = ?
           ORDER BY created_at ASC, budget_id ASC`,
        ).all(input.status) as unknown[]).map(budgetFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_budgets ORDER BY created_at ASC, budget_id ASC',
      ).all() as unknown[]).map(budgetFromRow)
    },
  }

  readonly authUsers = {
    create: (input: CreateLocalGatewayAuthUserInput): LocalGatewayAuthUserRecord => {
      assertNoRawSecretMaterial(input.metadata, 'auth user metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayAuthUserRecord = {
        userId: optionalText(input.userId) ?? createMainspringRuntimeId('auth_user'),
        username: requiredText(input.username, 'auth username').toLowerCase(),
        passwordSalt: requiredText(input.passwordSalt, 'auth password salt'),
        passwordHash: requiredText(input.passwordHash, 'auth password hash'),
        passwordAlgorithm: input.passwordAlgorithm ?? 'scrypt-v1',
        role: input.role ?? 'admin',
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
        ...(optionalText(input.lastLoginAt) ? { lastLoginAt: optionalText(input.lastLoginAt) } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_auth_users (
          user_id, username, password_salt, password_hash, password_algorithm,
          role, status, created_at, updated_at, last_login_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.userId,
        record.username,
        record.passwordSalt,
        record.passwordHash,
        record.passwordAlgorithm,
        record.role,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.lastLoginAt ?? null,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayAuthUserInput): LocalGatewayAuthUserRecord => {
      const existing = this.authUsers.get(input.userId)
      if (!existing) throw new Error(`Unknown auth user: ${input.userId}`)
      assertNoRawSecretMaterial(input.metadata, 'auth user metadata')
      const record: LocalGatewayAuthUserRecord = {
        userId: existing.userId,
        username: optionalText(input.username)?.toLowerCase() ?? existing.username,
        passwordSalt: optionalText(input.passwordSalt) ?? existing.passwordSalt,
        passwordHash: optionalText(input.passwordHash) ?? existing.passwordHash,
        passwordAlgorithm: input.passwordAlgorithm ?? existing.passwordAlgorithm,
        role: input.role ?? existing.role,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        ...(input.lastLoginAt !== undefined
          ? optionalText(input.lastLoginAt)
            ? { lastLoginAt: optionalText(input.lastLoginAt) }
            : {}
          : existing.lastLoginAt
            ? { lastLoginAt: existing.lastLoginAt }
            : {}),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_auth_users
         SET username = ?, password_salt = ?, password_hash = ?, password_algorithm = ?,
             role = ?, status = ?, updated_at = ?, last_login_at = ?, metadata_json = ?
         WHERE user_id = ?`,
      ).run(
        record.username,
        record.passwordSalt,
        record.passwordHash,
        record.passwordAlgorithm,
        record.role,
        record.status,
        record.updatedAt,
        record.lastLoginAt ?? null,
        metadataJson(record.metadata),
        record.userId,
      )
      return record
    },
    get: (userId: string): LocalGatewayAuthUserRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_auth_users WHERE user_id = ?').get(userId)
      return row ? authUserFromRow(row) : null
    },
    getByUsername: (username: string): LocalGatewayAuthUserRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_auth_users WHERE username = ?').get(username.trim().toLowerCase())
      return row ? authUserFromRow(row) : null
    },
    list: (input: { status?: LocalGatewayAuthUserRecord['status'] } = {}) => {
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_auth_users
           WHERE status = ?
           ORDER BY created_at ASC, user_id ASC`,
        ).all(input.status) as unknown[]).map(authUserFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_auth_users ORDER BY created_at ASC, user_id ASC',
      ).all() as unknown[]).map(authUserFromRow)
    },
  }

  readonly authSessions = {
    create: (input: CreateLocalGatewayAuthSessionInput): LocalGatewayAuthSessionRecord => {
      assertNoRawSecretMaterial(input.metadata, 'auth session metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayAuthSessionRecord = {
        authSessionId: optionalText(input.authSessionId) ?? createMainspringRuntimeId('auth_session'),
        userId: requiredText(input.userId, 'auth session user id'),
        tokenHash: requiredText(input.tokenHash, 'auth session token hash'),
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
        expiresAt: requiredText(input.expiresAt, 'auth session expires at'),
        ...(optionalText(input.lastUsedAt) ? { lastUsedAt: optionalText(input.lastUsedAt) } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_auth_sessions (
          auth_session_id, user_id, token_hash, status, created_at, updated_at,
          expires_at, last_used_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.authSessionId,
        record.userId,
        record.tokenHash,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.expiresAt,
        record.lastUsedAt ?? null,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayAuthSessionInput): LocalGatewayAuthSessionRecord => {
      const existing = this.authSessions.get(input.authSessionId)
      if (!existing) throw new Error(`Unknown auth session: ${input.authSessionId}`)
      assertNoRawSecretMaterial(input.metadata, 'auth session metadata')
      const record: LocalGatewayAuthSessionRecord = {
        authSessionId: existing.authSessionId,
        userId: existing.userId,
        tokenHash: optionalText(input.tokenHash) ?? existing.tokenHash,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        expiresAt: optionalText(input.expiresAt) ?? existing.expiresAt,
        ...(input.lastUsedAt !== undefined
          ? optionalText(input.lastUsedAt)
            ? { lastUsedAt: optionalText(input.lastUsedAt) }
            : {}
          : existing.lastUsedAt
            ? { lastUsedAt: existing.lastUsedAt }
            : {}),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_auth_sessions
         SET token_hash = ?, status = ?, updated_at = ?, expires_at = ?, last_used_at = ?, metadata_json = ?
         WHERE auth_session_id = ?`,
      ).run(
        record.tokenHash,
        record.status,
        record.updatedAt,
        record.expiresAt,
        record.lastUsedAt ?? null,
        metadataJson(record.metadata),
        record.authSessionId,
      )
      return record
    },
    delete: (authSessionId: string): void => {
      this.db.prepare('DELETE FROM gateway_auth_sessions WHERE auth_session_id = ?').run(authSessionId)
    },
    get: (authSessionId: string): LocalGatewayAuthSessionRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_auth_sessions WHERE auth_session_id = ?').get(authSessionId)
      return row ? authSessionFromRow(row) : null
    },
    getByTokenHash: (tokenHash: string): LocalGatewayAuthSessionRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_auth_sessions WHERE token_hash = ?').get(tokenHash)
      return row ? authSessionFromRow(row) : null
    },
    list: (
      input: {
        userId?: string
        status?: LocalGatewayAuthSessionRecord['status']
      } = {},
    ) => {
      if (input.userId && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_auth_sessions
           WHERE user_id = ? AND status = ?
           ORDER BY created_at ASC, auth_session_id ASC`,
        ).all(input.userId, input.status) as unknown[]).map(authSessionFromRow)
      }
      if (input.userId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_auth_sessions
           WHERE user_id = ?
           ORDER BY created_at ASC, auth_session_id ASC`,
        ).all(input.userId) as unknown[]).map(authSessionFromRow)
      }
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_auth_sessions
           WHERE status = ?
           ORDER BY created_at ASC, auth_session_id ASC`,
        ).all(input.status) as unknown[]).map(authSessionFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_auth_sessions ORDER BY created_at ASC, auth_session_id ASC',
      ).all() as unknown[]).map(authSessionFromRow)
    },
  }

  readonly auditEvents = {
    create: (input: CreateLocalGatewayAuditEventInput): LocalGatewayAuditEventRecord => {
      const record: LocalGatewayAuditEventRecord = {
        eventId: optionalText(input.eventId) ?? createMainspringRuntimeId('audit'),
        category: requiredText(input.category, 'audit category'),
        action: requiredText(input.action, 'audit action'),
        actor: requiredText(input.actor, 'audit actor'),
        targetType: requiredText(input.targetType, 'audit target type'),
        targetId: requiredText(input.targetId, 'audit target id'),
        ...(optionalText(input.runId) ? { runId: optionalText(input.runId) } : {}),
        ...(optionalText(input.sessionId) ? { sessionId: optionalText(input.sessionId) } : {}),
        createdAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_audit_events (
          event_id, category, action, actor, target_type, target_id,
          run_id, session_id, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.eventId,
        record.category,
        record.action,
        record.actor,
        record.targetType,
        record.targetId,
        record.runId ?? null,
        record.sessionId ?? null,
        record.createdAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (eventId: string): LocalGatewayAuditEventRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_audit_events WHERE event_id = ?').get(eventId)
      return row ? auditEventFromRow(row) : null
    },
    list: (input: LocalGatewayAuditEventListInput = {}) => {
      const clauses: string[] = []
      const params: unknown[] = []
      if (input.runId) {
        clauses.push('run_id = ?')
        params.push(input.runId)
      }
      if (input.category) {
        clauses.push('category = ?')
        params.push(input.category)
      }
      if (input.before) {
        clauses.push('(created_at < ? OR (created_at = ? AND event_id < ?))')
        params.push(input.before.createdAt, input.before.createdAt, input.before.eventId)
      }
      const order = input.order === 'desc' ? 'DESC' : 'ASC'
      const limit = input.limit === undefined ? '' : ' LIMIT ?'
      if (input.limit !== undefined) params.push(input.limit)
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
      return (this.db.prepare(
        `SELECT * FROM gateway_audit_events${where}
         ORDER BY created_at ${order}, event_id ${order}${limit}`,
      ).all(...params) as unknown[]).map(auditEventFromRow)
    },
  }

  readonly toolCalls = {
    upsert: (input: UpsertLocalGatewayToolCallInput): LocalGatewayToolCallRecord => {
      const existing = this.toolCalls.get(input.toolCallId)
      assertNoRawSecretMaterial(input.metadata, 'tool call metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayToolCallRecord = {
        toolCallId: requiredText(input.toolCallId, 'tool call id'),
        runId: requiredText(input.runId, 'tool call run id'),
        sessionId: requiredText(input.sessionId, 'tool call session id'),
        toolName: requiredText(input.toolName, 'tool name'),
        status: input.status,
        ...(optionalText(input.agentId) ? { agentId: optionalText(input.agentId) } : {}),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        ...(optionalText(input.outputRef) ? { outputRef: optionalText(input.outputRef) } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : existing?.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_tool_calls (
          tool_call_id, run_id, session_id, tool_name, status, agent_id,
          workspace_id, output_ref, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tool_call_id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          tool_name = excluded.tool_name,
          status = excluded.status,
          agent_id = excluded.agent_id,
          workspace_id = excluded.workspace_id,
          output_ref = excluded.output_ref,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json`,
      ).run(
        record.toolCallId,
        record.runId,
        record.sessionId,
        record.toolName,
        record.status,
        record.agentId ?? null,
        record.workspaceId ?? null,
        record.outputRef ?? null,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (toolCallId: string): LocalGatewayToolCallRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_tool_calls WHERE tool_call_id = ?').get(toolCallId)
      return row ? toolCallFromRow(row) : null
    },
    list: (input: { runId?: string; status?: LocalGatewayToolCallRecord['status'] } = {}) => {
      if (input.runId && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_tool_calls
           WHERE run_id = ? AND status = ?
           ORDER BY created_at ASC, tool_call_id ASC`,
        ).all(input.runId, input.status) as unknown[]).map(toolCallFromRow)
      }
      if (input.runId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_tool_calls
           WHERE run_id = ?
           ORDER BY created_at ASC, tool_call_id ASC`,
        ).all(input.runId) as unknown[]).map(toolCallFromRow)
      }
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_tool_calls
           WHERE status = ?
           ORDER BY created_at ASC, tool_call_id ASC`,
        ).all(input.status) as unknown[]).map(toolCallFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_tool_calls ORDER BY created_at ASC, tool_call_id ASC',
      ).all() as unknown[]).map(toolCallFromRow)
    },
  }

  readonly deploymentTargets = {
    create: (input: CreateLocalGatewayDeploymentTargetInput): LocalGatewayDeploymentTargetRecord => {
      assertNoRawSecretMaterial(input.metadata, 'deployment target metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayDeploymentTargetRecord = {
        targetId: optionalText(input.targetId) ?? createMainspringRuntimeId('deployment_target'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        label: requiredText(input.label, 'deployment target label'),
        kind: input.kind,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_deployment_targets (
          target_id, workspace_id, label, kind, status, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.targetId,
        record.workspaceId ?? null,
        record.label,
        record.kind,
        record.status,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayDeploymentTargetInput): LocalGatewayDeploymentTargetRecord => {
      const existing = this.deploymentTargets.get(input.targetId)
      if (!existing) throw new Error(`Unknown deployment target: ${input.targetId}`)
      assertNoRawSecretMaterial(input.metadata, 'deployment target metadata')
      const record: LocalGatewayDeploymentTargetRecord = {
        targetId: existing.targetId,
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : existing.workspaceId ? { workspaceId: existing.workspaceId } : {}),
        label: optionalText(input.label) ?? existing.label,
        kind: input.kind ?? existing.kind,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_deployment_targets
         SET workspace_id = ?, label = ?, kind = ?, status = ?, updated_at = ?, metadata_json = ?
         WHERE target_id = ?`,
      ).run(
        record.workspaceId ?? null,
        record.label,
        record.kind,
        record.status,
        record.updatedAt,
        metadataJson(record.metadata),
        record.targetId,
      )
      return record
    },
    get: (targetId: string): LocalGatewayDeploymentTargetRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_deployment_targets WHERE target_id = ?').get(targetId)
      return row ? deploymentTargetFromRow(row) : null
    },
    list: (input: { workspaceId?: string } = {}) => {
      if (input.workspaceId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_deployment_targets
           WHERE workspace_id = ?
           ORDER BY created_at ASC, target_id ASC`,
        ).all(input.workspaceId) as unknown[]).map(deploymentTargetFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_deployment_targets ORDER BY created_at ASC, target_id ASC',
      ).all() as unknown[]).map(deploymentTargetFromRow)
    },
  }

  readonly deploymentRuns = {
    upsert: (input: UpsertLocalGatewayDeploymentRunInput): LocalGatewayDeploymentRunRecord => {
      const existing = this.deploymentRuns.get(input.deploymentRunId)
      assertNoRawSecretMaterial(input.metadata, 'deployment run metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayDeploymentRunRecord = {
        deploymentRunId: requiredText(input.deploymentRunId, 'deployment run id'),
        targetId: requiredText(input.targetId, 'deployment target id'),
        ...(optionalText(input.runId) ? { runId: optionalText(input.runId) } : {}),
        ...(optionalText(input.sessionId) ? { sessionId: optionalText(input.sessionId) } : {}),
        status: input.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : existing?.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_deployment_runs (
          deployment_run_id, target_id, run_id, session_id, status,
          created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deployment_run_id) DO UPDATE SET
          target_id = excluded.target_id,
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          status = excluded.status,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json`,
      ).run(
        record.deploymentRunId,
        record.targetId,
        record.runId ?? null,
        record.sessionId ?? null,
        record.status,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (deploymentRunId: string): LocalGatewayDeploymentRunRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_deployment_runs WHERE deployment_run_id = ?').get(deploymentRunId)
      return row ? deploymentRunFromRow(row) : null
    },
    list: (input: { targetId?: string; status?: LocalGatewayDeploymentRunRecord['status'] } = {}) => {
      if (input.targetId && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_deployment_runs
           WHERE target_id = ? AND status = ?
           ORDER BY created_at ASC, deployment_run_id ASC`,
        ).all(input.targetId, input.status) as unknown[]).map(deploymentRunFromRow)
      }
      if (input.targetId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_deployment_runs
           WHERE target_id = ?
           ORDER BY created_at ASC, deployment_run_id ASC`,
        ).all(input.targetId) as unknown[]).map(deploymentRunFromRow)
      }
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_deployment_runs
           WHERE status = ?
           ORDER BY created_at ASC, deployment_run_id ASC`,
        ).all(input.status) as unknown[]).map(deploymentRunFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_deployment_runs ORDER BY created_at ASC, deployment_run_id ASC',
      ).all() as unknown[]).map(deploymentRunFromRow)
    },
  }

  readonly cells = {
    create: (input: CreateLocalGatewayCellInput): LocalGatewayCellRecord => {
      assertNoRawSecretMaterial(input.metadata, 'cell metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayCellRecord = {
        cellId: optionalText(input.cellId) ?? createMainspringRuntimeId('cell'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        label: requiredText(input.label, 'cell label'),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_cells (
          cell_id, workspace_id, label, status, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.cellId,
        record.workspaceId ?? null,
        record.label,
        record.status,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayCellInput): LocalGatewayCellRecord => {
      const existing = this.cells.get(input.cellId)
      if (!existing) throw new Error(`Unknown cell: ${input.cellId}`)
      assertNoRawSecretMaterial(input.metadata, 'cell metadata')
      const record: LocalGatewayCellRecord = {
        cellId: existing.cellId,
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : existing.workspaceId ? { workspaceId: existing.workspaceId } : {}),
        label: optionalText(input.label) ?? existing.label,
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_cells
         SET workspace_id = ?, label = ?, status = ?, updated_at = ?, metadata_json = ?
         WHERE cell_id = ?`,
      ).run(
        record.workspaceId ?? null,
        record.label,
        record.status,
        record.updatedAt,
        metadataJson(record.metadata),
        record.cellId,
      )
      return record
    },
    get: (cellId: string): LocalGatewayCellRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_cells WHERE cell_id = ?').get(cellId)
      return row ? cellFromRow(row) : null
    },
    list: (input: { workspaceId?: string } = {}) => {
      if (input.workspaceId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cells
           WHERE workspace_id = ?
           ORDER BY created_at ASC, cell_id ASC`,
        ).all(input.workspaceId) as unknown[]).map(cellFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_cells ORDER BY created_at ASC, cell_id ASC',
      ).all() as unknown[]).map(cellFromRow)
    },
  }

  readonly cellLeases = {
    upsert: (input: UpsertLocalGatewayCellLeaseInput): LocalGatewayCellLeaseRecord => {
      const existing = this.cellLeases.get(input.leaseId)
      assertNoRawSecretMaterial(input.metadata, 'cell lease metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayCellLeaseRecord = {
        leaseId: requiredText(input.leaseId, 'cell lease id'),
        cellId: requiredText(input.cellId, 'cell id'),
        ...(optionalText(input.runId) ? { runId: optionalText(input.runId) } : {}),
        ...(optionalText(input.sessionId) ? { sessionId: optionalText(input.sessionId) } : {}),
        status: input.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : existing?.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_cell_leases (
          lease_id, cell_id, run_id, session_id, status, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lease_id) DO UPDATE SET
          cell_id = excluded.cell_id,
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          status = excluded.status,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json`,
      ).run(
        record.leaseId,
        record.cellId,
        record.runId ?? null,
        record.sessionId ?? null,
        record.status,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (leaseId: string): LocalGatewayCellLeaseRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_cell_leases WHERE lease_id = ?').get(leaseId)
      return row ? cellLeaseFromRow(row) : null
    },
    list: (input: { cellId?: string; status?: LocalGatewayCellLeaseRecord['status'] } = {}) => {
      if (input.cellId && input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cell_leases
           WHERE cell_id = ? AND status = ?
           ORDER BY created_at ASC, lease_id ASC`,
        ).all(input.cellId, input.status) as unknown[]).map(cellLeaseFromRow)
      }
      if (input.cellId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cell_leases
           WHERE cell_id = ?
           ORDER BY created_at ASC, lease_id ASC`,
        ).all(input.cellId) as unknown[]).map(cellLeaseFromRow)
      }
      if (input.status) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cell_leases
           WHERE status = ?
           ORDER BY created_at ASC, lease_id ASC`,
        ).all(input.status) as unknown[]).map(cellLeaseFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_cell_leases ORDER BY created_at ASC, lease_id ASC',
      ).all() as unknown[]).map(cellLeaseFromRow)
    },
  }

  readonly cellSnapshots = {
    create: (input: CreateLocalGatewayCellSnapshotInput): LocalGatewayCellSnapshotRecord => {
      assertNoRawSecretMaterial(input.metadata, 'cell snapshot metadata')
      const record: LocalGatewayCellSnapshotRecord = {
        snapshotId: optionalText(input.snapshotId) ?? createMainspringRuntimeId('cell_snapshot'),
        cellId: requiredText(input.cellId, 'cell snapshot cell id'),
        ...(optionalText(input.leaseId) ? { leaseId: optionalText(input.leaseId) } : {}),
        label: requiredText(input.label, 'cell snapshot label'),
        createdAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_cell_snapshots (
          snapshot_id, cell_id, lease_id, label, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        record.snapshotId,
        record.cellId,
        record.leaseId ?? null,
        record.label,
        record.createdAt,
        metadataJson(record.metadata),
      )
      return record
    },
    get: (snapshotId: string): LocalGatewayCellSnapshotRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_cell_snapshots WHERE snapshot_id = ?').get(snapshotId)
      return row ? cellSnapshotFromRow(row) : null
    },
    list: (input: { cellId?: string } = {}) => {
      if (input.cellId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cell_snapshots
           WHERE cell_id = ?
           ORDER BY created_at ASC, snapshot_id ASC`,
        ).all(input.cellId) as unknown[]).map(cellSnapshotFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_cell_snapshots ORDER BY created_at ASC, snapshot_id ASC',
      ).all() as unknown[]).map(cellSnapshotFromRow)
    },
  }

  readonly cronSchedules = {
    create: (input: CreateLocalGatewayCronScheduleInput): LocalGatewayCronScheduleRecord => {
      assertNoRawSecretMaterial(input.metadata, 'cron schedule metadata')
      const now = currentIsoTimestamp()
      const record: LocalGatewayCronScheduleRecord = {
        scheduleId: optionalText(input.scheduleId) ?? createMainspringRuntimeId('schedule'),
        sessionId: requiredText(input.sessionId, 'cron schedule session id'),
        ...(optionalText(input.workspaceId) ? { workspaceId: optionalText(input.workspaceId) } : {}),
        ...(optionalText(input.agentId) ? { agentId: optionalText(input.agentId) } : {}),
        ...(optionalText(input.providerProfileId)
          ? { providerProfileId: optionalText(input.providerProfileId) }
          : {}),
        ...(optionalText(input.computerId) ? { computerId: optionalText(input.computerId) } : {}),
        label: requiredText(input.label, 'cron schedule label'),
        prompt: requiredText(input.prompt, 'cron schedule prompt'),
        cronExpr: requiredText(input.cronExpr, 'cron schedule expression'),
        timezone: input.timezone ?? 'local',
        allowedTools: [...(input.allowedTools ?? [])],
        ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
        enabled: input.enabled ?? true,
        ...(optionalText(input.lastRunAt) ? { lastRunAt: optionalText(input.lastRunAt) } : {}),
        ...(optionalText(input.nextRunAt) ? { nextRunAt: optionalText(input.nextRunAt) } : {}),
        ...(optionalText(input.lastError) ? { lastError: optionalText(input.lastError) } : {}),
        createdAt: now,
        updatedAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
      this.db.prepare(
        `INSERT INTO gateway_cron_schedules (
          schedule_id, session_id, workspace_id, agent_id, provider_profile_id, computer_id, label,
          prompt, cron_expr, timezone, allowed_tools_json, runtime_profile, enabled,
          last_run_at, next_run_at, last_error, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.scheduleId,
        record.sessionId,
        record.workspaceId ?? null,
        record.agentId ?? null,
        record.providerProfileId ?? null,
        record.computerId ?? null,
        record.label,
        record.prompt,
        record.cronExpr,
        record.timezone,
        stringArrayJson(record.allowedTools),
        record.runtimeProfile ?? null,
        record.enabled ? 1 : 0,
        record.lastRunAt ?? null,
        record.nextRunAt ?? null,
        record.lastError ?? null,
        record.createdAt,
        record.updatedAt,
        metadataJson(record.metadata),
      )
      return record
    },
    update: (input: UpdateLocalGatewayCronScheduleInput): LocalGatewayCronScheduleRecord => {
      const existing = this.cronSchedules.get(input.scheduleId)
      if (!existing) throw new Error(`Unknown cron schedule: ${input.scheduleId}`)
      assertNoRawSecretMaterial(input.metadata, 'cron schedule metadata')
      const record: LocalGatewayCronScheduleRecord = {
        scheduleId: existing.scheduleId,
        sessionId: optionalText(input.sessionId) ?? existing.sessionId,
        ...(optionalText(input.workspaceId)
          ? { workspaceId: optionalText(input.workspaceId) }
          : existing.workspaceId
            ? { workspaceId: existing.workspaceId }
            : {}),
        ...(optionalText(input.agentId)
          ? { agentId: optionalText(input.agentId) }
          : existing.agentId
            ? { agentId: existing.agentId }
            : {}),
        ...(optionalText(input.providerProfileId)
          ? { providerProfileId: optionalText(input.providerProfileId) }
          : existing.providerProfileId
            ? { providerProfileId: existing.providerProfileId }
            : {}),
        ...(optionalText(input.computerId)
          ? { computerId: optionalText(input.computerId) }
          : existing.computerId
            ? { computerId: existing.computerId }
            : {}),
        label: optionalText(input.label) ?? existing.label,
        prompt: optionalText(input.prompt) ?? existing.prompt,
        cronExpr: optionalText(input.cronExpr) ?? existing.cronExpr,
        timezone: input.timezone ?? existing.timezone,
        allowedTools: input.allowedTools ? [...input.allowedTools] : existing.allowedTools,
        ...(input.runtimeProfile
          ? { runtimeProfile: input.runtimeProfile }
          : existing.runtimeProfile
            ? { runtimeProfile: existing.runtimeProfile }
            : {}),
        enabled: input.enabled ?? existing.enabled,
        ...(optionalText(input.lastRunAt)
          ? { lastRunAt: optionalText(input.lastRunAt) }
          : existing.lastRunAt
            ? { lastRunAt: existing.lastRunAt }
            : {}),
        ...(optionalText(input.nextRunAt)
          ? { nextRunAt: optionalText(input.nextRunAt) }
          : existing.nextRunAt
            ? { nextRunAt: existing.nextRunAt }
            : {}),
        ...(input.lastError !== undefined
          ? optionalText(input.lastError)
            ? { lastError: optionalText(input.lastError) }
            : {}
          : existing.lastError
            ? { lastError: existing.lastError }
            : {}),
        createdAt: existing.createdAt,
        updatedAt: currentIsoTimestamp(),
        ...(input.metadata ? { metadata: input.metadata } : existing.metadata ? { metadata: existing.metadata } : {}),
      }
      this.db.prepare(
        `UPDATE gateway_cron_schedules
         SET session_id = ?, workspace_id = ?, agent_id = ?, provider_profile_id = ?, computer_id = ?, label = ?,
             prompt = ?, cron_expr = ?, timezone = ?, allowed_tools_json = ?, runtime_profile = ?,
             enabled = ?, last_run_at = ?, next_run_at = ?, last_error = ?, updated_at = ?,
             metadata_json = ?
         WHERE schedule_id = ?`,
      ).run(
        record.sessionId,
        record.workspaceId ?? null,
        record.agentId ?? null,
        record.providerProfileId ?? null,
        record.computerId ?? null,
        record.label,
        record.prompt,
        record.cronExpr,
        record.timezone,
        stringArrayJson(record.allowedTools),
        record.runtimeProfile ?? null,
        record.enabled ? 1 : 0,
        record.lastRunAt ?? null,
        record.nextRunAt ?? null,
        record.lastError ?? null,
        record.updatedAt,
        metadataJson(record.metadata),
        record.scheduleId,
      )
      return record
    },
    delete: (scheduleId: string): void => {
      this.db.prepare('DELETE FROM gateway_cron_schedules WHERE schedule_id = ?').run(scheduleId)
    },
    get: (scheduleId: string): LocalGatewayCronScheduleRecord | null => {
      const row = this.db.prepare('SELECT * FROM gateway_cron_schedules WHERE schedule_id = ?').get(scheduleId)
      return row ? cronScheduleFromRow(row) : null
    },
    list: (input: { sessionId?: string; enabled?: boolean } = {}): LocalGatewayCronScheduleRecord[] => {
      if (input.sessionId && input.enabled !== undefined) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cron_schedules
           WHERE session_id = ? AND enabled = ?
           ORDER BY created_at ASC, schedule_id ASC`,
        ).all(input.sessionId, input.enabled ? 1 : 0) as unknown[]).map(cronScheduleFromRow)
      }
      if (input.sessionId) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cron_schedules
           WHERE session_id = ?
           ORDER BY created_at ASC, schedule_id ASC`,
        ).all(input.sessionId) as unknown[]).map(cronScheduleFromRow)
      }
      if (input.enabled !== undefined) {
        return (this.db.prepare(
          `SELECT * FROM gateway_cron_schedules
           WHERE enabled = ?
           ORDER BY created_at ASC, schedule_id ASC`,
        ).all(input.enabled ? 1 : 0) as unknown[]).map(cronScheduleFromRow)
      }
      return (this.db.prepare(
        'SELECT * FROM gateway_cron_schedules ORDER BY created_at ASC, schedule_id ASC',
      ).all() as unknown[]).map(cronScheduleFromRow)
    },
  }

  private managedSecretColumns(profileId: string): {
    ciphertext: string | null
    iv: string | null
    authTag: string | null
  } {
    const row = this.db.prepare(
      `SELECT managed_secret_ciphertext, managed_secret_iv, managed_secret_auth_tag
       FROM gateway_provider_profiles
       WHERE profile_id = ?`,
    ).get(profileId) as
      | {
          managed_secret_ciphertext: string | null
          managed_secret_iv: string | null
          managed_secret_auth_tag: string | null
        }
      | undefined
    return {
      ciphertext: row?.managed_secret_ciphertext ?? null,
      iv: row?.managed_secret_iv ?? null,
      authTag: row?.managed_secret_auth_tag ?? null,
    }
  }

  revision(): number {
    const row = this.db.prepare('SELECT total_changes() AS changes').get() as { changes: number }
    return Number(row.changes)
  }

  close(): void {
    this.db.close()
  }
}

export function createSqliteLocalGatewayAppStateStore(
  options: CreateSqliteLocalGatewayAppStateStoreOptions,
): SqliteLocalGatewayAppStateStore {
  return new SqliteLocalGatewayAppStateStore(path.resolve(options.dbPath), {
    managedSecretKey: options.managedSecretKey,
    managedSecretKeyPath: options.managedSecretKeyPath,
    managedSecretKeyStorageMode: options.managedSecretKeyStorageMode,
    managedSecretCredentialName: options.managedSecretCredentialName,
    managedSecretCredentialStore: options.managedSecretCredentialStore,
  })
}
