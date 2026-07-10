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

    expect(app.runs.list({ sessionId: 'session_discovery' }).map((run) => run.runId)).toEqual([
      second.record.runId,
      first.record.runId,
    ])
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
    ).toEqual([
      { runId: second.record.runId, status: 'queued' },
      { runId: first.record.runId, status: 'cancelled' },
    ])
    expect(reopened.runs.cancel(second.record.runId, 'Stopped after restart.').status).toBe(
      'cancelled',
    )
    expect(reopened.runs.list({ status: 'cancelled' })).toHaveLength(2)
  })
})
