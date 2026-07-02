import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import {
  consoleAgent,
  consoleBudget,
  consoleBudgetStatus,
  consoleCellStatus,
  consoleClient,
  consoleCronRuntimeStatus,
  consoleCronSchedule,
  consoleDeploymentExecution,
  consoleDeploymentPlan,
  consoleDeploymentRun,
  consoleDeploymentTarget,
  consoleMarketplaceInstall,
  consoleMarketplaceTemplate,
  consoleProviderProfile,
  consoleRunEvent,
  consoleRunDispatch,
  consoleSession,
  consoleUsageStatus,
  consoleWorkspace,
  gatewaySnapshotToConsoleState,
  gatewaySnapshotToExecutionBackendStatus,
  type LocalGatewayEventListInput,
} from '../index.js'
import type { LocalMainspringGateway } from '../LocalGateway.js'
import type { RunEvent } from '../../contracts/runtime.js'
import type { RunLogEvent, RunRecord as RunLogRunRecord } from '../../core/types.js'
import type { RunLogRunProjection } from '../../hosts/runlog/RunLogProjection.js'
import { GatewayHttpError, asGatewayHttpError } from './errors.js'
import { HostedGatewayAuthManager } from './HostedAuth.js'
import {
  CreateAgentRequestSchema,
  CreateBudgetRequestSchema,
  CreateClientRequestSchema,
  CreateCronGrantRequestSchema,
  CreateCronScheduleRequestSchema,
  CreateDeploymentTargetRequestSchema,
  CreateProviderProfileRequestSchema,
  CreateWorkspaceRequestSchema,
  DeploymentPlanRequestSchema,
  ExecuteDeploymentRequestSchema,
  InstallMarketplaceTemplateRequestSchema,
  ResolveApprovalRequestSchema,
  StartRunRequestSchema,
  UpdateClientRequestSchema,
  UpdateDeploymentTargetRequestSchema,
  UpdateAgentRequestSchema,
  UpdateBudgetRequestSchema,
  UpdateCronScheduleRequestSchema,
  UpdateProviderProfileRequestSchema,
  type CreateAgentRequest,
  type CreateBudgetRequest,
  type CreateClientRequest,
  type CreateCronGrantRequest,
  type CreateCronScheduleRequest,
  type CreateDeploymentTargetRequest,
  type CreateProviderProfileRequest,
  type CreateWorkspaceRequest,
  type DeploymentPlanRequest,
  type ExecuteDeploymentRequest,
  type InstallMarketplaceTemplateRequest,
  type ResolveApprovalRequest,
  type StartRunRequest,
  type UpdateClientRequest,
  type UpdateDeploymentTargetRequest,
  type UpdateAgentRequest,
  type UpdateBudgetRequest,
  type UpdateCronScheduleRequest,
  type UpdateProviderProfileRequest,
} from './schemas.js'
import { sanitizeGatewayResponse } from './sanitize.js'
import {
  isBrowserUnsafeBrowserAccessQueryKey,
  redactBrowserUnsafeGatewayText,
} from '../browserSafety.js'

export interface CreateLocalGatewayServerOptions {
  gateway: LocalMainspringGateway
  host?: string
  port?: number
  auth?: {
    mode?: 'local-dev' | 'hosted'
    sessionTtlMs?: number
    bootstrapAdmin?: {
      username: string
      password: string
    }
  }
}

type BrowserAccessTicket = {
  ticket: string
  kind: 'artifact' | 'event-stream'
  artifactId?: string
  sessionId?: string
  runId?: string
  expiresAtMs: number
}

const BROWSER_ACCESS_TICKET_TTL_MS = 1000 * 60 * 5

export class LocalGatewayHttpServer {
  private readonly host: string
  private readonly port: number
  private readonly server: http.Server
  private readonly authMode: 'local-dev' | 'hosted'
  private readonly hostedAuth: HostedGatewayAuthManager | null
  private readonly browserAccessTickets = new Map<string, BrowserAccessTicket>()

