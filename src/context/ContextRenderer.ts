import type {
  ContextImageProjection,
  RecoverableContextRecord,
  RecoverableContextStore,
} from './types.js'

export interface ContextRenderRequest {
  recoverableId: string
  projection: ContextImageProjection
  record: RecoverableContextRecord
}

export interface ContextRenderArtifact {
  recoverableId: string
  canary: string
  width: number
  height: number
  mediaType: 'image/png' | 'image/webp' | 'image/svg+xml'
  bytes: Uint8Array
  rendererId: string
  fontId: string
  density: string
  metadata?: Record<string, unknown>
}

export interface ContextRasterRenderer {
  id: string
  supports(projection: ContextImageProjection): boolean
  render(request: ContextRenderRequest): Promise<ContextRenderArtifact>
}

export class ContextRendererRegistry {
  private readonly renderers: ContextRasterRenderer[] = []

  register(renderer: ContextRasterRenderer): void {
    if (this.renderers.some((existing) => existing.id === renderer.id)) {
      throw new Error(`Context renderer already registered: ${renderer.id}`)
    }
    this.renderers.push(renderer)
  }

  async render(input: {
    store: RecoverableContextStore
    recoverableId: string
    projection: ContextImageProjection
  }): Promise<ContextRenderArtifact> {
    const record = input.store.get(input.recoverableId)
    if (!record) throw new Error(`Recoverable context not found: ${input.recoverableId}`)
    const renderer = this.renderers.find((candidate) => candidate.supports(input.projection))
    if (!renderer) {
      throw new Error(
        `No context renderer registered for projection level ${input.projection.level}`,
      )
    }
    return renderer.render({
      recoverableId: input.recoverableId,
      projection: input.projection,
      record,
    })
  }

  list(): string[] {
    return this.renderers.map((renderer) => renderer.id)
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function lineLimitFor(projection: ContextImageProjection): number {
  if (projection.level === 'readable') return 42
  if (projection.level === 'dense') return 64
  return 96
}

function fontSizeFor(projection: ContextImageProjection): number {
  if (projection.level === 'readable') return 18
  if (projection.level === 'dense') return 13
  return 9
}

function textLinesFor(record: RecoverableContextRecord, projection: ContextImageProjection): string[] {
  const text = Buffer.from(record.bytes).toString('utf8')
  const rawLines = text.split(/\r?\n/)
  const maxLines = Math.max(1, Math.floor((projection.height - 72) / (fontSizeFor(projection) * 1.35)))
  const maxColumns = lineLimitFor(projection)
  const wrappedLines: string[] = []
  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      wrappedLines.push('')
      continue
    }
    for (let offset = 0; offset < rawLine.length; offset += maxColumns) {
      wrappedLines.push(rawLine.slice(offset, offset + maxColumns))
    }
  }
  const pageNumber = Math.max(1, projection.pageNumber ?? 1)
  const start = Math.max(0, (projection.startLine ?? (pageNumber - 1) * maxLines + 1) - 1)
  const end = Math.max(start, projection.endLine ?? start + maxLines)
  return wrappedLines.slice(start, end).slice(0, maxLines)
}

export function createDeterministicSvgContextRenderer(options: {
  id?: string
  fontId?: string
} = {}): ContextRasterRenderer {
  const rendererId = options.id ?? 'mainspring-svg-text-v1'
  const fontId = options.fontId ?? 'monospace-svg-v1'
  return {
    id: rendererId,
    supports: () => true,
    render: async (request) => {
      const fontSize = fontSizeFor(request.projection)
      const lineHeight = Math.ceil(fontSize * 1.35)
      const lines = textLinesFor(request.record, request.projection)
      const body = lines
        .map((line, index) => {
          const y = 58 + index * lineHeight
          return `<text x="18" y="${y}" class="line">${escapeXml(line)}</text>`
        })
        .join('\n')
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${request.projection.width}" height="${request.projection.height}" viewBox="0 0 ${request.projection.width} ${request.projection.height}">`,
        '<rect width="100%" height="100%" fill="#101214"/>',
        '<rect x="8" y="8" width="calc(100% - 16px)" height="calc(100% - 16px)" fill="#f8f8f2"/>',
        `<text x="18" y="32" font-family="monospace" font-size="13" fill="#444">canary ${escapeXml(request.projection.canary)}</text>`,
        `<text x="18" y="48" font-family="monospace" font-size="11" fill="#666">recoverable ${escapeXml(request.recoverableId)} sha ${escapeXml(request.record.sha256.slice(0, 16))}</text>`,
        `<g font-family="monospace" font-size="${fontSize}" fill="#111" xml:space="preserve">`,
        body,
        '</g>',
        '</svg>',
      ].join('\n')
      return {
        recoverableId: request.recoverableId,
        canary: request.projection.canary,
        width: request.projection.width,
        height: request.projection.height,
        mediaType: 'image/svg+xml',
        bytes: Buffer.from(svg, 'utf8'),
        rendererId,
        fontId,
        density: request.projection.level,
        metadata: {
          sourceSha256: request.record.sha256,
          renderedLines: lines.length,
          truncated: lines.length < Buffer.from(request.record.bytes).toString('utf8').split(/\r?\n/).length,
        },
      }
    },
  }
}
