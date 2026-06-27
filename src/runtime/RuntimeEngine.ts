import type { RuntimePolicy } from '#protocol'
import path from 'node:path'
import type { RuntimeDiagnostics, RuntimeHealth } from '../contracts/runtime.js'
import type { AgentProvider } from '../providers/types.js'
import { createRuntimeProviderFromEnv } from '../runner/RuntimeProviderConfig.js'
import { SessionRuntimeSupervisor } from '../runner/SessionRuntimeSupervisor.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { RuntimeKernel, type RuntimeProviderInput } from '../runner/RuntimeKernel.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RuntimeEngineOptions {
  sessionsRoot: string
  workspaceRoot: string
  provider?: AgentProvider | ((input: RuntimeProviderInput) => AgentProvider)
  defaultModelId?: string
  tools: RuntimeTool[]
  policy?: RuntimePolicy
  pollIntervalMs?: number
  listSessions: () => Array<{ sessionId: string; workspaceRoot?: string }>
}

export class RuntimeEngine {
  private readonly provider: AgentProvider | ((input: RuntimeProviderInput) => AgentProvider)
  private readonly supervisor: SessionRuntimeSupervisor
  private readonly pollIntervalMs: number
  private readonly defaultModelId?: string
  private running = false
  private loopPromise: Promise<void> | null = null
  private lastTickAt?: string
  private lastError?: string

  constructor(private readonly options: RuntimeEngineOptions) {
    if (options.provider) {
      this.provider = options.provider
      this.defaultModelId = options.defaultModelId
    } else {
      const envSelection = createRuntimeProviderFromEnv(process.env)
      this.provider = envSelection.provider
      this.defaultModelId = options.defaultModelId ?? envSelection.modelId
    }
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    this.supervisor = new SessionRuntimeSupervisor({
      sessionsRoot: options.sessionsRoot,
      createKernel: ({ mailbox }) =>
        new RuntimeKernel({
          mailbox,
          provider: this.provider,
          cwd: ({ sessionId }) => this.workspaceRootForSession(sessionId),
          ...(this.defaultModelId ? { defaultModelId: this.defaultModelId } : {}),
          env: process.env,
          tools: options.tools,
          policy: options.policy,
        }),
    })
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.loopPromise = this.runLoop()
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    await this.loopPromise
    this.loopPromise = null
  }

  health(): RuntimeHealth {
    return {
      ok: !this.lastError,
      running: this.running,
      sessionsRoot: this.options.sessionsRoot,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      activeSessions: this.options.listSessions().length,
    }
  }

  diagnostics(): RuntimeDiagnostics {
    return {
      engine: this.health(),
      sessions: this.options.listSessions().map((session) => ({
        sessionId: session.sessionId,
      })) as RuntimeDiagnostics['sessions'],
      providers: ['default'],
    }
  }

  private workspaceRootForSession(sessionId: string): string {
    const session = this.options
      .listSessions()
      .find((candidate) => candidate.sessionId === sessionId)
    return path.resolve(session?.workspaceRoot ?? this.options.workspaceRoot)
  }

  private async runLoop(): Promise<void> {
    this.supervisor.touchIdleHeartbeat()

    while (this.running) {
      try {
        const result = await this.supervisor.runOnceAll()
        this.lastTickAt = new Date().toISOString()
        this.lastError = undefined
        if (!this.running) break
        if (result.processed === 0) await sleep(this.pollIntervalMs)
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        this.lastTickAt = new Date().toISOString()
        this.supervisor.touchIdleHeartbeat()
        if (!this.running) break
        await sleep(this.pollIntervalMs)
      }
    }

    await this.supervisor.waitForActiveQueries()
    this.supervisor.touchIdleHeartbeat()
  }
}
