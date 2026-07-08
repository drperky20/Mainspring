import { FormEvent, useState } from 'react'
import { ConnectedConsoleApp } from './ConnectedConsoleApp'
import type {
  ConsoleDashboardApprovalRow,
  ConsoleDashboardClientDetail,
  ConsoleDashboardRunRow,
} from './dashboardProjection'
import type { DashboardViewModel } from './dashboardViewModel'
import type { RunTraceViewModel } from './runTraceViewModel'

type ProviderState = 'ready' | 'unavailable' | 'unverified' | 'missing'

type Client = {
  id: string
  name: string
  contact: string
  workspace: string
  billingLabel: string
  workspaceName?: string
}

type Agent = {
  id: string
  clientId: string
  name: string
  outcome: string
  instructions: string
  voice: string
  model: string
  approvalMode: 'Strict' | 'Balanced' | 'Autonomous' | string
  skills: Record<string, boolean>
}

export function App() {
  return <ConnectedConsoleApp />
}

export function BudgetToolPolicySummary({
  evaluation,
}: {
  evaluation: {
    label: string
    scopeLabel: string
    status: string
    costSensitiveTools: { mode: string; reason: string }
  } & Record<string, unknown>
}) {
  if (evaluation.costSensitiveTools.mode === 'allow') {
    return <div className="preview-block">Cost-sensitive tools allowed for {evaluation.label}</div>
  }
  return (
    <div className="preview-block">
      <strong>Cost-sensitive tools require budget review</strong>
      <span>{evaluation.label}</span>
      <small>{evaluation.scopeLabel}</small>
    </div>
  )
}

export function PricingCatalogStatusSummary({
  pricingCatalog,
}: {
  pricingCatalog: {
    configured: boolean
    entries: number
    configuredEntries: number
    sourceLabel?: string
  } & Record<string, unknown>
}) {
  const source = pricingCatalog.configured
    ? `configured catalog${pricingCatalog.sourceLabel ? ` (${safeBasename(pricingCatalog.sourceLabel)})` : ''}`
    : 'built-in catalog'
  return (
    <div className="preview-block">
      <strong>Pricing: {source}</strong>
      <span>{pricingCatalog.entries} models tracked</span>
      <span>{pricingCatalog.configuredEntries} configured</span>
    </div>
  )
}

export function UsageStatusSummary({
  usageStatus,
}: {
  usageStatus: {
    total: { summary: { entries: number } & Record<string, unknown> } & Record<string, unknown>
    estimatedCostUsd: number
    unpricedEntries: number
  } & Record<string, unknown>
}) {
  return (
    <div className="preview-block">
      <strong>Usage: {usageStatus.total.summary.entries} ledger entries</strong>
      <span>est {trimMoney(usageStatus.estimatedCostUsd)}</span>
      <span>{usageStatus.unpricedEntries} unpriced</span>
    </div>
  )
}

export function CronGrantSummary({
  schedule,
  preview,
}: {
  schedule: {
    label: string
    allowedTools: string[]
    cronGrant?: {
      executionCount?: number
      maxExecutionCount?: number
    } & Record<string, unknown>
  } & Record<string, unknown>
  preview?: {
    grantPresent: boolean
    grant?: {
      executionCount: number
      maxExecutionCount: number
      allowedTools: string[]
    } & Record<string, unknown>
    allowedTools: string[]
  } & Record<string, unknown>
}) {
  const grant = preview?.grant ?? schedule.cronGrant
  const tools = preview?.grant?.allowedTools ?? preview?.allowedTools ?? schedule.allowedTools
  return (
    <div className="preview-block cron-grant-summary">
      <strong>Cron grant</strong>
      <span>{schedule.label}</span>
      <span>{preview?.grantPresent || schedule.cronGrant ? 'Scoped grant active' : 'Grant required'}</span>
      <span>{tools.join(', ')}</span>
      {grant ? <span>{grant.executionCount ?? 0}/{grant.maxExecutionCount ?? 0}</span> : null}
    </div>
  )
}

