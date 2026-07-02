import { randomUUID } from 'node:crypto'
import type { AgentSpec, RunRecord } from '../../core/types.js'
import { hashApprovalInput } from '../../policy/ApprovalReceipt.js'
import type { DecisionRecord } from '../../policy/DecisionRecord.js'

export type RunLogCronMode = 'deny' | 'staged' | 'allowlist' | 'approve'

export interface RunLogCronGrant {
  grantId: string
  mode: Extract<RunLogCronMode, 'allowlist' | 'approve'>
  agentId: string
  promptHash: string
  scheduleHash: string
  allowedTools: string[]
  expiresAt: string
  maxExecutionCount: number
  executionCount: number
  createdAt: string
}

export interface RunLogCronPolicyMetadata {
  headless?: boolean
  cronMode?: RunLogCronMode
  cronGrant?: RunLogCronGrant
  lastDecision?: {
    decisionId: string
    state: DecisionRecord['state']
    decidedAt: string
    reasons: string[]
  }
}

export interface RunLogCronJob {
  cronId: string
  agentId: string
  input: string
  intervalMs: number
  nextRunAt: string
  enabled: boolean
  sessionId?: string
  workspaceId?: string
  allowedTools?: string[]
  metadata?: Record<string, unknown> & RunLogCronPolicyMetadata
}

export interface RunLogCronStore {
  putCronJob(job: RunLogCronJob): void
  listDueCronJobs(now?: Date): RunLogCronJob[]
  enqueueDueCronRuns(now?: Date): RunRecord[]
}

function cronScheduleHash(input: {
  agentId: string
  intervalMs: number
  sessionId?: string
  workspaceId?: string
  allowedTools?: string[]
  scheduleKey?: string
}): string {
  return hashApprovalInput({
    agentId: input.agentId,
    intervalMs: input.intervalMs,
    sessionId: input.sessionId ?? null,
    workspaceId: input.workspaceId ?? null,
    allowedTools: [...(input.allowedTools ?? [])].sort(),
    scheduleKey: input.scheduleKey ?? null,
  })
}

export function createRunLogCronGrant(input: {
  agentId: string
  input: string
  intervalMs: number
  sessionId?: string
  workspaceId?: string
  allowedTools?: string[]
  scheduleKey?: string
  grantId?: string
  expiresAt?: string
  expiresInMs?: number
  maxExecutionCount?: number
  createdAt?: string
}): RunLogCronGrant {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    grantId: input.grantId ?? `cron_grant_${randomUUID()}`,
    mode: 'allowlist',
    agentId: input.agentId,
    promptHash: hashApprovalInput(input.input),
    scheduleHash: cronScheduleHash(input),
    allowedTools: [...(input.allowedTools ?? [])].sort(),
    expiresAt:
      input.expiresAt
      ?? new Date(Date.parse(createdAt) + (input.expiresInMs ?? 24 * 60 * 60 * 1000)).toISOString(),
    maxExecutionCount: input.maxExecutionCount ?? 1,
    executionCount: 0,
    createdAt,
  }
}

function cronUsesSideEffects(agent: AgentSpec, allowedTools: string[] = []): boolean {
  const capabilities = new Set(agent.capabilities ?? [])
  const toolNames = new Set([...(agent.tools ?? []), ...allowedTools])
  return (
    toolNames.size > 0 ||
    capabilities.has('tools') ||
    capabilities.has('shell') ||
    capabilities.has('files') ||
    capabilities.has('browser') ||
    capabilities.has('memory') ||
    capabilities.has('workspace') ||
    capabilities.has('subagents')
  )
}

