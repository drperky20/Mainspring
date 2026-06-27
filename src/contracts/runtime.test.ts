import { describe, expect, it } from 'vitest'
import type { RunEvent } from './runtime.js'
import {
  PROVIDER_INIT_LOG_MESSAGE,
  latestProviderInitWarningDetailFromRunEvents,
  providerInitDetailFromLogPayload,
  providerInitWarningDetailFromRunEvent,
} from './runtime.js'

function makeRunEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: 'event_test',
    seq: 1,
    runId: 'run_test',
    sessionId: 'session_test',
    timestamp: '2026-06-27T00:00:00.000Z',
    type: 'runtime.warning',
    payload: {
      message: PROVIDER_INIT_LOG_MESSAGE,
      payload: {
        provider: 'openrouter',
        modelId: 'openrouter/free',
        modelFamily: 'openrouter',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: '[redacted]',
      },
    },
    visibility: 'public',
    traceId: 'trace_test',
    spanId: 'span_test',
    ...overrides,
  }
}

describe('providerInitWarningDetailFromRunEvent', () => {
  it('parses provider-init detail directly from sanitized log payloads', () => {
    expect(
      providerInitDetailFromLogPayload(PROVIDER_INIT_LOG_MESSAGE, {
        provider: 'openrouter',
        modelId: 'openrouter/free',
        modelFamily: 'openrouter',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: '[redacted]',
      }),
    ).toEqual({
      provider: 'openrouter',
      modelId: 'openrouter/free',
      modelFamily: 'openrouter',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: '[redacted]',
    })
  })

  it('parses sanitized provider-init warning detail from runtime warnings', () => {
    expect(providerInitWarningDetailFromRunEvent(makeRunEvent())).toEqual({
      provider: 'openrouter',
      modelId: 'openrouter/free',
      modelFamily: 'openrouter',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: '[redacted]',
    })
  })

  it('finds the latest provider-init warning detail across a run event list', () => {
    expect(
      latestProviderInitWarningDetailFromRunEvents([
        makeRunEvent({
          seq: 1,
          payload: {
            message: PROVIDER_INIT_LOG_MESSAGE,
            payload: {
              provider: 'openai',
              modelId: 'gpt-4.1',
            },
          },
        }),
        makeRunEvent({
          seq: 2,
          payload: {
            message: 'Some other warning',
            payload: {
              provider: 'ignored',
            },
          },
        }),
        makeRunEvent({
          seq: 3,
          payload: {
            message: PROVIDER_INIT_LOG_MESSAGE,
            payload: {
              provider: 'openrouter',
              modelId: 'openrouter/free',
              modelFamily: 'openrouter',
            },
          },
        }),
      ]),
    ).toEqual({
      provider: 'openrouter',
      modelId: 'openrouter/free',
      modelFamily: 'openrouter',
    })
  })

  it('ignores unrelated warnings and blank detail fields', () => {
    expect(
      providerInitDetailFromLogPayload('Other message', {
        provider: 'openrouter',
      }),
    ).toBeNull()

    expect(
      providerInitWarningDetailFromRunEvent(
        makeRunEvent({
          payload: {
            message: 'Some other warning',
            payload: {
              provider: 'openrouter',
            },
          },
        }),
      ),
    ).toBeNull()

    expect(
      providerInitWarningDetailFromRunEvent(
        makeRunEvent({
          payload: {
            message: PROVIDER_INIT_LOG_MESSAGE,
            payload: {
              provider: '   ',
              modelId: '',
              providerTransport: ' ',
            },
          },
        }),
      ),
    ).toBeNull()
  })
})
