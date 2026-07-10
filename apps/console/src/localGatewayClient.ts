import type {
  ConsoleExecutionBackendStatus,
  ConsoleGatewayRunEvent,
  ConsoleGatewayRunLogRun,
  ConsoleGatewaySnapshot,
} from 'mainspring/gateway'
import {
  browserUnsafeGatewayTextMarkers,
  containsBrowserUnsafeGatewayText,
} from 'mainspring/gateway/browser-safety'

export type GatewayProvenanceReview = {
  reviewId: string
  workspaceId: string
  kind: 'memory' | 'skill' | 'template'
  status: string
  source: string
  runId?: string
  agentId?: string
  actor?: string
  createdAt: string
  updatedAt: string
  mutation:
    | {
        kind: 'memory'
        scope: string
        tags: string[]
        textPreview: string
        sessionId?: string
      }
    | {
        kind: 'skill'
        action: string
        manifest: {
          key: string
          name: string
          description: string
          version: string
          source: string
          permissionSummary: string
        }
      }
    | {
        kind: 'template'
        summary: string
      }
  scan: {
    status: string
    contentHash: string
    findings: Array<{ ruleId: string; severity: string; message: string; evidence?: string }>
  }
  decision?: {
    decidedAt: string
    reviewer: string
    reason?: string
  }
}

export interface GatewayProviderModel {
  id: string
  name: string
  description?: string
  contextLength?: number
  inputModalities: string[]
  outputModalities: string[]
  supportedParameters: string[]
  pricing?: {
    prompt?: string
    completion?: string
    request?: string
  }
}

export type HostedGatewayRole = 'admin' | 'operator' | 'viewer'

export type GatewaySnapshotRefresh =
  | {
      kind: 'updated'
      snapshot: ConsoleGatewaySnapshot
      etag?: string
    }
  | {
      kind: 'not-modified'
      etag?: string
    }

export type GatewayApprovalHistoryItem = ConsoleGatewaySnapshot['approvalMetadata'][number] & {
  source: 'compatibility' | 'runlog'
}

export type GatewayUsageHistoryItem = ConsoleGatewaySnapshot['usageLedger'][number]

export type GatewayArtifactHistoryItem = ConsoleGatewaySnapshot['artifacts'][number]

export type GatewayAuditHistoryItem = ConsoleGatewaySnapshot['auditEvents'][number]

export type GatewayMemoryHistoryItem = ConsoleGatewaySnapshot['memoryEntries'][number]

