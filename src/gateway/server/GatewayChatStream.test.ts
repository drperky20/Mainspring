import { describe, expect, it } from 'vitest'
import { projectGatewayChatStreamEvents } from './GatewayChatStream.js'

describe('GatewayChatStream projection', () => {
  it('streams deltas once and closes a completed assistant message', () => {
    const projected = projectGatewayChatStreamEvents({
      afterSeq: 0,
      textStarted: false,
      textPartId: 'text_run_1',
      events: [
        { seq: 4, type: 'assistant.delta', payload: { text: 'hello ' } },
        { seq: 5, type: 'assistant.result', payload: { text: 'hello world' } },
        { seq: 6, type: 'run.completed', payload: {} },
      ],
    })

    expect(projected).toEqual({
      afterSeq: 6,
      textStarted: true,
      terminal: true,
      chunks: [
        { type: 'text-start', id: 'text_run_1' },
        { type: 'text-delta', id: 'text_run_1', delta: 'hello ' },
        { type: 'text-end', id: 'text_run_1' },
        { type: 'finish', finishReason: 'stop' },
      ],
    })
  })

  it('converts result-only and failure events without exposing failure payloads', () => {
    const projected = projectGatewayChatStreamEvents({
      afterSeq: 2,
      textStarted: false,
      textPartId: 'text_run_2',
      events: [
        { seq: '3', type: 'assistant.result', payload: { text: 'partial' } },
        { seq: 4, type: 'run.failed', payload: { secret: 'must-not-stream' } },
      ],
    })

    expect(projected.afterSeq).toBe(4)
    expect(projected.terminal).toBe(true)
    expect(JSON.stringify(projected.chunks)).not.toContain('must-not-stream')
    expect(projected.chunks).toEqual([
      { type: 'text-start', id: 'text_run_2' },
      { type: 'text-delta', id: 'text_run_2', delta: 'partial' },
      { type: 'text-end', id: 'text_run_2' },
      { type: 'error', errorText: 'Run failed. Review Activity for details.' },
      { type: 'finish', finishReason: 'error' },
    ])
  })

  it('finishes an approval pause as a tool-call boundary', () => {
    expect(projectGatewayChatStreamEvents({
      afterSeq: 8,
      textStarted: false,
      textPartId: 'text_run_3',
      events: [{ seq: 9, type: 'run.awaiting_approval', payload: { privateApproval: true } }],
    })).toEqual({
      afterSeq: 9,
      textStarted: false,
      terminal: true,
      chunks: [{ type: 'finish', finishReason: 'tool-calls' }],
    })
  })
})
