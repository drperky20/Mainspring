import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { gatewaySnapshotToConsoleState, type LocalGatewayEventListInput } from '../index.js'
import type { LocalMainspringGateway } from '../LocalGateway.js'
import { GatewayHttpError, asGatewayHttpError } from './errors.js'
import {
  ResolveApprovalRequestSchema,
  StartRunRequestSchema,
  type ResolveApprovalRequest,
  type StartRunRequest,
} from './schemas.js'
import { sanitizeGatewayResponse } from './sanitize.js'

export interface CreateLocalGatewayServerOptions {
  gateway: LocalMainspringGateway
  host?: string
  port?: number
}

export class LocalGatewayHttpServer {
  private readonly host: string
  private readonly port: number
  private readonly server: http.Server

  constructor(private readonly options: CreateLocalGatewayServerOptions) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 8787
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
        this.writeJson(response, 200, {
          mode: 'local-gateway-dev',
          host: this.host,
          health: sanitizeGatewayResponse(this.options.gateway.snapshot().health),
        })
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

      if (request.method === 'GET' && path === '/sessions') {
        this.writeJson(
          response,
          200,
          sanitizeGatewayResponse({ sessions: this.options.gateway.sessions.list() }),
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

      if (request.method === 'POST' && path === '/runs/start') {
        const body = await this.readJson(request)
        const parsed = StartRunRequestSchema.parse(body)
        const run = this.startRun(parsed)
        this.writeJson(response, 202, sanitizeGatewayResponse({ run }))
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
        this.writeJson(response, 200, sanitizeGatewayResponse({ sessionId, runId, events }))
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

      throw new GatewayHttpError(404, `Unknown route: ${request.method ?? 'GET'} ${path}`)
    } catch (error) {
      const httpError = asGatewayHttpError(error)
      this.writeJson(response, httpError.statusCode, { error: httpError.message })
    }
  }

  private startRun(input: StartRunRequest) {
    if (input.providerProfileId) {
      return this.options.gateway.runs.startFromAppState(input)
    }
    return this.options.gateway.runs.start(input)
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
    response.setHeader('Access-Control-Allow-Headers', 'content-type')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Cache-Control', 'no-store')
  }

  private writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(sanitizeGatewayResponse(payload))
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
    response.end(body)
  }
}

export function createLocalGatewayServer(
  options: CreateLocalGatewayServerOptions,
): LocalGatewayHttpServer {
  return new LocalGatewayHttpServer(options)
}