export function decideRunLogCron(input: {
  job: RunLogCronJob
  agent: AgentSpec
  now?: Date
}): DecisionRecord {
  const now = input.now ?? new Date()
  const metadata = input.job.metadata ?? {}
  const explicitMode = metadata.cronMode
  const grant = metadata.cronGrant
  const allowedTools = grant?.allowedTools ?? input.job.allowedTools ?? input.agent.tools ?? []
  const sideEffecting = cronUsesSideEffects(input.agent, allowedTools)
  const reasons: string[] = []
  let state: DecisionRecord['state'] = 'allow'
  const mode = explicitMode ?? (sideEffecting ? 'deny' : 'allowlist')
  const expectedPromptHash = hashApprovalInput(input.job.input)
  const expectedScheduleHash = cronScheduleHash({
    agentId: input.job.agentId,
    intervalMs: input.job.intervalMs,
    sessionId: input.job.sessionId,
    workspaceId: input.job.workspaceId,
    allowedTools,
    scheduleKey:
      typeof input.job.metadata?.cronScheduleKey === 'string'
        ? input.job.metadata.cronScheduleKey
        : undefined,
  })

  if (mode === 'deny') {
    state = 'deny'
    reasons.push(
      sideEffecting
        ? 'headless cron side effects require a scoped grant'
        : 'headless cron is disabled by policy',
    )
  } else if (mode === 'staged') {
    state = 'stage_for_review'
    reasons.push('headless cron requires staged operator review')
  } else if (sideEffecting && !grant) {
    state = 'deny'
    reasons.push('headless cron grant is missing')
  } else if (grant) {
    if (grant.agentId !== input.job.agentId) {
      state = 'deny'
      reasons.push('headless cron grant agent does not match schedule')
    }
    if (grant.promptHash !== expectedPromptHash) {
      state = 'deny'
      reasons.push('headless cron prompt changed after grant')
    }
    if (grant.scheduleHash !== expectedScheduleHash) {
      state = 'deny'
      reasons.push('headless cron schedule changed after grant')
    }
    if (Date.parse(grant.expiresAt) <= now.getTime()) {
      state = 'deny'
      reasons.push('headless cron grant expired')
    }
    if (grant.executionCount >= grant.maxExecutionCount) {
      state = 'deny'
      reasons.push('headless cron grant execution limit reached')
    }
  }

  return {
    decisionId: `dr_${randomUUID()}`,
    runId: '',
    surface: 'cron',
    operation: 'cron.enqueue',
    targetKey: input.job.cronId,
    state,
    reasons,
    permissionCategories: sideEffecting ? ['cron', 'headless', 'side-effecting'] : ['cron', 'headless'],
    approved: Boolean(grant && state === 'allow'),
    hardBlocked: false,
    inputHash: expectedPromptHash,
    manifestHash: hashApprovalInput({
      cronId: input.job.cronId,
      agentId: input.job.agentId,
      intervalMs: input.job.intervalMs,
    }),
    policyHash: hashApprovalInput({ mode, grant: grant ?? null }),
    createdAt: now.toISOString(),
    metadata: {
      headless: true,
      cronId: input.job.cronId,
      cronMode: mode,
      grantId: grant?.grantId,
      scheduleHash: expectedScheduleHash,
      allowedTools,
    },
  }
}

export function decisionRecordForRun(record: DecisionRecord, runId: string, sessionId: string): DecisionRecord {
  return {
    ...record,
    runId,
    sessionId,
  }
}

export function cronMetadataWithDecision(
  metadata: RunLogCronJob['metadata'],
  decision: DecisionRecord,
  options: { incrementGrantUse?: boolean } = {},
): RunLogCronJob['metadata'] {
  const next: RunLogCronJob['metadata'] = { ...(metadata ?? {}) }
  if (next.cronGrant && options.incrementGrantUse) {
    next.cronGrant = {
      ...next.cronGrant,
      executionCount: next.cronGrant.executionCount + 1,
    }
  }
  next.lastDecision = {
    decisionId: decision.decisionId,
    state: decision.state,
    decidedAt: decision.createdAt,
    reasons: decision.reasons,
  }
  return next
}
