import {
  type DashboardViewModel,
  type PrototypeDashboardState,
} from './dashboardViewModel'
import { composeSelectedConsoleDashboardReadModel } from './selectedConsoleReadModel'
import { type ConsoleDataSourceSelectorMode } from './consoleDataSourceSelector'
import type { ConsoleDashboardProjection } from './dashboardProjection'

export const developmentConsoleBootstrapSearchParam = 'mainspringConsoleSource'

export type AppDashboardBootstrapResult =
  | {
      source: 'prototype-state'
      viewModel: DashboardViewModel
    }
  | {
      source: 'gateway-snapshot'
      viewModel: DashboardViewModel
      projection: ConsoleDashboardProjection
    }

export interface DeriveAppDashboardBootstrapInput {
  prototypeState: PrototypeDashboardState
  mode?: ConsoleDataSourceSelectorMode
}

function isExplicitConsoleMode(value: string | null | undefined): value is ConsoleDataSourceSelectorMode {
  return (
    value === 'development-gateway-fixture' ||
    value === 'local-gateway-dev' ||
    value === 'prototype-localStorage'
  )
}

export function resolveAppDashboardBootstrapMode(
  search: string,
  configuredMode?: string,
): ConsoleDataSourceSelectorMode | undefined {
  const value = new URLSearchParams(search).get(developmentConsoleBootstrapSearchParam)
  if (isExplicitConsoleMode(value)) {
    return value === 'prototype-localStorage' ? undefined : value
  }

  if (isExplicitConsoleMode(configuredMode)) {
    return configuredMode === 'prototype-localStorage' ? undefined : configuredMode
  }

  return undefined
}

export function deriveAppDashboardBootstrap({
  prototypeState,
  mode,
}: DeriveAppDashboardBootstrapInput): AppDashboardBootstrapResult {
  const result = composeSelectedConsoleDashboardReadModel({
    mode,
    prototypeState,
  })

  if (result.kind === 'ready' && result.source === 'prototype-state') {
    return {
      source: 'prototype-state',
      viewModel: result.viewModel,
    }
  }

  if (result.kind === 'ready' && result.source === 'gateway-snapshot') {
    return {
      source: 'gateway-snapshot',
      viewModel: result.viewModel,
      projection: result.projection,
    }
  }

  throw new Error(
    'App dashboard bootstrap expects either caller-supplied prototype state or the explicit development gateway fixture mode.',
  )
}

export function deriveAppDashboardViewModel(
  prototypeState: PrototypeDashboardState,
  mode?: ConsoleDataSourceSelectorMode,
): DashboardViewModel {
  return deriveAppDashboardBootstrap({
    prototypeState,
    mode,
  }).viewModel
}
