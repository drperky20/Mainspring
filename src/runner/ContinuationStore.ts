import { mailboxNowIso, openMailboxDb } from '../mailbox/SqliteMailboxStore.js'

export class ContinuationStore {
  constructor(private readonly outboundDbPath: string) {}

  setProviderSessionId(runId: string, providerSessionId: string): void {
    this.setJson(`providerSessionId:${runId}`, providerSessionId)
  }

  getProviderSessionId(runId: string): string | null {
    const value = this.getJson(`providerSessionId:${runId}`)
    return typeof value === 'string' ? value : null
  }

  deleteJson(key: string): void {
    const db = openMailboxDb(this.outboundDbPath)
    try {
      db.prepare('DELETE FROM session_state WHERE key = ?').run(key)
    } finally {
      db.close()
    }
  }

  listJsonByPrefix(prefix: string): Array<{ key: string; value: unknown }> {
    const db = openMailboxDb(this.outboundDbPath, true)
    try {
      const rows = db
        .prepare('SELECT key, value FROM session_state WHERE key LIKE ? ORDER BY key ASC')
        .all(`${prefix}%`) as Array<{ key: string; value: string }>
      return rows.map((row) => ({
        key: row.key,
        value: JSON.parse(row.value) as unknown,
      }))
    } finally {
      db.close()
    }
  }

  setJson(key: string, value: unknown): void {
    const db = openMailboxDb(this.outboundDbPath)
    try {
      db.prepare(
        `INSERT INTO session_state (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      ).run(key, JSON.stringify(value), mailboxNowIso())
    } finally {
      db.close()
    }
  }

  getJson(key: string): unknown {
    const db = openMailboxDb(this.outboundDbPath, true)
    try {
      const row = db.prepare('SELECT value FROM session_state WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      if (!row) return null
      return JSON.parse(row.value) as unknown
    } finally {
      db.close()
    }
  }
}
