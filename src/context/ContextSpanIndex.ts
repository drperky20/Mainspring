import type { RecoverableContextRecord } from './types.js'

export interface ContextLineSpanAnchor {
  line: number
  startByte: number
  endByte: number
  preview: string
}

export interface ContextSpanIndex {
  recoverableId: string
  sha256: string
  byteLength: number
  mediaType: string
  lineCount?: number
  lines?: ContextLineSpanAnchor[]
}

export interface BuildContextSpanIndexOptions {
  maxLines?: number
  previewChars?: number
}

export function buildContextSpanIndex(
  record: RecoverableContextRecord,
  options: BuildContextSpanIndexOptions = {},
): ContextSpanIndex {
  const maxLines = options.maxLines ?? 200
  const previewChars = options.previewChars ?? 120
  const base = {
    recoverableId: record.recoverableId,
    sha256: record.sha256,
    byteLength: record.byteLength,
    mediaType: record.mediaType,
  }

  if (!record.mediaType.startsWith('text/') && record.mediaType !== 'application/json') {
    return base
  }

  const text = Buffer.from(record.bytes).toString('utf8')
  const lines = text.split(/\r?\n/)
  const anchors: ContextLineSpanAnchor[] = []
  let byteOffset = 0
  for (let index = 0; index < Math.min(lines.length, maxLines); index += 1) {
    const line = lines[index] ?? ''
    const lineBytes = Buffer.byteLength(line, 'utf8')
    anchors.push({
      line: index + 1,
      startByte: byteOffset,
      endByte: byteOffset + lineBytes,
      preview: line.slice(0, previewChars),
    })
    byteOffset += lineBytes + 1
  }

  return {
    ...base,
    lineCount: lines.length,
    lines: anchors,
  }
}