export interface LocalGatewayClient {
  health(input?: { signal?: AbortSignal }): Promise<{
    mode: string
    health: { ok: boolean; running: boolean; activeSessions: number }
    auth?: {
      authMode: 'local-dev' | 'hosted'
      authenticated: boolean
      bootstrapRequired: boolean
      user?: { userId: string; username: string; role: HostedGatewayRole }
      expiresAt?: string
    }
  }>
  snapshot(): Promise<ConsoleGatewaySnapshot>
  snapshotIfChanged(input?: { etag?: string; signal?: AbortSignal }): Promise<GatewaySnapshotRefresh>
  authSession(): Promise<{
    auth: {
      authMode: 'hosted'
      authenticated: boolean
      bootstrapRequired: boolean
      user?: { userId: string; username: string; role: HostedGatewayRole }
      expiresAt?: string
    }
  }>
  bootstrapAuth(input: { username: string; password: string }): Promise<{
    user: { userId: string; username: string; role: HostedGatewayRole }
  }>
  login(input: { username: string; password: string }): Promise<{
    user: { userId: string; username: string; role: HostedGatewayRole }
    expiresAt: string
  }>
  logout(): Promise<{ loggedOut: true }>
  setSessionToken(sessionToken?: string): void
  getSessionToken(): string | undefined
  browserAccessUrl(input:
    | { kind: 'artifact'; artifactId: string }
    | { kind: 'event-stream'; sessionId?: string; runId?: string }
  ): Promise<{ kind: 'artifact' | 'event-stream'; url: string; expiresAt: string }>
  openRouterModels(input?: {
    q?: string
    limit?: number
    supportedParameter?: string
    sort?: string
  }): Promise<{ providerId: 'openrouter'; source: string; models: GatewayProviderModel[] }>
  toolCalls(input?: {
    runId?: string
    sessionId?: string
    workspaceId?: string
    status?: ConsoleGatewaySnapshot['toolCalls'] extends Array<infer T> ? T extends { status: infer S } ? S : never : never
  }): Promise<{ toolCalls: NonNullable<ConsoleGatewaySnapshot['toolCalls']> }>
  deploymentTargets(input?: {
    workspaceId?: string
  }): Promise<{ deploymentTargets: NonNullable<ConsoleGatewaySnapshot['deploymentTargets']> }>
  deploymentRuns(input?: {
    targetId?: string
    runId?: string
    sessionId?: string
    status?: ConsoleGatewaySnapshot['deploymentRuns'] extends Array<infer T> ? T extends { status: infer S } ? S : never : never
  }): Promise<{ deploymentRuns: NonNullable<ConsoleGatewaySnapshot['deploymentRuns']> }>
  createDeploymentTarget(input: {
    workspaceId?: string
    label: string
    kind: string
    config?: Record<string, unknown>
  }): Promise<{
    deploymentTarget: NonNullable<ConsoleGatewaySnapshot['deploymentTargets']>[number]
  }>
  updateDeploymentTarget(input: {
    targetId: string
    workspaceId?: string
    label?: string
    kind?: string
    status?: 'active' | 'archived'
    config?: Record<string, unknown>
  }): Promise<{
    deploymentTarget: NonNullable<ConsoleGatewaySnapshot['deploymentTargets']>[number]
  }>
  planDeployment(input: {
    targetId: string
    operation: 'deploy' | 'rollback' | 'destroy'
  }): Promise<{
    deploymentPlan: {
      operation: 'deploy' | 'rollback' | 'destroy'
      targetId: string
      targetLabel: string
      targetKind: string
      summary: string
      prerequisites: string[]
      warnings: string[]
      steps: Array<{ phase: 'local' | 'remote'; label: string; commandPreview: string }>
      releaseId?: string
      rollbackReleaseId?: string
    }
  }>
  executeDeployment(input: {
    targetId: string
    operation: 'deploy' | 'rollback' | 'destroy'
    confirm: string
  }): Promise<{
    deploymentRun: NonNullable<ConsoleGatewaySnapshot['deploymentRuns']>[number]
    plan: {
      operation: 'deploy' | 'rollback' | 'destroy'
      targetId: string
      targetLabel: string
      targetKind: string
      summary: string
      prerequisites: string[]
      warnings: string[]
      steps: Array<{ phase: 'local' | 'remote'; label: string; commandPreview: string }>
      releaseId?: string
      rollbackReleaseId?: string
    }
    execution: {
      ok: boolean
      exitCode: number
      startedAt: string
      completedAt: string
      detail: string
    }
  }>
  marketplaceTemplates(): Promise<{
    templates: Array<{
      templateId: string
      label: string
      description: string
      trusted: true
      provenance: 'repo-examples' | 'signed-remote'
      publisherId?: string
      keyId?: string
      catalogHash?: string
      provenanceScanStatus?: 'pass' | 'review' | 'block'
      providerId?: string
      modelId?: string
      runtimeProfile?: string
      allowedTools: string[]
      approvalMode?: string
    }>
  }>
  syncRemoteMarketplace(): Promise<Awaited<ReturnType<LocalGatewayClient['marketplaceTemplates']>>>
  installMarketplaceTemplate(input: {
    templateId: string
    workspaceRoot: string
    clientName?: string
    workspaceName?: string
    agentName?: string
  }): Promise<{
    template: {
      templateId: string
      label: string
    }
    client: { clientId: string; name: string; status: string }
    workspace?: { workspaceId: string; clientId?: string; name: string; status: string }
    session?: { sessionId: string; status: string; createdAt: string; updatedAt: string }
    agent: { agentId: string; workspaceId?: string; name: string; version: string; status: string }
    installedFiles: string[]
  }>
  provenanceReviews(input: {
    workspaceId: string
    status?: 'pending' | 'approved' | 'rejected' | 'applied'
  }): Promise<{ provenanceReviews: GatewayProvenanceReview[] }>
  decideProvenanceReview(input: {
    workspaceId: string
    reviewId: string
    decision: 'approved' | 'rejected'
    reviewer?: string
    reason?: string
  }): Promise<{ provenanceReview: GatewayProvenanceReview }>
  applyProvenanceReview(input: {
    workspaceId: string
    reviewId: string
    reviewer?: string
  }): Promise<{
    provenanceReviewApply:
      | { kind: 'memory'; reviewId: string; memoryId: string; applied: true }
      | { kind: 'skill'; reviewId: string; skillKey: string; action: 'installed' | 'updated'; applied: true }
  }>
  cells(input?: {
    workspaceId?: string
  }): Promise<{ cells: NonNullable<ConsoleGatewaySnapshot['cells']> }>
  cellStatus(): Promise<{ cellStatus: NonNullable<ConsoleGatewaySnapshot['cellStatus']> }>
  executionBackendStatus(): Promise<{ executionBackends: ConsoleExecutionBackendStatus }>
  cellLeases(input?: {
    cellId?: string
    runId?: string
    sessionId?: string
    status?: ConsoleGatewaySnapshot['cellLeases'] extends Array<infer T> ? T extends { status: infer S } ? S : never : never
  }): Promise<{ cellLeases: NonNullable<ConsoleGatewaySnapshot['cellLeases']> }>
  cellSnapshots(input?: {
    cellId?: string
    leaseId?: string
  }): Promise<{ cellSnapshots: NonNullable<ConsoleGatewaySnapshot['cellSnapshots']> }>
  cronSchedules(): Promise<{ cronSchedules: NonNullable<ConsoleGatewaySnapshot['cronSchedules']> }>
  budgets(): Promise<{ budgets: NonNullable<ConsoleGatewaySnapshot['budgets']> }>
  budgetStatus(): Promise<{
    budgetStatus: {
      evaluations: NonNullable<ConsoleGatewaySnapshot['budgetEvaluations']>
      blocked: number
      warnings: number
      usageStatus?: NonNullable<ConsoleGatewaySnapshot['usageStatus']>
    }
  }>
  usageStatus(): Promise<{ usageStatus: NonNullable<ConsoleGatewaySnapshot['usageStatus']> }>
  usageHistory(input?: {
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{ entries: GatewayUsageHistoryItem[]; nextCursor?: string }>
  artifactHistory(input?: {
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{ artifacts: GatewayArtifactHistoryItem[]; nextCursor?: string }>
  auditHistory(input?: {
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{ events: GatewayAuditHistoryItem[]; nextCursor?: string }>
  memoryHistory(input: {
    workspaceId: string
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{ entries: GatewayMemoryHistoryItem[]; nextCursor?: string }>
  cronStatus(): Promise<{
    cron: { enabled: boolean; running: boolean; pollIntervalMs: number; lastTickAt?: string; lastError?: string }
  }>
  deleteClient(input: { clientId: string }): Promise<{ clientId: string; deleted: true }>
  createClient(input: {
    name: string
    workspaceRoot?: string
    workspaceName?: string
    contact?: string
    billingLabel?: string
  }): Promise<{
    client: ConsoleGatewaySnapshot['clients'][number]
    workspace?: ConsoleGatewaySnapshot['workspaces'][number]
    session?: ConsoleGatewaySnapshot['sessions'][number]
  }>
  createWorkspace(input: {
    clientId: string
    name: string
    workspaceRoot: string
  }): Promise<{
    workspace: ConsoleGatewaySnapshot['workspaces'][number]
    session: ConsoleGatewaySnapshot['sessions'][number]
  }>
  deleteWorkspace(input: { workspaceId: string }): Promise<{ workspaceId: string; deleted: true }>
  updateClient(input: {
    clientId: string
    name?: string
    status?: 'active' | 'archived'
    contact?: string
    billingLabel?: string
    workspaceId?: string
    workspaceName?: string
    workspaceRoot?: string
    workspaceStatus?: 'active' | 'archived'
  }): Promise<{
    client: ConsoleGatewaySnapshot['clients'][number]
    workspace?: ConsoleGatewaySnapshot['workspaces'][number]
  }>
  createAgent(input: {
    workspaceId: string
    name: string
    version?: string
    defaultModelId?: string
    instructions?: string
    outcome?: string
    voice?: string
    approvalMode?: string
    modelLabel?: string
    skills?: Record<string, boolean>
  }): Promise<{
    agent: ConsoleGatewaySnapshot['agents'][number]
  }>
  updateAgent(input: {
    agentId: string
    name?: string
    version?: string
    defaultModelId?: string
    instructions?: string
    outcome?: string
    voice?: string
    approvalMode?: string
    modelLabel?: string
    skills?: Record<string, boolean>
  }): Promise<{
    agent: ConsoleGatewaySnapshot['agents'][number]
  }>
  createProviderProfile(input: {
    providerId: string
    label: string
    secretRef?: string
    secretValue?: string
    defaultModelId?: string
  }): Promise<{
    providerProfile: ConsoleGatewaySnapshot['providerProfiles'][number]
  }>
  updateProviderProfile(input: {
    profileId: string
    providerId?: string
    label?: string
    secretRef?: string
    secretValue?: string
    defaultModelId?: string
    status?: 'active' | 'archived'
  }): Promise<{
    providerProfile: ConsoleGatewaySnapshot['providerProfiles'][number]
  }>
  createCronSchedule(input: {
    sessionId: string
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    computerId?: string
    label: string
    prompt: string
    cronExpr: string
    timezone?: 'local' | 'utc'
    allowedTools?: string[]
      runtimeProfile?: string
    enabled?: boolean
  }): Promise<{ cronSchedule: NonNullable<ConsoleGatewaySnapshot['cronSchedules']>[number] }>
  updateCronSchedule(input: {
    scheduleId: string
    sessionId?: string
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    computerId?: string
    label?: string
    prompt?: string
    cronExpr?: string
    timezone?: 'local' | 'utc'
    allowedTools?: string[]
    runtimeProfile?: string
    enabled?: boolean
  }): Promise<{ cronSchedule: NonNullable<ConsoleGatewaySnapshot['cronSchedules']>[number] }>
  deleteCronSchedule(input: { scheduleId: string }): Promise<{ scheduleId: string; deleted: true }>
  runCronNow(input: { scheduleId: string }): Promise<{ run: { runId: string; sessionId: string } }>
  cronGrant(input: { scheduleId: string }): Promise<{
    cronGrant: {
      scheduleId: string
      sessionId: string
      agentId: string
      workspaceId?: string
      cronMode: string
      headless: true
      grantRequired: boolean
      grantPresent: boolean
      scheduleKey: string
      allowedTools: string[]
      decision: {
        decisionId: string
        state: string
        reasons: string[]
        permissionCategories: string[]
        inputHash: string
        manifestHash: string
        policyHash: string
        metadata?: unknown
      }
      grant?: {
        grantId: string
        mode: string
        promptHash: string
        scheduleHash: string
        allowedTools: string[]
        expiresAt: string
        maxExecutionCount: number
        executionCount: number
        createdAt: string
      }
      lastDecision?: {
        decisionId: string
        state: string
        decidedAt: string
        reasons: string[]
      }
    }
  }>
  createCronGrant(input: {
    scheduleId: string
    expiresAt?: string
    expiresInMs?: number
    maxExecutionCount?: number
    actor?: string
  }): Promise<{
    cronGrant: Awaited<ReturnType<LocalGatewayClient['cronGrant']>>['cronGrant']
    cronSchedule?: NonNullable<ConsoleGatewaySnapshot['cronSchedules']>[number]
  }>
  createBudget(input: {
    scopeType: 'client' | 'workspace' | 'agent'
    scopeId: string
    label: string
    maxEstimatedCostUsd: number
    warnAtUsd?: number
    status?: 'active' | 'archived'
  }): Promise<{ budget: NonNullable<ConsoleGatewaySnapshot['budgets']>[number] }>
  updateBudget(input: {
    budgetId: string
    label?: string
    maxEstimatedCostUsd?: number
    warnAtUsd?: number
    status?: 'active' | 'archived'
  }): Promise<{ budget: NonNullable<ConsoleGatewaySnapshot['budgets']>[number] }>
  deleteBudget(input: { budgetId: string }): Promise<{ budgetId: string; deleted: true }>
  startRun(input: {
    sessionId: string
    input: string
    mode: 'chat' | 'task' | 'automation-test' | 'agent-test'
    allowedTools: string[]
    allowBudgetWarning?: boolean
    computerId?: string
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    providerId?: string
    modelId?: string
    runtimeProfile?: string
  }): Promise<{ run: { runId: string; sessionId: string } }>
  cancelRun(input: { sessionId: string; runId: string; reason?: string }): Promise<{
    runId: string
    sessionId: string
    cancelled: true
  }>
  compatibilityRuns(input?: {
    sessionId?: string
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{
    runs: ConsoleGatewaySnapshot['runs']
    nextCursor?: string
  }>
  runLogRuns(input?: {
    sessionId?: string
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{
    runs: ConsoleGatewayRunLogRun[]
    nextCursor?: string
  }>
  runLogTrace(input: {
    runId: string
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{
    runId: string
    sessionId: string
    events: ConsoleGatewayRunEvent[]
    nextCursor?: string
  }>
  approvalHistory(input?: {
    status?: 'pending' | 'approved' | 'denied' | 'cancelled'
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{
    approvals: GatewayApprovalHistoryItem[]
    nextCursor?: string
  }>
  runEvents(input: { sessionId: string; runId: string }): Promise<{ events: ConsoleGatewayRunEvent[] }>
  resolveApproval(input: {
    approvalId: string
    sessionId: string
    runId: string
    decision: 'approved' | 'denied'
    reason?: string
  }): Promise<{ approvalId: string; status: 'approved' | 'denied' }>
  resolveRunLogApproval(input: {
    approvalId: string
    sessionId: string
    runId: string
    decision: 'approved' | 'denied'
    reason?: string
  }): Promise<{
    run: { runId: string; sessionId: string; status: string }
    status: string
    pendingApprovals: unknown[]
  }>
}

export function createLocalGatewayClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): LocalGatewayClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  let sessionToken: string | undefined

  const authHeaders = (): Record<string, string> =>
    sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}

  return {
    health: (input = {}) => requestJson(fetchImpl, `${normalizedBaseUrl}/health`, {
      headers: authHeaders(),
      ...(input.signal ? { signal: input.signal } : {}),
    }),
    snapshot: () => requestJson(fetchImpl, `${normalizedBaseUrl}/snapshot`, { headers: authHeaders() }),
    snapshotIfChanged: async (input = {}) => {
      const etag = input.etag?.trim()
      const response = await fetchImpl(`${normalizedBaseUrl}/snapshot`, {
        headers: {
          ...authHeaders(),
          ...(etag ? { 'if-none-match': etag } : {}),
        },
        ...(input.signal ? { signal: input.signal } : {}),
      })
      const responseEtag = response.headers.get('etag')?.trim() || undefined
      if (response.status === 304) {
        const effectiveEtag = responseEtag ?? etag
        return { kind: 'not-modified', ...(effectiveEtag ? { etag: effectiveEtag } : {}) }
      }
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || `Gateway request failed: ${response.status}`)
      }
      assertBrowserSafeGatewayPayload(`${normalizedBaseUrl}/snapshot`, payload)
      return {
        kind: 'updated',
        snapshot: payload as ConsoleGatewaySnapshot,
        ...(responseEtag ? { etag: responseEtag } : {}),
      }
    },
    authSession: () => requestJson(fetchImpl, `${normalizedBaseUrl}/auth/session`, { headers: authHeaders() }),
    bootstrapAuth: (input) =>
      requestJson<Awaited<ReturnType<LocalGatewayClient['bootstrapAuth']>>>(fetchImpl, `${normalizedBaseUrl}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    login: async (input) => {
      const response = await requestJsonWithResponse<Awaited<ReturnType<LocalGatewayClient['login']>>>(fetchImpl, `${normalizedBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      const authToken = response.response.headers.get('x-mainspring-auth-token')?.trim()
      sessionToken = authToken || undefined
      return response.payload
    },
    logout: async () => {
      const payload = await requestJson<Awaited<ReturnType<LocalGatewayClient['logout']>>>(fetchImpl, `${normalizedBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: authHeaders(),
      })
      sessionToken = undefined
      return payload
    },
    setSessionToken: (value) => {
      sessionToken = value?.trim() || undefined
    },
    getSessionToken: () => sessionToken,
    browserAccessUrl: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/auth/browser-access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    openRouterModels: (input = {}) =>
      requestJson(
        fetchImpl,
        `${normalizedBaseUrl}/providers/openrouter/models${queryString({
          q: input.q,
          limit: input.limit === undefined ? undefined : String(input.limit),
          supportedParameter: input.supportedParameter,
          sort: input.sort,
        })}`,
        { headers: authHeaders() },
      ),
    toolCalls: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/tool-calls${queryString(input)}`, { headers: authHeaders() }),
    deploymentTargets: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-targets${queryString(input)}`, { headers: authHeaders() }),
    deploymentRuns: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-runs${queryString(input)}`, { headers: authHeaders() }),
    createDeploymentTarget: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-targets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    updateDeploymentTarget: ({ targetId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-targets/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    planDeployment: ({ targetId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-targets/${encodeURIComponent(targetId)}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    executeDeployment: ({ targetId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/deployment-targets/${encodeURIComponent(targetId)}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    marketplaceTemplates: () =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/marketplace/templates`, {
        headers: authHeaders(),
      }),
    syncRemoteMarketplace: () =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/marketplace/remotes/sync`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    installMarketplaceTemplate: ({ templateId, ...input }) =>
      requestJson(
        fetchImpl,
        `${normalizedBaseUrl}/marketplace/templates/${encodeURIComponent(templateId)}/install`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders() },
          body: JSON.stringify(input),
        },
      ),
    provenanceReviews: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/provenance-reviews${queryString(input)}`, {
        headers: authHeaders(),
      }),
    decideProvenanceReview: ({ reviewId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/provenance-reviews/${encodeURIComponent(reviewId)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    applyProvenanceReview: ({ reviewId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/provenance-reviews/${encodeURIComponent(reviewId)}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    cells: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cells${queryString(input)}`, { headers: authHeaders() }),
    cellStatus: () =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cells/status`, { headers: authHeaders() }),
    executionBackendStatus: () =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/execution-backends/status`, { headers: authHeaders() }),
    cellLeases: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cell-leases${queryString(input)}`, { headers: authHeaders() }),
    cellSnapshots: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cell-snapshots${queryString(input)}`, { headers: authHeaders() }),
    cronSchedules: () => requestJson(fetchImpl, `${normalizedBaseUrl}/cron`, { headers: authHeaders() }),
    budgets: () => requestJson(fetchImpl, `${normalizedBaseUrl}/budgets`, { headers: authHeaders() }),
    budgetStatus: () => requestJson(fetchImpl, `${normalizedBaseUrl}/budgets/status`, { headers: authHeaders() }),
    usageStatus: () => requestJson(fetchImpl, `${normalizedBaseUrl}/usage/status`, { headers: authHeaders() }),
    usageHistory: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/usage-history${queryString({
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    artifactHistory: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/artifact-history${queryString({
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    auditHistory: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/audit-history${queryString({
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    memoryHistory: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/memory-history${queryString({
        workspaceId: input.workspaceId,
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    cronStatus: () => requestJson(fetchImpl, `${normalizedBaseUrl}/cron/status`, { headers: authHeaders() }),
    deleteClient: ({ clientId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    createClient: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/clients`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    createWorkspace: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/workspaces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    deleteWorkspace: ({ workspaceId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    updateClient: ({ clientId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/clients/${encodeURIComponent(clientId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    createAgent: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/agents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    updateAgent: ({ agentId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    createProviderProfile: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/provider-profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    updateProviderProfile: ({ profileId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/provider-profiles/${encodeURIComponent(profileId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    createCronSchedule: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    updateCronSchedule: ({ scheduleId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron/${encodeURIComponent(scheduleId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    deleteCronSchedule: ({ scheduleId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    runCronNow: ({ scheduleId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron/${encodeURIComponent(scheduleId)}/run-now`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    cronGrant: ({ scheduleId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron/${encodeURIComponent(scheduleId)}/grant`, {
        headers: authHeaders(),
      }),
    createCronGrant: ({ scheduleId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/cron/${encodeURIComponent(scheduleId)}/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    createBudget: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/budgets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    updateBudget: ({ budgetId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/budgets/${encodeURIComponent(budgetId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    deleteBudget: ({ budgetId }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/budgets/${encodeURIComponent(budgetId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    startRun: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    cancelRun: ({ runId, ...input }) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
      }),
    compatibilityRuns: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/compatibility/runs${queryString({
        sessionId: input.sessionId,
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    runLogRuns: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runlog/runs${queryString({
        sessionId: input.sessionId,
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    runLogTrace: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runlog/runs/${encodeURIComponent(input.runId)}/trace${queryString({
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    approvalHistory: (input = {}) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/approval-history${queryString({
        status: input.status,
        cursor: input.cursor,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`, {
        headers: authHeaders(),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    runEvents: (input) =>
      requestJson(
        fetchImpl,
        `${normalizedBaseUrl}/runs/${encodeURIComponent(input.runId)}/events?sessionId=${encodeURIComponent(input.sessionId)}`,
        { headers: authHeaders() },
      ),
    resolveApproval: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/approvals/${encodeURIComponent(input.approvalId)}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          sessionId: input.sessionId,
          runId: input.runId,
          decision: input.decision,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      }),
    resolveRunLogApproval: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runlog/approvals/${encodeURIComponent(input.approvalId)}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          sessionId: input.sessionId,
          runId: input.runId,
          decision: input.decision,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      }),
  }
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const { payload } = await requestJsonWithResponse<T>(fetchImpl, url, init)
  return payload
}

async function requestJsonWithResponse<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<{ payload: T; response: Response }> {
  const response = await fetchImpl(url, init)
  const payload = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Gateway request failed: ${response.status}`)
  }
  assertBrowserSafeGatewayPayload(url, payload)
  return { payload: payload as T, response }
}

function queryString(input: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.trim()) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

function assertBrowserSafeGatewayPayload(url: string, payload: unknown): void {
  const serialized = JSON.stringify(payload)
  for (const needle of browserUnsafeGatewayTextMarkers()) {
    if (serialized.includes(needle)) {
      throw new Error(`Gateway response for ${new URL(url).pathname} contained browser-unsafe data.`)
    }
  }
  if (containsBrowserUnsafeGatewayText(serialized)) {
    throw new Error(`Gateway response for ${new URL(url).pathname} contained browser-unsafe data.`)
  }
}
