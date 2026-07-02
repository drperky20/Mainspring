import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LocalGatewaySnapshot } from './LocalGateway.js'
import {
  consoleBudgetStatus,
  consoleCellStatus,
  consoleCronRuntimeStatus,
  consoleMarketplaceInstall,
  consoleRunEvent,
  consoleUsageStatus,
  gatewaySnapshotToConsoleState,
  gatewaySnapshotToExecutionBackendStatus,
} from './ConsoleSnapshotAdapter.js'
import { createJsonlMemoryStore } from '../memory/MemoryStore.js'

const sourceSnapshot: LocalGatewaySnapshot = {
  generatedAt: '2026-06-27T12:00:00.000Z',
  executionBackends: {
    defaultBackend: 'host',
    backends: [
      {
        key: 'host',
        label: 'Host shell (Windows)',
        available: true,
        unsafe: true,
        capabilities: {
          isolationKind: 'host-process',
          isolationStrength: 'none',
          securityBoundary: 'none',
          networkPolicy: 'host-inherited',
          workspaceMapping: 'host-path',
          supportsShell: true,
          supportsTerminal: true,
          supportsFileMutation: true,
          requiresApproval: true,
          unsafeFallback: true,
          verificationCommand: {
            command: 'C:\\secret\\bin\\powershell.exe',
            args: ['-NoProfile'],
          },
          limits: ['Host execution is not sandboxed.'],
        },
        reason: 'Host process execution is available but not isolated.',
      },
      {
        key: 'wsl',
        label: 'WSL bash',
        available: false,
        unsafe: false,
        capabilities: {
          isolationKind: 'wsl-distro',
          isolationStrength: 'userland-boundary',
          securityBoundary: 'distro-process',
          networkPolicy: 'host-inherited',
          workspaceMapping: 'wsl-mount',
          supportsShell: true,
          supportsTerminal: true,
          supportsFileMutation: true,
          requiresApproval: true,
          unsafeFallback: false,
          verificationCommand: {
            command: 'C:\\secret\\system32\\wsl.exe',
            args: ['--status'],
          },
          limits: ['Does not disable network access.'],
        },
        reason: 'Broken WSL image.',
      },
    ],
  },
  health: {
    ok: true,
    running: true,
    sessionsRoot: 'C:\\mainspring\\runtime\\sessions',
    activeSessions: 1,
    lastTickAt: '2026-06-27T12:00:01.000Z',
  },
  appState: {
    clients: [
      {
        clientId: 'client_acme',
        name: 'Acme',
        status: 'active',
        createdAt: '2026-06-27T11:00:00.000Z',
        updatedAt: '2026-06-27T11:00:00.000Z',
        metadata: { privateNote: 'internal client memo' },
      },
    ],
    workspaces: [
      {
        workspaceId: 'workspace_acme',
        clientId: 'client_acme',
        name: 'Acme Workspace',
        root: 'C:\\secret\\workspaces\\acme',
        status: 'active',
        createdAt: '2026-06-27T11:01:00.000Z',
        updatedAt: '2026-06-27T11:01:00.000Z',
        metadata: { localPath: 'C:\\secret\\metadata' },
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
        createdAt: '2026-06-27T11:02:00.000Z',
        updatedAt: '2026-06-27T11:02:00.000Z',
        metadata: {
          promptPath: 'C:\\secret\\prompts\\agent.md',
          instructions: 'Stay plain and careful.',
          outcome: 'Draft client work.',
          voice: 'Warm and direct',
          approvalMode: 'Balanced',
          modelLabel: 'Saved model: default chat',
          skills: { 'File tools': true, Memory: true },
        },
      },
    ],
    providerProfiles: [
      {
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter filePath=C:\\secret\\provider-id.txt',
        label: 'OpenRouter workspaceRoot=E:/Mainspring/provider-profile-label',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'anthropic/claude-sonnet-4 filePath=/srv/secret/provider-model.txt',
        status: 'active',
        createdAt: '2026-06-27T11:03:00.000Z',
        updatedAt: '2026-06-27T11:03:00.000Z',
        metadata: { ownerSecretHint: 'OPENROUTER_API_KEY' },
      },
    ],
    runs: [
      {
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        agentId: 'agent_research',
        providerProfileId: 'provider_profile_openrouter',
        providerId: 'openrouter filePath=C:\\secret\\run-provider.txt',
        modelId: 'anthropic/claude-sonnet-4 filePath=/srv/secret/run-model.txt',
        runtimeProfile: 'core-browser',
        createdAt: '2026-06-27T11:04:00.000Z',
        updatedAt: '2026-06-27T11:05:00.000Z',
        metadata: { secretRef: 'env:OPENROUTER_API_KEY' },
      },
    ],
    approvals: [
      {
        approvalId: 'approval_meta_1',
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        agentId: 'agent_research',
        status: 'approved',
        targetKey: 'tool:file.write filePath=C:\\secret\\approval-meta.txt',
        requestedAt: '2026-06-27T11:04:15.000Z',
        resolvedAt: '2026-06-27T11:04:45.000Z',
        metadata: { secretRef: 'env:OPENROUTER_API_KEY' },
      },
    ],
    artifacts: [
      {
        artifactId: 'artifact_1',
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        kind: 'report artifactPath=C:\\secret\\artifact-kind.md',
        label: 'Internal report artifactPath=C:\\secret\\artifacts\\report.md',
        path: 'C:\\secret\\artifacts\\report.md',
        mediaType: 'text/markdown filePath=C:\\secret\\artifact-media.txt',
        sizeBytes: 1024,
        createdAt: '2026-06-27T11:05:30.000Z',
        metadata: { filePath: 'C:\\secret\\artifacts\\report.md' },
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tool_call_1',
        runId: 'run_1',
        sessionId: 'session_1',
        toolName: 'browser.screenshot filePath=C:\\secret\\tool-name.txt',
        status: 'completed',
        agentId: 'agent_research',
        workspaceId: 'workspace_acme',
        outputRef: 'artifact://private-output',
        createdAt: '2026-06-27T11:05:10.000Z',
        updatedAt: '2026-06-27T11:05:20.000Z',
        metadata: { localUrl: 'artifact://private-output' },
      },
    ],
    deploymentTargets: [
      {
        targetId: 'deployment_target_1',
        workspaceId: 'workspace_acme',
        label: 'Acme staging VPS remoteRoot=/srv/mainspring/acme',
        kind: 'vps',
        status: 'active',
        createdAt: '2026-06-27T11:05:55.000Z',
        updatedAt: '2026-06-27T11:05:56.000Z',
        metadata: { sshHost: '10.0.0.2' },
      },
    ],
    deploymentRuns: [
      {
        deploymentRunId: 'deployment_run_1',
        targetId: 'deployment_target_1',
        runId: 'run_1',
        sessionId: 'session_1',
        status: 'succeeded',
        createdAt: '2026-06-27T11:05:57.000Z',
        updatedAt: '2026-06-27T11:05:58.000Z',
        metadata: { privateLogPath: 'C:\\secret\\deployments\\run.log' },
      },
    ],
    cells: [
      {
        cellId: 'cell_1',
        workspaceId: 'workspace_acme',
        label: 'Northline local cell workspaceRoot=E:/Mainspring/cell-label',
        status: 'active',
        createdAt: '2026-06-27T11:06:00.000Z',
        updatedAt: '2026-06-27T11:06:01.000Z',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash artifactPath=C:\\secret\\cell-backend-label.md',
          backendUnsafe: false,
          backendCapabilities: {
            isolationKind: 'wsl-distro',
            isolationStrength: 'userland-boundary filePath=C:\\secret\\cell-isolation.txt',
            securityBoundary: 'distro-process artifactPath=C:\\secret\\cell-security.txt',
            networkPolicy: 'host-inherited databasePath=/var/lib/mainspring/cell.sqlite',
            workspaceMapping: 'wsl-mount workspaceRoot=E:/Mainspring/cell-mount',
            requiresApproval: true,
            unsafeFallback: false,
            limits: ['Does not disable network access. filePath=C:\\secret\\cell-limit.txt'],
            verificationCommand: { command: 'wsl.exe' },
            vmPath: 'C:\\secret\\cells\\cell_1',
          },
          vmPath: 'C:\\secret\\cells\\cell_1',
        },
      },
    ],
    cellLeases: [
      {
        leaseId: 'lease_1',
        cellId: 'cell_1',
        runId: 'run_1',
        sessionId: 'session_1',
        status: 'active',
        createdAt: '2026-06-27T11:06:02.000Z',
        updatedAt: '2026-06-27T11:06:03.000Z',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash filePath=C:\\secret\\lease-backend-label.txt',
          backendUnsafe: false,
          backendCapabilities: {
            isolationKind: 'wsl-distro',
            networkPolicy: 'host-inherited filePath=C:\\secret\\lease-network.txt',
            verificationCommand: { command: 'wsl.exe' },
          },
          secretToken: 'cell-token',
        },
      },
    ],
    cellSnapshots: [
      {
        snapshotId: 'cell_snapshot_1',
        cellId: 'cell_1',
        leaseId: 'lease_1',
        label: 'Post-login snapshot artifactPath=C:\\secret\\cells\\snap.png',
        createdAt: '2026-06-27T11:06:04.000Z',
        metadata: {
          backend: 'wsl',
          backendLabel: 'WSL bash filePath=C:\\secret\\snapshot-backend-label.txt',
          backendCapabilities: {
            isolationKind: 'wsl-distro',
            networkPolicy: 'host-inherited filePath=C:\\secret\\snapshot-network.txt',
            imagePath: 'C:\\secret\\cells\\snap.png',
          },
        },
      },
    ],
    cronSchedules: [
      {
        scheduleId: 'schedule_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        agentId: 'agent_research',
        providerProfileId: 'provider_profile_openrouter',
        computerId: 'computer_wsl',
        label: 'Daily report',
        prompt: 'Build the morning report with the isolated backend.',
        cronExpr: '0 9 * * 1',
        timezone: 'local',
        allowedTools: ['file.write'],
        runtimeProfile: 'core-browser',
        enabled: true,
        nextRunAt: '2026-06-29T14:00:00.000Z',
        createdAt: '2026-06-27T11:06:05.000Z',
        updatedAt: '2026-06-27T11:06:06.000Z',
      },
    ],
    usageLedger: [
      {
        entryId: 'usage_1',
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: 'workspace_acme',
        providerId: 'openrouter filePath=C:\\secret\\usage-provider.txt',
        modelId: 'anthropic/claude-sonnet-4 filePath=/srv/secret/usage-model.txt',
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        estimatedCostUsd: 0.01,
        createdAt: '2026-06-27T11:05:45.000Z',
        metadata: { secretRef: 'env:OPENROUTER_API_KEY' },
      },
    ],
    auditEvents: [
      {
        eventId: 'audit_1',
        category: 'run filePath=C:\\secret\\audit-category.txt',
        action: 'completed artifactPath=C:\\secret\\audit-action.md',
        actor: 'runtime workspaceRoot=E:/Mainspring/audit-actor',
        targetType: 'run databasePath=/var/lib/mainspring/audit.sqlite',
        targetId: 'run_1 filePath=C:\\secret\\audit-target.txt',
        runId: 'run_1',
        sessionId: 'session_1',
        createdAt: '2026-06-27T11:05:50.000Z',
        metadata: { localPath: 'C:\\secret\\runtime-sessions\\session_1' },
      },
    ],
  },
  sessions: [
    {
      sessionId: 'session_1',
      status: 'open',
      workspaceRoot: 'C:\\secret\\runtime-workspaces\\session_1',
      sessionPath: 'C:\\secret\\runtime-sessions\\session_1',
      createdAt: '2026-06-27T11:04:00.000Z',
      updatedAt: '2026-06-27T11:05:00.000Z',
      metadata: {
        clientId: 'client_acme',
        workspaceId: 'workspace_acme',
        root: 'C:\\secret\\runtime-workspaces\\session_1',
      },
    },
  ],
  runs: [
    {
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'waiting_approval',
      input: 'Do private work',
      createdAt: '2026-06-27T11:04:00.000Z',
      lastEventAt: '2026-06-27T11:05:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
      workspaceId: 'workspace_acme',
      agentId: 'agent_research',
      computerId: 'computer_host filePath=C:\\secret\\computer.txt',
      providerId: 'openrouter filePath=C:\\secret\\runtime-provider.txt',
      providerProfileId: 'provider_profile_openrouter',
      modelId: 'anthropic/claude-sonnet-4 filePath=/srv/secret/runtime-model.txt',
      modelFamily: 'claude filePath=C:\\secret\\model-family.txt',
      providerTransport: 'openrouter-chat-completions filePath=/srv/secret/transport.txt',
      providerSessionId: 'provider_runtime_session filePath=C:\\secret\\provider-session.txt',
      runtimeProfile: 'core-browser',
    },
  ],
  cron: {
    enabled: false,
    running: false,
    pollIntervalMs: 30_000,
  },
  pricingCatalog: {
    source: 'configured',
    configured: true,
    entries: 2,
    builtInEntries: 1,
    configuredEntries: 1,
    sourceLabel: 'pricing.local.json',
  },
  usageStatus: {
    total: {
      scopeType: 'total',
      scopeId: 'total',
      scopeLabel: 'All usage',
      summary: {
        entries: 1,
        pricedEntries: 1,
        unpricedEntries: 0,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.01,
        providers: ['openrouter'],
        models: ['anthropic/claude-sonnet-4'],
      },
    },
    clients: [],
    workspaces: [],
    agents: [],
    unpricedEntries: 0,
    pricedEntries: 1,
    estimatedCostUsd: 0.01,
  },
  budgetStatus: {
    evaluations: [],
    blocked: 0,
    warnings: 0,
    usageStatus: {
      total: {
        scopeType: 'total',
        scopeId: 'total',
        scopeLabel: 'All usage',
        summary: {
          entries: 1,
          pricedEntries: 1,
          unpricedEntries: 0,
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          estimatedCostUsd: 0.01,
          providers: ['openrouter'],
          models: ['anthropic/claude-sonnet-4'],
        },
      },
      clients: [],
      workspaces: [],
      agents: [],
      unpricedEntries: 0,
      pricedEntries: 1,
      estimatedCostUsd: 0.01,
    },
  },
  cellStatus: {
    enabled: true,
    leaseTtlMs: 21_600_000,
    capacityEnforced: true,
    maxActiveLeasesPerCell: 1,
    cells: 1,
    leases: {
      active: 1,
      released: 0,
      expired: 0,
      total: 1,
    },
    cellStatuses: [
      {
        cellId: 'cell_1',
        workspaceId: 'workspace_acme',
        label: 'Northline local cell',
        status: 'active',
        activeLeases: 1,
        releasedLeases: 0,
        expiredLeases: 0,
        maxActiveLeases: 1,
        capacityAvailable: 0,
      },
    ],
  },
  approvals: [
    {
      approvalId: 'approval_1',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'pending',
      requestedAt: '2026-06-27T11:05:00.000Z',
      targetKey: 'tool:shell.exec filePath=C:\\secret\\approval-shell.txt',
      reasons: ['requires host shell'],
      permissionCategories: ['process'],
    },
    {
      approvalId: 'approval_2',
      runId: 'run_1',
      sessionId: 'session_1',
      status: 'approved',
      requestedAt: '2026-06-27T11:04:30.000Z',
      resolvedAt: '2026-06-27T11:04:45.000Z',
      targetKey: 'tool:file.write artifactPath=C:\\secret\\approval-file.md',
      reasons: ['write file'],
      permissionCategories: ['filesystem.write'],
    },
  ],
  runLog: {
    configured: true,
    runs: [
      {
        runId: 'runlog_1',
        sessionId: 'session_1',
        agentId: 'agent_research filePath=C:\\secret\\runlog-agent.txt',
        status: 'awaiting_approval',
        workspaceId: 'workspace_acme',
        providerId: 'openrouter filePath=C:\\secret\\runlog-provider.txt',
        modelId: 'anthropic/claude-sonnet-4 filePath=/srv/secret/runlog-model.txt',
        createdAt: '2026-06-27T11:06:00.000Z',
        updatedAt: '2026-06-27T11:06:30.000Z',
        assistantText: 'Need approval before writing artifactPath=C:\\secret\\runlog-output.md',
        latestSeq: 8,
        eventCount: 8,
        lastEventType: 'run.awaiting_approval',
        pendingApprovals: [
          {
            approvalId: 'approval_runlog_1',
            toolCallId: 'toolcall_runlog_write filePath=C:\\secret\\toolcall.txt',
          },
        ],
        approvalDecisions: [],
        toolCalls: [
          {
            toolCallId: 'toolcall_runlog_write filePath=C:\\secret\\toolcall.txt',
            name: 'file.write artifactPath=C:\\secret\\tool-name.txt',
            status: 'requested',
          },
        ],
        checkpoints: [
          {
            eventId: 'event_checkpoint_1 filePath=C:\\secret\\checkpoint-event.txt',
            seq: 7,
            kind: 'approval artifactPath=C:\\secret\\checkpoint-kind.txt',
          },
        ],
        policyDecisions: [
          {
            decisionId: 'dr_runlog_1',
            runId: 'runlog_1',
            sessionId: 'session_1',
            toolCallId: 'toolcall_runlog_write filePath=C:\\secret\\toolcall.txt',
            surface: 'file',
            operation: 'tool.execute',
            targetKey: 'file.write filePath=C:\\secret\\policy-target.txt',
            state: 'requires_approval',
            reasons: ['manifest requires approval'],
            permissionCategories: ['filesystem:workspace-write'],
            approved: false,
            hardBlocked: false,
            inputHash: 'hash_input',
            manifestHash: 'hash_manifest',
            policyHash: 'hash_policy',
            createdAt: '2026-06-27T11:06:20.000Z',
          },
        ],
        errors: [
          {
            eventId: 'event_error_1 filePath=C:\\secret\\error-event.txt',
            seq: 8,
            type: 'runtime.error',
            message: 'blocked artifactPath=C:\\secret\\runlog-error.log',
          },
        ],
      },
    ],
  },
}

