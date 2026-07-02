import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MockProvider,
  backendSummaryLine,
  createMainspring,
  inspectExecutionBackends,
} from '../dist/index.js'

const requestedBackend = process.env.MAINSPRING_CELLS_INTEGRATION_BACKEND?.trim().toLowerCase()
const timeoutMs = Number.parseInt(
  process.env.MAINSPRING_CELLS_INTEGRATION_TIMEOUT_MS || '60000',
  10,
)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function chooseBackend(inventory) {
  if (requestedBackend) {
    if (requestedBackend !== 'wsl' && requestedBackend !== 'docker') {
      throw new Error(
        `MAINSPRING_CELLS_INTEGRATION_BACKEND must be wsl or docker, got "${requestedBackend}". Host execution is not accepted for this verifier.`,
      )
    }
    const selected = inventory.backends.find((backend) => backend.key === requestedBackend)
    if (!selected?.available) {
      throw new Error(
        `Requested isolated-capable backend "${requestedBackend}" is unavailable: ${selected?.reason ?? 'unknown reason'}`,
      )
    }
    return selected
  }
  return inventory.backends.find((backend) => backend.available && !backend.unsafe)
}

function integrationBackendSummary(inventory) {
  return inventory.backends.map((backend) => ({
    key: backend.key,
    available: backend.available,
    unsafe: backend.unsafe,
    isolationKind: backend.capabilities?.isolationKind,
    isolationStrength: backend.capabilities?.isolationStrength,
    networkPolicy: backend.capabilities?.networkPolicy,
    reason: backend.reason ?? '',
  }))
}

function failPrerequisites(message, inventory) {
  console.error(message)
  console.error('MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED')
  console.error(JSON.stringify({
    status: 'prerequisites_blocked',
    message,
    requestedBackend: requestedBackend || 'auto',
    acceptedBackends: ['wsl', 'docker'],
    hostExecutionAccepted: false,
    backends: integrationBackendSummary(inventory),
  }, null, 2))
  process.exit(1)
}

