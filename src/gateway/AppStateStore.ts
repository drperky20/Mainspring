import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
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

export interface CreateLocalGatewayAgentInput {
  agentId?: string
  workspaceId?: string
  name: string
  version?: string
  defaultModelId?: string
  metadata?: Record<string, unknown>
}

export interface CreateLocalGatewayProviderProfileInput {
  profileId?: string
  providerId: string
  label: string
  secretRef: string
  defaultModelId?: string
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

export interface LocalGatewayAppStateStore {
  readonly dbPath: string
  clients: {
    create(input: CreateLocalGatewayClientInput): LocalGatewayClientRecord
    get(clientId: string): LocalGatewayClientRecord | null
    list(): LocalGatewayClientRecord[]
  }
  workspaces: {
    create(input: CreateLocalGatewayWorkspaceInput): LocalGatewayWorkspaceRecord
    get(workspaceId: string): LocalGatewayWorkspaceRecord | null
    list(input?: { clientId?: string }): LocalGatewayWorkspaceRecord[]
  }
  agents: {
    create(input: CreateLocalGatewayAgentInput): LocalGatewayAgentRecord
    get(agentId: string): LocalGatewayAgentRecord | null
    list(input?: { workspaceId?: string }): LocalGatewayAgentRecord[]
  }
  providerProfiles: {
    create(input: CreateLocalGatewayProviderProfileInput): LocalGatewayProviderProfileRecord
    get(profileId: string): LocalGatewayProviderProfileRecord | null
    list(input?: { providerId?: string }): LocalGatewayProviderProfileRecord[]
  }
  runs: {
    upsert(input: UpsertLocalGatewayRunMetadataInput): LocalGatewayRunMetadataRecord
    get(runId: string): LocalGatewayRunMetadataRecord | null
    list(input?: { sessionId?: string }): LocalGatewayRunMetadataRecord[]
  }
  close(): void
}

export interface CreateSqliteLocalGatewayAppStateStoreOptions {
  dbPath: string
}

const LOCAL_GATEWAY_APP_STATE_SCHEMA = `
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
`

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  const parsed = JSON.parse(value) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined
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
    ...(value.default_model_id ? { defaultModelId: value.default_model_id } : {}),
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    ...(parseMetadata(value.metadata_json)
      ? { metadata: parseMetadata(value.metadata_json) }
      : {}),
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

export class SqliteLocalGatewayAppStateStore implements LocalGatewayAppStateStore {
  private readonly db: Database.Database

  constructor(readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec(LOCAL_GATEWAY_APP_STATE_SCHEMA)
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
      const record = {
        profileId: optionalText(input.profileId) ?? createMainspringRuntimeId('provider_profile'),
        providerId: requiredText(input.providerId, 'provider id'),
        label: requiredText(input.label, 'provider profile label'),
        secretRef: stableSecretRef(input.secretRef),
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
            created_at, updated_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        )
      return record
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
    list: (input: { sessionId?: string } = {}): LocalGatewayRunMetadataRecord[] => {
      if (input.sessionId) {
        return (this.db
          .prepare(
            `SELECT * FROM gateway_runs
             WHERE session_id = ?
             ORDER BY created_at ASC, run_id ASC`,
          )
          .all(input.sessionId) as unknown[]).map(runMetadataFromRow)
      }
      return (this.db
        .prepare('SELECT * FROM gateway_runs ORDER BY created_at ASC, run_id ASC')
        .all() as unknown[]).map(runMetadataFromRow)
    },
  }

  close(): void {
    this.db.close()
  }
}

export function createSqliteLocalGatewayAppStateStore(
  options: CreateSqliteLocalGatewayAppStateStoreOptions,
): SqliteLocalGatewayAppStateStore {
  return new SqliteLocalGatewayAppStateStore(path.resolve(options.dbPath))
}
