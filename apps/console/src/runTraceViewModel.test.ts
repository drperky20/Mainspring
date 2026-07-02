import { describe, expect, it } from 'vitest'
import type { ConsoleDashboardProjection } from './dashboardProjection'
import {
  createPrototypeRunTraceViewModel,
  gatewayProjectionToRunTraceViewModel,
} from './runTraceViewModel'

describe('run trace view-model', () => {
  it('keeps the prototype sample trace explicit', () => {
    const viewModel = createPrototypeRunTraceViewModel({
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
    })

    expect(viewModel).toMatchObject({
      source: 'prototype-sample',
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
      intro: 'Sample trace only. This view is not connected to events_out yet.',
      footer: [
        'Artifacts: none',
        'Sample input tokens: 1,284',
        'Sample output tokens: 342',
        'Cost estimate: no ledger',
      ],
    })
    expect(viewModel.events[0]).toMatchObject({
      label: 'Prompt assembled',
    })
  })

  it('builds a read-only gateway trace preview from projected run and approval truth', () => {
    const projection: ConsoleDashboardProjection = {
      generatedAt: '2026-06-27T18:00:00.000Z',
      health: 'ready',
      providerReady: true,
      providerState: 'ready',
      counts: {
        health: 'ready',
        clientCount: 1,
        workspaceCount: 1,
        agentCount: 1,
        providerProfileCount: 1,
        activeSessionCount: 1,
        activeRunCount: 1,
        pendingApprovalCount: 1,
      },
      artifactCount: 0,
      usageEntryCount: 0,
      estimatedCostUsd: 0,
      providers: [],
      clients: [
        {
          clientId: 'client_1',
          name: 'Northline Dental',
          status: 'needs-approval',
          providerReady: true,
          workspaceCount: 1,
          agentCount: 1,
          activeRunCount: 1,
          pendingApprovalCount: 1,
          artifactCount: 0,
          usageEntryCount: 0,
          estimatedCostUsd: 0,
          primaryAgentName: 'Front desk assistant',
        },
      ],
      clientDetails: [],
      activeRuns: [
        {
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'waiting_approval',
          needsApproval: true,
          eventCount: 7,
          pendingInboundCount: 0,
          clientId: 'client_1',
          clientName: 'Northline Dental',
          agentId: 'agent_1',
          agentName: 'Front desk assistant',
          providerId: 'openrouter',
          providerLabel: 'OpenRouter',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          providerSessionId: '[redacted]',
          lastEventAt: '2026-06-27T17:59:00.000Z',
        },
      ],
      pendingApprovals: [
        {
          approvalId: 'approval_1',
          runId: 'run_1',
          sessionId: 'session_1',
          requestedAt: '2026-06-27T17:59:00.000Z',
          targetKey: 'tool:shell.exec',
          clientId: 'client_1',
          clientName: 'Northline Dental',
          agentId: 'agent_1',
          agentName: 'Front desk assistant',
        },
      ],
    }

    const viewModel = gatewayProjectionToRunTraceViewModel({
      projection,
      clientId: 'client_1',
    })

    expect(viewModel).toMatchObject({
      source: 'gateway-projection-preview',
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
      intro:
        'Gateway snapshot preview only. This view reuses read-only run metadata and is not connected to events_out yet.',
      footer: [
        'Pending inbound: 0',
        'Pending approvals: 1',
        'Snapshot health: ready',
        'Trace source: gateway snapshot preview',
      ],
    })
    expect(viewModel?.events).toEqual([
      expect.objectContaining({
        time: '17:59:00',
        label: 'Run waiting for approval',
      }),
      expect.objectContaining({
        label: 'Provider context',
        detail: expect.objectContaining({
          Route: 'OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions',
          ProviderSession: '[redacted]',
        }),
      }),
      expect.objectContaining({
        label: 'Approval pending',
        detail: expect.objectContaining({
          Target: 'tool:shell.exec',
        }),
      }),
    ])
  })

  it('returns nothing when the requested client has no active run preview', () => {
    expect(
      gatewayProjectionToRunTraceViewModel({
        projection: {
          generatedAt: '2026-06-27T18:00:00.000Z',
          health: 'ready',
          providerReady: false,
          providerState: 'missing',
          counts: {
            health: 'ready',
            clientCount: 1,
            workspaceCount: 1,
            agentCount: 0,
            providerProfileCount: 0,
            activeSessionCount: 0,
            activeRunCount: 0,
            pendingApprovalCount: 0,
          },
          artifactCount: 0,
          usageEntryCount: 0,
          estimatedCostUsd: 0,
          providers: [],
          clients: [
            {
              clientId: 'client_1',
              name: 'Northline Dental',
              status: 'needs-agent',
              providerReady: false,
              workspaceCount: 1,
              agentCount: 0,
              activeRunCount: 0,
              pendingApprovalCount: 0,
              artifactCount: 0,
              usageEntryCount: 0,
              estimatedCostUsd: 0,
            },
          ],
          clientDetails: [],
          activeRuns: [],
          pendingApprovals: [],
        },
        clientId: 'client_1',
      }),
    ).toBeUndefined()
  })
})
