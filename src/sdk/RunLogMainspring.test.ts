import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MockProvider } from '../providers/MockProvider.js'
import { builtinManifest, type RuntimeTool } from '../tools/ToolRegistry.js'
import { createRunLogMainspring, type RunLogMainspring } from './RunLogMainspring.js'

const tempRoots: string[] = []
const runtimes: RunLogMainspring[] = []

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-runlog-sdk-'))
  tempRoots.push(root)
  return root
}

function runtime(input: Parameters<typeof createRunLogMainspring>[0]): RunLogMainspring {
  const created = createRunLogMainspring(input)
  runtimes.push(created)
  return created
}

function approvalTool(executions: { count: number }): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'tool.reviewed',
      name: 'Reviewed Tool',
      description: 'Requires approval before execution.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input }) => {
      executions.count += 1
      return { ok: true, input, executions: executions.count }
    },
  }
}

afterEach(() => {
  for (const created of runtimes.splice(0)) created.close()
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('RunLogMainspring SDK host', () => {
  it('starts a provider-only run through RunIntent and projects the result', async () => {
    const root = tempRoot()
    const app = runtime({
      rootPath: root,
      provider: new MockProvider([
        { type: 'event', event: { type: 'delta', text: 'hello ' } },
        { type: 'event', event: { type: 'result', text: 'runlog sdk' } },
      ]),
      agent: {
        agentId: 'agent_sdk',
        instructions: 'Answer through RunLog.',
        capabilities: ['provider'],
      },
    })

    const run = app.runs.start({ input: 'Say hello', sessionId: 'session_sdk' })
    const summaries = await run.drainUntilIdle()
    const projection = run.projection()

    expect(summaries).toHaveLength(1)
    expect(run.status()).toBe('completed')
    expect(run.result()).toBe('runlog sdk')
    expect(projection.run.agentId).toBe('agent_sdk')
    expect(projection.run.sessionId).toBe('session_sdk')
    expect(projection.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['run.created', 'input.received', 'provider.init', 'run.completed']),
    )
  })

  it('surfaces approval requests and resumes approved tools through the public handle', async () => {
    const root = tempRoot()
    const executions = { count: 0 }
    const app = runtime({
      rootPath: root,
      provider: new MockProvider((input) => {
        const toolMessage = input.messages?.find((message) => message.role === 'tool')
        if (toolMessage) {
          return [
            {
              type: 'event',
              event: {
                type: 'result',
                text: `approved:${toolMessage.content.includes('"executions":1')}`,
              },
            },
          ]
        }
        return [
          {
            type: 'event',
            event: {
              type: 'tool_call',
              name: 'tool.reviewed',
              toolCallId: 'call_public_approval',
              input: { sourceMutation: true },
            },
          },
        ]
      }),
      tools: [approvalTool(executions)],
      agent: {
        agentId: 'agent_review',
        instructions: 'Ask before tool use.',
        tools: ['tool.reviewed'],
        approvalPolicy: 'balanced',
        capabilities: ['provider', 'tools'],
      },
      approvalReceiptKey: 'test-runlog-sdk-approval-key',
      approvalReceiptKeyMode: 'configured',
    })

    const run = app.runs.start({ input: 'Use reviewed tool.' })
    const [paused] = await run.drainUntilIdle()
    const pausedProjection = run.projection()

    expect(paused?.status).toBe('awaiting_approval')
    expect(pausedProjection.pendingApprovals).toHaveLength(1)
    expect(executions.count).toBe(0)

    const receipt = run.approve({ actor: 'sdk-test', expiresInMs: 60_000 })
    const [resumed] = await run.drainUntilIdle()

    expect(receipt.decision).toBe('approved')
    expect(resumed?.status).toBe('completed')
    expect(executions.count).toBe(1)
    expect(run.projection().pendingApprovals).toHaveLength(0)
    expect(run.result()).toBe('approved:true')
  })

  it('fails closed when configured approval receipt key mode has no key', async () => {
    const root = tempRoot()
    const executions = { count: 0 }
    const app = runtime({
      rootPath: root,
      provider: new MockProvider([
        {
          type: 'event',
          event: {
            type: 'tool_call',
            name: 'tool.reviewed',
            toolCallId: 'call_missing_key',
            input: { sourceMutation: true },
          },
        },
      ]),
      tools: [approvalTool(executions)],
      agent: {
        agentId: 'agent_missing_key',
        instructions: 'Ask before tool use.',
        tools: ['tool.reviewed'],
        approvalPolicy: 'balanced',
        capabilities: ['provider', 'tools'],
      },
      approvalReceiptKeyMode: 'configured',
    })

    const run = app.runs.start({ input: 'Use reviewed tool.' })
    await run.drainUntilIdle()

    expect(run.status()).toBe('awaiting_approval')
    expect(() => run.approve({ actor: 'sdk-test' })).toThrow(
      /RunLog approval receipt signing key is required/,
    )
    expect(executions.count).toBe(0)
  })

  it('lists durable runs after restart and cancels them through SDK surfaces', () => {
    const root = tempRoot()
    const agent = {
      agentId: 'agent_discovery',
      instructions: 'Remain discoverable after restart.',
      capabilities: ['provider'] as const,
    }
    const app = runtime({ rootPath: root, provider: new MockProvider([]), agent })
    const first = app.runs.start({ input: 'first', sessionId: 'session_discovery' })
    const second = app.runs.start({ input: 'second', sessionId: 'session_discovery' })

    const expectedRunOrder = [first.record, second.record]
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
        || right.runId.localeCompare(left.runId),
      )
      .map((run) => run.runId)
    expect(app.runs.list({ sessionId: 'session_discovery' }).map((run) => run.runId)).toEqual([
      ...expectedRunOrder,
    ])
    const newestPage = app.runs.list({ sessionId: 'session_discovery', limit: 1 })
    const olderPage = app.runs.list({
      sessionId: 'session_discovery',
      before: {
        createdAt: newestPage[0]!.createdAt,
        runId: newestPage[0]!.runId,
      },
      limit: 1,
    })
    expect([...newestPage, ...olderPage].map((run) => run.runId)).toEqual(
      app.runs.list({ sessionId: 'session_discovery' }).map((run) => run.runId),
    )
    expect(first.cancel('No longer needed.')).toMatchObject({ status: 'cancelled' })
    expect(app.runs.list({ status: 'cancelled' }).map((run) => run.runId)).toEqual([
      first.record.runId,
    ])
    expect(app.runs.list({ status: ['queued', 'cancelled'], limit: 1 })).toHaveLength(1)
    app.close()

    const reopened = runtime({ rootPath: root, provider: new MockProvider([]), agent })
    expect(
      reopened.runs.list({ sessionId: 'session_discovery' }).map((run) => ({
        runId: run.runId,
        status: run.status,
      })),
    ).toEqual(
      expectedRunOrder.map((runId) => ({
        runId,
        status: runId === first.record.runId ? 'cancelled' : 'queued',
      })),
    )
    expect(reopened.runs.cancel(second.record.runId, 'Stopped after restart.').status).toBe(
      'cancelled',
    )
    expect(reopened.runs.list({ status: 'cancelled' })).toHaveLength(2)
  })

  it('creates attenuated child runs that inherit the parent execution scope', () => {
    const root = tempRoot()
    const app = runtime({
      rootPath: root,
      provider: new MockProvider([]),
      agent: {
        agentId: 'agent_children',
        instructions: 'Delegate only inside the parent scope.',
        capabilities: ['provider'],
      },
    })
    const parent = app.runs.start({
      input: 'Parent work',
      sessionId: 'session_parent',
      workspaceId: 'workspace_parent',
      workspaceRoot: path.join(root, 'workspace_parent'),
      computerId: 'computer_docker',
      providerId: 'provider_parent',
      modelId: 'model_parent',
      credentialRef: 'env:PARENT_TOKEN',
      allowedTools: ['file.read'],
    })

    const child = parent.startChild({
      input: 'Child work',
      metadata: { purpose: 'summarize' },
    })

    expect(child.record).toMatchObject({
      parentRunId: parent.record.runId,
      agentId: parent.record.agentId,
      sessionId: parent.record.sessionId,
      workspaceId: parent.record.workspaceId,
      workspaceRoot: parent.record.workspaceRoot,
      computerId: parent.record.computerId,
      providerId: parent.record.providerId,
      modelId: parent.record.modelId,
      credentialRef: parent.record.credentialRef,
      allowedTools: parent.record.allowedTools,
      input: 'Child work',
      metadata: { purpose: 'summarize' },
    })
    const childDecision = parent.projection().policyDecisions.find(
      (decision) => decision.operation === 'subagent.create',
    )
    expect(childDecision).toMatchObject({
      runId: parent.record.runId,
      sessionId: parent.record.sessionId,
      surface: 'subagent',
      operation: 'subagent.create',
      targetKey: child.record.runId,
      state: 'allow',
      approved: true,
      metadata: {
        childRunId: child.record.runId,
        parentRunId: parent.record.runId,
        authority: 'inherited',
      },
    })
    expect(() => app.runs.startChild({ parentRunId: 'missing', input: 'No parent' })).toThrow(
      'Unknown parent RunLog run: missing',
    )
  })

  it('persists and forwards a requested computer identity into RunLog tool execution', async () => {
    const root = tempRoot()
    const seenComputerIds: Array<string | undefined> = []
    const captureTool: RuntimeTool = {
      manifest: builtinManifest({
        key: 'computer.capture',
        name: 'Computer Capture',
        description: 'Captures the selected execution computer for a test.',
        permissions: { filesystem: 'read' },
        approval: {},
        toolType: 'builtin',
      }),
      execute: ({ computerId }) => {
        seenComputerIds.push(computerId)
        return { computerId }
      },
    }
    const app = runtime({
      rootPath: root,
      provider: new MockProvider([
        {
          type: 'event',
          event: { type: 'tool_call', name: 'computer.capture', toolCallId: 'capture_1', input: {} },
        },
        { type: 'await_push', produce: { type: 'result', text: 'captured' } },
      ]),
      tools: [captureTool],
      agent: {
        agentId: 'agent_computer',
        instructions: 'Use the selected computer.',
        tools: ['computer.capture'],
        capabilities: ['provider', 'tools'],
      },
    })

    const run = app.runs.start({
      input: 'Capture the computer.',
      computerId: 'computer_wsl',
      allowedTools: ['computer.capture'],
    })
    await run.drainUntilIdle()

    expect(run.record.computerId).toBe('computer_wsl')
    expect(app.runs.project(run.record.runId).run.computerId).toBe('computer_wsl')
    expect(seenComputerIds).toEqual(['computer_wsl'])
  })
})
