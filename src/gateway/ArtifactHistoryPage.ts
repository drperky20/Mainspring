import {
  consoleArtifact,
  type ConsoleGatewayArtifact,
} from './ConsoleSnapshotAdapter.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayArtifactCursor,
} from './AppStateStore.js'

export type ArtifactHistoryPageSource = {
  artifacts: Pick<LocalGatewayAppStateStore['artifacts'], 'list'>
}

export type ArtifactHistoryPage = {
  artifacts: ConsoleGatewayArtifact[]
  nextCursor?: LocalGatewayArtifactCursor
}

/**
 * Bounded browser-safe artifact inventory. Artifact bytes remain available only
 * through the existing browser-access route; this page deliberately exposes
 * no filesystem paths or persistence metadata.
 */
export function listArtifactHistoryPage(input: {
  source: ArtifactHistoryPageSource
  limit: number
  before?: LocalGatewayArtifactCursor
}): ArtifactHistoryPage {
  const records = input.source.artifacts.list({
    ...(input.before ? { before: input.before } : {}),
    limit: input.limit + 1,
    order: 'desc',
  })
  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  const last = page.at(-1)
  return {
    artifacts: page.map(consoleArtifact),
    ...(hasMore && last
      ? { nextCursor: { createdAt: last.createdAt, artifactId: last.artifactId } }
      : {}),
  }
}
