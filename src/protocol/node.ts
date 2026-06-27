import fs from 'node:fs'
import path from 'node:path'
import {
  resolveComputerSessionMailboxPaths,
  resolveSessionMailboxPaths,
  type ComputerSessionMailboxPaths,
  type SessionMailboxPaths,
} from './index.js'

export function assertPathContained(root: string, candidate: string): string {
  const resolvedRoot = realpathForContainment(root)
  const resolvedCandidate = realpathForContainment(candidate)
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedCandidate
  }
  throw new Error(`Path escapes root: ${candidate}`)
}

function realpathForContainment(value: string): string {
  const resolved = path.resolve(value)
  if (fs.existsSync(resolved)) {
    return fs.realpathSync.native(resolved)
  }

  const missingSegments: string[] = []
  let current = resolved
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      return resolved
    }
    missingSegments.unshift(path.basename(current))
    current = parent
  }

  return path.join(fs.realpathSync.native(current), ...missingSegments)
}

export function resolveContainedComputerSessionMailboxPaths(
  computerRoot: string,
  sessionId: string,
): ComputerSessionMailboxPaths {
  const paths = resolveComputerSessionMailboxPaths(computerRoot, sessionId)
  const sessionsRoot = assertPathContained(computerRoot, paths.sessionsRoot)
  const sessionPath = assertPathContained(sessionsRoot, paths.sessionPath)
  const sessionPaths = resolveContainedSessionMailboxPathsFromPath(sessionPath)

  return {
    computerRoot,
    sessionsRoot,
    ...sessionPaths,
  }
}

export function resolveContainedSessionMailboxPaths(
  sessionsRoot: string,
  sessionId: string,
): SessionMailboxPaths {
  const sessionPath = assertPathContained(sessionsRoot, path.join(sessionsRoot, sessionId))
  return resolveContainedSessionMailboxPathsFromPath(sessionPath)
}

function resolveContainedSessionMailboxPathsFromPath(sessionPath: string): SessionMailboxPaths {
  const paths = resolveSessionMailboxPaths(sessionPath)

  return {
    sessionPath,
    inboundDbPath: assertPathContained(sessionPath, paths.inboundDbPath),
    outboundDbPath: assertPathContained(sessionPath, paths.outboundDbPath),
    eventsDbPath: assertPathContained(sessionPath, paths.eventsDbPath),
    heartbeatPath: assertPathContained(sessionPath, paths.heartbeatPath),
    inboxPath: assertPathContained(sessionPath, paths.inboxPath),
    outboxPath: assertPathContained(sessionPath, paths.outboxPath),
  }
}
