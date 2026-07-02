import type { RunRecord } from '../../core/types.js'

export interface RunLogCronJob {
  cronId: string
  agentId: string
  input: string
  intervalMs: number
  nextRunAt: string
  enabled: boolean
  sessionId?: string
  workspaceId?: string
  metadata?: Record<string, unknown>
}

export interface RunLogCronStore {
  putCronJob(job: RunLogCronJob): void
  listDueCronJobs(now?: Date): RunLogCronJob[]
  enqueueDueCronRuns(now?: Date): RunRecord[]
}
