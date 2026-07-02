import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const planPath = path.join(workspaceRoot, 'README.md')
const outputPath = path.join(workspaceRoot, 'reports', 'next-step.txt')
const reportsRoot = path.dirname(outputPath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'coding-agent-workspace')

fs.mkdirSync(workspaceRoot, { recursive: true })
fs.writeFileSync(
  planPath,
  '# Coding Agent Workspace\n\nThis workspace is used by the runnable coding-agent example.\n',
)

const provider = new MockProvider((input) => {
  const toolMessages = input.messages?.filter((message) => message.role === 'tool') ?? []
  const writeResult = toolMessages
    .map((message) => JSON.parse(message.content))
    .find((message) => message.toolCallId === 'toolcall_coding_agent_write' && message.status === 'completed')

  if (writeResult) {
    return [
      {
        type: 'event',
        event: {
          type: 'result',
          text: 'Coding agent wrote the next-step report and is ready for review.',
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
        input: { path: 'README.md' },
        toolCallId: 'toolcall_coding_agent_read',
      },
    },
    {
      type: 'await_push',
      produce: (message) => {
        const parsed = JSON.parse(message)
        const readOk = parsed.status === 'completed'
        return {
          type: 'tool_call',
          name: 'file.write',
          input: {
            path: 'reports/next-step.txt',
            data: readOk
              ? 'Run targeted tests before broad verification.\n'
              : 'Read failed; pause before changing the workspace.\n',
          },
          toolCallId: 'toolcall_coding_agent_write',
        }
      },
    },
  ]
})

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  approvalReceiptKey: 'example-coding-agent-approval-key',
  agent: {
    agentId: 'agent_coding',
    instructions: 'Read the coding workspace plan, then write a concise next-step report after approval.',
    capabilities: ['provider', 'tools', 'files'],
    tools: ['file.read', 'file.write'],
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/coding-agent',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Read the coding workspace plan and write one safe next-step report.',
    sessionId: 'example-coding-agent-session',
    workspaceId: 'coding-agent-workspace',
    workspaceRoot,
    metadata: {
      example: 'coding-agent',
      runtimePath: 'runlog',
      businessCase: 'workspace-scoped coding assistant',
      requiresReview: true,
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
  if (fs.existsSync(outputPath)) {
    throw new Error('file.write executed before approval.')
  }

  const receipt = run.approve({
    actor: 'example-operator',
    reason: 'Approve the local workspace report write for the coding-agent walkthrough.',
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
  if (finalText !== 'Coding agent wrote the next-step report and is ready for review.') {
    throw new Error(`Unexpected coding-agent result: ${finalText}`)
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Coding-agent example did not produce ${outputPath}.`)
  }
  const reportText = fs.readFileSync(outputPath, 'utf8')
  if (reportText !== 'Run targeted tests before broad verification.\n') {
    throw new Error(`Unexpected coding-agent report contents: ${reportText}`)
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
      throw new Error(`Coding-agent example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'coding-agent',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        planPath: path.relative(repoRoot, planPath).replaceAll('\\', '/'),
        outputPath: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        reportText,
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
  fs.rmSync(reportsRoot, { recursive: true, force: true })
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true })
}
