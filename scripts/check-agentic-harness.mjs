#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MockProvider,
  createMainspring,
} from '../dist/index.js'

const repoRoot = process.cwd()
const scenarioResults = []

await runScenario('coding-agent example', () => runNode(['examples/coding-agent/run.mjs']))
await runScenario('provider-run RunLog example', () => runNode(['examples/provider-run/run.mjs']))
await runScenario('personal-assistant example', () => runNode(['examples/personal-assistant/run.mjs']))
await runScenario('support-agent example', () => runNode(['examples/support-agent/run.mjs']))
await runScenario('agency-client-agent example', () => runNode(['examples/agency-client-agent/run.mjs']))
await runScenario('local-first-agent example', () => runNode(['examples/local-first-agent/run.mjs']))

await runScenario('denied approval prevents mutation', deniedApprovalScenario)
await runScenario('provider error is terminal', providerErrorScenario)
await runScenario('cancellation clears pending state', cancellationScenario)
await runScenario('structured replay preserves tool context', replayScenario)

await runScenario('budget verifier', () => runNode(['scripts/check-budget-policy.mjs']))
await runScenario('cron verifier', () => runNode(['scripts/check-cron.mjs']))
await runScenario('marketplace verifier', () => runNode(['scripts/check-marketplace.mjs']))
await runScenario('deployment verifier', () => runNode(['scripts/check-deploy.mjs']))
await runScenario('execution backend verifier', () => runNode(['scripts/check-execution-backends.mjs']))

console.log(JSON.stringify({ scenarios: scenarioResults }, null, 2))
console.log('MAINSPRING_AGENTIC_HARNESS_CHECK_OK')

