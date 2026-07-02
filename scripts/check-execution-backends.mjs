import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalGatewayServer,
  createLocalMainspringGateway,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
  EchoProvider,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const dockerCapabilities = {
  isolationKind: 'docker-container',
  isolationStrength: 'container-boundary',
  securityBoundary: 'container-process',
  networkPolicy: 'container-network-disabled',
  workspaceMapping: 'docker-bind-mount',
  requiresApproval: true,
  unsafeFallback: false,
  limits: ['test metadata should keep this limit'],
  verificationCommand: { command: 'docker', args: ['info'] },
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-execution-backends-check-'))
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: new EchoProvider(),
    pollIntervalMs: 10,
  })
  const gateway = createLocalMainspringGateway({ runtime, appState })
  const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

  await runtime.start()
  try {
    const workspace = appState.workspaces.create({
      workspaceId: 'workspace_execution_backends_check',
      name: 'Execution Backend Check Workspace',
      root: workspaceRoot,
    })
    const cell = appState.cells.create({
      cellId: 'cell_execution_backends_check_docker',
      workspaceId: workspace.workspaceId,
      label: 'Docker Linux container',
      metadata: {
        backend: 'docker',
        backendLabel: 'Docker Linux container',
        backendUnsafe: false,
        backendCapabilities: {
          ...dockerCapabilities,
          secretHostPath: 'C:\\secret\\docker.sock',
        },
      },
    })
    appState.cellLeases.upsert({
      leaseId: 'lease_execution_backends_check_docker',
      cellId: cell.cellId,
      runId: 'run_execution_backends_check',
      sessionId: 'session_execution_backends_check',
      status: 'active',
      metadata: {
        backend: 'docker',
        backendLabel: 'Docker Linux container',
        backendUnsafe: false,
        backendCapabilities: dockerCapabilities,
      },
    })
    appState.cellSnapshots.create({
      snapshotId: 'snapshot_execution_backends_check_docker',
      cellId: cell.cellId,
      leaseId: 'lease_execution_backends_check_docker',
      label: 'Docker backend observed',
      metadata: {
        backend: 'docker',
        backendLabel: 'Docker Linux container',
        backendCapabilities: dockerCapabilities,
      },
    })

    const started = await server.start()
    const response = await fetch(`${started.url}/execution-backends/status`)
    const text = await response.text()
    assert(response.ok, `execution backend status route failed: ${text}`)
    const body = JSON.parse(text)
    const status = body.executionBackends
    assert(status?.defaultBackend === 'host', 'execution backend status did not include host default')
    const docker = status.backends?.find((backend) => backend.key === 'docker')
    assert(docker, 'execution backend status did not include Docker backend')
    assert(docker.observedCells === 1, `expected one observed Docker cell, got ${docker.observedCells}`)
    assert(docker.activeLeases === 1, `expected one active Docker lease, got ${docker.activeLeases}`)
    assert(docker.capabilities?.isolationKind === 'docker-container', 'Docker capability summary missing isolation kind')
    assert(docker.capabilities?.networkPolicy === 'container-network-disabled', 'Docker capability summary missing network policy')
    assert(docker.latestCell?.cellId === cell.cellId, 'Docker latest cell was not projected')
    assert(docker.latestLease?.leaseId === 'lease_execution_backends_check_docker', 'Docker latest lease was not projected')
    assert(docker.latestSnapshot?.snapshotId === 'snapshot_execution_backends_check_docker', 'Docker latest snapshot was not projected')

    const serialized = JSON.stringify(body)
    assert(!serialized.includes('verificationCommand'), 'execution backend status leaked verification command detail')
    assert(!serialized.includes('secretHostPath'), 'execution backend status leaked raw backend metadata')
    assert(!serialized.includes('C:\\secret'), 'execution backend status leaked host path detail')

    console.log('MAINSPRING_EXECUTION_BACKENDS_CHECK_OK')
  } finally {
    await server.stop()
    await runtime.stop()
    appState.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await main()
