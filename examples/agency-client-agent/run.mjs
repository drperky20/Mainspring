import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const sessionsRoot = path.join(runtimeRoot, 'sessions')
const briefPath = path.join(workspaceRoot, 'briefs', 'launch-brief.md')
const deliverablePath = path.join(workspaceRoot, 'deliverables', 'client-update.md')

fs.mkdirSync(path.dirname(briefPath), { recursive: true })
fs.mkdirSync(sessionsRoot, { recursive: true })
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

const provider = new MockProvider([
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
      const text = typeof parsed.output?.text === 'string' ? parsed.output.text : ''
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
            ? 'Agency client operator delivered an approval-backed client update.'
            : `Agency client operator stopped after tool status: ${parsed.status ?? 'unknown'}`,
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
      example: 'agency-client-agent',
      businessCase: 'managed client workspace operator',
    },
    workspace: { root: workspaceRoot },
  })

  const run = session.runs.start({
    input: 'Read the client brief and produce one approval-backed client update.',
    allowedTools: ['file.read', 'file.write'],
    mode: 'chat',
    metadata: {
      example: 'agency-client-agent',
      reviewMode: 'client-facing',
    },
  })

  let approvalResolved = false
  const streamPromise = (async () => {
    const events = []
    for await (const event of run.events()) {
      events.push(event)
      if (!approvalResolved && event.type === 'approval.requested') {
        const approvalId =
          typeof event.payload?.approvalId === 'string'
            ? event.payload.approvalId
            : typeof event.payload?.id === 'string'
              ? event.payload.id
              : undefined
        if (!approvalId) {
          throw new Error('Agency-client-agent example could not find approvalId in approval.requested event.')
        }
        mainspring.approvals.approve({
          sessionId: session.record.sessionId,
          runId: run.record.runId,
          approvalId,
          reason: 'example auto-approval for local agency-client walkthrough',
        })
        approvalResolved = true
      }
    }
    return events
  })()

  const events = await streamPromise
  const result = await run.result()
  if (!fs.existsSync(deliverablePath)) {
    throw new Error(`Agency-client-agent example did not produce ${deliverablePath}.`)
  }
  const deliverableText = fs.readFileSync(deliverablePath, 'utf8')

  console.log(
    JSON.stringify(
      {
        example: 'agency-client-agent',
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        workspaceRoot,
        briefPath,
        deliverablePath,
        eventTypes: events.map((event) => event.type),
        finalText: result,
        deliverableText,
        approvalsResolved: events.filter((event) => event.type === 'approval.approved').length,
        usageEvents: run.usage(),
        toolCalls: run.toolCalls().map((event) => ({
          type: event.type,
          name: event.payload?.name,
          payload: event.payload,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await mainspring.stop()
  fs.rmSync(runtimeRoot, { recursive: true, force: true })
  fs.rmSync(path.join(workspaceRoot, 'briefs'), { recursive: true, force: true })
  fs.rmSync(path.join(workspaceRoot, 'deliverables'), { recursive: true, force: true })
}
