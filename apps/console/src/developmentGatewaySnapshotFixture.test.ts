import { describe, expect, it } from 'vitest'
import { findForbiddenConsoleReadModelTokens } from './consoleReadModelPipeline'
import {
  createDevelopmentGatewayDashboardReadModel,
  developmentGatewaySnapshotFixture,
  findForbiddenDevelopmentGatewaySnapshotFixtureTokens,
} from './developmentGatewaySnapshotFixture'

describe('developmentGatewaySnapshotFixture', () => {
  it('exports a safe static gateway snapshot fixture', () => {
    expect(developmentGatewaySnapshotFixture.counts).toEqual({
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
    })
    expect(findForbiddenDevelopmentGatewaySnapshotFixtureTokens()).toEqual([])

    const serialized = JSON.stringify(developmentGatewaySnapshotFixture)
    expect(serialized).not.toContain('localStorage')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('C:\\')
  })

  it('exercises the pure read-model pipeline without live transport', () => {
    const result = createDevelopmentGatewayDashboardReadModel()

    expect(result.projection).toMatchObject({
      providerReady: true,
      counts: {
        clientCount: 2,
        activeRunCount: 2,
        pendingApprovalCount: 1,
      },
    })
    expect(result.projection.clients).toEqual([
      expect.objectContaining({
        clientId: 'client_northline',
        status: 'needs-approval',
        activeRunCount: 1,
        pendingApprovalCount: 1,
      }),
      expect.objectContaining({
        clientId: 'client_lumen',
        status: 'running',
        activeRunCount: 1,
        pendingApprovalCount: 0,
      }),
    ])
    expect(result.viewModel).toMatchObject({
      source: 'gateway-projection',
      providerReady: true,
      activeRunCount: 2,
      pendingApprovalCount: 1,
      statusStrip: ['2 clients', 'Provider ready', '2 active runs', '0 usage entries | 0 artifacts'],
    })
    expect(result.viewModel.clients).toEqual([
      expect.objectContaining({
        id: 'client_northline',
        subtitle: 'Front desk assistant',
        activeRunSummary: 'OpenRouter | anthropic/claude-sonnet-4',
        statusLabel: 'Approval needed - OpenRouter',
      }),
      expect.objectContaining({
        id: 'client_lumen',
        subtitle: 'Repair intake assistant',
        activeRunSummary: 'OpenAI | gpt-4.1-mini',
        statusLabel: 'Running - OpenAI',
      }),
    ])
    expect(findForbiddenConsoleReadModelTokens(result)).toEqual([])
  })
})
