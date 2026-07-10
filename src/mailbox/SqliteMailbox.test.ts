import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveSessionMailboxPaths } from '#protocol'
import { MainspringMailbox } from './SqliteMailbox.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

describe('MainspringMailbox mutation revision', () => {
  it('advances for projection-relevant mailbox writes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-mailbox-revision-'))
    tempRoots.push(root)
    const mailbox = new MainspringMailbox(resolveSessionMailboxPaths(path.join(root, 'session-revision')))
    const initial = MainspringMailbox.changeRevision()

    const inboundId = mailbox.writeInbound({
      runId: 'run-revision',
      sessionId: 'session-revision',
      kind: 'chat',
      content: '{}',
    })
    expect(MainspringMailbox.changeRevision()).toBe(initial + 1)
    expect(MainspringMailbox.changeRevisionForSessionPath(mailbox.paths.sessionPath)).toBe(initial + 1)

    mailbox.markAck(inboundId, 'processing')
    expect(MainspringMailbox.changeRevision()).toBe(initial + 2)
    expect(MainspringMailbox.changeRevisionForSessionPath(mailbox.paths.sessionPath)).toBe(initial + 2)

    mailbox.writeOutbound({
      runId: 'run-revision',
      sessionId: 'session-revision',
      kind: 'assistant_message',
      content: JSON.stringify({ text: 'completed' }),
    })
    expect(MainspringMailbox.changeRevision()).toBe(initial + 3)
    expect(MainspringMailbox.changeRevisionForSessionPath(mailbox.paths.sessionPath)).toBe(initial + 3)

    mailbox.writeEvent(
      { type: 'run.status', runId: 'run-revision', status: 'running' },
      'session-revision',
    )
    expect(MainspringMailbox.changeRevision()).toBe(initial + 4)
    expect(MainspringMailbox.changeRevisionForSessionPath(mailbox.paths.sessionPath)).toBe(initial + 4)
  })
})
