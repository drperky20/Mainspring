import fs from 'node:fs'
import path from 'node:path'
import { resolveContainedSessionMailboxPaths } from '#protocol/node'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import { RuntimeKernel, type RuntimeKernelResult } from './RuntimeKernel.js'

export interface SessionRuntimeSupervisorKernelInput {
  sessionId: string
  sessionPath: string
  mailbox: MainspringMailbox
}

export interface SessionRuntimeSupervisorOptions {
  sessionsRoot: string
  defaultSessionId?: string
  createKernel(input: SessionRuntimeSupervisorKernelInput): RuntimeKernel
}

export interface SessionRuntimeSupervisorResult extends RuntimeKernelResult {
  sessionIds: string[]
}

type SessionKernelEntry = {
  sessionId: string
  sessionPath: string
  mailbox: MainspringMailbox
  kernel: RuntimeKernel
}

const DEFAULT_SESSION_ID = 'default'

function emptyResult(): SessionRuntimeSupervisorResult {
  return { processed: 0, messageIds: [], runIds: [], sessionIds: [] }
}

export class SessionRuntimeSupervisor {
  private readonly kernels = new Map<string, SessionKernelEntry>()
  private readonly sessionsRoot: string
  private readonly defaultSessionId: string

  constructor(private readonly options: SessionRuntimeSupervisorOptions) {
    this.sessionsRoot = path.resolve(options.sessionsRoot)
    this.defaultSessionId = options.defaultSessionId ?? DEFAULT_SESSION_ID
  }

  runOnceAll(): Promise<SessionRuntimeSupervisorResult> {
    const sessionIds = this.discoverSessionIds()
    if (sessionIds.length === 0) {
      this.touchIdleHeartbeat()
      return Promise.resolve(emptyResult())
    }

    return this.runSessionIds(sessionIds)
  }

  async runUntilIdleAll(options: { waitForActiveQueries?: boolean; maxIterations?: number } = {}) {
    const maxIterations = options.maxIterations ?? 100
    const summary = emptyResult()

    for (let index = 0; index < maxIterations; index += 1) {
      const result = await this.runOnceAll()
      if (result.processed === 0) break
      summary.processed += result.processed
      summary.messageIds.push(...result.messageIds)
      summary.runIds.push(...result.runIds)
      summary.sessionIds.push(...result.sessionIds)
    }

    if (options.waitForActiveQueries) {
      await this.waitForActiveQueries()
    }

    return summary
  }

  async waitForActiveQueries(): Promise<void> {
    await Promise.all(
      [...this.kernels.values()].map((entry) => entry.kernel.waitForActiveQueries()),
    )
  }

  touchIdleHeartbeat(): void {
    fs.mkdirSync(this.sessionsRoot, { recursive: true })
    const mailbox = new MainspringMailbox(
      resolveContainedSessionMailboxPaths(this.sessionsRoot, this.defaultSessionId),
    )
    mailbox.touchHeartbeat()
  }

  private async runSessionIds(sessionIds: string[]): Promise<SessionRuntimeSupervisorResult> {
    const summary = emptyResult()

    for (const sessionId of sessionIds) {
      const entry = this.kernelForSession(sessionId)
      const result = await entry.kernel.runOnce()
      if (result.processed === 0) continue
      summary.processed += result.processed
      summary.messageIds.push(...result.messageIds)
      summary.runIds.push(...result.runIds)
      summary.sessionIds.push(sessionId)
    }

    if (summary.processed === 0) {
      this.touchIdleHeartbeat()
    }

    return summary
  }

  private kernelForSession(sessionId: string): SessionKernelEntry {
    const existing = this.kernels.get(sessionId)
    if (existing) return existing

    const paths = resolveContainedSessionMailboxPaths(this.sessionsRoot, sessionId)
    const mailbox = new MainspringMailbox(paths)
    const entry: SessionKernelEntry = {
      sessionId,
      sessionPath: paths.sessionPath,
      mailbox,
      kernel: this.options.createKernel({
        sessionId,
        sessionPath: paths.sessionPath,
        mailbox,
      }),
    }
    this.kernels.set(sessionId, entry)
    return entry
  }

  private discoverSessionIds(): string[] {
    if (!fs.existsSync(this.sessionsRoot)) return []

    return fs
      .readdirSync(this.sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((sessionId) => {
        const paths = resolveContainedSessionMailboxPaths(this.sessionsRoot, sessionId)
        return fs.existsSync(paths.inboundDbPath)
      })
      .sort((left, right) => left.localeCompare(right))
  }
}
