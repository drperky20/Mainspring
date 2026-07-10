import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveSessionWorkspaceRoot } from './SessionWorkspace.js'

const roots: string[] = []

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-session-workspace-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('resolveSessionWorkspaceRoot', () => {
  it('uses the persisted SDK workspace root for a session', () => {
    const root = tempRoot()
    const sessionPath = path.join(root, 'sessions', 'alpha')
    const workspaceRoot = path.join(root, 'client-a')
    fs.mkdirSync(sessionPath, { recursive: true })
    fs.writeFileSync(
      path.join(sessionPath, 'mainspring-session.json'),
      JSON.stringify({ workspaceRoot }),
    )

    expect(resolveSessionWorkspaceRoot({
      sessionId: 'alpha',
      sessionPath,
      defaultWorkspaceRoot: path.join(root, 'workspaces'),
    })).toBe(path.resolve(workspaceRoot))
  })

  it('isolates metadata-free and malformed sessions under the configured root', () => {
    const root = tempRoot()
    const defaultWorkspaceRoot = path.join(root, 'workspaces')
    const sessionPath = path.join(root, 'sessions', 'beta')
    fs.mkdirSync(sessionPath, { recursive: true })

    expect(resolveSessionWorkspaceRoot({ sessionId: 'beta', sessionPath, defaultWorkspaceRoot }))
      .toBe(path.join(defaultWorkspaceRoot, 'beta'))

    fs.writeFileSync(path.join(sessionPath, 'mainspring-session.json'), '{not-json')
    expect(resolveSessionWorkspaceRoot({ sessionId: 'beta', sessionPath, defaultWorkspaceRoot }))
      .toBe(path.join(defaultWorkspaceRoot, 'beta'))
  })
})