describe('gatewaySnapshotToConsoleState', () => {
  it('maps gateway snapshots into console-safe serializable data', () => {
    const original = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-test-secret'
    const consoleState = gatewaySnapshotToConsoleState(sourceSnapshot)

    try {
      expect(consoleState.counts).toEqual({
        clients: 1,
        workspaces: 1,
        agents: 1,
        providerProfiles: 1,
        sessions: 1,
        runs: 1,
        storedApprovals: 1,
        artifacts: 1,
        cronSchedules: 1,
        budgets: 0,
        usageLedgerEntries: 1,
        auditEvents: 1,
        memoryEntries: 0,
        pendingApprovals: 1,
        runLogRuns: 1,
        runLogPendingApprovals: 1,
      })
      expect(consoleState.health).toEqual({
        ok: true,
        running: true,
        activeSessions: 1,
      })
      expect(consoleState.executionBackends).toEqual({
        defaultBackend: 'host',
        backends: [
          {
            key: 'host',
            label: 'Host shell (Windows)',
            available: true,
            unsafe: true,
            reason: 'Host process execution is available but not isolated.',
            capabilities: {
              isolationKind: 'host-process',
              isolationStrength: 'none',
              securityBoundary: 'none',
              networkPolicy: 'host-inherited',
              workspaceMapping: 'host-path',
              requiresApproval: true,
              unsafeFallback: true,
              limits: ['Host execution is not sandboxed.'],
            },
          },
          {
            key: 'wsl',
            label: 'WSL bash',
            available: false,
            unsafe: false,
            reason: 'Broken WSL image.',
            capabilities: {
              isolationKind: 'wsl-distro',
              isolationStrength: 'userland-boundary',
              securityBoundary: 'distro-process',
              networkPolicy: 'host-inherited',
              workspaceMapping: 'wsl-mount',
              requiresApproval: true,
              unsafeFallback: false,
              limits: ['Does not disable network access.'],
            },
          },
        ],
      })
      expect(consoleState.cellStatus).toEqual(sourceSnapshot.cellStatus)
      expect(consoleState.pricingCatalog).toEqual({
        source: 'configured',
        configured: true,
        entries: 2,
        builtInEntries: 1,
        configuredEntries: 1,
        sourceLabel: 'pricing.local.json',
      })
      expect(consoleState.usageStatus).toEqual(sourceSnapshot.usageStatus)
      expect(JSON.stringify(consoleState.pricingCatalog)).not.toContain('C:\\')
      expect(consoleState.providerProfiles[0]).toEqual({
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter [redacted]',
        label: 'OpenRouter [redacted]',
        status: 'active',
        defaultModelId: 'anthropic/claude-sonnet-4 [redacted]',
        credentialState: 'configured',
      })
      expect(consoleState.workspaces[0]).toEqual({
        workspaceId: 'workspace_acme',
        clientId: 'client_acme',
        name: 'Acme Workspace',
        status: 'active',
      })
      expect(consoleState.agents[0]).toEqual({
        agentId: 'agent_research',
        workspaceId: 'workspace_acme',
        name: 'Research Agent',
        version: '1.0.0',
        defaultModelId: 'openrouter/auto',
        instructions: 'Stay plain and careful.',
        outcome: 'Draft client work.',
        voice: 'Warm and direct',
        approvalMode: 'Balanced',
        modelLabel: 'Saved model: default chat',
        skills: { 'File tools': true, Memory: true },
        status: 'active',
      })
      expect(consoleState.sessions[0]).toEqual({
        sessionId: 'session_1',
        status: 'open',
        clientId: 'client_acme',
        workspaceId: 'workspace_acme',
        createdAt: '2026-06-27T11:04:00.000Z',
        updatedAt: '2026-06-27T11:05:00.000Z',
      })
      expect(consoleState.runs[0]).toEqual({
        runId: 'run_1',
        sessionId: 'session_1',
        status: 'waiting_approval',
        workspaceId: 'workspace_acme',
        agentId: 'agent_research',
        computerId: 'computer_host [redacted]',
        providerProfileId: 'provider_profile_openrouter',
        providerId: 'openrouter [redacted]',
        modelId: 'anthropic/claude-sonnet-4 [redacted]',
        modelFamily: 'claude [redacted]',
        providerTransport: 'openrouter-chat-completions [redacted]',
        providerSessionId: 'provider_runtime_session [redacted]',
        createdAt: '2026-06-27T11:04:00.000Z',
        lastEventAt: '2026-06-27T11:05:00.000Z',
        eventCount: 4,
        pendingInboundCount: 0,
      })
      expect(consoleState.approvals).toEqual([
        {
          approvalId: 'approval_1',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'pending',
          requestedAt: '2026-06-27T11:05:00.000Z',
          targetKey: 'tool:shell.exec [redacted]',
        },
        {
          approvalId: 'approval_2',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'approved',
          requestedAt: '2026-06-27T11:04:30.000Z',
          resolvedAt: '2026-06-27T11:04:45.000Z',
          targetKey: 'tool:file.write [redacted]',
        },
      ])
      expect(consoleState.runLog).toEqual({
        configured: true,
        runs: [
          {
            runId: 'runlog_1',
            sessionId: 'session_1',
            agentId: 'agent_research [redacted]',
            status: 'awaiting_approval',
            workspaceId: 'workspace_acme',
            providerId: 'openrouter [redacted]',
            modelId: 'anthropic/claude-sonnet-4 [redacted]',
            createdAt: '2026-06-27T11:06:00.000Z',
            updatedAt: '2026-06-27T11:06:30.000Z',
            assistantText: 'Need approval before writing [redacted]',
            latestSeq: 8,
            eventCount: 8,
            lastEventType: 'run.awaiting_approval',
            pendingApprovalCount: 1,
            approvalDecisionCount: 0,
            toolCallCount: 1,
            checkpointCount: 1,
            policyDecisionCount: 1,
            errorCount: 1,
            pendingApprovals: [
              {
                approvalId: 'approval_runlog_1',
                toolCallId: 'toolcall_runlog_write [redacted]',
              },
            ],
            toolCalls: [
              {
                toolCallId: 'toolcall_runlog_write [redacted]',
                name: 'file.write [redacted]',
                status: 'requested',
              },
            ],
            checkpoints: [
              {
                eventId: 'event_checkpoint_1 [redacted]',
                seq: 7,
                kind: 'approval [redacted]',
              },
            ],
            policyDecisions: [
              {
                decisionId: 'dr_runlog_1',
                state: 'requires_approval',
                surface: 'file',
                targetKey: 'file.write [redacted]',
                toolCallId: 'toolcall_runlog_write [redacted]',
              },
            ],
            errors: [
              {
                eventId: 'event_error_1 [redacted]',
                seq: 8,
                type: 'runtime.error',
                message: 'blocked [redacted]',
              },
            ],
          },
        ],
      })
      expect(consoleState.approvalMetadata).toEqual([
        {
          approvalId: 'approval_meta_1',
          runId: 'run_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_acme',
          agentId: 'agent_research',
          status: 'approved',
          targetKey: 'tool:file.write [redacted]',
          requestedAt: '2026-06-27T11:04:15.000Z',
          resolvedAt: '2026-06-27T11:04:45.000Z',
        },
      ])
      expect(consoleState.artifacts).toEqual([
        {
          artifactId: 'artifact_1',
          runId: 'run_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_acme',
          kind: 'report [redacted]',
          label: 'Internal report [redacted]',
          mediaType: 'text/markdown [redacted]',
          sizeBytes: 1024,
          createdAt: '2026-06-27T11:05:30.000Z',
        },
      ])
      expect(consoleState.toolCalls).toEqual([
        {
          toolCallId: 'tool_call_1',
          runId: 'run_1',
          sessionId: 'session_1',
          toolName: 'browser.screenshot [redacted]',
          status: 'completed',
          agentId: 'agent_research',
          workspaceId: 'workspace_acme',
          createdAt: '2026-06-27T11:05:10.000Z',
          updatedAt: '2026-06-27T11:05:20.000Z',
        },
      ])
      expect(consoleState.deploymentTargets).toEqual([
        {
          targetId: 'deployment_target_1',
          workspaceId: 'workspace_acme',
          label: 'Acme staging VPS [redacted]',
          kind: 'vps',
          status: 'active',
          executionSupported: true,
          executionMode: 'vps-ssh',
          createdAt: '2026-06-27T11:05:55.000Z',
          updatedAt: '2026-06-27T11:05:56.000Z',
        },
      ])
      expect(consoleState.deploymentRuns).toEqual([
        {
          deploymentRunId: 'deployment_run_1',
          targetId: 'deployment_target_1',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'succeeded',
          createdAt: '2026-06-27T11:05:57.000Z',
          updatedAt: '2026-06-27T11:05:58.000Z',
        },
      ])
      expect(consoleState.cells).toEqual([
        {
          cellId: 'cell_1',
          workspaceId: 'workspace_acme',
          label: 'Northline local cell [redacted]',
          status: 'active',
          createdAt: '2026-06-27T11:06:00.000Z',
          updatedAt: '2026-06-27T11:06:01.000Z',
          backend: {
            backend: 'wsl',
            backendLabel: 'WSL bash [redacted]',
            backendUnsafe: false,
            backendCapabilities: {
              isolationKind: 'wsl-distro',
              isolationStrength: 'userland-boundary [redacted]',
              securityBoundary: 'distro-process [redacted]',
              networkPolicy: 'host-inherited [redacted]',
              workspaceMapping: 'wsl-mount [redacted]',
              requiresApproval: true,
              unsafeFallback: false,
              limits: ['Does not disable network access. [redacted]'],
            },
          },
        },
      ])
      expect(consoleState.cellLeases).toEqual([
        {
          leaseId: 'lease_1',
          cellId: 'cell_1',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'active',
          createdAt: '2026-06-27T11:06:02.000Z',
          updatedAt: '2026-06-27T11:06:03.000Z',
          backend: {
            backend: 'wsl',
            backendLabel: 'WSL bash [redacted]',
            backendUnsafe: false,
            backendCapabilities: {
              isolationKind: 'wsl-distro',
              networkPolicy: 'host-inherited [redacted]',
            },
          },
        },
      ])
      expect(consoleState.cellSnapshots).toEqual([
        {
          snapshotId: 'cell_snapshot_1',
          cellId: 'cell_1',
          leaseId: 'lease_1',
          label: 'Post-login snapshot [redacted]',
          createdAt: '2026-06-27T11:06:04.000Z',
          backend: {
            backend: 'wsl',
            backendLabel: 'WSL bash [redacted]',
            backendCapabilities: {
              isolationKind: 'wsl-distro',
              networkPolicy: 'host-inherited [redacted]',
            },
          },
        },
      ])
      expect(consoleState.cronSchedules).toEqual([
        {
          scheduleId: 'schedule_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_acme',
          agentId: 'agent_research',
          providerProfileId: 'provider_profile_openrouter',
          computerId: 'computer_wsl',
          label: 'Daily report',
          promptPreview: 'Build the morning report with the isolated backend.',
          cronExpr: '0 9 * * 1',
          timezone: 'local',
          allowedTools: ['file.write'],
          runtimeProfile: 'core-browser',
          enabled: true,
          nextRunAt: '2026-06-29T14:00:00.000Z',
          createdAt: '2026-06-27T11:06:05.000Z',
          updatedAt: '2026-06-27T11:06:06.000Z',
        },
      ])
      expect(consoleState.usageLedger).toEqual([
        {
          entryId: 'usage_1',
          runId: 'run_1',
          sessionId: 'session_1',
          workspaceId: 'workspace_acme',
          providerId: 'openrouter [redacted]',
          modelId: 'anthropic/claude-sonnet-4 [redacted]',
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          estimatedCostUsd: 0.01,
          createdAt: '2026-06-27T11:05:45.000Z',
        },
      ])
      expect(consoleState.auditEvents).toEqual([
        {
          eventId: 'audit_1',
          category: 'run [redacted]',
          action: 'completed [redacted]',
          actor: 'runtime [redacted]',
          targetType: 'run [redacted]',
          targetId: 'run_1 [redacted]',
          runId: 'run_1',
          sessionId: 'session_1',
          createdAt: '2026-06-27T11:05:50.000Z',
        },
      ])
      expect(consoleState.memoryEntries).toEqual([])

      expect(consoleState.providerProfiles[0]).not.toHaveProperty('secretRef')
      expect(consoleState.workspaces[0]).not.toHaveProperty('root')
      expect(consoleState.sessions[0]).not.toHaveProperty('workspaceRoot')
      expect(consoleState.sessions[0]).not.toHaveProperty('sessionPath')
      expect(consoleState.artifacts[0]).not.toHaveProperty('path')
      expect(consoleState.toolCalls?.[0]).not.toHaveProperty('outputRef')
      expect(JSON.stringify(consoleState.executionBackends)).not.toContain('verificationCommand')
      expect(JSON.stringify(consoleState.executionBackends)).not.toContain('supportsShell')
      expect(JSON.stringify(consoleState.executionBackends)).not.toContain('C:\\')
      expect(JSON.stringify(consoleState.cells)).not.toContain('verificationCommand')
      expect(JSON.stringify(consoleState.cells)).not.toContain('C:\\')
      expect(JSON.stringify(consoleState.cellLeases)).not.toContain('cell-token')
      expect(JSON.stringify(consoleState.cellSnapshots)).not.toContain('imagePath')

      const serialized = JSON.stringify(consoleState)
      expect(serialized).not.toContain('OPENROUTER_API_KEY')
      expect(serialized).not.toContain('secretRef')
      expect(serialized).not.toContain('C:\\secret')
      expect(serialized).not.toContain('workspaceRoot')
      expect(serialized).not.toContain('sessionPath')
      expect(serialized).not.toContain('artifactPath')
      expect(serialized).not.toContain('databasePath')
      expect(serialized).not.toContain('filePath')
      expect(serialized).not.toContain('approval-shell')
      expect(serialized).not.toContain('approval-file')
      expect(serialized).not.toContain('artifact-kind')
      expect(serialized).not.toContain('artifact-media')
      expect(serialized).not.toContain('tool-name')
      expect(serialized).not.toContain('checkpoint-event')
      expect(serialized).not.toContain('checkpoint-kind')
      expect(serialized).not.toContain('error-event')
      expect(serialized).not.toContain('runlog-error')
      expect(serialized).not.toContain('audit-category')
      expect(serialized).not.toContain('audit-action')
      expect(serialized).not.toContain('audit-actor')
      expect(serialized).not.toContain('audit-target')
      expect(JSON.parse(serialized)).toEqual(consoleState)
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = original
    }
  })

  it('marks non-VPS deployment targets as metadata-only in console DTOs', () => {
    const consoleState = gatewaySnapshotToConsoleState({
      ...sourceSnapshot,
      appState: {
        ...sourceSnapshot.appState,
        deploymentTargets: [
          {
            targetId: 'deployment_target_local',
            workspaceId: 'workspace_acme',
            label: 'Local metadata target',
            kind: 'local',
            status: 'active',
            createdAt: '2026-06-29T14:00:00.000Z',
            updatedAt: '2026-06-29T14:00:00.000Z',
            metadata: { localPath: 'C:\\secret\\deploy' },
          },
        ],
      },
    })

    expect(consoleState.deploymentTargets).toEqual([
      {
        targetId: 'deployment_target_local',
        workspaceId: 'workspace_acme',
        label: 'Local metadata target',
        kind: 'local',
        status: 'active',
        executionSupported: false,
        executionMode: 'metadata-only',
        executionUnavailableReason: 'local deployment targets do not have a real executor yet.',
        createdAt: '2026-06-29T14:00:00.000Z',
        updatedAt: '2026-06-29T14:00:00.000Z',
      },
    ])
    expect(JSON.stringify(consoleState.deploymentTargets)).not.toContain('C:\\secret')
  })

  it('marks env-backed provider profiles as missing when the current process lacks the referenced key', () => {
    const original = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const consoleState = gatewaySnapshotToConsoleState(sourceSnapshot)
      expect(consoleState.providerProfiles[0]?.credentialState).toBe('missing')
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = original
    }
  })

  it('marks managed provider refs without stored ciphertext as missing', () => {
    const consoleState = gatewaySnapshotToConsoleState({
      ...sourceSnapshot,
      appState: {
        ...sourceSnapshot.appState,
        providerProfiles: [
          {
            ...sourceSnapshot.appState.providerProfiles[0],
            profileId: 'provider_profile_managed',
            label: 'Managed Profile',
            secretRef: 'managed:openrouter-profile',
          },
        ],
      },
    })

    expect(consoleState.providerProfiles[0]).toMatchObject({
      profileId: 'provider_profile_managed',
      credentialState: 'missing',
    })
  })

  it('marks unsupported provider refs as unavailable instead of pretending they are configured', () => {
    const consoleState = gatewaySnapshotToConsoleState({
      ...sourceSnapshot,
      appState: {
        ...sourceSnapshot.appState,
        providerProfiles: [
          {
            ...sourceSnapshot.appState.providerProfiles[0],
            profileId: 'provider_profile_external',
            label: 'External Profile',
            secretRef: 'provider-profile:not-local',
          },
        ],
      },
    })

    expect(consoleState.providerProfiles[0]).toMatchObject({
      profileId: 'provider_profile_external',
      credentialState: 'unavailable',
    })
    expect(JSON.stringify(consoleState)).not.toContain('provider-profile:not-local')
    expect(JSON.stringify(consoleState)).not.toContain('secretRef')
  })

  it('surfaces sanitized recent memory entries without leaking workspace roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-console-memory-'))
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const store = createJsonlMemoryStore()
    store.write({
      workspaceRoot,
      text: 'Remember Acme prefers founder cockpit language in every update.',
      tags: ['positioning workspaceRoot=C:\\secret\\memory-tag'],
    })
    store.write({
      workspaceRoot,
      scope: 'session',
      sessionId: 'session_1',
      text: 'Current turn note for the operator console.',
      tags: ['session filePath=/tmp/mainspring/session-memory-tag'],
    })

    try {
      const consoleState = gatewaySnapshotToConsoleState({
        ...sourceSnapshot,
        appState: {
          ...sourceSnapshot.appState,
          workspaces: [
            {
              ...sourceSnapshot.appState.workspaces[0],
              root: workspaceRoot,
            },
          ],
        },
      })

      expect(consoleState.counts.memoryEntries).toBe(2)
      expect(consoleState.memoryEntries).toEqual([
        expect.objectContaining({
          workspaceId: 'workspace_acme',
          sessionId: 'session_1',
          scope: 'session',
          textPreview: 'Current turn note for the operator console.',
          tags: ['session [redacted]'],
        }),
        expect.objectContaining({
          workspaceId: 'workspace_acme',
          scope: 'workspace',
          textPreview: 'Remember Acme prefers founder cockpit language in every update.',
          tags: ['positioning [redacted]'],
        }),
      ])
      expect(JSON.stringify(consoleState.memoryEntries)).not.toContain(workspaceRoot)
      expect(JSON.stringify(consoleState.memoryEntries)).not.toContain('workspaceRoot')
      expect(JSON.stringify(consoleState.memoryEntries)).not.toContain('filePath')
      expect(JSON.stringify(consoleState.memoryEntries)).not.toContain('memory-tag')
      expect(JSON.stringify(consoleState.memoryEntries)).not.toContain('/tmp/mainspring')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('redacts newer browser-unsafe path markers from cron and memory previews', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-console-preview-redaction-'))
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const store = createJsonlMemoryStore()
    store.write({
      workspaceRoot,
      text:
        'operator note artifactPath=C:\\secret\\artifact.md filePath=/tmp/mainspring/artifact.md dbPath=/var/lib/mainspring/gateway.sqlite',
      tags: ['security artifactPath=C:\\secret\\memory-tag.md'],
    })

    try {
      const consoleState = gatewaySnapshotToConsoleState({
        ...sourceSnapshot,
        appState: {
          ...sourceSnapshot.appState,
          workspaces: [
            {
              ...sourceSnapshot.appState.workspaces[0],
              root: workspaceRoot,
            },
          ],
          cronSchedules: [
            {
              ...sourceSnapshot.appState.cronSchedules[0],
              prompt:
                'run artifactPath=C:\\secret\\cron-artifact.md databasePath=/var/lib/mainspring/gateway.sqlite sessionsRoot=/sessions/root',
              lastError:
                'failed filePath=C:\\secret\\cron-error.log dbPath=/tmp/mainspring/gateway.sqlite',
            },
          ],
        },
      })
      const serialized = JSON.stringify({
        cronSchedules: consoleState.cronSchedules,
        memoryEntries: consoleState.memoryEntries,
      })

      expect(consoleState.cronSchedules?.[0]?.promptPreview).toBe(
        'run [redacted] [redacted] [redacted]',
      )
      expect(consoleState.cronSchedules?.[0]?.lastError).toBe(
        'failed [redacted] [redacted]',
      )
      expect(consoleState.memoryEntries[0]?.textPreview).toBe(
        'operator note [redacted] [redacted] [redacted]',
      )
      expect(consoleState.memoryEntries[0]?.tags).toEqual(['security [redacted]'])
      expect(serialized).not.toContain('artifactPath')
      expect(serialized).not.toContain('filePath')
      expect(serialized).not.toContain('databasePath')
      expect(serialized).not.toContain('sessionsRoot')
      expect(serialized).not.toContain('dbPath')
      expect(serialized).not.toContain('C:\\secret')
      expect(serialized).not.toContain('/tmp/mainspring')
      expect(serialized).not.toContain('/var/lib/mainspring')
      expect(serialized).not.toContain('memory-tag')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('builds a sanitized cron runtime status DTO', () => {
    expect(consoleCronRuntimeStatus({
      enabled: true,
      running: true,
      pollIntervalMs: 30000,
      lastTickAt: '2026-06-27T12:30:00.000Z',
      lastError:
        'tick failed artifactPath=C:\\secret\\cron-artifact.md databasePath=/var/lib/mainspring/gateway.sqlite',
    })).toEqual({
      enabled: true,
      running: true,
      pollIntervalMs: 30000,
      lastTickAt: '2026-06-27T12:30:00.000Z',
      lastError: 'tick failed [redacted] [redacted]',
    })
  })

  it('builds a sanitized run event DTO', () => {
    const event = consoleRunEvent({
      type: 'tool.call.updated',
      runId: 'run_1',
      sessionId: 'session_1',
      timestamp: '2026-06-27T12:30:00.000Z',
      seq: 2,
      payload: {
        toolCallId: 'tool_1',
        message:
          `warning workspaceRoot=C:\\secret\\workspace filePath=/tmp/mainspring/event.txt OPENAI_API_${'KEY'}`,
        nested: {
          paths: [
            'artifactPath=C:\\secret\\artifact.md',
            'databasePath=/var/lib/mainspring/gateway.sqlite',
            `ANTHROPIC_API_${'KEY'}`,
          ],
        },
      },
    })

    expect(event).toMatchObject({
      type: 'tool.call.updated',
      runId: 'run_1',
      sessionId: 'session_1',
      seq: 2,
      payload: {
        toolCallId: 'tool_1',
        message: 'warning [redacted] [redacted] [redacted]',
        nested: {
          paths: ['[redacted]', '[redacted]', '[redacted]'],
        },
      },
    })
    expect(JSON.stringify(event)).not.toContain('workspaceRoot')
    expect(JSON.stringify(event)).not.toContain('filePath')
    expect(JSON.stringify(event)).not.toContain('artifactPath')
    expect(JSON.stringify(event)).not.toContain('databasePath')
    expect(JSON.stringify(event)).not.toContain(`OPENAI_API_${'KEY'}`)
    expect(JSON.stringify(event)).not.toContain(`ANTHROPIC_API_${'KEY'}`)
    expect(JSON.stringify(event)).not.toContain('C:\\secret')
    expect(JSON.stringify(event)).not.toContain('/tmp/mainspring')
    expect(JSON.stringify(event)).not.toContain('/var/lib/mainspring')
  })

  it('builds a sanitized cell status DTO', () => {
    const status = consoleCellStatus({
      enabled: true,
      leaseTtlMs: 21_600_000,
      capacityEnforced: true,
      maxActiveLeasesPerCell: 1,
      cells: 1,
      leases: {
        active: 1,
        released: 0,
        expired: 0,
        total: 1,
      },
      lastCapacityBlock: {
        cellId: 'cell_1',
        workspaceId: 'workspace_acme',
        requestedComputerId: 'host filePath=C:\\secret\\cell.txt',
        backend: 'host databasePath=/var/lib/mainspring/gateway.sqlite',
        activeLeases: 1,
        maxActiveLeases: 1,
        blockedAt: '2026-06-27T12:30:00.000Z',
      },
      cellStatuses: [
        {
          cellId: 'cell_1',
          workspaceId: 'workspace_acme',
          label: 'Northline workspaceRoot=C:\\secret\\workspace',
          status: 'active',
          activeLeases: 1,
          releasedLeases: 0,
          expiredLeases: 0,
          maxActiveLeases: 1,
          capacityAvailable: 0,
          lastCapacityBlock: {
            cellId: 'cell_1',
            workspaceId: 'workspace_acme',
            requestedComputerId: 'host secretRef=env:OPENROUTER_API_KEY',
            backend: 'host artifactPath=/tmp/mainspring/cell.log',
            activeLeases: 1,
            maxActiveLeases: 1,
            blockedAt: '2026-06-27T12:30:00.000Z',
          },
        },
      ],
    })

    expect(status.cellStatuses[0]?.label).toBe('Northline [redacted]')
    expect(status.lastCapacityBlock?.requestedComputerId).toBe('host [redacted]')
    expect(status.lastCapacityBlock?.backend).toBe('host [redacted]')
    expect(status.cellStatuses[0]?.lastCapacityBlock?.requestedComputerId).toBe('host [redacted]')
    expect(status.cellStatuses[0]?.lastCapacityBlock?.backend).toBe('host [redacted]')
    expect(JSON.stringify(status)).not.toContain('secretRef')
    expect(JSON.stringify(status)).not.toContain('OPENROUTER_API_KEY')
    expect(JSON.stringify(status)).not.toContain('workspaceRoot')
    expect(JSON.stringify(status)).not.toContain('artifactPath')
    expect(JSON.stringify(status)).not.toContain('filePath')
    expect(JSON.stringify(status)).not.toContain('databasePath')
    expect(JSON.stringify(status)).not.toContain('C:\\secret')
    expect(JSON.stringify(status)).not.toContain('/tmp/mainspring')
    expect(JSON.stringify(status)).not.toContain('/var/lib/mainspring')
  })

  it('preserves sanitized budget tool-policy summaries for the console', () => {
    const consoleState = gatewaySnapshotToConsoleState({
      ...sourceSnapshot,
      budgetStatus: {
        evaluations: [
          {
            budgetId: 'budget_workspace',
            scopeType: 'workspace',
            scopeId: 'workspace_acme',
            label: 'Workspace budget',
            scopeLabel: 'Acme Workspace',
            status: 'warn',
            maxEstimatedCostUsd: 25,
            warnAtUsd: 20,
            usedEstimatedCostUsd: 21,
            remainingEstimatedCostUsd: 4,
            usageEntryCount: 2,
            pricedUsageEntryCount: 2,
            unpricedUsageEntryCount: 0,
            estimateCoverage: 'complete',
            costSensitiveTools: {
              mode: 'approval',
              reason: 'Budget warning requires review for cost-sensitive tools: Workspace budget (Acme Workspace)',
            },
          },
        ],
        blocked: 0,
        warnings: 1,
        usageStatus: sourceSnapshot.usageStatus,
      },
    })

    expect(consoleState.budgetEvaluations).toEqual([
      expect.objectContaining({
        budgetId: 'budget_workspace',
        status: 'warn',
        costSensitiveTools: {
          mode: 'approval',
          reason: 'Budget warning requires review for cost-sensitive tools: Workspace budget (Acme Workspace)',
        },
      }),
    ])
  })

  it('builds a sanitized budget status DTO', () => {
    const status = consoleBudgetStatus({
      evaluations: [
        {
          budgetId: 'budget_workspace',
          scopeType: 'workspace',
          scopeId: 'workspace_acme',
          label: 'Workspace budget workspaceRoot=C:\\secret\\workspace',
          scopeLabel: 'Acme Workspace filePath=/tmp/mainspring/scope.log',
          status: 'blocked',
          maxEstimatedCostUsd: 25,
          warnAtUsd: 20,
          usedEstimatedCostUsd: 26,
          remainingEstimatedCostUsd: -1,
          usageEntryCount: 2,
          pricedUsageEntryCount: 2,
          unpricedUsageEntryCount: 0,
          estimateCoverage: 'complete',
          costSensitiveTools: {
            mode: 'block',
            reason:
              'Budget blocked secretRef=env:OPENROUTER_API_KEY workspaceRoot=C:\\secret\\workspace filePath=/tmp/mainspring/budget.log',
          },
        },
      ],
      blocked: 1,
      warnings: 0,
      usageStatus: sourceSnapshot.usageStatus,
    })

    expect(status).toMatchObject({
      blocked: 1,
      warnings: 0,
      evaluations: [
        expect.objectContaining({
          status: 'blocked',
          label: 'Workspace budget [redacted]',
          scopeLabel: 'Acme Workspace [redacted]',
          costSensitiveTools: {
            mode: 'block',
            reason: 'Budget blocked [redacted] [redacted] [redacted]',
          },
        }),
      ],
    })
    expect(JSON.stringify(status)).not.toContain('secretRef')
    expect(JSON.stringify(status)).not.toContain('OPENROUTER_API_KEY')
    expect(JSON.stringify(status)).not.toContain('workspaceRoot')
    expect(JSON.stringify(status)).not.toContain('filePath')
    expect(JSON.stringify(status)).not.toContain('C:\\secret')
    expect(JSON.stringify(status)).not.toContain('/tmp/mainspring')
  })

  it('builds a sanitized usage status DTO', () => {
    const status = consoleUsageStatus({
      total: {
        scopeType: 'total',
        scopeId: 'total',
        scopeLabel: 'All usage workspaceRoot=C:\\secret\\workspace',
        summary: {
          entries: 1,
          pricedEntries: 1,
          unpricedEntries: 0,
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          estimatedCostUsd: 0.01,
          providers: ['openrouter secretRef=env:OPENROUTER_API_KEY'],
          models: ['model filePath=/tmp/mainspring/model.log'],
        },
      },
      clients: [],
      workspaces: [],
      agents: [],
      unpricedEntries: 0,
      pricedEntries: 1,
      estimatedCostUsd: 0.01,
    })

    expect(status.total.scopeLabel).toBe('All usage [redacted]')
    expect(status.total.summary.providers).toEqual(['openrouter [redacted]'])
    expect(status.total.summary.models).toEqual(['model [redacted]'])
    expect(JSON.stringify(status)).not.toContain('secretRef')
    expect(JSON.stringify(status)).not.toContain('OPENROUTER_API_KEY')
    expect(JSON.stringify(status)).not.toContain('workspaceRoot')
    expect(JSON.stringify(status)).not.toContain('C:\\secret')
    expect(JSON.stringify(status)).not.toContain('/tmp/mainspring')
  })

  it('builds a dedicated sanitized execution backend status summary', () => {
    const status = gatewaySnapshotToExecutionBackendStatus(sourceSnapshot)

    expect(status.defaultBackend).toBe('host')
    expect(status.backends).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'wsl',
        label: 'WSL bash',
        available: false,
        unsafe: false,
        observedCells: 1,
        activeLeases: 1,
        capabilities: expect.objectContaining({
          isolationKind: 'wsl-distro',
          networkPolicy: 'host-inherited',
        }),
        latestCell: expect.objectContaining({
          cellId: 'cell_1',
          backend: expect.objectContaining({
            backend: 'wsl',
            backendCapabilities: expect.objectContaining({
              isolationKind: 'wsl-distro',
            }),
          }),
        }),
        latestLease: expect.objectContaining({ leaseId: 'lease_1' }),
        latestSnapshot: expect.objectContaining({ snapshotId: 'cell_snapshot_1' }),
      }),
    ]))
    expect(JSON.stringify(status)).not.toContain('verificationCommand')
    expect(JSON.stringify(status)).not.toContain('C:\\')
    expect(JSON.stringify(status)).not.toContain('cell-token')
  })
})

