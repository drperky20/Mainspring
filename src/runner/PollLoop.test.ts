import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EchoProvider } from '../providers/EchoProvider.js'
import type { AgentProvider, AgentQuery, ProviderEvent, QueryInput } from '../providers/types.js'
import { MainspringPollLoop } from './PollLoop.js'
import { dispatch, insertInbound, makeSession, readRows } from './test-fixtures.test-support.js'

class FailingProvider implements AgentProvider {
  query(_input: QueryInput): AgentQuery {
    return {
      push() {},
      end() {},
      abort() {},
      events: (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'progress', message: 'starting' }
        throw new Error('provider failed')
      })(),
    }
  }
}

class ToolProvider implements AgentProvider {
  query(_input: QueryInput): AgentQuery {
    return {
      push() {},
      end() {},
      abort() {},
      events: (async function* (): AsyncIterable<ProviderEvent> {
        yield { type: 'tool_call', name: 'search', input: { query: 'mainspring' } }
        yield { type: 'tool_result', name: 'search', output: { ok: true } }
      })(),
    }
  }
}

describe('MainspringPollLoop', () => {
  it('processes one inbound dispatch through provider events and runner-owned mailboxes', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({ mailbox, sessionId: 'default' })

    const result = await new MainspringPollLoop({
      mailbox,
      provider: new EchoProvider(),
      cwd: root,
    }).runOnce()

    expect(result).toEqual({ processed: 1, messageIds: ['in_1'], runIds: ['run_1'] })
    expect(fs.existsSync(mailbox.paths.heartbeatPath)).toBe(true)

    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT message_id, status FROM processing_ack'),
    ).toEqual([{ message_id: 'in_1', status: 'completed' }])
    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT kind, run_id, session_id FROM messages_out'),
    ).toEqual([{ kind: 'assistant_message', run_id: 'run_1', session_id: 'default' }])

    const events = readRows(
      mailbox.paths.eventsDbPath,
      'SELECT type, run_id, session_id FROM events_out ORDER BY seq ASC',
    )
    expect(events).toContainEqual({
      type: 'assistant.text.done',
      run_id: 'run_1',
      session_id: 'default',
    })
    expect(mailbox.readPending()).toEqual([])
  })

  it('records failed provider work in processing_ack and events.db', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({ mailbox, sessionId: 'default' })

    await new MainspringPollLoop({
      mailbox,
      provider: new FailingProvider(),
      cwd: root,
    }).runOnce()

    expect(
      readRows(
        mailbox.paths.outboundDbPath,
        'SELECT message_id, status, error FROM processing_ack',
      ),
    ).toEqual([{ message_id: 'in_1', status: 'failed', error: 'provider failed' }])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'error'",
      ),
    ).toHaveLength(1)
  })

  it('keeps sanitized mailbox session_id authoritative over raw dispatch sessionKey', async () => {
    const body = dispatch({ sessionKey: 'run:run_1' })
    const { root, mailbox } = makeSession(body.sessionKey)
    insertInbound({ mailbox, body, sessionId: 'run_run_1' })

    await new MainspringPollLoop({
      mailbox,
      provider: new EchoProvider(),
      cwd: root,
    }).runOnce()

    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT kind, run_id, session_id FROM messages_out'),
    ).toEqual([{ kind: 'assistant_message', run_id: 'run_1', session_id: 'run_run_1' }])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT DISTINCT session_id FROM events_out WHERE run_id = 'run_1'",
      ),
    ).toEqual([{ session_id: 'run_run_1' }])
  })

  it('writes provider tool events with contract-generated tool call ids', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({ mailbox, sessionId: 'default' })

    await new MainspringPollLoop({
      mailbox,
      provider: new ToolProvider(),
      cwd: root,
    }).runOnce()

    const events = readRows(
      mailbox.paths.eventsDbPath,
      "SELECT type, payload FROM events_out WHERE type IN ('tool.call', 'tool.result') ORDER BY seq ASC",
    ) as Array<{ type: string; payload: string }>

    expect(events).toHaveLength(2)
    const callPayload = JSON.parse(events[0]?.payload ?? '{}') as { toolCallId: string; name: string }
    const resultPayload = JSON.parse(events[1]?.payload ?? '{}') as { toolCallId: string; name: string }

    expect(callPayload.name).toBe('search')
    expect(resultPayload.name).toBe('search')
    expect(callPayload.toolCallId).toMatch(/^search_[0-9a-f-]{36}$/)
    expect(callPayload.toolCallId).toEqual(resultPayload.toolCallId)
    expect(resultPayload.toolCallId).toMatch(/^search_[0-9a-f-]{36}$/)
    for (const event of events) {
      const payload = JSON.parse(event.payload) as { toolCallId: string; name: string }
      expect(payload.name).toBe('search')
      expect(payload.toolCallId).toMatch(/^search_[0-9a-f-]{36}$/)
    }
  })

  it('acknowledges run_cancel messages without invoking a provider query', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({ mailbox, body: dispatch(), kind: 'run_cancel', sessionId: 'default' })

    const result = await new MainspringPollLoop({
      mailbox,
      provider: new FailingProvider(),
      cwd: root,
    }).runOnce()

    expect(result).toEqual({ processed: 1, messageIds: ['in_1'], runIds: ['run_1'] })
    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT message_id, status FROM processing_ack'),
    ).toEqual([{ message_id: 'in_1', status: 'completed' }])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'run.status'",
      ),
    ).toEqual([
      {
        type: 'run.status',
        payload: JSON.stringify({
          type: 'run.status',
          runId: 'run_1',
          status: 'cancelled',
          phase: 'cancelled',
        }),
      },
    ])
  })

  it('acknowledges approval_response messages without invoking a provider query', async () => {
    const { root, mailbox } = makeSession()
    insertInbound({
      mailbox,
      body: dispatch(),
      kind: 'approval_response',
      sessionId: 'default',
      content: JSON.stringify({
        type: 'approval_response',
        runId: 'run_1',
        approvalId: 'apr_1',
        decision: 'approved',
      }),
    })

    const result = await new MainspringPollLoop({
      mailbox,
      provider: new FailingProvider(),
      cwd: root,
    }).runOnce()

    expect(result).toEqual({ processed: 1, messageIds: ['in_1'], runIds: ['run_1'] })
    expect(
      readRows(mailbox.paths.outboundDbPath, 'SELECT message_id, status FROM processing_ack'),
    ).toEqual([{ message_id: 'in_1', status: 'completed' }])
    expect(
      readRows(
        mailbox.paths.eventsDbPath,
        "SELECT type, payload FROM events_out WHERE type = 'approval.resolved'",
      ),
    ).toEqual([
      {
        type: 'approval.resolved',
        payload: JSON.stringify({
          type: 'approval.resolved',
          runId: 'run_1',
          approval: {
            type: 'approval_response',
            runId: 'run_1',
            approvalId: 'apr_1',
            decision: 'approved',
          },
        }),
      },
    ])
  })
})
