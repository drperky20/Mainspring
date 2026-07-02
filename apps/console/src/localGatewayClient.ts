import type { ConsoleExecutionBackendStatus, ConsoleGatewayRunEvent, ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  browserUnsafeGatewayTextMarkers,
  containsBrowserUnsafeGatewayText,
} from 'mainspring/gateway/browser-safety'

export interface LocalGatewayClient {
  health(): Promise<{
    mode: string
    health: { ok: boolean; running: boolean; activeSessions: number }
    auth?: {
      authMode: 'local-dev' | 'hosted'
      authenticated: boolean
      bootstrapRequired: boolean
      user?: { userId: string; username: string; role: 'admin' }
      expiresAt?: string
    }
  }>
  snapshot(): Promise<ConsoleGatewaySnapshot>
  authSession(): Promise<{
    auth: {
      authMode: 'hosted'
      authenticated: boolean
      bootstrapRequired: boolean
      user?: { userId: string; username: string; role: 'admin' }
      expiresAt?: string
    }
  }>
  bootstrapAuth(input: { username: string; password: string }): Promise<{
    user: { userId: string; username: string; role: 'admin' }
  }>
  login(input: { username: string; password: string }): Promise<{
    user: { userId: string; username: string; role: 'admin' }
    expiresAt: string
  }>
  logout(): Promise<{ loggedOut: true }>
  setSessionToken(sessionToken?: string): void
  getSessionToken(): string | undefined
  browserAccessUrl(input:
    | { kind: 'artifact'; artifactId: string }
    | { kind: 'event-stream'; sessionId?: string; runId?: string }
  ): Promise<{ kind: 'artifact' | 'event-stream'; url: string; expiresAt: string }>
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
    kind: 'local' | 'vps' | 'container'
    config?: {
      sshHost: string
      sshUser: string
      sshPort?: number
      remoteRoot: string
      serviceName: string
      envFilePath?: string
      domain?: string
      caddyConfigPath?: string
    }
  }): Promise<{
    deploymentTarget: NonNullable<ConsoleGatewaySnapshot['deploymentTargets']>[number]
  }>
  updateDeploymentTarget(input: {
    targetId: string
    workspaceId?: string
    label?: string
    kind?: 'local' | 'vps' | 'container'
    status?: 'active' | 'archived'
    config?: {
      sshHost: string
      sshUser: string
      sshPort?: number
      remoteRoot: string
      serviceName: string
      envFilePath?: string
      domain?: string
      caddyConfigPath?: string
    }
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
      targetKind: 'local' | 'vps' | 'container'
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
      targetKind: 'local' | 'vps' | 'container'
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
      provenance: 'repo-examples'
      providerId?: string
      modelId?: string
      runtimeProfile?: 'core' | 'core-browser' | 'core-browser-memory'
      allowedTools: string[]
      approvalMode?: string
    }>
  }>
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
    runtimeProfile?: 'core' | 'core-browser' | 'core-browser-memory'
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
    runtimeProfile?: 'core' | 'core-browser' | 'core-browser-memory'
    enabled?: boolean
  }): Promise<{ cronSchedule: NonNullable<ConsoleGatewaySnapshot['cronSchedules']>[number] }>
  deleteCronSchedule(input: { scheduleId: string }): Promise<{ scheduleId: string; deleted: true }>
  runCronNow(input: { scheduleId: string }): Promise<{ run: { runId: string; sessionId: string } }>
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
    mode: 'chat'
    allowedTools: string[]
    allowBudgetWarning?: boolean
    computerId?: string
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    providerId?: string
    modelId?: string
    runtimeProfile?: 'core' | 'core-browser' | 'core-browser-memory'
  }): Promise<{ run: { runId: string; sessionId: string } }>
  runEvents(input: { sessionId: string; runId: string }): Promise<{ events: ConsoleGatewayRunEvent[] }>
  resolveApproval(input: {
    approvalId: string
    sessionId: string
    runId: string
    decision: 'approved' | 'denied'
    reason?: string
  }): Promise<{ approvalId: string; status: 'approved' | 'denied' }>
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
    health: () => requestJson(fetchImpl, `${normalizedBaseUrl}/health`, { headers: authHeaders() }),
    snapshot: () => requestJson(fetchImpl, `${normalizedBaseUrl}/snapshot`, { headers: authHeaders() }),
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
