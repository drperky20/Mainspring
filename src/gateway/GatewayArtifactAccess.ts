import fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayArtifactRecord,
} from './AppStateStore.js'

export interface LocalGatewayArtifactFile {
  artifact: LocalGatewayArtifactRecord
  filePath: string
  sizeBytes: number
  handle: FileHandle
}

function pathWithin(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function artifactId(value: string): string | null {
  const normalized = value.trim()
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalized) ? normalized : null
}

/**
 * Owns the host-side artifact file boundary. Artifact inventory rows are
 * projections, not trusted file grants: before a browser download is opened,
 * the persisted path must remain inside the runtime artifact root after
 * symlink resolution, and the file is opened before the path leaves this
 * process. The file handle prevents a path swap between validation and read.
 */
export class GatewayArtifactAccess {
  constructor(
    private readonly options: {
      appState: Pick<LocalGatewayAppStateStore, 'artifacts'>
      rootPath: string
    },
  ) {}

  async open(artifactIdInput: string): Promise<LocalGatewayArtifactFile | null> {
    const normalizedArtifactId = artifactId(artifactIdInput)
    if (!normalizedArtifactId) return null

    const artifact = this.options.appState.artifacts.get(normalizedArtifactId)
    if (!artifact) return null

    const configuredRootPath = path.resolve(this.options.rootPath)
    const rootPath = await fs.promises.realpath(configuredRootPath).catch(() => null)
    if (!rootPath) return null

    const candidatePath = path.resolve(artifact.path)
    if (!pathWithin(configuredRootPath, candidatePath)) return null

    const resolvedPath = await fs.promises.realpath(candidatePath).catch(() => null)
    if (!resolvedPath || !pathWithin(rootPath, resolvedPath)) return null

    let handle: FileHandle | undefined
    try {
      handle = await fs.promises.open(resolvedPath, 'r')
      const stat = await handle.stat()
      if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) {
        await handle.close()
        return null
      }
      return {
        artifact,
        // Keep the persisted, user-facing path shape stable while the handle
        // is opened through the canonical path used for the containment check.
        filePath: candidatePath,
        sizeBytes: stat.size,
        handle,
      }
    } catch {
      await handle?.close().catch(() => undefined)
      return null
    }
  }
}
