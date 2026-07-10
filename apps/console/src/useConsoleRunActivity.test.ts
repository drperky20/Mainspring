import { describe, expect, it } from 'vitest'
import type { ConsoleGatewayRunEvent } from 'mainspring/gateway'
import {
  appendAssistantDelta,
  createChatMessage,
  mergeRunEvent,
} from './useConsoleRunActivity'

describe('console run activity helpers', () => {
  it('deduplicates one durable event identity and retains a bounded event tail', () => {
    const first: ConsoleGatewayRunEvent = {
      type: 'run.started',
      runId: 'run_1',
      seq: 1,
    }
    expect(mergeRunEvent([], first)).toEqual([first])
    expect(mergeRunEvent([first], { ...first, payload: { ignored: true } })).toEqual([first])

    const events = Array.from({ length: 82 }, (_, index): ConsoleGatewayRunEvent => ({
      type: 'assistant.text.delta',
      runId: 'run_1',
      seq: index + 2,
    })).reduce(mergeRunEvent, [first])

    expect(events).toHaveLength(80)
    expect(events[0]?.seq).toBe(4)
    expect(events.at(-1)?.seq).toBe(83)
  })

  it('replaces a transient run-start message with the first assistant delta', () => {
    const messages = [
      createChatMessage('user', 'Prepare a local status.'),
      createChatMessage('assistant', 'Run abc started. Live actions will appear on the rail.'),
    ]

    expect(appendAssistantDelta(messages, 'The workspace is ready.')).toMatchObject([
      { role: 'user', text: 'Prepare a local status.' },
      { role: 'assistant', text: 'The workspace is ready.' },
    ])
  })
})
