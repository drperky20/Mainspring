import { useState } from 'react'
import type {
  ConsoleGatewayArtifact,
  ConsoleGatewayRunEvent,
  ConsoleGatewayUsageLedgerEntry,
} from 'mainspring/gateway'
import type {
  OperatorApprovalRow,
  OperatorConsoleViewModel,
  OperatorRunRow,
  OperatorUsageRow,
} from './operatorConsoleViewModel'
import { humanizeStatus } from './operatorConsoleViewModel'

export type ConsoleConnectionState =
  | 'loading'
  | 'ready'
  | 'stale'
  | 'offline'
  | 'unauthorized'

export function ConsoleConnectionScreen({
  state,
  detail,
  onRetry,
}: {
  state: Extract<ConsoleConnectionState, 'loading' | 'offline'>
  detail?: string
  onRetry: () => void
}) {
  const loading = state === 'loading'
  return (
    <main className="control-state-screen" id="main-content">
      <div className="control-state-mark" aria-hidden="true">MS</div>
      <p className="control-kicker">Local agent operating layer</p>
      <h1>{loading ? 'Connecting to Mainspring' : 'Local gateway unavailable'}</h1>
      <p>
        {loading
          ? 'Reading the local runtime, RunLog, approvals, and usage ledger.'
          : detail || 'Start the local gateway, then retry the connection.'}
      </p>
      {loading ? (
        <div className="control-loading-rail" role="status" aria-label="Connecting">
          <span />
        </div>
      ) : (
        <button className="control-primary-button" type="button" onClick={onRetry}>
          Retry connection
        </button>
      )}
    </main>
  )
}

export function ConnectionNotice({
  state,
  detail,
  lastUpdatedAt,
  onRetry,
}: {
  state: ConsoleConnectionState
  detail?: string
  lastUpdatedAt?: string
  onRetry: () => void
}) {
  if (state === 'ready') return null
  return (
    <div className={`control-connection-notice ${state}`} role="status">
      <span className="control-status-light" aria-hidden="true" />
      <div>
        <strong>{state === 'stale' ? 'Showing the last local snapshot' : 'Gateway needs attention'}</strong>
        <small>
          {detail || (lastUpdatedAt ? `Last updated ${formatDateTime(lastUpdatedAt)}` : 'Live state is unavailable.')}
        </small>
      </div>
      <button type="button" onClick={onRetry}>Retry</button>
    </div>
  )
}

