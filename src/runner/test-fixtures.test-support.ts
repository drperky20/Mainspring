import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'vitest'
import {
  mailboxSessionIdFromSessionKey,
  type GatewayRunDispatch,
} from '#protocol'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'

let roots: string[] = []

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
  roots = []
})

export function tempRoot(prefix = 'mainspring-test-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

export function fixtureMailbox(sessionsRoot: string, sessionKey = 'default'): MainspringMailbox {
  const mailbox = MainspringMailbox.fromSessionPath(
    path.join(sessionsRoot, mailboxSessionIdFromSessionKey(sessionKey)),
  )
  mailbox.ensureAllStoresForFixture()
  return mailbox
}

export function makeSession(sessionKey = 'default', prefix?: string) {
  const root = tempRoot(prefix)
  return { root, mailbox: fixtureMailbox(path.join(root, 'sessions'), sessionKey) }
}

export function dispatch(overrides: Partial<GatewayRunDispatch> = {}): GatewayRunDispatch {
  return {
    runId: 'run_1',
    ownerId: 'usr_1',
    computerId: 'cmp_1',
    workspaceId: 'wrk_1',
    agentId: 'agt_1',
    sessionKey: 'default',
    runtimeProfile: 'core-browser-memory',
    intent: {
      workspaceId: 'wrk_1',
      agentId: 'agt_1',
      message: 'hello from the mailbox',
      mode: 'chat',
      approvalPolicy: 'balanced',
    },
    policy: {
      approvalPolicy: 'balanced',
      allowBrowser: false,
      allowMemory: false,
      allowedTools: [],
      redaction: 'strict',
    },
    trace: { requestId: 'req_1', source: 'test' },
    ...overrides,
  }
}

export function insertInbound(input: {
  mailbox: MainspringMailbox
  id?: string
  timestamp?: string
  body?: GatewayRunDispatch
  kind?: 'chat' | 'run_cancel' | 'approval_response'
  sessionId?: string
  content?: string
}): void {
  const body = input.body ?? dispatch()
  const kind = input.kind ?? 'chat'
  const db = new Database(input.mailbox.paths.inboundDbPath)
  try {
    db.prepare(
      `INSERT INTO messages_in (
        id, run_id, session_id, kind, timestamp, status, status_changed,
        process_after, recurrence, tries, trigger, content
      ) VALUES (
        @id, @runId, @sessionId, @kind, @timestamp, 'pending', NULL,
        NULL, NULL, 0, 1, @content
      )`,
    ).run({
      id: input.id ?? 'in_1',
      runId: body.runId,
      sessionId: input.sessionId ?? mailboxSessionIdFromSessionKey(body.sessionKey),
      kind,
      timestamp: input.timestamp ?? '2026-05-16T00:00:00.000Z',
      content:
        input.content ??
        (kind === 'run_cancel'
          ? JSON.stringify({ type: 'run_cancel', runId: body.runId })
          : JSON.stringify(body)),
    })
  } finally {
    db.close()
  }
}

export function readRows(dbPath: string, sql: string): unknown[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all() as unknown[]
  } finally {
    db.close()
  }
}
