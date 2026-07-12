import type {
  MainspringSessionRecord,
  RunEvent,
  RunRecord,
  UsageUpdatedRunEventPayload,
} from '../contracts/runtime.js'
import { latestProviderInitDetailFromRunEvents } from '../contracts/runtime.js'
import type { RuntimeEventRow } from '../mailbox/SqliteMailbox.js'
import type { RunLogMainspring } from '../sdk/RunLogMainspring.js'
import type {
  RunLogEvent,
  RunRecord as RunLogRunRecord,
} from '../core/types.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayCellLeaseRecord,
  LocalGatewayRunMetadataRecord,
  LocalGatewayToolCallRecord,
} from './AppStateStore.js'
import { GatewayArtifactProjection } from './GatewayArtifactProjection.js'
import {
  GatewayUsageProjection,
  type GatewayBudgetEvaluationLike,
} from './GatewayUsageProjection.js'
import { HyperCellScheduler } from './HyperCellScheduler.js'

export interface GatewayProjectionSynchronizerOptions<
  TEvaluation extends GatewayBudgetEvaluationLike,
> {
  appState: LocalGatewayAppStateStore
  listSessions: () => readonly MainspringSessionRecord[]
  runMetadataByRunId: (sessionId: string) => Map<string, LocalGatewayRunMetadataRecord>
  nativeMailboxEvents: (session: MainspringSessionRecord) => RuntimeEventRow[]
  nativeSessionEvents: (
    sessionId: string,
    knownSession?: MainspringSessionRecord,
  ) => RunEvent[]
  runLog?: RunLogMainspring
  usageProjection?: GatewayUsageProjection<TEvaluation>
  artifactProjection?: GatewayArtifactProjection
  hyperCells?: HyperCellScheduler
  loadRunEventsForLease: (lease: LocalGatewayCellLeaseRecord) => RunEvent[]
  statusFromEvents: (events: RunEvent[]) => RunRecord['status']
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function approvalIdFromEvent(event: RunEvent): string | null {
  if (
    event.type !== 'approval.requested'
    && event.type !== 'approval.approved'
    && event.type !== 'approval.denied'
  ) {
    return null
  }
  const payload = event.payload as Record<string, unknown>
  if (typeof payload.id === 'string') return payload.id
  if (typeof payload.approvalId === 'string') return payload.approvalId
  return null
}

function executionCellId(workspaceId: string, backendKey: string): string {
  return `cell_exec_${workspaceId}_${backendKey}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function executionLeaseId(toolCallId: string, backendSessionId?: string): string {
  return `lease_exec_${(backendSessionId ?? toolCallId)}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function backendCapabilityMetadata(value: unknown): Record<string, unknown> | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const metadata: Record<string, unknown> = {}
  for (const key of [
    'isolationKind',
    'isolationStrength',
    'securityBoundary',
    'networkPolicy',
    'workspaceMapping',
  ]) {
    const text = textValue(record[key])
    if (text) metadata[key] = text
  }
  for (const key of ['requiresApproval', 'unsafeFallback']) {
    if (typeof record[key] === 'boolean') metadata[key] = record[key]
  }
  const limits = stringListValue(record.limits)
  if (limits.length > 0) metadata.limits = limits
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

/**
 * Owns the gateway's durable read-model catch-up pass. Runtime and RunLog
 * facts enter this collaborator through read-only callbacks; all materialized
 * writes go through the projection-only collaborators and app-state seams.
 * The public gateway remains responsible for command orchestration and facade
 * compatibility, while this boundary keeps projection work restart-safe and
 * independently testable.
 */
export class GatewayProjectionSynchronizer<
  TEvaluation extends GatewayBudgetEvaluationLike,
> {
  constructor(private readonly options: GatewayProjectionSynchronizerOptions<TEvaluation>) {}

  sync(): void {
    this.syncApprovalMetadata()
    this.syncToolCalls()
    this.syncUsageLedger()
    this.syncArtifacts()
    this.syncRunCellLeases()
  }

  private syncApprovalMetadata(): void {
    for (const session of this.options.listSessions()) {
      const runMetadataByRunId = this.options.runMetadataByRunId(session.sessionId)
      const events = this.options.nativeSessionEvents(session.sessionId, session)

      for (const event of events) {
        const approvalId = approvalIdFromEvent(event)
        if (!approvalId) continue

        const runMetadata = runMetadataByRunId.get(event.runId)
        const existing = this.options.appState.approvals.get(approvalId)
        const payload = event.payload as Record<string, unknown>
        const targetKey =
          typeof payload.targetKey === 'string'
            ? payload.targetKey
            : existing?.targetKey
        const status =
          event.type === 'approval.requested'
            ? existing && existing.status !== 'pending'
              ? existing.status
              : 'pending'
            : event.type === 'approval.approved'
              ? 'approved'
              : 'denied'
        const resolvedAt =
          event.type === 'approval.approved' || event.type === 'approval.denied'
            ? event.timestamp
            : existing && existing.status !== 'pending'
              ? existing.resolvedAt
              : undefined

        this.options.appState.approvals.upsert({
          approvalId,
          runId: event.runId,
          sessionId: event.sessionId,
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          ...(runMetadata?.agentId ? { agentId: runMetadata.agentId } : {}),
          status,
          ...(targetKey ? { targetKey } : {}),
          requestedAt: existing?.requestedAt ?? event.timestamp,
          ...(resolvedAt ? { resolvedAt } : {}),
          metadata: {
            ...(Array.isArray(payload.reasons)
              ? { reasons: payload.reasons.map(String) }
              : existing?.metadata && typeof existing.metadata === 'object'
                ? existing.metadata
                : {}),
            ...(Array.isArray(payload.permissionCategories)
              ? { permissionCategories: payload.permissionCategories.map(String) }
              : {}),
          },
        })
      }
    }
  }

  private syncUsageLedger(): void {
    const projection = this.options.usageProjection
    if (!projection) return

    for (const session of this.options.listSessions()) {
      const runMetadataByRunId = this.options.runMetadataByRunId(session.sessionId)
      const sessionEvents = this.options.nativeSessionEvents(session.sessionId, session)
      const usageEvents = sessionEvents.filter(
        (event): event is RunEvent<UsageUpdatedRunEventPayload> => event.type === 'usage.updated',
      )

      for (const event of usageEvents) {
        const runMetadata = runMetadataByRunId.get(event.runId)
        const providerInitDetail = latestProviderInitDetailFromRunEvents(
          sessionEvents.filter((candidate) => candidate.runId === event.runId),
        )
        projection.projectNativeEvent({
          event,
          runMetadata,
          ...(providerInitDetail ? { providerInitDetail } : {}),
        })
      }
    }

    this.syncRunLogUsageLedger()
  }

  private syncRunLogUsageLedger(): void {
    const runtime = this.options.runLog
    const projection = this.options.usageProjection
    if (!runtime || !projection) return

    for (const summary of runtime.usage.list()) {
      const runMetadata = this.options.appState.runs.get(summary.runId) ?? undefined
      projection.projectRunLogSummary({
        summary,
        ...(runMetadata ? { runMetadata } : {}),
      })
    }
  }

  private syncToolCalls(): void {
    for (const session of this.options.listSessions()) {
      const runMetadataByRunId = this.options.runMetadataByRunId(session.sessionId)
      const events = this.options.nativeSessionEvents(session.sessionId, session)

      for (const event of events) {
        let status: LocalGatewayToolCallRecord['status'] | null = null
        if (event.type === 'tool.call.requested') status = 'requested'
        if (event.type === 'tool.call.updated') status = 'updated'
        if (event.type === 'tool.call.completed') status = 'completed'
        if (event.type === 'tool.call.failed') status = 'failed'
        if (event.type === 'tool.call.blocked') status = 'blocked'
        if (!status) continue

        const payload = recordValue(event.payload)
        const toolCallId = textValue(payload?.toolCallId)
        if (!toolCallId) continue
        const existingToolCall = this.options.appState.toolCalls.get(toolCallId)
        const toolName = textValue(payload?.name) ?? existingToolCall?.toolName ?? toolCallId

        const runMetadata = runMetadataByRunId.get(event.runId)
        const outputRecord =
          event.type === 'tool.call.completed' || event.type === 'tool.call.failed'
            ? recordValue(payload?.output)
            : event.type === 'tool.call.blocked'
              ? recordValue(payload?.output)
              : null
        const outputRef =
          textValue(outputRecord?.artifactId)
          ?? textValue(outputRecord?.artifact)
          ?? textValue(outputRecord?.url)

        this.options.appState.toolCalls.upsert({
          toolCallId,
          runId: event.runId,
          sessionId: event.sessionId,
          toolName,
          status,
          ...(runMetadata?.agentId ? { agentId: runMetadata.agentId } : {}),
          ...(runMetadata?.workspaceId ? { workspaceId: runMetadata.workspaceId } : {}),
          ...(outputRef ? { outputRef } : {}),
          metadata: {
            sourceEventId: event.eventId,
            sourceSeq: event.seq,
            ...(event.type === 'tool.call.blocked' && typeof payload?.status === 'string'
              ? { blockedStatus: payload.status }
              : {}),
          },
        })
        this.syncExecutionCellProjection({
          event,
          runMetadata,
          toolCallId,
          toolName,
          outputRecord,
        })
      }
    }
  }

  private syncExecutionCellProjection(input: {
    event: RunEvent
    runMetadata: LocalGatewayRunMetadataRecord | undefined
    toolCallId: string
    toolName: string
    outputRecord: Record<string, unknown> | null
  }): void {
    if (!input.runMetadata?.workspaceId || !input.outputRecord) return

    const backendKey = textValue(input.outputRecord.backend)
    const backendLabel = textValue(input.outputRecord.backendLabel)
    if (!backendKey || !backendLabel) return

    const workspaceId = input.runMetadata.workspaceId
    const executionCellRecord = recordValue(input.outputRecord.executionCell)
    const executionLeaseRecord = recordValue(input.outputRecord.executionLease)
    const cellId = executionCellId(workspaceId, backendKey)
    const backendSessionId = textValue(input.outputRecord.sessionId)
    const executionStatus = textValue(input.outputRecord.status) ?? 'observed'
    const backendUnsafe = input.outputRecord.backendUnsafe === true
    const backendCapabilities =
      backendCapabilityMetadata(input.outputRecord.backendCapabilities)
      ?? backendCapabilityMetadata(executionCellRecord?.backendCapabilities)
    const leaseId =
      textValue(executionLeaseRecord?.leaseId)
      ?? executionLeaseId(input.toolCallId, backendSessionId)
    const existingCell = this.options.appState.cells.get(cellId)

    const baseCellMetadata = {
      source: 'execution-backend',
      backend: backendKey,
      backendLabel,
      backendUnsafe,
      ...(backendCapabilities ? { backendCapabilities } : {}),
    }
    const cellMetadata = {
      ...baseCellMetadata,
      ...(textValue(executionCellRecord?.cellKey)
        ? { runtimeCellKey: textValue(executionCellRecord?.cellKey) }
        : {}),
      latestToolCallId: input.toolCallId,
      latestExecutionStatus: executionStatus,
    }
    const cellInput = {
      cellId,
      workspaceId,
      label: backendLabel,
      status: 'active' as const,
      metadata: cellMetadata,
    }
    if (existingCell) {
      this.options.appState.cells.update(cellInput)
    } else {
      this.options.appState.cells.create(cellInput)
    }

    this.options.appState.cellLeases.upsert({
      leaseId,
      cellId,
      runId: input.event.runId,
      sessionId: input.event.sessionId,
      status: executionStatus === 'running' ? 'active' : 'released',
      metadata: {
        ...baseCellMetadata,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        ...(textValue(executionLeaseRecord?.cellKey)
          ? { runtimeCellKey: textValue(executionLeaseRecord?.cellKey) }
          : {}),
        ...(textValue(executionLeaseRecord?.status)
          ? { runtimeLeaseStatus: textValue(executionLeaseRecord?.status) }
          : {}),
        ...(textValue(executionLeaseRecord?.acquiredAt)
          ? { runtimeLeaseAcquiredAt: textValue(executionLeaseRecord?.acquiredAt) }
          : {}),
        ...(textValue(executionLeaseRecord?.releasedAt)
          ? { runtimeLeaseReleasedAt: textValue(executionLeaseRecord?.releasedAt) }
          : {}),
        sourceEventId: input.event.eventId,
        sourceSeq: input.event.seq,
      },
    })

    const snapshotId = `cell_snapshot_${input.event.eventId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    if (this.options.appState.cellSnapshots.get(snapshotId)) return
    this.options.appState.cellSnapshots.create({
      snapshotId,
      cellId,
      leaseId,
      label: `${backendLabel} ${executionStatus}`,
      metadata: {
        ...baseCellMetadata,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        ...(textValue(executionCellRecord?.cellKey)
          ? { runtimeCellKey: textValue(executionCellRecord?.cellKey) }
          : {}),
        ...(textValue(executionLeaseRecord?.leaseId)
          ? { runtimeLeaseId: textValue(executionLeaseRecord?.leaseId) }
          : {}),
        executionStatus,
      },
    })
  }

  private syncArtifacts(): void {
    const projection = this.options.artifactProjection
    if (!projection) return

    for (const session of this.options.listSessions()) {
      const runMetadataByRunId = this.options.runMetadataByRunId(session.sessionId)
      const rows = this.options.nativeMailboxEvents(session)

      for (const row of rows) {
        projection.project({
          row,
          ...('runId' in row.event && row.event.runId
            ? { runMetadata: runMetadataByRunId.get(row.event.runId) }
            : {}),
        })
      }
    }

    this.syncRunLogArtifacts(projection)
  }

  private syncRunLogArtifacts(projection: GatewayArtifactProjection): void {
    const runtime = this.options.runLog
    if (!runtime) return

    for (const run of runtime.runs.list()) {
      const runMetadata = this.options.appState.runs.get(run.runId) ?? undefined
      const events = runtime.store.listEvents({
        runId: run.runId,
        types: ['artifact.created', 'tool.call.completed'],
        limit: 10_000,
      })
      for (const event of events) {
        projection.projectRunLogEvent({
          event,
          run,
          ...(runMetadata ? { runMetadata } : {}),
        })
      }
    }
  }

  private syncRunCellLeases(): void {
    const hyperCells = this.options.hyperCells
    if (!hyperCells) return
    hyperCells.releaseTerminalRunLeases({
      loadRunEvents: this.options.loadRunEventsForLease,
      statusFromEvents: this.options.statusFromEvents,
    })
  }
}
