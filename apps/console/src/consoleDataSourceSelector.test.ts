import { describe, expect, it } from 'vitest'
import { composeConsoleDashboardReadModel } from './consoleReadModelPipeline'
import { prototypeConsoleDataSource } from './consoleDataSource'
import { developmentGatewaySnapshotFixture } from './developmentGatewaySnapshotFixture'
import { selectConsoleDataSource } from './consoleDataSourceSelector'

describe('selectConsoleDataSource', () => {
  it('defaults to the prototype localStorage source', () => {
    expect(selectConsoleDataSource()).toEqual(prototypeConsoleDataSource)
    expect(selectConsoleDataSource({ mode: 'prototype-localStorage' })).toEqual(
      prototypeConsoleDataSource,
    )
  })

  it('only opts into the development gateway fixture when explicitly requested', () => {
    expect(selectConsoleDataSource({ mode: 'development-gateway-fixture' })).toEqual({
      kind: 'gateway-snapshot',
      snapshot: developmentGatewaySnapshotFixture,
    })
  })

  it('lets the fixture mode compose through the safe read-model pipeline', () => {
    const result = composeConsoleDashboardReadModel({
      dataSource: selectConsoleDataSource({ mode: 'development-gateway-fixture' }),
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
      activeRunCount: 2,
      pendingApprovalCount: 1,
    })
  })
})
