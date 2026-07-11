import type { LocalGatewayCronScheduleRecord } from './AppStateStore.js'

export interface GatewayCronSchedulerOptions {
  enabled: boolean
  pollIntervalMs: number
  now: () => Date
  listSchedules?: () => ReadonlyArray<Pick<LocalGatewayCronScheduleRecord, 'scheduleId' | 'enabled' | 'nextRunAt'>>
  runSchedule: (scheduleId: string, now: Date) => void | Promise<void>
}

export interface GatewayCronSchedulerStatus {
  enabled: boolean
  running: boolean
  pollIntervalMs: number
  lastTickAt?: string
  lastError?: string
}

/** Owns cron polling lifecycle; policy evaluation and run creation stay host-side in LocalGateway. */
export class GatewayCronScheduler {
  private readonly pollIntervalMs: number
  private readonly timerEnabled: boolean
  private timer: NodeJS.Timeout | null = null
  private lastTickAt?: string
  private lastError?: string
  private inFlight: Promise<void> | null = null

  constructor(private readonly options: GatewayCronSchedulerOptions) {
    this.pollIntervalMs = Math.max(1_000, options.pollIntervalMs)
    this.timerEnabled = options.enabled && Boolean(options.listSchedules)
  }

  start(): void {
    if (!this.timerEnabled || this.timer) return
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined)
    }, this.pollIntervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (!this.options.listSchedules) return
    if (this.inFlight) return await this.inFlight

    const request = this.performTick()
    this.inFlight = request
    try {
      await request
    } finally {
      if (this.inFlight === request) this.inFlight = null
    }
  }

  status(): GatewayCronSchedulerStatus {
    return {
      enabled: this.options.enabled,
      running: this.timer !== null,
      pollIntervalMs: this.pollIntervalMs,
      ...(this.lastTickAt ? { lastTickAt: this.lastTickAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    }
  }

  private async performTick(): Promise<void> {
    const now = this.options.now()
    const nowIso = now.toISOString()
    try {
      for (const schedule of this.options.listSchedules?.() ?? []) {
        if (!schedule.enabled || !schedule.nextRunAt || schedule.nextRunAt > nowIso) continue
        await this.options.runSchedule(schedule.scheduleId, now)
      }
      this.lastTickAt = nowIso
      this.lastError = undefined
    } catch (error) {
      this.lastTickAt = nowIso
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }
}
