import fs from 'node:fs'
import path from 'node:path'
import {
  MainspringEventSchema,
  GatewayRunDispatchSchema,
  OutboundMailboxKindSchema,
  assertMailboxStoreOwner,
  inboundMailboxRowFromSql,
  parseJsonValue,
  redactRuntimeSensitiveText,
  resolveSessionMailboxPaths,
  sanitizeRuntimeResponse,
  type MainspringEvent,
  type InboundMailboxRow,
  type MailboxAckStatus,
  type OutboundMailboxRow,
  type SessionMailboxPaths,
} from '#protocol'
import {
  applyEventsMailboxSchema,
  applyInboundMailboxSchema,
  applyOutboundMailboxSchema,
} from './MailboxSchema.js'
import { createMailboxMessageId, mailboxNowIso, openMailboxDb } from './SqliteMailboxStore.js'

export type { MailboxAckStatus }

export type InboundMessage = InboundMailboxRow & {
  dispatch: ReturnType<typeof GatewayRunDispatchSchema.safeParse>
}

export type RuntimeEventRow = {
  seq: number
  runId: string
  sessionId: string
  type: string
  timestamp: string
  event: MainspringEvent
}

export type RuntimeTaskPromptRow = {
  id: string
  runId: string
  sessionId: string
  timestamp: string
  prompt: string
}

export interface RecoverStaleProcessingAcksOptions {
  staleAfterMs?: number
  now?: Date
}

const DEFAULT_STALE_PROCESSING_ACK_MS = 15 * 60 * 1000
const MAX_TRACKED_SESSION_MUTATION_REVISIONS = 256
let mailboxChangeRevision = 0
const mailboxChangeRevisionBySessionPath = new Map<string, number>()

function recordMailboxMutation(sessionPath: string): void {
  mailboxChangeRevision += 1
  const normalizedSessionPath = path.resolve(sessionPath)
  // Refresh insertion order so active sessions remain in the bounded index.
  mailboxChangeRevisionBySessionPath.delete(normalizedSessionPath)
  mailboxChangeRevisionBySessionPath.set(normalizedSessionPath, mailboxChangeRevision)
  while (mailboxChangeRevisionBySessionPath.size > MAX_TRACKED_SESSION_MUTATION_REVISIONS) {
    const oldestSessionPath = mailboxChangeRevisionBySessionPath.keys().next().value
    if (!oldestSessionPath) break
    mailboxChangeRevisionBySessionPath.delete(oldestSessionPath)
  }
}

function redactRuntimeProviderSessionIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactRuntimeProviderSessionIds(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /^provider[-_]?session[-_]?id$/i.test(key)
        ? '[redacted]'
        : redactRuntimeProviderSessionIds(entry),
    ]),
  )
}

function sanitizeStoredRuntimeValue(value: unknown): unknown {
  return redactRuntimeProviderSessionIds(sanitizeRuntimeResponse(value))
}

function sanitizeOutboundContent(content: string): string {
  try {
    return JSON.stringify(sanitizeStoredRuntimeValue(JSON.parse(content) as unknown))
  } catch {
    return redactRuntimeSensitiveText(content)
  }
}

