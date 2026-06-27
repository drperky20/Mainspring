import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { AgentRunLoop, createRuntimeProviderFromEnv } from '../dist/index.js'

const root = process.cwd()
const envPath = path.join(root, '.env.local')
const expected = 'MAINSPRING_OPENROUTER_E2E_OK'

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

loadEnvFile(envPath)

if (!process.env.OPENROUTER_API_KEY?.trim()) {
  console.error('OPENROUTER_E2E_FAIL missing OPENROUTER_API_KEY')
  process.exit(1)
}

const selection = createRuntimeProviderFromEnv(process.env)
const run = new AgentRunLoop(selection.provider, {
  runId: 'run_openrouter_e2e',
  queryInput: {
    prompt: `Reply exactly ${expected} and nothing else.`,
    cwd: root,
    sessionId: 'openrouter-e2e',
    providerId: selection.providerId,
    model: selection.modelId,
  },
  maxIterations: 4,
  maxRetryAttempts: 1,
  retryableClassifications: ['provider_request_failed'],
})

const result = await run.run()
const providerInit = result.events.find((event) => event.type === 'provider.init')
const usage = result.events.find((event) => event.type === 'usage.updated')

if (result.exitReason !== 'completed' || result.assistantResult?.trim() !== expected) {
  console.error(
    JSON.stringify(
      {
        status: 'OPENROUTER_E2E_FAIL',
        provider: providerInit?.provider ?? selection.providerId,
        model: providerInit?.modelId ?? selection.modelId,
        exitReason: result.exitReason,
        eventCount: result.events.length,
        errorCount: result.errorCount,
        retryCount: result.retries.length,
        assistantResultPreview: result.assistantResult?.slice(0, 80) ?? null,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      status: 'OPENROUTER_E2E_OK',
      provider: providerInit?.provider ?? selection.providerId,
      model: providerInit?.modelId ?? selection.modelId,
      exitReason: result.exitReason,
      eventCount: result.events.length,
      usage: usage?.usage ?? null,
    },
    null,
    2,
  ),
)
