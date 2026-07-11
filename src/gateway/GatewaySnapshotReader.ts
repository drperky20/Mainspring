import { createHash } from 'node:crypto'
import type {
  MainspringApprovalRecord,
  MainspringSessionRecord,
  RunEvent,
} from '../contracts/runtime.js'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import type { Mainspring } from '../sdk/Mainspring.js'
import type { RunLogMainspring } from '../sdk/RunLogMainspring.js'
import type { RunLogRunProjection } from '../hosts/runlog/RunLogProjection.js'
import type { ExecutionBackendInventory } from '../tools/ExecutionBackend.js'
import {
  COMPATIBILITY_MAILBOX_REVISION_PROBE_MS,
  compatibilityMailboxFingerprint,
} from './CompatibilityRunPage.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'
import type {
  LocalGatewayBudgetStatus,
  LocalGatewayCellStatus,
  LocalGatewayCronStatus,
  LocalGatewayPricingCatalogStatus,
  LocalGatewayRunLogRunProjection,
  LocalGatewayRunLogSnapshot,
  LocalGatewayRunLogWorkerStatus,
  LocalGatewayRunProjection,
  LocalGatewaySessionProjection,
  LocalGatewaySnapshot,
  LocalGatewayUsageStatus,
} from './LocalGateway.js'

/**
 * Broad snapshots are transport snapshots, not history APIs. Detailed rows
 * remain available through their cursor-paginated routes; keep only a small
 * newest-first tail here so refresh cost cannot grow with ledger history.
 */
export const GATEWAY_SNAPSHOT_HISTORY_LIMIT = 100

export function projectLocalGatewayRunLogRun(projection: RunLogRunProjection): LocalGatewayRunLogRunProjection {
  return {
    runId: projection.run.runId,
    sessionId: projection.run.sessionId,
    agentId: projection.run.agentId,
    status: projection.status,
    ...(projection.run.workspaceId ? { workspaceId: projection.run.workspaceId } : {}),
    ...(projection.run.providerId ? { providerId: projection.run.providerId } : {}),
    ...(projection.run.modelId ? { modelId: projection.run.modelId } : {}),
    createdAt: projection.run.createdAt,
    updatedAt: projection.run.updatedAt,
    assistantText: projection.assistantText,
    latestSeq: projection.latestSeq,
    eventCount: projection.eventCount,
    ...(projection.events.at(-1)?.type ? { lastEventType: projection.events.at(-1)?.type } : {}),
    pendingApprovals: projection.pendingApprovals.map((approval) => ({
      ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      ...(approval.toolCallId ? { toolCallId: approval.toolCallId } : {}),
    })),
    approvalDecisions: projection.approvalDecisions.map((approval) => ({
      ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      ...(approval.receiptId ? { receiptId: approval.receiptId } : {}),
      decision: approval.decision,
    })),
    toolCalls: projection.toolCalls.map((call) => ({
      ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
      ...(call.name ? { name: call.name } : {}),
      status: call.status,
    })),
    checkpoints: projection.checkpoints.map((checkpoint) => ({
      eventId: checkpoint.eventId,
      seq: checkpoint.seq,
      ...(checkpoint.kind ? { kind: checkpoint.kind } : {}),
    })),
    policyDecisions: projection.policyDecisions,
    errors: projection.errors.map((error) => ({
      eventId: error.eventId,
      seq: error.seq,
      type: error.type,
      ...(error.message ? { message: error.message } : {}),
    })),
  }
}

/**
 * Owns the expensive, read-only gateway aggregate and its server-only revision
 * token. Command routing remains in LocalGateway; this collaborator has no
 * mutation API and is intentionally the sole owner of mailbox revision caching.
 */
export class GatewaySnapshotReader {
  private compatibilityMailboxRevision?: { checkedAtMs: number; fingerprint: string }

  constructor(private readonly options: {
    runtime: Mainspring
    runLog?: RunLogMainspring
    appState?: LocalGatewayAppStateStore
    inspectExecutionBackends: () => ExecutionBackendInventory
    syncDerivedAppState: () => void
    listSessions: () => LocalGatewaySessionProjection[]
    listRuns: (sessionId: string, knownSession?: LocalGatewaySessionProjection) => LocalGatewayRunProjection[]
    snapshotApprovals: () => MainspringApprovalRecord[]
    cronStatus: () => LocalGatewayCronStatus
    pricingCatalog: LocalGatewayPricingCatalogStatus
    usageStatus: () => LocalGatewayUsageStatus
    budgetStatus: () => LocalGatewayBudgetStatus
    cellStatus: () => LocalGatewayCellStatus
    workerState: () => LocalGatewayRunLogWorkerStatus['state']
  }) {}

