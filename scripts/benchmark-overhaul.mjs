import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { EchoProvider } from '../dist/providers/EchoProvider.js'
import { createMainspring } from '../dist/sdk/Mainspring.js'
import { createRunLogMainspring } from '../dist/sdk/RunLogMainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from '../dist/gateway/index.js'
import { createLocalGatewayServer } from '../dist/gateway/server/createLocalGatewayServer.js'

const RUN_COUNT = 8
const PROVIDER_DELAY_MS = 20
const SNAPSHOT_CLIENT_COUNT = 24
const SNAPSHOT_COLD_SAMPLES = 5
const SNAPSHOT_SAMPLES = 20

class DelayedProvider {
  query(input) {
    let aborted = false
    return {
      push() {},
      end() {},
      abort() {
        aborted = true
      },
      events: (async function* () {
        yield {
          type: 'init',
          provider: 'benchmark',
          providerSessionId: input.sessionId ?? 'benchmark-session',
          modelId: input.model,
        }
        await sleep(PROVIDER_DELAY_MS)
        if (!aborted) yield { type: 'result', text: 'benchmark completed' }
      })(),
    }
  }
}

async function main() {
  const serial = await benchmarkRunDrain(1)
  const concurrent = await benchmarkRunDrain(4)
  const snapshot = await benchmarkSnapshotTransport()
  console.log(JSON.stringify({
    environment: {
      node: process.version,
      platform: process.platform,
      runCount: RUN_COUNT,
      providerDelayMs: PROVIDER_DELAY_MS,
      snapshotClientCount: SNAPSHOT_CLIENT_COUNT,
      snapshotColdSamples: SNAPSHOT_COLD_SAMPLES,
      snapshotSamples: SNAPSHOT_SAMPLES,
    },
    runtime: {
      serial,
      concurrent,
      speedup: round(serial.durationMs / concurrent.durationMs),
    },
    gatewaySnapshot: snapshot,
    interpretation: {
      runtime: 'The delayed provider fixture is deterministic enough to compare bounded local dispatch; it is not a claim about a live provider.',
      snapshot: 'A 304 has no JSON body. The console holds its last safe projection in memory and sends the ETag only as a request header.',
    },
  }, null, 2))
}

