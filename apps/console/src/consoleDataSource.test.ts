import { describe, expect, it } from 'vitest'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createStaticGatewaySnapshotDataSource,
  findForbiddenConsoleSnapshotTokens,
  prototypeConsoleDataSource,
  prototypeConsoleStorageKey,
  summarizeConsoleGatewaySnapshot,
} from './consoleDataSource'

const gatewaySnapshotFixture = {
  generatedAt: '2026-06-27T13:00:00.000Z',
  health: {
    ok: true,
    running: true,
    activeSessions: 1,
  },
  counts: {
    clients: 1,
    workspaces: 1,
    agents: 1,
    providerProfiles: 1,
    sessions: 1,
    runs: 2,
    storedApprovals: 0,
    artifacts: 0,
    usageLedgerEntries: 0,
    auditEvents: 0,
    memoryEntries: 0,
    pendingApprovals: 1,
  },
  clients: [
    {
      clientId: 'client_acme',
      name: 'Acme',
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
  ],
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      createdAt: '2026-06-27T12:55:00.000Z',
      updatedAt: '2026-06-27T12:59:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'waiting_approval',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T12:56:00.000Z',
      lastEventAt: '2026-06-27T12:59:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_2',
      sessionId: 'session_1',
      status: 'completed',
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T12:40:00.000Z',
      lastEventAt: '2026-06-27T12:44:00.000Z',
      eventCount: 8,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T12:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
  runLog: {
    configured: true,
    runs: [
      {
        runId: 'runlog_1',
        sessionId: 'session_1',
        agentId: 'agent_research',
        status: 'awaiting_approval',
        workspaceId: 'workspace_acme',
        providerId: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4',
        createdAt: '2026-06-27T12:58:00.000Z',
        updatedAt: '2026-06-27T12:59:30.000Z',
        assistantText: 'Waiting for approval.',
        latestSeq: 9,
        eventCount: 9,
        lastEventType: 'run.awaiting_approval',
        pendingApprovalCount: 1,
        approvalDecisionCount: 0,
        toolCallCount: 1,
        policyDecisionCount: 1,
        pendingApprovals: [{ approvalId: 'approval_runlog_1', toolCallId: 'toolcall_runlog_1' }],
        toolCalls: [{ toolCallId: 'toolcall_runlog_1', name: 'file.write', status: 'requested' }],
        policyDecisions: [
          {
            decisionId: 'dr_runlog_1',
            state: 'requires_approval',
            surface: 'file',
            targetKey: 'file.write',
            toolCallId: 'toolcall_runlog_1',
          },
        ],
      },
    ],
  },
  approvalMetadata: [],
  artifacts: [],
  usageLedger: [],
  auditEvents: [],
  memoryEntries: [],
} satisfies ConsoleGatewaySnapshot

describe('console data source boundary', () => {
  it('keeps the existing prototype localStorage source explicit', () => {
    expect(prototypeConsoleDataSource).toEqual({
      kind: 'prototype-localStorage',
      storageKey: prototypeConsoleStorageKey,
    })
  })

  it('accepts a console gateway snapshot without local paths or secret refs', () => {
    const source = createStaticGatewaySnapshotDataSource(gatewaySnapshotFixture)
    const summary = summarizeConsoleGatewaySnapshot(gatewaySnapshotFixture)

    expect(source).toEqual({
      kind: 'gateway-snapshot',
      snapshot: gatewaySnapshotFixture,
    })
    expect(summary).toEqual({
      health: 'ready',
      clientCount: 1,
      workspaceCount: 1,
      agentCount: 1,
      providerProfileCount: 1,
      activeSessionCount: 1,
      activeRunCount: 2,
      pendingApprovalCount: 2,
    })
    expect(findForbiddenConsoleSnapshotTokens(gatewaySnapshotFixture)).toEqual([])
    expect(JSON.stringify(gatewaySnapshotFixture)).not.toContain('localStorage')
  })

  it('flags newer browser-unsafe filesystem and credential field names', () => {
    const unsafeSnapshot = {
      ...gatewaySnapshotFixture,
      artifacts: [
        {
          artifactId: 'artifact_unsafe',
          runId: 'run_1',
          sessionId: 'session_1',
          kind: 'report',
          artifactPath: 'C:\\Users\\drper\\.mainspring\\artifacts\\artifact_unsafe.md',
          filePath: '/tmp/mainspring/artifacts/artifact_unsafe.md',
          createdAt: '2026-06-27T13:01:00.000Z',
        },
      ],
      health: {
        ...gatewaySnapshotFixture.health,
        sessionsRoot: 'C:\\Users\\drper\\.mainspring\\sessions',
      },
      metadata: {
        databasePath: 'C:\\Users\\drper\\.mainspring\\gateway.sqlite',
        dbPath: 'C:\\Users\\drper\\.mainspring\\gateway.sqlite',
        gatewayToken: 'hosted_token_unsafe',
        providerKeyRef: `ANTHROPIC_API_${'KEY'}`,
        privateKeyMarker: `BEGIN PRIVATE ${'KEY'}`,
      },
    } as unknown as ConsoleGatewaySnapshot

    expect(findForbiddenConsoleSnapshotTokens(unsafeSnapshot)).toEqual([
      'sessionsRoot',
      'gatewayToken',
      'artifactPath',
      'databasePath',
      'dbPath',
      'filePath',
      `ANTHROPIC_API_${'KEY'}`,
      `BEGIN PRIVATE ${'KEY'}`,
    ])
  })
})
