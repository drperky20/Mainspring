import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import { GatewayArtifactAccess } from './GatewayArtifactAccess.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-artifact-access-'))
  tempRoots.push(root)
  return root
}

describe('GatewayArtifactAccess', () => {
  it('opens only files contained by the runtime artifact root after realpath resolution', async () => {
    const root = tempRoot()
    const artifactRoot = path.join(root, 'artifacts')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(artifactRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })
    fs.writeFileSync(path.join(artifactRoot, 'inside.md'), 'inside')
    fs.writeFileSync(path.join(outsideRoot, 'secret.md'), 'outside')

    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      store.artifacts.create({
        artifactId: 'artifact_inside',
        runId: 'run_artifact_access',
        sessionId: 'session_artifact_access',
        kind: 'report',
        path: path.join(artifactRoot, 'inside.md'),
        mediaType: 'text/markdown',
      })
      store.artifacts.create({
        artifactId: 'artifact_outside',
        runId: 'run_artifact_access',
        sessionId: 'session_artifact_access',
        kind: 'report',
        path: path.join(outsideRoot, 'secret.md'),
        mediaType: 'text/markdown',
      })

      const access = new GatewayArtifactAccess({ appState: store, rootPath: artifactRoot })
      const inside = await access.open('artifact_inside')
      expect(inside?.filePath).toBe(path.resolve(artifactRoot, 'inside.md'))
      expect(await inside?.handle.readFile('utf8')).toBe('inside')
      await inside?.handle.close()
      expect(await access.open('artifact_outside')).toBeNull()
      expect(await access.open('../artifact_outside')).toBeNull()
    } finally {
      store.close()
    }
  })

  it('rejects a junction that resolves outside the artifact root', async () => {
    const root = tempRoot()
    const artifactRoot = path.join(root, 'artifacts')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(artifactRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })
    fs.writeFileSync(path.join(outsideRoot, 'secret.md'), 'outside')
    const junctionPath = path.join(artifactRoot, 'linked')
    fs.symlinkSync(outsideRoot, junctionPath, 'junction')

    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      store.artifacts.create({
        artifactId: 'artifact_junction',
        runId: 'run_artifact_access',
        sessionId: 'session_artifact_access',
        kind: 'report',
        path: path.join(junctionPath, 'secret.md'),
      })
      const access = new GatewayArtifactAccess({ appState: store, rootPath: artifactRoot })
      expect(await access.open('artifact_junction')).toBeNull()
    } finally {
      store.close()
    }
  })
})
