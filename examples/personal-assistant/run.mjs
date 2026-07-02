import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const notePath = path.join(workspaceRoot, 'notes', 'today.md')
const notesRoot = path.dirname(notePath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'personal-assistant-workspace')

fs.mkdirSync(path.dirname(notePath), { recursive: true })
fs.writeFileSync(
  notePath,
  [
    '# Today',
    '',
    '- Buy printer paper',
    '- Call dentist at 3pm',
    '- Draft the neighborhood update',
  ].join('\n'),
)

const provider = new MockProvider([
  {
    type: 'event',
    event: {
      type: 'tool_call',
      name: 'file.read',
      input: { path: 'notes/today.md' },
      toolCallId: 'toolcall_personal_read',
    },
  },
  {
      type: 'await_push',
      produce: (message) => {
        const parsed = JSON.parse(message)
        const text =
          typeof parsed.output?.preview === 'string'
            ? parsed.output.preview
            : typeof parsed.output?.text === 'string'
              ? parsed.output.text
              : 'No note text'
        return {
          type: 'result',
          text: `Personal assistant reviewed today's note:\n${text}`,
      }
    },
  },
])

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  agent: {
    agentId: 'agent_personal_assistant',
    instructions: 'Read local workspace notes and summarize the operator agenda.',
    capabilities: ['provider', 'tools', 'files'],
    tools: ['file.read'],
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/personal-assistant',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Read today\'s note and summarize the operator agenda.',
    sessionId: 'example-personal-assistant-session',
    workspaceId: 'personal-assistant-workspace',
    workspaceRoot,
    allowedTools: ['file.read'],
    metadata: {
      example: 'personal-assistant',
      runtimePath: 'runlog',
      businessCase: 'single-operator local assistant',
      privacy: 'local-first',
    },
  })

  const [summary] = await run.drainUntilIdle()
  const projection = run.projection()
  const finalText = run.result()
  const eventTypes = projection.events.map((event) => event.type)

  const expectedText = [
    'Personal assistant reviewed today\'s note:',
    '# Today',
    '',
    '- Buy printer paper',
    '- Call dentist at 3pm',
    '- Draft the neighborhood update',
  ].join('\n')

  if (summary?.status !== 'completed' || run.status() !== 'completed') {
    throw new Error(`Expected completed RunLog run, got ${summary?.status ?? run.status()}.`)
  }
  if (finalText !== expectedText) {
    throw new Error(`Unexpected personal assistant result: ${finalText}`)
  }
  for (const required of [
    'run.created',
    'input.received',
    'provider.init',
    'tool.call.requested',
    'policy.decision.recorded',
    'tool.call.completed',
    'assistant.result',
    'run.completed',
  ]) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Personal-assistant example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'personal-assistant',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        notePath: path.relative(repoRoot, notePath).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        eventTypes,
        checkpointKinds: projection.checkpoints.map((checkpoint) => checkpoint.kind).filter(Boolean),
        pendingApprovals: projection.pendingApprovals.length,
        policyDecisions: projection.policyDecisions.map((decision) => decision.state),
        usageEvents: projection.usage,
        toolCalls: projection.toolCalls.map((toolCall) => ({
          toolCallId: toolCall.toolCallId,
          name: toolCall.name,
          status: toolCall.status,
          payload: toolCall.payload,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  mainspring.close()
  fs.rmSync(runtimeRoot, { recursive: true, force: true })
  fs.rmSync(notesRoot, { recursive: true, force: true })
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true })
}
