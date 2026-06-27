import Database from 'better-sqlite3'
import { createMailboxMessageId, currentIsoTimestamp } from '#protocol'

export function mailboxNowIso(): string {
  return currentIsoTimestamp()
}

export { createMailboxMessageId }

export function openMailboxDb(dbPath: string, readonly = false): Database.Database {
  const db = new Database(dbPath, readonly ? { readonly: true, fileMustExist: true } : {})
  db.pragma('busy_timeout = 5000')
  if (!readonly) {
    db.pragma('journal_mode = DELETE')
    db.pragma('foreign_keys = ON')
  }
  return db
}
