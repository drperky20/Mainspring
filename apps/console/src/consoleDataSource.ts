import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import { browserUnsafeGatewayTextMarkers } from 'mainspring/gateway/browser-safety'

export const prototypeConsoleStorageKey = 'mainspring.console.v1'

export type ConsoleDataSource =
  | {
      kind: 'prototype-localStorage'
      storageKey: string
    }
  | {
      kind: 'gateway-snapshot'
      snapshot: ConsoleGatewaySnapshot
    }

export interface ConsoleGatewaySnapshotSummary {
  health: 'ready' | 'degraded' | 'offline'
  clientCount: number
  workspaceCount: number
  agentCount: number
  providerProfileCount: number
  activeSessionCount: number
  activeRunCount: number
  pendingApprovalCount: number
}

export const prototypeConsoleDataSource = {
  kind: 'prototype-localStorage',
  storageKey: prototypeConsoleStorageKey,
} satisfies ConsoleDataSource

export const forbiddenConsoleSnapshotTokens = browserUnsafeGatewayTextMarkers()

export function createStaticGatewaySnapshotDataSource(
  snapshot: ConsoleGatewaySnapshot,
): ConsoleDataSource {
  return {
    kind: 'gateway-snapshot',
    snapshot,
  }
}

export function summarizeConsoleGatewaySnapshot(
  snapshot: ConsoleGatewaySnapshot,
): ConsoleGatewaySnapshotSummary {
  const activeRunCount = snapshot.runs.filter((run) =>
    run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval',
  ).length
  const activeRunLogCount =
    snapshot.runLog?.runs.filter((run) =>
      run.status === 'queued' || run.status === 'running' || run.status === 'awaiting_approval',
    ).length ?? 0
  const runLogPendingApprovals = snapshot.runLog?.runs.reduce(
    (total, run) => total + run.pendingApprovalCount,
    0,
  ) ?? 0
  return {
    health: snapshot.health.ok ? 'ready' : snapshot.health.running ? 'degraded' : 'offline',
    clientCount: snapshot.counts.clients,
    workspaceCount: snapshot.counts.workspaces,
    agentCount: snapshot.counts.agents,
    providerProfileCount: snapshot.counts.providerProfiles,
    activeSessionCount: snapshot.health.activeSessions,
    activeRunCount: activeRunCount + activeRunLogCount,
    pendingApprovalCount: snapshot.counts.pendingApprovals + runLogPendingApprovals,
  }
}

export function findForbiddenConsoleSnapshotTokens(
  snapshot: ConsoleGatewaySnapshot,
  forbiddenTokens: readonly string[] = forbiddenConsoleSnapshotTokens,
): string[] {
  const serialized = JSON.stringify(snapshot)
  return forbiddenTokens.filter((token) => serialized.includes(token))
}
