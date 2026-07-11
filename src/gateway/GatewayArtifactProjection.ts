import path from 'node:path'
import type { RunLogEvent, RunRecord as RunLogRunRecord } from '../core/types.js'
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
      if (!artifactId) return
      this.projectArtifact({
        artifactId,
        runId: event.runId,
        sessionId: input.row.sessionId,
        ...(input.runMetadata?.workspaceId ? { workspaceId: input.runMetadata.workspaceId } : {}),
        kind: event.kind,
        metadata: {
          sourceEventId: `native:${input.row.seq}`,
          sourceSeq: input.row.seq,
          sourceType: event.type,
        },
      })
      return
    }

    if (event.type !== 'tool.result' || event.status !== 'completed') return
    this.projectToolOutput({
      runId: event.runId,
      sessionId: input.row.sessionId,
      runMetadata: input.runMetadata,
      toolName: textValue(event.name) ?? 'runtime-artifact',
      output: event.output,
      metadata: {
        sourceEventId: `native:${input.row.seq}`,
        sourceSeq: input.row.seq,
        sourceType: event.type,
      },
    })
  }

  /**
   * Materializes the same safe artifact contract for canonical RunLog events.
   * RunLog payloads may contain tool output from an untrusted provider or tool;
   * only opaque artifact IDs, bounded labels, and optional browser-safe URLs are
   * retained. Host paths are always derived from the configured artifact root.
   */
  projectRunLogEvent(input: {
    event: RunLogEvent
    run: RunLogRunRecord
    runMetadata?: LocalGatewayRunMetadataRecord
  }): void {
    const payload = recordValue(input.event.payload)
    if (!payload) return

    const workspaceId = input.runMetadata?.workspaceId ?? input.run.workspaceId
    if (input.event.type === 'artifact.created') {
      const artifactId = textValue(payload.artifactId)
      const kind = textValue(payload.kind)
      if (!artifactId || !kind) return
      this.projectArtifact({
        artifactId,
        runId: input.run.runId,
        sessionId: input.run.sessionId,
        ...(workspaceId ? { workspaceId } : {}),
        kind,
        metadata: {
          runtime: 'runlog',
          sourceEventId: input.event.eventId,
          sourceSeq: input.event.seq,
          sourceType: input.event.type,
        },
      })
      return
    }

    if (input.event.type !== 'tool.call.completed') return
    this.projectToolOutput({
      runId: input.run.runId,
      sessionId: input.run.sessionId,
      ...(workspaceId ? { runMetadata: { workspaceId } } : {}),
      toolName: textValue(payload.name) ?? 'runlog-artifact',
      output: payload.output,
      metadata: {
        runtime: 'runlog',
        sourceEventId: input.event.eventId,
        sourceSeq: input.event.seq,
        sourceType: input.event.type,
        ...(textValue(payload.toolCallId) ? { toolCallId: textValue(payload.toolCallId) } : {}),
      },
    })
  }

  private projectToolOutput(input: {
    runId: string
    sessionId: string
    runMetadata?: Pick<LocalGatewayRunMetadataRecord, 'workspaceId'>
    toolName: string
    output: unknown
    metadata: Record<string, unknown>
  }): void {
    const output = recordValue(input.output)
    const artifactId = textValue(output?.artifactId) ?? textValue(output?.artifact)
    if (!artifactId) return

    const artifactLabel = textValue(output?.artifactLabel)
    const outputUrl = textValue(output?.url)
    const kind = input.toolName === 'browser.screenshot' ? 'image' : 'file'
    const mediaType = input.toolName === 'browser.screenshot'
      ? 'image/png'
      : textValue(output?.mediaType)

    this.projectArtifact({
      artifactId,
      runId: input.runId,
      sessionId: input.sessionId,
      ...(input.runMetadata?.workspaceId ? { workspaceId: input.runMetadata.workspaceId } : {}),
      kind,
      ...(artifactLabel ? { label: artifactLabel } : {}),
      ...(mediaType ? { mediaType } : {}),
      metadata: {
        ...input.metadata,
        ...(outputUrl ? { url: outputUrl } : {}),
        toolName: input.toolName,
      },
    })
  }

  private projectArtifact(input: {
    artifactId: string
    runId: string
    sessionId: string
    workspaceId?: string
    kind: string
    label?: string
    mediaType?: string
    metadata: Record<string, unknown>
  }): void {
    if (this.options.appState.artifacts.get(input.artifactId)) return
    const artifactPath = artifactPathFromId(this.options.rootPath, input.artifactId)
    if (!artifactPath) return

    this.options.appState.projections.artifacts.create({
      artifactId: input.artifactId,
      runId: input.runId,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      kind: input.kind,
      ...(input.label ? { label: input.label } : {}),
      path: artifactPath,
      ...(input.mediaType ? { mediaType: input.mediaType } : {}),
      metadata: input.metadata,
    })
  }
}
