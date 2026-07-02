import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const sessionsRoot = path.join(runtimeRoot, 'sessions')
const outputPath = path.join(workspaceRoot, 'reports', 'next-step.txt')
const reportsRoot = path.dirname(outputPath)

fs.mkdirSync(workspaceRoot, { recursive: true })
fs.mkdirSync(sessionsRoot, { recursive: true })
fs.writeFileSync(
  path.join(workspaceRoot, 'README.md'),
  '# Coding Agent Workspace\n\nThis workspace is used by the runnable coding-agent example.\n',
)

const provider = new MockProvider([
  {
    type: 'event',
    event: {
      type: 'tool_call',
      name: 'file.write',
      input: {
        path: 'reports/next-step.txt',
        data: 'Run targeted tests before broad verification.\n',
      },
      toolCallId: 'toolcall_coding_agent_write',
    },
  },
  {
    type: 'await_push',
    produce: { type: 'progress', message: 'waiting for approval replay' },
  },
  {
    type: 'await_push',
    produce: (message) => {
      const parsed = JSON.parse(message)
      return {
        type: 'result',
        text:
          parsed.status === 'completed'
            ? 'Coding agent wrote the next-step report and is ready for review.'
            : `Coding agent stopped after tool status: ${parsed.status ?? 'unknown'}`,
      }
    },
  },
])

const mainspring = createMainspring({
  sessionsRoot,
  workspaceRoot,
  provider,
  pollIntervalMs: 10,
})

await mainspring.start()

try {
  const session = mainspring.sessions.create({
    metadata: {
      example: 'coding-agent',
      businessCase: 'workspace-scoped coding assistant',
    },
    workspace: { root: workspaceRoot },
  })

  const run = session.runs.start({
    input: 'Read the coding workspace plan and write one safe next-step report.',
    allowedTools: ['file.write'],
    mode: 'chat',
    metadata: {
      example: 'coding-agent',
      requiresReview: true,
    },
  })

  const streamPromise = (async () => {
    const events = []
    for await (const event of run.events()) events.push(event)
    return events
  })()

  const startedAt = Date.now()
  for (;;) {
    const approval = mainspring.approvals.list()[0]
    if (approval) {
      mainspring.approvals.approve({
        sessionId: approval.sessionId,
        runId: approval.runId,
        approvalId: approval.approvalId,
        reason: 'example auto-approval for local coding-agent walkthrough',
      })
      break
    }
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for coding-agent example approval.')
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  const events = await streamPromise
  const result = await run.result()
  const approvals = mainspring.approvals.list()
  const toolCalls = run.toolCalls().map((event) => ({
    type: event.type,
    name: event.payload?.name,
    payload: event.payload,
  }))
  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Coding-agent example did not produce ${outputPath}. Events: ${JSON.stringify(events.map((event) => ({ type: event.type, payload: event.payload })), null, 2)} Tool calls: ${JSON.stringify(toolCalls, null, 2)} Remaining approvals: ${JSON.stringify(approvals, null, 2)}`,
    )
  }
  const reportText = fs.readFileSync(outputPath, 'utf8')

  console.log(
    JSON.stringify(
      {
        example: 'coding-agent',
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        workspaceRoot,
        outputPath,
        eventTypes: events.map((event) => event.type),
        finalText: result,
        reportText,
        approvalsResolved: events.filter((event) => event.type === 'approval.approved').length,
        usageEvents: run.usage(),
        toolCalls,
      },
      null,
      2,
    ),
  )
} finally {
  await mainspring.stop()
  fs.rmSync(runtimeRoot, { recursive: true, force: true })
  fs.rmSync(reportsRoot, { recursive: true, force: true })
}
