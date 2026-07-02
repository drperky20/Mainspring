import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteRunLogStore } from '../adapters/sqlite/SqliteRunLogStore.js'
import { LocalWorkspaceAdapter } from '../capabilities/workspace/LocalWorkspaceAdapter.js'
import { MockProvider } from '../providers/MockProvider.js'
import { builtinManifest, type RuntimeTool } from '../tools/ToolRegistry.js'
import { projectRunLogRun } from '../hosts/runlog/RunLogProjection.js'
import { RunLogKernel } from './RunLogKernel.js'
import { SingleProviderRouter } from './ProviderRouter.js'

const tempRoots: string[] = []
const stores: SqliteRunLogStore[] = []

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-runlog-'))
  tempRoots.push(root)
  return root
}

function storeAt(root: string): SqliteRunLogStore {
  const store = new SqliteRunLogStore({ dbPath: path.join(root, 'runlog.sqlite') })
  stores.push(store)
  return store
}

function echoTool(options: { approvalRequired?: boolean } = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'tool.echo',
      name: 'Echo Tool',
      description: 'Echoes its input for RunLog tests.',
      permissions: { filesystem: 'read' },
      approval: options.approvalRequired ? { required: true } : {},
      toolType: 'file',
    }),
    execute: ({ input }) => ({ ok: true, input }),
  }
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('RunLogKernel', () => {
  it('runs a provider-only turn through SQLite RunLog events and projection', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const kernel = new RunLogKernel({
      store,
      providerRouter: new SingleProviderRouter(
        new MockProvider([
          { type: 'event', event: { type: 'delta', text: 'hello ' } },
          { type: 'event', event: { type: 'result', text: 'hello world' } },
        ]),
      ),
    })

    kernel.putAgent({
      agentId: 'agent_support',
      instructions: 'Answer briefly.',
      providerId: 'mock',
      capabilities: ['provider'],
    })
    const run = kernel.startRun({
      agentId: 'agent_support',
      input: 'Say hello',
      sessionId: 'session_1',
    })

    const summaries = await kernel.drainUntilIdle()
    const projection = projectRunLogRun({ store, runId: run.runId })

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.status).toBe('completed')
    expect(projection.status).toBe('completed')
    expect(projection.assistantText).toBe('hello world')
    expect(projection.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'run.created',
        'input.received',
        'run.queued',
        'run.claimed',
        'provider.init',
        'assistant.delta',
        'assistant.result',
        'run.completed',
      ]),
    )
  })

  it('executes provider-requested tools through ToolRegistry and checkpoints the boundary', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const kernel = new RunLogKernel({
      store,
      tools: [echoTool()],
      providerRouter: new SingleProviderRouter(
        new MockProvider([
          {
            type: 'event',
            event: {
              type: 'tool_call',
              name: 'tool.echo',
              toolCallId: 'call_1',
              input: { value: 42 },
            },
          },
          {
            type: 'await_push',
            produce: (message) => ({
              type: 'result',
              text: `tool-result-seen:${message.includes('"ok":true')}`,
            }),
          },
        ]),
      ),
    })

    kernel.putAgent({
      agentId: 'agent_tool',
      instructions: 'Use tools when helpful.',
      tools: ['tool.echo'],
      capabilities: ['provider', 'tools'],
    })
    const run = kernel.startRun({ agentId: 'agent_tool', input: 'Use echo.' })
    const [summary] = await kernel.drainUntilIdle()
    const projection = projectRunLogRun({ store, runId: run.runId })

    expect(summary?.status).toBe('completed')
    expect(projection.toolCalls.map((call) => call.status)).toContain('completed')
    expect(projection.assistantText).toBe('tool-result-seen:true')
    expect(store.latestCheckpoint(run.runId)?.kind).toBe('tool')
  })

  it('pauses durably when a tool requires approval', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const kernel = new RunLogKernel({
      store,
      tools: [echoTool({ approvalRequired: true })],
      providerRouter: new SingleProviderRouter(
        new MockProvider([
          {
            type: 'event',
            event: {
              type: 'tool_call',
              name: 'tool.echo',
              toolCallId: 'call_review',
              input: { sourceMutation: true },
            },
          },
        ]),
      ),
    })

    kernel.putAgent({
      agentId: 'agent_review',
      instructions: 'Ask before risky work.',
      tools: ['tool.echo'],
      approvalPolicy: 'balanced',
      capabilities: ['provider', 'tools'],
    })
    const run = kernel.startRun({ agentId: 'agent_review', input: 'Mutate something.' })
    const [summary] = await kernel.drainUntilIdle()
    const projection = projectRunLogRun({ store, runId: run.runId })

    expect(summary?.status).toBe('awaiting_approval')
    expect(projection.status).toBe('awaiting_approval')
    expect(projection.pendingApprovals).toHaveLength(1)
    expect(projection.events.map((event) => event.type)).toContain('run.awaiting_approval')
  })

  it('recovers queued runs from SQLite after process-level object restart', async () => {
    const root = tempRoot()
    const firstStore = storeAt(root)
    const firstKernel = new RunLogKernel({
      store: firstStore,
      providerRouter: new SingleProviderRouter(new MockProvider([])),
    })
    firstKernel.putAgent({
      agentId: 'agent_restart',
      instructions: 'Survive restarts.',
      capabilities: ['provider'],
    })
    const run = firstKernel.startRun({ agentId: 'agent_restart', input: 'resume me' })
    firstStore.close()

    const secondStore = storeAt(root)
    const secondKernel = new RunLogKernel({
      store: secondStore,
      providerRouter: new SingleProviderRouter(
        new MockProvider([{ type: 'event', event: { type: 'result', text: 'resumed' } }]),
      ),
    })
    const [summary] = await secondKernel.drainUntilIdle()

    expect(summary?.runId).toBe(run.runId)
    expect(projectRunLogRun({ store: secondStore, runId: run.runId }).assistantText).toBe('resumed')
  })

  it('stores large idle agent fleets as data without claiming work', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const kernel = new RunLogKernel({
      store,
      providerRouter: new SingleProviderRouter(new MockProvider([])),
    })

    for (let index = 0; index < 1_000; index += 1) {
      kernel.putAgent({
        agentId: `agent_${index}`,
        instructions: `Agent ${index}`,
        capabilities: ['provider'],
      })
    }

    expect(store.listAgents()).toHaveLength(1_000)
    expect(await kernel.drainOnce()).toBeNull()
  })

  it('creates queued runs from due cron rows without a separate service', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const kernel = new RunLogKernel({
      store,
      providerRouter: new SingleProviderRouter(
        new MockProvider([{ type: 'event', event: { type: 'result', text: 'cron done' } }]),
      ),
    })
    kernel.putAgent({
      agentId: 'agent_cron',
      instructions: 'Run on a schedule.',
      capabilities: ['provider', 'cron'],
    })
    store.putCronJob({
      cronId: 'cron_1',
      agentId: 'agent_cron',
      input: 'scheduled work',
      intervalMs: 60_000,
      enabled: true,
      nextRunAt: new Date(Date.now() - 1_000).toISOString(),
    })

    const [run] = store.enqueueDueCronRuns()
    expect(run?.status).toBe('queued')
    expect(run ? projectRunLogRun({ store, runId: run.runId }).events.map((event) => event.type) : []).toContain(
      'cron.due',
    )

    const [summary] = await kernel.drainUntilIdle()
    expect(summary?.status).toBe('completed')
  })

  it('materializes workspaces lazily only for workspace-capable agents', async () => {
    const root = tempRoot()
    const store = storeAt(root)
    const workspaceRoot = path.join(root, 'workspaces')
    const kernel = new RunLogKernel({
      store,
      workspace: new LocalWorkspaceAdapter(workspaceRoot),
      providerRouter: new SingleProviderRouter(
        new MockProvider([{ type: 'event', event: { type: 'result', text: 'done' } }]),
      ),
    })

    kernel.putAgent({
      agentId: 'agent_workspace',
      instructions: 'Use files.',
      workspacePolicy: 'lazy',
      capabilities: ['provider', 'workspace'],
    })
    const run = kernel.startRun({ agentId: 'agent_workspace', input: 'touch workspace' })
    await kernel.drainUntilIdle()

    expect(fs.existsSync(path.join(workspaceRoot, run.runId))).toBe(true)
    expect(projectRunLogRun({ store, runId: run.runId }).events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['workspace.lease.created', 'workspace.lease.released']),
    )
  })
})
