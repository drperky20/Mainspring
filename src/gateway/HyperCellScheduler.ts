import type { MainspringSessionRecord, RunEvent, RunRecord } from '../contracts/runtime.js'
import {
  backendPreferenceFromComputerId,
  summarizeExecutionBackendCapabilities,
  type ExecutionBackendInventory,
  type ExecutionBackendStatus,
} from '../tools/ExecutionBackend.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayCellLeaseRecord,
} from './AppStateStore.js'

export interface HyperCellRunLeaseRequest {
  session: MainspringSessionRecord
  run: RunRecord
  sessionId: string
  computerId?: string
  workspaceId?: string
}

export interface PlannedHyperCellRunLease {
  cellId: string
  scopeId: string
  workspaceId?: string
  backend: ExecutionBackendStatus
  requestedComputerId: string
}

export interface AcquiredHyperCellRunLease {
  leaseId: string
  plan: PlannedHyperCellRunLease
}

export interface HyperCellSchedulerOptions {
  appState: LocalGatewayAppStateStore
  inspectBackends: () => ExecutionBackendInventory
  now?: () => Date
  leaseTtlMs?: number
  maxActiveLeasesPerCell?: number
}

export interface HyperCellSchedulerCellStatus {
  cellId: string
  workspaceId?: string
  label: string
  status: 'active' | 'archived'
  activeLeases: number
  releasedLeases: number
  expiredLeases: number
  maxActiveLeases?: number
  capacityAvailable?: number
  lastCapacityBlock?: HyperCellSchedulerCapacityBlockStatus
}

export interface HyperCellSchedulerCapacityBlockStatus {
  cellId: string
  workspaceId?: string
  requestedComputerId: string
  backend: ExecutionBackendStatus['key']
  activeLeases: number
  maxActiveLeases: number
  blockedAt: string
}

export interface HyperCellSchedulerStatus {
  enabled: boolean
  leaseTtlMs: number
  capacityEnforced: boolean
  maxActiveLeasesPerCell?: number
  cells: number
  leases: {
    active: number
    released: number
    expired: number
    total: number
  }
  lastCapacityBlock?: HyperCellSchedulerCapacityBlockStatus
  cellStatuses: HyperCellSchedulerCellStatus[]
}

export class HyperCellScheduler {
  constructor(private readonly options: HyperCellSchedulerOptions) {}

  status(): HyperCellSchedulerStatus {
    this.expireOverdueRunLeases()
    const cells = this.options.appState.cells.list()
    const leases = this.options.appState.cellLeases.list()
    const maxActiveLeasesPerCell = this.normalizedMaxActiveLeasesPerCell()
    const capacityBlocks = this.capacityBlockStatuses()
    const lastCapacityBlock = capacityBlocks[capacityBlocks.length - 1]
    return {
      enabled: true,
      leaseTtlMs: this.leaseTtlMs(),
      capacityEnforced: Number.isFinite(maxActiveLeasesPerCell),
      ...(Number.isFinite(maxActiveLeasesPerCell)
        ? { maxActiveLeasesPerCell }
        : {}),
      ...(lastCapacityBlock ? { lastCapacityBlock } : {}),
      cells: cells.length,
      leases: {
        active: leases.filter((lease) => lease.status === 'active').length,
        released: leases.filter((lease) => lease.status === 'released').length,
        expired: leases.filter((lease) => lease.status === 'expired').length,
        total: leases.length,
      },
      cellStatuses: cells.map((cell) => {
        const cellLeases = leases.filter((lease) => lease.cellId === cell.cellId)
        const activeLeases = cellLeases.filter((lease) => lease.status === 'active').length
        const lastCellCapacityBlock = [...capacityBlocks]
          .reverse()
          .find((block) => block.cellId === cell.cellId)
        return {
          cellId: cell.cellId,
          ...(cell.workspaceId ? { workspaceId: cell.workspaceId } : {}),
          label: cell.label,
          status: cell.status,
          activeLeases,
          releasedLeases: cellLeases.filter((lease) => lease.status === 'released').length,
          expiredLeases: cellLeases.filter((lease) => lease.status === 'expired').length,
          ...(Number.isFinite(maxActiveLeasesPerCell)
            ? {
                maxActiveLeases: maxActiveLeasesPerCell,
                capacityAvailable: Math.max(0, maxActiveLeasesPerCell - activeLeases),
              }
            : {}),
          ...(lastCellCapacityBlock ? { lastCapacityBlock: lastCellCapacityBlock } : {}),
        }
      }),
    }
  }

