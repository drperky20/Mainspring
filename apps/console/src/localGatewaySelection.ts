import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'

type GatewaySession = ConsoleGatewaySnapshot['sessions'][number]
type GatewayRun = ConsoleGatewaySnapshot['runs'][number]
type GatewayApproval = ConsoleGatewaySnapshot['approvals'][number]

export function listGatewaySessionsForClient(input: {
  snapshot: ConsoleGatewaySnapshot
  clientId: string
  workspaceId?: string
}): GatewaySession[] {
  return input.snapshot.sessions
    .filter(
      (candidate) =>
        candidate.clientId === input.clientId ||
        (input.workspaceId ? candidate.workspaceId === input.workspaceId : false),
    )
    .sort((left, right) => compareGatewaySessions(left, right, input.workspaceId))
}

export function selectGatewaySessionForClient(input: {
  snapshot: ConsoleGatewaySnapshot
  clientId: string
  workspaceId?: string
  preferredSessionId?: string
}): GatewaySession | undefined {
  const sessions = listGatewaySessionsForClient(input)
  if (input.preferredSessionId) {
    const preferred = sessions.find((candidate) => candidate.sessionId === input.preferredSessionId)
    if (preferred) return preferred
  }
  return sessions[0]
}

export function selectGatewayRunForSession(input: {
  snapshot: ConsoleGatewaySnapshot
  sessionId: string
}): GatewayRun | undefined {
  return [...input.snapshot.runs]
    .filter((candidate) => candidate.sessionId === input.sessionId)
    .sort(compareGatewayRuns)[0]
}

export function selectGatewayPendingApprovalForSession(input: {
  snapshot: ConsoleGatewaySnapshot
  sessionId: string
}): GatewayApproval | undefined {
  return [...input.snapshot.approvals]
    .filter(
      (candidate) => candidate.sessionId === input.sessionId && candidate.status === 'pending',
    )
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0]
}

export function formatGatewaySessionOptionLabel(input: {
  session: GatewaySession
  latestRun?: GatewayRun
}): string {
  const parts = [input.session.sessionId]
  if (input.session.workspaceId) parts.push(input.session.workspaceId)
  if (input.latestRun?.status) parts.push(input.latestRun.status)
  return parts.join(' | ')
}

function compareGatewaySessions(
  left: GatewaySession,
  right: GatewaySession,
  workspaceId?: string,
): number {
  const workspaceScore = (session: GatewaySession) =>
    workspaceId && session.workspaceId === workspaceId ? 1 : 0
  const workspaceDelta = workspaceScore(right) - workspaceScore(left)
  if (workspaceDelta !== 0) return workspaceDelta
  return right.updatedAt.localeCompare(left.updatedAt)
}

function compareGatewayRuns(left: GatewayRun, right: GatewayRun): number {
  const leftStamp = left.lastEventAt ?? left.createdAt ?? ''
  const rightStamp = right.lastEventAt ?? right.createdAt ?? ''
  return rightStamp.localeCompare(leftStamp)
}
