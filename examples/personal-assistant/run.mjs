import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const sessionsRoot = path.join(runtimeRoot, 'sessions')
const notePath = path.join(workspaceRoot, 'notes', 'today.md')

fs.mkdirSync(path.dirname(notePath), { recursive: true })
fs.mkdirSync(sessionsRoot, { recursive: true })
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
      const text = typeof parsed.output?.text === 'string' ? parsed.output.text : 'No note text'
      return {
        type: 'result',
        text: `Personal assistant reviewed today's note:\n${text}`,
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
      example: 'personal-assistant',
      businessCase: 'single-operator local assistant',
    },
    workspace: { root: workspaceRoot },
  })

  const run = session.runs.start({
    input: 'Read today\'s note and summarize the operator agenda.',
    allowedTools: ['file.read'],
    mode: 'chat',
    metadata: {
      example: 'personal-assistant',
      privacy: 'local-first',
    },
  })

  const events = []
  for await (const event of run.events()) events.push(event)
  const result = await run.result()

  console.log(
    JSON.stringify(
      {
        example: 'personal-assistant',
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        workspaceRoot,
        notePath,
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
  fs.rmSync(path.join(workspaceRoot, 'notes'), { recursive: true, force: true })
}
