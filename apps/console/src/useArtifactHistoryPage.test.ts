import { describe, expect, it } from 'vitest'
import { appendArtifactHistoryPage } from './useArtifactHistoryPage'

describe('appendArtifactHistoryPage', () => {
  it('preserves reverse page order while suppressing duplicate artifact rows', () => {
    const first = [{ artifactId: 'artifact_3' }, { artifactId: 'artifact_2' }] as never[]
    const second = [{ artifactId: 'artifact_2' }, { artifactId: 'artifact_1' }] as never[]

    expect(appendArtifactHistoryPage(first, second).map((artifact) => artifact.artifactId)).toEqual([
      'artifact_3',
      'artifact_2',
      'artifact_1',
    ])
  })
})
