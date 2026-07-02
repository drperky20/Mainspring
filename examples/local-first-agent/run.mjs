import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMainspring, createMemoryTools } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const sessionsRoot = path.join(runtimeRoot, 'sessions')
const notePath = path.join(workspaceRoot, 'notes', 'operations.md')
const memoryPath = path.join(workspaceRoot, '.mainspring', 'memory.jsonl')

fs.rmSync(path.join(workspaceRoot, '.mainspring'), { recursive: true, force: true })
fs.mkdirSync(path.dirname(notePath), { recursive: true })
fs.mkdirSync(sessionsRoot, { recursive: true })
fs.writeFileSync(
  notePath,
  [
    '# Operations',
    '',
    '- Keep the workspace local-first.',
    '- Track one reusable reminder in runtime memory.',
    '- Avoid browser-stored provider keys.',
  ].join('\n'),
)

const provider = new MockProvider([
  {
    type: 'event',
    event: {
      type: 'tool_call',
      name: 'memory.write',
      input: {
        text: 'Local-first reminder: keep provider credentials in env vars, not browser storage.',
        tags: ['ops', 'security', 'local-first'],
      },
      toolCallId: 'toolcall_local_first_memory_write',
    },
  },
  {
    type: 'await_push',
    produce: { type: 'progress', message: 'waiting for approval replay' },
  },
  {
    type: 'await_push',
    produce: {
      type: 'tool_call',
      name: 'memory.read',
      input: { query: 'provider credentials', limit: 5 },
      toolCallId: 'toolcall_local_first_memory_read',
    },
  },
  {
    type: 'await_push',
    produce: (message) => {
      const parsed = JSON.parse(message)
      const memorySummary = Array.isArray(parsed.output?.memories)
        ? parsed.output.memories.map((entry) => entry.text).join(' | ')
        : 'No memory entries'
      return {
        type: 'result',
        text: `Local-first agent stored and reread workspace memory: ${memorySummary}`,
      }
    },
  },
])

const mainspring = createMainspring({
  sessionsRoot,
  workspaceRoot,
  provider,
  tools: createMemoryTools(),
  pollIntervalMs: 10,
})

await mainspring.start()

try {
  const session = mainspring.sessions.create({
    metadata: {
      example: 'local-first-agent',
      businessCase: 'single-machine local-first operator',
    },
    workspace: { root: workspaceRoot },
  })

  const run = session.runs.start({
    input: 'Store one local-first operating reminder, then read it back.',
    allowedTools: ['memory.write', 'memory.read'],
    allowMemory: true,
    mode: 'chat',
    metadata: {
      example: 'local-first-agent',
      localOnly: true,
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
          throw new Error('Local-first-agent example could not find approvalId in approval.requested event.')
        }
        mainspring.approvals.approve({
          sessionId: session.record.sessionId,
          runId: run.record.runId,
          approvalId,
          reason: 'example auto-approval for local-first walkthrough',
        })
        approvalResolved = true
      }
    }
    return events
  })()

  const events = await streamPromise
  const result = await run.result()
  if (!fs.existsSync(memoryPath)) {
    throw new Error(`Local-first-agent example did not produce ${memoryPath}.`)
  }
  const memoryLines = fs
    .readFileSync(memoryPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  console.log(
    JSON.stringify(
      {
        example: 'local-first-agent',
        sessionId: session.record.sessionId,
        runId: run.record.runId,
        workspaceRoot,
        notePath,
        memoryPath,
        eventTypes: events.map((event) => event.type),
        finalText: result,
        memoryEntryCount: memoryLines.length,
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
  fs.rmSync(path.join(workspaceRoot, 'notes'), { recursive: true, force: true })
  fs.rmSync(path.join(workspaceRoot, '.mainspring'), { recursive: true, force: true })
}