describe('consoleMarketplaceInstall', () => {
  it('reuses the browser-safe marketplace template projection for install responses', () => {
    const installed = consoleMarketplaceInstall({
      template: {
        templateId: 'poisoned-template',
        label: `Poisoned workspaceRoot=E:/Mainspring/market-template-label OPENAI_API_${'KEY'}`,
        description:
          'Template with artifactPath=C:\\secret\\market-template.md and databasePath=/var/lib/mainspring/template.sqlite',
        trusted: true,
        provenance: 'repo-examples',
        providerId: 'openai filePath=C:\\secret\\provider.txt',
        modelId: 'gpt-5 filePath=/srv/secret/model.txt',
        runtimeProfile: 'core-browser',
        allowedTools: ['file.read', 'shell.exec filePath=C:\\secret\\market-tool.txt'],
        approvalMode: `manual OPENAI_API_${'KEY'}`,
      },
      client: {
        clientId: 'client_template',
        name: 'Template client workspaceRoot=E:/Mainspring/template-client',
        status: 'active',
        createdAt: '2026-06-27T11:00:00.000Z',
        updatedAt: '2026-06-27T11:00:01.000Z',
      },
      workspace: {
        workspaceId: 'workspace_template',
        clientId: 'client_template',
        name: 'Template workspace filePath=C:\\secret\\template-workspace.txt',
        root: 'E:/Mainspring/template-workspace',
        status: 'active',
        createdAt: '2026-06-27T11:00:00.000Z',
        updatedAt: '2026-06-27T11:00:01.000Z',
      },
      agent: {
        agentId: 'agent_template',
        clientId: 'client_template',
        workspaceId: 'workspace_template',
        name: 'Template agent artifactPath=C:\\secret\\template-agent.md',
        description: 'safe',
        status: 'active',
        runtimeProfile: 'core-browser',
        allowedTools: ['file.read'],
        createdAt: '2026-06-27T11:00:00.000Z',
        updatedAt: '2026-06-27T11:00:01.000Z',
      },
      installedFiles: ['agent.config.json'],
    })

    expect(installed.template).toMatchObject({
      templateId: 'poisoned-template',
      label: 'Poisoned [redacted] [redacted]',
      description: 'Template with [redacted] and [redacted]',
      providerId: 'openai [redacted]',
      modelId: 'gpt-5 [redacted]',
      allowedTools: ['file.read', 'shell.exec [redacted]'],
      approvalMode: 'manual [redacted]',
    })
    expect(installed.client.name).toBe('Template client [redacted]')
    expect(installed.workspace?.name).toBe('Template workspace [redacted]')
    expect(installed.agent.name).toBe('Template agent [redacted]')
    expect(JSON.stringify(installed)).not.toContain('workspaceRoot')
    expect(JSON.stringify(installed)).not.toContain('artifactPath')
    expect(JSON.stringify(installed)).not.toContain('databasePath')
    expect(JSON.stringify(installed)).not.toContain('filePath')
    expect(JSON.stringify(installed)).not.toContain('secretRef')
    expect(JSON.stringify(installed)).not.toContain(`OPENAI_API_${'KEY'}`)
    expect(JSON.stringify(installed)).not.toContain('E:/Mainspring')
    expect(JSON.stringify(installed)).not.toContain('C:\\secret')
    expect(JSON.stringify(installed)).not.toContain('/srv/secret')
  })
})
