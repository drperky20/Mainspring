import path from 'node:path'
import type { RuntimeEventRow } from '../mailbox/SqliteMailbox.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayRunMetadataRecord,
} from './AppStateStore.js'

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function artifactPathFromId(rootPath: string, artifactId: string): string | null {
  const normalizedArtifactId = artifactId.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalizedArtifactId)) return null
  const root = path.resolve(rootPath)
  const candidate = path.resolve(root, normalizedArtifactId)
  const relative = path.relative(root, candidate)
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : candidate
}

/**
 * Materializes compatibility-runtime artifact facts into the gateway inventory.
 * It accepts only runtime event rows, derives every host path from the configured
 * artifact root plus a bounded opaque ID, and writes through the projection-only
 * app-state seam.
 */
export class GatewayArtifactProjection {
  constructor(
    private readonly options: {
      appState: LocalGatewayAppStateStore
      rootPath: string
    },
  ) {}

  project(input: {
    row: RuntimeEventRow
    runMetadata?: LocalGatewayRunMetadataRecord
  }): void {
    const event = input.row.event
    if (event.type === 'artifact.created') {
      const artifactId = textValue(event.artifactId)
      if (!artifactId || this.options.appState.artifacts.get(artifactId)) return
      const artifactPath = artifactPathFromId(this.options.rootPath, artifactId)
      if (!artifactPath) return
      this.options.appState.projections.artifacts.create({
        artifactId,
        runId: event.runId,
        sessionId: input.row.sessionId,
        ...(input.runMetadata?.workspaceId ? { workspaceId: input.runMetadata.workspaceId } : {}),
        kind: event.kind,
        path: artifactPath,
        metadata: {
          sourceEventId: `native:${input.row.seq}`,
          sourceSeq: input.row.seq,
          sourceType: event.type,
        },
      })
      return
    }

    if (event.type !== 'tool.result' || event.status !== 'completed') return
    const output = recordValue(event.output)
    const artifactId = textValue(output?.artifactId) ?? textValue(output?.artifact)
    if (!artifactId || this.options.appState.artifacts.get(artifactId)) return
    const artifactPath = artifactPathFromId(this.options.rootPath, artifactId)
    if (!artifactPath) return

    const toolName = textValue(event.name) ?? 'runtime-artifact'
    const artifactLabel = textValue(output?.artifactLabel)
    const outputUrl = textValue(output?.url)
    const kind = toolName === 'browser.screenshot' ? 'image' : 'file'
    const mediaType = toolName === 'browser.screenshot'
      ? 'image/png'
      : textValue(output?.mediaType)

    this.options.appState.projections.artifacts.create({
      artifactId,
      runId: event.runId,
      sessionId: input.row.sessionId,
      ...(input.runMetadata?.workspaceId ? { workspaceId: input.runMetadata.workspaceId } : {}),
      kind,
      ...(artifactLabel ? { label: artifactLabel } : {}),
      path: artifactPath,
      ...(mediaType ? { mediaType } : {}),
      metadata: {
        sourceEventId: `native:${input.row.seq}`,
        sourceSeq: input.row.seq,
        sourceType: event.type,
        toolName,
        ...(outputUrl ? { url: outputUrl } : {}),
      },
    })
  }
}
