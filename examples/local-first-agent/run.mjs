import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockProvider, createMemoryTools, createRunLogMainspring } from '../../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.join(__dirname, 'workspace')
const runtimeRoot = fs.mkdtempSync(path.join(__dirname, '.mainspring-'))
const notePath = path.join(workspaceRoot, 'notes', 'operations.md')
const memoryPath = path.join(workspaceRoot, '.mainspring', 'memory.jsonl')
const notesRoot = path.dirname(notePath)
const managedWorkspaceRoot = path.join(workspaceRoot, 'local-first-workspace')

fs.rmSync(path.join(workspaceRoot, '.mainspring'), { recursive: true, force: true })
fs.mkdirSync(notesRoot, { recursive: true })
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

const provider = new MockProvider((input) => {
  const toolMessages = input.messages?.filter((message) => message.role === 'tool') ?? []
  const parsedMessages = toolMessages.map((message) => JSON.parse(message.content))
  const writeResult = parsedMessages.find(
    (message) => message.toolCallId === 'toolcall_local_first_memory_write' && message.status === 'completed',
  )
  const readResult = parsedMessages.find(
    (message) => message.toolCallId === 'toolcall_local_first_memory_read' && message.status === 'completed',
  )

  if (readResult) {
    const memorySummary = Array.isArray(readResult.output?.memories)
      ? readResult.output.memories.map((entry) => entry.text).join(' | ')
      : 'No memory entries'
    return [
      {
        type: 'event',
        event: {
          type: 'result',
          text: `Local-first agent stored and reread workspace memory: ${memorySummary}`,
        },
      },
    ]
  }

  if (writeResult) {
    return [
      {
        type: 'event',
        event: {
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
    ]
  }

  return [
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
  ]
})

const mainspring = createRunLogMainspring({
  rootPath: runtimeRoot,
  workspaceRoot,
  provider,
  tools: createMemoryTools(),
  approvalReceiptKey: 'example-local-first-agent-approval-key',
  agent: {
    agentId: 'agent_local_first',
    instructions: 'Store one local-first operating reminder, then read it back through runtime memory.',
    capabilities: ['provider', 'tools', 'memory'],
    tools: ['memory.write', 'memory.read'],
    memoryScope: 'workspace',
    approvalPolicy: 'balanced',
    providerId: 'mock',
    modelId: 'mock/local-first-agent',
  },
})

try {
  const run = mainspring.runs.start({
    input: 'Store one local-first operating reminder, then read it back.',
    sessionId: 'example-local-first-agent-session',
    workspaceId: 'local-first-workspace',
    workspaceRoot,
    metadata: {
      example: 'local-first-agent',
      runtimePath: 'runlog',
      businessCase: 'single-machine local-first operator',
      localOnly: true,
    },
  })

  const [paused] = await run.drainUntilIdle()
  const pausedProjection = run.projection()
  const pendingApproval = pausedProjection.pendingApprovals[0]
  if (paused?.status !== 'awaiting_approval' || !pendingApproval?.approvalId) {
    const debugProjection = run.projection()
    throw new Error(
      `Expected RunLog memory approval pause, got ${paused?.status ?? 'no summary'} with ${
        pausedProjection.pendingApprovals.length
      } approvals. Events: ${debugProjection.events.map((event) => event.type).join(', ')}. Decisions: ${debugProjection.policyDecisions
        .map((decision) => `${decision.toolName ?? decision.operation}:${decision.state}`)
        .join(', ')}.`,
    )
  }
  if (fs.existsSync(memoryPath)) {
    throw new Error('memory.write executed before RunLog approval.')
  }

  const receipt = run.approve({
    actor: 'example-operator',
    reason: 'Approve the local workspace memory write for the local-first walkthrough.',
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
  if (
    finalText !==
    'Local-first agent stored and reread workspace memory: Local-first reminder: keep provider credentials in env vars, not browser storage.'
  ) {
    throw new Error(`Unexpected local-first-agent result: ${finalText}`)
  }
  if (!fs.existsSync(memoryPath)) {
    throw new Error(`Local-first-agent example did not produce ${memoryPath}.`)
  }
  const memoryLines = fs
    .readFileSync(memoryPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (memoryLines.length !== 1) {
    throw new Error(`Expected one memory entry, found ${memoryLines.length}.`)
  }
  for (const required of [
    'run.created',
    'input.received',
    'provider.init',
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
      throw new Error(
        `Local-first-agent example missed required RunLog event ${required}; saw ${eventTypes.join(', ')}`,
      )
    }
  }

  console.log(
    JSON.stringify(
      {
        example: 'local-first-agent',
        runtimePath: 'runlog',
        runId: run.record.runId,
        sessionId: run.record.sessionId,
        workspace: path.relative(repoRoot, workspaceRoot).replaceAll('\\', '/'),
        notePath: path.relative(repoRoot, notePath).replaceAll('\\', '/'),
        memoryPath: path.relative(repoRoot, memoryPath).replaceAll('\\', '/'),
        status: run.status(),
        finalText,
        memoryEntryCount: memoryLines.length,
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
  fs.rmSync(notesRoot, { recursive: true, force: true })
  fs.rmSync(path.join(workspaceRoot, '.mainspring'), { recursive: true, force: true })
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true })
}
