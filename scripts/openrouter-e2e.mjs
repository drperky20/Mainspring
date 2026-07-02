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
        message: 'OPENROUTER_API_KEY is required for the live OpenRouter verifier.',
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

function createTempRuntimeRoot() {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-openrouter-e2e-'))
  const sessionsRoot = path.join(runtimeRoot, 'sessions')
  const workspaceRoot = path.join(runtimeRoot, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  return { runtimeRoot, sessionsRoot, workspaceRoot }
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

async function collectRunEvents(run) {
  const events = []
  for await (const event of run.events()) {
    events.push(event)
  }
  return events
}

function eventTypes(events) {
  return events.map((event) => event.type)
}

if (process.env.MAINSPRING_OPENROUTER_E2E_SKIP_ENV_FILE !== '1') {
  loadEnvFile(envPath)
}

if (!process.env.OPENROUTER_API_KEY?.trim()) {
  printPrerequisiteBlocked()
  process.exit(1)
}

process.env.MAINSPRING_PROVIDER = 'openrouter'
process.env.MAINSPRING_MODEL = process.env.MAINSPRING_MODEL?.trim() || defaultModel
process.env.MAINSPRING_CREDENTIAL_REF = 'env:OPENROUTER_API_KEY'

const { runtimeRoot, sessionsRoot, workspaceRoot } = createTempRuntimeRoot()
const {
  PROVIDER_INIT_LOG_MESSAGE,
  createMainspring,
} = await import('../dist/index.js')
const mainspring = createMainspring({
  sessionsRoot,
  workspaceRoot,
  pollIntervalMs: 25,
  tools: [],
})

try {
  await mainspring.start()
  const session = mainspring.sessions.create({
    sessionId: 'openrouter-e2e',
    workspace: { root: workspaceRoot },
    metadata: { verifier: 'openrouter:e2e' },
  })
  const run = session.runs.start({
    input: `Reply exactly ${expected} and nothing else.`,
    systemPrompt: `You are a live provider verifier. Your entire response must be exactly ${expected}.`,
    allowedTools: [],
    providerId: 'openrouter',
    modelId: process.env.MAINSPRING_MODEL,
    mode: 'chat',
  })

  const events = await withTimeout(collectRunEvents(run), 'OpenRouter runtime run')
  const types = eventTypes(events)
  const assistantResult = await run.result()
  const usage = run.usage()
  const serializedEvents = JSON.stringify(events)
  const providerInit = events.find(
    (event) =>
      event.type === 'runtime.warning'
      && event.payload?.message === PROVIDER_INIT_LOG_MESSAGE,
  )

  if (serializedEvents.includes(process.env.OPENROUTER_API_KEY)) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      reason: 'event_journal_leaked_key_value',
      keyEchoed: true,
    })
  }

  if (serializedEvents.includes('OPENROUTER_API_KEY')) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      reason: 'event_journal_leaked_key_env_marker',
      keyEchoed: false,
    })
  }

  if (!providerInit) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      reason: 'missing_provider_init_warning',
      eventTypes: types,
      keyEchoed: false,
    })
  }

  if (!types.includes('run.started') || !types.includes('assistant.text.done') || !types.includes('run.completed')) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      reason: 'missing_required_runtime_events',
      eventTypes: types,
      keyEchoed: false,
    })
  }

  if (run.status() !== 'completed' || assistantResult?.trim() !== expected) {
    fail({
      status: 'OPENROUTER_E2E_FAIL',
      reason: 'unexpected_result',
      provider: providerInit.payload.payload?.provider ?? 'openrouter',
      model: providerInit.payload.payload?.modelId ?? process.env.MAINSPRING_MODEL,
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
        provider: providerInit.payload.payload?.provider ?? 'openrouter',
        model: providerInit.payload.payload?.modelId ?? process.env.MAINSPRING_MODEL,
        runStatus: run.status(),
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        eventCount: events.length,
        eventTypes: types,
        usagePresent: usage.length > 0,
        usage: usage[0] ?? null,
        keyEchoed: false,
        runtimePath:
          'createMainspring -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> events_out',
      },
      null,
      2,
    ),
  )
} catch (error) {
  fail({
    status: 'OPENROUTER_E2E_FAIL',
    reason: 'exception',
    message: error instanceof Error ? error.message : String(error),
    keyEchoed: false,
  })
} finally {
  await mainspring.stop().catch(() => {})
  if (process.env.MAINSPRING_OPENROUTER_E2E_KEEP_TMP !== '1') {
    fs.rmSync(runtimeRoot, { recursive: true, force: true })
  }
}
