import fs from 'node:fs'
import path from 'node:path'
import {
  buildRunCancelInboundContent,
  createMainspringRuntimeId,
  mainspringRuntimeProfileFromOptions,
  normalizeMailboxSessionId,
  RunContextPackSchema,
  type ApprovalResponseInboundContent,
  type GatewayRunDispatch,
  type RuntimePolicy,
} from '#protocol'
import { resolveContainedSessionMailboxPaths } from '#protocol/node'
import { buildRunContextPack } from '../../agent/ContextPack.js'
import type {
  ArtifactStore,
  CommandStore,
  CreateMainspringSessionInput,
  EventStore,
  MainspringSessionRecord,
  MainspringStorage,
  RunEvent,
  RunRecord,
  StartRunInput,
  StateStore,
  UpdateMainspringSessionInput,
} from '../../contracts/runtime.js'
import { normalizeRuntimeEventRow } from '../../events/normalizeRuntimeEvent.js'
import { MainspringMailbox } from '../../mailbox/SqliteMailbox.js'

const SESSION_META_NAME = 'mainspring-session.json'

function sessionMetaPath(sessionPath: string): string {
  return path.join(sessionPath, SESSION_META_NAME)
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultPolicy(input: StartRunInput): RuntimePolicy {
  return {
    approvalPolicy: input.approvalPolicy ?? 'balanced',
    allowBrowser: input.allowBrowser ?? false,
    allowMemory: input.allowMemory ?? false,
    allowedTools: input.allowedTools ?? [],
    ...(input.budget ? { budget: input.budget } : {}),
    redaction: input.redaction ?? 'strict',
  }
}

function readSessionRecord(paths: ReturnType<typeof resolveContainedSessionMailboxPaths>): MainspringSessionRecord | null {
  const metaPath = sessionMetaPath(paths.sessionPath)
  if (!fs.existsSync(metaPath)) return null
  return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as MainspringSessionRecord
}

function writeSessionRecord(record: MainspringSessionRecord): MainspringSessionRecord {
  fs.mkdirSync(record.sessionPath, { recursive: true })
  fs.writeFileSync(sessionMetaPath(record.sessionPath), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

function copySessionRecord(record: MainspringSessionRecord): MainspringSessionRecord {
  // Session records are JSON persisted. Return an independent value just as a
  // fresh filesystem read did before the catalog cache was introduced.
  return JSON.parse(JSON.stringify(record)) as MainspringSessionRecord
}

function buildGatewayDispatch(
  session: MainspringSessionRecord,
  input: StartRunInput,
  mailbox?: MainspringMailbox,
): { dispatch: GatewayRunDispatch; run: RunRecord } {
  const runId = input.resumeRunId ?? createMainspringRuntimeId('run')
  const workspaceId = input.workspaceId ?? `workspace_${session.sessionId}`
  const agentId = input.agentId ?? 'agent_default'
  const sessionKey = session.sessionId
  const createdAt = nowIso()
  const runtimeProfile = mainspringRuntimeProfileFromOptions({
    allowBrowser: input.allowBrowser,
    allowMemory: input.allowMemory,
    runtimeProfile: input.runtimeProfile,
  })
  const runtimeOptions = {
    browser: input.allowBrowser ?? false,
    memory: input.allowMemory ?? false,
    ...(input.allowedTools ? { tools: input.allowedTools } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.credentialRef ? { credentialRef: input.credentialRef } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
  }
  const historyMessages = mailbox?.readRecentAssistantMessages(session.sessionId, 6) ?? []
  const contextPack = RunContextPackSchema.parse(
    input.clientContext?.contextPack ??
      buildRunContextPack({
        latestMessage: input.input,
        historyMessages,
        systemPrompt: input.systemPrompt,
        toolCount: input.allowedTools?.length ?? 0,
      }),
  )
  return {
    run: {
      runId,
      sessionId: session.sessionId,
      createdAt,
      input: input.input,
      status: 'queued',
    },
    dispatch: {
      runId,
      ownerId: input.ownerId ?? 'owner_local',
      computerId: input.computerId ?? 'computer_local',
      workspaceId,
      agentId,
      sessionKey,
      runtimeProfile,
      intent: {
        workspaceId,
        agentId,
        message: input.input,
        systemPrompt: input.systemPrompt,
        sessionKey,
        mode: input.mode ?? 'chat',
        approvalPolicy: input.approvalPolicy ?? 'balanced',
        runtimeOptions,
        clientContext: {
          route: input.clientContext?.route ?? '/sdk',
          lane: input.clientContext?.lane ?? 'platform',
          contextPack,
        },
      },
      policy: defaultPolicy(input),
      trace: {
        requestId: createMainspringRuntimeId('req'),
        source: 'api',
      },
    },
  }
}

export class SqliteMainspringStateStore implements StateStore {
  private sessionListCache?: {
    directoryKey: string
    records: MainspringSessionRecord[]
  }

  constructor(private readonly sessionsRoot: string, private readonly workspaceRoot: string) {}

  createSession(input: CreateMainspringSessionInput): MainspringSessionRecord {
    const sessionId = normalizeMailboxSessionId(
      input.sessionId?.trim() || createMainspringRuntimeId('session'),
    )
    const paths = resolveContainedSessionMailboxPaths(this.sessionsRoot, sessionId)
    const mailbox = new MainspringMailbox(paths)
    mailbox.ensureAllStoresForFixture()
    const createdAt = nowIso()
    const workspaceRoot = path.resolve(input.workspace?.root ?? this.workspaceRoot)
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const record = writeSessionRecord({
      sessionId,
      sessionPath: paths.sessionPath,
      workspaceRoot,
      status: 'open',
      createdAt,
      updatedAt: createdAt,
      metadata: input.metadata,
    })
    this.invalidateSessionListCache()
    return record
  }

  listSessions(): MainspringSessionRecord[] {
    if (!fs.existsSync(this.sessionsRoot)) {
      this.sessionListCache = { directoryKey: '', records: [] }
      return []
    }
    const sessionDirectories = fs
      .readdirSync(this.sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
    const directoryKey = sessionDirectories.join('\u0000')
    if (this.sessionListCache?.directoryKey === directoryKey) {
      return this.sessionListCache.records.map(copySessionRecord)
    }
    const records = sessionDirectories
      .map((sessionId) => resolveContainedSessionMailboxPaths(this.sessionsRoot, sessionId))
      .map((paths) => readSessionRecord(paths))
      .filter((record): record is MainspringSessionRecord => Boolean(record))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    this.sessionListCache = { directoryKey, records }
    return records.map(copySessionRecord)
  }

  getSession(sessionId: string): MainspringSessionRecord | null {
    const paths = resolveContainedSessionMailboxPaths(this.sessionsRoot, sessionId)
    return readSessionRecord(paths)
  }

  updateSession(sessionId: string, input: UpdateMainspringSessionInput): MainspringSessionRecord {
    const existing = this.getSession(sessionId)
    if (!existing) throw new Error(`Unknown session: ${sessionId}`)
    const workspaceRoot = input.workspace?.root
      ? path.resolve(input.workspace.root)
      : existing.workspaceRoot
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const record = writeSessionRecord({
      ...existing,
      workspaceRoot,
      status: input.status ?? existing.status,
      metadata: input.metadata ?? existing.metadata,
      updatedAt: nowIso(),
    })
    this.invalidateSessionListCache()
    return record
  }

  deleteSession(sessionId: string): void {
    const existing = this.getSession(sessionId)
    if (!existing) return
    fs.rmSync(existing.sessionPath, { recursive: true, force: true })
    this.invalidateSessionListCache()
  }

  private invalidateSessionListCache(): void {
    this.sessionListCache = undefined
  }
}

export class SqliteMainspringCommandStore implements CommandStore {
  constructor(private readonly stateStore: StateStore) {}

  enqueueRun(session: MainspringSessionRecord, input: StartRunInput): RunRecord {
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    const { dispatch, run } = buildGatewayDispatch(session, input, mailbox)
    mailbox.writeInbound({
      runId: run.runId,
      sessionId: session.sessionId,
      kind: 'chat',
      content: JSON.stringify(dispatch),
    })
    return run
  }

  cancelRun(sessionId: string, runId: string, reason?: string): void {
    const session = this.stateStore.getSession(sessionId)
    if (!session) throw new Error(`Unknown session: ${sessionId}`)
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    mailbox.writeInbound({
      runId,
      sessionId,
      kind: 'run_cancel',
      content: JSON.stringify(buildRunCancelInboundContent({ runId, reason })),
    })
  }

  resolveApproval(input: {
    sessionId: string
    runId: string
    approvalId: string
    decision: 'approved' | 'denied'
    reason?: string
    response?: unknown
  }): void {
    const session = this.stateStore.getSession(input.sessionId)
    if (!session) throw new Error(`Unknown session: ${input.sessionId}`)
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    const content: ApprovalResponseInboundContent = {
      type: 'approval_response',
      runId: input.runId,
      approvalId: input.approvalId,
      decision: input.decision,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.response !== undefined ? { response: input.response } : {}),
    }
    mailbox.writeInbound({
      runId: input.runId,
      sessionId: input.sessionId,
      kind: 'approval_response',
      content: JSON.stringify(content),
    })
  }
}

export class SqliteMainspringEventStore implements EventStore {
  constructor(private readonly stateStore: StateStore) {}

  listRunEvents(input: {
    sessionId: string
    runId?: string
    afterSeq?: number
    limit?: number
  }): RunEvent[] {
    const session = this.stateStore.getSession(input.sessionId)
    if (!session) return []
    const mailbox = MainspringMailbox.fromSessionPath(session.sessionPath)
    const rows =
      typeof input.afterSeq === 'number'
        ? mailbox.readEventsAfterSeq({
            sessionId: input.sessionId,
            runId: input.runId,
            afterSeq: input.afterSeq,
            limit: input.limit,
          })
        : mailbox.readRecentEvents({
            sessionId: input.sessionId,
            runId: input.runId,
            limit: input.limit,
          })
    return rows.map(normalizeRuntimeEventRow).filter((event): event is RunEvent => Boolean(event))
  }

  listSessionEvents(input: {
    sessionId: string
    afterSeq?: number
    limit?: number
  }): RunEvent[] {
    return this.listRunEvents(input)
  }
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(readonly rootPath: string) {
    fs.mkdirSync(rootPath, { recursive: true })
  }
}

export function createSqliteMainspringStorage(input: {
  sessionsRoot: string
  workspaceRoot: string
  artifactRoot?: string
}): MainspringStorage {
  const stateStore = new SqliteMainspringStateStore(input.sessionsRoot, input.workspaceRoot)
  return {
    stateStore,
    commandStore: new SqliteMainspringCommandStore(stateStore),
    eventStore: new SqliteMainspringEventStore(stateStore),
    artifactStore: new LocalArtifactStore(
      path.resolve(input.artifactRoot ?? path.join(input.sessionsRoot, '..', 'artifacts')),
    ),
  }
}
