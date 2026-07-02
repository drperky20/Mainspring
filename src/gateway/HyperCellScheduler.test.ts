import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MainspringSessionRecord, RunEvent, RunRecord } from '../contracts/runtime.js'
import { executionBackendCapabilities } from '../tools/ExecutionBackend.js'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { HyperCellScheduler } from './HyperCellScheduler.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

function makeAppState(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
}

function fakeInventory(input: { wslAvailable?: boolean; dockerAvailable?: boolean } = {}) {
  return {
    defaultBackend: 'host' as const,
    backends: [
      {
        key: 'host' as const,
        label: 'Host shell (test)',
        available: true,
        unsafe: true,
        capabilities: executionBackendCapabilities('host'),
        reason: 'Host process execution is available but not isolated.',
      },
      {
        key: 'wsl' as const,
        label: 'WSL bash',
        available: input.wslAvailable ?? false,
        unsafe: false,
        capabilities: executionBackendCapabilities('wsl'),
        ...(input.wslAvailable ? {} : { reason: 'WSL unavailable in test.' }),
      },
      {
        key: 'docker' as const,
        label: 'Docker Linux container',
        available: input.dockerAvailable ?? false,
        unsafe: false,
        capabilities: executionBackendCapabilities('docker'),
        ...(input.dockerAvailable ? {} : { reason: 'Docker unavailable in test.' }),
      },
    ],
  }
}

