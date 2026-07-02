import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const workspaceRoot = path.join(__dirname, 'workspace')

fs.mkdirSync(workspaceRoot, { recursive: true })
fs.writeFileSync(
  path.join(workspaceRoot, 'README.md'),
  '# Provider Run Workspace\n\nThis workspace is used by the RunLog provider-only example.\n',
)

const provider = new MockProvider([
  { type: 'event', event: { type: 'delta', text: 'RunLog ' } },
  { type: 'event', event: { type: 'delta', text: 'provider example ' } },
  {
    type: 'event',
    event: {
      type: 'result',
      text: 'RunLog provider example completed without tools.',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        totalTokens: 19,
      },
    },
  },
])

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  agent: {
    agentId: 'agent_provider_run',
    instructions: 'Answer with a short status sentence. Do not use tools.',
    capabilities: ['provider'],
    providerId: 'mock',
    modelId: 'mock/runlog-provider',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Return one RunLog provider status line.',
    sessionId: 'example-provider-run-session',
    metadata: {
      example: 'provider-run',
      runtimePath: 'runlog',
    },
  })

  await run.drainUntilIdle()

  const projection = run.projection()
  const finalText = run.result()
  if (run.status() !== 'completed') {
    throw new Error(`Expected completed RunLog run, got ${run.status()}.`)
  }
  if (finalText !== 'RunLog provider example completed without tools.') {
    throw new Error(`Unexpected RunLog provider result: ${finalText}`)
  }
  const eventTypes = projection.events.map((event) => event.type)
  for (const required of ['run.created', 'input.received', 'provider.init', 'assistant.result', 'run.completed']) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Provider-run example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'provider-run',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        eventTypes,
        checkpointKinds: projection.events
          .filter((event) => event.type === 'checkpoint.saved')
          .map((event) => event.payload?.kind)
          .filter(Boolean),
        usage: projection.usage,
      },
      null,
      2,
    ),
  )
} finally {
  mainspring.close()
  fs.rmSync(runtimeRoot, { recursive: true, force: true })
}
