import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import type { RunEvent } from 'mainspring'

export interface LocalGatewayClient {
  health(): Promise<{ mode: string; health: { ok: boolean; running: boolean; activeSessions: number } }>
  snapshot(): Promise<ConsoleGatewaySnapshot>
  startRun(input: {
    sessionId: string
    input: string
    mode: 'chat'
    allowedTools: string[]
    workspaceId?: string
    agentId?: string
    providerProfileId?: string
    providerId?: string
    modelId?: string
    runtimeProfile?: 'core' | 'core-browser' | 'core-browser-memory'
  }): Promise<{ run: { runId: string; sessionId: string } }>
  runEvents(input: { sessionId: string; runId: string }): Promise<{ events: RunEvent[] }>
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

  return {
    health: () => requestJson(fetchImpl, `${normalizedBaseUrl}/health`),
    snapshot: () => requestJson(fetchImpl, `${normalizedBaseUrl}/snapshot`),
    startRun: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/runs/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    runEvents: (input) =>
      requestJson(
        fetchImpl,
        `${normalizedBaseUrl}/runs/${encodeURIComponent(input.runId)}/events?sessionId=${encodeURIComponent(input.sessionId)}`,
      ),
    resolveApproval: (input) =>
      requestJson(fetchImpl, `${normalizedBaseUrl}/approvals/${encodeURIComponent(input.approvalId)}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
  const response = await fetchImpl(url, init)
  const payload = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Gateway request failed: ${response.status}`)
  }
  return payload as T
}