export function ProvenanceReviewSummary({
  reviews,
}: {
  reviews: Array<{
    kind: 'memory' | 'skill' | 'template'
    status: string
    mutation:
      | ({ kind: 'memory'; scope: string; textPreview: string } & Record<string, unknown>)
      | ({ kind: 'skill'; manifest: { key: string; name: string } & Record<string, unknown> } & Record<string, unknown>)
      | ({ kind: 'template'; summary: string } & Record<string, unknown>)
    scan: { findings: Array<{ ruleId: string; severity: string } & Record<string, unknown>> } & Record<string, unknown>
  } & Record<string, unknown>>
}) {
  return (
    <div className="preview-block provenance-review-summary">
      <strong>Provenance reviews</strong>
      <span>{reviews.length} staged mutation{reviews.length === 1 ? '' : 's'}</span>
      {reviews.map((review, index) => (
        <div key={`${review.kind}:${index}`}>
          {review.mutation.kind === 'memory' ? (
            <span>{review.mutation.scope} memory: {review.mutation.textPreview}</span>
          ) : review.mutation.kind === 'skill' ? (
            <span>skill: {review.mutation.manifest.name}</span>
          ) : (
            <span>template: {review.mutation.summary}</span>
          )}
          {review.scan.findings.map((finding) => (
            <small key={`${finding.ruleId}:${finding.severity}`}>
              {finding.ruleId}:{finding.severity}
            </small>
          ))}
        </div>
      ))}
    </div>
  )
}

export function Dashboard({
  viewModel,
  onNewClient,
  onOpenClient,
  onGuide,
  notice,
}: {
  viewModel: DashboardViewModel
  onNewClient: () => void
  onOpenClient: (clientId: string) => void
  onGuide: () => void
  notice: string
}) {
  if (viewModel.clients.length === 0) {
    return (
      <section className="empty-state">
        <h1>No agents yet.</h1>
        <p>Create a client, then attach an agent.</p>
        <div className="button-row center">
          <button className="primary-button" type="button" onClick={onNewClient}>New client</button>
          <button className="ghost-button" type="button" onClick={onGuide}>Open guide</button>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
        <footer className="status-strip">{viewModel.statusStrip.map((item) => <span key={item}>{item}</span>)}</footer>
      </section>
    )
  }

  return (
    <section className="dashboard-list">
      <div>
        <p className="breadcrumb">Dashboard</p>
        <h1>Clients</h1>
      </div>
      <button className="secondary-button" type="button" onClick={onNewClient}>New client</button>
      {viewModel.clients.map((client) => (
        <button className="client-row" key={client.id} type="button" onClick={() => onOpenClient(client.id)}>
          <span>
            <strong>{client.name}</strong>
            <small>{client.subtitle}</small>
            {client.activeRunSummary ? <small>{client.activeRunSummary}</small> : null}
          </span>
          <span>{client.statusLabel}</span>
        </button>
      ))}
      {notice ? <p className="notice">{notice}</p> : null}
      <footer className="status-strip dashboard-status-strip">
        {viewModel.statusStrip.map((item) => <span key={item}>{item}</span>)}
      </footer>
    </section>
  )
}

export function GatewayDashboardQueues({
  activeRuns,
  pendingApprovals,
  onOpenRunTrace,
  onOpenApprovalTrace,
  onResolveApproval,
}: {
  activeRuns: ConsoleDashboardRunRow[]
  pendingApprovals: ConsoleDashboardApprovalRow[]
  onOpenRunTrace: (run: ConsoleDashboardRunRow) => void
  onOpenApprovalTrace: (approval: ConsoleDashboardApprovalRow) => void
  onResolveApproval: (approval: ConsoleDashboardApprovalRow, decision: 'approved' | 'denied') => void
}) {
  return (
    <div className="gateway-queue-panel">
      <section className="gateway-detail-section">
        <h2>Pending approvals</h2>
        {pendingApprovals.map((approval) => (
          <div className="gateway-detail-row" key={approval.approvalId}>
            <strong>{approval.clientName ?? approval.approvalId}</strong>
            <small>{approval.targetKey}</small>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => onResolveApproval(approval, 'approved')}>Approve</button>
              <button className="ghost-button" type="button" onClick={() => onResolveApproval(approval, 'denied')}>Deny</button>
              <button className="ghost-button" type="button" onClick={() => onOpenApprovalTrace(approval)}>Open approval trace</button>
            </div>
          </div>
        ))}
      </section>
      <section className="gateway-detail-section">
        <h2>Active runs</h2>
        {activeRuns.map((run) => (
          <div className="gateway-detail-row" key={run.runId}>
            <strong>{run.clientName ?? run.runId}</strong>
            <small>{run.agentName} {run.modelId}</small>
            <button className="ghost-button" type="button" onClick={() => onOpenRunTrace(run)}>Open run trace</button>
          </div>
        ))}
      </section>
    </div>
  )
}