function session(input: Partial<MainspringSessionRecord> = {}): MainspringSessionRecord {
  return {
    sessionId: input.sessionId ?? 'session_1',
    status: 'open',
    workspaceRoot: '/workspace',
    sessionPath: '/sessions/session_1',
    createdAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

function run(input: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: input.runId ?? 'run_1',
    sessionId: input.sessionId ?? 'session_1',
    createdAt: '2026-06-28T00:00:01.000Z',
    input: 'hello',
    status: 'queued',
  }
}

function event(type: RunEvent['type']): RunEvent {
  return {
    eventId: `event_${type}`,
    seq: 1,
    runId: 'run_1',
    sessionId: 'session_1',
    timestamp: '2026-06-28T00:00:02.000Z',
    type,
    payload: {},
    visibility: 'public',
    traceId: 'trace_1',
    spanId: 'span_1',
  }
}

describe('HyperCellScheduler', () => {
  it('plans and acquires a sanitized run lease for an available backend', () => {
    const appState = makeAppState('mainspring-hypercell-scheduler-')
    const scheduler = new HyperCellScheduler({
      appState,
      inspectBackends: () => fakeInventory(),
    })

    try {
      const acquired = scheduler.acquireRunLease({
        session: session({ metadata: { workspaceId: 'workspace_1' } }),
        run: run(),
        sessionId: 'session_1',
        computerId: 'computer_local',
      })

      expect(acquired).toMatchObject({
        leaseId: 'lease_run_run_1',
        plan: {
          cellId: 'cell_run_workspace_1_host',
          workspaceId: 'workspace_1',
          requestedComputerId: 'computer_local',
          backend: expect.objectContaining({ key: 'host', unsafe: true }),
        },
      })
      expect(appState.cells.get('cell_run_workspace_1_host')).toMatchObject({
        label: 'Host shell (test)',
        metadata: expect.objectContaining({
          source: 'run-scheduler',
          backend: 'host',
          backendUnsafe: true,
          backendCapabilities: expect.objectContaining({
            isolationKind: 'host-process',
            isolationStrength: 'none',
            networkPolicy: 'host-inherited',
            unsafeFallback: true,
          }),
          latestRunId: 'run_1',
        }),
      })
      expect(appState.cellLeases.get('lease_run_run_1')).toMatchObject({
        status: 'active',
        runId: 'run_1',
        sessionId: 'session_1',
        metadata: expect.objectContaining({
          source: 'run-scheduler',
          backend: 'host',
          backendCapabilities: expect.objectContaining({
            isolationKind: 'host-process',
            isolationStrength: 'none',
            networkPolicy: 'host-inherited',
          }),
          requestedComputerId: 'computer_local',
        }),
      })
      expect(appState.auditEvents.list({ category: 'cells' })).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'lease.acquired',
          metadata: expect.objectContaining({
            backend: 'host',
            backendUnsafe: true,
            backendCapabilities: expect.objectContaining({
              isolationKind: 'host-process',
              isolationStrength: 'none',
            }),
          }),
        }),
      ]))
    } finally {
      appState.close()
    }
  })

  it('fails closed when an explicit isolated backend is unavailable', () => {
    const appState = makeAppState('mainspring-hypercell-scheduler-unavailable-')
    const scheduler = new HyperCellScheduler({
      appState,
      inspectBackends: () => fakeInventory({ dockerAvailable: false }),
    })

    try {
      expect(() =>
        scheduler.planRunLease({
          session: session(),
          workspaceId: 'workspace_1',
          computerId: 'computer_docker',
        }),
      ).toThrow('Execution backend "docker" is unavailable: Docker unavailable in test.')
      expect(appState.cellLeases.list()).toEqual([])
    } finally {
      appState.close()
    }
  })

  it('releases active run leases only after terminal runtime events', () => {
    const appState = makeAppState('mainspring-hypercell-scheduler-release-')
    const scheduler = new HyperCellScheduler({
      appState,
      inspectBackends: () => fakeInventory(),
    })

    try {
      const acquired = scheduler.acquireRunLease({
        session: session(),
        run: run(),
        sessionId: 'session_1',
        computerId: 'computer_local',
        workspaceId: 'workspace_1',
      })
      if (!acquired) throw new Error('Expected an acquired lease.')

      expect(
        scheduler.releaseTerminalRunLeases({
          loadRunEvents: () => [event('run.started')],
          statusFromEvents: () => 'running',
        }),
      ).toBe(0)
      expect(appState.cellLeases.get(acquired.leaseId)).toMatchObject({ status: 'active' })

      expect(
        scheduler.releaseTerminalRunLeases({
          loadRunEvents: () => [event('run.completed')],
          statusFromEvents: () => 'completed',
        }),
      ).toBe(1)
      expect(appState.cellLeases.get(acquired.leaseId)).toMatchObject({
        status: 'released',
        metadata: expect.objectContaining({ terminalRunStatus: 'completed' }),
      })
    } finally {
      appState.close()
    }
  })

  it('expires overdue run leases and stops counting them against cell capacity', () => {
    const appState = makeAppState('mainspring-hypercell-scheduler-expiry-')
    let now = new Date('2026-06-28T00:00:00.000Z')
    const scheduler = new HyperCellScheduler({
      appState,
      inspectBackends: () => fakeInventory(),
      now: () => now,
      leaseTtlMs: 1_000,
      maxActiveLeasesPerCell: 1,
    })

    try {
      const first = scheduler.acquireRunLease({
        session: session(),
        run: run({ runId: 'run_first' }),
        sessionId: 'session_1',
        computerId: 'computer_local',
        workspaceId: 'workspace_1',
      })
      if (!first) throw new Error('Expected first lease.')

      expect(() =>
        scheduler.acquireRunLease({
          session: session(),
          run: run({ runId: 'run_second' }),
          sessionId: 'session_1',
          computerId: 'computer_local',
          workspaceId: 'workspace_1',
        }),
      ).toThrow('HyperCell capacity exhausted for cell_run_workspace_1_host: 1/1 active leases.')
      expect(appState.auditEvents.list({ category: 'cells' })).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'lease.acquired' }),
        expect.objectContaining({
          action: 'capacity.blocked',
          targetType: 'cell',
          targetId: 'cell_run_workspace_1_host',
          metadata: expect.objectContaining({
            cellId: 'cell_run_workspace_1_host',
            workspaceId: 'workspace_1',
            backend: 'host',
            backendUnsafe: true,
            backendCapabilities: expect.objectContaining({
              isolationKind: 'host-process',
              isolationStrength: 'none',
              networkPolicy: 'host-inherited',
            }),
            requestedComputerId: 'computer_local',
            activeLeases: 1,
            maxActiveLeases: 1,
          }),
        }),
      ]))
      expect(scheduler.status()).toMatchObject({
        lastCapacityBlock: {
          cellId: 'cell_run_workspace_1_host',
          workspaceId: 'workspace_1',
          requestedComputerId: 'computer_local',
          backend: 'host',
          activeLeases: 1,
          maxActiveLeases: 1,
          blockedAt: expect.any(String),
        },
        cellStatuses: [
          expect.objectContaining({
            cellId: 'cell_run_workspace_1_host',
            lastCapacityBlock: expect.objectContaining({
              cellId: 'cell_run_workspace_1_host',
              activeLeases: 1,
              maxActiveLeases: 1,
            }),
          }),
        ],
      })

      now = new Date('2026-06-28T00:00:02.000Z')
      expect(scheduler.expireOverdueRunLeases()).toBe(1)
      expect(appState.cellLeases.get(first.leaseId)).toMatchObject({
        status: 'expired',
        metadata: expect.objectContaining({
          expiresAt: '2026-06-28T00:00:01.000Z',
          expiredAt: '2026-06-28T00:00:02.000Z',
        }),
      })

      const second = scheduler.acquireRunLease({
        session: session(),
        run: run({ runId: 'run_second' }),
        sessionId: 'session_1',
        computerId: 'computer_local',
        workspaceId: 'workspace_1',
      })
      expect(second).toMatchObject({ leaseId: 'lease_run_run_second' })
      expect(scheduler.status()).toMatchObject({
        enabled: true,
        capacityEnforced: true,
        maxActiveLeasesPerCell: 1,
        leases: {
          active: 1,
          released: 0,
          expired: 1,
          total: 2,
        },
        cellStatuses: [
          expect.objectContaining({
            cellId: 'cell_run_workspace_1_host',
            activeLeases: 1,
            expiredLeases: 1,
            maxActiveLeases: 1,
            capacityAvailable: 0,
          }),
        ],
      })
    } finally {
      appState.close()
    }
  })
})
