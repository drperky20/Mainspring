import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemoryScreen } from './OperatorConsoleScreens'

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