async function benchmarkRunDrain(maxConcurrentRuns) {
  const root = temporaryRoot('mainspring-benchmark-runlog-')
  const runtime = createRunLogMainspring({
    rootPath: root,
    workspaceRoot: path.join(root, 'workspaces'),
    provider: new DelayedProvider(),
    defaultProviderId: 'benchmark',
    agent: {
      agentId: 'benchmark-agent',
      instructions: 'Return the benchmark result.',
      providerId: 'benchmark',
      capabilities: ['provider'],
    },
    maxConcurrentRuns,
  })
  try {
    for (let index = 0; index < RUN_COUNT; index += 1) {
      runtime.runs.start({
        sessionId: `benchmark-session-${index}`,
        input: `benchmark run ${index}`,
      })
    }
    const startedAt = performance.now()
    const summaries = await runtime.drainUntilIdle()
    const durationMs = performance.now() - startedAt
    if (summaries.length !== RUN_COUNT || summaries.some((summary) => summary.status !== 'completed')) {
      throw new Error('RunLog benchmark did not drain every fixture run successfully.')
    }
    return { maxConcurrentRuns, durationMs: round(durationMs), completedRuns: summaries.length }
  } finally {
    runtime.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

async function benchmarkSnapshotTransport() {
  const root = temporaryRoot('mainspring-benchmark-snapshot-')
  const runtime = createMainspring({
    sessionsRoot: path.join(root, 'sessions'),
    workspaceRoot: path.join(root, 'workspaces'),
    provider: new EchoProvider(),
    pollIntervalMs: 1_000,
  })
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  const runLog = createRunLogMainspring({
    rootPath: path.join(root, 'runlog'),
    workspaceRoot: path.join(root, 'runlog-workspaces'),
    provider: new EchoProvider(),
    agent: {
      agentId: 'snapshot-benchmark-agent',
      instructions: 'Keep benchmark activity compact.',
      capabilities: ['provider'],
    },
  })
  const gateway = createLocalMainspringGateway({ runtime, appState, runLog })
  const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
  let serverStarted = false
  try {
    // Keep transport fixtures static. Starting the mailbox compatibility
    // worker here would mutate every fixture while page caching is measured,
    // turning this into a scheduler-contention benchmark instead.
    let traceRunId
    for (let index = 0; index < SNAPSHOT_CLIENT_COUNT; index += 1) {
      const created = gateway.clients.create({
        name: `Snapshot benchmark client ${index}`,
        workspaceName: `Snapshot benchmark workspace ${index}`,
        workspaceRoot: path.join(root, 'workspaces', `client-${index}`),
      })
      const compatibilityRun = gateway.runs.start({
        sessionId: created.session.sessionId,
        input: `snapshot benchmark compatibility activity ${index}`,
        mode: 'chat',
        allowedTools: [],
        workspaceId: created.workspace.workspaceId,
      })
      appState.approvals.upsert({
        approvalId: `snapshot-benchmark-approval-${index}`,
        runId: compatibilityRun.runId,
        sessionId: compatibilityRun.sessionId,
        workspaceId: created.workspace.workspaceId,
        status: index % 2 === 0 ? 'pending' : 'approved',
        targetKey: 'file.write',
      })
      const runLogRun = runLog.runs.start({
        sessionId: `snapshot-benchmark-runlog-session-${index}`,
        input: `snapshot benchmark activity ${index}`,
      })
      if (!traceRunId) traceRunId = runLogRun.record.runId
    }
    if (!traceRunId) throw new Error('Benchmark fixture did not create a RunLog trace run.')
    runLog.store.appendEvent({
      runId: traceRunId,
      type: 'runtime.warning',
      payload: { source: 'benchmark trace fixture' },
    })
    const started = await server.start()
    serverStarted = true
    const cold200 = await measure(SNAPSHOT_COLD_SAMPLES, async () => {
      const coldServer = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
      const coldStarted = await coldServer.start()
      try {
        const response = await fetch(`${coldStarted.url}/snapshot`)
        const body = await response.arrayBuffer()
        if (response.status !== 200) throw new Error(`Expected fresh snapshot status 200, received ${response.status}.`)
        return body.byteLength
      } finally {
        await coldServer.stop()
      }
    })
    const initialStartedAt = performance.now()
    const initial = await fetch(`${started.url}/snapshot`)
    const etag = initial.headers.get('etag')
    const initialBody = await initial.arrayBuffer()
    const initialDurationMs = performance.now() - initialStartedAt
    if (initial.status !== 200 || !etag) {
      throw new Error('Snapshot benchmark could not establish an initial ETag response.')
    }

    const revisionCheck = await measureLatency(SNAPSHOT_SAMPLES, () => gateway.snapshotRevision())
    const full = await measure(SNAPSHOT_SAMPLES, async () => {
      const response = await fetch(`${started.url}/snapshot`)
      const body = await response.arrayBuffer()
      if (response.status !== 200) throw new Error(`Expected full snapshot status 200, received ${response.status}.`)
      return body.byteLength
    })
    const unchanged = await measure(SNAPSHOT_SAMPLES, async () => {
      const response = await fetch(`${started.url}/snapshot`, {
        headers: { 'if-none-match': etag },
      })
      const body = await response.arrayBuffer()
      if (response.status !== 304) throw new Error(`Expected conditional snapshot status 304, received ${response.status}.`)
      return body.byteLength
    })
    const runLogActivity = await measure(SNAPSHOT_SAMPLES, async () => {
      const response = await fetch(`${started.url}/runlog/runs?limit=${SNAPSHOT_CLIENT_COUNT}`)
      const body = await response.arrayBuffer()
      if (response.status !== 200) {
        throw new Error(`Expected RunLog activity status 200, received ${response.status}.`)
      }
      return body.byteLength
    })
    const fetchCompatibilityActivity = async () => {
      const response = await fetch(`${started.url}/compatibility/runs?limit=${SNAPSHOT_CLIENT_COUNT}`)
      const body = await response.arrayBuffer()
      if (response.status !== 200) {
        throw new Error(`Expected compatibility activity status 200, received ${response.status}.`)
      }
      return body.byteLength
    }
    const compatibilityActivityCold = await measure(1, fetchCompatibilityActivity)
    const compatibilityActivityWarm = await measure(SNAPSHOT_SAMPLES, fetchCompatibilityActivity)
    const approvalHistory = await measure(SNAPSHOT_SAMPLES, async () => {
      const response = await fetch(`${started.url}/approval-history?limit=${SNAPSHOT_CLIENT_COUNT}`)
      const body = await response.arrayBuffer()
      if (response.status !== 200) {
        throw new Error(`Expected approval history status 200, received ${response.status}.`)
      }
      return body.byteLength
    })
    const runLogTrace = await measure(SNAPSHOT_SAMPLES, async () => {
      const response = await fetch(`${started.url}/runlog/runs/${encodeURIComponent(traceRunId)}/trace?limit=80`)
      const body = await response.arrayBuffer()
      if (response.status !== 200) {
        throw new Error(`Expected RunLog trace status 200, received ${response.status}.`)
      }
      return body.byteLength
    })
    return {
      initialResponse: {
        responseBytes: initialBody.byteLength,
        durationMs: round(initialDurationMs),
      },
      freshProjection200: cold200,
      revisionCheck,
      full200: full,
      unchanged304: unchanged,
      runLogActivity200: runLogActivity,
      compatibilityActivityCold200: compatibilityActivityCold,
      compatibilityActivityWarm200: compatibilityActivityWarm,
      approvalHistory200: approvalHistory,
      runLogTrace200: runLogTrace,
    }
  } finally {
    if (serverStarted) await server.stop()
    runLog.close()
    appState.close()
    await runtime.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

async function measure(iterations, operation) {
  const durations = []
  const bytes = []
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    bytes.push(await operation())
    durations.push(performance.now() - startedAt)
  }
  return {
    requests: iterations,
    responseBytes: statistics(bytes),
    durationMs: statistics(durations),
  }
}

async function measureLatency(iterations, operation) {
  const durations = []
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    await operation()
    durations.push(performance.now() - startedAt)
  }
  return {
    requests: iterations,
    durationMs: statistics(durations),
  }
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    mean: round(sum / sorted.length),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
  }
}

function percentile(values, percentileValue) {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))
  return values[index]
}

function temporaryRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function round(value) {
  return Math.round(value * 100) / 100
}

await main()
