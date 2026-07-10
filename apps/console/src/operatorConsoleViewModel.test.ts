import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import { developmentGatewaySnapshotFixture } from './developmentGatewaySnapshotFixture'
import { buildOperatorApprovalRows, buildOperatorConsoleViewModel } from './operatorConsoleViewModel'

describe('buildOperatorConsoleViewModel', () => {
  it('maps bounded approval history rows back to their client and agent context', () => {
    const rows = buildOperatorApprovalRows(developmentGatewaySnapshotFixture, [
      {
        approvalId: 'approval_history_runlog',
        runId: 'run_northline_done',
        sessionId: 'session_northline_today',
        workspaceId: 'workspace_northline',
        agentId: 'agent_front_desk',
        source: 'runlog',
        status: 'pending',
        requestedAt: '2026-06-27T17:04:00.000Z',
        targetKey: 'tool:file.write',
      },
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        approvalId: 'approval_history_runlog',
        source: 'runlog',
        clientName: 'Northline Dental',
        agentName: 'Front desk assistant',
      }),
    ])
  })

  it('merges compatibility and RunLog runs without duplicating canonical RunLog rows', () => {
    const snapshot: ConsoleGatewaySnapshot = {
      ...developmentGatewaySnapshotFixture,
      runLog: {
        configured: true,
        runs: [
          {
            runId: 'run_northline_waiting',
            sessionId: 'session_northline_today',
            agentId: 'agent_front_desk',
            status: 'awaiting_approval',
            workspaceId: 'workspace_northline',
            providerId: 'openrouter',
            modelId: 'anthropic/claude-sonnet-4',
            createdAt: '2026-06-27T16:45:00.000Z',
            updatedAt: '2026-06-27T17:01:00.000Z',
            latestSeq: 9,
            eventCount: 9,
            pendingApprovalCount: 1,
            approvalDecisionCount: 0,
            toolCallCount: 1,
            checkpointCount: 1,
            policyDecisionCount: 1,
            errorCount: 0,
            pendingApprovals: [
              { approvalId: 'approval_runlog_shell', toolCallId: 'tool_runlog_shell' },
            ],
            toolCalls: [
              { toolCallId: 'tool_runlog_shell', name: 'shell.exec', status: 'requested' },
            ],
            checkpoints: [
              { eventId: 'event_checkpoint_1', seq: 8, kind: 'approval' },
            ],
            policyDecisions: [
              {
                decisionId: 'decision_1',
                state: 'requires_approval',
                surface: 'tool',
                targetKey: 'tool:shell.exec',
                toolCallId: 'tool_runlog_shell',
              },
            ],
            errors: [],
          },
        ],
      },
    }

    const model = buildOperatorConsoleViewModel(snapshot)

    expect(model.runs.filter((run) => run.runId === 'run_northline_waiting')).toHaveLength(1)
    expect(model.runs.find((run) => run.runId === 'run_northline_waiting')).toMatchObject({
      source: 'runlog',
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
      checkpoints: [{ kind: 'approval' }],
      policyDecisions: [{ targetKey: 'tool:shell.exec' }],
      toolCalls: [{ name: 'shell.exec', status: 'requested' }],
      cancellable: true,
    })
    expect(model.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          approvalId: 'approval_runlog_shell',
          source: 'runlog',
          clientName: 'Northline Dental',
        }),
      ]),
    )
    expect(model.counts.activeRuns).toBe(2)
  })

  it('projects real usage, provider/model breakdowns, budgets, and recent activity', () => {
    const snapshot: ConsoleGatewaySnapshot = {
      ...developmentGatewaySnapshotFixture,
      usageLedger: [
        {
          entryId: 'usage_1',
          runId: 'run_northline_done',
          sessionId: 'session_northline_today',
          workspaceId: 'workspace_northline',
          providerId: 'openrouter',
          modelId: 'anthropic/claude-sonnet-4',
          inputTokens: 1200,
          outputTokens: 320,
          totalTokens: 1520,
          estimatedCostUsd: 0.0214,
          createdAt: '2026-06-27T17:02:00.000Z',
        },
        {
          entryId: 'usage_2',
          runId: 'run_lumen_running',
          sessionId: 'session_lumen_today',
          workspaceId: 'workspace_lumen',
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
          inputTokens: 900,
          outputTokens: 100,
          totalTokens: 1000,
          createdAt: '2026-06-27T17:03:00.000Z',
        },
      ],
      budgets: [
        {
          budgetId: 'budget_northline',
          scopeType: 'client',
          scopeId: 'client_northline',
          label: 'Northline monthly guardrail',
          maxEstimatedCostUsd: 30,
          warnAtUsd: 24,
          status: 'active',
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
        },
      ],
      budgetEvaluations: [
        {
          budgetId: 'budget_northline',
          scopeType: 'client',
          scopeId: 'client_northline',
          label: 'Northline monthly guardrail',
          scopeLabel: 'Northline Dental',
          status: 'warn',
          maxEstimatedCostUsd: 30,
          warnAtUsd: 24,
          usedEstimatedCostUsd: 24.4,
          remainingEstimatedCostUsd: 5.6,
          usageEntryCount: 2,
          pricedUsageEntryCount: 1,
          unpricedUsageEntryCount: 1,
          estimateCoverage: 'incomplete',
          costSensitiveTools: { mode: 'approval', reason: 'Budget warning threshold reached.' },
        },
      ],
    }

    const model = buildOperatorConsoleViewModel(snapshot)

    expect(model.usage).toMatchObject({
      entries: 2,
      pricedEntries: 1,
      unpricedEntries: 1,
      totalTokens: 2520,
      estimatedCostUsd: 0.0214,
    })
    expect(model.usage.providers).toEqual([
      expect.objectContaining({ id: 'openrouter', entries: 1, estimatedCostUsd: 0.0214 }),
      expect.objectContaining({ id: 'openai', entries: 1, unpricedEntries: 1 }),
    ])
    expect(model.usage.models.map((row) => row.id)).toEqual([
      'anthropic/claude-sonnet-4',
      'gpt-4.1-mini',
    ])
    expect(model.budgets).toEqual([
      expect.objectContaining({
        label: 'Northline monthly guardrail',
        scopeLabel: 'Northline Dental',
        status: 'warn',
        unpricedUsageEntryCount: 1,
      }),
    ])
    expect(model.recentActivity[0]).toMatchObject({
      kind: 'usage',
      id: 'usage:usage_2',
    })
  })
})
