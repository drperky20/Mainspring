import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import { createRunLogId } from '../../core/ids.js'
import type {
  AgentSpec,
  AppendRunEventInput,
  ClaimExecutionInput,
  ClaimRunInput,
  DecideApprovalLifecycleInput,
  ExecutionClaim,
  ExecutionClaimInput,
  ExecutionFailure,
  ExecutionOutboxRecord,
  ExecutionOutboxStatus,
  ListRunEventsInput,
  ListRunsInput,
  RunCheckpoint,
  RunIntent,
  RunLogApprovalReceipt,
  RunLogApprovalRequestSnapshot,
  RunLogEvent,
  RunLogProjectionCatchupResult,
  RunLogRunSummary,
  RunLogStore,
  RunRecord,
  RunStatus,
  PauseRunForApprovalInput,
  TransitionRunStatusInput,
} from '../../core/types.js'
import {
  cronMetadataWithDecision,
  decideRunLogCron,
  decisionRecordForRun,
  type RunLogCronJob,
  type RunLogCronStore,
} from '../../capabilities/cron/RunLogCron.js'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  return JSON.parse(value) as T
}

function optionalJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

function requireRun(row: unknown): RunRecord {
  if (!row || typeof row !== 'object') throw new Error('Run row was not found')
  return mapRun(row as Record<string, unknown>)
}

function mapRun(row: Record<string, unknown>): RunRecord {
  const run: RunRecord = {
    runId: String(row.run_id),
    agentId: String(row.agent_id),
    sessionId: String(row.session_id),
    status: row.status as RunStatus,
    input: String(row.input),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    metadata: parseJson(String(row.metadata_json ?? ''), undefined),
  }
  if (row.parent_run_id) run.parentRunId = String(row.parent_run_id)
  if (row.workspace_id) run.workspaceId = String(row.workspace_id)
  if (row.workspace_root) run.workspaceRoot = String(row.workspace_root)
  if (row.provider_id) run.providerId = String(row.provider_id)
  if (row.model_id) run.modelId = String(row.model_id)
  if (row.credential_ref) run.credentialRef = String(row.credential_ref)
  if (row.allowed_tools_json) run.allowedTools = parseJson<string[]>(String(row.allowed_tools_json), [])
  if (row.worker_id) run.workerId = String(row.worker_id)
  if (row.lease_until) run.leaseUntil = String(row.lease_until)
  if (row.execution_generation !== undefined) run.executionGeneration = Number(row.execution_generation)
  if (row.lease_epoch !== undefined) run.leaseEpoch = Number(row.lease_epoch)
  if (row.attempt_count !== undefined) run.attemptCount = Number(row.attempt_count)
  if (row.next_attempt_at) run.nextAttemptAt = String(row.next_attempt_at)
  if (row.failure_classification) run.failureClassification = String(row.failure_classification)
  return run
}