export function GatewayClientDetailPanel({
  detail,
  liveInventory,
  onOpenUsageTrace,
  onOpenArtifactTrace,
  onOpenApprovalTrace,
  onOpenSessionTrace,
  onResolveApproval,
}: {
  detail: ConsoleDashboardClientDetail
  liveInventory?: {
    toolCalls: ConsoleDashboardClientDetail['toolCalls']
    deploymentTargets: Array<{ label: string; kind: string; executionMode: string } & Record<string, unknown>>
    deploymentRuns: Array<{ deploymentRunId: string; status: string } & Record<string, unknown>>
    cells: Array<{ label: string; status: string } & Record<string, unknown>>
    cellLeases: Array<{ leaseId: string; status: string } & Record<string, unknown>>
    cellSnapshots: Array<{ label: string } & Record<string, unknown>>
    loading: boolean
  }
  onOpenUsageTrace: (entry: ConsoleDashboardClientDetail['usageEntries'][number]) => void
  onOpenArtifactTrace: (artifact: ConsoleDashboardClientDetail['artifacts'][number]) => void
  onOpenApprovalTrace: (approval: ConsoleDashboardClientDetail['approvals'][number]) => void
  onOpenSessionTrace: (session: ConsoleDashboardClientDetail['sessions'][number]) => void
  onResolveApproval: (
    approval: ConsoleDashboardClientDetail['approvals'][number],
    decision: 'approved' | 'denied',
  ) => void
}) {
  return (
    <section className="gateway-detail-panel">
      <div className="gateway-detail-header">
        <h2>{detail.name}</h2>
        <span>{detail.agentCount} agents</span>
      </div>
      <DetailSection title="Recent usage">
        {detail.usageEntries.map((entry) => (
          <button className="gateway-detail-row" key={entry.entryId} type="button" onClick={() => onOpenUsageTrace(entry)}>
            <strong>{entry.providerLabel ?? entry.providerId}</strong>
            <span>Open usage trace</span>
          </button>
        ))}
      </DetailSection>
      <DetailSection title="Recent memory">
        {detail.memoryEntries.map((entry) => (
          <div className="gateway-detail-row" key={entry.entryId}>
            <strong>Memory entry</strong>
            <span>{entry.textPreview}</span>
          </div>
        ))}
      </DetailSection>
      <DetailSection title="Recent artifacts">
        {detail.artifacts.map((artifact) => (
          <button className="gateway-detail-row" key={artifact.artifactId} type="button" onClick={() => onOpenArtifactTrace(artifact)}>
            <strong>{artifact.label ?? artifact.kind}</strong>
            <span>Open artifact trace</span>
          </button>
        ))}
      </DetailSection>
      <DetailSection title="Recent tool calls">
        {[...detail.toolCalls, ...(liveInventory?.toolCalls ?? [])].map((toolCall) => (
          <div className="gateway-detail-row" key={toolCall.toolCallId}>
            <strong>{toolCall.toolName}</strong>
            <span>{toolCall.status}</span>
          </div>
        ))}
      </DetailSection>
      <DetailSection title="Live local inventory">
        {liveInventory?.deploymentTargets.map((target) => (
          <div className="gateway-detail-row" key={target.label}>
            <strong>{target.label}</strong>
            <span>{target.kind} | {target.executionMode}</span>
          </div>
        ))}
        {liveInventory?.cellSnapshots.map((snapshot) => (
          <div className="gateway-detail-row" key={snapshot.label}>
            <strong>{snapshot.label}</strong>
          </div>
        ))}
      </DetailSection>
      <DetailSection title="Recent approvals">
        {detail.approvals.map((approval) => (
          <div className="gateway-detail-row" key={approval.approvalId}>
            <strong>Approval detail</strong>
            <span>{approval.targetKey}</span>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => onResolveApproval(approval, 'approved')}>Approve</button>
              <button className="ghost-button" type="button" onClick={() => onResolveApproval(approval, 'denied')}>Deny</button>
              <button className="ghost-button" type="button" onClick={() => onOpenApprovalTrace(approval)}>Open approval trace</button>
            </div>
          </div>
        ))}
      </DetailSection>
      <DetailSection title="Linked sessions">
        {detail.sessions.map((session) => (
          <button className="gateway-detail-row" key={session.sessionId} type="button" onClick={() => onOpenSessionTrace(session)}>
            <strong>{session.status}</strong>
            <span>Open session trace</span>
          </button>
        ))}
      </DetailSection>
      <DetailSection title="RunLog detail">
        {detail.runLogRuns.map((run) => (
          <div className="gateway-detail-row" key={run.runId}>
            <strong>{run.status}</strong>
            <span>Checkpoints {run.checkpointCount}</span>
            <span>Policy decisions {run.policyDecisionCount}</span>
            {run.errors.map((error) => <span key={error.eventId}>{error.message}</span>)}
          </div>
        ))}
      </DetailSection>
    </section>
  )
}

