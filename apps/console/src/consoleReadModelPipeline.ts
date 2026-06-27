import {
  type ConsoleDataSource,
  forbiddenConsoleSnapshotTokens,
} from './consoleDataSource'
import {
  type ConsoleDashboardProjection,
  projectConsoleDashboard,
} from './dashboardProjection'
import {
  type DashboardViewModel,
  type PrototypeDashboardState,
  gatewayProjectionToDashboardViewModel,
  prototypeStateToDashboardViewModel,
} from './dashboardViewModel'

export type ConsoleDashboardReadModelResult =
  | {
      kind: 'ready'
      source: 'gateway-snapshot'
      projection: ConsoleDashboardProjection
      viewModel: DashboardViewModel
    }
  | {
      kind: 'ready'
      source: 'prototype-state'
      viewModel: DashboardViewModel
    }
  | {
      kind: 'unsupported'
      source: 'prototype-localStorage'
      storageKey: string
      reason: string
    }

export interface ComposeConsoleDashboardReadModelInput {
  dataSource: ConsoleDataSource
  prototypeState?: PrototypeDashboardState
}

export function composeConsoleDashboardReadModel({
  dataSource,
  prototypeState,
}: ComposeConsoleDashboardReadModelInput): ConsoleDashboardReadModelResult {
  if (dataSource.kind === 'gateway-snapshot') {
    const projection = projectConsoleDashboard(dataSource.snapshot)
    return {
      kind: 'ready',
      source: 'gateway-snapshot',
      projection,
      viewModel: gatewayProjectionToDashboardViewModel(projection),
    }
  }

  if (prototypeState) {
    return {
      kind: 'ready',
      source: 'prototype-state',
      viewModel: prototypeStateToDashboardViewModel(prototypeState),
    }
  }

  return {
    kind: 'unsupported',
    source: 'prototype-localStorage',
    storageKey: dataSource.storageKey,
    reason: 'Prototype localStorage must be loaded by the browser UI before composing read models.',
  }
}

export function findForbiddenConsoleReadModelTokens(
  result: ConsoleDashboardReadModelResult,
  forbiddenTokens: readonly string[] = forbiddenConsoleSnapshotTokens,
): string[] {
  const serialized = JSON.stringify(result)
  return forbiddenTokens.filter((token) => serialized.includes(token))
}
