import fs from 'node:fs'
import path from 'node:path'

const SESSION_META_NAME = 'mainspring-session.json'

type SessionWorkspaceMetadata = {
  workspaceRoot?: unknown
}

/**
 * Resolve the compatibility runner workspace for one mailbox session. Session
 * records created by the SDK carry an explicit workspace root. Older/channel
 * mailboxes without that record are deliberately isolated below the configured
 * default rather than sharing one mutable workspace across every session.
 */
export function resolveSessionWorkspaceRoot(input: {
  sessionId: string
  sessionPath: string
  defaultWorkspaceRoot: string
}): string {
  const fallback = path.resolve(input.defaultWorkspaceRoot, input.sessionId)
  const metadataPath = path.join(input.sessionPath, SESSION_META_NAME)
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as SessionWorkspaceMetadata
    if (typeof parsed.workspaceRoot === 'string' && parsed.workspaceRoot.trim()) {
      return path.resolve(parsed.workspaceRoot)
    }
  } catch {
    // A missing or malformed legacy session record must not collapse isolated
    // sessions back into the shared runner workspace.
  }
  return fallback
}
