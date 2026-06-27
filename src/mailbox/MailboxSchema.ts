import {
  EVENTS_MAILBOX_SCHEMA_SQL,
  INBOUND_MAILBOX_SCHEMA_SQL,
  OUTBOUND_MAILBOX_SCHEMA_SQL,
} from '#protocol'
import { openMailboxDb } from './SqliteMailboxStore.js'

export function applyMailboxSchema(dbPath: string, schema: string): void {
  const db = openMailboxDb(dbPath)
  try {
    db.exec(schema)
  } finally {
    db.close()
  }
}

export function applyInboundMailboxSchema(dbPath: string): void {
  applyMailboxSchema(dbPath, INBOUND_MAILBOX_SCHEMA_SQL)
}

export function applyOutboundMailboxSchema(dbPath: string): void {
  applyMailboxSchema(dbPath, OUTBOUND_MAILBOX_SCHEMA_SQL)
}

export function applyEventsMailboxSchema(dbPath: string): void {
  applyMailboxSchema(dbPath, EVENTS_MAILBOX_SCHEMA_SQL)
}
