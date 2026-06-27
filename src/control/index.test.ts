import { describe, expect, it } from 'vitest'
import { PROVIDER_INIT_LOG_MESSAGE } from '../contracts/runtime.js'
import {
  ChannelDownMessageSchema,
  ChannelUpMessageSchema,
  MAINSPRING_CHANNEL_PROTOCOL_VERSION,
  TURN_EVENT_SCHEMA_VERSION,
  TurnEventSchema,
  TurnStatusSchema,
  UI_DATA_PART_NAMES,
  isApprovalExpired,
  isTerminalTurnStatus,
  isValidTurnTransition,
  parseTurnEvent,
  providerInitLogDetailFromTurnEvent,
  safeParseTurnEvent,
  turnStatusFromEvent,
  uiDataPartNameForEvent,
  type TurnEvent,
  type TurnStatus,
} from './index.js'

const baseEvent = {
  v: TURN_EVENT_SCHEMA_VERSION,
  turnId: 'trn_1',
  seq: 1,
  at: '2026-06-11T00:00:00.000Z',
}

function event(type: TurnEvent['type'], payload: unknown, seq = 1): TurnEvent {
  return parseTurnEvent({ ...baseEvent, seq, type, payload })
}

describe('turn status machine', () => {
  it('accepts the documented forward transitions', () => {
    expect(isValidTurnTransition('queued', 'dispatching')).toBe(true)
    expect(isValidTurnTransition('dispatching', 'running')).toBe(true)
    expect(isValidTurnTransition('running', 'awaiting_approval')).toBe(true)
    expect(isValidTurnTransition('awaiting_approval', 'running')).toBe(true)
    expect(isValidTurnTransition('running', 'completed')).toBe(true)
  })

  it('rejects transitions out of terminal states', () => {
    for (const terminal of ['completed', 'failed', 'cancelled', 'timed_out'] as const) {
      expect(isTerminalTurnStatus(terminal)).toBe(true)
      for (const target of TurnStatusSchema.options) {
        if (target === terminal) continue
        expect(isValidTurnTransition(terminal, target)).toBe(false)
      }
    }
  })

  it('never reaches an illegal state from random valid event sequences', () => {
    const eventPool: TurnEvent[] = [
      event('turn.status', { status: 'dispatching' }),
      event('turn.status', { status: 'running' }),
      event('approval.requested', {
        approvalId: 'apr_1',
        kind: 'tool',
        title: 'Run shell command',
        request: {},
      }),
      event('approval.resolved', { approvalId: 'apr_1', decision: 'approved' }),
      event('error', { message: 'boom', retryable: false }),
      event('turn.status', { status: 'completed' }),
    ]

    for (let trial = 0; trial < 200; trial += 1) {
      let status: TurnStatus = 'queued'
      for (let i = 0; i < 12; i += 1) {
        const candidate = eventPool[Math.floor(Math.random() * eventPool.length)]!
        const proposed = turnStatusFromEvent(candidate)
        if (proposed && isValidTurnTransition(status, proposed)) {
          status = proposed
        }
        expect(TurnStatusSchema.safeParse(status).success).toBe(true)
        if (isTerminalTurnStatus(status)) break
      }
    }
  })
})

