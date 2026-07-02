import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const faqPath = path.join(workspaceRoot, 'faq', 'returns.md')
const faqRoot = path.dirname(faqPath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'support-agent-workspace')

fs.mkdirSync(path.dirname(faqPath), { recursive: true })
fs.writeFileSync(
  faqPath,
  [
    '# Returns',
    '',
    '- Refund requests are accepted within 30 days of delivery.',
    '- Opened software license keys are not refundable.',
    '- Escalate damaged shipment claims to the operator.',
  ].join('\n'),
)

const provider = new MockProvider([
  {
    type: 'event',
    event: {
      type: 'tool_call',
      name: 'file.read',
      input: { path: 'faq/returns.md' },
      toolCallId: 'toolcall_support_read',
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
              : 'No FAQ text'
        return {
          type: 'result',
          text: `Support agent prepared a return-policy draft from the approved FAQ:\n${text}`,
      }
    },
  },
])

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  agent: {
    agentId: 'agent_support',
    instructions: 'Read approved support materials and draft concise customer-safe replies.',
    capabilities: ['provider', 'tools', 'files'],
    tools: ['file.read'],
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/support-agent',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Read the approved returns FAQ and draft a concise support answer.',
    sessionId: 'example-support-agent-session',
    workspaceId: 'support-agent-workspace',
    workspaceRoot,
    allowedTools: ['file.read'],
    metadata: {
      example: 'support-agent',
      runtimePath: 'runlog',
      businessCase: 'local business support concierge',
      customerSafe: true,
    },
  })

  const [summary] = await run.drainUntilIdle()
  const projection = run.projection()
  const finalText = run.result()
  const eventTypes = projection.events.map((event) => event.type)
  const expectedText = [
    'Support agent prepared a return-policy draft from the approved FAQ:',
    '# Returns',
    '',
    '- Refund requests are accepted within 30 days of delivery.',
    '- Opened software license keys are not refundable.',
    '- Escalate damaged shipment claims to the operator.',
  ].join('\n')

  if (summary?.status !== 'completed' || run.status() !== 'completed') {
    throw new Error(`Expected completed RunLog run, got ${summary?.status ?? run.status()}.`)
  }
  if (finalText !== expectedText) {
    throw new Error(`Unexpected support-agent result: ${finalText}`)
  }
  for (const required of [
    'run.created',
    'input.received',
    'provider.init',
    'tool.call.requested',
    'policy.decision.recorded',
    'tool.call.completed',
    'checkpoint.saved',
    'assistant.result',
    'run.completed',
  ]) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Support-agent example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'support-agent',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        faqPath: path.relative(repoRoot, faqPath).replaceAll('\\', '/'),
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
  fs.rmSync(faqRoot, { recursive: true, force: true })
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true })
}