  constructor(private readonly options: CreateLocalGatewayServerOptions) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 8787
    this.authMode = options.auth?.mode ?? 'local-dev'
    this.hostedAuth =
      this.authMode === 'hosted'
      ? options.gateway.appState
        ? new HostedGatewayAuthManager(
            options.gateway.appState,
            options.auth?.sessionTtlMs,
          )
        : null
      : null
    if (this.authMode === 'hosted' && !this.hostedAuth) {
      throw new Error('Hosted gateway auth requires local gateway app state.')
    }
    if (this.authMode === 'hosted' && options.auth?.bootstrapAdmin && this.hostedAuth?.bootstrapRequired()) {
      this.hostedAuth.bootstrapAdmin(options.auth.bootstrapAdmin)
    }
    this.server = http.createServer((request, response) => {
      void this.handle(request, response)
    })
  }

  async start(): Promise<{ host: string; port: number; url: string }> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject)
        resolve()
      })
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Gateway server failed to bind to a TCP address.')
    }
    return {
      host: this.host,
      port: address.port,
      url: `http://${this.host}:${address.port}`,
    }
  }

  async stop(): Promise<void> {
    if (!this.server.listening) return
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.applyCors(response)
    if (!request.url) {
      this.writeJson(response, 400, { error: 'Missing request URL.' })
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    try {
      const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`)
      const path = url.pathname

      if (request.method === 'GET' && path === '/health') {
        const health = this.options.gateway.snapshot().health
        this.writeJson(response, 200, {
          mode: this.authMode === 'hosted' ? 'local-gateway-hosted' : 'local-gateway-dev',
          host: this.host,
          health: {
            ok: health.ok,
            running: health.running,
            activeSessions: health.activeSessions,
          },
          auth:
            this.authMode === 'hosted'
              ? this.hostedAuth!.sessionView(this.readSessionToken(request))
              : { authMode: 'local-dev', authenticated: true, bootstrapRequired: false },
        })
        return
      }

      if (request.method === 'POST' && path === '/auth/bootstrap') {
        this.assertHostedAuth()
        const body = await this.readJson(request)
        const payload = body as { username?: string; password?: string }
        const user = this.hostedAuth!.bootstrapAdmin({
          username: String(payload.username ?? ''),
          password: String(payload.password ?? ''),
        })
        this.writeJson(response, 201, sanitizeGatewayResponse({
          user: { userId: user.userId, username: user.username, role: user.role },
        }))
        return
      }

      if (request.method === 'POST' && path === '/auth/login') {
        this.assertHostedAuth()
        const body = await this.readJson(request)
        const payload = body as { username?: string; password?: string }
        const result = this.hostedAuth!.login({
          username: String(payload.username ?? ''),
          password: String(payload.password ?? ''),
        })
        this.writeJson(
          response,
          200,
          {
            expiresAt: result.session.expiresAt,
            user: {
              userId: result.user.userId,
              username: result.user.username,
              role: result.user.role,
            },
          },
          { 'x-mainspring-auth-token': result.sessionToken },
        )
        return
      }

      if (request.method === 'GET' && path === '/auth/session') {
        this.assertHostedAuth()
        this.writeJson(response, 200, sanitizeGatewayResponse({
          auth: this.hostedAuth!.sessionView(this.readSessionToken(request)),
        }))
        return
      }

      if (request.method === 'POST' && path === '/auth/logout') {
        this.assertHostedAuth()
        this.hostedAuth!.logout(this.readSessionToken(request))
        this.writeJson(response, 200, { loggedOut: true })
        return
      }

      this.requireAuthorizedRequest(request, url, {
        allowBrowserAccessTicket: this.allowsBrowserAccessTicketForRoute(request.method ?? 'GET', path),
      })

      if (request.method === 'POST' && path === '/auth/browser-access') {
        const body = await this.readJson(request)
        this.writeJson(response, 201, this.createBrowserAccessUrl(url, body))
        return
      }

      if (request.method === 'GET' && path === '/snapshot') {
        this.writeJson(
          response,
          200,
          gatewaySnapshotToConsoleState(this.options.gateway.snapshot()),
        )
        return
      }

      if (request.method === 'GET' && path === '/execution-backends/status') {
        this.writeJson(
          response,
          200,
          { executionBackends: gatewaySnapshotToExecutionBackendStatus(this.options.gateway.snapshot()) },
        )
        return
      }

      if (request.method === 'GET' && path === '/cron') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        this.writeJson(response, 200, { cronSchedules: snapshot.cronSchedules ?? [] })
        return
      }

      if (request.method === 'GET' && path === '/cron/status') {
        this.writeJson(response, 200, { cron: consoleCronRuntimeStatus(this.options.gateway.cron.status()) })
        return
      }

      if (request.method === 'GET' && path === '/budgets') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        this.writeJson(response, 200, { budgets: snapshot.budgets ?? [] })
        return
      }

      if (request.method === 'GET' && path === '/budgets/status') {
        this.writeJson(response, 200, { budgetStatus: consoleBudgetStatus(this.options.gateway.budgets.status()) })
        return
      }

      if (request.method === 'GET' && path === '/usage/status') {
        this.writeJson(response, 200, { usageStatus: consoleUsageStatus(this.options.gateway.usage.status()) })
        return
      }

      if (request.method === 'GET' && path === '/sessions') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        this.writeJson(
          response,
          200,
          { sessions: snapshot.sessions },
        )
        return
      }

      if (request.method === 'GET' && path === '/runs') {
        const sessionId = url.searchParams.get('sessionId')
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const runs = sessionId
          ? snapshot.runs.filter((run) => run.sessionId === sessionId)
          : snapshot.runs
        this.writeJson(response, 200, { runs })
        return
      }

      if (request.method === 'GET' && path === '/approvals') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        this.writeJson(response, 200, { approvals: snapshot.approvals })
        return
      }

      if (request.method === 'GET' && path === '/tool-calls') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const runId = url.searchParams.get('runId')
        const sessionId = url.searchParams.get('sessionId')
        const workspaceId = url.searchParams.get('workspaceId')
        const status = url.searchParams.get('status')
        const toolCalls = (snapshot.toolCalls ?? []).filter((toolCall) =>
          (!runId || toolCall.runId === runId)
          && (!sessionId || toolCall.sessionId === sessionId)
          && (!workspaceId || toolCall.workspaceId === workspaceId)
          && (!status || toolCall.status === status),
        )
        this.writeJson(response, 200, { toolCalls })
        return
      }

      if (request.method === 'GET' && path === '/deployment-targets') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const workspaceId = url.searchParams.get('workspaceId')
        const deploymentTargets = (snapshot.deploymentTargets ?? []).filter((target) =>
          !workspaceId || target.workspaceId === workspaceId,
        )
        this.writeJson(response, 200, { deploymentTargets })
        return
      }

      if (request.method === 'GET' && path === '/deployment-runs') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const targetId = url.searchParams.get('targetId')
        const runId = url.searchParams.get('runId')
        const sessionId = url.searchParams.get('sessionId')
        const status = url.searchParams.get('status')
        const deploymentRuns = (snapshot.deploymentRuns ?? []).filter((deploymentRun) =>
          (!targetId || deploymentRun.targetId === targetId)
          && (!runId || deploymentRun.runId === runId)
          && (!sessionId || deploymentRun.sessionId === sessionId)
          && (!status || deploymentRun.status === status),
        )
        this.writeJson(response, 200, { deploymentRuns })
        return
      }

      if (request.method === 'GET' && path === '/marketplace/templates') {
        this.writeJson(
          response,
          200,
          { templates: this.options.gateway.marketplace.listTemplates().map(consoleMarketplaceTemplate) },
        )
        return
      }

      if (request.method === 'POST' && path === '/deployment-targets') {
        const body = await this.readJson(request)
        const parsed = CreateDeploymentTargetRequestSchema.parse(body)
        const deploymentTarget = this.createDeploymentTarget(parsed)
        this.writeJson(response, 201, sanitizeGatewayResponse({
          deploymentTarget: consoleDeploymentTarget(deploymentTarget),
        }))
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/deployment-targets/')) {
        const targetId = decodeURIComponent(path.slice('/deployment-targets/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateDeploymentTargetRequestSchema.parse(body)
        const deploymentTarget = this.updateDeploymentTarget(targetId, parsed)
        this.writeJson(response, 200, sanitizeGatewayResponse({
          deploymentTarget: consoleDeploymentTarget(deploymentTarget),
        }))
        return
      }

      if (request.method === 'POST' && path.startsWith('/deployment-targets/') && path.endsWith('/plan')) {
        const targetId = decodeURIComponent(path.slice('/deployment-targets/'.length, -'/plan'.length))
        const body = await this.readJson(request)
        const parsed = DeploymentPlanRequestSchema.parse(body)
        const deploymentPlan = this.planDeployment(targetId, parsed)
        this.writeJson(response, 200, { deploymentPlan: consoleDeploymentPlan(deploymentPlan) })
        return
      }

      if (request.method === 'POST' && path.startsWith('/deployment-targets/') && path.endsWith('/execute')) {
        const targetId = decodeURIComponent(path.slice('/deployment-targets/'.length, -'/execute'.length))
        const body = await this.readJson(request)
        const parsed = ExecuteDeploymentRequestSchema.parse(body)
        const deploymentExecution = this.executeDeployment(targetId, parsed)
        this.writeJson(response, 202, consoleDeploymentExecution(deploymentExecution))
        return
      }

      if (request.method === 'POST' && path.startsWith('/marketplace/templates/') && path.endsWith('/install')) {
        const templateId = decodeURIComponent(
          path.slice('/marketplace/templates/'.length, -'/install'.length),
        )
        const body = await this.readJson(request)
        const parsed = InstallMarketplaceTemplateRequestSchema.parse(body)
        const installed = this.installMarketplaceTemplate(templateId, parsed)
        this.writeJson(response, 201, sanitizeGatewayResponse(consoleMarketplaceInstall(installed)))
        return
      }

      if (request.method === 'GET' && path === '/cells') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const workspaceId = url.searchParams.get('workspaceId')
        const cells = (snapshot.cells ?? []).filter((cell) =>
          !workspaceId || cell.workspaceId === workspaceId,
        )
        this.writeJson(response, 200, { cells })
        return
      }

      if (request.method === 'GET' && path === '/cells/status') {
        this.writeJson(response, 200, { cellStatus: consoleCellStatus(this.options.gateway.cells.status()) })
        return
      }

      if (request.method === 'GET' && path === '/cell-leases') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const cellId = url.searchParams.get('cellId')
        const runId = url.searchParams.get('runId')
        const sessionId = url.searchParams.get('sessionId')
        const status = url.searchParams.get('status')
        const cellLeases = (snapshot.cellLeases ?? []).filter((lease) =>
          (!cellId || lease.cellId === cellId)
          && (!runId || lease.runId === runId)
          && (!sessionId || lease.sessionId === sessionId)
          && (!status || lease.status === status),
        )
        this.writeJson(response, 200, { cellLeases })
        return
      }

      if (request.method === 'GET' && path === '/cell-snapshots') {
        const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
        const cellId = url.searchParams.get('cellId')
        const leaseId = url.searchParams.get('leaseId')
        const cellSnapshots = (snapshot.cellSnapshots ?? []).filter((cellSnapshot) =>
          (!cellId || cellSnapshot.cellId === cellId)
          && (!leaseId || cellSnapshot.leaseId === leaseId),
        )
        this.writeJson(response, 200, { cellSnapshots })
        return
      }

      if (request.method === 'GET' && path.startsWith('/artifacts/')) {
        const artifactId = decodeURIComponent(path.slice('/artifacts/'.length))
        await this.writeArtifact(response, artifactId, url.searchParams.get('download') === '1')
        return
      }

      if (request.method === 'POST' && path === '/clients') {
        const body = await this.readJson(request)
        const parsed = CreateClientRequestSchema.parse(body)
        const created = this.createClient(parsed)
        this.writeJson(response, 201, {
          client: consoleClient(created.client),
          ...(created.workspace ? { workspace: consoleWorkspace(created.workspace) } : {}),
          ...(created.session ? { session: consoleSession(created.session) } : {}),
        })
        return
      }

      if (request.method === 'DELETE' && path.startsWith('/clients/')) {
        const clientId = decodeURIComponent(path.slice('/clients/'.length))
        const deleted = this.deleteClient(clientId)
        this.writeJson(response, 200, sanitizeGatewayResponse(deleted))
        return
      }

      if (request.method === 'POST' && path === '/workspaces') {
        const body = await this.readJson(request)
        const parsed = CreateWorkspaceRequestSchema.parse(body)
        const created = this.createWorkspace(parsed)
        this.writeJson(response, 201, {
          workspace: consoleWorkspace(created.workspace),
          session: consoleSession(created.session),
        })
        return
      }

      if (request.method === 'DELETE' && path.startsWith('/workspaces/')) {
        const workspaceId = decodeURIComponent(path.slice('/workspaces/'.length))
        const deleted = this.deleteWorkspace(workspaceId)
        this.writeJson(response, 200, sanitizeGatewayResponse(deleted))
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/clients/')) {
        const clientId = decodeURIComponent(path.slice('/clients/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateClientRequestSchema.parse(body)
        const updated = this.updateClient(clientId, parsed)
        this.writeJson(response, 200, {
          client: consoleClient(updated.client),
          ...(updated.workspace ? { workspace: consoleWorkspace(updated.workspace) } : {}),
        })
        return
      }

      if (request.method === 'POST' && path === '/agents') {
        const body = await this.readJson(request)
        const parsed = CreateAgentRequestSchema.parse(body)
        const agent = this.createAgent(parsed)
        this.writeJson(response, 201, { agent: consoleAgent(agent) })
        return
      }

      if (request.method === 'POST' && path === '/provider-profiles') {
        const body = await this.readJson(request)
        const parsed = CreateProviderProfileRequestSchema.parse(body)
        const profile = this.createProviderProfile(parsed)
        this.writeJson(response, 201, { providerProfile: consoleProviderProfile(profile) })
        return
      }

      if (request.method === 'POST' && path === '/cron') {
        const body = await this.readJson(request)
        const parsed = CreateCronScheduleRequestSchema.parse(body)
        const schedule = this.createCronSchedule(parsed)
        this.writeJson(response, 201, sanitizeGatewayResponse({
          cronSchedule: consoleCronSchedule(schedule),
        }))
        return
      }

      if (request.method === 'POST' && path === '/budgets') {
        const body = await this.readJson(request)
        const parsed = CreateBudgetRequestSchema.parse(body)
        const budget = this.createBudget(parsed)
        this.writeJson(response, 201, sanitizeGatewayResponse({
          budget: consoleBudget(budget),
        }))
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/agents/')) {
        const agentId = decodeURIComponent(path.slice('/agents/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateAgentRequestSchema.parse(body)
        const agent = this.updateAgent(agentId, parsed)
        this.writeJson(response, 200, { agent: consoleAgent(agent) })
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/provider-profiles/')) {
        const profileId = decodeURIComponent(path.slice('/provider-profiles/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateProviderProfileRequestSchema.parse(body)
        const profile = this.updateProviderProfile(profileId, parsed)
        this.writeJson(response, 200, { providerProfile: consoleProviderProfile(profile) })
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/cron/')) {
        const scheduleId = decodeURIComponent(path.slice('/cron/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateCronScheduleRequestSchema.parse(body)
        const schedule = this.updateCronSchedule(scheduleId, parsed)
        this.writeJson(response, 200, sanitizeGatewayResponse({
          cronSchedule: consoleCronSchedule(schedule),
        }))
        return
      }

      if (request.method === 'PATCH' && path.startsWith('/budgets/')) {
        const budgetId = decodeURIComponent(path.slice('/budgets/'.length))
        const body = await this.readJson(request)
        const parsed = UpdateBudgetRequestSchema.parse(body)
        const budget = this.updateBudget(budgetId, parsed)
        this.writeJson(response, 200, sanitizeGatewayResponse({
          budget: consoleBudget(budget),
        }))
        return
      }

      if (request.method === 'GET' && path === '/events/stream') {
        await this.handleEventStream(request, response, url)
        return
      }

      if (request.method === 'POST' && path === '/runs/start') {
        const body = await this.readJson(request)
        const parsed = StartRunRequestSchema.parse(body)
        const run = await this.startRun(parsed)
        this.writeJson(response, 202, sanitizeGatewayResponse({ run: consoleRunDispatch(run) }))
        return
      }

      if (request.method === 'POST' && path === '/runlog/runs/start') {
        if (!this.options.gateway.runLog.available()) {
          throw new GatewayHttpError(501, 'RunLog gateway runtime is not configured.')
        }
        const body = await this.readJson(request)
        const parsed = StartRunRequestSchema.parse(body)
        const result = await this.options.gateway.runLog.runs.start(parsed)
        this.writeJson(response, 202, sanitizeGatewayResponse(runLogProjectionResponse(result.projection)))
        return
      }

      if (request.method === 'GET' && path.startsWith('/runs/') && path.endsWith('/events')) {
        const runId = decodeURIComponent(path.slice('/runs/'.length, -'/events'.length))
        const sessionId = url.searchParams.get('sessionId') ?? this.lookupSessionIdForRun(runId)
        if (!sessionId) throw new GatewayHttpError(404, `Unknown run: ${runId}`)
        const input: LocalGatewayEventListInput = {
          sessionId,
          runId,
          ...(url.searchParams.get('afterSeq')
            ? { afterSeq: Number.parseInt(url.searchParams.get('afterSeq') ?? '', 10) }
            : {}),
          ...(url.searchParams.get('limit')
            ? { limit: Number.parseInt(url.searchParams.get('limit') ?? '', 10) }
            : {}),
        }
        const events = this.options.gateway.events.list(input)
        this.writeJson(response, 200, { sessionId, runId, events: events.map(consoleRunEvent) })
        return
      }

      if (request.method === 'GET' && path.startsWith('/runlog/runs/') && path.endsWith('/events')) {
        if (!this.options.gateway.runLog.available()) {
          throw new GatewayHttpError(501, 'RunLog gateway runtime is not configured.')
        }
        const runId = decodeURIComponent(path.slice('/runlog/runs/'.length, -'/events'.length))
        const projection = this.options.gateway.runLog.runs.project(runId)
        this.writeJson(response, 200, sanitizeGatewayResponse(runLogProjectionResponse(projection)))
        return
      }

      if (request.method === 'POST' && path.startsWith('/approvals/') && path.endsWith('/resolve')) {
        const approvalId = decodeURIComponent(path.slice('/approvals/'.length, -'/resolve'.length))
        const body = await this.readJson(request)
        const parsed = ResolveApprovalRequestSchema.parse(body)
        this.resolveApproval(approvalId, parsed)
        this.writeJson(response, 200, { approvalId, status: parsed.decision })
        return
      }

      if (request.method === 'POST' && path.startsWith('/runlog/approvals/') && path.endsWith('/resolve')) {
        if (!this.options.gateway.runLog.available()) {
          throw new GatewayHttpError(501, 'RunLog gateway runtime is not configured.')
        }
        const approvalId = decodeURIComponent(path.slice('/runlog/approvals/'.length, -'/resolve'.length))
        const body = await this.readJson(request)
        const parsed = ResolveApprovalRequestSchema.parse(body)
        const projection =
          parsed.decision === 'approved'
            ? await this.options.gateway.runLog.approvals.approve({ ...parsed, approvalId })
            : await this.options.gateway.runLog.approvals.deny({ ...parsed, approvalId })
        this.writeJson(response, 200, sanitizeGatewayResponse(runLogProjectionResponse(projection)))
        return
      }

      if (request.method === 'POST' && path.startsWith('/cron/') && path.endsWith('/run-now')) {
        const scheduleId = decodeURIComponent(path.slice('/cron/'.length, -'/run-now'.length))
        const run = this.runCronNow(scheduleId)
        this.writeJson(response, 202, sanitizeGatewayResponse({ run: consoleRunDispatch(run) }))
        return
      }

      if (request.method === 'GET' && path.startsWith('/cron/') && path.endsWith('/grant')) {
        const scheduleId = decodeURIComponent(path.slice('/cron/'.length, -'/grant'.length))
        this.writeJson(
          response,
          200,
          sanitizeGatewayResponse({ cronGrant: this.previewCronGrant(scheduleId) }),
        )
        return
      }

      if (request.method === 'POST' && path.startsWith('/cron/') && path.endsWith('/grant')) {
        const scheduleId = decodeURIComponent(path.slice('/cron/'.length, -'/grant'.length))
        const body = await this.readJson(request)
        const parsed = CreateCronGrantRequestSchema.parse(body)
        const preview = this.createCronGrant(scheduleId, parsed)
        const schedule = this.options.gateway.cron.list().find((record) => record.scheduleId === scheduleId)
        this.writeJson(
          response,
          201,
          sanitizeGatewayResponse({
            cronGrant: preview,
            ...(schedule ? { cronSchedule: consoleCronSchedule(schedule) } : {}),
          }),
        )
        return
      }

      if (request.method === 'DELETE' && path.startsWith('/cron/')) {
        const scheduleId = decodeURIComponent(path.slice('/cron/'.length))
        this.writeJson(response, 200, sanitizeGatewayResponse(this.deleteCronSchedule(scheduleId)))
        return
      }

      if (request.method === 'DELETE' && path.startsWith('/budgets/')) {
        const budgetId = decodeURIComponent(path.slice('/budgets/'.length))
        this.writeJson(response, 200, sanitizeGatewayResponse(this.deleteBudget(budgetId)))
        return
      }

      throw new GatewayHttpError(404, `Unknown route: ${request.method ?? 'GET'} ${path}`)
    } catch (error) {
      const httpError = asGatewayHttpError(error)
      this.writeJson(response, httpError.statusCode, { error: httpError.message })
    }
  }

  private assertHostedAuth(): void {
    if (this.authMode !== 'hosted' || !this.hostedAuth) {
      throw new GatewayHttpError(404, 'Hosted auth is not enabled.')
    }
  }

  private requireAuthorizedRequest(
    request: IncomingMessage,
    url: URL,
    options: { allowBrowserAccessTicket?: boolean } = {},
  ): void {
    if (this.authMode !== 'hosted') return
    const session = this.hostedAuth!.resolveSession(this.readSessionToken(request))
    if (session) return
    if (options.allowBrowserAccessTicket && this.resolveBrowserAccessTicket(request.method ?? 'GET', url)) {
      return
    }
    throw new GatewayHttpError(401, 'Authentication required.')
  }

  private createBrowserAccessUrl(requestUrl: URL, body: unknown): {
    kind: 'artifact' | 'event-stream'
    url: string
    expiresAt: string
  } {
    const input = body as {
      kind?: string
      artifactId?: string
      sessionId?: string
      runId?: string
    }
    const kind = input.kind === 'artifact' || input.kind === 'event-stream' ? input.kind : undefined
    if (!kind) {
      throw new GatewayHttpError(400, 'Browser access kind must be artifact or event-stream.')
    }

    const expiresAtMs = Date.now() + BROWSER_ACCESS_TICKET_TTL_MS
    const expiresAt = new Date(expiresAtMs).toISOString()
    const ticket = this.authMode === 'hosted' ? randomBytes(24).toString('hex') : undefined
    const targetUrl = new URL(requestUrl.origin)

    if (kind === 'artifact') {
      const artifactId = input.artifactId?.trim()
      if (!artifactId) throw new GatewayHttpError(400, 'Artifact browser access requires artifactId.')
      const artifact = this.options.gateway.appState?.artifacts.get(artifactId)
      if (!artifact) throw new GatewayHttpError(404, `Unknown artifact: ${artifactId}`)
      targetUrl.pathname = `/artifacts/${encodeURIComponent(artifactId)}`
      if (ticket) {
        this.browserAccessTickets.set(ticket, { ticket, kind, artifactId, expiresAtMs })
        targetUrl.searchParams.set('ticket', ticket)
      }
      return { kind, url: targetUrl.toString(), expiresAt }
    }

    const sessionId = input.sessionId?.trim() || undefined
    const runId = input.runId?.trim() || undefined
    this.assertBrowserAccessEventStreamTarget(sessionId, runId)
    targetUrl.pathname = '/events/stream'
    if (sessionId) targetUrl.searchParams.set('sessionId', sessionId)
    if (runId) targetUrl.searchParams.set('runId', runId)
    if (ticket) {
      this.browserAccessTickets.set(ticket, { ticket, kind, sessionId, runId, expiresAtMs })
      targetUrl.searchParams.set('ticket', ticket)
    }
    return { kind, url: targetUrl.toString(), expiresAt }
  }

  private assertBrowserAccessEventStreamTarget(sessionId?: string, runId?: string): void {
    if (!sessionId && !runId) return
    if (sessionId && !this.options.gateway.sessions.list().some((session) => session.sessionId === sessionId)) {
      throw new GatewayHttpError(404, `Unknown session: ${sessionId}`)
    }
    if (!runId) return
    const run = gatewaySnapshotToConsoleState(this.options.gateway.snapshot()).runs.find(
      (candidate) => candidate.runId === runId,
    )
    if (!run) throw new GatewayHttpError(404, `Unknown run: ${runId}`)
    if (sessionId && run.sessionId !== sessionId) {
      throw new GatewayHttpError(404, `Run ${runId} does not belong to session ${sessionId}.`)
    }
  }

  private resolveBrowserAccessTicket(method: string, url: URL): boolean {
    if (method !== 'GET') return false
    if (hasUnsafeBrowserAccessQuery(url)) return false
    const ticketValue = url.searchParams.get('ticket')?.trim()
    if (!ticketValue) return false
    this.deleteExpiredBrowserAccessTickets()
    const ticket = this.browserAccessTickets.get(ticketValue)
    if (!ticket || ticket.expiresAtMs <= Date.now()) {
      this.browserAccessTickets.delete(ticketValue)
      return false
    }
    if (ticket.kind === 'artifact') {
      if (!url.pathname.startsWith('/artifacts/')) return false
      const artifactId = decodeURIComponent(url.pathname.slice('/artifacts/'.length))
      return artifactId === ticket.artifactId
    }
    if (url.pathname !== '/events/stream') return false
    const sessionId = url.searchParams.get('sessionId')?.trim() || undefined
    const runId = url.searchParams.get('runId')?.trim() || undefined
    return sessionId === ticket.sessionId && runId === ticket.runId
  }

  private deleteExpiredBrowserAccessTickets(now = Date.now()): void {
    for (const [ticket, record] of this.browserAccessTickets) {
      if (record.expiresAtMs <= now) this.browserAccessTickets.delete(ticket)
    }
  }

  private readSessionToken(
    request: IncomingMessage,
  ): string | undefined {
    const header = request.headers.authorization
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || undefined
    }
    return undefined
  }

  private allowsBrowserAccessTicketForRoute(method: string, path: string): boolean {
    return method === 'GET' && (path === '/events/stream' || path.startsWith('/artifacts/'))
  }

  private async startRun(input: StartRunRequest) {
    if (this.options.gateway.runLog?.available()) {
      const result = await this.options.gateway.runLog.runs.start(input)
      return result.run
    }
    if (input.providerProfileId) {
      return this.options.gateway.runs.startFromAppState(input)
    }
    return this.options.gateway.runs.start(input)
  }

  private createClient(input: CreateClientRequest) {
    return this.options.gateway.clients.create(input)
  }

  private updateClient(clientId: string, input: UpdateClientRequest) {
    return this.options.gateway.clients.update({
      clientId,
      ...input,
    })
  }

  private deleteClient(clientId: string) {
    return this.options.gateway.clients.delete(clientId)
  }

  private createWorkspace(input: CreateWorkspaceRequest) {
    return this.options.gateway.workspaces.create(input)
  }

  private deleteWorkspace(workspaceId: string) {
    return this.options.gateway.workspaces.delete(workspaceId)
  }

  private createAgent(input: CreateAgentRequest) {
    return this.options.gateway.agents.create(input)
  }

  private updateAgent(agentId: string, input: UpdateAgentRequest) {
    return this.options.gateway.agents.update({
      agentId,
      ...input,
    })
  }

  private createProviderProfile(input: CreateProviderProfileRequest) {
    return this.options.gateway.providerProfiles.create(input)
  }

  private updateProviderProfile(profileId: string, input: UpdateProviderProfileRequest) {
    return this.options.gateway.providerProfiles.update({
      profileId,
      ...input,
    })
  }

  private createCronSchedule(input: CreateCronScheduleRequest) {
    return this.options.gateway.cron.create(input)
  }

  private createBudget(input: CreateBudgetRequest) {
    return this.options.gateway.budgets.create(input)
  }

  private createDeploymentTarget(input: CreateDeploymentTargetRequest) {
    return this.options.gateway.deployments.createTarget({
      workspaceId: input.workspaceId,
      label: input.label,
      kind: input.kind,
      ...(input.config ? { metadata: input.config } : {}),
    })
  }

  private updateCronSchedule(scheduleId: string, input: UpdateCronScheduleRequest) {
    return this.options.gateway.cron.update({
      scheduleId,
      ...input,
    })
  }

  private updateBudget(budgetId: string, input: UpdateBudgetRequest) {
    return this.options.gateway.budgets.update({
      budgetId,
      ...input,
    })
  }

  private updateDeploymentTarget(targetId: string, input: UpdateDeploymentTargetRequest) {
    return this.options.gateway.deployments.updateTarget({
      targetId,
      workspaceId: input.workspaceId,
      label: input.label,
      kind: input.kind,
      status: input.status,
      ...(input.config ? { metadata: input.config } : {}),
    })
  }

  private deleteCronSchedule(scheduleId: string) {
    return this.options.gateway.cron.delete(scheduleId)
  }

  private deleteBudget(budgetId: string) {
    return this.options.gateway.budgets.delete(budgetId)
  }

  private runCronNow(scheduleId: string) {
    return this.options.gateway.cron.runNow(scheduleId)
  }

  private previewCronGrant(scheduleId: string) {
    if (!this.options.gateway.runLog.available()) {
      throw new GatewayHttpError(501, 'RunLog gateway runtime is not configured.')
    }
    return this.options.gateway.cron.grantPreview(scheduleId)
  }

  private createCronGrant(scheduleId: string, input: CreateCronGrantRequest) {
    if (!this.options.gateway.runLog.available()) {
      throw new GatewayHttpError(501, 'RunLog gateway runtime is not configured.')
    }
    return this.options.gateway.cron.createGrant({
      scheduleId,
      expiresAt: input.expiresAt,
      expiresInMs: input.expiresInMs,
      maxExecutionCount: input.maxExecutionCount,
      actor: input.actor,
    })
  }

  private planDeployment(targetId: string, input: DeploymentPlanRequest) {
    return this.options.gateway.deployments.plan({
      targetId,
      operation: input.operation,
    })
  }

  private executeDeployment(targetId: string, input: ExecuteDeploymentRequest) {
    return this.options.gateway.deployments.execute({
      targetId,
      operation: input.operation,
      confirm: input.confirm,
    })
  }

  private installMarketplaceTemplate(
    templateId: string,
    input: InstallMarketplaceTemplateRequest,
  ) {
    return this.options.gateway.marketplace.installTemplate({
      templateId,
      workspaceRoot: input.workspaceRoot,
      clientName: input.clientName,
      workspaceName: input.workspaceName,
      agentName: input.agentName,
    })
  }

  private resolveApproval(approvalId: string, input: ResolveApprovalRequest): void {
    const payload = {
      sessionId: input.sessionId,
      runId: input.runId,
      approvalId,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.response !== undefined ? { response: input.response } : {}),
    }
    if (input.decision === 'approved') {
      this.options.gateway.approvals.approve(payload)
      return
    }
    this.options.gateway.approvals.deny(payload)
  }

  private lookupSessionIdForRun(runId: string): string | undefined {
    return gatewaySnapshotToConsoleState(this.options.gateway.snapshot()).runs.find(
      (run) => run.runId === runId,
    )?.sessionId
  }

  private async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    if (!raw) return {}
    return JSON.parse(raw)
  }

  private applyCors(response: ServerResponse): void {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    response.setHeader('Access-Control-Expose-Headers', 'x-mainspring-auth-token')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    response.setHeader('Cache-Control', 'no-store')
  }

  private writeJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
  ): void {
    const body = JSON.stringify(sanitizeGatewayResponse(payload))
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders })
    response.end(body)
  }

  private async writeArtifact(
    response: ServerResponse,
    artifactId: string,
    download = false,
  ): Promise<void> {
    const artifact = this.options.gateway.appState?.artifacts.get(artifactId)
    if (!artifact) {
      throw new GatewayHttpError(404, `Unknown artifact: ${artifactId}`)
    }
    const stat = await fs.promises.stat(artifact.path).catch(() => null)
    if (!stat?.isFile()) {
      throw new GatewayHttpError(404, `Artifact file unavailable: ${artifactId}`)
    }
    response.writeHead(200, {
      'content-type': artifact.mediaType ?? 'application/octet-stream',
      'content-length': String(stat.size),
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${safeArtifactFilename(artifact)}"`,
      'cache-control': 'no-store',
    })
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(artifact.path)
      stream.on('error', reject)
      response.on('close', resolve)
      stream.on('end', resolve)
      stream.pipe(response)
    })
  }

  private async handleEventStream(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> {
    const sessionId = url.searchParams.get('sessionId')?.trim() || undefined
    const runId = url.searchParams.get('runId')?.trim() || undefined
    let closed = false
    let lastRunEventSeq = 0
    let lastSnapshotSignature = ''
    let heartbeatCounter = 0
    let timer: ReturnType<typeof globalThis.setInterval> | null = null

    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    response.write(': mainspring local gateway dev stream\n\n')

    const writeEvent = (event: string, payload: unknown): void => {
      if (closed) return
      response.write(`event: ${event}\n`)
      response.write(`data: ${JSON.stringify(sanitizeGatewayResponse(payload))}\n\n`)
    }

    const emitSnapshotUpdate = (): void => {
      const snapshot = gatewaySnapshotToConsoleState(this.options.gateway.snapshot())
      const signature = JSON.stringify({
        health: snapshot.health,
        sessions: snapshot.sessions.map((item) => ({
          sessionId: item.sessionId,
          status: item.status,
          updatedAt: item.updatedAt,
        })),
        runs: snapshot.runs.map((item) => ({
          runId: item.runId,
          sessionId: item.sessionId,
          status: item.status,
          eventCount: item.eventCount,
          pendingInboundCount: item.pendingInboundCount,
          lastEventAt: item.lastEventAt,
        })),
        approvals: snapshot.approvals.map((item) => ({
          approvalId: item.approvalId,
          runId: item.runId,
          status: item.status,
          requestedAt: item.requestedAt,
          resolvedAt: item.resolvedAt,
        })),
        usageLedgerEntries: snapshot.counts.usageLedgerEntries,
        artifacts: snapshot.counts.artifacts,
      })
      if (signature === lastSnapshotSignature) return
      lastSnapshotSignature = signature
      writeEvent('snapshot.updated', {
        generatedAt: snapshot.generatedAt,
        counts: snapshot.counts,
        health: snapshot.health,
      })
    }

    const emitRunEvents = (): void => {
      if (!sessionId || !runId) return
      const events = this.options.gateway.events.list({
        sessionId,
        runId,
        ...(lastRunEventSeq > 0 ? { afterSeq: lastRunEventSeq } : {}),
      })
      for (const event of events) {
        lastRunEventSeq = Math.max(lastRunEventSeq, numericSeq(event))
        writeEvent('run.event', consoleRunEvent(event))
        if (event.type.startsWith('approval.')) {
          writeEvent('approval.updated', {
            approvalId: approvalIdForSse(event),
            runId: event.runId,
            sessionId: event.sessionId,
            type: event.type,
            seq: event.seq,
          })
        }
      }
    }

    const tick = (): void => {
      emitRunEvents()
      emitSnapshotUpdate()
      heartbeatCounter += 1
      if (heartbeatCounter % 10 === 0) {
        writeEvent('heartbeat', {
          at: new Date().toISOString(),
          ...(sessionId ? { sessionId } : {}),
          ...(runId ? { runId } : {}),
        })
      }
    }

    const close = (): void => {
      if (closed) return
      closed = true
      if (timer) globalThis.clearInterval(timer)
      response.end()
    }

    request.on('close', close)
    request.on('aborted', close)

    tick()
    timer = globalThis.setInterval(tick, 1000)
  }
}

