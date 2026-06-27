import {
  type ConsoleDataSource,
  createStaticGatewaySnapshotDataSource,
  prototypeConsoleDataSource,
} from './consoleDataSource'
import { developmentGatewaySnapshotFixture } from './developmentGatewaySnapshotFixture'

export type ConsoleDataSourceSelectorMode =
  | 'prototype-localStorage'
  | 'development-gateway-fixture'
  | 'local-gateway-dev'

export interface SelectConsoleDataSourceInput {
  mode?: ConsoleDataSourceSelectorMode
}

export function selectConsoleDataSource(
  input: SelectConsoleDataSourceInput = {},
): ConsoleDataSource {
  if (input.mode === 'development-gateway-fixture') {
    return createStaticGatewaySnapshotDataSource(developmentGatewaySnapshotFixture)
  }

  return prototypeConsoleDataSource
}