export function ProviderProfileForm({
  existingProfile,
  onCancel,
  onSave,
}: {
  existingProfile?: {
    providerId: string
    label: string
    defaultModelId?: string
    secretRef?: string
  } & Record<string, unknown>
  onCancel: () => void
  onSave: (value?: unknown) => void
}) {
  const [label, setLabel] = useState(existingProfile?.label ?? 'OpenRouter')
  const [secretRef, setSecretRef] = useState(existingProfile?.secretRef ?? '')
  const [secretValue, setSecretValue] = useState('')
  return (
    <form className="sheet narrow" onSubmit={(event: FormEvent) => {
      event.preventDefault()
      onSave({ label, secretRef, secretValue })
    }}>
      <p className="breadcrumb">{existingProfile ? 'Edit provider profile' : 'New provider profile'}</p>
      <h1>{existingProfile ? 'Edit provider profile' : 'New provider profile'}</h1>
      <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Secret ref<input value={secretRef} onChange={(event) => setSecretRef(event.target.value)} /></label>
      <label>Managed secret<input type="password" value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder="Replace managed secret" /></label>
      <div className="button-row">
        <button className="primary-button" type="submit">Save provider</button>
        <button className="ghost-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export function AgentSpec({
  client,
  existingAgent,
  providerState,
  onSave,
  onBack,
}: {
  client: Client
  existingAgent?: Agent
  providerState: ProviderState
  onSave: (agent?: Agent) => void
  onBack: () => void
}) {
  const agent = existingAgent ?? {
    id: 'agent_new',
    clientId: client.id,
    name: 'Front desk assistant',
    outcome: '',
    instructions: '',
    voice: '',
    model: '',
    approvalMode: 'Balanced',
    skills: {},
  }
  return (
    <section className="spec-layout">
      <main className="spec-main">
        <p className="breadcrumb">{client.name} / {agent.name}</p>
        <h1>{existingAgent ? 'Edit agent' : 'New agent'}</h1>
        <p>Provider auth: {providerState}</p>
        <button className="primary-button" type="button" onClick={() => onSave(agent)}>Save agent</button>
        <button className="ghost-button" type="button" onClick={onBack}>Back</button>
      </main>
    </section>
  )
}

export function Skills({
  clientName,
  agent,
  providerReady,
  providerState,
  onSettings,
  onBack,
  onSave,
  onLaunch,
}: {
  clientName: string
  agent: Agent
  providerReady: boolean
  providerState: ProviderState
  onSettings: () => void
  onBack: () => void
  onSave: (agent: Agent) => void
  onLaunch: () => void
}) {
  return (
    <section className="wide-workspace">
      <p className="breadcrumb">{clientName} / {agent.name}</p>
      <h1>Skills</h1>
      <p>Provider auth: {providerState}</p>
      {Object.entries(agent.skills).map(([name, enabled]) => (
        <div className="data-row" key={name}>
          <strong>{name}</strong>
          <span>{enabled ? 'enabled' : 'off'}</span>
        </div>
      ))}
      <div className="button-row">
        <button className="primary-button" type="button" disabled={!providerReady} onClick={onLaunch}>Launch</button>
        <button className="secondary-button" type="button" onClick={() => onSave(agent)}>Save</button>
        <button className="ghost-button" type="button" onClick={onSettings}>Settings</button>
        <button className="ghost-button" type="button" onClick={onBack}>Back</button>
      </div>
    </section>
  )
}

export function RunTrace({
  trace,
  selectedEvent,
  setSelectedEvent,
  onBack,
}: {
  trace: RunTraceViewModel
  selectedEvent: number
  setSelectedEvent: (index: number) => void
  onBack: () => void
}) {
  const event = trace.events[selectedEvent] ?? trace.events[0]
  const backLabel = trace.source === 'gateway-projection-preview'
    ? 'Back to dashboard'
    : 'Back to agent'
  return (
    <section className="trace-page">
      <p className="breadcrumb">{trace.clientName} / {trace.agentName} / Run</p>
      <h1>Run trace</h1>
      <p>{trace.intro}</p>
      <div className="trace-box">
        <div>
          {trace.events.map((item, index) => (
            <button className={`event-row ${index === selectedEvent ? 'selected' : ''}`} key={`${item.time}:${item.label}`} type="button" onClick={() => setSelectedEvent(index)}>
              <span>{item.time}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>
        <aside className="event-detail">
          <h2>{event?.detail.Title ?? event?.label}</h2>
          {event ? Object.entries(event.detail).map(([key, value]) => (
            <div className="key-value" key={key}>
              <strong>{key}</strong>
              <span>{String(value)}</span>
            </div>
          )) : null}
        </aside>
      </div>
      <footer className="trace-footer">
        {trace.footer.map((item) => <span key={item}>{item}</span>)}
        <button className="secondary-button" type="button" onClick={onBack}>{backLabel}</button>
      </footer>
    </section>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gateway-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function safeBasename(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value
}

function trimMoney(value: number): string {
  return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
}
