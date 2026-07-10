import fs from 'node:fs'
import type { MainspringSessionRecord } from '../contracts/runtime.js'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayRunListCursor,
  LocalGatewayRunMetadataRecord,
} from './AppStateStore.js'

/** The external-writer probe is intentionally eventual rather than a hot-path scan. */
export const COMPATIBILITY_MAILBOX_REVISION_PROBE_MS = 30_000
const DEFAULT_MAX_CACHED_SESSIONS = 64

export type CompatibilityRunProjection = {
  runId: string
  sessionId: string
}

export type CompatibilityRunPage<T extends CompatibilityRunProjection> = {
  runs: T[]
  nextCursor?: LocalGatewayRunListCursor
}

type CachedMailboxRevision = {
  checkedAtMs: number
  fingerprint: string
}

type CompatibilityRunPageCacheEntry<T extends CompatibilityRunProjection> = {
  sessionPath?: string
  sessionCheckedAtMs: number
  mailboxChangeRevision?: number
  mailboxRevision?: CachedMailboxRevision
  runs: Map<string, T>
}

type CompatibilityRunPageCache<T extends CompatibilityRunProjection> = {
  appStateRevision: number
  bySessionId: Map<string, CompatibilityRunPageCacheEntry<T>>
}

export type CompatibilityRunPageReaderOptions<T extends CompatibilityRunProjection> = {
  appState(): LocalGatewayAppStateStore | undefined
  getSession(sessionId: string): MainspringSessionRecord | null
  projectSession(sessionId: string, knownSession?: MainspringSessionRecord): T[]
  projectionFromMetadata(record: LocalGatewayRunMetadataRecord): T
  now?(): number
  maxCachedSessions?: number
}

/**
 * Page-scoped compatibility projection reader kept separate from the public
 * gateway facade. It intentionally knows only app-state run metadata, one
 * session lookup, and mailbox change signals; it cannot materialize the broad
 * console snapshot or inspect canonical RunLog projections.
 */
export class CompatibilityRunPageReader<T extends CompatibilityRunProjection> {
  private readonly now: () => number
  private readonly maxCachedSessions: number
  private cache?: CompatibilityRunPageCache<T>

  constructor(private readonly options: CompatibilityRunPageReaderOptions<T>) {
    this.now = options.now ?? (() => Date.now())
    this.maxCachedSessions = Math.max(
      1,
      Math.floor(options.maxCachedSessions ?? DEFAULT_MAX_CACHED_SESSIONS),
    )
  }

