import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import { createRunLogId, nowIso } from '../../core/ids.js'
import type {
  AgentSpec,
  AppendRunEventInput,
  ClaimRunInput,
  ListRunEventsInput,
  RunCheckpoint,
  RunIntent,
  RunLogApprovalReceipt,
  RunLogApprovalRequestSnapshot,
  RunLogEvent,
  RunLogStore,
  RunRecord,
  RunStatus,
} from '../../core/types.js'
import type { RunLogCronJob, RunLogCronStore } from '../../capabilities/cron/RunLogCron.js'

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
  if (row.worker_id) run.workerId = String(row.worker_id)
  if (row.lease_until) run.leaseUntil = String(row.lease_until)
  return run
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
}

export class SqliteRunLogStore implements RunLogStore, RunLogCronStore {
  private db: DatabaseHandle | null = null

  constructor(private readonly options: SqliteRunLogStoreOptions) {}

  initialize(): void {
    if (this.db) return
    fs.mkdirSync(path.dirname(path.resolve(this.options.dbPath)), { recursive: true })
    this.db = new Database(this.options.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
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
        worker_id TEXT,
        lease_until TEXT,
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
    `)
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
      updatedAt: nowIso(),
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
    const createdAt = nowIso()
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
      metadata: intent.metadata,
    }
    this.handle()
      .prepare(`
        INSERT INTO runs (
          run_id, agent_id, session_id, parent_run_id, status, input,
          workspace_id, workspace_root, provider_id, model_id, metadata_json,
          created_at, updated_at
        )
        VALUES (
          @runId, @agentId, @sessionId, @parentRunId, @status, @input,
          @workspaceId, @workspaceRoot, @providerId, @modelId, @metadataJson,
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
        metadataJson: optionalJson(run.metadata),
        createdAt,
        updatedAt: createdAt,
      })
    return run
  }

  getRun(runId: string): RunRecord | null {
    const row = this.handle().prepare('SELECT * FROM runs WHERE run_id = ?').get(runId)
    return row ? mapRun(row as Record<string, unknown>) : null
  }

  updateRunStatus(runId: string, status: RunStatus, patch: Partial<RunRecord> = {}): RunRecord {
    const existing = this.getRun(runId)
    if (!existing) throw new Error(`Unknown run: ${runId}`)
    const next = { ...existing, ...patch, status, updatedAt: nowIso() }
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

  claimNextRun(input: ClaimRunInput): RunRecord | null {
    const db = this.handle()
    const claim = db.transaction(() => {
      const now = nowIso()
      const row = db
        .prepare(
          `
            SELECT * FROM runs
            WHERE status = 'queued'
              OR (status = 'running' AND lease_until IS NOT NULL AND lease_until < @now)
            ORDER BY created_at ASC
            LIMIT 1
          `,
        )
        .get({ now }) as Record<string, unknown> | undefined
      if (!row) return null
      const leaseUntil = new Date(Date.now() + input.leaseMs).toISOString()
      db.prepare(
        `
          UPDATE runs SET
            status = 'running',
            worker_id = @workerId,
            lease_until = @leaseUntil,
            updated_at = @updatedAt
          WHERE run_id = @runId
        `,
      ).run({
        runId: row.run_id,
        workerId: input.workerId,
        leaseUntil,
        updatedAt: now,
      })
      return db.prepare('SELECT * FROM runs WHERE run_id = ?').get(row.run_id) as
        | Record<string, unknown>
        | undefined
    })
    const row = claim()
    return row ? mapRun(row) : null
  }

  appendEvent<TPayload = unknown>(input: AppendRunEventInput<TPayload>): RunLogEvent<TPayload> {
    const db = this.handle()
    const run = this.getRun(input.runId)
    if (!run) throw new Error(`Unknown run: ${input.runId}`)
    const existing = input.idempotencyKey
      ? (db
          .prepare('SELECT * FROM run_events WHERE idempotency_key = ?')
          .get(input.idempotencyKey) as Record<string, unknown> | undefined)
      : undefined
    if (existing) return mapEvent(existing) as RunLogEvent<TPayload>
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
      timestamp: nowIso(),
      payloadJson: JSON.stringify(input.payload ?? {}),
      idempotencyKey: input.idempotencyKey ?? null,
      visibility: input.visibility ?? 'public',
    })
    return mapEvent(
      db.prepare('SELECT * FROM run_events WHERE event_id = ?').get(eventId) as Record<
        string,
        unknown
      >,
    ) as RunLogEvent<TPayload>
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
    params.limit = input.limit ?? 500
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.handle()
      .prepare(`SELECT * FROM run_events ${where} ORDER BY seq ASC LIMIT @limit`)
      .all(params)
      .map((row) => mapEvent(row as Record<string, unknown>))
  }

  appendCheckpoint(input: Omit<RunCheckpoint, 'checkpointId' | 'timestamp'>): RunCheckpoint {
    const checkpoint: RunCheckpoint = {
      ...input,
      checkpointId: createRunLogId('ckpt'),
      timestamp: nowIso(),
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
            approval_id, run_id, tool_call_id, snapshot_json, created_at
          )
          VALUES (@approvalId, @runId, @toolCallId, @snapshotJson, @createdAt)
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
        usedAt: nowIso(),
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
        updatedAt: nowIso(),
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
        const run = this.createRun(
          {
            agentId: job.agentId,
            input: job.input,
            sessionId: job.sessionId,
            workspaceId: job.workspaceId,
            metadata: { ...job.metadata, cronId: job.cronId },
          },
          agent,
        )
        this.appendEvent({
          runId: run.runId,
          type: 'run.created',
          payload: { agentId: run.agentId, sessionId: run.sessionId, source: 'cron' },
          idempotencyKey: `run.created:${run.runId}`,
        })
        this.appendEvent({
          runId: run.runId,
          type: 'cron.due',
          payload: { cronId: job.cronId, dueAt: job.nextRunAt },
        })
        this.appendEvent({
          runId: run.runId,
          type: 'input.received',
          payload: { input: job.input, source: 'cron' },
          idempotencyKey: `input.received:${run.runId}`,
        })
        this.appendEvent({
          runId: run.runId,
          type: 'run.queued',
          payload: { source: 'cron' },
          idempotencyKey: `run.queued:${run.runId}`,
        })
        const nextRunAt = new Date(now.getTime() + job.intervalMs).toISOString()
        db.prepare(
          `
            UPDATE run_cron_jobs
            SET next_run_at = @nextRunAt, updated_at = @updatedAt
            WHERE cron_id = @cronId
          `,
        ).run({ cronId: job.cronId, nextRunAt, updatedAt: nowIso() })
        runs.push(run)
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
