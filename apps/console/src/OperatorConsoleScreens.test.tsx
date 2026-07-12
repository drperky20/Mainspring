import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ArtifactsScreen, MemoryScreen } from './OperatorConsoleScreens'

describe('MemoryScreen', () => {
  it('offers explicit correction and deletion controls only for a selected workspace', () => {
    const entry = {
      entryId: 'memory_opaque_1',
      workspaceId: 'workspace_1',
      scope: 'workspace' as const,
      textPreview: 'Review the weekly intake handoff.',
      tags: ['weekly'],
      createdAt: '2026-07-10T12:00:00.000Z',
    }
    const mutableMarkup = renderToStaticMarkup(
      <MemoryScreen
        entries={[entry]}
        workspaceId="workspace_1"
        workspaceName="Northline"
        onCorrect={() => undefined}
        onDelete={() => undefined}
      />,
    )
    const readOnlyMarkup = renderToStaticMarkup(
      <MemoryScreen entries={[entry]} workspaceName="Northline" />,
    )

    expect(mutableMarkup).toContain('Correct')
    expect(mutableMarkup).toContain('Delete')
    expect(mutableMarkup).toContain('Review the weekly intake handoff.')
    expect(readOnlyMarkup).not.toContain('>Correct<')
    expect(readOnlyMarkup).not.toContain('>Delete<')
  })
})

describe('ArtifactsScreen', () => {
  it('renders media-aware preview and download controls without host paths', () => {
    const markup = renderToStaticMarkup(
      <ArtifactsScreen
        artifacts={[{
          artifactId: 'artifact_report',
          runId: 'run_report',
          sessionId: 'session_report',
          kind: 'report',
          label: 'Weekly report',
          mediaType: 'text/markdown',
          sizeBytes: 128,
          createdAt: '2026-07-12T00:00:00.000Z',
        }]}
        onOpenArtifact={() => undefined}
      />,
    )

    expect(markup).toContain('Preview document')
    expect(markup).toContain('Download')
    expect(markup).not.toContain('filePath')
    expect(markup).not.toContain('workspaceRoot')
  })
})
