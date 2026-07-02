import fs from 'node:fs'
import path from 'node:path'
import { assertPathContained } from '#protocol/node'

export interface WorkspacePathResolution {
  workspaceRoot: string
  absolutePath: string
  relativePath: string
}

export function workspaceRootRealpath(workspaceRoot: string): string {
  return fs.realpathSync.native(workspaceRoot)
}

export function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  return normalized || 'workspace'
}

export function resolveWorkspacePath(
  workspaceRoot: string,
  candidatePath: string,
): WorkspacePathResolution {
  const resolvedWorkspaceRoot = workspaceRootRealpath(workspaceRoot)
  const candidate = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(resolvedWorkspaceRoot, candidatePath)
  const absolutePath = assertPathContained(resolvedWorkspaceRoot, candidate)
  return {
    workspaceRoot: resolvedWorkspaceRoot,
    absolutePath,
    relativePath: normalizeWorkspaceRelativePath(
      path.relative(resolvedWorkspaceRoot, absolutePath),
    ),
  }
}
