import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const briefPath = path.join(workspaceRoot, 'briefs', 'launch-brief.md')
const deliverablePath = path.join(workspaceRoot, 'deliverables', 'client-update.md')
const briefsRoot = path.dirname(briefPath)
const deliverablesRoot = path.dirname(deliverablePath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'agency-client-workspace')

fs.mkdirSync(briefsRoot, { recursive: true })
fs.writeFileSync(
  briefPath,
  [
    '# Launch Brief',
    '',
    '- Client: Northwind Studio',
    '- Goal: Prepare a concise managed-agent launch update.',
    '- Include approval-backed delivery evidence in the workspace.',
  ].join('\n'),
)

const provider = new MockProvider((input) => {
  const toolMessages = input.messages?.filter((message) => message.role === 'tool') ?? []
  const writeResult = toolMessages
    .map((message) => JSON.parse(message.content))
    .find((message) => message.toolCallId === 'toolcall_agency_write' && message.status === 'completed')

  if (writeResult) {
    return [
      {
        type: 'event',
        event: {
          type: 'result',
          text: 'Agency client operator delivered an approval-backed client update.',
        },
      },
    ]
  }

  return [
    {
      type: 'event',
      event: {
        type: 'tool_call',
        name: 'file.read',
        input: { path: 'briefs/launch-brief.md' },
        toolCallId: 'toolcall_agency_read',
      },
    },
    {
      type: 'await_push',
      produce: (message) => {
        const parsed = JSON.parse(message)
        const text =
          typeof parsed.output?.text === 'string'
            ? parsed.output.text
            : typeof parsed.output?.preview === 'string'
              ? parsed.output.preview
              : ''
        return {
          type: 'tool_call',
          name: 'file.write',
          input: {
            path: 'deliverables/client-update.md',
            data: [
              '# Client Update',
              '',
              'Prepared by the agency-client operator.',
              '',
              text,
              '',
              '- Status: Ready for client review.',
            ].join('\n'),
          },
          toolCallId: 'toolcall_agency_write',
        }
      },
    },
  ]
})

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  approvalReceiptKey: 'example-agency-client-approval-key',
  agent: {
    agentId: 'agent_agency_client',
    instructions: 'Read one client brief, then write a concise client-facing deliverable after approval.',
    capabilities: ['provider', 'tools', 'files'],
    tools: ['file.read', 'file.write'],
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/agency-client-agent',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Read the client brief and produce one approval-backed client update.',
    sessionId: 'example-agency-client-session',
    workspaceId: 'agency-client-workspace',
    workspaceRoot,
    metadata: {
      example: 'agency-client-agent',
      runtimePath: 'runlog',
      businessCase: 'managed client workspace operator',
      reviewMode: 'client-facing',
    },
  })

  const [paused] = await run.drainUntilIdle()
  const pausedProjection = run.projection()
  const pendingApproval = pausedProjection.pendingApprovals[0]
  if (paused?.status !== 'awaiting_approval' || !pendingApproval?.approvalId) {
    const debugProjection = run.projection()
    throw new Error(
      `Expected RunLog approval pause, got ${paused?.status ?? 'no summary'} with ${
        pausedProjection.pendingApprovals.length
      } approvals. Events: ${debugProjection.events.map((event) => event.type).join(', ')}. Decisions: ${debugProjection.policyDecisions
        .map((decision) => `${decision.toolName ?? decision.operation}:${decision.state}`)
        .join(', ')}.`,
    )
  }
  if (fs.existsSync(deliverablePath)) {
    throw new Error('file.write executed before approval.')
  }

  const receipt = run.approve({
    actor: 'example-operator',
    reason: 'Approve the local client deliverable write for the agency-client walkthrough.',
    expiresInMs: 60_000,
  })
  const [resumed] = await run.drainUntilIdle()
  const projection = run.projection()
  const finalText = run.result()
  const eventTypes = projection.events.map((event) => event.type)

  if (receipt.decision !== 'approved') {
    throw new Error(`Expected approved RunLog receipt, got ${receipt.decision}.`)
  }
  if (resumed?.status !== 'completed' || run.status() !== 'completed') {
    throw new Error(`Expected completed RunLog run, got ${resumed?.status ?? run.status()}.`)
  }
  if (finalText !== 'Agency client operator delivered an approval-backed client update.') {
    throw new Error(`Unexpected agency-client-agent result: ${finalText}`)
  }
  if (!fs.existsSync(deliverablePath)) {
    throw new Error(`Agency-client-agent example did not produce ${deliverablePath}.`)
  }
  const deliverableText = fs.readFileSync(deliverablePath, 'utf8')
  const expectedDeliverable = [
    '# Client Update',
    '',
    'Prepared by the agency-client operator.',
    '',
    '# Launch Brief',
    '',
    '- Client: Northwind Studio',
    '- Goal: Prepare a concise managed-agent launch update.',
    '- Include approval-backed delivery evidence in the workspace.',
    '',
    '- Status: Ready for client review.',
  ].join('\n')
  if (deliverableText !== expectedDeliverable) {
    throw new Error(`Unexpected agency-client deliverable contents: ${deliverableText}`)
  }
  for (const required of [
    'run.created',
    'input.received',
    'provider.init',
    'tool.call.requested',
    'policy.decision.recorded',
    'tool.call.completed',
    'approval.requested',
    'run.awaiting_approval',
    'approval.approved',
    'approval.receipt.used',
    'assistant.result',
    'run.completed',
  ]) {
    if (!eventTypes.includes(required)) {
      throw new Error(
        `Agency-client-agent example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`,
      )
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'agency-client-agent',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        briefPath: path.relative(repoRoot, briefPath).replaceAll('\\', '/'),
        deliverablePath: path.relative(repoRoot, deliverablePath).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        deliverableText,
        approvalId: pendingApproval.approvalId,
        receiptId: receipt.receiptId,
        eventTypes,
        checkpointKinds: projection.checkpoints.map((checkpoint) => checkpoint.kind).filter(Boolean),
        pendingApprovals: projection.pendingApprovals.length,
        approvalDecisions: projection.approvalDecisions.map((decision) => decision.decision),
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
  fs.rmSync(briefsRoot, { recursive: true, force: true })
  fs.rmSync(deliverablesRoot, { recursive: true, force: true })
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true })
}
