import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const workspaceRoot = path.join(__dirname, 'workspace')
const outputPath = path.join(workspaceRoot, 'reports', 'approved-note.txt')
const reportsRoot = path.dirname(outputPath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'tool-approval-workspace')

fs.mkdirSync(workspaceRoot, { recursive: true })
fs.writeFileSync(
  path.join(workspaceRoot, 'README.md'),
  '# Tool Approval Workspace\n\nThis workspace is used by the RunLog tool-approval example.\n',
)

const provider = new MockProvider((input) => {
  const toolMessage = input.messages?.find((message) => message.role === 'tool')
  if (toolMessage) {
    const parsed = JSON.parse(toolMessage.content)
    return [
      {
        type: 'event',
        event: {
          type: 'result',
          text:
            parsed.status === 'completed'
              ? 'RunLog approved the file write and completed the tool run.'
              : `RunLog stopped after tool status: ${parsed.status ?? 'unknown'}`,
        },
      },
    ]
  }

  return [
    {
      type: 'event',
      event: {
        type: 'tool_call',
        name: 'file.write',
        toolCallId: 'toolcall_runlog_file_write',
        input: {
          path: 'reports/approved-note.txt',
          data: 'Approved RunLog file write completed.\n',
        },
      },
    },
  ]
})

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  approvalReceiptKey: 'example-runlog-tool-approval-key',
  agent: {
    agentId: 'agent_tool_approval',
    instructions: 'Use file.write only after approval and then summarize the result.',
    capabilities: ['provider', 'tools', 'files'],
    tools: ['file.write'],
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/runlog-tool-approval',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Write the approved note into the workspace.',
    sessionId: 'example-tool-approval-session',
    workspaceId: 'tool-approval-workspace',
    workspaceRoot,
    metadata: {
      example: 'tool-approval',
      runtimePath: 'runlog',
    },
  })

  const [paused] = await run.drainUntilIdle()
  const pausedProjection = run.projection()
  const pendingApproval = pausedProjection.pendingApprovals[0]
  if (paused?.status !== 'awaiting_approval' || !pendingApproval?.approvalId) {
    throw new Error(
      `Expected RunLog approval pause, got ${paused?.status ?? 'no summary'} with ${pausedProjection.pendingApprovals.length} approvals.`,
    )
  }
  if (fs.existsSync(outputPath)) {
    throw new Error('file.write executed before approval.')
  }

  const receipt = run.approve({
    actor: 'example-operator',
    reason: 'Approve the local workspace write for the tool-approval example.',
    expiresInMs: 60_000,
  })
  const [resumed] = await run.drainUntilIdle()
  const projection = run.projection()
  const finalText = run.result()
  const eventTypes = projection.events.map((event) => event.type)

  if (receipt.decision !== 'approved') {
    throw new Error(`Expected approved receipt, got ${receipt.decision}.`)
  }
  if (resumed?.status !== 'completed' || run.status() !== 'completed') {
    throw new Error(`Expected completed RunLog run, got ${resumed?.status ?? run.status()}.`)
  }
  if (finalText !== 'RunLog approved the file write and completed the tool run.') {
    throw new Error(`Unexpected RunLog result: ${finalText}`)
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Approved file.write did not produce ${outputPath}.`)
  }
  const reportText = fs.readFileSync(outputPath, 'utf8')
  if (reportText !== 'Approved RunLog file write completed.\n') {
    throw new Error(`Unexpected approved file contents: ${reportText}`)
  }
  for (const required of [
    'tool.call.requested',
    'policy.decision.recorded',
    'approval.requested',
    'run.awaiting_approval',
    'approval.approved',
    'approval.receipt.used',
    'tool.call.completed',
    'assistant.result',
    'run.completed',
  ]) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Tool-approval example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'tool-approval',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        outputPath: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        reportText,
        approvalId: pendingApproval.approvalId,
        receiptId: receipt.receiptId,
        eventTypes,
        checkpointKinds: projection.events
          .filter((event) => event.type === 'checkpoint.saved')
          .map((event) => event.payload?.kind)
          .filter(Boolean),
        pendingApprovals: projection.pendingApprovals.length,
        approvalDecisions: projection.approvalDecisions.map((decision) => decision.decision),
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