describe('turn events', () => {
  it('parses each event type fixture at schemaVersion 1', () => {
    const fixtures: Array<[TurnEvent['type'], unknown]> = [
      ['turn.status', { status: 'running' }],
      ['text.delta', { text: 'hel' }],
      ['text.done', { text: 'hello' }],
      ['reasoning.delta', { text: 'thinking' }],
      ['reasoning.done', { text: 'thought' }],
      [
        'tool.call',
        { toolCallId: 'tc_1', name: 'shell.exec', category: 'exec', input: { command: 'ls' } },
      ],
      ['tool.update', { toolCallId: 'tc_1', message: 'running' }],
      [
        'tool.result',
        { toolCallId: 'tc_1', name: 'shell.exec', status: 'completed', output: { code: 0 } },
      ],
      [
        'approval.requested',
        { approvalId: 'apr_1', kind: 'tool', title: 'Run shell command', request: {} },
      ],
      ['approval.resolved', { approvalId: 'apr_1', decision: 'denied' }],
      ['progress', { label: 'Reading files', step: 2, totalSteps: 5 }],
      [
        'source.reference',
        { sourceId: 'src_1', kind: 'url', title: 'Example', uri: 'https://example.com' },
      ],
      [
        'browser.preview',
        {
          artifactId: 'art_1',
          url: 'https://example.com',
          title: 'Example',
          status: 'ready',
          viewport: { width: 1280, height: 720 },
        },
      ],
      ['file.preview', { path: 'notes/todo.md', action: 'updated', diff: { added: 2 } }],
      [
        'artifact.created',
        { artifactId: 'art_1', kind: 'image', filename: 'shot.png', turnId: 'trn_1' },
      ],
      ['result.summary', { title: 'Done', summary: 'Saved the result.', artifactIds: ['art_1'] }],
      ['agent.status', { label: 'Working on it' }],
      ['provider.retry', { attempt: 1, maxAttempts: 3, reason: 'rate-limited' }],
      ['provider.fallback', { fromProfile: 'openrouter/free', toProfile: 'openai/default' }],
      ['usage', { inputTokens: 10, outputTokens: 20, totalTokens: 30 }],
      ['log', { level: 'info', message: 'hi' }],
      ['error', { message: 'boom', retryable: true }],
    ]

    for (const [type, payload] of fixtures) {
      const parsed = event(type, payload)
      expect(parsed.type).toBe(type)
      expect(parsed.v).toBe(TURN_EVENT_SCHEMA_VERSION)
    }
  })

  it('rejects unknown event types and bad envelopes', () => {
    expect(safeParseTurnEvent({ ...baseEvent, type: 'nope', payload: {} })).toBeNull()
    expect(
      safeParseTurnEvent({ ...baseEvent, type: 'text.delta', payload: { text: 1 } }),
    ).toBeNull()
    expect(
      safeParseTurnEvent({ ...baseEvent, v: 2, type: 'text.delta', payload: { text: 'x' } }),
    ).toBeNull()
  })

  it('projects status only from status-bearing events', () => {
    expect(turnStatusFromEvent(event('turn.status', { status: 'running' }))).toBe('running')
    expect(
      turnStatusFromEvent(
        event('approval.requested', { approvalId: 'a', kind: 'tool', title: 't', request: {} }),
      ),
    ).toBe('awaiting_approval')
    expect(
      turnStatusFromEvent(event('approval.resolved', { approvalId: 'a', decision: 'approved' })),
    ).toBe('running')
    expect(
      turnStatusFromEvent(event('approval.resolved', { approvalId: 'a', decision: 'denied' })),
    ).toBeNull()
    expect(turnStatusFromEvent(event('error', { message: 'x', retryable: false }))).toBe('failed')
    expect(turnStatusFromEvent(event('error', { message: 'x', retryable: true }))).toBeNull()
    expect(turnStatusFromEvent(event('text.delta', { text: 'x' }))).toBeNull()
  })

  it('parses provider-init detail from bridged log events only when the payload matches', () => {
    expect(
      providerInitLogDetailFromTurnEvent(
        event('log', {
          level: 'debug',
          message: PROVIDER_INIT_LOG_MESSAGE,
          payload: {
            provider: 'openrouter',
            modelId: 'anthropic/claude-sonnet-4',
            modelFamily: 'claude',
            providerTransport: 'openrouter-chat-completions',
            providerSessionId: 'provider_init_1',
          },
        }),
      ),
    ).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_init_1',
    })

    expect(
      providerInitLogDetailFromTurnEvent(
        event('log', {
          level: 'info',
          message: 'Not provider init',
          payload: { provider: 'openrouter' },
        }),
      ),
    ).toBeNull()

    expect(providerInitLogDetailFromTurnEvent(event('text.done', { text: 'hello' }))).toBeNull()
  })
})

