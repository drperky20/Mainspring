import { describe, expect, it } from 'vitest'
import {
  deriveAppDashboardBootstrap,
  deriveAppDashboardViewModel,
  developmentConsoleBootstrapSearchParam,
  resolveAppDashboardBootstrapMode,
} from './appDashboardBootstrap'

describe('deriveAppDashboardViewModel', () => {
  it('routes the prototype app dashboard through the selected read-model helper', () => {
    expect(
      deriveAppDashboardViewModel({
        clients: [{ id: 'client_1', name: 'Northline Dental' }],
        agents: [{ id: 'agent_1', clientId: 'client_1', name: 'Front desk assistant' }],
        providers: [{ provider: 'OpenRouter', status: 'Saved locally' }],
      }),
    ).toEqual({
      source: 'prototype-localStorage',
      providerReady: true,
      providerState: 'ready',
      clients: [
        {
          id: 'client_1',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          statusLabel: 'Ready',
          providerReady: true,
          activeRunCount: 0,
          pendingApprovalCount: 0,
        },
      ],
      statusStrip: [
        'Local account. Password required on launch.',
        'Provider ready',
        'Agent draft saved',
        'Workspace ready',
      ],
      activeRunCount: 0,
      pendingApprovalCount: 0,
    })
  })

  it('can opt into the development gateway fixture through the app bootstrap helper', () => {
    expect(
      deriveAppDashboardBootstrap({
        prototypeState: {
          clients: [],
          agents: [],
          providers: [],
        },
        mode: 'development-gateway-fixture',
      }),
    ).toMatchObject({
      source: 'gateway-snapshot',
      projection: {
        counts: {
          clientCount: 2,
          activeRunCount: 2,
        },
      },
      viewModel: {
        source: 'gateway-projection',
        providerReady: true,
        providerState: 'ready',
        activeRunCount: 2,
        pendingApprovalCount: 1,
      },
    })
  })
})

describe('resolveAppDashboardBootstrapMode', () => {
  it('defaults to the prototype flow unless an explicit non-prototype query flag is present', () => {
    expect(resolveAppDashboardBootstrapMode('')).toBeUndefined()
    expect(
      resolveAppDashboardBootstrapMode(`?${developmentConsoleBootstrapSearchParam}=prototype-localStorage`),
    ).toBeUndefined()
    expect(
      resolveAppDashboardBootstrapMode(
        `?${developmentConsoleBootstrapSearchParam}=development-gateway-fixture`,
      ),
    ).toBe('development-gateway-fixture')
    expect(
      resolveAppDashboardBootstrapMode(
        `?${developmentConsoleBootstrapSearchParam}=local-gateway-dev`,
      ),
    ).toBe('local-gateway-dev')
  })
})
