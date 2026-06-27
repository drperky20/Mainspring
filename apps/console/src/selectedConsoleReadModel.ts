import { type PrototypeDashboardState } from './dashboardViewModel'
import {
  type ConsoleDataSourceSelectorMode,
  selectConsoleDataSource,
} from './consoleDataSourceSelector'
import {
  type ConsoleDashboardReadModelResult,
  composeConsoleDashboardReadModel,
} from './consoleReadModelPipeline'

export interface ComposeSelectedConsoleDashboardReadModelInput {
  mode?: ConsoleDataSourceSelectorMode
  prototypeState?: PrototypeDashboardState
}

export function composeSelectedConsoleDashboardReadModel(
  input: ComposeSelectedConsoleDashboardReadModelInput = {},
): ConsoleDashboardReadModelResult {
  return composeConsoleDashboardReadModel({
    dataSource: selectConsoleDataSource({ mode: input.mode }),
    prototypeState: input.prototypeState,
  })
}
