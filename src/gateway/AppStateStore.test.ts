import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EchoProvider } from '../providers/EchoProvider.js'
import { createMainspring } from '../sdk/Mainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from './index.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
  } finally {
    db.close()
  }
}

function journalMode(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const row = db.pragma('journal_mode', { simple: true })
    return String(row)
  } finally {
    db.close()
  }
}

function userVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return Number(db.pragma('user_version', { simple: true }))
  } finally {
    db.close()
  }
}

describe('SqliteLocalGatewayAppStateStore', () => {
  it('creates and reads gateway-owned app state without runtime mailbox tables', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      const client = store.clients.create({
        clientId: 'client_acme',
        name: 'Acme',
        metadata: { tier: 'pilot' },
      })
      const workspace = store.workspaces.create({
        workspaceId: 'workspace_acme',
        clientId: client.clientId,
        name: 'Acme Workspace',
        root: path.join(root, 'workspaces', 'acme'),
      })
      const agent = store.agents.create({
        agentId: 'agent_research',
        workspaceId: workspace.workspaceId,
        name: 'Research Agent',
        version: 'v2',
        defaultModelId: 'openrouter/free',
      })
      const providerProfile = store.providerProfiles.create({
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
        metadata: { suffix: '1234' },
      })
      const runMetadata = store.runs.upsert({
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: providerProfile.providerId,
        modelId: providerProfile.defaultModelId,
      })
      const approval = store.approvals.upsert({
        approvalId: 'approval_1',
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        status: 'pending',
        targetKey: 'file.write',
        metadata: { review: 'needed' },
      })
      const artifact = store.artifacts.create({
        artifactId: 'artifact_1',
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        workspaceId: workspace.workspaceId,
        kind: 'report',
        label: 'Draft report',
        path: path.join(root, 'artifacts', 'draft.md'),
        mediaType: 'text/markdown',
        sizeBytes: 128,
      })
      const usage = store.usageLedger.create({
        entryId: 'usage_1',
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        workspaceId: workspace.workspaceId,
        providerId: providerProfile.providerId,
        modelId: providerProfile.defaultModelId,
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        estimatedCostUsd: 0.0012,
      })
      const budget = store.budgets.create({
        budgetId: 'budget_workspace_acme',
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Acme workspace budget',
        maxEstimatedCostUsd: 25,
        warnAtUsd: 20,
      })
      const audit = store.auditEvents.create({
        eventId: 'audit_1',
        category: 'approval',
        action: 'requested',
        actor: 'runtime',
        targetType: 'run',
        targetId: runMetadata.runId,
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
      })
      const toolCall = store.toolCalls.upsert({
        toolCallId: 'toolcall_1',
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        toolName: 'file.write',
        status: 'completed',
        agentId: agent.agentId,
        workspaceId: workspace.workspaceId,
        outputRef: '.mainspring/tool-results/run_1/toolcall_1.json',
      })
      const deploymentTarget = store.deploymentTargets.create({
        targetId: 'target_local',
        workspaceId: workspace.workspaceId,
        label: 'Local Docker',
        kind: 'local',
        metadata: { compose: 'docker/compose.local.yml' },
      })
      const deploymentRun = store.deploymentRuns.upsert({
        deploymentRunId: 'deployrun_1',
        targetId: deploymentTarget.targetId,
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        status: 'queued',
      })
      const cell = store.cells.create({
        cellId: 'cell_1',
        workspaceId: workspace.workspaceId,
        label: 'Primary browser cell',
      })
      const lease = store.cellLeases.upsert({
        leaseId: 'lease_1',
        cellId: cell.cellId,
        runId: runMetadata.runId,
        sessionId: runMetadata.sessionId,
        status: 'active',
      })
      const snapshot = store.cellSnapshots.create({
        snapshotId: 'snapshot_1',
        cellId: cell.cellId,
        leaseId: lease.leaseId,
        label: 'Post-login snapshot',
      })
      const cronSchedule = store.cronSchedules.create({
        scheduleId: 'schedule_1',
        sessionId: 'session_1',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        label: 'Daily report',
        prompt: 'Build the morning report.',
        cronExpr: '0 9 * * 1',
        timezone: 'local',
        allowedTools: ['file.write'],
        runtimeProfile: 'core-browser-memory',
        nextRunAt: '2026-06-29T14:00:00.000Z',
      })

      expect(store.clients.get(client.clientId)).toMatchObject({
        clientId: 'client_acme',
        metadata: { tier: 'pilot' },
      })
      const updatedClient = store.clients.update({
        clientId: client.clientId,
        name: 'Acme Dental',
        status: 'archived',
        metadata: { tier: 'growth' },
      })
      expect(updatedClient).toMatchObject({
        clientId: client.clientId,
        name: 'Acme Dental',
        status: 'archived',
        metadata: { tier: 'growth' },
      })
      expect(store.clients.get(client.clientId)).toMatchObject({
        clientId: client.clientId,
        name: 'Acme Dental',
        status: 'archived',
        metadata: { tier: 'growth' },
      })
      expect(store.workspaces.list({ clientId: client.clientId })).toEqual([
        expect.objectContaining({ workspaceId: 'workspace_acme' }),
      ])
      const updatedWorkspace = store.workspaces.update({
        workspaceId: workspace.workspaceId,
        name: 'Acme Workspace West',
        root: path.join(root, 'workspaces', 'acme-west'),
        status: 'archived',
        metadata: { region: 'west' },
      })
      expect(updatedWorkspace).toMatchObject({
        workspaceId: workspace.workspaceId,
        name: 'Acme Workspace West',
        root: path.resolve(path.join(root, 'workspaces', 'acme-west')),
        status: 'archived',
        metadata: { region: 'west' },
      })
      expect(store.workspaces.get(workspace.workspaceId)).toMatchObject({
        workspaceId: workspace.workspaceId,
        name: 'Acme Workspace West',
        root: path.resolve(path.join(root, 'workspaces', 'acme-west')),
        status: 'archived',
        metadata: { region: 'west' },
      })
      expect(store.agents.list({ workspaceId: workspace.workspaceId })).toEqual([
        expect.objectContaining({ agentId: agent.agentId, defaultModelId: 'openrouter/free' }),
      ])
      const updatedAgent = store.agents.update({
        agentId: agent.agentId,
        name: 'Research Agent v2',
        version: 'v3',
        defaultModelId: 'anthropic/claude-sonnet-4',
        metadata: { instructions: 'Stay concise.' },
      })
      expect(updatedAgent).toMatchObject({
        agentId: agent.agentId,
        name: 'Research Agent v2',
        version: 'v3',
        defaultModelId: 'anthropic/claude-sonnet-4',
        metadata: { instructions: 'Stay concise.' },
      })
      expect(store.agents.get(agent.agentId)).toMatchObject({
        agentId: agent.agentId,
        name: 'Research Agent v2',
        version: 'v3',
        defaultModelId: 'anthropic/claude-sonnet-4',
        metadata: { instructions: 'Stay concise.' },
      })
      expect(store.providerProfiles.list({ providerId: 'openrouter' })).toEqual([
        expect.objectContaining({
          profileId: providerProfile.profileId,
          secretRef: 'env:OPENROUTER_API_KEY',
          defaultModelId: 'openrouter/free',
        }),
      ])
      const updatedProviderProfile = store.providerProfiles.update({
        profileId: providerProfile.profileId,
        label: 'OpenRouter Archived',
        defaultModelId: 'openrouter/sonoma',
        secretRef: 'managed:openrouter-default',
        status: 'archived',
        metadata: { suffix: '9876' },
      })
      expect(updatedProviderProfile).toMatchObject({
        profileId: providerProfile.profileId,
        label: 'OpenRouter Archived',
        defaultModelId: 'openrouter/sonoma',
        secretRef: 'managed:openrouter-default',
        status: 'archived',
        metadata: { suffix: '9876' },
      })
      expect(store.providerProfiles.get(providerProfile.profileId)).toMatchObject({
        profileId: providerProfile.profileId,
        label: 'OpenRouter Archived',
        defaultModelId: 'openrouter/sonoma',
        secretRef: 'managed:openrouter-default',
        status: 'archived',
        metadata: { suffix: '9876' },
      })
      expect(store.runs.get(runMetadata.runId)).toMatchObject({
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: 'openrouter',
        modelId: 'openrouter/free',
      })
      expect(store.runs.list({ sessionId: 'session_1' })).toEqual([
        expect.objectContaining({ runId: 'run_1' }),
      ])
      expect(store.approvals.get(approval.approvalId)).toMatchObject({
        approvalId: 'approval_1',
        status: 'pending',
        targetKey: 'file.write',
        metadata: { review: 'needed' },
      })
      expect(store.approvals.list({ runId: runMetadata.runId, status: 'pending' })).toEqual([
        expect.objectContaining({ approvalId: approval.approvalId }),
      ])
      expect(store.artifacts.list({ runId: runMetadata.runId })).toEqual([
        expect.objectContaining({ artifactId: artifact.artifactId, kind: 'report' }),
      ])
      expect(store.usageLedger.get(usage.entryId)).toMatchObject({
        entryId: 'usage_1',
        totalTokens: 165,
        estimatedCostUsd: 0.0012,
      })
      expect(store.usageLedger.list({ runId: runMetadata.runId })).toEqual([
        expect.objectContaining({ entryId: usage.entryId }),
      ])
      expect(store.budgets.get(budget.budgetId)).toMatchObject({
        budgetId: 'budget_workspace_acme',
        scopeType: 'workspace',
        scopeId: workspace.workspaceId,
        label: 'Acme workspace budget',
        maxEstimatedCostUsd: 25,
        warnAtUsd: 20,
      })
      const updatedBudget = store.budgets.update({
        budgetId: budget.budgetId,
        label: 'Acme workspace budget v2',
        maxEstimatedCostUsd: 30,
        warnAtUsd: 24,
        status: 'archived',
      })
      const authUser = store.authUsers.create({
        userId: 'auth_user_admin',
        username: 'admin',
        passwordSalt: 'salt_1',
        passwordHash: 'hash_1',
      })
      const updatedAuthUser = store.authUsers.update({
        userId: authUser.userId,
        lastLoginAt: '2026-06-28T00:00:00.000Z',
      })
      const authSession = store.authSessions.create({
        authSessionId: 'auth_session_1',
        userId: authUser.userId,
        tokenHash: 'token_hash_1',
        expiresAt: '2026-06-29T00:00:00.000Z',
      })
      const updatedAuthSession = store.authSessions.update({
        authSessionId: authSession.authSessionId,
        lastUsedAt: '2026-06-28T00:10:00.000Z',
      })
      expect(updatedBudget).toMatchObject({
        budgetId: budget.budgetId,
        label: 'Acme workspace budget v2',
        maxEstimatedCostUsd: 30,
        warnAtUsd: 24,
        status: 'archived',
      })
      expect(store.authUsers.getByUsername('ADMIN')).toMatchObject({
        userId: authUser.userId,
        username: 'admin',
      })
      expect(updatedAuthUser).toMatchObject({
        userId: authUser.userId,
        lastLoginAt: '2026-06-28T00:00:00.000Z',
      })
      expect(store.authSessions.getByTokenHash('token_hash_1')).toMatchObject({
        authSessionId: authSession.authSessionId,
        userId: authUser.userId,
      })
      expect(updatedAuthSession).toMatchObject({
        authSessionId: authSession.authSessionId,
        lastUsedAt: '2026-06-28T00:10:00.000Z',
      })
      expect(store.budgets.list({ scopeType: 'workspace', scopeId: workspace.workspaceId })).toEqual([
        expect.objectContaining({ budgetId: budget.budgetId, status: 'archived' }),
      ])
      expect(store.auditEvents.list({ category: 'approval' })).toEqual([
        expect.objectContaining({ eventId: 'audit_1', action: 'requested' }),
      ])
      expect(store.auditEvents.list({ runId: runMetadata.runId, category: 'approval' })).toEqual([
        expect.objectContaining({ eventId: audit.eventId }),
      ])
      expect(store.toolCalls.get(toolCall.toolCallId)).toMatchObject({
        toolCallId: 'toolcall_1',
        toolName: 'file.write',
        status: 'completed',
        outputRef: '.mainspring/tool-results/run_1/toolcall_1.json',
      })
      expect(store.toolCalls.list({ runId: runMetadata.runId })).toEqual([
        expect.objectContaining({ toolCallId: toolCall.toolCallId }),
      ])
      expect(store.deploymentTargets.get(deploymentTarget.targetId)).toMatchObject({
        targetId: 'target_local',
        workspaceId: workspace.workspaceId,
        label: 'Local Docker',
        kind: 'local',
        status: 'active',
        metadata: { compose: 'docker/compose.local.yml' },
      })
      const updatedTarget = store.deploymentTargets.update({
        targetId: deploymentTarget.targetId,
        label: 'Local Docker Archived',
        status: 'archived',
      })
      expect(updatedTarget).toMatchObject({
        targetId: deploymentTarget.targetId,
        label: 'Local Docker Archived',
        status: 'archived',
      })
      expect(store.deploymentRuns.get(deploymentRun.deploymentRunId)).toMatchObject({
        deploymentRunId: 'deployrun_1',
        targetId: deploymentTarget.targetId,
        status: 'queued',
      })
      expect(store.deploymentRuns.list({ targetId: deploymentTarget.targetId })).toEqual([
        expect.objectContaining({ deploymentRunId: deploymentRun.deploymentRunId }),
      ])
      expect(store.cells.get(cell.cellId)).toMatchObject({
        cellId: 'cell_1',
        workspaceId: workspace.workspaceId,
        label: 'Primary browser cell',
        status: 'active',
      })
      const updatedCell = store.cells.update({
        cellId: cell.cellId,
        label: 'Primary browser cell archived',
        status: 'archived',
      })
      expect(updatedCell).toMatchObject({
        cellId: cell.cellId,
        label: 'Primary browser cell archived',
        status: 'archived',
      })
      expect(store.cellLeases.get(lease.leaseId)).toMatchObject({
        leaseId: 'lease_1',
        cellId: cell.cellId,
        status: 'active',
      })
      expect(store.cellLeases.list({ cellId: cell.cellId })).toEqual([
        expect.objectContaining({ leaseId: lease.leaseId }),
      ])
      expect(store.cellSnapshots.get(snapshot.snapshotId)).toMatchObject({
        snapshotId: 'snapshot_1',
        cellId: cell.cellId,
        leaseId: lease.leaseId,
        label: 'Post-login snapshot',
      })
      expect(store.cellSnapshots.list({ cellId: cell.cellId })).toEqual([
        expect.objectContaining({ snapshotId: snapshot.snapshotId }),
      ])
      expect(store.cronSchedules.get(cronSchedule.scheduleId)).toMatchObject({
        scheduleId: 'schedule_1',
        sessionId: 'session_1',
        cronExpr: '0 9 * * 1',
        allowedTools: ['file.write'],
        runtimeProfile: 'core-browser-memory',
        nextRunAt: '2026-06-29T14:00:00.000Z',
      })
      expect(store.cronSchedules.list({ enabled: true })).toEqual([
        expect.objectContaining({ scheduleId: cronSchedule.scheduleId }),
      ])

      const tables = tableNames(store.dbPath)
      expect(tables).toEqual([
        'gateway_agents',
        'gateway_approvals',
        'gateway_artifacts',
        'gateway_audit_events',
        'gateway_auth_sessions',
        'gateway_auth_users',
        'gateway_budgets',
        'gateway_cell_leases',
        'gateway_cell_snapshots',
        'gateway_cells',
        'gateway_clients',
        'gateway_cron_schedules',
        'gateway_deployment_runs',
        'gateway_deployment_targets',
        'gateway_provider_profiles',
        'gateway_runs',
        'gateway_schema_meta',
        'gateway_tool_calls',
        'gateway_usage_ledger_entries',
        'gateway_workspaces',
      ])
      expect(tables).not.toContain('messages_in')
      expect(tables).not.toContain('events_out')
      expect(journalMode(store.dbPath).toLowerCase()).toBe('wal')
      expect(store.schemaVersion).toBe(6)
      expect(userVersion(store.dbPath)).toBe(6)
    } finally {
      store.close()
    }
  })

  it('keeps same-tick audit authority rows in durable insertion order', () => {
    const root = makeTempRoot('mainspring-gateway-audit-order-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      const authorized = store.auditEvents.create({
        eventId: 'audit_order_authorized',
        category: 'gateway',
        action: 'run.enqueued.authorized',
        actor: 'local-gateway',
        targetType: 'run-request',
        targetId: 'session_audit_order',
      })
      const outcome = store.auditEvents.create({
        eventId: 'audit_order_outcome',
        category: 'gateway',
        action: 'run.enqueued',
        actor: 'local-gateway',
        targetType: 'run',
        targetId: 'run_audit_order',
        runId: 'run_audit_order',
      })
      expect(Date.parse(outcome.createdAt)).toBeGreaterThan(Date.parse(authorized.createdAt))
      expect(store.auditEvents.list({ category: 'gateway' }).map((event) => event.action)).toEqual([
        'run.enqueued.authorized',
        'run.enqueued',
      ])
    } finally {
      store.close()
    }
  })

  it('rejects raw provider secrets in secret refs and provider profile metadata', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-secrets-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      expect(() =>
        store.providerProfiles.create({
          providerId: 'openrouter',
          label: 'Raw Key',
          secretRef: 'sk-ant-raw-secret123456',
        }),
      ).toThrow('Runtime secret references must be opaque')

      expect(() =>
        store.providerProfiles.create({
          providerId: 'openrouter',
          label: 'Metadata Leak',
          secretRef: 'env:OPENROUTER_API_KEY',
          metadata: { apiKey: 'sk-ant-raw-secret123456' },
        }),
      ).toThrow('raw secret material')

      expect(store.providerProfiles.list()).toEqual([])
    } finally {
      store.close()
    }
  })

  it('stores managed provider secrets encrypted and resolves them without exposing raw values', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-managed-secrets-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      const profile = store.providerProfiles.create({
        profileId: 'provider_profile_managed',
        providerId: 'openrouter',
        label: 'Managed OpenRouter',
        secretValue: 'sk-managed-secret-value',
      })

      expect(profile).toMatchObject({
        profileId: 'provider_profile_managed',
        secretRef: 'managed:provider_profile_managed',
        managedSecretStored: true,
      })
      expect(store.providerProfiles.get(profile.profileId)).toMatchObject({
        secretRef: 'managed:provider_profile_managed',
        managedSecretStored: true,
      })
      expect(JSON.stringify(store.providerProfiles.list())).not.toContain('sk-managed-secret-value')
      expect(store.resolveSecretRef('managed:provider_profile_managed')).toBe(
        'sk-managed-secret-value',
      )

      const db = new Database(store.dbPath, { readonly: true, fileMustExist: true })
      try {
        const row = db
          .prepare(
            `SELECT secret_ref, managed_secret_ciphertext, managed_secret_iv, managed_secret_auth_tag
             FROM gateway_provider_profiles
             WHERE profile_id = ?`,
          )
          .get(profile.profileId) as {
            secret_ref: string
            managed_secret_ciphertext: string | null
            managed_secret_iv: string | null
            managed_secret_auth_tag: string | null
          }
        expect(row.secret_ref).toBe('managed:provider_profile_managed')
        expect(row.managed_secret_ciphertext).toBeTruthy()
        expect(row.managed_secret_iv).toBeTruthy()
        expect(row.managed_secret_auth_tag).toBeTruthy()
        expect(JSON.stringify(row)).not.toContain('sk-managed-secret-value')
      } finally {
        db.close()
      }
    } finally {
      store.close()
    }
  })

  it('rejects raw secret material in expanded gateway metadata surfaces', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-expanded-secrets-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      expect(() =>
        store.approvals.upsert({
          approvalId: 'approval_1',
          runId: 'run_1',
          sessionId: 'session_1',
          status: 'pending',
          metadata: { token: 'sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.artifacts.create({
          runId: 'run_1',
          sessionId: 'session_1',
          kind: 'report',
          path: path.join(root, 'artifact.txt'),
          metadata: { authorization: 'Bearer sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.usageLedger.create({
          runId: 'run_1',
          sessionId: 'session_1',
          metadata: { apiKey: 'sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.auditEvents.create({
          category: 'security',
          action: 'logged',
          actor: 'runtime',
          targetType: 'run',
          targetId: 'run_1',
          metadata: { password: 'sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.toolCalls.upsert({
          toolCallId: 'toolcall_secret',
          runId: 'run_1',
          sessionId: 'session_1',
          toolName: 'shell.exec',
          status: 'failed',
          metadata: { token: 'sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.deploymentTargets.create({
          label: 'Leaky Target',
          kind: 'local',
          metadata: { authorization: 'Bearer sk-or-secret' },
        }),
      ).toThrow('raw secret material')

      expect(() =>
        store.cells.create({
          label: 'Leaky Cell',
          metadata: { apiKey: 'sk-or-secret' },
        }),
      ).toThrow('raw secret material')
    } finally {
      store.close()
    }
  })

  it('keeps schema migration idempotent across reopen', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-reopen-')
    const dbPath = path.join(root, 'gateway-app.sqlite')
    const first = createSqliteLocalGatewayAppStateStore({ dbPath })
    first.clients.create({ clientId: 'client_1', name: 'Client One' })
    first.close()

    const second = createSqliteLocalGatewayAppStateStore({ dbPath })
    try {
      expect(second.clients.list()).toEqual([expect.objectContaining({ clientId: 'client_1' })])
      expect(tableNames(dbPath)).toContain('gateway_usage_ledger_entries')
      expect(tableNames(dbPath)).toContain('gateway_audit_events')
      expect(tableNames(dbPath)).toContain('gateway_tool_calls')
      expect(tableNames(dbPath)).toContain('gateway_deployment_targets')
      expect(tableNames(dbPath)).toContain('gateway_cells')
      expect(tableNames(dbPath)).toContain('gateway_budgets')
      expect(tableNames(dbPath)).toContain('gateway_auth_users')
      expect(tableNames(dbPath)).toContain('gateway_auth_sessions')
      expect(userVersion(dbPath)).toBe(6)
      expect(second.schemaVersion).toBe(6)
    } finally {
      second.close()
    }
  })

  it('can be attached to the local gateway without changing runtime session storage', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-boundary-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(sessionsRoot, { recursive: true })
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    try {
      const client = gateway.appState?.clients.create({ name: 'Client One' })
      const session = mainspring.sessions.create({
        sessionId: 'runtime-session',
        workspace: { root: workspaceRoot },
      })

      expect(client?.clientId).toMatch(/^client_/)
      expect(gateway.sessions.list()).toEqual([
        expect.objectContaining({ sessionId: session.record.sessionId }),
      ])
      expect(gateway.appState?.clients.list()).toHaveLength(1)
      expect(fs.existsSync(path.join(session.record.sessionPath, 'mainspring-session.json'))).toBe(
        true,
      )
      expect(tableNames(appState.dbPath)).not.toContain('messages_in')
    } finally {
      appState.close()
    }
  })
})
