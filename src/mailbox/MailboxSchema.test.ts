import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyEventsMailboxSchema,
  applyInboundMailboxSchema,
  applyOutboundMailboxSchema,
} from './MailboxSchema.js'
import { openMailboxDb } from './SqliteMailboxStore.js'

let tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots = []
})

function makeDbPath(filename: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-mailbox-schema-'))
  tempRoots.push(root)
  return path.join(root, filename)
}

function tableNames(dbPath: string): string[] {
  const db = openMailboxDb(dbPath, true)
  try {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
  } finally {
    db.close()
  }
}

describe('mailbox schema application', () => {
  it('applies contract-backed mailbox schemas with runtime pragmas', () => {
    const inboundDbPath = makeDbPath('inbound.db')
    const outboundDbPath = makeDbPath('outbound.db')
    const eventsDbPath = makeDbPath('events.db')

    applyInboundMailboxSchema(inboundDbPath)
    applyOutboundMailboxSchema(outboundDbPath)
    applyEventsMailboxSchema(eventsDbPath)

    const inbound = openMailboxDb(inboundDbPath, true)
    try {
      expect(inbound.pragma('journal_mode', { simple: true })).toBe('delete')
      expect(inbound.pragma('busy_timeout', { simple: true })).toBe(5000)
    } finally {
      inbound.close()
    }

    expect(tableNames(inboundDbPath)).toContain('messages_in')
    expect(tableNames(outboundDbPath)).toEqual([
      'container_state',
      'messages_out',
      'processing_ack',
      'session_state',
    ])
    expect(tableNames(eventsDbPath)).toContain('events_out')
  })
})
