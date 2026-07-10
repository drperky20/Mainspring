import { describe, expect, it } from 'vitest'
import type { LocalGatewayArtifactRecord } from './AppStateStore.js'
import { listArtifactHistoryPage } from './ArtifactHistoryPage.js'

function artifact(artifactId: string, createdAt: string): LocalGatewayArtifactRecord {
  return {
    artifactId,
    runId: `run_${artifactId}`,
    sessionId: 'session_artifact_history',
    workspaceId: 'workspace_artifact_history',
    kind: 'report',
    label: `Artifact ${artifactId}`,
    path: `C:/private/artifacts/${artifactId}.md`,
    mediaType: 'text/markdown',
    sizeBytes: 128,
    createdAt,
    metadata: { privateStoragePath: 'must-not-cross-the-browser-boundary' },
  }
}

describe('listArtifactHistoryPage', () => {
  it('uses a stable reverse cursor and omits paths and metadata from browser rows', () => {
    const records = [
      artifact('artifact_newest', '2026-07-10T12:03:00.000Z'),
      artifact('artifact_middle', '2026-07-10T12:02:00.000Z'),
      artifact('artifact_oldest', '2026-07-10T12:01:00.000Z'),
    ]
    const listCalls: Array<Record<string, unknown>> = []
    const source = {
      artifacts: {
        list: (input: { before?: { createdAt: string; artifactId: string }; limit?: number } = {}) => {
          listCalls.push(input)
          return records
            .filter((record) => !input.before
              || record.createdAt < input.before.createdAt
              || (
                record.createdAt === input.before.createdAt
                && record.artifactId < input.before.artifactId
              ))
            .slice(0, input.limit)
        },
      },
    }

    const first = listArtifactHistoryPage({ source, limit: 2 })
    expect(first.artifacts.map((record) => record.artifactId)).toEqual(['artifact_newest', 'artifact_middle'])
    expect(first.nextCursor).toEqual({
      createdAt: '2026-07-10T12:02:00.000Z',
      artifactId: 'artifact_middle',
    })
    expect(listCalls).toEqual([{ limit: 3, order: 'desc' }])
    expect(JSON.stringify(first)).not.toContain('privateStoragePath')
    expect(JSON.stringify(first)).not.toContain('C:/private/artifacts')

    const second = listArtifactHistoryPage({
      source,
      limit: 2,
      before: first.nextCursor,
    })
    expect(second.artifacts.map((record) => record.artifactId)).toEqual(['artifact_oldest'])
    expect(second.nextCursor).toBeUndefined()
  })
})