  planRunLease(input: {
    session: MainspringSessionRecord
    computerId?: string
    workspaceId?: string
  }): PlannedHyperCellRunLease | undefined {
    if (!input.computerId) return undefined
    const preference = backendPreferenceFromComputerId(input.computerId)
    if (!preference || preference === 'auto') return undefined

    const inventory = this.options.inspectBackends()
    const backend = inventory.backends.find((candidate) => candidate.key === preference)
    if (!backend) {
      throw new Error(`Unknown execution backend for computerId "${input.computerId}".`)
    }
    if (!backend.available) {
      throw new Error(
        `Execution backend "${preference}" is unavailable: ${backend.reason ?? 'unknown reason'}`,
      )
    }

    const sessionMetadata = recordValue(input.session.metadata) ?? {}
    const workspaceId = input.workspaceId ?? textValue(sessionMetadata.workspaceId)
    const scopeId = workspaceId ?? `session_${input.session.sessionId}`
    const plan = {
      cellId: runExecutionCellId(scopeId, backend.key),
      scopeId,
      ...(workspaceId ? { workspaceId } : {}),
      backend,
      requestedComputerId: input.computerId,
    }
    this.expireOverdueRunLeases()
    this.assertCellCapacity(plan)
    return plan
  }

  acquireRunLease(input: HyperCellRunLeaseRequest): AcquiredHyperCellRunLease | undefined {
    const plan = this.planRunLease(input)
    if (!plan) return undefined
    return this.acquirePlannedRunLease({ ...input, plan })
  }

