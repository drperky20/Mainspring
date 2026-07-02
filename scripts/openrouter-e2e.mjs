#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const envPath = path.join(root, '.env.local')
const expected = 'MAINSPRING_OPENROUTER_E2E_OK'
const prerequisiteBlocked = 'MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED'
const defaultModel = 'openrouter/free'
const timeoutMs = positiveInt(process.env.MAINSPRING_OPENROUTER_E2E_TIMEOUT_MS) ?? 120_000

function positiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equals = trimmed.indexOf('=')
    if (equals <= 0) continue
    const key = trimmed.slice(0, equals).trim()
    const value = trimmed.slice(equals + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

function printPrerequisiteBlocked() {
  console.error(prerequisiteBlocked)
  console.error(
    JSON.stringify(
      {
        status: 'prerequisites_blocked',
        runtimePath: 'runlog',
        message: 'OPENROUTER_API_KEY is required for the live RunLog OpenRouter verifier.',
        requiredEnv: ['OPENROUTER_API_KEY'],
        envFileChecked: '.env.local',
        keyPresent: false,
        keyEchoed: false,
      },
      null,
      2,
    ),
  )
}

function fail(payload) {
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
}

function createTempRunLogRoot() {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-runlog-openrouter-e2e-'))
  const workspaceRoot = path.join(runtimeRoot, 'workspace')
  const runLogRoot = path.join(runtimeRoot, 'runlog')
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(runLogRoot, { recursive: true })
  return {
    runtimeRoot,
    workspaceRoot,
    runLogRoot,
    dbPath: path.join(runLogRoot, 'runlog.sqlite'),
  }
}

function withTimeout(promise, label) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`))
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

function eventTypes(events) {
  return events.map((event) => event.type)
}

function assertNoKeyEcho(input) {
  const serialized = JSON.stringify(input.events)
  if (serialized.includes(input.keyValue)) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      runtimePath: 'runlog',
      reason: 'runlog_events_leaked_key_value',
      keyEchoed: true,
    })
  }
  if (serialized.includes('OPENROUTER_API_KEY')) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      runtimePath: 'runlog',
      reason: 'runlog_events_leaked_key_env_marker',
      keyEchoed: false,
    })
  }
}

if (process.env.MAINSPRING_OPENROUTER_E2E_SKIP_ENV_FILE !== '1') {
  loadEnvFile(envPath)
}

if (!process.env.OPENROUTER_API_KEY?.trim()) {
  printPrerequisiteBlocked()
  process.exit(1)
}

process.env.MAINSPRING_MODEL = process.env.MAINSPRING_MODEL?.trim() || defaultModel

const { runtimeRoot, workspaceRoot, runLogRoot, dbPath } = createTempRunLogRoot()
const {
  OpenRouterProvider,
  createRunLogMainspring,
} = await import('../dist/index.js')

const mainspring = createRunLogMainspring({
  rootPath: runLogRoot,
  dbPath,
  workspaceRoot,
  defaultProviderId: 'openrouter',
  providers: {
    openrouter: new OpenRouterProvider({
      credentialRef: 'env:OPENROUTER_API_KEY',
      modelId: process.env.MAINSPRING_MODEL,
      options: { requestTimeoutMs: timeoutMs },
    }),
  },
  agent: {
    agentId: 'agent_openrouter_e2e',
    instructions: `You are a live provider verifier. Your entire response must be exactly ${expected}.`,
    providerId: 'openrouter',
    modelId: process.env.MAINSPRING_MODEL,
    workspacePolicy: 'lazy',
    capabilities: ['provider'],
  },
  tools: [],
  workerId: 'openrouter-runlog-e2e',
})

try {
  const run = mainspring.runs.start({
    sessionId: 'openrouter-runlog-e2e',
    workspaceId: 'openrouter-runlog-e2e-workspace',
    workspaceRoot,
    input: `Reply exactly ${expected} and nothing else.`,
    systemPrompt: `You are a live provider verifier. Your entire response must be exactly ${expected}.`,
    providerId: 'openrouter',
    modelId: process.env.MAINSPRING_MODEL,
    credentialRef: 'env:OPENROUTER_API_KEY',
    requestedCapabilities: ['provider'],
    allowedTools: [],
    metadata: { verifier: 'openrouter:e2e', runtimePath: 'runlog' },
  })

  await withTimeout(run.drainUntilIdle(), 'RunLog OpenRouter run')
  const projection = run.projection()
  const events = run.events()
  const types = eventTypes(events)
  const assistantResult = run.result()
  const providerInit = projection.events.find((event) => event.type === 'provider.init')
  const usage = projection.usage[0] ?? null

  assertNoKeyEcho({ events, keyValue: process.env.OPENROUTER_API_KEY })

  if (!providerInit) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      runtimePath: 'runlog',
      reason: 'missing_provider_init_event',
      eventTypes: types,
      keyEchoed: false,
    })
  }

  if (!types.includes('run.created') || !types.includes('provider.init') || !types.includes('run.completed')) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      runtimePath: 'runlog',
      reason: 'missing_required_runlog_events',
      eventTypes: types,
      keyEchoed: false,
    })
  }

  if (run.status() !== 'completed' || assistantResult?.trim() !== expected) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      runtimePath: 'runlog',
      reason: 'unexpected_result',
      provider: providerInit.payload?.provider ?? 'openrouter',
      model: providerInit.payload?.modelId ?? process.env.MAINSPRING_MODEL,
      runStatus: run.status(),
      eventCount: events.length,
      eventTypes: types,
      assistantResultPreview: assistantResult?.slice(0, 80) ?? null,
      keyEchoed: false,
    })
  }

  console.log(
    JSON.stringify(
      {
        status: 'OPENROUTER_E2E_OK',
        runtimePath: 'runlog',
        provider: providerInit.payload?.provider ?? 'openrouter',
        model: providerInit.payload?.modelId ?? process.env.MAINSPRING_MODEL,
        providerTransport: providerInit.payload?.providerTransport ?? null,
        providerSessionIdPresent: Boolean(providerInit.payload?.providerSessionId),
        runStatus: run.status(),
        sessionId: run.record.sessionId,
        runId: run.record.runId,
        eventCount: events.length,
        eventTypes: types,
        latestSeq: projection.latestSeq,
        checkpointKinds: projection.checkpoints.map((checkpoint) => checkpoint.kind ?? 'checkpoint'),
        usagePresent: projection.usage.length > 0,
        usage,
        keyEchoed: false,
        runtimeSpine:
          'createRunLogMainspring -> RunIntent -> RunLogKernel -> RunLogExecutor -> ProviderRouter -> OpenRouterProvider -> RunLogProjection',
      },
      null,
      2,
    ),
  )
} catch (error) {
  fail({
    status: 'OPENROUTER_E2E_FAIL',
    runtimePath: 'runlog',
    reason: 'exception',
    message: error instanceof Error ? error.message : String(error),
    keyEchoed: false,
  })
} finally {
  mainspring.close()
  if (process.env.MAINSPRING_OPENROUTER_E2E_KEEP_TMP !== '1') {
    fs.rmSync(runtimeRoot, { recursive: true, force: true })
  }
}