  snapshot(): LocalGatewaySnapshot {
    const sessions = this.options.listSessions()
    this.options.syncDerivedAppState()
    const appState = this.options.appState
    const runs = sessions.flatMap((session) => this.options.listRuns(session.sessionId, session))
    const artifacts = appState?.artifacts.list({
      order: 'desc',
      limit: GATEWAY_SNAPSHOT_HISTORY_LIMIT,
    }) ?? []
    const toolCalls = appState?.toolCalls.list({
      order: 'desc',
      limit: GATEWAY_SNAPSHOT_HISTORY_LIMIT,
    }) ?? []
    const usageLedger = appState?.usageLedger.list({
      order: 'desc',
      limit: GATEWAY_SNAPSHOT_HISTORY_LIMIT,
    }) ?? []
    const auditEvents = appState?.auditEvents.list({
      order: 'desc',
      limit: GATEWAY_SNAPSHOT_HISTORY_LIMIT,
    }) ?? []
    return {
      generatedAt: new Date().toISOString(),
      health: this.options.runtime.health(),
      executionBackends: this.options.inspectExecutionBackends(),
      appState: {
        clients: appState?.clients.list() ?? [],
        workspaces: appState?.workspaces.list() ?? [],
        agents: appState?.agents.list() ?? [],
        providerProfiles: appState?.providerProfiles.list() ?? [],
        runs: appState?.runs.list() ?? [],
        approvals: appState?.approvals.list() ?? [],
        artifacts,
        toolCalls,
        deploymentTargets: appState?.deploymentTargets.list() ?? [],
        deploymentRuns: appState?.deploymentRuns.list() ?? [],
        cells: appState?.cells.list() ?? [],
        cellLeases: appState?.cellLeases.list() ?? [],
        cellSnapshots: appState?.cellSnapshots.list() ?? [],
        cronSchedules: appState?.cronSchedules.list() ?? [],
        budgets: appState?.budgets.list() ?? [],
        usageLedger,
        auditEvents,
        historyCounts: {
          artifacts: appState?.artifacts.count?.() ?? artifacts.length,
          toolCalls: appState?.toolCalls.count?.() ?? toolCalls.length,
          usageLedger: appState?.usageLedger.count?.() ?? usageLedger.length,
          auditEvents: appState?.auditEvents.count?.() ?? auditEvents.length,
        },
      },
      sessions,
      runs,
      approvals: this.options.snapshotApprovals(),
      ...(this.options.runLog ? { runLog: this.projectRunLogSnapshot() } : {}),
      cron: this.options.cronStatus(),
      pricingCatalog: this.options.pricingCatalog,
      usageStatus: this.options.usageStatus(),
      budgetStatus: this.options.budgetStatus(),
      cellStatus: this.options.cellStatus(),
    }
  }

  revision(): string {
    const sessions = this.options.runtime.storage.stateStore.listSessions()
    const runLog = this.options.runLog
    const health = this.options.runtime.health()
    const runLogRevision = runLog
      ? runLog.runs.list().map((run) => [
          run.runId,
          run.status,
          run.attemptCount,
          runLog.store.latestEventSeq(run.runId),
        ].join(':'))
      : []
    return createHash('sha256').update(JSON.stringify({
      appStateRevision: this.options.appState?.revision() ?? 0,
      health: { ok: health.ok, running: health.running, activeSessions: health.activeSessions },
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        updatedAt: session.updatedAt,
      })),
      mailbox: this.mailboxRevision(sessions),
      runLog: runLogRevision,
      runLogWorkerState: this.options.workerState(),
    })).digest('base64url')
  }

  workerStatus(): LocalGatewayRunLogWorkerStatus {
    const outbox = { pending: 0, claimed: 0, retryable: 0, completed: 0, failed: 0, cancelled: 0 }
    const runtime = this.options.runLog
    if (!runtime) return { state: 'stopped', queuedRuns: 0, outbox }
    for (const item of runtime.store.listExecutionOutbox()) outbox[item.status] += 1
    return {
      state: this.options.workerState(),
      queuedRuns: runtime.runs.list({ status: 'queued' }).length,
      outbox,
    }
  }

  private projectRunLogSnapshot(): LocalGatewayRunLogSnapshot {
    const runtime = this.options.runLog
    if (!runtime) return { configured: false, worker: this.workerStatus(), runs: [] }
    const runs = runtime.runs.list().flatMap((record) => {
      try {
        return [projectLocalGatewayRunLogRun(runtime.project(record.runId))]
      } catch {
        return []
      }
    })
    return { configured: true, worker: this.workerStatus(), runs }
  }

  private mailboxRevision(sessions: MainspringSessionRecord[]): string {
    const now = Date.now()
    const cached = this.compatibilityMailboxRevision
    const revision = !cached || now - cached.checkedAtMs >= COMPATIBILITY_MAILBOX_REVISION_PROBE_MS
      ? {
          checkedAtMs: now,
          fingerprint: sessions.map((session) => compatibilityMailboxFingerprint(session.sessionPath)).join('|'),
        }
      : cached
    this.compatibilityMailboxRevision = revision
    return `${MainspringMailbox.changeRevision()}:${revision.fingerprint}`
  }
}
