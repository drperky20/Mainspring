import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  mailboxSessionIdFromSessionKey,
  type GatewayRunDispatch,
} from '#protocol'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from '../providers/types.js'
import { RuntimeKernel } from './RuntimeKernel.js'
import { SessionRuntimeSupervisor } from './SessionRuntimeSupervisor.js'
import {
  dispatch as baseDispatch,
  fixtureMailbox,
  insertInbound,
  readRows,
  tempRoot,
} from './test-fixtures.test-support.js'

function dispatch(sessionKey: string, runId: string, message: string): GatewayRunDispatch {
  return baseDispatch({
    runId,
    sessionKey,
    intent: { ...baseDispatch().intent, message },
    trace: { requestId: `req_${runId}`, source: 'test' },
  })
}

class RecordingProvider implements AgentProvider {
  readonly queries: QueryInput[] = []

  query(input: QueryInput): AgentQuery {
    this.queries.push(input)
    return {
      push() {},
      end() {},
      abort() {},
      events: (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'init', providerSessionId: `provider_${input.sessionId}` }
        yield { type: 'result', text: input.prompt }
      })(),
    }
  }
}

describe('SessionRuntimeSupervisor', () => {
  it('processes Gateway-created mailboxes across all sessions in one mounted root', async () => {
    const root = tempRoot('mainspring-session-supervisor-')
    const sessionsRoot = path.join(root, 'sessions')
    const firstMailbox = fixtureMailbox(sessionsRoot, 'run one')
    const secondMailbox = fixtureMailbox(sessionsRoot, 'run two')
    const provider = new RecordingProvider()
    insertInbound({
      mailbox: firstMailbox,
      id: 'in_one',
      timestamp: '2026-05-29T00:00:01.000Z',
      body: dispatch('run one', 'run_one', 'message one'),
    })
    insertInbound({
      mailbox: secondMailbox,
      id: 'in_two',
      timestamp: '2026-05-29T00:00:02.000Z',
      body: dispatch('run two', 'run_two', 'message two'),
    })

    const supervisor = new SessionRuntimeSupervisor({
      sessionsRoot,
      createKernel: ({ mailbox }) => new RuntimeKernel({ mailbox, provider, cwd: root }),
    })

    await expect(supervisor.runUntilIdleAll({ waitForActiveQueries: true })).resolves.toMatchObject(
      {
        processed: 2,
        messageIds: ['in_one', 'in_two'],
        runIds: ['run_one', 'run_two'],
        sessionIds: [
          mailboxSessionIdFromSessionKey('run one'),
          mailboxSessionIdFromSessionKey('run two'),
        ],
      },
    )
    expect(provider.queries.map((query) => query.prompt)).toEqual(['message one', 'message two'])
    expect(
      readRows(
        firstMailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'assistant.text.done'",
      ),
    ).toEqual([
      {
        type: 'assistant.text.done',
        payload: JSON.stringify({
          type: 'assistant.text.done',
          runId: 'run_one',
          text: 'message one',
        }),
      },
    ])
    expect(
      readRows(
        secondMailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'assistant.text.done'",
      ),
    ).toEqual([
      {
        type: 'assistant.text.done',
        payload: JSON.stringify({
          type: 'assistant.text.done',
          runId: 'run_two',
          text: 'message two',
        }),
      },
    ])
  })

  it('ignores directories without Gateway-owned inbound stores', async () => {
    const root = tempRoot('mainspring-session-supervisor-')
    const sessionsRoot = path.join(root, 'sessions')
    const inertPath = path.join(sessionsRoot, 'scratch')
    fs.mkdirSync(inertPath, { recursive: true })
    const provider = new RecordingProvider()

    const result = await new SessionRuntimeSupervisor({
      sessionsRoot,
      createKernel: ({ mailbox }) => new RuntimeKernel({ mailbox, provider, cwd: root }),
    }).runOnceAll()

    expect(result).toEqual({ processed: 0, messageIds: [], runIds: [], sessionIds: [] })
    expect(provider.queries).toEqual([])
    expect(fs.existsSync(path.join(inertPath, 'outbound.db'))).toBe(false)
    expect(fs.existsSync(path.join(sessionsRoot, 'default', '.heartbeat'))).toBe(true)
  })
})
