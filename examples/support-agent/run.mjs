import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const sessionsRoot = path.join(runtimeRoot, 'sessions')
const faqPath = path.join(workspaceRoot, 'faq', 'returns.md')

fs.mkdirSync(path.dirname(faqPath), { recursive: true })
fs.mkdirSync(sessionsRoot, { recursive: true })
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
      const text = typeof parsed.output?.text === 'string' ? parsed.output.text : 'No FAQ text'
      return {
        type: 'result',
        text: `Support agent prepared a return-policy draft from the approved FAQ:\n${text}`,
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
      example: 'support-agent',
      businessCase: 'local business support concierge',
    },
    workspace: { root: workspaceRoot },
  })

  const run = session.runs.start({
    input: 'Read the approved returns FAQ and draft a concise support answer.',
    allowedTools: ['file.read'],
    mode: 'chat',
    metadata: {
      example: 'support-agent',
      customerSafe: true,
    },
  })

  const events = []
  for await (const event of run.events()) events.push(event)
  const result = await run.result()

  console.log(
    JSON.stringify(
      {
        example: 'support-agent',
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        workspaceRoot,
        faqPath,
        eventTypes: events.map((event) => event.type),
        finalText: result,
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
  fs.rmSync(path.join(workspaceRoot, 'faq'), { recursive: true, force: true })
}
