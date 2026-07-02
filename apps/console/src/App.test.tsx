import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AgentSpec,
  BudgetToolPolicySummary,
  Dashboard,
  GatewayDashboardQueues,
  GatewayClientDetailPanel,
  PricingCatalogStatusSummary,
  ProviderProfileForm,
  RunTrace,
  Skills,
  UsageStatusSummary,
} from './App'
import type { DashboardViewModel } from './dashboardViewModel'
import type { RunTraceViewModel } from './runTraceViewModel'

describe('Dashboard', () => {
  it('renders the status strip for populated dashboard views', () => {
    const viewModel: DashboardViewModel = {
      source: 'gateway-projection',
      providerReady: false,
      providerState: 'unverified',
      clients: [
        {
          id: 'client_1',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          statusLabel: 'Provider unverified',
          providerReady: false,
          activeRunCount: 0,
          pendingApprovalCount: 1,
        },
      ],
      statusStrip: [
        '1 client',
        'Provider unverified',
        '0 active runs',
        '1 pending approval',
      ],
      activeRunCount: 0,
      pendingApprovalCount: 1,
    }

    const markup = renderToStaticMarkup(
      <Dashboard
        viewModel={viewModel}
        onNewClient={() => undefined}
        onOpenClient={() => undefined}
        onGuide={() => undefined}
        notice=""
      />,
    )

    expect(markup).toContain('Northline Dental')
    expect(markup).toContain('Provider unverified')
    expect(markup).toContain('1 pending approval')
    expect(markup).toContain('dashboard-status-strip')
  })

  it('renders every computed client row instead of flattening to the first client', () => {
    const viewModel: DashboardViewModel = {
      source: 'gateway-projection',
      providerReady: true,
      providerState: 'ready',
      clients: [
        {
          id: 'client_northline',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          activeRunSummary: 'OpenRouter | anthropic/claude-sonnet-4',
          statusLabel: 'Approval needed',
          providerReady: true,
          activeRunCount: 1,
          pendingApprovalCount: 1,
        },
        {
          id: 'client_lumen',
          name: 'Lumen Repair',
          subtitle: 'Repair intake assistant',
          activeRunSummary: 'OpenAI | gpt-4.1-mini',
          statusLabel: 'Running',
          providerReady: true,
          activeRunCount: 1,
          pendingApprovalCount: 0,
        },
      ],
      statusStrip: ['2 clients', 'Provider ready', '2 active runs', '1 pending approval'],
      activeRunCount: 2,
      pendingApprovalCount: 1,
    }

    const markup = renderToStaticMarkup(
      <Dashboard
        viewModel={viewModel}
        onNewClient={() => undefined}
        onOpenClient={() => undefined}
        onGuide={() => undefined}
        notice=""
      />,
    )

    expect(markup).toContain('Northline Dental')
    expect(markup).toContain('Lumen Repair')
    expect(markup).toContain('Approval needed')
    expect(markup).toContain('Running')
    expect(markup).toContain('OpenRouter | anthropic/claude-sonnet-4')
    expect(markup).toContain('OpenAI | gpt-4.1-mini')
  })
})

