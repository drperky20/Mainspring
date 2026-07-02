import fs from 'node:fs'
import path from 'node:path'

export interface SubdirectoryHintsOptions {
  query?: string
  limit?: number
  maxDepth?: number
}

export interface SubdirectoryHint {
  path: string
  score: number
  reasons: string[]
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

function collectDirectories(
  root: string,
  directory: string,
  depth: number,
  maxDepth: number,
  results: string[],
): void {
  if (depth > maxDepth) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue
    const absolutePath = path.join(directory, entry.name)
    results.push(path.relative(root, absolutePath).replace(/\\/g, '/'))
    collectDirectories(root, absolutePath, depth + 1, maxDepth, results)
  }
}

export function buildSubdirectoryHints(
  workspaceRoot: string,
  options: SubdirectoryHintsOptions = {},
): SubdirectoryHint[] {
  const resolvedRoot = path.resolve(workspaceRoot)
  if (!fs.existsSync(resolvedRoot)) return []

  const directories: string[] = []
  collectDirectories(resolvedRoot, resolvedRoot, 1, Math.max(1, options.maxDepth ?? 2), directories)
  const queryTokens = tokenize(options.query ?? '')
  const limit = Math.max(1, Math.min(options.limit ?? 8, 50))

  return directories
    .map((relativePath) => {
      const reasons: string[] = []
      let score = 0
      const segments = tokenize(relativePath)
      if (relativePath.split('/').length === 1) {
        score += 2
        reasons.push('shallow path')
      }
      if (queryTokens.length > 0) {
        const matches = queryTokens.filter((token) =>
          segments.some((segment) => segment.includes(token)),
        )
        if (matches.length > 0) {
          score += matches.length * 4
          reasons.push(`query match: ${matches.join(', ')}`)
        }
      }
      try {
        const stats = fs.statSync(path.join(resolvedRoot, relativePath))
        const ageHours = (Date.now() - stats.mtimeMs) / 3_600_000
        if (ageHours < 24) {
          score += 2
          reasons.push('recently modified')
        }
      } catch {
        // ignore stale race
      }
      return { path: relativePath, score, reasons: reasons.length > 0 ? reasons : ['discovered directory'] }
    })
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit)
}
