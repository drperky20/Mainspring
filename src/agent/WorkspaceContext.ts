import fs from 'node:fs'
import path from 'node:path'

export type WorkspaceEntryType = 'file' | 'directory'

export interface WorkspaceEntrySummary {
  path: string
  entryType: WorkspaceEntryType
  sizeBytes: number | null
  modifiedAt: string
}

export interface WorkspaceContextOptions {
  topLevelLimit?: number
  recentFileLimit?: number
  maxRecentScanEntries?: number
}

export interface WorkspaceContextSummary {
  rootName: string
  exists: boolean
  topLevelEntries: WorkspaceEntrySummary[]
  totalTopLevelEntries: number
  recentFiles: WorkspaceEntrySummary[]
}

function normalizeRelativePath(root: string, value: string): string {
  const relative = path.relative(root, value).replace(/\\/g, '/')
  return relative || '.'
}

function entrySummary(root: string, absolutePath: string, stats: fs.Stats): WorkspaceEntrySummary {
  return {
    path: normalizeRelativePath(root, absolutePath),
    entryType: stats.isDirectory() ? 'directory' : 'file',
    sizeBytes: stats.isFile() ? stats.size : null,
    modifiedAt: new Date(stats.mtimeMs).toISOString(),
  }
}

function walkRecentFiles(
  root: string,
  directory: string,
  results: WorkspaceEntrySummary[],
  remaining: { count: number },
): void {
  if (remaining.count <= 0) return
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (remaining.count <= 0) break
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkRecentFiles(root, absolutePath, results, remaining)
      continue
    }
    const stats = fs.statSync(absolutePath)
    results.push(entrySummary(root, absolutePath, stats))
    remaining.count -= 1
  }
}

export function buildWorkspaceContext(
  workspaceRoot: string,
  options: WorkspaceContextOptions = {},
): WorkspaceContextSummary {
  const resolvedRoot = path.resolve(workspaceRoot)
  const rootName = path.basename(resolvedRoot)
  if (!fs.existsSync(resolvedRoot)) {
    return {
      rootName,
      exists: false,
      topLevelEntries: [],
      totalTopLevelEntries: 0,
      recentFiles: [],
    }
  }

  const topLevelLimit = Math.max(1, Math.min(options.topLevelLimit ?? 12, 100))
  const recentFileLimit = Math.max(1, Math.min(options.recentFileLimit ?? 12, 100))
  const topLevelEntries = fs
    .readdirSync(resolvedRoot, { withFileTypes: true })
    .map((entry) => {
      const absolutePath = path.join(resolvedRoot, entry.name)
      return entrySummary(resolvedRoot, absolutePath, fs.statSync(absolutePath))
    })
    .sort((left, right) => left.path.localeCompare(right.path))
  const recentFiles: WorkspaceEntrySummary[] = []
  walkRecentFiles(
    resolvedRoot,
    resolvedRoot,
    recentFiles,
    { count: Math.max(recentFileLimit, options.maxRecentScanEntries ?? 64) },
  )
  recentFiles.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))

  return {
    rootName,
    exists: true,
    topLevelEntries: topLevelEntries.slice(0, topLevelLimit),
    totalTopLevelEntries: topLevelEntries.length,
    recentFiles: recentFiles.slice(0, recentFileLimit),
  }
}