  acquirePlannedRunLease(
    input: HyperCellRunLeaseRequest & { plan: PlannedHyperCellRunLease },
  ): AcquiredHyperCellRunLease {
    const plan = input.plan
    this.expireOverdueRunLeases()
    this.assertCellCapacity(plan)
    const existingCell = this.options.appState.cells.get(plan.cellId)
    const cellInput = {
      cellId: plan.cellId,
      ...(plan.workspaceId ? { workspaceId: plan.workspaceId } : {}),
      label: plan.backend.label,
      status: 'active' as const,
      metadata: {
        source: 'run-scheduler',
        scopeId: plan.scopeId,
        backend: plan.backend.key,
        backendLabel: plan.backend.label,
        backendUnsafe: plan.backend.unsafe,
        backendCapabilities: summarizeExecutionBackendCapabilities(plan.backend.capabilities),
        requestedComputerId: plan.requestedComputerId,
        latestRunId: input.run.runId,
        ...(plan.backend.reason ? { backendReason: plan.backend.reason } : {}),
      },
    }
    if (existingCell) {
      this.options.appState.cells.update(cellInput)
    } else {
      this.options.appState.cells.create(cellInput)
    }

    const leaseId = runExecutionLeaseId(input.run.runId)
    const acquiredAt = this.now()
    const expiresAt = new Date(acquiredAt.getTime() + this.leaseTtlMs()).toISOString()
    this.options.appState.cellLeases.upsert({
      leaseId,
      cellId: plan.cellId,
      runId: input.run.runId,
      sessionId: input.sessionId,
      status: 'active',
      metadata: {
        source: 'run-scheduler',
        backend: plan.backend.key,
        backendLabel: plan.backend.label,
        backendUnsafe: plan.backend.unsafe,
        backendCapabilities: summarizeExecutionBackendCapabilities(plan.backend.capabilities),
        requestedComputerId: plan.requestedComputerId,
        acquiredAt: acquiredAt.toISOString(),
        expiresAt,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'cells',
      action: 'lease.acquired',
      actor: 'local-gateway',
      targetType: 'cell-lease',
      targetId: leaseId,
      runId: input.run.runId,
      sessionId: input.sessionId,
      metadata: {
        cellId: plan.cellId,
        backend: plan.backend.key,
        backendUnsafe: plan.backend.unsafe,
        backendCapabilities: summarizeExecutionBackendCapabilities(plan.backend.capabilities),
      },
    })
    return { leaseId, plan }
  }

  expireOverdueRunLeases(): number {
    let expired = 0
    const now = this.now().toISOString()
    const activeRunLeases = this.options.appState.cellLeases
      .list({ status: 'active' })
      .filter((lease) => {
        const metadata = recordValue(lease.metadata)
        return metadata?.source === 'run-scheduler' && Boolean(lease.runId && lease.sessionId)
      })

    for (const lease of activeRunLeases) {
      const metadata = recordValue(lease.metadata) ?? {}
      const expiresAt = textValue(metadata.expiresAt)
      if (!expiresAt || expiresAt > now) continue
      this.options.appState.cellLeases.upsert({
        leaseId: lease.leaseId,
        cellId: lease.cellId,
        ...(lease.runId ? { runId: lease.runId } : {}),
        ...(lease.sessionId ? { sessionId: lease.sessionId } : {}),
        status: 'expired',
        metadata: {
          ...metadata,
          expiredAt: now,
        },
      })
      this.options.appState.auditEvents.create({
        category: 'cells',
        action: 'lease.expired',
        actor: 'local-gateway',
        targetType: 'cell-lease',
        targetId: lease.leaseId,
        ...(lease.runId ? { runId: lease.runId } : {}),
        ...(lease.sessionId ? { sessionId: lease.sessionId } : {}),
        metadata: {
          cellId: lease.cellId,
          expiresAt,
          expiredAt: now,
        },
      })
      expired += 1
    }
    return expired
  }

  releaseTerminalRunLeases(input: {
    loadRunEvents: (lease: LocalGatewayCellLeaseRecord) => RunEvent[]
    statusFromEvents: (events: RunEvent[]) => RunRecord['status']
  }): number {
    let released = 0
    this.expireOverdueRunLeases()
    const activeRunLeases = this.options.appState.cellLeases
      .list({ status: 'active' })
      .filter((lease) => {
        const metadata = recordValue(lease.metadata)
        return metadata?.source === 'run-scheduler' && Boolean(lease.runId && lease.sessionId)
      })

    for (const lease of activeRunLeases) {
      if (!lease.runId || !lease.sessionId) continue
      const status = input.statusFromEvents(input.loadRunEvents(lease))
      if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') continue

      const metadata = recordValue(lease.metadata) ?? {}
      this.options.appState.cellLeases.upsert({
        leaseId: lease.leaseId,
        cellId: lease.cellId,
        runId: lease.runId,
        sessionId: lease.sessionId,
        status: 'released',
        metadata: {
          ...metadata,
          terminalRunStatus: status,
        },
      })
      this.options.appState.auditEvents.create({
        category: 'cells',
        action: 'lease.released',
        actor: 'local-gateway',
        targetType: 'cell-lease',
        targetId: lease.leaseId,
        runId: lease.runId,
        sessionId: lease.sessionId,
        metadata: {
          cellId: lease.cellId,
          terminalRunStatus: status,
        },
      })
      released += 1
    }
    return released
  }

  private assertCellCapacity(plan: PlannedHyperCellRunLease): void {
    const maxActiveLeasesPerCell = this.normalizedMaxActiveLeasesPerCell()
    if (!Number.isFinite(maxActiveLeasesPerCell)) return
    if (maxActiveLeasesPerCell < 1) {
      throw new Error('HyperCell scheduler capacity must be at least 1 lease per cell.')
    }
    const activeCount = this.options.appState.cellLeases
      .list({ cellId: plan.cellId, status: 'active' })
      .filter((lease) => recordValue(lease.metadata)?.source === 'run-scheduler')
      .length
    if (activeCount >= maxActiveLeasesPerCell) {
      this.recordCapacityBlock(plan, activeCount, maxActiveLeasesPerCell)
      throw new Error(
        `HyperCell capacity exhausted for ${plan.cellId}: ${activeCount}/${maxActiveLeasesPerCell} active leases.`,
      )
    }
  }

  private recordCapacityBlock(
    plan: PlannedHyperCellRunLease,
    activeLeases: number,
    maxActiveLeases: number,
  ): void {
    this.options.appState.auditEvents.create({
      category: 'cells',
      action: 'capacity.blocked',
      actor: 'local-gateway',
      targetType: 'cell',
      targetId: plan.cellId,
      metadata: {
        cellId: plan.cellId,
        ...(plan.workspaceId ? { workspaceId: plan.workspaceId } : {}),
        backend: plan.backend.key,
        backendUnsafe: plan.backend.unsafe,
        backendCapabilities: summarizeExecutionBackendCapabilities(plan.backend.capabilities),
        requestedComputerId: plan.requestedComputerId,
        activeLeases,
        maxActiveLeases,
      },
    })
  }

  private capacityBlockStatuses(): HyperCellSchedulerCapacityBlockStatus[] {
    return this.options.appState.auditEvents
      .list({ category: 'cells' })
      .filter((event) => event.action === 'capacity.blocked')
      .map((event) => {
        const metadata = recordValue(event.metadata) ?? {}
        const activeLeases = numberValue(metadata.activeLeases)
        const maxActiveLeases = numberValue(metadata.maxActiveLeases)
        const cellId = textValue(metadata.cellId) ?? event.targetId
        const requestedComputerId = textValue(metadata.requestedComputerId)
        const backend = textValue(metadata.backend)
        if (
          !requestedComputerId
          || !backend
          || activeLeases === undefined
          || maxActiveLeases === undefined
        ) {
          return undefined
        }
        return {
          cellId,
          ...(textValue(metadata.workspaceId) ? { workspaceId: textValue(metadata.workspaceId) } : {}),
          requestedComputerId,
          backend: backend as ExecutionBackendStatus['key'],
          activeLeases,
          maxActiveLeases,
          blockedAt: event.createdAt,
        }
      })
      .filter((status): status is HyperCellSchedulerCapacityBlockStatus => Boolean(status))
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private leaseTtlMs(): number {
    return Math.max(1_000, this.options.leaseTtlMs ?? 6 * 60 * 60 * 1_000)
  }

  private normalizedMaxActiveLeasesPerCell(): number {
    return this.options.maxActiveLeasesPerCell ?? Number.POSITIVE_INFINITY
  }
}

export function runExecutionCellId(scopeId: string, backendKey: string): string {
  return `cell_run_${scopeId}_${backendKey}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function runExecutionLeaseId(runId: string): string {
  return `lease_run_${runId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
