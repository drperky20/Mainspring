import { describe, expect, it } from 'vitest'
import { prototypeConsoleStorageKey } from './consoleDataSource'
import {
  composeSelectedConsoleDashboardReadModel,
} from './selectedConsoleReadModel'

describe('composeSelectedConsoleDashboardReadModel', () => {
  it('keeps prototype localStorage as the default selection and returns the explicit unsupported result without prototype state', () => {
    expect(composeSelectedConsoleDashboardReadModel()).toEqual({
      kind: 'unsupported',
      source: 'prototype-localStorage',
      storageKey: prototypeConsoleStorageKey,
      reason: 'Prototype localStorage must be loaded by the browser UI before composing read models.',
    })
  })

  it('can compose caller-supplied prototype state through the default selection path', () => {
    expect(
      composeSelectedConsoleDashboardReadModel({
        prototypeState: {
          clients: [{ id: 'client_1', name: 'Northline Dental' }],
          agents: [{ id: 'agent_1', clientId: 'client_1', name: 'Front desk assistant' }],
          providers: [{ provider: 'OpenRouter', status: 'Saved locally' }],
        },
      }),
    ).toEqual({
      kind: 'ready',
      source: 'prototype-state',
      viewModel: {
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
      },
    })
  })

  it('can opt into the development fixture and compose a gateway dashboard read model in one call', () => {
    const result = composeSelectedConsoleDashboardReadModel({
      mode: 'development-gateway-fixture',
    })

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready' || result.source !== 'gateway-snapshot') {
      throw new Error('Expected the development fixture selector to compose into a gateway read model.')
    }

    expect(result.projection.counts).toMatchObject({
      clientCount: 2,
      activeRunCount: 2,
      pendingApprovalCount: 1,
    })
    expect(result.viewModel).toMatchObject({
      source: 'gateway-projection',
      providerReady: true,
      providerState: 'ready',
      activeRunCount: 2,
      pendingApprovalCount: 1,
    })
  })
})