async function approvePendingUntilDone(input) {
  const approved = new Set()
  const startedAt = Date.now()
  while (!input.isDone()) {
    for (const approval of input.mainspring.approvals.list()) {
      if (approval.runId !== input.run.record.runId || approved.has(approval.approvalId)) continue
      input.mainspring.approvals.approve({
        sessionId: approval.sessionId,
        runId: approval.runId,
        approvalId: approval.approvalId,
        reason: 'cells integration verifier approval for isolated backend proof',
      })
      approved.add(approval.approvalId)
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for run ${input.run.record.runId}. Status: ${input.run.status()}. Pending approvals: ${JSON.stringify(input.mainspring.approvals.list())}. Errors: ${JSON.stringify(input.run.errors())}`,
      )
    }
    await sleep(25)
  }
  return approved.size
}

function eventOutputText(event) {
  return JSON.stringify(event?.payload ?? {})
}

function expectedCapabilityNeedles(backendKey) {
  if (backendKey === 'docker') {
    return [
      '"backendCapabilities"',
      '"isolationKind":"docker-container"',
      '"isolationStrength":"container-boundary"',
      '"networkPolicy":"container-network-disabled"',
      '"workspaceMapping":"docker-bind-mount"',
    ]
  }
  return [
    '"backendCapabilities"',
    '"isolationKind":"wsl-distro"',
    '"isolationStrength":"userland-boundary"',
    '"networkPolicy":"host-inherited"',
    '"workspaceMapping":"wsl-mount"',
  ]
}

function assertCapabilitySummary(label, outputText, backendKey) {
  for (const needle of expectedCapabilityNeedles(backendKey)) {
    assert(outputText.includes(needle), `${label} event missing backend capability ${needle}: ${outputText}`)
  }
  assert(!outputText.includes('"verificationCommand"'), `${label} event leaked verification command detail: ${outputText}`)
}

async function runIntegration(backend) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-cells-integration-'))
  const workspaceRoot = path.join(root, 'workspace')
  const sessionsRoot = path.join(root, 'sessions')
  const outputPath = path.join(workspaceRoot, 'cell-integration', 'backend.txt')
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(sessionsRoot, { recursive: true })

  const provider = new MockProvider([
    {
      type: 'event',
      event: {
        type: 'tool_call',
        name: 'shell.exec',
        input: {
          command: 'printf MAINSPRING_CELL_INTEGRATION_OK',
          timeoutMs: 30000,
        },
        toolCallId: 'toolcall_cell_shell',
      },
    },
    {
      type: 'await_push',
      produce: () => ({
        type: 'tool_call',
        name: 'file.write',
        input: {
          path: 'cell-integration/backend.txt',
          data: `backend=${backend.key}\n`,
        },
        toolCallId: 'toolcall_cell_file_write',
      }),
    },
    {
      type: 'await_push',
      produce: (message) => {
        const parsed = JSON.parse(message)
        return {
          type: 'result',
          text: `cells integration verifier finished with file.write status ${parsed.status ?? 'unknown'}`,
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
      sessionId: `cells-integration-${backend.key}`,
      workspace: { root: workspaceRoot },
      metadata: {
        verifier: 'cells-integration',
        backend: backend.key,
      },
    })
    const run = session.runs.start({
      input: `Verify ${backend.key} cell routing through the runtime mailbox path.`,
      mode: 'chat',
      allowedTools: ['shell.exec', 'file.write'],
      computerId: backend.key === 'wsl' ? 'computer_wsl' : 'computer_docker',
    })

    const events = []
    let streamDone = false
    const streamPromise = (async () => {
      for await (const event of run.events()) events.push(event)
      return events
    })().finally(() => {
      streamDone = true
    })

    const approvalsResolved = await approvePendingUntilDone({
      mainspring,
      run,
      isDone: () => streamDone,
    })
    await streamPromise

    assert(run.status() === 'completed', `Run did not complete: ${run.status()} ${JSON.stringify(run.errors())}`)
    assert(
      (await run.result())?.includes('file.write status completed'),
      `Unexpected result text: ${await run.result()}`,
    )
    assert(approvalsResolved >= 2, `Expected at least two tool approvals, got ${approvalsResolved}.`)
    assert(fs.existsSync(outputPath), `Expected file.write output at ${outputPath}.`)
    assert(
      fs.readFileSync(outputPath, 'utf8') === `backend=${backend.key}\n`,
      `Unexpected file.write output content at ${outputPath}.`,
    )

    const toolCalls = run.toolCalls()
    const shellResult = toolCalls.find(
      (event) =>
        event.type === 'tool.call.completed'
        && event.payload?.name === 'shell.exec'
        && event.payload?.toolCallId === 'toolcall_cell_shell',
    )
    const fileWriteResult = toolCalls.find(
      (event) =>
        event.type === 'tool.call.completed'
        && event.payload?.name === 'file.write'
        && event.payload?.toolCallId === 'toolcall_cell_file_write',
    )
    const shellText = eventOutputText(shellResult)
    const fileText = eventOutputText(fileWriteResult)
    assert(shellResult, `Missing completed shell.exec event. Tool calls: ${JSON.stringify(toolCalls)}`)
    assert(fileWriteResult, `Missing completed file.write event. Tool calls: ${JSON.stringify(toolCalls)}`)
    assert(shellText.includes(`"backend":"${backend.key}"`), `shell.exec event did not include backend ${backend.key}: ${shellText}`)
    assert(shellText.includes('"backendUnsafe":false'), `shell.exec event was not marked isolated-capable: ${shellText}`)
    assertCapabilitySummary('shell.exec', shellText, backend.key)
    assert(shellText.includes('MAINSPRING_CELL_INTEGRATION_OK'), `shell.exec output missing marker: ${shellText}`)
    assert(fileText.includes(`"backend":"${backend.key}"`), `file.write event did not include backend ${backend.key}: ${fileText}`)
    assert(fileText.includes('"backendUnsafe":false'), `file.write event was not marked isolated-capable: ${fileText}`)
    assertCapabilitySummary('file.write', fileText, backend.key)

    return {
      backend: backend.key,
      sessionId: session.record.sessionId,
      runId: run.record.runId,
      approvalsResolved,
      eventTypes: events.map((event) => event.type),
      toolCalls: toolCalls.map((event) => ({
        type: event.type,
        name: event.payload?.name,
        toolCallId: event.payload?.toolCallId,
      })),
    }
  } finally {
    await mainspring.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

console.log(`Mainspring cell integration check on ${os.platform()} ${os.release()}`)
const inventory = inspectExecutionBackends()
for (const backend of inventory.backends) console.log(`- ${backendSummaryLine(backend)}`)

let backend
try {
  backend = chooseBackend(inventory)
} catch (error) {
  failPrerequisites(error instanceof Error ? error.message : String(error), inventory)
}

if (!backend) {
  failPrerequisites(
    'No isolated-capable execution backend is currently available for integration verification. Host execution is intentionally not accepted for this check.',
    inventory,
  )
}

try {
  const result = await runIntegration(backend)
  console.log(`- runtime integration: ok (${backend.key})`)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(`- runtime integration: failed (${backend.key})`)
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
}