  list(input: {
    sessionId?: string
    before?: LocalGatewayRunListCursor
    limit?: number
  } = {}): CompatibilityRunPage<T> {
    const appState = this.options.appState()
    if (!appState) return { runs: [] }
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 25), 1), 100)
    const sourceLimit = limit * 3 + 1
    const candidates = appState.runs.list({
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.before ? { before: input.before } : {}),
      limit: sourceLimit,
      order: 'desc',
    })
    const compatibility = candidates.filter(isCompatibilityRunMetadata)
    const pageRecords = compatibility.slice(0, limit)
    const cache = this.cacheForCurrentAppState(appState)
    const runs = pageRecords.map((record) => {
      const sessionRuns = this.projectionsForSession(record.sessionId, cache)
      return sessionRuns.get(record.runId) ?? this.options.projectionFromMetadata(record)
    })
    const cursorRecord = pageRecords.at(-1) ?? candidates.at(-1)
    const hasMore = compatibility.length > limit || candidates.length === sourceLimit
    return {
      runs,
      ...(hasMore && cursorRecord
        ? { nextCursor: { createdAt: cursorRecord.createdAt, runId: cursorRecord.runId } }
        : {}),
    }
  }

  private cacheForCurrentAppState(
    appState: LocalGatewayAppStateStore,
  ): CompatibilityRunPageCache<T> {
    const appStateRevision = appState.revision()
    if (this.cache?.appStateRevision === appStateRevision) return this.cache
    const cache: CompatibilityRunPageCache<T> = {
      appStateRevision,
      bySessionId: new Map(),
    }
    this.cache = cache
    return cache
  }

  private projectionsForSession(
    sessionId: string,
    cache: CompatibilityRunPageCache<T>,
  ): Map<string, T> {
    const existing = cache.bySessionId.get(sessionId)
    const now = this.now()
    const cachedMailboxChangeRevision = existing?.sessionPath
      ? MainspringMailbox.changeRevisionForSessionPath(existing.sessionPath)
      : undefined
    const mailboxChanged = Boolean(
      existing
      && cachedMailboxChangeRevision !== undefined
      && cachedMailboxChangeRevision !== existing.mailboxChangeRevision,
    )
    const sessionRefreshDue = !existing
      || now - existing.sessionCheckedAtMs >= COMPATIBILITY_MAILBOX_REVISION_PROBE_MS
    if (existing && !mailboxChanged && !sessionRefreshDue) return existing.runs

    // Resolve session storage only when the cache is constructed, the session
    // itself changed, or the bounded external-writer probe is due.
    const knownSession = this.options.getSession(sessionId) ?? undefined
    const sessionPath = knownSession?.sessionPath
    const mailboxChangeRevision = sessionPath
      ? MainspringMailbox.changeRevisionForSessionPath(sessionPath)
      : undefined
    const mailboxRevision = sessionPath
      ? this.mailboxRevisionForSessionPath(
          sessionPath,
          existing?.sessionPath === sessionPath ? existing.mailboxRevision : undefined,
          now,
        )
      : undefined
    const stale = !existing
      || existing.sessionPath !== sessionPath
      || (
        mailboxChangeRevision !== undefined
        && mailboxChangeRevision !== existing.mailboxChangeRevision
      )
      || existing.mailboxRevision?.fingerprint !== mailboxRevision?.fingerprint
    if (!stale) {
      existing.sessionCheckedAtMs = now
      if (mailboxRevision) existing.mailboxRevision = mailboxRevision
      return existing.runs
    }

    const entry: CompatibilityRunPageCacheEntry<T> = {
      ...(sessionPath ? { sessionPath } : {}),
      sessionCheckedAtMs: now,
      ...(mailboxChangeRevision !== undefined ? { mailboxChangeRevision } : {}),
      ...(mailboxRevision ? { mailboxRevision } : {}),
      runs: new Map(
        this.options.projectSession(sessionId, knownSession).map((run) => [run.runId, run] as const),
      ),
    }
    cache.bySessionId.set(sessionId, entry)
    while (cache.bySessionId.size > this.maxCachedSessions) {
      const oldestSessionId = cache.bySessionId.keys().next().value
      if (!oldestSessionId) break
      cache.bySessionId.delete(oldestSessionId)
    }
    return entry.runs
  }

  private mailboxRevisionForSessionPath(
    sessionPath: string,
    cached: CachedMailboxRevision | undefined,
    now: number,
  ): CachedMailboxRevision {
    if (cached && now - cached.checkedAtMs < COMPATIBILITY_MAILBOX_REVISION_PROBE_MS) {
      return cached
    }
    return {
      checkedAtMs: now,
      fingerprint: compatibilityMailboxFingerprint(sessionPath),
    }
  }
}

/**
 * Includes the SQLite WAL files because legacy writers may commit without
 * checkpointing the primary mailbox database immediately.
 */
export function compatibilityMailboxFingerprint(sessionPath: string): string {
  const paths = MainspringMailbox.fromSessionPath(sessionPath).paths
  return [paths.inboundDbPath, paths.outboundDbPath, paths.eventsDbPath]
    .flatMap((filePath) => [fileRevision(filePath), fileRevision(`${filePath}-wal`)])
    .join('|')
}

function isCompatibilityRunMetadata(record: LocalGatewayRunMetadataRecord): boolean {
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as Record<string, unknown>
    : undefined
  return metadata?.runtime !== 'runlog'
}

function fileRevision(filePath: string): string {
  try {
    const stat = fs.statSync(filePath)
    return `${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}:${stat.size}`
  } catch {
    return 'missing'
  }
}