export function OverviewScreen({
  model,
  onNavigate,
  onOpenRun,
}: {
  model: OperatorConsoleViewModel
  onNavigate: (destination: 'clients' | 'runs' | 'approvals' | 'usage') => void
  onOpenRun: (runId: string) => void
}) {
  return (
    <section className="control-screen overview-screen" aria-labelledby="overview-title">
      <header className="control-screen-header">
        <div>
          <p className="control-kicker">Operations overview</p>
          <h1 id="overview-title">Mainspring control room</h1>
          <p>Live state from the local gateway and durable RunLog projection.</p>
        </div>
        <div className={`control-health-chip ${model.health}`}>
          <span aria-hidden="true" />
          {model.health === 'ready' ? 'Runtime online' : `Runtime ${model.health}`}
        </div>
      </header>

      <div className="control-metric-grid" aria-label="Runtime summary">
        <MetricCard
          label="Active runs"
          value={String(model.counts.activeRuns)}
          detail={`${model.counts.activeSessions} active session${model.counts.activeSessions === 1 ? '' : 's'}`}
          tone={model.counts.activeRuns > 0 ? 'live' : 'neutral'}
          onClick={() => onNavigate('runs')}
        />
        <MetricCard
          label="Approval queue"
          value={String(model.counts.pendingApprovals)}
          detail={model.counts.pendingApprovals > 0 ? 'Operator decision required' : 'No blocked work'}
          tone={model.counts.pendingApprovals > 0 ? 'warning' : 'good'}
          onClick={() => onNavigate('approvals')}
        />
        <MetricCard
          label="Workspaces / agents"
          value={`${model.counts.workspaces} / ${model.counts.agents}`}
          detail={`${model.counts.clients} active client${model.counts.clients === 1 ? '' : 's'}`}
          tone="neutral"
          onClick={() => onNavigate('clients')}
        />
        <MetricCard
          label="Tracked usage"
          value={formatMoney(model.usage.estimatedCostUsd)}
          detail={`${formatTokens(model.usage.totalTokens)} tokens · ${model.usage.unpricedEntries} unpriced`}
          tone={model.usage.unpricedEntries > 0 ? 'warning' : 'neutral'}
          onClick={() => onNavigate('usage')}
        />
      </div>

      <div className="control-overview-grid">
        <section className="control-panel control-panel-wide">
          <PanelHeader
            title="Active runs"
            meta={`${model.activeRuns.length} live`}
            actionLabel="View all runs"
            onAction={() => onNavigate('runs')}
          />
          {model.activeRuns.length === 0 ? (
            <CompactEmptyState
              title="No runs in flight"
              detail="Start a client chat or test an automation. New work will appear here immediately."
            />
          ) : (
            <div className="control-row-list">
              {model.activeRuns.slice(0, 5).map((run) => (
                <button className="control-data-row" key={run.runId} type="button" onClick={() => onOpenRun(run.runId)}>
                  <StatusDot status={run.status} />
                  <span>
                    <strong>{run.agentName ?? 'Unassigned agent'}</strong>
                    <small>{run.clientName ?? run.workspaceName ?? 'Local workspace'} · {shortId(run.runId)}</small>
                  </span>
                  <span className="control-row-meta">
                    <strong>{humanizeStatus(run.status)}</strong>
                    <small>{run.modelId ?? run.providerLabel ?? run.source}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="control-panel">
          <PanelHeader
            title="Approval queue"
            meta={`${model.pendingApprovals.length} pending`}
            actionLabel="Review queue"
            onAction={() => onNavigate('approvals')}
          />
          {model.pendingApprovals.length === 0 ? (
            <CompactEmptyState title="Queue clear" detail="No tool or policy decisions are waiting." />
          ) : (
            <div className="control-row-list compact">
              {model.pendingApprovals.slice(0, 4).map((approval) => (
                <button
                  className="control-data-row"
                  key={approval.approvalId}
                  type="button"
                  onClick={() => onNavigate('approvals')}
                >
                  <StatusDot status="waiting_approval" />
                  <span>
                    <strong>{approval.targetKey ?? 'Policy decision'}</strong>
                    <small>{approval.clientName ?? approval.agentName ?? shortId(approval.runId)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="control-panel control-panel-wide">
          <PanelHeader title="Recent activity" meta={`Snapshot ${formatDateTime(model.generatedAt)}`} />
          {model.recentActivity.length === 0 ? (
            <CompactEmptyState title="No activity recorded" detail="Run, approval, usage, and audit events will collect here." />
          ) : (
            <ol className="control-activity-list">
              {model.recentActivity.slice(0, 8).map((activity) => (
                <li key={activity.id}>
                  <span className={`control-activity-kind ${activity.kind}`}>{activity.kind.slice(0, 1)}</span>
                  <div>
                    <strong>{activity.label}</strong>
                    <small>{activity.detail}</small>
                  </div>
                  <time dateTime={activity.timestamp}>{formatDateTime(activity.timestamp)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="control-panel">
          <PanelHeader title="Runtime inventory" meta={model.providerState} />
          <dl className="control-definition-list">
            <div><dt>Clients</dt><dd>{model.counts.clients}</dd></div>
            <div><dt>Workspaces</dt><dd>{model.counts.workspaces}</dd></div>
            <div><dt>Agents</dt><dd>{model.counts.agents}</dd></div>
            <div><dt>Artifacts</dt><dd>{model.counts.artifacts}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  )
}

export function RunsScreen({
  model,
  selectedRun,
  events,
  eventsLoading,
  eventsError,
  runsLoading = false,
  runsError,
  hasMoreRuns = false,
  hasMoreEvents = false,
  actionBusy,
  onCancel,
  onLoadMoreEvents,
  onLoadMoreRuns,
  onReloadEvents,
  onSelectRun,
}: {
  model: OperatorConsoleViewModel
  selectedRun?: OperatorRunRow
  events: ConsoleGatewayRunEvent[]
  eventsLoading: boolean
  eventsError?: string
  runsLoading?: boolean
  runsError?: string
  hasMoreRuns?: boolean
  hasMoreEvents?: boolean
  actionBusy: boolean
  onCancel: (run: OperatorRunRow) => void
  onLoadMoreEvents?: () => void
  onLoadMoreRuns?: () => void
  onReloadEvents: () => void
  onSelectRun: (runId: string) => void
}) {
  return (
    <section className="control-screen runs-screen" aria-labelledby="runs-title">
      <header className="control-screen-header">
        <div>
          <p className="control-kicker">RunLog fabric</p>
          <h1 id="runs-title">Runs</h1>
          <p>Compatibility and RunLog work, merged into one operator timeline.</p>
        </div>
        <div className="control-header-stat">
          <strong>{model.runs.length}</strong>
          <span>visible runs</span>
        </div>
      </header>

      {runsError ? <InlineError message={runsError} /> : null}
      {runsLoading && model.runs.length === 0 ? (
        <div className="control-skeleton-list" role="status" aria-label="Loading durable runs">
          <span /><span /><span />
        </div>
      ) : model.runs.length === 0 ? (
        <LargeEmptyState
          code="RUN/00"
          title="No durable runs yet"
          detail="Start a client chat or automation test. Provider calls, tools, checkpoints, and usage will be recorded here."
        />
      ) : (
        <div className="control-run-layout">
          <aside className="control-run-index" aria-label="Run list">
            <div className="control-index-head">
              <strong>Run index</strong>
              <span>{model.counts.activeRuns} active</span>
            </div>
            <div className="control-run-list">
              {model.runs.map((run) => (
                <button
                  aria-pressed={run.runId === selectedRun?.runId}
                  className={run.runId === selectedRun?.runId ? 'control-run-row selected' : 'control-run-row'}
                  key={run.runId}
                  type="button"
                  onClick={() => onSelectRun(run.runId)}
                >
                  <StatusDot status={run.status} />
                  <span>
                    <strong>{run.agentName ?? 'Unassigned agent'}</strong>
                    <small>{run.clientName ?? run.workspaceName ?? 'Local workspace'}</small>
                  </span>
                  <span className="control-run-row-tail">
                    <strong>{humanizeStatus(run.status)}</strong>
                    <small>{formatDateTime(run.lastActivityAt ?? run.createdAt)}</small>
                  </span>
                </button>
              ))}
            </div>
            {hasMoreRuns ? (
              <button
                className="simple-secondary control-run-load-more"
                disabled={runsLoading}
                type="button"
                onClick={onLoadMoreRuns}
              >
                {runsLoading ? 'Loading runs…' : 'Load more runs'}
              </button>
            ) : null}
          </aside>

          {selectedRun ? (
            <article className="control-run-detail">
              <header className="control-run-detail-head">
                <div>
                  <div className="control-inline-status">
                    <StatusDot status={selectedRun.status} />
                    <span>{humanizeStatus(selectedRun.status)}</span>
                    <em>{selectedRun.source}</em>
                  </div>
                  <h2>{selectedRun.agentName ?? 'Agent run'}</h2>
                  <code>{selectedRun.runId}</code>
                </div>
                {selectedRun.cancellable ? (
                  <button
                    className="control-danger-button"
                    disabled={actionBusy}
                    type="button"
                    onClick={() => onCancel(selectedRun)}
                  >
                    Cancel run
                  </button>
                ) : null}
              </header>

              <dl className="control-run-facts">
                <Fact label="Client" value={selectedRun.clientName ?? 'Unassigned'} />
                <Fact label="Workspace" value={selectedRun.workspaceName ?? selectedRun.workspaceId ?? 'Unassigned'} />
                <Fact label="Provider" value={selectedRun.providerLabel ?? selectedRun.providerId ?? 'Default route'} />
                <Fact label="Model" value={selectedRun.modelId ?? 'Provider default'} />
                <Fact label="Events" value={String(selectedRun.eventCount)} />
                <Fact label="Artifacts" value={String(selectedRun.artifactCount)} />
              </dl>

              <section className="control-timeline-section">
                <PanelHeader
                  title="Event timeline"
                  meta={eventsLoading ? 'loading' : `${events.length} events`}
                  actionLabel="Reload"
                  onAction={onReloadEvents}
                />
                {eventsError ? <InlineError message={eventsError} /> : null}
                {eventsLoading && events.length === 0 ? (
                  <div className="control-skeleton-list" role="status" aria-label="Loading run events">
                    <span /><span /><span />
                  </div>
                ) : events.length === 0 ? (
                  <CompactEmptyState title="No public events returned" detail="The run exists, but its event endpoint has no visible rows yet." />
                ) : (
                  <ol className="control-timeline">
                    {events.map((event, index) => (
                      <li key={`${event.runId}:${event.seq ?? index}:${event.type}`}>
                        <span className="control-timeline-line" aria-hidden="true" />
                        <div className="control-timeline-marker" aria-hidden="true" />
                        <article>
                          <header>
                            <strong>{humanizeStatus(String(event.type))}</strong>
                            <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
                          </header>
                          {event.payload === undefined ? null : <pre>{previewPayload(event.payload)}</pre>}
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
                {hasMoreEvents ? (
                  <button
                    className="simple-secondary control-run-load-more"
                    disabled={eventsLoading}
                    type="button"
                    onClick={onLoadMoreEvents}
                  >
                    {eventsLoading ? 'Loading eventsâ€¦' : 'Load earlier events'}
                  </button>
                ) : null}
              </section>

              <div className="control-run-summary-grid">
                <RunSummaryList
                  title="Tool calls"
                  empty="No tool calls recorded"
                  rows={selectedRun.toolCalls.map((toolCall) => ({
                    id: toolCall.toolCallId,
                    label: toolCall.name,
                    value: toolCall.status,
                  }))}
                />
                <RunSummaryList
                  title="Checkpoints"
                  empty="No checkpoints recorded"
                  rows={selectedRun.checkpoints.map((checkpoint) => ({
                    id: checkpoint.eventId,
                    label: checkpoint.kind ?? 'checkpoint',
                    value: `seq ${checkpoint.seq}`,
                  }))}
                />
                <RunSummaryList
                  title="Policy decisions"
                  empty="No policy decisions recorded"
                  rows={selectedRun.policyDecisions.map((decision) => ({
                    id: decision.decisionId,
                    label: decision.targetKey,
                    value: humanizeStatus(decision.state),
                  }))}
                />
                <RunSummaryList
                  title="Errors"
                  empty="No runtime errors recorded"
                  tone="error"
                  rows={selectedRun.errors.map((error) => ({
                    id: error.eventId,
                    label: error.message ?? error.type,
                    value: `seq ${error.seq}`,
                  }))}
                />
              </div>
            </article>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function ApprovalsScreen({
  model,
  actionBusy,
  loading = false,
  error,
  hasMore = false,
  onLoadMore,
  onResolve,
}: {
  model: OperatorConsoleViewModel
  actionBusy: boolean
  loading?: boolean
  error?: string
  hasMore?: boolean
  onLoadMore?: () => void
  onResolve: (
    approval: OperatorApprovalRow,
    decision: 'approved' | 'denied',
    reason?: string,
  ) => void
}) {
  const resolved = model.approvals.filter((approval) => approval.status !== 'pending')
  return (
    <section className="control-screen approvals-screen" aria-labelledby="approvals-title">
      <header className="control-screen-header">
        <div>
          <p className="control-kicker">Human control boundary</p>
          <h1 id="approvals-title">Approvals</h1>
          <p>Review side effects with their client, agent, run, and policy target attached.</p>
        </div>
        <div className={`control-header-stat ${model.counts.pendingApprovals > 0 ? 'warning' : ''}`}>
          <strong>{model.counts.pendingApprovals}</strong>
          <span>waiting decisions</span>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}

      {model.pendingApprovals.length === 0 ? (
        <LargeEmptyState
          code="GATE/CLEAR"
          title="Approval queue clear"
          detail="No compatibility or RunLog action is waiting for an operator decision."
        />
      ) : (
        <div className="control-approval-grid">
          {model.pendingApprovals.map((approval) => (
            <ApprovalCard
              actionBusy={actionBusy}
              approval={approval}
              key={approval.approvalId}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}

      <section className="control-panel control-history-panel">
        <PanelHeader title="Recent decisions" meta={loading ? 'loading' : `${resolved.length} recorded`} />
        {resolved.length === 0 ? (
          <CompactEmptyState title="No decisions in this snapshot" detail="Resolved compatibility approvals will appear here." />
        ) : (
          <div className="control-row-list">
            {resolved.slice(0, 12).map((approval) => (
              <div className="control-data-row static" key={approval.approvalId}>
                <StatusDot status={approval.status} />
                <span>
                  <strong>{approval.targetKey ?? approval.approvalId}</strong>
                  <small>{approval.clientName ?? shortId(approval.runId)} · {approval.source}</small>
                </span>
                <span className="control-row-meta">
                  <strong>{humanizeStatus(approval.status)}</strong>
                  <small>{formatDateTime(approval.resolvedAt ?? approval.requestedAt)}</small>
                </span>
              </div>
            ))}
          </div>
        )}
        {hasMore ? (
          <button
            className="simple-secondary control-run-load-more"
            disabled={loading}
            type="button"
            onClick={onLoadMore}
          >
            {loading ? 'Loading approvalsâ€¦' : 'Load more approvals'}
          </button>
        ) : null}
      </section>
    </section>
  )
}

export function UsageScreen({
  entries = [],
  error,
  hasMore = false,
  loading = false,
  model,
  onLoadMore,
}: {
  entries?: ConsoleGatewayUsageLedgerEntry[]
  error?: string
  hasMore?: boolean
  loading?: boolean
  model: OperatorConsoleViewModel
  onLoadMore?: () => void
}) {
  return (
    <section className="control-screen usage-screen" aria-labelledby="usage-title">
      <header className="control-screen-header">
        <div>
          <p className="control-kicker">Local usage ledger</p>
          <h1 id="usage-title">Usage & budgets</h1>
          <p>Provider estimates only. Unpriced calls remain visible instead of being treated as zero-cost.</p>
        </div>
        <div className="control-header-stat">
          <strong>{formatMoney(model.usage.estimatedCostUsd)}</strong>
          <span>estimated total</span>
        </div>
      </header>

      <div className="control-metric-grid usage-metrics">
        <MetricCard label="Ledger entries" value={String(model.usage.entries)} detail={`${model.usage.pricedEntries} priced`} tone="neutral" />
        <MetricCard label="Total tokens" value={formatTokens(model.usage.totalTokens)} detail={`${formatTokens(model.usage.inputTokens)} in · ${formatTokens(model.usage.outputTokens)} out`} tone="live" />
        <MetricCard label="Unpriced entries" value={String(model.usage.unpricedEntries)} detail={model.usage.unpricedEntries > 0 ? 'Estimate coverage incomplete' : 'Estimate coverage complete'} tone={model.usage.unpricedEntries > 0 ? 'warning' : 'good'} />
        <MetricCard label="Active budgets" value={String(model.budgets.length)} detail={`${model.budgets.filter((budget) => budget.status === 'blocked' || budget.status === 'warn').length} need attention`} tone={model.budgets.some((budget) => budget.status === 'blocked' || budget.status === 'warn') ? 'warning' : 'neutral'} />
      </div>

      <div className="control-usage-grid">
        <UsageBreakdown title="By provider" rows={model.usage.providers} />
        <UsageBreakdown title="By model" rows={model.usage.models} />
      </div>

      <section className="control-panel control-history-panel">
        <PanelHeader title="Recent ledger entries" meta={loading ? 'loading' : `${entries.length} visible`} />
        {error ? <InlineError message={error} /> : null}
        {loading && entries.length === 0 ? (
          <div className="control-skeleton-list" role="status" aria-label="Loading usage history">
            <span /><span /><span />
          </div>
        ) : entries.length === 0 ? (
          <CompactEmptyState title="No detailed usage entries yet" detail="Provider reports will appear here as durable ledger rows." />
        ) : (
          <div className="control-row-list">
            {entries.map((entry) => (
              <div className="control-data-row static" key={entry.entryId}>
                <StatusDot status={entry.estimatedCostUsd === undefined ? 'warn' : 'completed'} />
                <span>
                  <strong>{entry.modelId ?? entry.providerId ?? 'Provider usage'}</strong>
                  <small>{entry.providerId ?? 'Unassigned provider'} | {formatTokens(entry.totalTokens ?? 0)}</small>
                </span>
                <span className="control-row-meta">
                  <strong>{entry.estimatedCostUsd === undefined ? 'Unpriced' : formatMoney(entry.estimatedCostUsd)}</strong>
                  <small>{formatDateTime(entry.createdAt)}</small>
                </span>
              </div>
            ))}
          </div>
        )}
        {hasMore ? (
          <button
            className="simple-secondary control-run-load-more"
            disabled={loading}
            type="button"
            onClick={onLoadMore}
          >
            {loading ? 'Loading usage...' : 'Load more usage'}
          </button>
        ) : null}
      </section>

      <section className="control-panel control-budget-panel">
        <PanelHeader title="Budget guardrails" meta={`${model.budgets.length} active`} />
        {model.budgets.length === 0 ? (
          <CompactEmptyState title="No budget guardrails configured" detail="Usage remains visible, but no client, workspace, or agent threshold is active." />
        ) : (
          <div className="control-budget-grid">
            {model.budgets.map((budget) => (
              <article className={`control-budget-card ${budget.status}`} key={budget.budgetId}>
                <header>
                  <div>
                    <strong>{budget.label}</strong>
                    <small>{budget.scopeLabel}</small>
                  </div>
                  <span>{humanizeStatus(budget.status)}</span>
                </header>
                <progress max={Math.max(budget.maxEstimatedCostUsd, 0.0001)} value={budget.usedEstimatedCostUsd}>
                  {budget.usedEstimatedCostUsd} of {budget.maxEstimatedCostUsd}
                </progress>
                <div>
                  <span>{formatMoney(budget.usedEstimatedCostUsd)} used</span>
                  <span>{formatMoney(budget.maxEstimatedCostUsd)} limit</span>
                </div>
                {budget.unpricedUsageEntryCount > 0 ? (
                  <small>{budget.unpricedUsageEntryCount} unpriced entr{budget.unpricedUsageEntryCount === 1 ? 'y' : 'ies'} reduce estimate coverage.</small>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export function ArtifactsScreen({
  artifacts = [],
  error,
  hasMore = false,
  loading = false,
  onLoadMore,
}: {
  artifacts?: ConsoleGatewayArtifact[]
  error?: string
  hasMore?: boolean
  loading?: boolean
  onLoadMore?: () => void
}) {
  return (
    <section className="control-screen artifacts-screen" aria-labelledby="artifacts-title">
      <header className="control-screen-header">
        <div>
          <p className="control-kicker">Durable outcomes</p>
          <h1 id="artifacts-title">Artifacts</h1>
          <p>Browser-safe artifact inventory. Files remain available only through the gateway browser-access route.</p>
        </div>
        <div className="control-header-stat">
          <strong>{artifacts.length}</strong>
          <span>visible artifacts</span>
        </div>
      </header>

      <section className="control-panel control-history-panel">
        <PanelHeader title="Recent artifacts" meta={loading ? 'loading' : `${artifacts.length} visible`} />
        {error ? <InlineError message={error} /> : null}
        {loading && artifacts.length === 0 ? (
          <div className="control-skeleton-list" role="status" aria-label="Loading artifact history">
            <span /><span /><span />
          </div>
        ) : artifacts.length === 0 ? (
          <CompactEmptyState title="No artifacts recorded" detail="Run outputs that become indexed artifacts will appear here." />
        ) : (
          <div className="control-row-list">
            {artifacts.map((artifact) => (
              <div className="control-data-row static" key={artifact.artifactId}>
                <StatusDot status="completed" />
                <span>
                  <strong>{artifact.label ?? artifact.kind}</strong>
                  <small>
                    {artifact.kind} | {artifact.mediaType ?? 'Unspecified media'} | {formatBytes(artifact.sizeBytes)}
                  </small>
                </span>
                <span className="control-row-meta">
                  <strong>{shortId(artifact.runId)}</strong>
                  <small>{formatDateTime(artifact.createdAt)}</small>
                </span>
              </div>
            ))}
          </div>
        )}
        {hasMore ? (
          <button
            className="simple-secondary control-run-load-more"
            disabled={loading}
            type="button"
            onClick={onLoadMore}
          >
            {loading ? 'Loading artifacts...' : 'Load more artifacts'}
          </button>
        ) : null}
      </section>
    </section>
  )
}

function ApprovalCard({
  approval,
  actionBusy,
  onResolve,
}: {
  approval: OperatorApprovalRow
  actionBusy: boolean
  onResolve: (
    approval: OperatorApprovalRow,
    decision: 'approved' | 'denied',
    reason?: string,
  ) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <article className="control-approval-card">
      <header>
        <div className="control-inline-status">
          <StatusDot status="waiting_approval" />
          <span>Waiting</span>
          <em>{approval.source}</em>
        </div>
        <time dateTime={approval.requestedAt}>{formatDateTime(approval.requestedAt)}</time>
      </header>
      <h2>{approval.targetKey ?? 'Policy-gated action'}</h2>
      <dl>
        <Fact label="Client" value={approval.clientName ?? 'Unassigned'} />
        <Fact label="Agent" value={approval.agentName ?? 'Unassigned'} />
        <Fact label="Run" value={shortId(approval.runId)} />
      </dl>
      <label>
        Decision note <span>optional</span>
        <textarea
          placeholder="Record why this action is safe or should remain blocked."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="control-approval-actions">
        <button
          className="control-primary-button"
          disabled={actionBusy}
          type="button"
          onClick={() => onResolve(approval, 'approved', reason.trim() || undefined)}
        >
          Approve once
        </button>
        <button
          className="control-danger-button"
          disabled={actionBusy}
          type="button"
          onClick={() => onResolve(approval, 'denied', reason.trim() || undefined)}
        >
          Deny
        </button>
      </div>
    </article>
  )
}

function UsageBreakdown({ title, rows }: { title: string; rows: OperatorUsageRow[] }) {
  return (
    <section className="control-panel control-usage-table-panel">
      <PanelHeader title={title} meta={`${rows.length} tracked`} />
      {rows.length === 0 ? (
        <CompactEmptyState title="No usage breakdown" detail="Provider and model rows appear after the first ledger entry." />
      ) : (
        <div className="control-table-scroll">
          <table className="control-table">
            <thead>
              <tr><th>Route</th><th>Calls</th><th>Tokens</th><th>Estimate</th><th>Coverage</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.entries}</td>
                  <td>{formatTokens(row.totalTokens)}</td>
                  <td>{formatMoney(row.estimatedCostUsd)}</td>
                  <td>{row.unpricedEntries > 0 ? `${row.unpricedEntries} unpriced` : 'complete'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string
  value: string
  detail: string
  tone: 'neutral' | 'live' | 'good' | 'warning'
  onClick?: () => void
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  )
  return onClick ? (
    <button className={`control-metric ${tone}`} type="button" onClick={onClick}>{content}</button>
  ) : (
    <article className={`control-metric ${tone}`}>{content}</article>
  )
}

function PanelHeader({
  title,
  meta,
  actionLabel,
  onAction,
}: {
  title: string
  meta?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <header className="control-panel-header">
      <div><h2>{title}</h2>{meta ? <span>{meta}</span> : null}</div>
      {actionLabel && onAction ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}
    </header>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function StatusDot({ status }: { status: string }) {
  return <span className={`control-status-dot ${statusTone(status)}`} aria-label={humanizeStatus(status)} />
}

function CompactEmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="control-compact-empty"><strong>{title}</strong><p>{detail}</p></div>
}

function LargeEmptyState({ code, title, detail }: { code: string; title: string; detail: string }) {
  return (
    <div className="control-large-empty">
      <span>{code}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return <div className="control-inline-error" role="alert"><strong>Could not load run events</strong><span>{message}</span></div>
}

function RunSummaryList({
  title,
  empty,
  rows,
  tone = 'default',
}: {
  title: string
  empty: string
  rows: Array<{ id: string; label: string; value: string }>
  tone?: 'default' | 'error'
}) {
  return (
    <section className={`control-run-summary ${tone}`}>
      <header><h3>{title}</h3><span>{rows.length}</span></header>
      {rows.length === 0 ? <p>{empty}</p> : (
        <ul>{rows.map((row) => <li key={row.id}><strong>{row.label}</strong><span>{row.value}</span></li>)}</ul>
      )}
    </section>
  )
}

function statusTone(status: string): 'live' | 'warning' | 'good' | 'error' | 'neutral' {
  if (status === 'running' || status === 'queued') return 'live'
  if (status === 'waiting_approval' || status === 'awaiting_approval' || status === 'pending' || status === 'warn') return 'warning'
  if (status === 'completed' || status === 'approved' || status === 'ok') return 'good'
  if (status === 'failed' || status === 'denied' || status === 'cancelled' || status === 'blocked') return 'error'
  return 'neutral'
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function formatBytes(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Size unavailable'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(value?: string): string {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function shortId(value: string): string {
  const parts = value.split('_')
  const tail = parts.length > 1 ? parts.at(-1) ?? value : value
  return tail.length > 10 ? tail.slice(0, 10) : tail
}

function previewPayload(payload: unknown): string {
  try {
    const value = JSON.stringify(payload, null, 2)
    return value.length > 1_200 ? `${value.slice(0, 1_197)}...` : value
  } catch {
    return String(payload)
  }
}