function safeArtifactFilename(artifact: { artifactId: string; label?: string; mediaType?: string }): string {
  const redactedLabel = artifact.label ? redactBrowserUnsafeGatewayText(artifact.label).trim() : ''
  const preferred = (redactedLabel || artifact.artifactId).replace(/[^a-zA-Z0-9._-]+/g, '-')
  if (preferred.includes('.')) return preferred
  if (artifact.mediaType === 'image/png') return `${preferred}.png`
  if (artifact.mediaType === 'text/markdown') return `${preferred}.md`
  if (artifact.mediaType === 'application/json') return `${preferred}.json`
  if (artifact.mediaType?.startsWith('text/')) return `${preferred}.txt`
  return preferred
}

function hasUnsafeBrowserAccessQuery(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (isBrowserUnsafeBrowserAccessQueryKey(key)) return true
  }
  return false
}

function numericSeq(event: Pick<RunEvent, 'seq'>): number {
  return typeof event.seq === 'number' && Number.isFinite(event.seq) ? event.seq : 0
}

function approvalIdForSse(event: RunEvent): string | undefined {
  const payload = event.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return undefined
  if (typeof payload.id === 'string') return payload.id
  if (typeof payload.approvalId === 'string') return payload.approvalId
  return undefined
}

function runLogRunDispatch(record: RunLogRunRecord) {
  return {
    runId: record.runId,
    sessionId: record.sessionId,
    agentId: record.agentId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.parentRunId ? { parentRunId: record.parentRunId } : {}),
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.providerId ? { providerId: record.providerId } : {}),
    ...(record.modelId ? { modelId: record.modelId } : {}),
  }
}

function runLogEventPublic(event: RunLogEvent) {
  return {
    eventId: event.eventId,
    seq: event.seq,
    runId: event.runId,
    sessionId: event.sessionId,
    agentId: event.agentId,
    type: event.type,
    timestamp: event.timestamp,
    visibility: event.visibility,
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
  }
}

function runLogProjectionResponse(projection: RunLogRunProjection) {
  return {
    run: runLogRunDispatch(projection.run),
    status: projection.status,
    assistantText: projection.assistantText,
    pendingApprovals: projection.pendingApprovals,
    approvalDecisions: projection.approvalDecisions,
    toolCalls: projection.toolCalls,
    policyDecisions: projection.policyDecisions,
    artifacts: projection.artifacts,
    usage: projection.usage,
    latestSeq: projection.latestSeq,
    events: projection.events.map(runLogEventPublic),
  }
}

export function createLocalGatewayServer(
  options: CreateLocalGatewayServerOptions,
): LocalGatewayHttpServer {
  return new LocalGatewayHttpServer(options)
}
