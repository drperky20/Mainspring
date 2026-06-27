import type { ConsoleDashboardProjection } from './dashboardProjection'
import type { RunEvent } from 'mainspring'

export interface RunTraceEventRow {
  time: string
  label: string
  detail: Record<string, string>
}

export interface RunTraceViewModel {
  source: 'prototype-sample' | 'gateway-projection-preview'
  clientName: string
  agentName: string
  intro: string
  events: RunTraceEventRow[]
  footer: string[]
}

const prototypeRunEvents: RunTraceEventRow[] = [
  {
    time: '10:42:01',
    label: 'Prompt assembled',
    detail: {
      Title: 'Prompt assembled',
      Context: 'Agent spec, workspace policy, and client memory',
      Tokens: '1,284 input',
      Risk: 'none',
    },
  },
  {
    time: '10:42:02',
    label: 'Provider response started',
    detail: {
      Title: 'Provider response started',
      Model: 'default chat',
      Stream: 'active',
      Retries: '0',
    },
  },
  {
    time: '10:42:04',
    label: 'Tool requested: file.read',
    detail: {
      Title: 'Tool requested',
      Tool: 'file.read',
      Scope: 'workspace',
      Approval: 'not required',
      Input: 'notes/intake.md',
    },
  },
  {
    time: '10:42:04',
    label: 'Policy allowed read',
    detail: {
      Title: 'Policy allowed read',
      Rule: 'workspace read',
      Receipt: 'policy_0188',
      Reason: 'read-only file access',
    },
  },
  {
    time: '10:42:07',
    label: 'Assistant text completed',
    detail: {
      Title: 'Assistant text completed',
      Output: 'Drafted intake summary and follow-up note',
      Tokens: '342 output',
      Cost: 'local ledger pending',
    },
  },
]

export function createPrototypeRunTraceViewModel(input: {
  clientName: string
  agentName: string
}): RunTraceViewModel {
  return {
    source: 'prototype-sample',
    clientName: input.clientName,
    agentName: input.agentName,
    intro: 'Sample trace only. This view is not connected to events_out yet.',
    events: prototypeRunEvents,
    footer: [
      'Artifacts: none',
      'Sample input tokens: 1,284',
      'Sample output tokens: 342',
      'Cost estimate: no ledger',
    ],
  }
}

export function gatewayProjectionToRunTraceViewModel(input: {
  projection: ConsoleDashboardProjection
  clientId: string
}): RunTraceViewModel | undefined {
  const client = input.projection.clients.find((candidate) => candidate.clientId === input.clientId)
  const activeRun = input.projection.activeRuns.find((candidate) => candidate.clientId === input.clientId)
  if (!client || !activeRun) return undefined

  const pendingApproval = input.projection.pendingApprovals.find(
    (approval) => approval.runId === activeRun.runId,
  )
  const providerContext = [
    activeRun.providerLabel ?? activeRun.providerId,
    activeRun.modelId ?? activeRun.modelFamily,
    activeRun.providerTransport,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const events: RunTraceEventRow[] = [
    {
      time: timeLabel(activeRun.lastEventAt),
      label: gatewayStatusLabel(activeRun.status),
      detail: {
        Title: gatewayStatusLabel(activeRun.status),
        Run: activeRun.runId,
        Session: activeRun.sessionId,
        Status: activeRun.status,
        Events: String(activeRun.eventCount),
      },
    },
  ]

  if (providerContext.length > 0 || activeRun.providerSessionId) {
    events.push({
      time: timeLabel(activeRun.lastEventAt),
      label: 'Provider context',
      detail: {
        Title: 'Provider context',
        ...(providerContext.length > 0 ? { Route: providerContext.join(' | ') } : {}),
        ...(activeRun.providerSessionId ? { ProviderSession: activeRun.providerSessionId } : {}),
      },
    })
  }

  if (pendingApproval) {
    events.push({
      time: timeLabel(pendingApproval.requestedAt),
      label: 'Approval pending',
      detail: {
        Title: 'Approval pending',
        RequestedAt: pendingApproval.requestedAt,
        ...(pendingApproval.targetKey ? { Target: pendingApproval.targetKey } : {}),
        ...(pendingApproval.agentName ? { Agent: pendingApproval.agentName } : {}),
      },
    })
  }

  return {
    source: 'gateway-projection-preview',
    clientName: activeRun.clientName ?? client.name,
    agentName: activeRun.agentName ?? client.primaryAgentName ?? 'Active agent',
    intro:
      'Gateway snapshot preview only. This view reuses read-only run metadata and is not connected to events_out yet.',
    events,
    footer: [
      `Pending inbound: ${activeRun.pendingInboundCount}`,
      `Pending approvals: ${pendingApproval ? 1 : 0}`,
      `Snapshot health: ${input.projection.health}`,
      'Trace source: gateway snapshot preview',
    ],
  }
}

export function gatewayRunEventsToTraceViewModel(input: {
  clientName: string
  agentName: string
  events: RunEvent[]
  footer?: string[]
}): RunTraceViewModel {
  return {
    source: 'gateway-projection-preview',
    clientName: input.clientName,
    agentName: input.agentName,
    intro:
      'Live local gateway mode. This trace is loaded from the local gateway event endpoint and still follows current runtime/event-journal limits.',
    events:
      input.events.length > 0
        ? input.events.map((event) => ({
            time: timeLabel(event.timestamp),
            label: event.type,
            detail: eventDetail(event),
          }))
        : [
            {
              time: '--:--:--',
              label: 'No events yet',
              detail: {
                Title: 'No events yet',
                Status: 'Run enqueued or polling',
              },
            },
          ],
    footer: input.footer ?? ['Trace source: local gateway dev'],
  }
}

function timeLabel(value: string | undefined): string {
  if (!value) return '--:--:--'
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/)
  return match?.[1] ?? value
}

function gatewayStatusLabel(status: ConsoleDashboardProjection['activeRuns'][number]['status']): string {
  if (status === 'waiting_approval') return 'Run waiting for approval'
  if (status === 'running') return 'Run in progress'
  if (status === 'queued') return 'Run queued'
  return 'Run active'
}

function eventDetail(event: RunEvent): Record<string, string> {
  const detail: Record<string, string> = {
    Title: event.type,
    Run: event.runId,
  }
  if (event.sessionId) detail.Session = event.sessionId
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : null
  if (payload) {
    for (const [key, value] of Object.entries(payload).slice(0, 4)) {
      if (value === undefined || value === null) continue
      detail[key] = typeof value === 'string' ? value : JSON.stringify(value)
    }
  }
  return detail
}