describe('ui block mapping', () => {
  it('maps custom events to data-* parts and native events to null', () => {
    expect(
      uiDataPartNameForEvent(
        event('approval.requested', { approvalId: 'a', kind: 'tool', title: 't', request: {} }),
      ),
    ).toBe(UI_DATA_PART_NAMES.approval)
    expect(uiDataPartNameForEvent(event('progress', { label: 'x' }))).toBe(
      UI_DATA_PART_NAMES.progress,
    )
    expect(
      uiDataPartNameForEvent(
        event('source.reference', { sourceId: 'src_1', kind: 'file', title: 'notes.md' }),
      ),
    ).toBe(UI_DATA_PART_NAMES.sourceReference)
    expect(
      uiDataPartNameForEvent(event('artifact.created', { artifactId: 'a', kind: 'file' })),
    ).toBe(UI_DATA_PART_NAMES.artifact)
    expect(
      uiDataPartNameForEvent(event('result.summary', { title: 'Done', summary: 'Completed.' })),
    ).toBe(UI_DATA_PART_NAMES.resultSummary)
    expect(uiDataPartNameForEvent(event('text.delta', { text: 'x' }))).toBeNull()
    expect(
      uiDataPartNameForEvent(
        event('tool.call', { toolCallId: 't', name: 'file.read', category: 'file' }),
      ),
    ).toBeNull()
    expect(uiDataPartNameForEvent(event('usage', { totalTokens: 1 }))).toBeNull()
  })
})

describe('channel protocol', () => {
  it('round-trips hello, events batch, ack, dispatch, resume', () => {
    const hello = ChannelUpMessageSchema.parse({
      t: 'hello',
      protocolVersion: MAINSPRING_CHANNEL_PROTOCOL_VERSION,
      cellId: 'cell_1',
      activeTurns: [{ turnId: 'trn_1', lastSeq: 4, pendingApprovalIds: ['apr_1'] }],
    })
    expect(hello.t).toBe('hello')

    const batch = ChannelUpMessageSchema.parse({
      t: 'events',
      turnId: 'trn_1',
      events: [event('text.delta', { text: 'x' }, 5)],
    })
    expect(batch.t).toBe('events')

    const ack = ChannelDownMessageSchema.parse({ t: 'event_ack', turnId: 'trn_1', seq: 5 })
    expect(ack.t).toBe('event_ack')

    const dispatch = ChannelDownMessageSchema.parse({
      t: 'dispatch_turn',
      turn: {
        turnId: 'trn_1',
        sessionId: 'ses_1',
        ownerId: 'usr_1',
        workspaceId: 'wsp_1',
        agentId: 'agt_1',
        traceId: 'trc_1',
        source: 'console',
        input: { message: 'hi' },
        approvalPolicy: 'balanced',
        policy: {
          approvalPolicy: 'balanced',
          allowBrowser: false,
          allowMemory: false,
          allowedTools: [],
          redaction: 'strict',
        },
      },
    })
    expect(dispatch.t).toBe('dispatch_turn')
    if (dispatch.t === 'dispatch_turn') {
      expect(dispatch.turn.runtimeProfile).toBe('core-browser-memory')
      expect(dispatch.turn.providerChain).toEqual([])
    }

    const resume = ChannelDownMessageSchema.parse({
      t: 'resume_turn',
      turn: dispatch.t === 'dispatch_turn' ? dispatch.turn : undefined,
      lastAckedSeq: 4,
      pendingApprovals: [{ approvalId: 'apr_1', kind: 'tool' }],
    })
    expect(resume.t).toBe('resume_turn')
  })

  it('rejects events batches with empty event lists', () => {
    expect(
      ChannelUpMessageSchema.safeParse({ t: 'events', turnId: 'trn_1', events: [] }).success,
    ).toBe(false)
  })
})

describe('approvals', () => {
  it('detects expiry only for pending approvals', () => {
    const now = new Date('2026-06-11T12:00:00.000Z')
    expect(
      isApprovalExpired({ status: 'pending', expiresAt: '2026-06-11T11:00:00.000Z' }, now),
    ).toBe(true)
    expect(
      isApprovalExpired({ status: 'pending', expiresAt: '2026-06-11T13:00:00.000Z' }, now),
    ).toBe(false)
    expect(
      isApprovalExpired({ status: 'approved', expiresAt: '2026-06-11T11:00:00.000Z' }, now),
    ).toBe(false)
  })
})
