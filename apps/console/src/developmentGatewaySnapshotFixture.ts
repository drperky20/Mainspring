import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createStaticGatewaySnapshotDataSource,
  findForbiddenConsoleSnapshotTokens,
} from './consoleDataSource'
import {
  type ConsoleDashboardReadModelResult,
  composeConsoleDashboardReadModel,
} from './consoleReadModelPipeline'

export const developmentGatewaySnapshotFixture = {
  generatedAt: '2026-06-27T17:00:00.000Z',
  health: {
    ok: true,
    running: true,
    activeSessions: 2,
  },
  counts: {
    clients: 2,
    workspaces: 2,
    agents: 2,
    providerProfiles: 2,
    sessions: 2,
    runs: 3,
    storedApprovals: 0,
    artifacts: 0,
    usageLedgerEntries: 0,
    auditEvents: 0,
    memoryEntries: 0,
    pendingApprovals: 1,
  },
  clients: [
    {
      clientId: 'client_northline',
      name: 'Northline Dental',
      status: 'active',
    },
    {
      clientId: 'client_lumen',
      name: 'Lumen Repair',
      status: 'active',
    },
  ],
  workspaces: [
    {
      workspaceId: 'workspace_northline',
      clientId: 'client_northline',
      name: 'Northline Workspace',
      status: 'active',
    },
    {
      workspaceId: 'workspace_lumen',
      clientId: 'client_lumen',
      name: 'Lumen Workspace',
      status: 'active',
    },
  ],
  agents: [
    {
      agentId: 'agent_front_desk',
      workspaceId: 'workspace_northline',
      name: 'Front desk assistant',
      version: '1.0.0',
      defaultModelId: 'openrouter/auto',
      status: 'active',
    },
    {
      agentId: 'agent_repair_intake',
      workspaceId: 'workspace_lumen',
      name: 'Repair intake assistant',
      version: '1.0.0',
      defaultModelId: 'openai/gpt-4.1-mini',
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
      profileId: 'provider_profile_openai',
      providerId: 'openai',
      label: 'OpenAI',
      status: 'active',
      defaultModelId: 'gpt-4.1-mini',
      credentialState: 'configured',
    },
  ],
  sessions: [
    {
      sessionId: 'session_northline_today',
      status: 'open',
      createdAt: '2026-06-27T16:30:00.000Z',
      updatedAt: '2026-06-27T16:59:00.000Z',
    },
    {
      sessionId: 'session_lumen_today',
      status: 'open',
      createdAt: '2026-06-27T16:20:00.000Z',
      updatedAt: '2026-06-27T16:58:00.000Z',
    },
  ],
  runs: [
    {
      runId: 'run_northline_waiting',
      sessionId: 'session_northline_today',
      status: 'waiting_approval',
      workspaceId: 'workspace_northline',
      agentId: 'agent_front_desk',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T16:45:00.000Z',
      lastEventAt: '2026-06-27T16:59:00.000Z',
      eventCount: 7,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_lumen_running',
      sessionId: 'session_lumen_today',
      status: 'running',
      workspaceId: 'workspace_lumen',
      agentId: 'agent_repair_intake',
      providerProfileId: 'provider_profile_openai',
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
      createdAt: '2026-06-27T16:40:00.000Z',
      lastEventAt: '2026-06-27T16:58:00.000Z',
      eventCount: 4,
      pendingInboundCount: 0,
    },
    {
      runId: 'run_northline_done',
      sessionId: 'session_northline_today',
      status: 'completed',
      workspaceId: 'workspace_northline',
      agentId: 'agent_front_desk',
      providerProfileId: 'provider_profile_openrouter',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      createdAt: '2026-06-27T16:00:00.000Z',
      lastEventAt: '2026-06-27T16:08:00.000Z',
      eventCount: 11,
      pendingInboundCount: 0,
    },
  ],
  approvals: [
    {
      approvalId: 'approval_northline_shell',
      runId: 'run_northline_waiting',
      sessionId: 'session_northline_today',
      status: 'pending',
      requestedAt: '2026-06-27T16:59:00.000Z',
      targetKey: 'tool:shell.exec',
    },
  ],
  approvalMetadata: [],
  artifacts: [],
  usageLedger: [],
  auditEvents: [],
  memoryEntries: [],
} satisfies ConsoleGatewaySnapshot

export type DevelopmentGatewayDashboardReadModel = Extract<
  ConsoleDashboardReadModelResult,
  { kind: 'ready'; source: 'gateway-snapshot' }
>

export function createDevelopmentGatewayDashboardReadModel(): DevelopmentGatewayDashboardReadModel {
  const result = composeConsoleDashboardReadModel({
    dataSource: createStaticGatewaySnapshotDataSource(developmentGatewaySnapshotFixture),
  })
  if (result.kind !== 'ready' || result.source !== 'gateway-snapshot') {
    throw new Error('Expected the development gateway snapshot fixture to compose successfully.')
  }
  return result
}

export function findForbiddenDevelopmentGatewaySnapshotFixtureTokens(): string[] {
  return findForbiddenConsoleSnapshotTokens(developmentGatewaySnapshotFixture)
}