function mapExecutionOutbox(row: Record<string, unknown>): ExecutionOutboxRecord {
  const record: ExecutionOutboxRecord = {
    outboxId: String(row.outbox_id),
    runId: String(row.run_id),
    generation: Number(row.generation),
    kind: 'run.advance',
    status: row.status as ExecutionOutboxStatus,
    idempotencyKey: String(row.idempotency_key),
    payload: parseJson<Record<string, unknown>>(String(row.payload_json ?? ''), {}),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: String(row.next_attempt_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
  if (row.claimed_by) record.claimedBy = String(row.claimed_by)
  if (row.claim_token) record.claimToken = String(row.claim_token)
  if (row.claim_expires_at) record.claimExpiresAt = String(row.claim_expires_at)
  if (row.last_heartbeat_at) record.lastHeartbeatAt = String(row.last_heartbeat_at)
  if (row.last_error_classification) record.lastErrorClassification = String(row.last_error_classification)
  if (row.last_error_message) record.lastErrorMessage = String(row.last_error_message)
  if (row.last_error_retryable !== null && row.last_error_retryable !== undefined) {
    record.lastErrorRetryable = Number(row.last_error_retryable) === 1
  }
  if (row.completed_at) record.completedAt = String(row.completed_at)
  return record
}

function mapEvent(row: Record<string, unknown>): RunLogEvent {
  const event: RunLogEvent = {
    eventId: String(row.event_id),
    seq: Number(row.seq),
    runId: String(row.run_id),
    agentId: String(row.agent_id),
    sessionId: String(row.session_id),
    type: row.type as RunLogEvent['type'],
    timestamp: String(row.timestamp),
    payload: parseJson(String(row.payload_json ?? ''), {}),
    visibility: row.visibility as RunLogEvent['visibility'],
  }
  if (row.idempotency_key) event.idempotencyKey = String(row.idempotency_key)
  return event
}

function mapRunProjectionSummary(row: Record<string, unknown>): RunLogRunSummary {
  const summary: RunLogRunSummary = {
    runId: String(row.run_id),
    status: row.status as RunLogRunSummary['status'],
    eventCount: Number(row.event_count),
    latestSeq: Number(row.latest_seq),
    assistantText: String(row.assistant_text ?? ''),
    updatedAt: String(row.updated_at),
  }
  if (row.last_event_type) summary.lastEventType = row.last_event_type as RunLogEvent['type']
  return summary
}

function projectionStatusForEvent(event: RunLogEvent, fallback: RunLogRunSummary['status']): RunLogRunSummary['status'] {
  switch (event.type) {
    case 'run.created':
    case 'run.queued':
    case 'run.retry.scheduled':
      return 'queued'
    case 'run.claimed':
      return 'running'
    case 'run.awaiting_approval':
      return 'awaiting_approval'
    case 'run.completed':
      return 'completed'
    case 'run.failed':
      return 'failed'
    case 'run.cancelled':
      return 'cancelled'
    default:
      return fallback
  }
}

function mapCheckpoint(row: Record<string, unknown>): RunCheckpoint {
  return {
    checkpointId: String(row.checkpoint_id),
    runId: String(row.run_id),
    seq: Number(row.seq),
    kind: row.kind as RunCheckpoint['kind'],
    timestamp: String(row.timestamp),
    state: parseJson<Record<string, unknown>>(String(row.state_json ?? ''), {}),
  }
}

function mapCronJob(row: Record<string, unknown>): RunLogCronJob {
  const job: RunLogCronJob = {
    cronId: String(row.cron_id),
    agentId: String(row.agent_id),
    input: String(row.input),
    intervalMs: Number(row.interval_ms),
    nextRunAt: String(row.next_run_at),
    enabled: Number(row.enabled) === 1,
    metadata: parseJson(String(row.metadata_json ?? ''), undefined),
  }
  if (row.session_id) job.sessionId = String(row.session_id)
  if (row.workspace_id) job.workspaceId = String(row.workspace_id)
  return job
}

function mapApprovalRequest(row: Record<string, unknown>): RunLogApprovalRequestSnapshot {
  return parseJson<RunLogApprovalRequestSnapshot>(String(row.snapshot_json ?? ''), {
    approvalId: String(row.approval_id),
    runId: String(row.run_id),
    agentId: '',
    sessionId: '',
    toolCallId: String(row.tool_call_id),
    toolName: '',
    toolInput: undefined,
    toolInputHash: '',
    cwd: '',
    workspaceId: '',
    workspaceHash: '',
    policyHash: '',
    toolManifestHash: '',
    providerContextHash: '',
    riskSnapshotHash: '',
    requestedAt: String(row.created_at),
  })
}

function mapApprovalReceipt(row: Record<string, unknown>): RunLogApprovalReceipt {
  return parseJson<RunLogApprovalReceipt>(String(row.receipt_json ?? ''), {
    version: 1,
    receiptId: String(row.receipt_id),
    approvalId: String(row.approval_id),
    runId: String(row.run_id),
    agentId: '',
    sessionId: '',
    toolCallId: '',
    toolName: '',
    decision: row.decision as RunLogApprovalReceipt['decision'],
    actor: '',
    requestedAt: '',
    decidedAt: String(row.created_at),
    expiresAt: '',
    toolInputHash: '',
    workspaceHash: '',
    policyHash: '',
    toolManifestHash: '',
    providerContextHash: '',
    riskSnapshotHash: '',
    nonce: '',
    idempotencyKey: '',
    keyId: '',
    signature: '',
  })
}

export interface SqliteRunLogStoreOptions {
  dbPath: string
  now?: () => Date
  transactionHook?: (step: string) => void
}

export class SqliteRunLogStore implements RunLogStore, RunLogCronStore {
  private db: DatabaseHandle | null = null
  private readonly now: () => Date

  constructor(private readonly options: SqliteRunLogStoreOptions) {
    this.now = options.now ?? (() => new Date())
  }

  initialize(): void {
    if (this.db) return
    fs.mkdirSync(path.dirname(path.resolve(this.options.dbPath)), { recursive: true })
    this.db = new Database(this.options.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        spec_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        parent_run_id TEXT,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        workspace_id TEXT,
        workspace_root TEXT,
        provider_id TEXT,
        model_id TEXT,
        credential_ref TEXT,
        worker_id TEXT,
        lease_until TEXT,
        execution_generation INTEGER NOT NULL DEFAULT 1,
        lease_epoch INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        failure_classification TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agents(agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_runs_claimable
        ON runs(status, lease_until, created_at);
      CREATE INDEX IF NOT EXISTS idx_runs_session
        ON runs(session_id, created_at);

      CREATE TABLE IF NOT EXISTS run_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        visibility TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_events_run_seq
        ON run_events(run_id, seq);
      CREATE INDEX IF NOT EXISTS idx_run_events_session_seq
        ON run_events(session_id, seq);

      CREATE TABLE IF NOT EXISTS run_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        state_json TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_checkpoints_latest
        ON run_checkpoints(run_id, seq DESC);

      CREATE TABLE IF NOT EXISTS run_approval_requests (
        approval_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_at TEXT,
        receipt_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_approval_requests_run
        ON run_approval_requests(run_id);

      CREATE TABLE IF NOT EXISTS run_approval_receipts (
        receipt_id TEXT PRIMARY KEY,
        approval_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_run_approval_receipts_approval_decision
        ON run_approval_receipts(approval_id, decision);
      CREATE INDEX IF NOT EXISTS idx_run_approval_receipts_run_decision_used
        ON run_approval_receipts(run_id, decision, used_at);

      CREATE TABLE IF NOT EXISTS run_cron_jobs (
        cron_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        input TEXT NOT NULL,
        interval_ms INTEGER NOT NULL,
        next_run_at TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        session_id TEXT,
        workspace_id TEXT,
        metadata_json TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agents(agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_cron_due
        ON run_cron_jobs(enabled, next_run_at);

      CREATE TABLE IF NOT EXISTS run_execution_outbox (
        outbox_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('run.advance')),
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'claimed', 'retryable', 'completed', 'failed', 'cancelled')
        ),
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_json TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
        next_attempt_at TEXT NOT NULL,
        claimed_by TEXT,
        claim_token TEXT,
        claim_expires_at TEXT,
        last_heartbeat_at TEXT,
        last_error_classification TEXT,
        last_error_message TEXT,
        last_error_retryable INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_outbox_available
        ON run_execution_outbox(status, next_attempt_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_run_outbox_expired_claim
        ON run_execution_outbox(status, claim_expires_at);
      CREATE INDEX IF NOT EXISTS idx_run_outbox_run
        ON run_execution_outbox(run_id, generation);
    `)
    this.ensureRunColumn('credential_ref', 'TEXT')
    this.ensureRunColumn('allowed_tools_json', 'TEXT')
    this.ensureRunColumn('execution_generation', 'INTEGER NOT NULL DEFAULT 1')
    this.ensureRunColumn('lease_epoch', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureRunColumn('attempt_count', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureRunColumn('next_attempt_at', 'TEXT')
    this.ensureRunColumn('failure_classification', 'TEXT')
    this.ensureTableColumn('run_approval_requests', 'status', "TEXT NOT NULL DEFAULT 'pending'")
    this.ensureTableColumn('run_approval_requests', 'decided_at', 'TEXT')
    this.ensureTableColumn('run_approval_requests', 'receipt_id', 'TEXT')
    this.handle().exec(`CREATE INDEX IF NOT EXISTS idx_run_approval_requests_status
      ON run_approval_requests(run_id, status)`)
    this.migrateExecutionOutbox()
    this.migrateRunProjectionSchema()
  }

  private ensureRunColumn(name: string, definition: string): void {
    this.ensureTableColumn('runs', name, definition)
  }

  private ensureTableColumn(table: string, name: string, definition: string): void {
    const exists = (this.handle().pragma(`table_info(${table})`) as Array<{ name: string }>)
      .some((column) => column.name === name)
    if (!exists) {
      this.handle().exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
    }
  }

  private migrateExecutionOutbox(): void {
    const db = this.handle()
    const timestamp = this.nowIso()
    db.prepare(
      `INSERT OR IGNORE INTO run_execution_outbox (
        outbox_id, run_id, generation, kind, status, idempotency_key,
        payload_json, attempt_count, max_attempts, next_attempt_at, created_at, updated_at
      )
      SELECT
        'outbox_' || lower(hex(randomblob(16))), run_id, execution_generation,
        'run.advance',
        CASE WHEN status = 'running' THEN 'retryable' ELSE 'pending' END,
        'run.advance:' || run_id || ':' || execution_generation,
        '{}', attempt_count, 3, @timestamp, created_at, @timestamp
      FROM runs
      WHERE status IN ('queued', 'running')`,
    ).run({ timestamp })
  }

  private migrateRunProjectionSchema(): void {
    const db = this.handle()
    const currentVersion = Number(db.pragma('user_version', { simple: true }) ?? 0)
    if (currentVersion < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS runlog_projection_cursors (
          projection_name TEXT PRIMARY KEY,
          last_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runlog_run_summaries (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          event_count INTEGER NOT NULL DEFAULT 0,
          latest_seq INTEGER NOT NULL DEFAULT 0,
          assistant_text TEXT NOT NULL DEFAULT '',
          last_event_type TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(run_id)
        );

        CREATE INDEX IF NOT EXISTS idx_runlog_run_summaries_updated
          ON runlog_run_summaries(updated_at DESC, run_id DESC);
      `)
      db.prepare(`
        INSERT OR IGNORE INTO runlog_projection_cursors (projection_name, last_seq, updated_at)
        VALUES ('run-summary-v1', 0, @updatedAt)
      `).run({ updatedAt: this.nowIso() })
      db.pragma('user_version = 2')
      return
    }
    // Existing v2 databases can have a missing cursor after manual recovery.
    db.prepare(`
      INSERT OR IGNORE INTO runlog_projection_cursors (projection_name, last_seq, updated_at)
      VALUES ('run-summary-v1', 0, @updatedAt)
    `).run({ updatedAt: this.nowIso() })
  }

  private nowIso(): string {
    return this.now().toISOString()
  }

  private transactionStep(step: string): void {
    this.options.transactionHook?.(step)
  }

  putAgent(spec: AgentSpec): void {
    const db = this.handle()
    db.prepare(`
      INSERT INTO agents (agent_id, spec_json, updated_at)
      VALUES (@agentId, @specJson, @updatedAt)
      ON CONFLICT(agent_id) DO UPDATE SET
        spec_json = excluded.spec_json,
        updated_at = excluded.updated_at
    `).run({
      agentId: spec.agentId,
      specJson: JSON.stringify(spec),
      updatedAt: this.nowIso(),
    })
  }

  getAgent(agentId: string): AgentSpec | null {
    const row = this.handle()
      .prepare('SELECT spec_json FROM agents WHERE agent_id = ?')
      .get(agentId) as { spec_json: string } | undefined
    return row ? (JSON.parse(row.spec_json) as AgentSpec) : null
  }

  listAgents(): AgentSpec[] {
    return this.handle()
      .prepare('SELECT spec_json FROM agents ORDER BY agent_id')
      .all()
      .map((row) => JSON.parse((row as { spec_json: string }).spec_json) as AgentSpec)
  }

  createRun(intent: RunIntent, agent: AgentSpec): RunRecord {
    const runId = intent.runId ?? createRunLogId('run')
    const sessionId = intent.sessionId ?? createRunLogId('session')
    const createdAt = this.nowIso()
    const run: RunRecord = {
      runId,
      agentId: agent.agentId,
      sessionId,
      status: 'queued',
      input: intent.input,
      createdAt,
      updatedAt: createdAt,
      parentRunId: intent.parentRunId,
      workspaceId: intent.workspaceId,
      workspaceRoot: intent.workspaceRoot,
      providerId: intent.providerId ?? agent.providerId,
      modelId: intent.modelId ?? agent.modelId,
      credentialRef: intent.credentialRef,
      allowedTools: intent.allowedTools ? [...intent.allowedTools] : undefined,
      executionGeneration: 1,
      leaseEpoch: 0,
      attemptCount: 0,
      metadata: intent.metadata,
    }
    this.handle()
      .prepare(`
        INSERT INTO runs (
          run_id, agent_id, session_id, parent_run_id, status, input,
          workspace_id, workspace_root, provider_id, model_id, credential_ref, allowed_tools_json, metadata_json,
          created_at, updated_at
        )
        VALUES (
          @runId, @agentId, @sessionId, @parentRunId, @status, @input,
          @workspaceId, @workspaceRoot, @providerId, @modelId, @credentialRef, @allowedToolsJson, @metadataJson,
          @createdAt, @updatedAt
        )
      `)
      .run({
        runId,
        agentId: run.agentId,
        sessionId,
        parentRunId: run.parentRunId ?? null,
        status: run.status,
        input: run.input,
        workspaceId: run.workspaceId ?? null,
        workspaceRoot: run.workspaceRoot ?? null,
        providerId: run.providerId ?? null,
        modelId: run.modelId ?? null,
        credentialRef: run.credentialRef ?? null,
        allowedToolsJson: optionalJson(run.allowedTools),
        metadataJson: optionalJson(run.metadata),
        createdAt,
        updatedAt: createdAt,
      })
    return run
  }

  createQueuedRun(intent: RunIntent, agent: AgentSpec): RunRecord {
    const db = this.handle()
    return db.transaction(() => {
      const run = this.createRun(intent, agent)
      this.transactionStep('createQueuedRun.afterRun')
      this.appendEvent({
        runId: run.runId,
        type: 'run.created',
        payload: {
          agentId: run.agentId,
          sessionId: run.sessionId,
          parentRunId: run.parentRunId,
        },
        idempotencyKey: `run.created:${run.runId}`,
      })
      this.appendEvent({
        runId: run.runId,
        type: 'input.received',
        payload: {
          input: intent.input,
          requestedCapabilities: intent.requestedCapabilities ?? [],
        },
        idempotencyKey: `input.received:${run.runId}`,
      })
      this.appendEvent({
        runId: run.runId,
        type: 'run.queued',
        payload: {},
        idempotencyKey: `run.queued:${run.runId}`,
      })
      this.enqueueExecution(run.runId, run.executionGeneration ?? 1)
      this.transactionStep('createQueuedRun.beforeCommit')
      return this.getRun(run.runId) ?? run
    })()
  }

  private enqueueExecution(
    runId: string,
    generation: number,
    payload: Record<string, unknown> = {},
    maxAttempts = 3,
  ): ExecutionOutboxRecord {
    const timestamp = this.nowIso()
    const idempotencyKey = `run.advance:${runId}:${generation}`
    this.handle().prepare(
      `INSERT OR IGNORE INTO run_execution_outbox (
        outbox_id, run_id, generation, kind, status, idempotency_key,
        payload_json, attempt_count, max_attempts, next_attempt_at, created_at, updated_at
      ) VALUES (
        @outboxId, @runId, @generation, 'run.advance', 'pending', @idempotencyKey,
        @payloadJson, 0, @maxAttempts, @nextAttemptAt, @createdAt, @updatedAt
      )`,
    ).run({
      outboxId: createRunLogId('outbox'),
      runId,
      generation,
      idempotencyKey,
      payloadJson: JSON.stringify(payload),
      maxAttempts,
      nextAttemptAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const row = this.handle()
      .prepare('SELECT * FROM run_execution_outbox WHERE idempotency_key = ?')
      .get(idempotencyKey) as Record<string, unknown> | undefined
    if (!row) throw new Error(`Execution outbox enqueue failed: ${idempotencyKey}`)
    return mapExecutionOutbox(row)
  }

  getRun(runId: string): RunRecord | null {
    const row = this.handle().prepare('SELECT * FROM runs WHERE run_id = ?').get(runId)
    return row ? mapRun(row as Record<string, unknown>) : null
  }

  listRuns(input: ListRunsInput = {}): RunRecord[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (input.sessionId) {
      clauses.push('session_id = @sessionId')
      params.sessionId = input.sessionId
    }
    if (input.agentId) {
      clauses.push('agent_id = @agentId')
      params.agentId = input.agentId
    }
    const statuses = Array.isArray(input.status)
      ? input.status
      : input.status
        ? [input.status]
        : []
    if (Array.isArray(input.status) && statuses.length === 0) return []
    if (statuses.length > 0) {
      const placeholders = statuses.map((status, index) => {
        const key = `status${index}`
        params[key] = status
        return `@${key}`
      })
      clauses.push(`status IN (${placeholders.join(', ')})`)
    }
    if (input.limit !== undefined) {
      const limit = Math.floor(input.limit)
      if (!Number.isFinite(limit) || limit <= 0) return []
      params.limit = limit
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = input.limit === undefined ? '' : 'LIMIT @limit'
    return this.handle()
      .prepare(`SELECT * FROM runs ${where} ORDER BY created_at DESC, rowid DESC ${limit}`)
      .all(params)
      .map((row) => mapRun(row as Record<string, unknown>))
  }

  updateRunStatus(runId: string, status: RunStatus, patch: Partial<RunRecord> = {}): RunRecord {
    const existing = this.getRun(runId)
    if (!existing) throw new Error(`Unknown run: ${runId}`)
    const next = { ...existing, ...patch, status, updatedAt: this.nowIso() }
    this.handle()
      .prepare(`
        UPDATE runs SET
          status = @status,
          worker_id = @workerId,
          lease_until = @leaseUntil,
          metadata_json = @metadataJson,
          updated_at = @updatedAt
        WHERE run_id = @runId
      `)
      .run({
        runId,
        status,
        workerId: next.workerId ?? null,
        leaseUntil: next.leaseUntil ?? null,
        metadataJson: optionalJson(next.metadata),
        updatedAt: next.updatedAt,
      })
    return requireRun(this.handle().prepare('SELECT * FROM runs WHERE run_id = ?').get(runId))
  }

  transitionRunStatus(input: TransitionRunStatusInput): RunRecord | null {
    if (input.from.length === 0) return null
    const existing = this.getRun(input.runId)
    if (!existing) throw new Error(`Unknown run: ${input.runId}`)
    const next = { ...existing, ...(input.patch ?? {}), status: input.to, updatedAt: this.nowIso() }
    const params: Record<string, unknown> = {
      runId: input.runId,
      status: input.to,
      workerId: next.workerId ?? null,
      leaseUntil: next.leaseUntil ?? null,
      metadataJson: optionalJson(next.metadata),
      updatedAt: next.updatedAt,
    }
    const expected = input.from.map((status, index) => {
      const key = `expectedStatus${index}`
      params[key] = status
      return `@${key}`
    })
    const result = this.handle()
      .prepare(`
        UPDATE runs SET
          status = @status,
          worker_id = @workerId,
          lease_until = @leaseUntil,
          metadata_json = @metadataJson,
          updated_at = @updatedAt
        WHERE run_id = @runId
          AND status IN (${expected.join(', ')})
      `)
      .run(params)
    if (result.changes !== 1) return null
    return requireRun(this.handle().prepare('SELECT * FROM runs WHERE run_id = ?').get(input.runId))
  }

  claimNextRun(input: ClaimRunInput): RunRecord | null {
    return this.claimNextExecution({
      workerId: input.workerId,
      leaseMs: input.leaseMs,
      now: this.nowIso(),
    })?.run ?? null
  }

  claimNextExecution(input: ClaimExecutionInput): ExecutionClaim | null {
    const db = this.handle()
    return db.transaction(() => {
      const row = db.prepare(
        `SELECT o.*, r.lease_epoch AS run_lease_epoch
         FROM run_execution_outbox o
         JOIN runs r ON r.run_id = o.run_id
         WHERE r.status NOT IN ('completed', 'failed', 'cancelled', 'awaiting_approval')
           AND (
             (o.status IN ('pending', 'retryable') AND o.next_attempt_at <= @now)
             OR (o.status = 'claimed' AND o.claim_expires_at IS NOT NULL AND o.claim_expires_at <= @now)
           )
         ORDER BY o.next_attempt_at ASC, o.created_at ASC, o.outbox_id ASC
         LIMIT 1`,
      ).get({ now: input.now }) as Record<string, unknown> | undefined
      if (!row) return null

      const leaseEpoch = Number(row.run_lease_epoch ?? 0) + 1
      const attemptCount = Number(row.attempt_count ?? 0) + 1
      const claimToken = createRunLogId('claim')
      const leaseUntil = new Date(new Date(input.now).getTime() + input.leaseMs).toISOString()
      const claimed = db.prepare(
        `UPDATE run_execution_outbox SET
          status = 'claimed', attempt_count = @attemptCount,
          claimed_by = @workerId, claim_token = @claimToken,
          claim_expires_at = @leaseUntil, last_heartbeat_at = @now,
          updated_at = @now
         WHERE outbox_id = @outboxId
           AND (
             status IN ('pending', 'retryable')
             OR (status = 'claimed' AND claim_expires_at IS NOT NULL AND claim_expires_at <= @now)
           )`,
      ).run({
        outboxId: row.outbox_id,
        attemptCount,
        workerId: input.workerId,
        claimToken,
        leaseUntil,
        now: input.now,
      })
      if (claimed.changes !== 1) return null

      db.prepare(
        `UPDATE runs SET
          status = 'running', worker_id = @workerId, lease_until = @leaseUntil,
          lease_epoch = @leaseEpoch, attempt_count = @attemptCount,
          next_attempt_at = NULL, updated_at = @now
         WHERE run_id = @runId
           AND status IN ('queued', 'running')`,
      ).run({
        runId: row.run_id,
        workerId: input.workerId,
        leaseUntil,
        leaseEpoch,
        attemptCount,
        now: input.now,
      })
      this.appendEvent({
        runId: String(row.run_id),
        type: 'run.claimed',
        payload: {
          workerId: input.workerId,
          leaseUntil,
          leaseEpoch,
          attemptCount,
          recovered: row.status === 'claimed',
        },
        idempotencyKey: `run.claimed:${String(row.run_id)}:${leaseEpoch}`,
      })
      this.transactionStep('claimNextExecution.beforeCommit')
      const outbox = this.getExecutionOutbox(String(row.outbox_id))
      const run = this.getRun(String(row.run_id))
      if (!outbox || !run) throw new Error('Claimed execution disappeared before commit.')
      return { run, outbox, workerId: input.workerId, claimToken, leaseEpoch }
    })()
  }

  heartbeatExecution(input: ExecutionClaimInput & { now: string; leaseMs: number }): boolean {
    const db = this.handle()
    return db.transaction(() => {
      const leaseUntil = new Date(new Date(input.now).getTime() + input.leaseMs).toISOString()
      const updated = db.prepare(
        `UPDATE run_execution_outbox SET
          claim_expires_at = @leaseUntil, last_heartbeat_at = @now, updated_at = @now
         WHERE outbox_id = @outboxId AND run_id = @runId AND status = 'claimed'
           AND claimed_by = @workerId AND claim_token = @claimToken`,
      ).run({ ...input, leaseUntil })
      if (updated.changes !== 1) return false
      const runUpdated = db.prepare(
        `UPDATE runs SET lease_until = @leaseUntil, updated_at = @now
         WHERE run_id = @runId AND status = 'running' AND worker_id = @workerId
           AND lease_epoch = @leaseEpoch`,
      ).run({ ...input, leaseUntil })
      return runUpdated.changes === 1
    })()
  }

  acknowledgeExecution(
    input: ExecutionClaimInput,
    status: 'completed' | 'cancelled' = 'completed',
  ): boolean {
    const timestamp = this.nowIso()
    const result = this.handle().prepare(
      `UPDATE run_execution_outbox SET
        status = @status, completed_at = @timestamp, updated_at = @timestamp,
        claim_expires_at = NULL
       WHERE outbox_id = @outboxId AND run_id = @runId AND status = 'claimed'
         AND claimed_by = @workerId AND claim_token = @claimToken`,
    ).run({ ...input, status, timestamp })
    return result.changes === 1
  }

  scheduleExecutionRetry(input: {
    claim: ExecutionClaimInput
    failure: ExecutionFailure
    nextAttemptAt: string
  }): ExecutionOutboxRecord | null {
    const db = this.handle()
    return db.transaction(() => {
      const outbox = this.getExecutionOutbox(input.claim.outboxId)
      if (!outbox || !this.claimMatches(input.claim, outbox)) return null
      const exhausted = outbox.attemptCount >= outbox.maxAttempts
      if (exhausted) {
        this.failExecution({
          claim: input.claim,
          failure: { ...input.failure, retryable: false },
          idempotencySuffix: `retry-exhausted:${outbox.attemptCount}`,
        })
        return this.getExecutionOutbox(input.claim.outboxId)
      }
      const timestamp = this.nowIso()
      db.prepare(
        `UPDATE run_execution_outbox SET
          status = 'retryable', next_attempt_at = @nextAttemptAt,
          claimed_by = NULL, claim_token = NULL, claim_expires_at = NULL,
          last_error_classification = @classification,
          last_error_message = @message, last_error_retryable = 1,
          updated_at = @timestamp
         WHERE outbox_id = @outboxId AND status = 'claimed'
           AND claimed_by = @workerId AND claim_token = @claimToken`,
      ).run({
        ...input.claim,
        nextAttemptAt: input.nextAttemptAt,
        classification: input.failure.classification,
        message: input.failure.message,
        timestamp,
      })
      db.prepare(
        `UPDATE runs SET status = 'queued', worker_id = NULL, lease_until = NULL,
          next_attempt_at = @nextAttemptAt, failure_classification = @classification,
          updated_at = @timestamp
         WHERE run_id = @runId AND status = 'running' AND worker_id = @workerId
           AND lease_epoch = @leaseEpoch`,
      ).run({
        ...input.claim,
        nextAttemptAt: input.nextAttemptAt,
        classification: input.failure.classification,
        timestamp,
      })
      this.appendEvent({
        runId: input.claim.runId,
        type: 'run.retry.scheduled',
        payload: {
          attemptCount: outbox.attemptCount,
          maxAttempts: outbox.maxAttempts,
          nextAttemptAt: input.nextAttemptAt,
          classification: input.failure.classification,
          message: input.failure.message,
        },
        idempotencyKey: `run.retry.scheduled:${input.claim.runId}:${outbox.attemptCount}`,
      })
      this.transactionStep('scheduleExecutionRetry.beforeCommit')
      return this.getExecutionOutbox(input.claim.outboxId)
    })()
  }

  completeExecution(input: {
    claim: ExecutionClaimInput
    payload?: Record<string, unknown>
  }): RunRecord | null {
    const db = this.handle()
    return db.transaction(() => {
      const outbox = this.getExecutionOutbox(input.claim.outboxId)
      if (!outbox || !this.claimMatches(input.claim, outbox)) return null
      const timestamp = this.nowIso()
      const transitioned = db.prepare(
        `UPDATE runs SET status = 'completed', worker_id = NULL, lease_until = NULL,
          next_attempt_at = NULL, failure_classification = NULL, updated_at = @timestamp
         WHERE run_id = @runId AND status = 'running' AND worker_id = @workerId
           AND lease_epoch = @leaseEpoch`,
      ).run({ ...input.claim, timestamp })
      if (transitioned.changes !== 1) return null
      const acknowledged = this.acknowledgeExecution(input.claim, 'completed')
      if (!acknowledged) throw new Error('Execution claim was lost while completing the run.')
      this.appendEvent({
        runId: input.claim.runId,
        type: 'run.completed',
        payload: input.payload ?? {},
        idempotencyKey: `run.completed:${input.claim.runId}`,
      })
      this.transactionStep('completeExecution.beforeCommit')
      return this.getRun(input.claim.runId)
    })()
  }

  failExecution(input: {
    claim: ExecutionClaimInput
    failure: ExecutionFailure
    idempotencySuffix?: string
  }): RunRecord | null {
    const db = this.handle()
    return db.transaction(() => {
      const outbox = this.getExecutionOutbox(input.claim.outboxId)
      if (!outbox || !this.claimMatches(input.claim, outbox)) return null
      const timestamp = this.nowIso()
      const transitioned = db.prepare(
        `UPDATE runs SET status = 'failed', worker_id = NULL, lease_until = NULL,
          next_attempt_at = NULL, failure_classification = @classification,
          updated_at = @timestamp
         WHERE run_id = @runId AND status = 'running' AND worker_id = @workerId
           AND lease_epoch = @leaseEpoch`,
      ).run({ ...input.claim, classification: input.failure.classification, timestamp })
      if (transitioned.changes !== 1) return null
      db.prepare(
        `UPDATE run_execution_outbox SET status = 'failed', completed_at = @timestamp,
          claim_expires_at = NULL, last_error_classification = @classification,
          last_error_message = @message, last_error_retryable = @retryable,
          updated_at = @timestamp
         WHERE outbox_id = @outboxId AND status = 'claimed'
           AND claimed_by = @workerId AND claim_token = @claimToken`,
      ).run({
        ...input.claim,
        classification: input.failure.classification,
        message: input.failure.message,
        retryable: input.failure.retryable ? 1 : 0,
        timestamp,
      })
      const suffix = input.idempotencySuffix ?? `attempt:${outbox.attemptCount}`
      this.appendEvent({
        runId: input.claim.runId,
        type: 'runtime.error',
        payload: {
          message: input.failure.message,
          retryable: input.failure.retryable,
          classification: input.failure.classification,
          ...(input.failure.details ?? {}),
        },
        idempotencyKey: `runtime.error:${input.claim.runId}:${suffix}`,
      })
      this.appendEvent({
        runId: input.claim.runId,
        type: 'run.failed',
        payload: {
          message: input.failure.message,
          classification: input.failure.classification,
          ...(input.failure.details ?? {}),
        },
        idempotencyKey: `run.failed:${input.claim.runId}:${suffix}`,
      })
      this.transactionStep('failExecution.beforeCommit')
      return this.getRun(input.claim.runId)
    })()
  }

  cancelRunLifecycle(input: { runId: string; reason: string }): RunRecord {
    const db = this.handle()
    return db.transaction(() => {
      const run = this.getRun(input.runId)
      if (!run) throw new Error(`Unknown run: ${input.runId}`)
      if (['completed', 'failed', 'cancelled'].includes(run.status)) return run
      const timestamp = this.nowIso()
      db.prepare(
        `UPDATE runs SET status = 'cancelled', worker_id = NULL, lease_until = NULL,
          next_attempt_at = NULL, updated_at = @timestamp
         WHERE run_id = @runId AND status IN ('queued', 'running', 'awaiting_approval')`,
      ).run({ runId: input.runId, timestamp })
      db.prepare(
        `UPDATE run_execution_outbox SET status = 'cancelled', completed_at = @timestamp,
          claim_expires_at = NULL, updated_at = @timestamp
         WHERE run_id = @runId AND status IN ('pending', 'claimed', 'retryable')`,
      ).run({ runId: input.runId, timestamp })
      const pending = db.prepare(
        `SELECT approval_id, tool_call_id FROM run_approval_requests
         WHERE run_id = ? AND status = 'pending'`,
      ).all(input.runId) as Array<{ approval_id: string; tool_call_id: string }>
      db.prepare(
        `UPDATE run_approval_requests SET status = 'cancelled', decided_at = @timestamp
         WHERE run_id = @runId AND status = 'pending'`,
      ).run({ runId: input.runId, timestamp })
      for (const approval of pending) {
        this.appendEvent({
          runId: input.runId,
          type: 'approval.cancelled',
          payload: {
            approvalId: approval.approval_id,
            toolCallId: approval.tool_call_id,
            reason: input.reason,
          },
          idempotencyKey: `approval.cancelled:${approval.approval_id}`,
        })
      }
      this.appendEvent({
        runId: input.runId,
        type: 'run.cancelled',
        payload: { reason: input.reason },
        idempotencyKey: `run.cancelled:${input.runId}`,
      })
      this.transactionStep('cancelRunLifecycle.beforeCommit')
      return this.getRun(input.runId) ?? run
    })()
  }

  pauseRunForApproval(input: PauseRunForApprovalInput): RunRecord | null {
    const db = this.handle()
    return db.transaction(() => {
      const outbox = this.getExecutionOutbox(input.claim.outboxId)
      if (!outbox || !this.claimMatches(input.claim, outbox)) return null
      const timestamp = this.nowIso()
      const transitioned = db.prepare(
        `UPDATE runs SET status = 'awaiting_approval', worker_id = NULL, lease_until = NULL,
          updated_at = @timestamp
         WHERE run_id = @runId AND status = 'running' AND worker_id = @workerId
           AND lease_epoch = @leaseEpoch`,
      ).run({ ...input.claim, timestamp })
      if (transitioned.changes !== 1) return null
      this.putApprovalRequest(input.request)
      this.appendEvent({
        runId: input.claim.runId,
        type: 'approval.requested',
        payload: input.approvalEventPayload,
        idempotencyKey: `approval.requested:${input.request.approvalId}`,
      })
      this.appendCheckpointWithEvent(input.checkpoint)
      this.appendEvent({
        runId: input.claim.runId,
        type: 'run.awaiting_approval',
        payload: {
          approvalId: input.request.approvalId,
          toolCallId: input.request.toolCallId,
          targetKey: input.request.toolName,
        },
        idempotencyKey: `run.awaiting_approval:${input.request.approvalId}`,
      })
      const acknowledged = this.acknowledgeExecution(input.claim)
      if (!acknowledged) throw new Error('Execution claim was lost while pausing for approval.')
      this.transactionStep('pauseRunForApproval.beforeCommit')
      return this.getRun(input.claim.runId)
    })()
  }

  decideApprovalLifecycle(input: DecideApprovalLifecycleInput): RunLogApprovalReceipt {
    const db = this.handle()
    return db.transaction(() => {
      const request = this.getApprovalRequest(input.receipt.approvalId)
      if (!request) throw new Error(`Unknown RunLog approval request: ${input.receipt.approvalId}`)
      const run = this.getRun(request.runId)
      if (!run || run.status !== 'awaiting_approval') {
        throw new Error(`RunLog approval request ${request.approvalId} is not actionable.`)
      }
      const timestamp = this.nowIso()
      const decided = db.prepare(
        `UPDATE run_approval_requests SET status = @status, decided_at = @timestamp,
          receipt_id = @receiptId
         WHERE approval_id = @approvalId AND status = 'pending'`,
      ).run({
        approvalId: request.approvalId,
        status: input.receipt.decision,
        receiptId: input.receipt.receiptId,
        timestamp,
      })
      if (decided.changes !== 1) {
        throw new Error(`RunLog approval request ${request.approvalId} was already decided.`)
      }
      this.putApprovalReceipt(input.receipt)
      this.appendEvent({
        runId: request.runId,
        type: input.receipt.decision === 'approved' ? 'approval.approved' : 'approval.denied',
        payload: input.eventPayload,
        idempotencyKey: input.receipt.idempotencyKey,
      })
      if (input.receipt.decision === 'approved') {
        const generation = (run.executionGeneration ?? 1) + 1
        db.prepare(
          `UPDATE runs SET status = 'queued', worker_id = NULL, lease_until = NULL,
            execution_generation = @generation, next_attempt_at = NULL, updated_at = @timestamp
           WHERE run_id = @runId AND status = 'awaiting_approval'`,
        ).run({ runId: run.runId, generation, timestamp })
        this.enqueueExecution(run.runId, generation, { resumedFromApproval: request.approvalId })
        this.appendEvent({
          runId: run.runId,
          type: 'run.queued',
          payload: { resumedFromApproval: request.approvalId },
          idempotencyKey: `run.queued:${run.runId}:approval:${request.approvalId}`,
        })
      } else {
        db.prepare(
          `UPDATE runs SET status = 'failed', worker_id = NULL, lease_until = NULL,
            failure_classification = 'approval_denied', updated_at = @timestamp
           WHERE run_id = @runId AND status = 'awaiting_approval'`,
        ).run({ runId: run.runId, timestamp })
        this.appendEvent({
          runId: run.runId,
          type: 'run.failed',
          payload: { message: 'RunLog approval denied.', approvalId: request.approvalId },
          idempotencyKey: `run.failed:${run.runId}:approval-denied:${request.approvalId}`,
        })
      }
      this.transactionStep('decideApprovalLifecycle.beforeCommit')
      return input.receipt
    })()
  }

  getExecutionOutbox(outboxId: string): ExecutionOutboxRecord | null {
    const row = this.handle().prepare('SELECT * FROM run_execution_outbox WHERE outbox_id = ?')
      .get(outboxId) as Record<string, unknown> | undefined
    return row ? mapExecutionOutbox(row) : null
  }

  listExecutionOutbox(
    input: { runId?: string; status?: ExecutionOutboxStatus } = {},
  ): ExecutionOutboxRecord[] {
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
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.handle().prepare(
      `SELECT * FROM run_execution_outbox ${where} ORDER BY created_at, outbox_id`,
    ).all(params).map((row) => mapExecutionOutbox(row as Record<string, unknown>))
  }

  private claimMatches(input: ExecutionClaimInput, outbox: ExecutionOutboxRecord): boolean {
    return outbox.runId === input.runId
      && outbox.status === 'claimed'
      && outbox.claimedBy === input.workerId
      && outbox.claimToken === input.claimToken
  }

  appendEvent<TPayload = unknown>(input: AppendRunEventInput<TPayload>): RunLogEvent<TPayload> {
    const db = this.handle()
    return db.transaction(() => {
      const run = this.getRun(input.runId)
      if (!run) throw new Error(`Unknown run: ${input.runId}`)
      const existing = input.idempotencyKey
        ? (db
            .prepare('SELECT * FROM run_events WHERE idempotency_key = ?')
            .get(input.idempotencyKey) as Record<string, unknown> | undefined)
        : undefined
      if (existing) {
        if (input.type === 'run.queued' && run.status === 'queued') {
          this.enqueueExecution(run.runId, run.executionGeneration ?? 1)
        }
        return mapEvent(existing) as RunLogEvent<TPayload>
      }
      const eventId = createRunLogId('evt')
      db.prepare(`
        INSERT INTO run_events (
          event_id, run_id, agent_id, session_id, type, timestamp,
          payload_json, idempotency_key, visibility
        )
        VALUES (
          @eventId, @runId, @agentId, @sessionId, @type, @timestamp,
          @payloadJson, @idempotencyKey, @visibility
        )
      `).run({
        eventId,
        runId: run.runId,
        agentId: run.agentId,
        sessionId: run.sessionId,
        type: input.type,
        timestamp: this.nowIso(),
        payloadJson: JSON.stringify(input.payload ?? {}),
        idempotencyKey: input.idempotencyKey ?? null,
        visibility: input.visibility ?? 'public',
      })
      // Queue publication and durable execution intent are one SQLite commit,
      // including compatibility callers that still assemble lifecycle events directly.
      if (input.type === 'run.queued') {
        const current = this.getRun(run.runId)
        if (current?.status === 'queued') {
          this.enqueueExecution(run.runId, current.executionGeneration ?? 1)
        }
      }
      return mapEvent(
        db.prepare('SELECT * FROM run_events WHERE event_id = ?').get(eventId) as Record<
          string,
          unknown
        >,
      ) as RunLogEvent<TPayload>
    })()
  }

  listEvents(input: ListRunEventsInput = {}): RunLogEvent[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (input.runId) {
      clauses.push('run_id = @runId')
      params.runId = input.runId
    }
    if (input.sessionId) {
      clauses.push('session_id = @sessionId')
      params.sessionId = input.sessionId
    }
    if (typeof input.afterSeq === 'number') {
      clauses.push('seq > @afterSeq')
      params.afterSeq = input.afterSeq
    }
    if (typeof input.beforeSeq === 'number') {
      clauses.push('seq < @beforeSeq')
      params.beforeSeq = input.beforeSeq
    }
    if (input.types) {
      if (input.types.length === 0) return []
      const placeholders = input.types.map((type, index) => {
        const key = `type${index}`
        params[key] = type
        return `@${key}`
      })
      clauses.push(`type IN (${placeholders.join(', ')})`)
    }
    params.limit = input.limit ?? 500
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = input.order === 'desc' ? 'DESC' : 'ASC'
    return this.handle()
      .prepare(`SELECT * FROM run_events ${where} ORDER BY seq ${order} LIMIT @limit`)
      .all(params)
      .map((row) => mapEvent(row as Record<string, unknown>))
  }

  countEvents(input: Omit<ListRunEventsInput, 'limit'> = {}): number {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (input.runId) {
      clauses.push('run_id = @runId')
      params.runId = input.runId
    }
    if (input.sessionId) {
      clauses.push('session_id = @sessionId')
      params.sessionId = input.sessionId
    }
    if (typeof input.afterSeq === 'number') {
      clauses.push('seq > @afterSeq')
      params.afterSeq = input.afterSeq
    }
    if (typeof input.beforeSeq === 'number') {
      clauses.push('seq < @beforeSeq')
      params.beforeSeq = input.beforeSeq
    }
    if (input.types) {
      if (input.types.length === 0) return 0
      const placeholders = input.types.map((type, index) => {
        const key = `type${index}`
        params[key] = type
        return `@${key}`
      })
      clauses.push(`type IN (${placeholders.join(', ')})`)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const row = this.handle()
      .prepare(`SELECT COUNT(*) AS count FROM run_events ${where}`)
      .get(params) as { count: number }
    return Number(row.count)
  }

  latestEventSeq(runId: string): number {
    const row = this.handle()
      .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM run_events WHERE run_id = ?')
      .get(runId) as { seq: number }
    return Number(row.seq)
  }

  catchUpRunProjection(input: { limit?: number } = {}): RunLogProjectionCatchupResult {
    const db = this.handle()
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 1_000), 1), 10_000)
    return db.transaction(() => {
      const cursor = db.prepare(`
        SELECT last_seq FROM runlog_projection_cursors WHERE projection_name = 'run-summary-v1'
      `).get() as { last_seq: number } | undefined
      const lastSeq = Number(cursor?.last_seq ?? 0)
      const rows = db.prepare(`
        SELECT * FROM run_events WHERE seq > @lastSeq ORDER BY seq ASC LIMIT @limit
      `).all({ lastSeq, limit }) as Array<Record<string, unknown>>
      if (rows.length === 0) {
        return { projectionName: 'run-summary-v1' as const, processedEvents: 0, lastSeq }
      }

      for (const row of rows) {
        const event = mapEvent(row)
        const existing = db.prepare(`
          SELECT * FROM runlog_run_summaries WHERE run_id = ?
        `).get(event.runId) as Record<string, unknown> | undefined
        const run = this.getRun(event.runId)
        const prior = existing ? mapRunProjectionSummary(existing) : undefined
        const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown>
          : {}
        const assistantText = event.type === 'assistant.result' && typeof payload.text === 'string'
          ? payload.text
          : event.type === 'assistant.delta' && typeof payload.text === 'string'
            ? `${prior?.assistantText ?? ''}${payload.text}`
            : prior?.assistantText ?? ''
        const status = projectionStatusForEvent(event, prior?.status ?? run?.status ?? 'queued')
        db.prepare(`
          INSERT INTO runlog_run_summaries (
            run_id, status, event_count, latest_seq, assistant_text, last_event_type, updated_at
          ) VALUES (
            @runId, @status, 1, @latestSeq, @assistantText, @lastEventType, @updatedAt
          )
          ON CONFLICT(run_id) DO UPDATE SET
            status = excluded.status,
            event_count = runlog_run_summaries.event_count + 1,
            latest_seq = excluded.latest_seq,
            assistant_text = excluded.assistant_text,
            last_event_type = excluded.last_event_type,
            updated_at = excluded.updated_at
        `).run({
          runId: event.runId,
          status,
          latestSeq: event.seq,
          assistantText,
          lastEventType: event.type,
          updatedAt: event.timestamp,
        })
      }

      const nextSeq = Number(rows.at(-1)?.seq ?? lastSeq)
      db.prepare(`
        UPDATE runlog_projection_cursors
        SET last_seq = @nextSeq, updated_at = @updatedAt
        WHERE projection_name = 'run-summary-v1'
      `).run({ nextSeq, updatedAt: this.nowIso() })
      return {
        projectionName: 'run-summary-v1' as const,
        processedEvents: rows.length,
        lastSeq: nextSeq,
      }
    })()
  }

  getRunProjectionSummary(runId: string): RunLogRunSummary | null {
    const row = this.handle().prepare(`
      SELECT * FROM runlog_run_summaries WHERE run_id = ?
    `).get(runId) as Record<string, unknown> | undefined
    return row ? mapRunProjectionSummary(row) : null
  }

  appendCheckpoint(input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp'>): RunCheckpoint {
    const checkpoint: RunCheckpoint = {
      ...input,
      checkpointId: createRunLogId('ckpt'),
      timestamp: this.nowIso(),
    }
    this.handle()
      .prepare(
        `
          INSERT INTO run_checkpoints (checkpoint_id, run_id, seq, kind, state_json, timestamp)
          VALUES (@checkpointId, @runId, @seq, @kind, @stateJson, @timestamp)
        `,
      )
      .run({
        checkpointId: checkpoint.checkpointId,
        runId: checkpoint.runId,
        seq: checkpoint.seq,
        kind: checkpoint.kind,
        stateJson: JSON.stringify(checkpoint.state),
        timestamp: checkpoint.timestamp,
      })
    return checkpoint
  }

  appendCheckpointWithEvent(
    input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp' | 'seq'>,
  ): RunCheckpoint {
    const db = this.handle()
    return db.transaction(() => {
      const seq = this.latestEventSeq(input.runId)
      const checkpoint = this.appendCheckpoint({ ...input, seq })
      this.appendEvent({
        runId: input.runId,
        type: 'checkpoint.saved',
        payload: { kind: input.kind, seq },
        idempotencyKey: `checkpoint.saved:${checkpoint.checkpointId}`,
      })
      return checkpoint
    })()
  }

  latestCheckpoint(runId: string): RunCheckpoint | null {
    const row = this.handle()
      .prepare('SELECT * FROM run_checkpoints WHERE run_id = ? ORDER BY seq DESC LIMIT 1')
      .get(runId) as Record<string, unknown> | undefined
    return row ? mapCheckpoint(row) : null
  }

  putApprovalRequest(snapshot: RunLogApprovalRequestSnapshot): void {
    this.handle()
      .prepare(
        `
          INSERT INTO run_approval_requests (
            approval_id, run_id, tool_call_id, snapshot_json, status, created_at
          )
          VALUES (@approvalId, @runId, @toolCallId, @snapshotJson, 'pending', @createdAt)
          ON CONFLICT(approval_id) DO UPDATE SET
            snapshot_json = excluded.snapshot_json
        `,
      )
      .run({
        approvalId: snapshot.approvalId,
        runId: snapshot.runId,
        toolCallId: snapshot.toolCallId,
        snapshotJson: JSON.stringify(snapshot),
        createdAt: snapshot.requestedAt,
      })
  }

  getApprovalRequest(approvalId: string): RunLogApprovalRequestSnapshot | null {
    const row = this.handle()
      .prepare('SELECT * FROM run_approval_requests WHERE approval_id = ?')
      .get(approvalId) as Record<string, unknown> | undefined
    return row ? mapApprovalRequest(row) : null
  }

  putApprovalReceipt(receipt: RunLogApprovalReceipt): void {
    this.handle()
      .prepare(
        `
          INSERT INTO run_approval_receipts (
            receipt_id, approval_id, run_id, decision, receipt_json, used_at, created_at
          )
          VALUES (
            @receiptId, @approvalId, @runId, @decision, @receiptJson, NULL, @createdAt
          )
          ON CONFLICT(approval_id, decision) DO UPDATE SET
            receipt_json = excluded.receipt_json,
            created_at = excluded.created_at
        `,
      )
      .run({
        receiptId: receipt.receiptId,
        approvalId: receipt.approvalId,
        runId: receipt.runId,
        decision: receipt.decision,
        receiptJson: JSON.stringify(receipt),
        createdAt: receipt.decidedAt,
      })
  }

  getApprovalReceipt(receiptId: string): RunLogApprovalReceipt | null {
    const row = this.handle()
      .prepare('SELECT * FROM run_approval_receipts WHERE receipt_id = ?')
      .get(receiptId) as Record<string, unknown> | undefined
    return row ? mapApprovalReceipt(row) : null
  }

  getApprovedUnusedReceipt(runId: string): RunLogApprovalReceipt | null {
    const row = this.handle()
      .prepare(
        `
          SELECT * FROM run_approval_receipts
          WHERE run_id = ? AND decision = 'approved' AND used_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        `,
      )
      .get(runId) as Record<string, unknown> | undefined
    return row ? mapApprovalReceipt(row) : null
  }

  markApprovalReceiptUsed(receiptId: string, runId: string): boolean {
    const result = this.handle()
      .prepare(
        `
          UPDATE run_approval_receipts
          SET used_at = @usedAt
          WHERE receipt_id = @receiptId AND run_id = @runId AND used_at IS NULL
        `,
      )
      .run({
        receiptId,
        runId,
        usedAt: this.nowIso(),
      })
    return result.changes === 1
  }

  putCronJob(job: RunLogCronJob): void {
    if (job.intervalMs <= 0) throw new Error('Cron intervalMs must be positive')
    if (!this.getAgent(job.agentId)) throw new Error(`Unknown cron agent: ${job.agentId}`)
    this.handle()
      .prepare(
        `
          INSERT INTO run_cron_jobs (
            cron_id, agent_id, input, interval_ms, next_run_at, enabled,
            session_id, workspace_id, metadata_json, updated_at
          )
          VALUES (
            @cronId, @agentId, @input, @intervalMs, @nextRunAt, @enabled,
            @sessionId, @workspaceId, @metadataJson, @updatedAt
          )
          ON CONFLICT(cron_id) DO UPDATE SET
            agent_id = excluded.agent_id,
            input = excluded.input,
            interval_ms = excluded.interval_ms,
            next_run_at = excluded.next_run_at,
            enabled = excluded.enabled,
            session_id = excluded.session_id,
            workspace_id = excluded.workspace_id,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        cronId: job.cronId,
        agentId: job.agentId,
        input: job.input,
        intervalMs: job.intervalMs,
        nextRunAt: job.nextRunAt,
        enabled: job.enabled ? 1 : 0,
        sessionId: job.sessionId ?? null,
        workspaceId: job.workspaceId ?? null,
        metadataJson: optionalJson(job.metadata),
        updatedAt: this.nowIso(),
      })
  }

  listDueCronJobs(now = new Date()): RunLogCronJob[] {
    return this.handle()
      .prepare(
        `
          SELECT * FROM run_cron_jobs
          WHERE enabled = 1 AND next_run_at <= @now
          ORDER BY next_run_at ASC
        `,
      )
      .all({ now: now.toISOString() })
      .map((row) => mapCronJob(row as Record<string, unknown>))
  }

  enqueueDueCronRuns(now = new Date()): RunRecord[] {
    const db = this.handle()
    return db.transaction(() => {
      const due = this.listDueCronJobs(now)
      const runs: RunRecord[] = []
      for (const job of due) {
        const agent = this.getAgent(job.agentId)
        if (!agent) continue
        const decision = decideRunLogCron({ job, agent, now })
        const run = this.createRun(
          {
            agentId: job.agentId,
            input: job.input,
            sessionId: job.sessionId,
            workspaceId: job.workspaceId,
            allowedTools: Array.isArray(decision.metadata?.allowedTools)
              ? [...decision.metadata.allowedTools]
              : [],
            metadata: {
              ...job.metadata,
              cronId: job.cronId,
              headless: true,
              cronMode: job.metadata?.cronMode ?? (agent.tools?.length ? 'deny' : 'allowlist'),
              cronDecisionId: decision.decisionId,
            },
          },
          agent,
        )
        const runDecision = decisionRecordForRun(decision, run.runId, run.sessionId)
        this.appendEvent({
          runId: run.runId,
          type: 'run.created',
          payload: { agentId: run.agentId, sessionId: run.sessionId, source: 'cron', headless: true },
          idempotencyKey: `run.created:${run.runId}`,
        })
        this.appendEvent({
          runId: run.runId,
          type: 'cron.due',
          payload: {
            cronId: job.cronId,
            dueAt: job.nextRunAt,
            headless: true,
            decisionId: runDecision.decisionId,
          },
        })
        this.appendEvent({
          runId: run.runId,
          type: 'policy.decision.recorded',
          payload: runDecision,
          idempotencyKey: `policy.decision.recorded:${runDecision.decisionId}`,
        })
        if (runDecision.state === 'allow') {
          this.appendEvent({
            runId: run.runId,
            type: 'input.received',
            payload: { input: job.input, source: 'cron' },
            idempotencyKey: `input.received:${run.runId}`,
          })
          this.appendEvent({
            runId: run.runId,
            type: 'run.queued',
            payload: { source: 'cron', decisionId: runDecision.decisionId },
            idempotencyKey: `run.queued:${run.runId}`,
          })
          this.enqueueExecution(run.runId, run.executionGeneration ?? 1, {
            source: 'cron',
            cronId: job.cronId,
          })
        } else {
          this.updateRunStatus(run.runId, 'failed')
          this.appendEvent({
            runId: run.runId,
            type: 'run.failed',
            payload: {
              source: 'cron',
              cronId: job.cronId,
              decisionId: runDecision.decisionId,
              state: runDecision.state,
              reasons: runDecision.reasons,
            },
            idempotencyKey: `run.failed:${run.runId}:cron-policy`,
          })
        }
        const nextRunAt = new Date(now.getTime() + job.intervalMs).toISOString()
        const nextMetadata = cronMetadataWithDecision(job.metadata, runDecision, {
          incrementGrantUse: runDecision.state === 'allow' && Boolean(job.metadata?.cronGrant),
        })
        db.prepare(
          `
            UPDATE run_cron_jobs
            SET next_run_at = @nextRunAt, metadata_json = @metadataJson, updated_at = @updatedAt
            WHERE cron_id = @cronId
          `,
        ).run({
          cronId: job.cronId,
          nextRunAt,
          metadataJson: optionalJson(nextMetadata),
          updatedAt: this.nowIso(),
        })
        runs.push(this.getRun(run.runId) ?? run)
      }
      return runs
    })()
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private handle(): DatabaseHandle {
    this.initialize()
    if (!this.db) throw new Error('SQLite RunLog store failed to initialize')
    return this.db
  }
}

export function createSqliteRunLogStore(dbPath: string): SqliteRunLogStore {
  const store = new SqliteRunLogStore({ dbPath })
  store.initialize()
  return store
}
