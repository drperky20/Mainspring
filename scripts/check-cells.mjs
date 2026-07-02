import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import {
  createSqliteLocalGatewayAppStateStore,
  HyperCellScheduler,
  inspectExecutionBackends,
} from '../dist/index.js'

const inventory = inspectExecutionBackends()
const results = inventory.backends

function assertBackendTruth() {
  const byKey = new Map(results.map((backend) => [backend.key, backend]))
  const host = byKey.get('host')
  const wsl = byKey.get('wsl')
  const docker = byKey.get('docker')
  if (!host?.available || !host.unsafe) {
    throw new Error('Host backend must be available and explicitly unsafe.')
  }
  if (host.capabilities.isolationStrength !== 'none'
    || host.capabilities.securityBoundary !== 'none'
    || host.capabilities.networkPolicy !== 'host-inherited'
    || !host.capabilities.unsafeFallback) {
    throw new Error('Host backend capability metadata must not claim containment.')
  }
  if (!wsl || wsl.unsafe || wsl.capabilities.isolationKind !== 'wsl-distro') {
    throw new Error('WSL backend metadata must describe a non-host WSL execution path.')
  }
  if (wsl.available && wsl.capabilities.networkPolicy !== 'host-inherited') {
    throw new Error('WSL backend must not claim enforced network isolation.')
  }
  if (!docker || docker.unsafe || docker.capabilities.isolationKind !== 'docker-container') {
    throw new Error('Docker backend metadata must describe a non-host container execution path.')
  }
  if (
    docker.capabilities.networkPolicy !== 'container-network-disabled'
    || docker.capabilities.workspaceMapping !== 'docker-bind-mount'
    || !docker.capabilities.limits.some((limit) => limit.includes('not a VM'))
  ) {
    throw new Error('Docker backend metadata must disclose network and VM limits.')
  }
}

function verifySchedulerLifecycle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-cells-check-'))
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  let now = new Date('2026-06-28T00:00:00.000Z')
  try {
    const scheduler = new HyperCellScheduler({
      appState,
      inspectBackends: () => inventory,
      now: () => now,
      leaseTtlMs: 1_000,
      maxActiveLeasesPerCell: 1,
    })
    const session = {
      sessionId: 'cells-check-session',
      status: 'open',
      workspaceRoot: root,
      sessionPath: path.join(root, 'sessions', 'cells-check-session'),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      metadata: { workspaceId: 'workspace_cells_check' },
    }
    const firstRun = {
      runId: 'run_cells_check_1',
      sessionId: session.sessionId,
      createdAt: now.toISOString(),
      input: 'check',
      status: 'queued',
    }
    const firstLease = scheduler.acquireRunLease({
      session,
      run: firstRun,
      sessionId: session.sessionId,
      computerId: 'computer_local',
      workspaceId: 'workspace_cells_check',
    })
    if (!firstLease) throw new Error('Scheduler did not acquire a host lease.')
    const active = appState.cellLeases.get(firstLease.leaseId)
    if (active?.status !== 'active') {
      throw new Error(`Scheduler lease was not active: ${active?.status ?? 'missing'}.`)
    }

    let capacityBlocked = false
    try {
      scheduler.acquireRunLease({
        session,
        run: { ...firstRun, runId: 'run_cells_check_2' },
        sessionId: session.sessionId,
        computerId: 'computer_local',
        workspaceId: 'workspace_cells_check',
      })
    } catch (error) {
      capacityBlocked =
        error instanceof Error
        && error.message.includes('HyperCell capacity exhausted')
    }
    if (!capacityBlocked) throw new Error('Scheduler did not enforce per-cell capacity.')

    now = new Date('2026-06-28T00:00:02.000Z')
    if (scheduler.expireOverdueRunLeases() !== 1) {
      throw new Error('Scheduler did not expire the overdue lease.')
    }
    const expired = appState.cellLeases.get(firstLease.leaseId)
    if (expired?.status !== 'expired') {
      throw new Error(`Scheduler lease was not expired: ${expired?.status ?? 'missing'}.`)
    }
  } finally {
    appState.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

console.log(`Mainspring cell backend check on ${os.platform()} ${os.release()}`)
for (const backend of results) {
  console.log(
    `- ${backend.key}: ${backend.available ? 'available' : 'unavailable'} (${backend.unsafe ? 'unsafe-host' : 'isolated-capable'}; ${backend.capabilities.isolationStrength}; ${backend.capabilities.networkPolicy})${backend.reason ? ` - ${backend.reason}` : ''}`,
  )
}
assertBackendTruth()
console.log('- backend truth: ok (capabilities, verification commands, and limits present)')
verifySchedulerLifecycle()
console.log('- scheduler: ok (lease acquire, capacity block, expiry)')

if (!results.some((backend) => backend.available && !backend.unsafe)) {
  console.log(
    'No isolated-capable execution backend is currently available on this host. Host execution remains approval-gated but is not sandboxed.',
  )
}

console.log('MAINSPRING_CELLS_CHECK_OK')