function withDb<T>(
  path: string,
  fn: (db: ReturnType<typeof openMailboxDb>) => T,
  readonly = false,
): T {
  const db = openMailboxDb(path, readonly)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

export class MainspringMailbox {
  constructor(readonly paths: SessionMailboxPaths) {}

  static fromSessionPath(sessionPath: string): MainspringMailbox {
    return new MainspringMailbox(resolveSessionMailboxPaths(sessionPath))
  }

  /**
   * Process-local mutation token for lightweight host projections. It is not
   * persisted and therefore must be paired with a compatibility probe when a
   * separate legacy process can write mailbox databases.
   */
  static changeRevision(): number {
    return mailboxChangeRevision
  }

  /**
   * Most gateway caches only need to invalidate the session whose mailbox
   * changed. The bounded index complements the global revision used by broad
   * snapshot revalidation; an evicted entry simply falls back to the external
   * file/WAL probe rather than making a freshness claim.
   */
  static changeRevisionForSessionPath(sessionPath: string): number | undefined {
    return mailboxChangeRevisionBySessionPath.get(path.resolve(sessionPath))
  }

  ensureRunnerOwnedStores(): void {
    assertMailboxStoreOwner('outbox', 'runner')
    assertMailboxStoreOwner('outbound', 'runner')
    assertMailboxStoreOwner('events', 'runner')
    fs.mkdirSync(this.paths.sessionPath, { recursive: true })
    fs.mkdirSync(this.paths.outboxPath, { recursive: true })
    applyOutboundMailboxSchema(this.paths.outboundDbPath)
    applyEventsMailboxSchema(this.paths.eventsDbPath)
  }

  ensureAllStoresForFixture(): void {
    fs.mkdirSync(this.paths.sessionPath, { recursive: true })
    fs.mkdirSync(this.paths.inboxPath, { recursive: true })
    applyInboundMailboxSchema(this.paths.inboundDbPath)
    this.ensureRunnerOwnedStores()
  }

  readPending(limit = 1): InboundMessage[] {
    this.ensureRunnerOwnedStores()
    const inbound = openMailboxDb(this.paths.inboundDbPath, true)
    const outbound = openMailboxDb(this.paths.outboundDbPath)
    try {
      const rows = inbound
        .prepare(
          `SELECT id, run_id, session_id, kind, timestamp, status, status_changed,
                  process_after, recurrence, tries, trigger, content
             FROM messages_in
            WHERE status = 'pending'
              AND (process_after IS NULL OR datetime(process_after) <= datetime('now'))
            ORDER BY timestamp ASC`,
        )
        .all() as unknown[]

      if (rows.length === 0) return []

      const acked = new Set(
        (
          outbound
            .prepare(
              `SELECT message_id FROM processing_ack WHERE status IN ('processing', 'completed')`,
            )
            .all() as Array<{ message_id: string }>
        ).map((row) => row.message_id),
      )

      return rows
        .map((row) => inboundMailboxRowFromSql(row))
        .filter((row) => !acked.has(row.id))
        .slice(0, limit)
        .map((row) => ({
          ...row,
          dispatch: GatewayRunDispatchSchema.safeParse(
            parseJsonValue<unknown>(row.content, row.content),
          ),
        }))
    } finally {
      inbound.close()
      outbound.close()
    }
  }

  markAck(messageId: string, status: MailboxAckStatus, error?: string): void {
    this.ensureRunnerOwnedStores()
    withDb(this.paths.outboundDbPath, (db) =>
      db
        .prepare(
          `INSERT INTO processing_ack (message_id, status, status_changed, error)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           status = excluded.status,
           status_changed = excluded.status_changed,
           error = excluded.error`,
        )
        .run(messageId, status, mailboxNowIso(), error ? redactRuntimeSensitiveText(error) : null),
    )
    recordMailboxMutation(this.paths.sessionPath)
  }

  recoverStaleProcessingAcks(options: RecoverStaleProcessingAcksOptions = {}): number {
    this.ensureRunnerOwnedStores()
    const staleAfterMs = Math.max(
      1,
      Math.floor(options.staleAfterMs ?? DEFAULT_STALE_PROCESSING_ACK_MS),
    )
    const now = options.now ?? new Date()
    const recoveredAt = now.toISOString()
    const recovered = withDb(this.paths.outboundDbPath, (db) => {
      const rows = db
        .prepare(
          `SELECT message_id, status_changed
             FROM processing_ack
            WHERE status = 'processing'`,
        )
        .all() as Array<{ message_id: string; status_changed: string }>
      const staleMessageIds = rows
        .filter((row) => {
          const changedAtMs = Date.parse(row.status_changed)
          return !Number.isFinite(changedAtMs) || now.getTime() - changedAtMs >= staleAfterMs
        })
        .map((row) => row.message_id)

      if (staleMessageIds.length === 0) return 0

      const update = db.prepare(
        `UPDATE processing_ack
            SET status = 'failed',
                status_changed = ?,
                error = ?
          WHERE message_id = ?`,
      )
      const error = redactRuntimeSensitiveText(
        'Recovered stale processing ack after runner restart.',
      )
      const transaction = db.transaction((messageIds: string[]) => {
        for (const messageId of messageIds) update.run(recoveredAt, error, messageId)
      })
      transaction(staleMessageIds)
      return staleMessageIds.length
    })
    if (recovered > 0) recordMailboxMutation(this.paths.sessionPath)
    return recovered
  }

  writeOutbound(row: {
    runId: string
    sessionId: string
    inReplyTo?: string | null
    kind: OutboundMailboxRow['kind']
    content: string
  }): string {
    this.ensureRunnerOwnedStores()
    const kind = OutboundMailboxKindSchema.parse(row.kind)
    const content = sanitizeOutboundContent(row.content)
    const id = createMailboxMessageId('out')
    withDb(this.paths.outboundDbPath, (db) =>
      db
        .prepare(
          `INSERT INTO messages_out (
          id, run_id, session_id, in_reply_to, timestamp, delivered, deliver_after, kind, content
        ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
        )
        .run(id, row.runId, row.sessionId, row.inReplyTo ?? null, mailboxNowIso(), kind, content),
    )
    recordMailboxMutation(this.paths.sessionPath)
    return id
  }

  readRecentAssistantMessages(sessionId: string, limit = 6, runId?: string): string[] {
    this.ensureRunnerOwnedStores()
    return withDb(
      this.paths.outboundDbPath,
      (db) => {
        const rows = db
          .prepare(
            `SELECT content
             FROM messages_out
            WHERE session_id = ?
              AND (? IS NULL OR run_id = ?)
              AND kind = 'assistant_message'
            ORDER BY timestamp DESC, id DESC
            LIMIT ?`,
          )
          .all(sessionId, runId ?? null, runId ?? null, limit) as Array<{ content: string }>

        return rows
          .reverse()
          .map((row) => {
            try {
              const parsed = JSON.parse(row.content) as { text?: unknown }
              return typeof parsed.text === 'string' ? parsed.text.trim() : ''
            } catch {
              return row.content.trim()
            }
          })
          .filter(Boolean)
      },
      true,
    )
  }

  readRunTaskPrompts(input: {
    sessionId: string
    runId: string
    beforeTimestamp?: string
    limit?: number
  }): RuntimeTaskPromptRow[] {
    this.ensureRunnerOwnedStores()
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 25), 100))
    return withDb(
      this.paths.inboundDbPath,
      (db) => {
        const rows = db
          .prepare(
            `SELECT id, run_id, session_id, timestamp, content
             FROM messages_in
            WHERE session_id = ?
              AND run_id = ?
              AND kind IN ('task', 'chat')
              AND (? IS NULL OR timestamp < ?)
            ORDER BY timestamp DESC, id DESC
            LIMIT ?`,
          )
          .all(
            input.sessionId,
            input.runId,
            input.beforeTimestamp ?? null,
            input.beforeTimestamp ?? null,
            limit,
          ) as Array<{
          id: string
          run_id: string
          session_id: string
          timestamp: string
          content: string
        }>

        return rows
          .reverse()
          .map((row) => {
            const parsed = GatewayRunDispatchSchema.safeParse(
              parseJsonValue<unknown>(row.content, row.content),
            )
            return {
              id: row.id,
              runId: row.run_id,
              sessionId: row.session_id,
              timestamp: row.timestamp,
              prompt: parsed.success ? parsed.data.intent.message : row.content,
            }
          })
          .filter((row) => row.prompt.trim())
      },
      true,
    )
  }

  writeEvent(event: MainspringEvent, sessionId: string): number {
    this.ensureRunnerOwnedStores()
    const parsed = MainspringEventSchema.parse(sanitizeStoredRuntimeValue(event))
    const runId = 'runId' in parsed && parsed.runId ? parsed.runId : 'system'
    const sequence = withDb(this.paths.eventsDbPath, (db) => {
      const result = db
        .prepare(
          `INSERT INTO events_out (run_id, session_id, type, timestamp, payload)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(runId, sessionId, parsed.type, mailboxNowIso(), JSON.stringify(parsed))
      return Number(result.lastInsertRowid)
    })
    recordMailboxMutation(this.paths.sessionPath)
    return sequence
  }

  readRecentEvents(input: {
    sessionId: string
    runId?: string
    limit?: number
  }): RuntimeEventRow[] {
    this.ensureRunnerOwnedStores()
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 25), 100))
    return withDb(
      this.paths.eventsDbPath,
      (db) => {
        const rows = db
          .prepare(
            `SELECT seq, run_id, session_id, type, timestamp, payload
             FROM events_out
            WHERE session_id = ?
              AND (? IS NULL OR run_id = ?)
            ORDER BY seq DESC
            LIMIT ?`,
          )
          .all(input.sessionId, input.runId ?? null, input.runId ?? null, limit) as Array<{
          seq: number
          run_id: string
          session_id: string
          type: string
          timestamp: string
          payload: string
        }>

        return rows.reverse().map((row) => ({
          seq: row.seq,
          runId: row.run_id,
          sessionId: row.session_id,
          type: row.type,
          timestamp: row.timestamp,
          event: MainspringEventSchema.parse(JSON.parse(row.payload) as unknown),
        }))
      },
      true,
    )
  }

  readEventsAfterSeq(input: {
    sessionId: string
    runId?: string
    afterSeq: number
    limit?: number
  }): RuntimeEventRow[] {
    this.ensureRunnerOwnedStores()
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 200), 500))
    return withDb(
      this.paths.eventsDbPath,
      (db) => {
        const rows = db
          .prepare(
            `SELECT seq, run_id, session_id, type, timestamp, payload
             FROM events_out
            WHERE session_id = ?
              AND (? IS NULL OR run_id = ?)
              AND seq > ?
            ORDER BY seq ASC
            LIMIT ?`,
          )
          .all(
            input.sessionId,
            input.runId ?? null,
            input.runId ?? null,
            input.afterSeq,
            limit,
          ) as Array<{
          seq: number
          run_id: string
          session_id: string
          type: string
          timestamp: string
          payload: string
        }>

        return rows.map((row) => ({
          seq: row.seq,
          runId: row.run_id,
          sessionId: row.session_id,
          type: row.type,
          timestamp: row.timestamp,
          event: MainspringEventSchema.parse(JSON.parse(row.payload) as unknown),
        }))
      },
      true,
    )
  }

  /**
   * Host-side inbound write. The channel bridge runs in-process with the
   * runner and acts as the host writer for dispatch/cancel/approval rows
   * that previously arrived through the shared-volume Gateway mailbox.
   */
  writeInbound(row: {
    runId: string
    sessionId: string
    kind: InboundMailboxRow['kind']
    content: string
  }): string {
    fs.mkdirSync(this.paths.sessionPath, { recursive: true })
    applyInboundMailboxSchema(this.paths.inboundDbPath)
    const id = createMailboxMessageId('in')
    withDb(this.paths.inboundDbPath, (db) =>
      db
        .prepare(
          `INSERT INTO messages_in (
            id, run_id, session_id, kind, timestamp, status, status_changed,
            process_after, recurrence, tries, trigger, content
          ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 0, 1, ?)`,
        )
        .run(id, row.runId, row.sessionId, row.kind, mailboxNowIso(), row.content),
    )
    recordMailboxMutation(this.paths.sessionPath)
    return id
  }

  touchHeartbeat(): void {
    fs.mkdirSync(this.paths.sessionPath, { recursive: true })
    const now = new Date()
    try {
      fs.utimesSync(this.paths.heartbeatPath, now, now)
    } catch {
      fs.writeFileSync(this.paths.heartbeatPath, '')
    }
  }
}
