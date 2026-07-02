import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCodingContext } from './CodingContext.js'
import { buildSubdirectoryHints } from './SubdirectoryHints.js'
import { buildWorkspaceContext } from './WorkspaceContext.js'

let tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots = []
})

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-workspace-context-'))
  tempRoots.push(root)
  fs.mkdirSync(path.join(root, 'src', 'agent'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'README.md'), '# test\n')
  fs.writeFileSync(path.join(root, 'src', 'agent', 'Context.ts'), 'export const value = 1\n')
  fs.writeFileSync(path.join(root, 'docs', 'notes.md'), 'notes\n')
  return root
}

describe('WorkspaceContext', () => {
  it('builds a top-level and recent-file workspace summary', () => {
    const root = makeWorkspace()
    const summary = buildWorkspaceContext(root, { topLevelLimit: 10, recentFileLimit: 10 })

    expect(summary).toMatchObject({
      rootName: path.basename(root),
      exists: true,
      totalTopLevelEntries: 3,
    })
    expect(summary.topLevelEntries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['README.md', 'docs', 'src']),
    )
    expect(summary.recentFiles.some((entry) => entry.path === 'src/agent/Context.ts')).toBe(true)
  })

  it('scores subdirectory hints from query matches and shallow paths', () => {
    const root = makeWorkspace()
    const hints = buildSubdirectoryHints(root, { query: 'agent context', limit: 5, maxDepth: 3 })

    expect(hints[0]).toMatchObject({
      path: 'src/agent',
    })
    expect(hints[0]?.score).toBeGreaterThan(0)
    expect(hints[0]?.reasons.join(' ')).toContain('query match')
  })

  it('builds a coding context with workspace summary, hints, and current file-safety rules', () => {
    const root = makeWorkspace()
    const context = buildCodingContext(root, { query: 'docs', subdirectoryLimit: 4 })

    expect(context.workspace.exists).toBe(true)
    expect(context.suggestedDirectories[0]?.path).toBe('docs')
    expect(context.fileSafety).toEqual({
      workspaceOnly: true,
      pathTraversalBlocked: true,
      absoluteEscapeBlocked: true,
      shellCwdContained: true,
    })
  })
})
