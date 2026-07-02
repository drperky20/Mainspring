import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'

export interface LocalGatewayDeletionGuard {
  allowed: boolean
  blockers: string[]
}

export function clientDeletionGuard(input: {
  snapshot: ConsoleGatewaySnapshot
  clientId: string
}): LocalGatewayDeletionGuard {
  const workspaceCount = input.snapshot.workspaces.filter(
    (workspace) => workspace.clientId === input.clientId,
  ).length
  const sessionCount = input.snapshot.sessions.filter(
    (session) => session.clientId === input.clientId,
  ).length

  const blockers = [
    ...(workspaceCount > 0 ? [countLabel(workspaceCount, 'linked workspace')] : []),
    ...(sessionCount > 0 ? [countLabel(sessionCount, 'linked session')] : []),
  ]

  return {
    allowed: blockers.length === 0,
    blockers,
  }
}

export function workspaceDeletionGuard(input: {
  snapshot: ConsoleGatewaySnapshot
  workspaceId: string
}): LocalGatewayDeletionGuard {
  const agentCount = input.snapshot.agents.filter(
    (agent) => agent.workspaceId === input.workspaceId,
  ).length
  const runCount = input.snapshot.runs.filter((run) => run.workspaceId === input.workspaceId).length
  const approvalCount = input.snapshot.approvalMetadata.filter(
    (approval) => approval.workspaceId === input.workspaceId,
  ).length
  const artifactCount = input.snapshot.artifacts.filter(
    (artifact) => artifact.workspaceId === input.workspaceId,
  ).length
  const usageCount = input.snapshot.usageLedger.filter(
    (entry) => entry.workspaceId === input.workspaceId,
  ).length
  const sessionCount = input.snapshot.sessions.filter(
    (session) => session.workspaceId === input.workspaceId,
  ).length

  const blockers = [
    ...(agentCount > 0 ? [countLabel(agentCount, 'linked agent')] : []),
    ...(runCount > 0 ? [countLabel(runCount, 'run record')] : []),
    ...(approvalCount > 0 ? [countLabel(approvalCount, 'stored approval')] : []),
    ...(artifactCount > 0 ? [countLabel(artifactCount, 'artifact')] : []),
    ...(usageCount > 0 ? [countLabel(usageCount, 'usage entry')] : []),
    ...(sessionCount > 0 ? [countLabel(sessionCount, 'linked session')] : []),
  ]

  return {
    allowed: blockers.length === 0,
    blockers,
  }
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
