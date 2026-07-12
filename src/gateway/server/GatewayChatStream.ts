import type { IncomingMessage, ServerResponse } from 'node:http'
import { sanitizeGatewayResponse } from './sanitize.js'

export type GatewayChatStreamEvent = {
  seq: number | string
  type: string
  payload?: unknown
}

export type GatewayChatStreamChunk = Record<string, unknown>

export type GatewayChatStreamProjection = {
  afterSeq: number
  textStarted: boolean
  chunks: GatewayChatStreamChunk[]
  terminal: boolean
}

export function projectGatewayChatStreamEvents(input: {
  events: GatewayChatStreamEvent[]
  afterSeq: number
  textStarted: boolean
  textPartId: string
}): GatewayChatStreamProjection {
  let afterSeq = input.afterSeq
  let textStarted = input.textStarted
  const chunks: GatewayChatStreamChunk[] = []
  const endText = (): void => {
    if (textStarted) chunks.push({ type: 'text-end', id: input.textPartId })
  }

  for (const event of input.events) {
    const seq = typeof event.seq === 'number' ? event.seq : Number.parseInt(String(event.seq), 10)
    if (Number.isFinite(seq)) afterSeq = Math.max(afterSeq, seq)
    const eventType = String(event.type)
    if (
      eventType === 'assistant.delta'
      || eventType === 'assistant.text.delta'
      || (eventType === 'assistant.result' && !textStarted)
    ) {
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload as { text?: unknown }
        : {}
      const delta = typeof payload.text === 'string' ? payload.text : ''
      if (delta) {
        if (!textStarted) {
          textStarted = true
          chunks.push({ type: 'text-start', id: input.textPartId })
        }
        chunks.push({ type: 'text-delta', id: input.textPartId, delta })
      }
    }
    if (eventType === 'run.completed') {
      endText()
      chunks.push({ type: 'finish', finishReason: 'stop' })
      return { afterSeq, textStarted, chunks, terminal: true }
    }
    if (eventType === 'run.failed' || eventType === 'run.cancelled') {
      endText()
      chunks.push({
        type: 'error',
        errorText: eventType === 'run.cancelled' ? 'Run cancelled.' : 'Run failed. Review Activity for details.',
      })
      chunks.push({ type: 'finish', finishReason: eventType === 'run.cancelled' ? 'other' : 'error' })
      return { afterSeq, textStarted, chunks, terminal: true }
    }
    if (eventType === 'run.awaiting_approval') {
      endText()
      chunks.push({ type: 'finish', finishReason: 'tool-calls' })
      return { afterSeq, textStarted, chunks, terminal: true }
    }
  }

  return { afterSeq, textStarted, chunks, terminal: false }
}

export function streamGatewayChat(input: {
  request: IncomingMessage
  response: ServerResponse
  run: { runId: string; sessionId: string }
  readEvents(afterSeq: number): GatewayChatStreamEvent[]
  pollIntervalMs?: number
}): void {
  const textPartId = `text_${input.run.runId}`
  let afterSeq = 0
  let closed = false
  let textStarted = false
  let timer: ReturnType<typeof globalThis.setInterval> | null = null

  input.response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'x-vercel-ai-ui-message-stream': 'v1',
  })

  const writeChunk = (chunk: unknown): void => {
    if (!closed) input.response.write(`data: ${JSON.stringify(sanitizeGatewayResponse(chunk))}\n\n`)
  }
  const close = (): void => {
    if (closed) return
    closed = true
    if (timer) globalThis.clearInterval(timer)
    input.response.end()
  }
  const tick = (): void => {
    if (closed) return
    const projection = projectGatewayChatStreamEvents({
      events: input.readEvents(afterSeq),
      afterSeq,
      textStarted,
      textPartId,
    })
    afterSeq = projection.afterSeq
    textStarted = projection.textStarted
    for (const chunk of projection.chunks) writeChunk(chunk)
    if (projection.terminal) {
      if (!closed) input.response.write('data: [DONE]\n\n')
      close()
    }
  }

  input.request.once('aborted', close)
  input.response.once('close', close)
  writeChunk({ type: 'start', messageId: `assistant_${input.run.runId}` })
  writeChunk({
    type: 'data-run',
    data: { runId: input.run.runId, sessionId: input.run.sessionId },
    transient: true,
  })
  tick()
  if (!closed) timer = globalThis.setInterval(tick, input.pollIntervalMs ?? 100)
}