describe('selected client and agent labels', () => {
  it('renders budget tool policy summaries from gateway evaluation truth', () => {
    const markup = renderToStaticMarkup(
      <BudgetToolPolicySummary
        evaluation={{
          budgetId: 'budget_1',
          scopeType: 'workspace',
          scopeId: 'workspace_1',
          label: 'Workspace budget',
          scopeLabel: 'Northline Workspace',
          status: 'warn',
          maxEstimatedCostUsd: 25,
          warnAtUsd: 20,
          usedEstimatedCostUsd: 21,
          remainingEstimatedCostUsd: 4,
          usageEntryCount: 3,
          pricedUsageEntryCount: 3,
          unpricedUsageEntryCount: 0,
          estimateCoverage: 'complete',
          costSensitiveTools: {
            mode: 'approval',
            reason: 'Budget warning requires review for cost-sensitive tools: Workspace budget (Northline Workspace)',
          },
        }}
      />,
    )

    expect(markup).toContain('Cost-sensitive tools require budget review')
    expect(markup).toContain('Workspace budget')
  })

  it('renders sanitized pricing catalog status from gateway truth', () => {
    const markup = renderToStaticMarkup(
      <PricingCatalogStatusSummary
        pricingCatalog={{
          source: 'configured',
          configured: true,
          entries: 2,
          builtInEntries: 1,
          configuredEntries: 1,
          sourceLabel: 'pricing.local.json',
        }}
      />,
    )

    expect(markup).toContain('Pricing: configured catalog (pricing.local.json)')
    expect(markup).toContain('2 models tracked')
    expect(markup).toContain('1 configured')
    expect(markup).not.toContain('C:\\')
  })

  it('renders local usage rollup status from gateway truth', () => {
    const markup = renderToStaticMarkup(
      <UsageStatusSummary
        usageStatus={{
          total: {
            scopeType: 'total',
            scopeId: 'total',
            scopeLabel: 'All usage',
            summary: {
              entries: 3,
              pricedEntries: 2,
              unpricedEntries: 1,
              inputTokens: 12,
              outputTokens: 8,
              totalTokens: 20,
              estimatedCostUsd: 0.125,
              providers: ['openai'],
              models: ['gpt-example'],
            },
          },
          clients: [],
          workspaces: [],
          agents: [],
          unpricedEntries: 1,
          pricedEntries: 2,
          estimatedCostUsd: 0.125,
        }}
      />,
    )

    expect(markup).toContain('Usage: 3 ledger entries')
    expect(markup).toContain('est $0.125')
    expect(markup).toContain('1 unpriced')
  })

  it('renders the provider-profile editor with secret-ref guidance', () => {
    const markup = renderToStaticMarkup(
      <ProviderProfileForm
        existingProfile={{
          profileId: 'provider_profile_1',
          providerId: 'openrouter',
          label: 'OpenRouter Default',
          defaultModelId: 'openrouter/free',
          secretRef: '',
          credentialState: 'configured',
          status: 'active',
        }}
        onCancel={() => undefined}
        onSave={() => undefined}
      />,
    )

    expect(markup).toContain('Edit provider profile')
    expect(markup).toContain('Secret ref')
    expect(markup).toContain('Managed secret')
    expect(markup).toContain('Replace managed secret')
    expect(markup).toContain('Save provider')
  })

  it('renders existing-agent context in the agent-spec breadcrumb and title', () => {
    const markup = renderToStaticMarkup(
      <AgentSpec
        client={{
          id: 'client_lumen',
          name: 'Lumen Repair',
          contact: 'Austin',
          workspace: 'E:\\Mainspring\\workspaces\\lumen-repair',
          billingLabel: 'retainer',
        }}
        existingAgent={{
          id: 'agent_repair_intake',
          clientId: 'client_lumen',
          name: 'Repair intake assistant',
          outcome: 'Handle repair intake',
          instructions: 'Stay careful.',
          voice: 'Plain, careful, friendly',
          model: 'Saved model: default chat',
          approvalMode: 'Balanced',
          skills: {
            'File tools': true,
            Memory: true,
          },
        }}
        providerState="unverified"
        onSave={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant')
    expect(markup).toContain('Edit agent')
    expect(markup).not.toContain('Lumen Repair / New agent')
    expect(markup).toContain('Provider auth')
    expect(markup).toContain('unverified')
  })

  it('renders the selected client name in the skills breadcrumb', () => {
    const markup = renderToStaticMarkup(
      <Skills
        clientName="Lumen Repair"
        agent={{
          id: 'agent_repair_intake',
          clientId: 'client_lumen',
          name: 'Repair intake assistant',
          outcome: 'Handle repair intake',
          instructions: 'Stay careful.',
          voice: 'Plain, careful, friendly',
          model: 'Saved model: default chat',
          approvalMode: 'Balanced',
          skills: {
            'File tools': true,
            Memory: true,
          },
        }}
        providerReady={false}
        providerState="unverified"
        onSettings={() => undefined}
        onBack={() => undefined}
        onSave={() => undefined}
        onLaunch={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant')
    expect(markup).not.toContain('Northline Dental / Repair intake assistant')
  })

  it('renders the selected client and agent names in the run-trace breadcrumb', () => {
    const trace: RunTraceViewModel = {
      source: 'prototype-sample',
      clientName: 'Lumen Repair',
      agentName: 'Repair intake assistant',
      intro: 'Sample trace only. This view is not connected to events_out yet.',
      events: [
        {
          time: '10:42:01',
          label: 'Prompt assembled',
          detail: {
            Title: 'Prompt assembled',
            Context: 'Agent spec, workspace policy, and client memory',
          },
        },
      ],
      footer: ['Artifacts: none'],
    }

    const markup = renderToStaticMarkup(
      <RunTrace
        trace={trace}
        selectedEvent={0}
        setSelectedEvent={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant / Run')
    expect(markup).not.toContain('Northline Dental / Front desk assistant / Run')
  })

  it('renders gateway trace preview context without claiming a live events_out trace', () => {
    const trace: RunTraceViewModel = {
      source: 'gateway-projection-preview',
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
      intro:
        'Gateway snapshot preview only. This view reuses read-only run metadata and is not connected to events_out yet.',
      events: [
        {
          time: '17:59:00',
          label: 'Run waiting for approval',
          detail: {
            Title: 'Run waiting for approval',
            Run: 'run_1',
            Session: 'session_1',
            Status: 'waiting_approval',
            Events: '7',
          },
        },
        {
          time: '17:59:00',
          label: 'Provider context',
          detail: {
            Title: 'Provider context',
            Route: 'OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions',
          },
        },
      ],
      footer: ['Trace source: gateway snapshot preview'],
    }

    const markup = renderToStaticMarkup(
      <RunTrace
        trace={trace}
        selectedEvent={1}
        setSelectedEvent={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Gateway snapshot preview only')
    expect(markup).toContain('Provider context')
    expect(markup).toContain('OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions')
    expect(markup).toContain('Back to dashboard')
    expect(markup).not.toContain('Back to agent')
  })

  it('renders approval and session drill-down actions in the selected-client detail panel', () => {
    const markup = renderToStaticMarkup(
      <GatewayClientDetailPanel
        detail={{
          clientId: 'client_northline',
          name: 'Northline Dental',
          workspaceCount: 1,
          agentCount: 1,
          artifactCount: 1,
          usageEntryCount: 1,
          memoryEntryCount: 1,
          toolCallCount: 1,
          deploymentTargetCount: 1,
          deploymentRunCount: 1,
          cellCount: 1,
          cellLeaseCount: 1,
          cellSnapshotCount: 1,
          estimatedCostUsd: 0,
          artifacts: [
            {
              artifactId: 'artifact_1',
              runId: 'run_1',
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              agentId: 'agent_1',
              agentName: 'Front desk assistant',
              kind: 'report',
              label: 'Visit summary',
              mediaType: 'text/markdown',
              sizeBytes: 128,
              createdAt: '2026-06-27T17:58:00.000Z',
            },
          ],
          usageEntries: [
            {
              entryId: 'usage_1',
              runId: 'run_1',
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              agentId: 'agent_1',
              agentName: 'Front desk assistant',
              providerId: 'openrouter',
              providerLabel: 'OpenRouter',
              modelId: 'anthropic/claude-sonnet-4',
              totalTokens: 123,
              estimatedCostUsd: 0.001,
              createdAt: '2026-06-27T17:57:00.000Z',
            },
          ],
          auditEvents: [],
          memoryEntries: [
            {
              entryId: 'memory_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              sessionId: 'session_1',
              scope: 'session',
              textPreview: 'Remember Northline prefers morning handoff notes.',
              tags: ['handoff'],
              createdAt: '2026-06-27T17:56:00.000Z',
            },
          ],
          approvals: [
            {
              approvalId: 'approval_1',
              runId: 'run_1',
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              agentId: 'agent_1',
              agentName: 'Front desk assistant',
              status: 'pending',
              requestedAt: '2026-06-27T17:59:00.000Z',
              targetKey: 'tool:shell.exec',
            },
          ],
          sessions: [
            {
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              status: 'open',
              latestRunId: 'run_1',
              latestRunStatus: 'waiting_approval',
              updatedAt: '2026-06-27T17:59:00.000Z',
              createdAt: '2026-06-27T17:40:00.000Z',
            },
          ],
          toolCalls: [
            {
              toolCallId: 'tool_call_1',
              runId: 'run_1',
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              workspaceName: 'Northline Workspace',
              agentId: 'agent_1',
              agentName: 'Front desk assistant',
              toolName: 'browser.screenshot',
              status: 'completed',
              createdAt: '2026-06-27T17:58:30.000Z',
              updatedAt: '2026-06-27T17:58:40.000Z',
            },
          ],
        }}
        liveInventory={{
          toolCalls: [
            {
              toolCallId: 'tool_call_1',
              runId: 'run_1',
              sessionId: 'session_1',
              workspaceId: 'workspace_1',
              toolName: 'browser.screenshot',
              status: 'completed',
              createdAt: '2026-06-27T17:58:30.000Z',
              updatedAt: '2026-06-27T17:58:40.000Z',
            },
          ],
          deploymentTargets: [
            {
              targetId: 'deployment_target_1',
              workspaceId: 'workspace_1',
              label: 'Northline staging VPS',
              kind: 'vps',
              status: 'active',
              executionSupported: true,
              executionMode: 'vps-ssh',
              createdAt: '2026-06-27T17:54:00.000Z',
              updatedAt: '2026-06-27T17:55:00.000Z',
            },
          ],
          deploymentRuns: [
            {
              deploymentRunId: 'deployment_run_1',
              targetId: 'deployment_target_1',
              runId: 'run_1',
              sessionId: 'session_1',
              status: 'succeeded',
              createdAt: '2026-06-27T17:55:00.000Z',
              updatedAt: '2026-06-27T17:56:00.000Z',
            },
          ],
          cells: [
            {
              cellId: 'cell_1',
              workspaceId: 'workspace_1',
              label: 'Northline local cell',
              status: 'active',
              createdAt: '2026-06-27T17:56:00.000Z',
              updatedAt: '2026-06-27T17:57:00.000Z',
            },
          ],
          cellLeases: [
            {
              leaseId: 'lease_1',
              cellId: 'cell_1',
              runId: 'run_1',
              sessionId: 'session_1',
              status: 'active',
              createdAt: '2026-06-27T17:57:00.000Z',
              updatedAt: '2026-06-27T17:57:30.000Z',
            },
          ],
          cellSnapshots: [
            {
              snapshotId: 'snapshot_1',
              cellId: 'cell_1',
              leaseId: 'lease_1',
              label: 'Post-login snapshot',
              createdAt: '2026-06-27T17:57:45.000Z',
            },
          ],
          loading: false,
        }}
        onOpenUsageTrace={() => undefined}
        onOpenArtifactTrace={() => undefined}
        onOpenApprovalTrace={() => undefined}
        onOpenSessionTrace={() => undefined}
        onResolveApproval={() => undefined}
      />,
    )

    expect(markup).toContain('Open usage trace')
    expect(markup).toContain('Recent memory')
    expect(markup).toContain('Memory entry')
    expect(markup).toContain('Open artifact trace')
    expect(markup).toContain('Recent tool calls')
    expect(markup).toContain('browser.screenshot')
    expect(markup).toContain('Live local inventory')
    expect(markup).toContain('Northline staging VPS')
    expect(markup).toContain('vps | vps-ssh')
    expect(markup).toContain('Post-login snapshot')
    expect(markup).toContain('Recent approvals')
    expect(markup).toContain('Approval detail')
    expect(markup).toContain('Approve')
    expect(markup).toContain('Deny')
    expect(markup).toContain('Open approval trace')
    expect(markup).toContain('Linked sessions')
    expect(markup).toContain('Open session trace')
  })

  it('renders live dashboard queues for active runs and pending approvals', () => {
    const markup = renderToStaticMarkup(
      <GatewayDashboardQueues
        activeRuns={[
          {
            runId: 'run_1',
            sessionId: 'session_1',
            status: 'waiting_approval',
            needsApproval: true,
            eventCount: 7,
            pendingInboundCount: 0,
            clientId: 'client_1',
            clientName: 'Northline Dental',
            workspaceId: 'workspace_1',
            agentId: 'agent_1',
            agentName: 'Front desk assistant',
            providerLabel: 'OpenRouter',
            modelId: 'openrouter/free',
            lastEventAt: '2026-06-27T17:59:00.000Z',
          },
        ]}
        pendingApprovals={[
          {
            approvalId: 'approval_1',
            runId: 'run_1',
            sessionId: 'session_1',
            requestedAt: '2026-06-27T17:58:00.000Z',
            targetKey: 'tool:file.write',
            clientId: 'client_1',
            clientName: 'Northline Dental',
            agentId: 'agent_1',
            agentName: 'Front desk assistant',
          },
        ]}
        onOpenRunTrace={() => undefined}
        onOpenApprovalTrace={() => undefined}
        onResolveApproval={() => undefined}
      />,
    )

    expect(markup).toContain('Pending approvals')
    expect(markup).toContain('Active runs')
    expect(markup).toContain('Approve')
    expect(markup).toContain('Deny')
    expect(markup).toContain('Open approval trace')
    expect(markup).toContain('Open run trace')
    expect(markup).toContain('Northline Dental')
  })
})
