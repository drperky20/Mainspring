import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  findForbiddenDashboardProjectionTokens,
  projectConsoleDashboard,
} from './dashboardProjection'

const dashboardSnapshot = {
  generatedAt: '2026-06-27T14:00:00.000Z',
  health: {
    ok: true,
    running: true,
    activeSessions: 1,
  },
  counts: {
    clients: 2,
    workspaces: 2,
    agents: 1,
    providerProfiles: 2,
    sessions: 1,
    runs: 3,
    storedApprovals: 2,
    artifacts: 2,
    usageLedgerEntries: 2,
    auditEvents: 4,
    memoryEntries: 2,
    pendingApprovals: 1,
  },
  clients: [
    {
      clientId: 'client_acme',
      name: 'Acme',
      status: 'active',
    },
    {
      clientId: 'client_empty',
      name: 'Empty Client',
      status: 'active',
    },
  ],
  workspaces: [
    {
      workspaceId: 'workspace_acme',
      clientId: 'client_acme',
      name: 'Acme Workspace',
      status: 'active',
    },
    {
      workspaceId: 'workspace_empty',
      clientId: 'client_empty',
      name: 'Empty Workspace',
      status: 'active',
    },
  ],
  agents: [
    {
      agentId: 'agent_research',
      workspaceId: 'workspace_acme',
      name: 'Research Agent',
      version: '1.0.0',
      defaultModelId: 'openrouter/auto',
      status: 'active',
    },
  ],
  providerProfiles: [
    {
      profileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      label: 'OpenRouter',
      status: 'active',
      defaultModelId: 'anthropic/claude-sonnet-4',
      credentialState: 'configured',
    },
    {
      profileId: 'provider_profile_archived',
      providerId: 'openai',
      label: 'Archived OpenAI',
      status: 'archived',
      credentialState: 'configured',
    },
  ],
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      clientId: 'client_acme',
      workspaceId: 'workspace_acme',
      createdAt: '2026-06-27T13:40:00.000Z',
      updatedAt: '2026-06-27T13:59:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_waiting',
      sessionId: 'session_1',
      status: 'waiting_approval',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:50:00.000Z',
      lastEventAt: '2026-06-27T13:59:00.000Z',
      eventCount: 5,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_running',
      sessionId: 'session_1',
      status: 'running',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:45:00.000Z',
      lastEventAt: '2026-06-27T13:55:00.000Z',
      eventCount: 3,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_completed',
      sessionId: 'session_1',
      status: 'completed',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      createdAt: '2026-06-27T13:20:00.000Z',
      lastEventAt: '2026-06-27T13:30:00.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_waiting',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T13:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
  approvalMetadata: [
    {
      approvalId: 'approval_1',
      runId: 'run_waiting',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      status: 'pending',
      requestedAt: '2026-06-27T13:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
    {
      approvalId: 'approval_2',
      runId: 'run_completed',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      status: 'approved',
      requestedAt: '2026-06-27T13:21:00.000Z',
      resolvedAt: '2026-06-27T13:22:00.000Z',
      targetKey: 'tool:file.write',
    },
  ],
  artifacts: [
    {
      artifactId: 'artifact_1',
      runId: 'run_completed',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      kind: 'report',
      label: 'Draft report',
      mediaType: 'text/markdown',
      sizeBytes: 128,
      createdAt: '2026-06-27T13:31:00.000Z',
    },
    {
      artifactId: 'artifact_2',
      runId: 'run_waiting',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      kind: 'image',
      label: 'Screenshot',
      mediaType: 'image/png',
      sizeBytes: 256,
      createdAt: '2026-06-27T13:59:30.000Z',
    },
  ],
  toolCalls: [
    {
      toolCallId: 'tool_call_waiting',
      runId: 'run_waiting',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      toolName: 'browser.screenshot',
      status: 'completed',
      createdAt: '2026-06-27T13:58:45.000Z',
      updatedAt: '2026-06-27T13:59:10.000Z',
    },
    {
      toolCallId: 'tool_call_completed',
      runId: 'run_completed',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      toolName: 'file.write',
      status: 'completed',
      createdAt: '2026-06-27T13:25:00.000Z',
      updatedAt: '2026-06-27T13:25:30.000Z',
    },
  ],
  deploymentTargets: [
    {
      targetId: 'deployment_target_acme',
      workspaceId: 'workspace_acme',
      label: 'Acme staging VPS',
      kind: 'vps',
      status: 'active',
      executionSupported: true,
      executionMode: 'vps-ssh',
      createdAt: '2026-06-27T13:10:00.000Z',
      updatedAt: '2026-06-27T13:11:00.000Z',
    },
  ],
  deploymentRuns: [
    {
      deploymentRunId: 'deployment_run_acme',
      targetId: 'deployment_target_acme',
      runId: 'run_completed',
      sessionId: 'session_1',
      status: 'succeeded',
      createdAt: '2026-06-27T13:32:00.000Z',
      updatedAt: '2026-06-27T13:33:00.000Z',
    },
  ],
  cells: [
    {
      cellId: 'cell_acme',
      workspaceId: 'workspace_acme',
      label: 'Acme local cell',
      status: 'active',
      createdAt: '2026-06-27T13:12:00.000Z',
      updatedAt: '2026-06-27T13:13:00.000Z',
    },
  ],
  cellLeases: [
    {
      leaseId: 'cell_lease_acme',
      cellId: 'cell_acme',
      runId: 'run_waiting',
      sessionId: 'session_1',
      status: 'active',
      createdAt: '2026-06-27T13:58:00.000Z',
      updatedAt: '2026-06-27T13:58:30.000Z',
    },
  ],
  cellSnapshots: [
    {
      snapshotId: 'cell_snapshot_acme',
      cellId: 'cell_acme',
      leaseId: 'cell_lease_acme',
      label: 'Post-login snapshot',
      createdAt: '2026-06-27T13:58:45.000Z',
    },
  ],
  usageLedger: [
    {
      entryId: 'usage_1',
      runId: 'run_completed',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      totalTokens: 300,
      estimatedCostUsd: 0.004,
      createdAt: '2026-06-27T13:31:30.000Z',
    },
    {
      entryId: 'usage_2',
      runId: 'run_waiting',
      sessionId: 'session_1',
      workspaceId: 'workspace_acme',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      totalTokens: 150,
      estimatedCostUsd: 0,
      createdAt: '2026-06-27T13:59:30.000Z',
    },
  ],
  memoryEntries: [
    {
      entryId: 'memory_1',
      workspaceId: 'workspace_acme',
      sessionId: 'session_1',
      scope: 'session',
      textPreview: 'Remember Acme wants revision notes grouped by workspace.',
      tags: ['revision'],
      createdAt: '2026-06-27T13:58:30.000Z',
    },
    {
      entryId: 'memory_2',
      workspaceId: 'workspace_acme',
      scope: 'workspace',
      textPreview: 'Workspace defaults to founder cockpit language.',
      tags: ['positioning'],
      createdAt: '2026-06-27T13:18:00.000Z',
    },
  ],
  auditEvents: [
    {
      eventId: 'audit_client_archived',
      category: 'gateway',
      action: 'client.archived',
      actor: 'local-gateway',
      targetType: 'client',
      targetId: 'client_acme',
      createdAt: '2026-06-27T13:58:00.000Z',
    },
    {
      eventId: 'audit_workspace_deleted',
      category: 'gateway',
      action: 'workspace.deleted',
      actor: 'local-gateway',
      targetType: 'workspace',
      targetId: 'workspace_acme',
      createdAt: '2026-06-27T13:57:00.000Z',
    },
    {
      eventId: 'audit_approval',
      category: 'gateway',
      action: 'approval.approved',
      actor: 'local-gateway',
      targetType: 'approval',
      targetId: 'approval_1',
      runId: 'run_waiting',
      sessionId: 'session_1',
      createdAt: '2026-06-27T13:56:00.000Z',
    },
    {
      eventId: 'audit_other',
      category: 'gateway',
      action: 'client.deleted',
      actor: 'local-gateway',
      targetType: 'client',
      targetId: 'client_other',
      createdAt: '2026-06-27T13:55:00.000Z',
    },
  ],
} satisfies ConsoleGatewaySnapshot

describe('projectConsoleDashboard', () => {
  it('maps safe gateway snapshots into dashboard client, provider, run, and approval rows', () => {
    const projection = projectConsoleDashboard(dashboardSnapshot)

    expect(projection.providerReady).toBe(true)
    expect(projection.providerState).toBe('ready')
    expect(projection.artifactCount).toBe(2)
    expect(projection.usageEntryCount).toBe(2)
    expect(projection.estimatedCostUsd).toBe(0.004)
    expect(projection.providers).toEqual([
      {
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter',
        status: 'active',
        credentialState: 'configured',
        defaultModelId: 'anthropic/claude-sonnet-4',
        ready: true,
      },
      {
        profileId: 'provider_profile_archived',
        providerId: 'openai',
        label: 'Archived OpenAI',
        status: 'archived',
        credentialState: 'configured',
        ready: false,
      },
    ])
    expect(projection.clients).toEqual([
      {
        clientId: 'client_acme',
        name: 'Acme',
        status: 'needs-approval',
        providerReady: true,
        workspaceCount: 1,
        agentCount: 1,
        activeRunCount: 2,
        pendingApprovalCount: 1,
        artifactCount: 2,
        usageEntryCount: 2,
        estimatedCostUsd: 0.004,
        primaryAgentName: 'Research Agent',
      },
      {
        clientId: 'client_empty',
        name: 'Empty Client',
        status: 'needs-agent',
        providerReady: true,
        workspaceCount: 1,
        agentCount: 0,
        activeRunCount: 0,
        pendingApprovalCount: 0,
        artifactCount: 0,
        usageEntryCount: 0,
        estimatedCostUsd: 0,
      },
    ])
    expect(projection.clientDetails).toEqual([
      {
        clientId: 'client_acme',
        name: 'Acme',
        workspaceCount: 1,
        agentCount: 1,
        artifactCount: 2,
        usageEntryCount: 2,
        memoryEntryCount: 2,
        toolCallCount: 2,
        deploymentTargetCount: 1,
        deploymentRunCount: 1,
        cellCount: 1,
        cellLeaseCount: 1,
        cellSnapshotCount: 1,
        estimatedCostUsd: 0.004,
        approvals: [
          {
            approvalId: 'approval_1',
            runId: 'run_waiting',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            status: 'pending',
            requestedAt: '2026-06-27T13:59:00.000Z',
            targetKey: 'tool:shell.exec',
          },
          {
            approvalId: 'approval_2',
            runId: 'run_completed',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            status: 'approved',
            requestedAt: '2026-06-27T13:21:00.000Z',
            resolvedAt: '2026-06-27T13:22:00.000Z',
            targetKey: 'tool:file.write',
          },
        ],
        sessions: [
          {
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            status: 'open',
            latestRunId: 'run_waiting',
            latestRunStatus: 'waiting_approval',
            updatedAt: '2026-06-27T13:59:00.000Z',
            createdAt: '2026-06-27T13:40:00.000Z',
          },
        ],
        auditEvents: [
          {
            eventId: 'audit_client_archived',
            category: 'gateway',
            action: 'client.archived',
            actor: 'local-gateway',
            targetType: 'client',
            targetId: 'client_acme',
            createdAt: '2026-06-27T13:58:00.000Z',
          },
          {
            eventId: 'audit_workspace_deleted',
            category: 'gateway',
            action: 'workspace.deleted',
            actor: 'local-gateway',
            targetType: 'workspace',
            targetId: 'workspace_acme',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            createdAt: '2026-06-27T13:57:00.000Z',
          },
          {
            eventId: 'audit_approval',
            category: 'gateway',
            action: 'approval.approved',
            actor: 'local-gateway',
            targetType: 'approval',
            targetId: 'approval_1',
            runId: 'run_waiting',
            sessionId: 'session_1',
            createdAt: '2026-06-27T13:56:00.000Z',
          },
        ],
        memoryEntries: [
          {
            entryId: 'memory_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            sessionId: 'session_1',
            scope: 'session',
            textPreview: 'Remember Acme wants revision notes grouped by workspace.',
            tags: ['revision'],
            createdAt: '2026-06-27T13:58:30.000Z',
          },
          {
            entryId: 'memory_2',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            scope: 'workspace',
            textPreview: 'Workspace defaults to founder cockpit language.',
            tags: ['positioning'],
            createdAt: '2026-06-27T13:18:00.000Z',
          },
        ],
        artifacts: [
          {
            artifactId: 'artifact_2',
            runId: 'run_waiting',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            kind: 'image',
            label: 'Screenshot',
            mediaType: 'image/png',
            sizeBytes: 256,
            createdAt: '2026-06-27T13:59:30.000Z',
          },
          {
            artifactId: 'artifact_1',
            runId: 'run_completed',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            kind: 'report',
            label: 'Draft report',
            mediaType: 'text/markdown',
            sizeBytes: 128,
            createdAt: '2026-06-27T13:31:00.000Z',
          },
        ],
        usageEntries: [
          {
            entryId: 'usage_2',
            runId: 'run_waiting',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            providerId: 'openrouter',
            providerLabel: 'OpenRouter',
            modelId: 'anthropic/claude-sonnet-4',
            totalTokens: 150,
            estimatedCostUsd: 0,
            createdAt: '2026-06-27T13:59:30.000Z',
          },
          {
            entryId: 'usage_1',
            runId: 'run_completed',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            providerId: 'openrouter',
            providerLabel: 'OpenRouter',
            modelId: 'anthropic/claude-sonnet-4',
            totalTokens: 300,
            estimatedCostUsd: 0.004,
            createdAt: '2026-06-27T13:31:30.000Z',
          },
        ],
        toolCalls: [
          {
            toolCallId: 'tool_call_waiting',
            runId: 'run_waiting',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            toolName: 'browser.screenshot',
            status: 'completed',
            createdAt: '2026-06-27T13:58:45.000Z',
            updatedAt: '2026-06-27T13:59:10.000Z',
          },
          {
            toolCallId: 'tool_call_completed',
            runId: 'run_completed',
            sessionId: 'session_1',
            workspaceId: 'workspace_acme',
            workspaceName: 'Acme Workspace',
            agentId: 'agent_research',
            agentName: 'Research Agent',
            toolName: 'file.write',
            status: 'completed',
            createdAt: '2026-06-27T13:25:00.000Z',
            updatedAt: '2026-06-27T13:25:30.000Z',
          },
        ],
      },
      {
        clientId: 'client_empty',
        name: 'Empty Client',
        workspaceCount: 1,
        agentCount: 0,
        artifactCount: 0,
        usageEntryCount: 0,
        memoryEntryCount: 0,
        toolCallCount: 0,
        deploymentTargetCount: 0,
        deploymentRunCount: 0,
        cellCount: 0,
        cellLeaseCount: 0,
        cellSnapshotCount: 0,
        estimatedCostUsd: 0,
        approvals: [],
        sessions: [],
        auditEvents: [],
        memoryEntries: [],
        artifacts: [],
        usageEntries: [],
        toolCalls: [],
      },
    ])
    expect(projection.activeRuns.map((run) => run.runId)).toEqual([
      'run_waiting',
      'run_running',
    ])
    expect(projection.activeRuns[0]).toMatchObject({
      runId: 'run_waiting',
      clientId: 'client_acme',
      clientName: 'Acme',
      agentId: 'agent_research',
      agentName: 'Research Agent',
      providerLabel: 'OpenRouter',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
      providerSessionId: 'provider_runtime_session',
      needsApproval: true,
    })
    expect(projection.pendingApprovals).toEqual([
      {
        approvalId: 'approval_1',
        runId: 'run_waiting',
        sessionId: 'session_1',
        requestedAt: '2026-06-27T13:59:00.000Z',
        targetKey: 'tool:shell.exec',
        clientId: 'client_acme',
        clientName: 'Acme',
        agentId: 'agent_research',
        agentName: 'Research Agent',
      },
    ])
    expect(findForbiddenDashboardProjectionTokens(projection)).toEqual([])
  })

  it('marks clients with agents as provider-missing when no configured active provider exists', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      counts: {
        ...dashboardSnapshot.counts,
        providerProfiles: 0,
        runs: 0,
        pendingApprovals: 0,
        memoryEntries: 2,
      },
      providerProfiles: [],
      runs: [],
      approvals: [],
    })

    expect(projection.providerReady).toBe(false)
    expect(projection.providerState).toBe('missing')
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'provider-missing',
      providerReady: false,
      agentCount: 1,
      activeRunCount: 0,
      pendingApprovalCount: 0,
    })
  })

  it('treats missing or unverified provider credentials as not ready', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      providerProfiles: [
        {
          ...dashboardSnapshot.providerProfiles[0],
          credentialState: 'missing',
        },
        {
          ...dashboardSnapshot.providerProfiles[1],
          status: 'active',
          credentialState: 'unverified',
        },
      ],
    })

    expect(projection.providerReady).toBe(false)
    expect(projection.providerState).toBe('unverified')
    expect(projection.providers).toEqual([
      expect.objectContaining({
        profileId: 'provider_profile_openrouter',
        credentialState: 'missing',
        ready: false,
      }),
      expect.objectContaining({
        profileId: 'provider_profile_archived',
        credentialState: 'unverified',
        ready: false,
      }),
    ])
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'provider-unverified',
      providerReady: false,
    })
  })

  it('keeps unavailable provider credentials distinct from missing or unverified', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      providerProfiles: [
        {
          ...dashboardSnapshot.providerProfiles[0],
          credentialState: 'missing',
        },
        {
          ...dashboardSnapshot.providerProfiles[1],
          status: 'active',
          credentialState: 'unavailable',
        },
      ],
    })

    expect(projection.providerReady).toBe(false)
    expect(projection.providerState).toBe('unavailable')
    expect(projection.providers).toEqual([
      expect.objectContaining({
        profileId: 'provider_profile_openrouter',
        credentialState: 'missing',
        ready: false,
      }),
      expect.objectContaining({
        profileId: 'provider_profile_archived',
        credentialState: 'unavailable',
        ready: false,
      }),
    ])
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      status: 'provider-unavailable',
      providerReady: false,
    })
  })

  it('keeps provider labels visible for active runs when providerId is present but providerProfileId is not', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      runs: [
        {
          ...dashboardSnapshot.runs[1],
          runId: 'run_runtime_derived',
          providerProfileId: undefined,
          providerId: 'openrouter',
          modelId: 'anthropic/claude-sonnet-4',
          modelFamily: 'claude',
          providerTransport: 'openrouter-chat-completions',
          providerSessionId: 'provider_runtime_session',
        },
      ],
      approvals: [],
    })

    expect(projection.activeRuns).toEqual([
      expect.objectContaining({
        runId: 'run_runtime_derived',
        providerId: 'openrouter',
        providerLabel: 'OpenRouter',
        modelId: 'anthropic/claude-sonnet-4',
        modelFamily: 'claude',
        providerTransport: 'openrouter-chat-completions',
        providerSessionId: 'provider_runtime_session',
      }),
    ])
  })

  it('projects runlog runs and approvals into operator dashboard rows', () => {
    const projection = projectConsoleDashboard({
      ...dashboardSnapshot,
      runLog: {
        configured: true,
        runs: [
          {
            runId: 'runlog_waiting',
            sessionId: 'session_1',
            agentId: 'agent_research',
            status: 'awaiting_approval',
            workspaceId: 'workspace_acme',
            providerId: 'openrouter',
            modelId: 'anthropic/claude-sonnet-4',
            createdAt: '2026-06-27T14:05:00.000Z',
            updatedAt: '2026-06-27T14:07:00.000Z',
            latestSeq: 9,
            eventCount: 9,
            pendingApprovalCount: 1,
            approvalDecisionCount: 1,
            toolCallCount: 1,
            checkpointCount: 1,
            policyDecisionCount: 1,
            errorCount: 0,
            pendingApprovals: [
              {
                approvalId: 'approval_runlog_1',
                toolCallId: 'tool_call_runlog_1',
              },
            ],
            toolCalls: [
              {
                toolCallId: 'tool_call_runlog_1',
                name: 'shell.exec',
                status: 'requested',
              },
            ],
            checkpoints: [
              {
                eventId: 'event_checkpoint_runlog_1',
                seq: 8,
                kind: 'approval',
              },
            ],
            policyDecisions: [
              {
                decisionId: 'decision_runlog_1',
                state: 'requires_approval',
                surface: 'tool',
                targetKey: 'tool:shell.exec',
                toolCallId: 'tool_call_runlog_1',
              },
            ],
            errors: [],
          },
        ],
      },
    })

    expect(projection.activeRuns[0]).toMatchObject({
      runId: 'runlog_waiting',
      status: 'awaiting_approval',
      needsApproval: true,
      clientId: 'client_acme',
      clientName: 'Acme',
      agentId: 'agent_research',
      agentName: 'Research Agent',
      providerId: 'openrouter',
      providerLabel: 'OpenRouter',
      modelId: 'anthropic/claude-sonnet-4',
      lastEventAt: '2026-06-27T14:07:00.000Z',
    })
    expect(projection.pendingApprovals[0]).toEqual({
      approvalId: 'approval_runlog_1',
      runId: 'runlog_waiting',
      sessionId: 'session_1',
      requestedAt: '2026-06-27T14:07:00.000Z',
      targetKey: 'tool_call_runlog_1',
      clientId: 'client_acme',
      clientName: 'Acme',
      agentId: 'agent_research',
      agentName: 'Research Agent',
    })
    expect(projection.clients[0]).toMatchObject({
      clientId: 'client_acme',
      activeRunCount: 3,
      pendingApprovalCount: 2,
      status: 'needs-approval',
    })
  })
})