async function runScenario(name, fn) {
  await fn()
  scenarioResults.push({ name, status: 'passed' })
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: node ${args.join(' ')}`,
        result.stdout,
        result.stderr,
        result.error?.message,
      ].filter(Boolean).join('\n'),
    )
  }
}

async function deniedApprovalScenario() {
  await withRuntime(
    {
      provider: new MockProvider([
        {
          type: 'event',
          event: {
            type: 'tool_call',
            name: 'file.write',
            input: { path: 'denied.txt', data: 'must not be written\n' },
            toolCallId: 'tool_denied_write',
          },
        },
        {
          type: 'await_push',
          produce: (message) => {
            const parsed = JSON.parse(message || '{}')
            return {
              type: 'result',
              text: `Denied flow observed tool status ${parsed.status ?? 'unknown'}`,
            }
          },
        },
      ]),
    },
    async ({ mainspring, workspaceRoot }) => {
      const session = mainspring.sessions.create({ workspace: { root: workspaceRoot } })
      const run = session.runs.start({
        input: 'Try to write a denied file.',
        allowedTools: ['file.write'],
        mode: 'chat',
      })
      const eventsPromise = collectEvents(run)
      const approval = await waitForApproval(mainspring)
      mainspring.approvals.deny({
        sessionId: approval.sessionId,
        runId: approval.runId,
        approvalId: approval.approvalId,
        reason: 'agentic harness denial proof',
      })
      await waitForPersistedEvent(mainspring, approval.sessionId, approval.runId, 'approval.denied')
      const events = await eventsPromise
      assertEvent(events, 'run.completed')
      if (fs.existsSync(path.join(workspaceRoot, 'denied.txt'))) {
        throw new Error('Denied approval wrote denied.txt.')
      }
    },
  )
}

async function providerErrorScenario() {
  await withRuntime(
    {
      provider: new MockProvider([
        { type: 'event', event: { type: 'error', message: 'provider auth failed', retryable: false } },
      ]),
    },
    async ({ mainspring, workspaceRoot }) => {
      const session = mainspring.sessions.create({ workspace: { root: workspaceRoot } })
      const run = session.runs.start({
        input: 'Trigger provider failure.',
        allowedTools: [],
        mode: 'chat',
      })
      const events = await collectEvents(run)
      assertEvent(events, 'runtime.error')
      assertEvent(events, 'run.failed')
      if (run.status() !== 'failed') throw new Error(`Expected failed run, got ${run.status()}.`)
    },
  )
}

async function cancellationScenario() {
  await withRuntime(
    {
      provider: new MockProvider([{ type: 'await_push', produce: { type: 'result', text: 'too late' } }]),
    },
    async ({ mainspring, workspaceRoot }) => {
      const session = mainspring.sessions.create({ workspace: { root: workspaceRoot } })
      const run = session.runs.start({
        input: 'Wait until cancelled.',
        allowedTools: [],
        mode: 'chat',
      })
      await waitForRunEvent(run, 'run.started')
      run.cancel('agentic harness cancellation proof')
      const events = await collectEvents(run)
      assertEvent(events, 'run.cancelled')
      if (mainspring.approvals.list().some((approval) => approval.runId === run.record.runId)) {
        throw new Error('Cancellation left pending approvals for cancelled run.')
      }
    },
  )
}

async function replayScenario() {
  const observed = []
  const provider = new MockProvider((input) => {
    observed.push(input.messages ?? [])
    if (observed.length === 1) {
      return [
        {
          type: 'event',
          event: {
            type: 'tool_call',
            name: 'file.read',
            input: { path: 'facts.txt' },
            toolCallId: 'tool_replay_read',
          },
        },
        {
          type: 'await_push',
          produce: (message) => {
            const parsed = JSON.parse(message || '{}')
            return {
              type: 'result',
              text: `Read fact: ${parsed.output?.preview ?? parsed.output?.text ?? 'missing'}`,
            }
          },
        },
      ]
    }
    const hasToolContext = (input.messages ?? []).some(
      (message) => message.role === 'tool' && String(message.content).includes('replay fact'),
    )
    return [{ type: 'event', event: { type: 'result', text: hasToolContext ? 'Replay preserved tool context.' : 'Replay missing tool context.' } }]
  })
  provider.providerId = 'openrouter'
  await withRuntime(
    { provider },
    async ({ mainspring, workspaceRoot }) => {
      fs.writeFileSync(path.join(workspaceRoot, 'facts.txt'), 'replay fact\n')
      const session = mainspring.sessions.create({ workspace: { root: workspaceRoot } })
      const first = session.runs.start({
        input: 'Read facts.txt.',
        allowedTools: ['file.read'],
        mode: 'chat',
      })
      await collectEvents(first)
      const second = session.runs.start({
        input: 'What did the tool read earlier?',
        resumeRunId: first.record.runId,
        allowedTools: ['file.read'],
        mode: 'chat',
      })
      await waitForRunResultText(second, 'Replay preserved tool context.')
      const result = await second.result()
      if (!result?.includes('Replay preserved tool context')) {
        throw new Error(`Structured replay did not preserve tool context. Result: ${result}`)
      }
    },
  )
}

async function withRuntime(options, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-agentic-'))
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  const mainspring = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: options.provider,
    tools: options.tools,
    pollIntervalMs: 10,
  })
  await mainspring.start()
  try {
    await fn({ mainspring, root, sessionsRoot, workspaceRoot })
  } finally {
    await mainspring.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

async function collectEvents(run) {
  const events = []
  for await (const event of run.events()) events.push(event)
  return events
}

async function waitForRunEvent(run, type) {
  const started = Date.now()
  for (;;) {
    const seen = []
    for await (const event of run.events()) {
      seen.push(event)
      if (event.type === type) return event
      if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
        throw new Error(`Run reached terminal state before ${type}: ${seen.map((item) => item.type).join(', ')}`)
      }
    }
    if (Date.now() - started > 5_000) throw new Error(`Timed out waiting for ${type}.`)
  }
}

async function waitForApproval(mainspring) {
  const started = Date.now()
  for (;;) {
    const approval = mainspring.approvals.list()[0]
    if (approval) return approval
    if (Date.now() - started > 5_000) throw new Error('Timed out waiting for approval.')
    await sleep(25)
  }
}

async function waitForPersistedEvent(mainspring, sessionId, runId, type) {
  const started = Date.now()
  for (;;) {
    const events = mainspring.storage.eventStore.listRunEvents({
      sessionId,
      runId,
      limit: 200,
    })
    if (events.some((event) => event.type === type)) return events
    if (Date.now() - started > 5_000) {
      throw new Error(`Timed out waiting for persisted event ${type}; saw ${events.map((event) => event.type).join(', ')}`)
    }
    await sleep(25)
  }
}

async function waitForRunResultText(run, expected) {
  const started = Date.now()
  for (;;) {
    const result = await run.result()
    if (result?.includes(expected)) return result
    if (Date.now() - started > 5_000) {
      throw new Error(`Timed out waiting for run result ${JSON.stringify(expected)}; latest result: ${result}`)
    }
    await sleep(25)
  }
}

function assertEvent(events, type) {
  if (!events.some((event) => event.type === type)) {
    throw new Error(`Expected event ${type}; saw ${events.map((event) => event.type).join(', ')}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
