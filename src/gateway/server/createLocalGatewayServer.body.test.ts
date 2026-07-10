import { describe, expect, it } from 'vitest'
import {
  MAX_GATEWAY_JSON_BODY_BYTES,
  readBoundedGatewayJson,
} from './createLocalGatewayServer.js'

function requestBody(chunks: Array<Buffer | string>, contentLength?: string) {
  return {
    ...(contentLength ? { headers: { 'content-length': contentLength } } : {}),
    async *[Symbol.asyncIterator]() {
      yield* chunks
    },
  }
}

describe('readBoundedGatewayJson', () => {
  it('parses bounded JSON bodies', async () => {
    await expect(readBoundedGatewayJson(requestBody(['{"ok":true}']))).resolves.toEqual({ ok: true })
  })

  it('rejects oversized declared and streamed bodies before buffering them fully', async () => {
    await expect(readBoundedGatewayJson(
      requestBody(['{}'], String(MAX_GATEWAY_JSON_BODY_BYTES + 1)),
    )).rejects.toMatchObject({ statusCode: 413 })
    await expect(readBoundedGatewayJson(
      requestBody([Buffer.alloc(MAX_GATEWAY_JSON_BODY_BYTES + 1)]),
    )).rejects.toMatchObject({ statusCode: 413 })
  })
})
