import { describe, expect, it } from 'vitest'
import {
  clearGatewaySessionContext,
  getGatewaySessionContext,
  getGatewaySessionValue,
  normalizeGatewaySessionContext,
  withGatewaySessionContext,
} from './GatewaySessionContext.js'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('Gateway session context', () => {
  it('keeps overlapping async gateway scopes isolated', async () => {
    const results = await Promise.all([
      withGatewaySessionContext(
        { sessionId: 'session_a', runId: 'run_a', routeKey: 'route:a', values: { lane: 'alpha' } },
        async () => {
          await delay(15)
          return {
            context: getGatewaySessionContext(),
            lane: getGatewaySessionValue('lane'),
          }
        },
      ),
      withGatewaySessionContext(
        { sessionId: 'session_b', runId: 'run_b', routeKey: 'route:b', values: { lane: 'beta' } },
        async () => {
          await delay(1)
          return {
            context: getGatewaySessionContext(),
            lane: getGatewaySessionValue('lane'),
          }
        },
      ),
    ])

    expect(results[0]).toEqual({
      context: { sessionId: 'session_a', runId: 'run_a', routeKey: 'route:a', values: { lane: 'alpha' } },
      lane: 'alpha',
    })
    expect(results[1]).toEqual({
      context: { sessionId: 'session_b', runId: 'run_b', routeKey: 'route:b', values: { lane: 'beta' } },
      lane: 'beta',
    })
    expect(getGatewaySessionContext()).toBeNull()
  })

  it('clears nested session context without mutating outer scope', () => {
    const result = withGatewaySessionContext({ sessionId: 'session_outer' }, () => {
      const before = getGatewaySessionContext()
      const inner = clearGatewaySessionContext(() => getGatewaySessionContext())
      const after = getGatewaySessionContext()
      return { before, inner, after }
    })

    expect(result).toEqual({
      before: { sessionId: 'session_outer' },
      inner: null,
      after: { sessionId: 'session_outer' },
    })
  })

  it('sanitizes context values and rejects missing session ids', () => {
    expect(
      normalizeGatewaySessionContext({
        sessionId: 'session sk-or-secret',
        values: { apiKey: 'sk-or-secret' },
      }),
    ).toEqual({
      sessionId: 'session [redacted]',
      values: { apiKey: '[redacted]' },
    })

    expect(() => normalizeGatewaySessionContext({ sessionId: '   ' })).toThrow(
      'gateway session context requires sessionId.',
    )
  })
})
