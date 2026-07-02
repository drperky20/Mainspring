import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  createStaticGatewaySnapshotDataSource,
  prototypeConsoleStorageKey,
} from './consoleDataSource'
import { composeConsoleDashboardReadModel } from './consoleReadModelPipeline'
import {
  deriveAppDashboardBootstrap,
  resolveAppDashboardBootstrapMode,
} from './appDashboardBootstrap'
import { type DashboardViewModel } from './dashboardViewModel'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createLocalGatewayClient,
  type GatewayProvenanceReview,
  type LocalGatewayClient,
} from './localGatewayClient'
import {
  formatGatewaySessionOptionLabel,
  listGatewaySessionsForClient,
  selectGatewayPendingApprovalForSession,
  selectGatewayRunForSession,
  selectGatewaySessionForClient,
} from './localGatewaySelection'
import {
  clientDeletionGuard,
  workspaceDeletionGuard,
} from './localGatewayDeletionGuards'
import {
  deriveLocalGatewayArtifactAccessUrls,
  deriveLocalGatewayEventStreamAccessUrl,
  localGatewayEventStreamUrl,
  localGatewayUrlFromEnv,
} from './localGatewayTransport'
import { artifactPresentation } from './artifactPresentation'
import {
  createPrototypeRunTraceViewModel,
  gatewayProjectionToRunTraceViewModel,
  gatewayRunEventsToTraceViewModel,
  type RunTraceViewModel,
} from './runTraceViewModel'
import type {
  ConsoleDashboardApprovalRow,
  ConsoleDashboardClientDetail,
  ConsoleDashboardRunRow,
} from './dashboardProjection'

type Screen =
  | 'dashboard'
  | 'new-client'
  | 'new-workspace'
  | 'provider-profile'
  | 'agent-spec'
  | 'skills'
  | 'trace'

type Account = {
  username: string
  salt: string
  passwordHash: string
  passwordAlgorithm?: 'sha256-v1' | 'pbkdf2-sha256-v1'
  passwordIterations?: number
}

type Client = {
  id: string
  name: string
  contact: string
  workspace: string
  billingLabel: string
  workspaceName?: string
}

type GatewayDraftClient = {
  clientId: string
  workspaceId?: string
  sessionId?: string
  name: string
  workspace: string
  contact: string
  billingLabel: string
}

type GatewayEditingClient = {
  clientId: string
  workspaceId?: string
  name: string
  contact: string
  billingLabel: string
  workspaceName: string
  workspaceRoot: string
}

type GatewayWorkspaceDraft = {
  clientId: string
  clientName: string
  workspaceName: string
  workspaceRoot: string
}

type GatewayProviderProfileDraft = {
  profileId?: string
  providerId: string
  label: string
  defaultModelId: string
  secretRef: string
  secretValue?: string
  credentialState?: 'configured' | 'missing' | 'unavailable' | 'unverified'
  status?: 'active' | 'archived'
}

type GatewayBudgetEvaluation = NonNullable<ConsoleGatewaySnapshot['budgetEvaluations']>[number]
type GatewayPricingCatalogStatus = NonNullable<ConsoleGatewaySnapshot['pricingCatalog']>
type GatewayUsageStatus = NonNullable<ConsoleGatewaySnapshot['usageStatus']>
type GatewayCronSchedule = NonNullable<ConsoleGatewaySnapshot['cronSchedules']>[number]
type GatewayCronGrantPreview = Awaited<ReturnType<LocalGatewayClient['cronGrant']>>['cronGrant']

export function ProvenanceReviewSummary({
  reviews,
}: {
  reviews: GatewayProvenanceReview[]
}) {
  if (reviews.length === 0) return null
  const pendingCount = reviews.filter((review) => review.status === 'pending').length
  const approvedCount = reviews.filter((review) => review.status === 'approved').length
  const first = reviews[0]
  const mutationSummary =
    first.mutation.kind === 'memory'
      ? `${first.mutation.scope} memory: ${first.mutation.textPreview}`
      : first.mutation.kind === 'skill'
        ? `${first.mutation.action} skill ${first.mutation.manifest.name} (${first.mutation.manifest.permissionSummary})`
        : first.mutation.summary
  return (
    <div className="preview-block provenance-review-summary">
      <h2>Provenance reviews</h2>
      <KeyValue
        label="Queue"
        value={`${reviews.length} staged mutation${reviews.length === 1 ? '' : 's'}`}
        action={`${pendingCount} pending, ${approvedCount} approved`}
      />
      <KeyValue label="Selected" value={first.reviewId} action={first.status} />
      <KeyValue label="Mutation" value={mutationSummary} action={first.kind} />
      <KeyValue label="Source" value={first.source} action={first.actor ?? 'runtime'} />
      <KeyValue label="Scan" value={first.scan.status} action={`${first.scan.findings.length} finding${first.scan.findings.length === 1 ? '' : 's'}`} />
      {first.scan.findings.length > 0 ? (
        <small className="gateway-action-hint">
          Findings: {first.scan.findings.map((finding) => `${finding.ruleId}:${finding.severity}`).join(', ')}.
        </small>
      ) : (
        <small className="gateway-action-hint">
          Review payload is the sanitized gateway projection; workspace roots and raw mutation files stay server-side.
        </small>
      )}
    </div>
  )
}

function budgetToolPolicyLabel(mode: GatewayBudgetEvaluation['costSensitiveTools']['mode']): string {
  if (mode === 'approval') return 'Cost-sensitive tools require budget review'
  if (mode === 'block') return 'Cost-sensitive tools are blocked'
  return 'Cost-sensitive tools allowed'
}

export function BudgetToolPolicySummary({
  evaluation,
}: {
  evaluation?: GatewayBudgetEvaluation
}) {
  if (!evaluation) return null
  return (
    <small className="gateway-action-hint">
      {budgetToolPolicyLabel(evaluation.costSensitiveTools.mode)}: {evaluation.costSensitiveTools.reason}
    </small>
  )
}

export function PricingCatalogStatusSummary({
  pricingCatalog,
}: {
  pricingCatalog?: GatewayPricingCatalogStatus
}) {
  if (!pricingCatalog) return null
  const source = pricingCatalog.configured
    ? `configured catalog${pricingCatalog.sourceLabel ? ` (${pricingCatalog.sourceLabel})` : ''}`
    : 'built-in estimates'
  return (
    <small className="gateway-action-hint">
      Pricing: {source}; {pricingCatalog.entries} model
      {pricingCatalog.entries === 1 ? '' : 's'} tracked
      {pricingCatalog.configured
        ? `, ${pricingCatalog.configuredEntries} configured`
        : ''}
      .
    </small>
  )
}

export function UsageStatusSummary({
  usageStatus,
}: {
  usageStatus?: GatewayUsageStatus
}) {
  if (!usageStatus) return null
  return (
    <small className="gateway-action-hint">
      Usage: {usageStatus.total.summary.entries} ledger entr
      {usageStatus.total.summary.entries === 1 ? 'y' : 'ies'}; est $
      {usageStatus.estimatedCostUsd.toFixed(3)}; {usageStatus.unpricedEntries} unpriced.
    </small>
  )
}

export function CronGrantSummary({
  schedule,
  preview,
}: {
  schedule?: GatewayCronSchedule
  preview?: GatewayCronGrantPreview
}) {
  if (!schedule) return null
  const snapshotGrant = schedule.cronGrant
  const activeGrant = preview?.grant ?? snapshotGrant
  const lastDecision = preview?.decision ?? preview?.lastDecision ?? snapshotGrant?.lastDecision
  const grantRequired = preview?.grantRequired ?? Boolean(snapshotGrant)
  const grantPresent = preview?.grantPresent ?? Boolean(activeGrant?.grantId)
  const allowedTools = activeGrant?.allowedTools ?? snapshotGrant?.allowedTools ?? preview?.allowedTools ?? []
  const decisionState = lastDecision?.state ?? (grantRequired ? 'unknown' : 'not required')
  const decisionReasons =
    'reasons' in (lastDecision ?? {})
      ? (lastDecision as { reasons?: string[] }).reasons ?? []
      : []

  return (
    <div className="preview-block cron-grant-summary">
      <h2>Cron grant</h2>
      <KeyValue label="Schedule" value={schedule.label} action={schedule.enabled ? 'Enabled' : 'Disabled'} />
      <KeyValue
        label="Grant state"
        value={grantPresent ? 'Scoped grant active' : grantRequired ? 'Grant required' : 'No grant required'}
        action={snapshotGrant?.mode ?? preview?.cronMode ?? 'policy'}
      />
      <KeyValue label="Policy decision" value={decisionState} />
      <KeyValue
        label="Allowed tools"
        value={allowedTools.length > 0 ? allowedTools.join(', ') : 'No side-effecting tools allowed'}
      />
      {activeGrant?.expiresAt ? (
        <KeyValue label="Expires" value={formatDetailTimestamp(activeGrant.expiresAt)} />
      ) : null}
      {typeof activeGrant?.executionCount === 'number'
        && typeof activeGrant?.maxExecutionCount === 'number' ? (
          <KeyValue
            label="Executions"
            value={`${activeGrant.executionCount}/${activeGrant.maxExecutionCount}`}
          />
        ) : null}
      {decisionReasons.length > 0 ? (
        <small className="gateway-action-hint">
          Last decision: {decisionReasons.join(', ')}.
        </small>
      ) : (
        <small className="gateway-action-hint">
          Review uses the gateway projection and never displays raw prompt hashes or secret refs.
        </small>
      )}
    </div>
  )
}

type Agent = {
  id: string
  clientId: string
  name: string
  outcome: string
  instructions: string
  voice: string
  model: string
  approvalMode: 'Ask first' | 'Balanced' | 'Autonomous'
  skills: Record<string, boolean>
}

type ProviderAuth = {
  provider: string
  status: 'Not connected' | 'Saved locally'
  maskedKey?: string
}

type ConsoleState = {
  account?: Account
  lastUser?: string
  clients: Client[]
  agents: Agent[]
  providers: ProviderAuth[]
  models: Record<string, string>
  presets: string[]
}

type AuthMode = 'create' | 'unlock'
type HostedGatewayAuthMode = 'create-admin' | 'login'

const storageKey = prototypeConsoleStorageKey

const defaultState: ConsoleState = {
  clients: [],
  agents: [],
  providers: [
    { provider: 'OpenRouter', status: 'Not connected' },
    { provider: 'OpenAI', status: 'Not connected' },
    { provider: 'Local proxy', status: 'Saved locally', maskedKey: 'local runtime' },
  ],
  models: {
    'Default chat model': 'openrouter/free',
    'Coding model': 'gpt-5.5',
    'Local fallback': 'local/qwen',
  },
  presets: ['Support agent', 'Coding agent', 'Personal assistant'],
}

const starterSkills = {
  'File tools': true,
  Memory: true,
  'Web fetch': false,
  Shell: false,
  Browser: false,
}

function loadState(): ConsoleState {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState
  } catch {
    return defaultState
  }
}

function saveState(state: ConsoleState) {
  localStorage.setItem(storageKey, JSON.stringify(state))
}

const PROTOTYPE_PASSWORD_ITERATIONS = 150_000

async function hashPrototypePassword(input: {
  password: string
  salt: string
  algorithm?: Account['passwordAlgorithm']
  iterations?: number
}) {
  const algorithm = input.algorithm ?? 'pbkdf2-sha256-v1'
  const encoded = new TextEncoder().encode(input.password)
  if (algorithm === 'sha256-v1') {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${input.salt}:${input.password}`),
    )
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoded,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(input.salt),
      iterations: input.iterations ?? PROTOTYPE_PASSWORD_ITERATIONS,
    },
    keyMaterial,
    256,
  )
  return Array.from(new Uint8Array(derived))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function makeSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function gatewayDraftClientToPrototypeClient(draft: GatewayDraftClient): Client {
  return {
    id: draft.clientId,
    name: draft.name,
    contact: draft.contact,
    workspace: draft.workspace,
    billingLabel: draft.billingLabel,
  }
}

function gatewaySnapshotClientToPrototypeClient(input: {
  client: ConsoleGatewaySnapshot['clients'][number]
  workspace?: ConsoleGatewaySnapshot['workspaces'][number]
}): Client {
  return {
    id: input.client.clientId,
    name: input.client.name,
    contact: '',
    workspace: input.workspace?.name ?? 'Workspace',
    billingLabel: '',
  }
}

function gatewaySnapshotAgentToPrototypeAgent(input: {
  agent: ConsoleGatewaySnapshot['agents'][number]
  clientId: string
}): Agent {
  return {
    id: input.agent.agentId,
    clientId: input.clientId,
    name: input.agent.name,
    outcome: input.agent.outcome ?? 'Define the operator-facing outcome.',
    instructions: input.agent.instructions ?? 'Stay careful and ask before risky actions.',
    voice: input.agent.voice ?? 'Plain, careful, friendly',
    model: input.agent.modelLabel ?? input.agent.defaultModelId ?? 'Saved model: default chat',
    approvalMode:
      input.agent.approvalMode === 'Ask first' ||
      input.agent.approvalMode === 'Autonomous' ||
      input.agent.approvalMode === 'Balanced'
        ? input.agent.approvalMode
        : 'Balanced',
    skills: input.agent.skills ?? starterSkills,
  }
}

function runtimeModelIdFromDraftModel(model: string): string | undefined {
  return model.includes('/') ? model : undefined
}

function prototypeBannerForMode(input: {
  localGatewayMode: boolean
  developmentFixturePreview: boolean
}): string {
  if (input.localGatewayMode) {
    return 'Local gateway dev mode: runs, approvals, usage, and traces come from the local gateway. Renderer storage stays prototype-only and provider keys stay server-side.'
  }
  if (input.developmentFixturePreview) {
    return 'Development fixture preview: dashboard and trace composition use a static safe gateway snapshot. No live runtime transport is active.'
  }
  return 'Prototype console: drafts and masked auth status use browser localStorage; runtime runs, approvals, usage, and traces are not live yet.'
}

export function App() {
  const [state, setState] = useState<ConsoleState>(() => loadState())
  const [unlocked, setUnlocked] = useState(false)
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(2)
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const [selectedGatewayWorkspaceId, setSelectedGatewayWorkspaceId] = useState<string>()
  const [selectedGatewaySessionId, setSelectedGatewaySessionId] = useState<string>()
  const [selectedGatewayProviderProfileId, setSelectedGatewayProviderProfileId] = useState<string>()
  const [selectedGatewayCronScheduleId, setSelectedGatewayCronScheduleId] = useState<string>()
  const [selectedGatewayBudgetId, setSelectedGatewayBudgetId] = useState<string>()
  const [selectedGatewayDeploymentTargetId, setSelectedGatewayDeploymentTargetId] = useState<string>()
  const [selectedPreviewClientId, setSelectedPreviewClientId] = useState<string>()
  const [gatewayDraftClient, setGatewayDraftClient] = useState<GatewayDraftClient>()
  const [gatewayEditingClient, setGatewayEditingClient] = useState<GatewayEditingClient>()
  const [gatewayWorkspaceDraft, setGatewayWorkspaceDraft] = useState<GatewayWorkspaceDraft>()
  const [gatewayEditingProviderProfile, setGatewayEditingProviderProfile] =
    useState<GatewayProviderProfileDraft>()
  const [gatewaySnapshot, setGatewaySnapshot] = useState<ConsoleGatewaySnapshot | null>(null)
  const [gatewayPrompt, setGatewayPrompt] = useState(
    'Review the workspace and propose the next operator action.',
  )
  const [gatewayCronLabel, setGatewayCronLabel] = useState('Daily report')
  const [gatewayCronExpr, setGatewayCronExpr] = useState('0 9 * * 1')
  const [gatewayCronTimezone, setGatewayCronTimezone] = useState<'local' | 'utc'>('local')
  const [gatewayCronGrantPreview, setGatewayCronGrantPreview] = useState<GatewayCronGrantPreview>()
  const [gatewayBudgetScopeType, setGatewayBudgetScopeType] = useState<'client' | 'workspace' | 'agent'>('workspace')
  const [gatewayBudgetLabel, setGatewayBudgetLabel] = useState('Workspace budget')
  const [gatewayBudgetMaxUsd, setGatewayBudgetMaxUsd] = useState('25')
  const [gatewayBudgetWarnUsd, setGatewayBudgetWarnUsd] = useState('20')
  const [gatewayAllowBudgetWarning, setGatewayAllowBudgetWarning] = useState(false)
  const [gatewayRunComputerId, setGatewayRunComputerId] = useState('computer_local')
  const [gatewayDeploymentLabel, setGatewayDeploymentLabel] = useState('Workspace VPS')
  const [gatewayDeploymentSshHost, setGatewayDeploymentSshHost] = useState('')
  const [gatewayDeploymentSshUser, setGatewayDeploymentSshUser] = useState('ubuntu')
  const [gatewayDeploymentSshPort, setGatewayDeploymentSshPort] = useState('22')
  const [gatewayDeploymentRemoteRoot, setGatewayDeploymentRemoteRoot] = useState('/srv/mainspring')
  const [gatewayDeploymentServiceName, setGatewayDeploymentServiceName] = useState('mainspring')
  const [gatewayDeploymentEnvFilePath, setGatewayDeploymentEnvFilePath] = useState('/etc/mainspring/mainspring.env')
  const [gatewayDeploymentDomain, setGatewayDeploymentDomain] = useState('')
  const [gatewayDeploymentOperation, setGatewayDeploymentOperation] =
    useState<'deploy' | 'rollback' | 'destroy'>('deploy')
  const [gatewayDeploymentPreview, setGatewayDeploymentPreview] = useState<string>('')
  const [gatewayMarketplaceTemplates, setGatewayMarketplaceTemplates] = useState<
    Awaited<ReturnType<LocalGatewayClient['marketplaceTemplates']>>['templates']
  >([])
  const [gatewayProvenanceReviews, setGatewayProvenanceReviews] = useState<GatewayProvenanceReview[]>([])
  const [selectedGatewayMarketplaceTemplateId, setSelectedGatewayMarketplaceTemplateId] =
    useState<string>()
  const [gatewayMarketplaceWorkspaceRoot, setGatewayMarketplaceWorkspaceRoot] = useState('')
  const [gatewayTrace, setGatewayTrace] = useState<RunTraceViewModel>()
  const [gatewayLiveInventory, setGatewayLiveInventory] = useState<GatewayLiveInventory>()
  const [gatewayAuthMode, setGatewayAuthMode] = useState<'local-dev' | 'hosted'>('local-dev')
  const [gatewayAuthBootstrapRequired, setGatewayAuthBootstrapRequired] = useState(false)
  const [gatewayAuthUser, setGatewayAuthUser] = useState<{ username: string; role: 'admin' }>()
  const [gatewayError, setGatewayError] = useState('')
  const [gatewayBusy, setGatewayBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const bootstrapMode = useMemo(
    () =>
      resolveAppDashboardBootstrapMode(
        globalThis.location?.search ?? '',
        import.meta.env.VITE_MAINSPRING_CONSOLE_SOURCE,
      ),
    [],
  )
  const localGatewayMode = bootstrapMode === 'local-gateway-dev'
  const gatewayClient = useMemo(
    () =>
      localGatewayMode
        ? createLocalGatewayClient(localGatewayUrlFromEnv(globalThis.location?.search ?? ''))
        : null,
    [localGatewayMode],
  )
  const dashboardBootstrap = useMemo(
    () =>
      deriveAppDashboardBootstrap({
        prototypeState: state,
        mode: localGatewayMode ? undefined : bootstrapMode,
      }),
    [bootstrapMode, localGatewayMode, state],
  )
  useEffect(() => {
    if (localGatewayMode) return
    saveState(state)
  }, [localGatewayMode, state])
  async function refreshGatewaySnapshot() {
    if (!gatewayClient) return
    try {
      const health = await gatewayClient.health()
      setGatewayAuthMode(health.auth?.authMode ?? 'local-dev')
      setGatewayAuthBootstrapRequired(Boolean(health.auth?.bootstrapRequired))
      setGatewayAuthUser(
        health.auth?.authenticated && health.auth.user
          ? { username: health.auth.user.username, role: health.auth.user.role }
          : undefined,
      )
      if (health.auth?.authMode === 'hosted' && !health.auth.authenticated) {
        setGatewaySnapshot(null)
        setGatewayError('')
        return
      }
      const snapshot = await gatewayClient.snapshot()
      setGatewaySnapshot(snapshot)
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Gateway request failed.')
    }
  }
  useEffect(() => {
    if (!localGatewayMode || !gatewayClient) return
    let cancelled = false
    const loadSnapshot = async () => {
      try {
        const health = await gatewayClient.health()
        if (cancelled) return
        setGatewayAuthMode(health.auth?.authMode ?? 'local-dev')
        setGatewayAuthBootstrapRequired(Boolean(health.auth?.bootstrapRequired))
        setGatewayAuthUser(
          health.auth?.authenticated && health.auth.user
            ? { username: health.auth.user.username, role: health.auth.user.role }
            : undefined,
        )
        if (health.auth?.authMode === 'hosted' && !health.auth.authenticated) {
          setGatewaySnapshot(null)
          setGatewayError('')
          return
        }
        const snapshot = await gatewayClient.snapshot()
        if (cancelled) return
        setGatewaySnapshot(snapshot)
        setGatewayError('')
      } catch (error) {
        if (cancelled) return
        setGatewayError(error instanceof Error ? error.message : 'Gateway request failed.')
      }
    }
    void loadSnapshot()
    let eventSource: EventSource | null = null
    if (typeof EventSource !== 'undefined' && (gatewayAuthMode !== 'hosted' || gatewayClient.getSessionToken())) {
      void (async () => {
        try {
          const streamUrl = gatewayAuthMode === 'hosted'
            ? deriveLocalGatewayEventStreamAccessUrl(
                (await gatewayClient.browserAccessUrl({ kind: 'event-stream' })).url,
              )
            : localGatewayEventStreamUrl(localGatewayUrlFromEnv(globalThis.location?.search ?? ''))
          if (!streamUrl) {
            throw new Error('Gateway event stream access URL was rejected.')
          }
          if (cancelled) return
          eventSource = new EventSource(streamUrl)
          eventSource.addEventListener('snapshot.updated', () => {
            void loadSnapshot()
          })
          eventSource.addEventListener('run.event', () => {
            void loadSnapshot()
          })
          eventSource.addEventListener('approval.updated', () => {
            void loadSnapshot()
          })
          eventSource.onerror = () => {
            if (!cancelled) {
              setGatewayError((current) => current || 'Gateway event stream disconnected.')
            }
          }
        } catch (error) {
          if (!cancelled) {
            setGatewayError(error instanceof Error ? error.message : 'Gateway event stream auth failed.')
          }
        }
      })()
    }
    const timer = globalThis.setInterval(() => void loadSnapshot(), 10000)
    return () => {
      cancelled = true
      eventSource?.close()
      globalThis.clearInterval(timer)
    }
  }, [localGatewayMode, gatewayClient, gatewayAuthMode])
  useEffect(() => {
    if (!localGatewayMode || !gatewayClient) return
    let cancelled = false
    void gatewayClient
      .marketplaceTemplates()
      .then(({ templates }) => {
        if (cancelled) return
        setGatewayMarketplaceTemplates(templates)
        setSelectedGatewayMarketplaceTemplateId((current) => current ?? templates[0]?.templateId)
      })
      .catch(() => {
        if (cancelled) return
        setGatewayMarketplaceTemplates([])
      })
    return () => {
      cancelled = true
    }
  }, [localGatewayMode, gatewayClient])
  const gatewayReadModel = useMemo(() => {
    if (!gatewaySnapshot) return null
    const result = composeConsoleDashboardReadModel({
      dataSource: createStaticGatewaySnapshotDataSource(gatewaySnapshot),
    })
    return result.kind === 'ready' && result.source === 'gateway-snapshot' ? result : null
  }, [gatewaySnapshot])
  const dashboardViewModel = localGatewayMode
    ? gatewayReadModel?.viewModel ?? {
        source: 'gateway-projection',
        providerReady: false,
        providerState: 'missing',
        clients: [],
        statusStrip: [
          gatewayError ? 'Gateway error' : 'Connecting to local gateway',
          gatewayError || 'Awaiting snapshot',
          '0 active runs',
          '0 pending approvals',
        ],
        activeRunCount: 0,
        pendingApprovalCount: 0,
      }
    : dashboardBootstrap.viewModel
  const gatewaySelectedClientId = localGatewayMode
    ? selectedClientId ?? gatewayReadModel?.projection.clients[0]?.clientId
    : undefined
  const gatewayClientWorkspaces =
    localGatewayMode && gatewaySnapshot && gatewaySelectedClientId
      ? gatewaySnapshot.workspaces.filter((workspace) => workspace.clientId === gatewaySelectedClientId)
      : []
  const gatewayCurrentWorkspaceId =
    selectedGatewayWorkspaceId ?? gatewayClientWorkspaces[0]?.workspaceId
  const gatewayAvailableSessions =
    localGatewayMode && gatewaySnapshot && gatewaySelectedClientId
      ? listGatewaySessionsForClient({
          snapshot: gatewaySnapshot,
          clientId: gatewaySelectedClientId,
          workspaceId: gatewayCurrentWorkspaceId,
        })
      : []
  const gatewaySelectedSession =
    localGatewayMode && gatewaySnapshot && gatewaySelectedClientId
      ? selectGatewaySessionForClient({
          snapshot: gatewaySnapshot,
          clientId: gatewaySelectedClientId,
          workspaceId: gatewayCurrentWorkspaceId,
          preferredSessionId:
            selectedGatewaySessionId ??
            (gatewaySelectedClientId === gatewayDraftClient?.clientId
              ? gatewayDraftClient.sessionId
              : undefined),
        })
      : undefined
  const gatewaySelectedWorkspace =
    gatewaySelectedSession?.workspaceId
      ? gatewaySnapshot?.workspaces.find(
          (workspace) => workspace.workspaceId === gatewaySelectedSession.workspaceId,
        )
      : gatewayClientWorkspaces.find((workspace) => workspace.workspaceId === gatewayCurrentWorkspaceId)
        ?? gatewayClientWorkspaces[0]
  const gatewaySelectedClientRecord =
    localGatewayMode && gatewaySnapshot && gatewaySelectedClientId
      ? gatewaySnapshot.clients.find((client) => client.clientId === gatewaySelectedClientId)
      : undefined
  const gatewaySelectedClientDetail =
    localGatewayMode && gatewayReadModel && gatewaySelectedClientId
      ? gatewayReadModel.projection.clientDetails.find(
          (client) => client.clientId === gatewaySelectedClientId,
        )
      : undefined
  const gatewayClientDeleteGuard =
    localGatewayMode && gatewaySnapshot && gatewaySelectedClientRecord
      ? clientDeletionGuard({
          snapshot: gatewaySnapshot,
          clientId: gatewaySelectedClientRecord.clientId,
        })
      : undefined
  const gatewayWorkspaceDeleteGuard =
    localGatewayMode && gatewaySnapshot && gatewaySelectedWorkspace
      ? workspaceDeletionGuard({
          snapshot: gatewaySnapshot,
          workspaceId: gatewaySelectedWorkspace.workspaceId,
        })
      : undefined
  const gatewaySelectedAgentRecord =
    localGatewayMode && gatewaySnapshot && gatewaySelectedWorkspace
      ? gatewaySnapshot.agents.find(
          (agent) => agent.workspaceId === gatewaySelectedWorkspace.workspaceId,
        )
      : undefined
  const gatewaySelectedRun =
    localGatewayMode && gatewaySnapshot && gatewaySelectedSession
      ? selectGatewayRunForSession({
          snapshot: gatewaySnapshot,
          sessionId: gatewaySelectedSession.sessionId,
        })
      : undefined
  const gatewaySelectedPendingApproval =
    localGatewayMode && gatewaySnapshot && gatewaySelectedSession
      ? selectGatewayPendingApprovalForSession({
          snapshot: gatewaySnapshot,
          sessionId: gatewaySelectedSession.sessionId,
        })
      : undefined
  const gatewaySelectedProviderProfile =
    localGatewayMode && gatewaySnapshot
      ? gatewaySnapshot.providerProfiles.find(
          (candidate) => candidate.profileId === selectedGatewayProviderProfileId,
        ) ??
        gatewaySnapshot.providerProfiles.find((candidate) => candidate.status === 'active') ??
        gatewaySnapshot.providerProfiles[0]
      : undefined
  const gatewayWslBackend =
    localGatewayMode && gatewaySnapshot
      ? gatewaySnapshot.executionBackends?.backends.find((backend) => backend.key === 'wsl')
      : undefined
  const gatewayDockerBackend =
    localGatewayMode && gatewaySnapshot
      ? gatewaySnapshot.executionBackends?.backends.find((backend) => backend.key === 'docker')
      : undefined
  const gatewayCronSchedules =
    localGatewayMode && gatewaySnapshot
      ? (gatewaySnapshot.cronSchedules ?? []).filter((schedule) =>
          gatewaySelectedSession ? schedule.sessionId === gatewaySelectedSession.sessionId : true,
        )
      : []
  const gatewayRelevantBudgets =
    localGatewayMode && gatewaySnapshot
      ? (gatewaySnapshot.budgets ?? []).filter((budget) =>
          (budget.scopeType === 'client' && budget.scopeId === gatewaySelectedClientId)
          || (budget.scopeType === 'workspace' && budget.scopeId === gatewaySelectedWorkspace?.workspaceId)
          || (budget.scopeType === 'agent' && budget.scopeId === gatewaySelectedAgentRecord?.agentId),
        )
      : []
  const gatewayDeploymentTargets =
    localGatewayMode && gatewaySnapshot
      ? (gatewaySnapshot.deploymentTargets ?? []).filter((target) =>
          gatewaySelectedWorkspace?.workspaceId ? target.workspaceId === gatewaySelectedWorkspace.workspaceId : true,
        )
      : []
  const gatewayBudgetEvaluationsById = new Map(
    (gatewaySnapshot?.budgetEvaluations ?? []).map((evaluation) => [evaluation.budgetId, evaluation] as const),
  )
  const gatewaySelectedCronSchedule =
    gatewayCronSchedules.find((schedule) => schedule.scheduleId === selectedGatewayCronScheduleId) ??
    gatewayCronSchedules[0]
  const gatewaySelectedBudget =
    gatewayRelevantBudgets.find((budget) => budget.budgetId === selectedGatewayBudgetId) ??
    gatewayRelevantBudgets[0]
  const gatewaySelectedDeploymentTarget =
    gatewayDeploymentTargets.find((target) => target.targetId === selectedGatewayDeploymentTargetId) ??
    gatewayDeploymentTargets[0]
  const gatewaySelectedDeploymentTargetExecutable =
    gatewaySelectedDeploymentTarget?.executionSupported === true
  const gatewaySelectedMarketplaceTemplate =
    gatewayMarketplaceTemplates.find(
      (template) => template.templateId === selectedGatewayMarketplaceTemplateId,
    ) ?? gatewayMarketplaceTemplates[0]
  const gatewaySelectedPendingProvenanceReview = gatewayProvenanceReviews.find(
    (review) => review.status === 'pending',
  )
  const gatewaySelectedApprovedProvenanceReview = gatewayProvenanceReviews.find(
    (review) => review.status === 'approved',
  )
  const gatewaySelectedBudgetEvaluation =
    gatewaySelectedBudget ? gatewayBudgetEvaluationsById.get(gatewaySelectedBudget.budgetId) : undefined
  const gatewayRunBudgetWarnings = gatewayRelevantBudgets
    .map((budget) => gatewayBudgetEvaluationsById.get(budget.budgetId))
    .filter((evaluation): evaluation is NonNullable<typeof evaluation> => Boolean(evaluation))
    .filter((evaluation) => evaluation.status === 'warn')
  useEffect(() => {
    if (!gatewaySelectedCronSchedule) return
    setSelectedGatewayCronScheduleId(gatewaySelectedCronSchedule.scheduleId)
    setGatewayCronLabel(gatewaySelectedCronSchedule.label)
    setGatewayCronExpr(gatewaySelectedCronSchedule.cronExpr)
    setGatewayCronTimezone(gatewaySelectedCronSchedule.timezone)
    setGatewayRunComputerId(gatewaySelectedCronSchedule.computerId ?? 'computer_local')
    if (gatewaySelectedCronSchedule.promptPreview && !gatewayPrompt.trim()) {
      setGatewayPrompt(gatewaySelectedCronSchedule.promptPreview)
    }
  }, [
    gatewaySelectedCronSchedule?.scheduleId,
    gatewaySelectedCronSchedule?.updatedAt,
  ])
  useEffect(() => {
    setGatewayCronGrantPreview(undefined)
  }, [gatewaySelectedCronSchedule?.scheduleId, gatewaySelectedCronSchedule?.updatedAt])
  useEffect(() => {
    setGatewayProvenanceReviews([])
  }, [gatewaySelectedWorkspace?.workspaceId])
  useEffect(() => {
    if (!gatewaySelectedBudget) return
    setSelectedGatewayBudgetId(gatewaySelectedBudget.budgetId)
    setGatewayBudgetScopeType(gatewaySelectedBudget.scopeType)
    setGatewayBudgetLabel(gatewaySelectedBudget.label)
    setGatewayBudgetMaxUsd(String(gatewaySelectedBudget.maxEstimatedCostUsd))
    setGatewayBudgetWarnUsd(String(gatewaySelectedBudget.warnAtUsd))
  }, [gatewaySelectedBudget?.budgetId])
  useEffect(() => {
    setGatewayAllowBudgetWarning(false)
  }, [
    gatewaySelectedClientId,
    gatewaySelectedWorkspace?.workspaceId,
    gatewaySelectedAgentRecord?.agentId,
    gatewayRunBudgetWarnings.map((evaluation) => `${evaluation.budgetId}:${evaluation.status}`).join('|'),
  ])
  useEffect(() => {
    const requestedBackendKey =
      gatewayRunComputerId === 'computer_wsl'
        ? 'wsl'
        : gatewayRunComputerId === 'computer_docker'
          ? 'docker'
          : undefined
    if (!requestedBackendKey) return
    const backend =
      requestedBackendKey === 'wsl'
        ? gatewayWslBackend
        : gatewayDockerBackend
    if (backend?.available) return
    setGatewayRunComputerId('computer_local')
  }, [gatewayRunComputerId, gatewayWslBackend?.available, gatewayDockerBackend?.available])
  useEffect(() => {
    if (!gatewaySelectedDeploymentTarget) return
    setSelectedGatewayDeploymentTargetId(gatewaySelectedDeploymentTarget.targetId)
    setGatewayDeploymentLabel(gatewaySelectedDeploymentTarget.label)
  }, [gatewaySelectedDeploymentTarget?.targetId])
  useEffect(() => {
    if (!localGatewayMode || !gatewayClient || !gatewaySelectedWorkspace?.workspaceId) {
      setGatewayLiveInventory(undefined)
      return
    }
    let cancelled = false
    const loadInventory = async () => {
      setGatewayLiveInventory((current) => ({
        toolCalls: current?.toolCalls ?? [],
        deploymentTargets: current?.deploymentTargets ?? [],
        deploymentRuns: current?.deploymentRuns ?? [],
        cells: current?.cells ?? [],
        cellLeases: current?.cellLeases ?? [],
        cellSnapshots: current?.cellSnapshots ?? [],
        cellStatus: current?.cellStatus ?? gatewaySnapshot?.cellStatus,
        executionBackendStatus: current?.executionBackendStatus,
        executionBackends: gatewaySnapshot?.executionBackends,
        loading: true,
      }))
      try {
        const workspaceId = gatewaySelectedWorkspace.workspaceId
        const sessionId = gatewaySelectedSession?.sessionId
        const runId = gatewaySelectedRun?.runId
        const [
          { toolCalls },
          { deploymentTargets },
          { cells },
          { cellStatus },
          { executionBackends: executionBackendStatus },
        ] = await Promise.all([
          gatewayClient.toolCalls({
            workspaceId,
            ...(sessionId ? { sessionId } : {}),
            ...(runId ? { runId } : {}),
          }),
          gatewayClient.deploymentTargets({ workspaceId }),
          gatewayClient.cells({ workspaceId }),
          gatewayClient.cellStatus(),
          gatewayClient.executionBackendStatus(),
        ])
        const deploymentTargetId = deploymentTargets[0]?.targetId
        const cellId = cells[0]?.cellId
        const [{ deploymentRuns }, { cellLeases }, { cellSnapshots }] = await Promise.all([
          deploymentTargetId
            ? gatewayClient.deploymentRuns({
                targetId: deploymentTargetId,
                ...(sessionId ? { sessionId } : {}),
                ...(runId ? { runId } : {}),
              })
            : Promise.resolve({ deploymentRuns: [] }),
          cellId
            ? gatewayClient.cellLeases({
                cellId,
                ...(sessionId ? { sessionId } : {}),
                ...(runId ? { runId } : {}),
              })
            : Promise.resolve({ cellLeases: [] }),
          cellId
            ? gatewayClient.cellSnapshots({ cellId })
            : Promise.resolve({ cellSnapshots: [] }),
        ])
        if (cancelled) return
        setGatewayLiveInventory({
          toolCalls,
          deploymentTargets,
          deploymentRuns,
          cells,
          cellLeases,
          cellSnapshots,
          cellStatus,
          executionBackendStatus,
          executionBackends: gatewaySnapshot?.executionBackends,
          loading: false,
        })
      } catch (error) {
        if (cancelled) return
        setGatewayLiveInventory({
          toolCalls: [],
          deploymentTargets: [],
          deploymentRuns: [],
          cells: [],
          cellLeases: [],
          cellSnapshots: [],
          cellStatus: gatewaySnapshot?.cellStatus,
          executionBackendStatus: undefined,
          executionBackends: gatewaySnapshot?.executionBackends,
          loading: false,
          error: error instanceof Error ? error.message : 'Live inventory request failed.',
        })
      }
    }
    void loadInventory()
    return () => {
      cancelled = true
    }
  }, [
    localGatewayMode,
    gatewayClient,
    gatewaySelectedWorkspace?.workspaceId,
    gatewaySelectedSession?.sessionId,
    gatewaySelectedRun?.runId,
    gatewaySnapshot?.cellStatus,
    gatewaySnapshot?.executionBackends,
  ])
  const developmentFixturePreview =
    !localGatewayMode && dashboardBootstrap.source === 'gateway-snapshot'
  const gatewayAgentSpecClient = gatewayDraftClient
    ? gatewayDraftClientToPrototypeClient(gatewayDraftClient)
    : gatewaySelectedClientRecord
      ? gatewaySnapshotClientToPrototypeClient({
          client: gatewaySelectedClientRecord,
          workspace: gatewaySelectedWorkspace,
        })
      : undefined
  const activeClientId = developmentFixturePreview
    ? undefined
    : selectedClientId && state.clients.some((client) => client.id === selectedClientId)
      ? selectedClientId
      : state.clients[0]?.id
  const prototypeActiveClient = activeClientId
    ? state.clients.find((client) => client.id === activeClientId)
    : undefined
  const activeClient = localGatewayMode ? gatewayAgentSpecClient : prototypeActiveClient
  const activeAgent =
    localGatewayMode && gatewaySelectedAgentRecord && gatewaySelectedClientId
      ? gatewaySnapshotAgentToPrototypeAgent({
          agent: gatewaySelectedAgentRecord,
          clientId: gatewaySelectedClientId,
        })
      : prototypeActiveClient && !developmentFixturePreview && !localGatewayMode
      ? state.agents.find((agent) => agent.clientId === prototypeActiveClient.id)
      : undefined
  const providerReady = dashboardViewModel.providerReady
  const providerState = dashboardViewModel.providerState
  const previewTrace =
    dashboardBootstrap.source === 'gateway-snapshot' && selectedPreviewClientId
      ? gatewayProjectionToRunTraceViewModel({
          projection: dashboardBootstrap.projection,
          clientId: selectedPreviewClientId,
        })
      : undefined
  const runTraceViewModel: RunTraceViewModel | undefined =
    localGatewayMode
      ? gatewayTrace
      : developmentFixturePreview
      ? previewTrace
      : activeClient && activeAgent
        ? createPrototypeRunTraceViewModel({
            clientName: activeClient.name,
            agentName: activeAgent.name,
          })
        : undefined
  const dashboardNotice = localGatewayMode
    ? gatewayError ||
      (gatewayAuthMode === 'hosted'
        ? `Hosted local gateway mode. Routes are protected by gateway auth.${gatewayAuthUser ? ` Signed in as ${gatewayAuthUser.username}.` : ''}`
        : 'Local gateway dev mode. Runs, approvals, and traces come from the local gateway. Provider keys stay server-side.')
    : developmentFixturePreview
    ? 'Development fixture preview only. Clear ?mainspringConsoleSource=development-gateway-fixture to resume the prototype localStorage flow.'
    : notice
  const prototypeBanner = prototypeBannerForMode({
    localGatewayMode,
    developmentFixturePreview,
  })
  const localGatewayHostedAuthRequired =
    localGatewayMode && gatewayAuthMode === 'hosted' && !gatewayAuthUser
  const prototypeAuthRequired = !localGatewayMode && !state.account
  const prototypeUnlockRequired = !localGatewayMode && Boolean(state.account) && !unlocked
  const shellUsername = localGatewayMode
    ? 'local gateway dev'
    : state.account?.username ?? state.lastUser
  const showSettings = !localGatewayMode

  useEffect(() => {
    if (!localGatewayMode) return
    const nextWorkspaceId = gatewaySelectedWorkspace?.workspaceId
    if (!nextWorkspaceId && selectedGatewayWorkspaceId) {
      setSelectedGatewayWorkspaceId(undefined)
      return
    }
    if (nextWorkspaceId && nextWorkspaceId !== selectedGatewayWorkspaceId) {
      setSelectedGatewayWorkspaceId(nextWorkspaceId)
    }
  }, [gatewaySelectedWorkspace?.workspaceId, localGatewayMode, selectedGatewayWorkspaceId])

  useEffect(() => {
    if (!localGatewayMode) return
    const nextSessionId = gatewaySelectedSession?.sessionId
    if (!nextSessionId && selectedGatewaySessionId) {
      setSelectedGatewaySessionId(undefined)
      return
    }
    if (nextSessionId && nextSessionId !== selectedGatewaySessionId) {
      setSelectedGatewaySessionId(nextSessionId)
    }
  }, [gatewaySelectedSession?.sessionId, localGatewayMode, selectedGatewaySessionId])

  useEffect(() => {
    if (!localGatewayMode) return
    const nextProviderProfileId = gatewaySelectedProviderProfile?.profileId
    if (!nextProviderProfileId && selectedGatewayProviderProfileId) {
      setSelectedGatewayProviderProfileId(undefined)
      return
    }
    if (nextProviderProfileId && nextProviderProfileId !== selectedGatewayProviderProfileId) {
      setSelectedGatewayProviderProfileId(nextProviderProfileId)
    }
  }, [
    gatewaySelectedProviderProfile?.profileId,
    localGatewayMode,
    selectedGatewayProviderProfileId,
  ])

  async function openLocalGatewayTrace(
    clientId: string,
    preferredSessionId?: string,
    preferredWorkspaceId?: string,
  ) {
    if (!gatewayClient || !gatewayReadModel || !gatewaySnapshot) return
    const projection = gatewayReadModel.projection
    const workspace = preferredWorkspaceId
      ? gatewaySnapshot.workspaces.find((candidate) => candidate.workspaceId === preferredWorkspaceId)
      : gatewaySnapshot.workspaces.find((candidate) => candidate.clientId === clientId)
    const session = selectGatewaySessionForClient({
      snapshot: gatewaySnapshot,
      clientId,
      workspaceId: workspace?.workspaceId,
      preferredSessionId: preferredSessionId ?? selectedGatewaySessionId,
    })
    const run = session
      ? selectGatewayRunForSession({
          snapshot: gatewaySnapshot,
          sessionId: session.sessionId,
        })
      : undefined
    const pendingApproval = session
      ? selectGatewayPendingApprovalForSession({
          snapshot: gatewaySnapshot,
          sessionId: session.sessionId,
        })
      : undefined
    const client = projection.clients.find((candidate) => candidate.clientId === clientId)
    const agent = run?.agentId
      ? gatewaySnapshot.agents.find((candidate) => candidate.agentId === run.agentId)
      : undefined
    const clientName = client?.name ?? 'Client'
    const agentName = agent?.name ?? client?.primaryAgentName ?? 'Agent'
    setSelectedClientId(clientId)
    setSelectedGatewayWorkspaceId(workspace?.workspaceId)
    setSelectedGatewaySessionId(session?.sessionId)
    setSelectedEvent(0)
    setScreen('trace')
    if (!session) {
      setGatewayTrace(
        gatewayRunEventsToTraceViewModel({
          clientName,
          agentName,
          events: [],
          footer: [
            'Trace source: local gateway dev',
            'No workspace-linked session selected',
          ],
        }),
      )
      return
    }
    if (!run) {
      setGatewayTrace(
        gatewayRunEventsToTraceViewModel({
          clientName,
          agentName,
          events: [],
          footer: [
            `Session: ${session.sessionId}`,
            'Trace source: local gateway dev',
            'No run recorded for this session yet',
          ],
        }),
      )
      return
    }
    setGatewayBusy(true)
    try {
      const result = await gatewayClient.runEvents({ sessionId: run.sessionId, runId: run.runId })
      setGatewayTrace(
        gatewayRunEventsToTraceViewModel({
          clientName,
          agentName,
          events: result.events,
          footer: [
            `Session: ${session.sessionId}`,
            `Status: ${run.status}`,
            `Pending inbound: ${run.pendingInboundCount}`,
            `Pending approvals: ${pendingApproval?.runId === run.runId ? 1 : 0}`,
            'Trace source: local gateway dev',
          ],
        }),
      )
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to load run events.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function startLocalGatewayRun() {
    if (!gatewayClient || !gatewaySnapshot || !gatewayReadModel) return
    const selected = gatewaySelectedClientId
    if (!selected) return
    const workspace = gatewaySelectedWorkspace
    const agent = gatewaySnapshot.agents.find(
      (candidate) => candidate.workspaceId && candidate.workspaceId === workspace?.workspaceId,
    )
    const session = gatewaySelectedSession
    if (!session) {
      setGatewayError('Local gateway returned no session to run against.')
      return
    }
    setGatewayBusy(true)
    try {
      await gatewayClient.startRun({
        sessionId: session.sessionId,
        input: gatewayPrompt,
        mode: 'chat',
        allowedTools: ['file.read'],
        ...(gatewayRunBudgetWarnings.length > 0 ? { allowBudgetWarning: gatewayAllowBudgetWarning } : {}),
        computerId: gatewayRunComputerId,
        ...(workspace ? { workspaceId: workspace.workspaceId } : {}),
        ...(agent ? { agentId: agent.agentId } : {}),
        ...(gatewaySelectedProviderProfile
          ? { providerProfileId: gatewaySelectedProviderProfile.profileId }
          : {}),
      })
      setGatewayAllowBudgetWarning(false)
      setGatewayError('')
      await refreshGatewaySnapshot()
      await openLocalGatewayTrace(selected, session.sessionId)
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to start gateway run.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function resolveLocalGatewayApproval(decision: 'approved' | 'denied') {
    if (!gatewayClient || !gatewaySelectedPendingApproval) return
    setGatewayBusy(true)
    try {
      await gatewayClient.resolveApproval({
        approvalId: gatewaySelectedPendingApproval.approvalId,
        sessionId: gatewaySelectedPendingApproval.sessionId,
        runId: gatewaySelectedPendingApproval.runId,
        decision,
        reason: `Resolved through local gateway dev mode: ${decision}`,
      })
      setGatewayError('')
      await refreshGatewaySnapshot()
      if (gatewaySelectedClientId) {
        await openLocalGatewayTrace(gatewaySelectedClientId, gatewaySelectedPendingApproval.sessionId)
      }
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to resolve approval.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function resolveLocalGatewayClientApproval(
    approval: ConsoleDashboardClientDetail['approvals'][number],
    decision: 'approved' | 'denied',
  ) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      await gatewayClient.resolveApproval({
        approvalId: approval.approvalId,
        sessionId: approval.sessionId,
        runId: approval.runId,
        decision,
        reason: `Resolved through selected-client detail: ${decision}`,
      })
      setGatewayError('')
      setNotice(
        decision === 'approved'
          ? 'Approval resolved from selected-client detail.'
          : 'Approval denied from selected-client detail.',
      )
      await refreshGatewaySnapshot()
      if (gatewaySelectedClientId) {
        await openLocalGatewayTrace(
          gatewaySelectedClientId,
          approval.sessionId,
          approval.workspaceId,
        )
      }
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to resolve approval.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function resolveLocalGatewayQueueApproval(
    approval: ConsoleDashboardApprovalRow,
    decision: 'approved' | 'denied',
  ) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      await gatewayClient.resolveApproval({
        approvalId: approval.approvalId,
        sessionId: approval.sessionId,
        runId: approval.runId,
        decision,
        reason: `Resolved through dashboard queue: ${decision}`,
      })
      setGatewayError('')
      setNotice(
        decision === 'approved'
          ? 'Approval resolved from dashboard queue.'
          : 'Approval denied from dashboard queue.',
      )
      await refreshGatewaySnapshot()
      const targetClientId = approval.clientId ?? gatewaySelectedClientId
      if (targetClientId) {
        await openLocalGatewayTrace(targetClientId, approval.sessionId)
      }
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to resolve approval.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function createLocalGatewayClientRecord(client: Client) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      const created = await gatewayClient.createClient({
        name: client.name,
        workspaceRoot: client.workspace,
        workspaceName: client.workspaceName ?? `${client.name} Workspace`,
        ...(client.contact ? { contact: client.contact } : {}),
        ...(client.billingLabel ? { billingLabel: client.billingLabel } : {}),
      })
      setGatewayDraftClient({
        clientId: created.client.clientId,
        workspaceId: created.workspace?.workspaceId,
        sessionId: created.session?.sessionId,
        name: client.name,
        workspace: client.workspace,
        contact: client.contact,
        billingLabel: client.billingLabel,
      })
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setSelectedClientId(created.client.clientId)
      setSelectedGatewayWorkspaceId(created.workspace?.workspaceId)
      setSelectedGatewaySessionId(created.session?.sessionId)
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice('Client created through local gateway dev mode.')
      setScreen('agent-spec')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to create gateway client.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function updateLocalGatewayClientRecord(client: Client) {
    if (!gatewayClient || !gatewayEditingClient) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateClient({
        clientId: gatewayEditingClient.clientId,
        name: client.name,
        contact: client.contact,
        billingLabel: client.billingLabel,
        ...(gatewayEditingClient.workspaceId
          ? { workspaceId: gatewayEditingClient.workspaceId }
          : {}),
        ...(client.workspaceName ? { workspaceName: client.workspaceName } : {}),
        ...(client.workspace ? { workspaceRoot: client.workspace } : {}),
      })
      await refreshGatewaySnapshot()
      setGatewayDraftClient(undefined)
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setGatewayError('')
      setNotice('Client updated through local gateway dev mode.')
      setScreen('dashboard')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to update gateway client.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function setLocalGatewayClientStatus(status: 'active' | 'archived') {
    if (!gatewayClient || !gatewaySelectedClientRecord) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateClient({
        clientId: gatewaySelectedClientRecord.clientId,
        status,
        ...(gatewaySelectedWorkspace ? { workspaceId: gatewaySelectedWorkspace.workspaceId } : {}),
        ...(gatewaySelectedWorkspace ? { workspaceStatus: status } : {}),
      })
      await refreshGatewaySnapshot()
      setGatewayDraftClient(undefined)
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setGatewayError('')
      setNotice(
        status === 'archived'
          ? 'Client archived through local gateway dev mode.'
          : 'Client restored through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to update gateway client status.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function setLocalGatewayWorkspaceStatus(status: 'active' | 'archived') {
    if (!gatewayClient || !gatewaySelectedClientRecord || !gatewaySelectedWorkspace) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateClient({
        clientId: gatewaySelectedClientRecord.clientId,
        workspaceId: gatewaySelectedWorkspace.workspaceId,
        workspaceStatus: status,
      })
      await refreshGatewaySnapshot()
      setGatewayDraftClient(undefined)
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setGatewayError('')
      setNotice(
        status === 'archived'
          ? 'Workspace archived through local gateway dev mode.'
          : 'Workspace restored through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(
        error instanceof Error ? error.message : 'Failed to update gateway workspace status.',
      )
    } finally {
      setGatewayBusy(false)
    }
  }

  async function deleteLocalGatewayWorkspace() {
    if (!gatewayClient || !gatewaySelectedWorkspace) return
    setGatewayBusy(true)
    try {
      await gatewayClient.deleteWorkspace({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
      })
      const deletedWorkspaceId = gatewaySelectedWorkspace.workspaceId
      await refreshGatewaySnapshot()
      setSelectedGatewayWorkspaceId(undefined)
      if (selectedGatewaySessionId && gatewaySelectedSession?.workspaceId === deletedWorkspaceId) {
        setSelectedGatewaySessionId(undefined)
      }
      setGatewayDraftClient(undefined)
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setGatewayError('')
      setNotice('Workspace deleted through local gateway dev mode.')
      setScreen('dashboard')
    } catch (error) {
      setGatewayError(
        error instanceof Error ? error.message : 'Failed to delete gateway workspace.',
      )
    } finally {
      setGatewayBusy(false)
    }
  }

  async function deleteLocalGatewayClient() {
    if (!gatewayClient || !gatewaySelectedClientRecord) return
    setGatewayBusy(true)
    try {
      await gatewayClient.deleteClient({
        clientId: gatewaySelectedClientRecord.clientId,
      })
      const deletedClientId = gatewaySelectedClientRecord.clientId
      await refreshGatewaySnapshot()
      if (selectedClientId === deletedClientId) {
        setSelectedClientId(undefined)
      }
      setSelectedGatewayWorkspaceId(undefined)
      setSelectedGatewaySessionId(undefined)
      setGatewayDraftClient(undefined)
      setGatewayEditingClient(undefined)
      setGatewayWorkspaceDraft(undefined)
      setGatewayError('')
      setNotice('Client deleted through local gateway dev mode.')
      setScreen('dashboard')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to delete gateway client.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function createLocalGatewayWorkspaceRecord(input: {
    clientId: string
    workspaceName: string
    workspaceRoot: string
  }) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      const created = await gatewayClient.createWorkspace({
        clientId: input.clientId,
        name: input.workspaceName,
        workspaceRoot: input.workspaceRoot,
      })
      await refreshGatewaySnapshot()
      setGatewayWorkspaceDraft(undefined)
      setSelectedClientId(input.clientId)
      setSelectedGatewayWorkspaceId(created.workspace.workspaceId)
      setSelectedGatewaySessionId(created.session.sessionId)
      setGatewayError('')
      setNotice('Workspace created through local gateway dev mode.')
      setScreen('agent-spec')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to create gateway workspace.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function createLocalGatewayAgentDraft(agent: Agent) {
    if (!gatewayClient) return
    const workspaceId = gatewayDraftClient?.workspaceId ?? gatewaySelectedWorkspace?.workspaceId
    if (!workspaceId) return
    setGatewayBusy(true)
    try {
      if (gatewaySelectedAgentRecord && !gatewayDraftClient) {
        await gatewayClient.updateAgent({
          agentId: gatewaySelectedAgentRecord.agentId,
          name: agent.name,
          version: gatewaySelectedAgentRecord.version,
          ...(runtimeModelIdFromDraftModel(agent.model)
            ? { defaultModelId: runtimeModelIdFromDraftModel(agent.model) }
            : {}),
          instructions: agent.instructions,
          outcome: agent.outcome,
          voice: agent.voice,
          approvalMode: agent.approvalMode,
          modelLabel: agent.model,
          skills: agent.skills,
        })
      } else {
        await gatewayClient.createAgent({
          workspaceId,
          name: agent.name,
          version: '1.0.0',
          ...(runtimeModelIdFromDraftModel(agent.model)
            ? { defaultModelId: runtimeModelIdFromDraftModel(agent.model) }
            : {}),
          instructions: agent.instructions,
          outcome: agent.outcome,
          voice: agent.voice,
          approvalMode: agent.approvalMode,
          modelLabel: agent.model,
          skills: agent.skills,
        })
      }
      await refreshGatewaySnapshot()
      setGatewayDraftClient(undefined)
      setGatewayError('')
      setNotice(
        gatewaySelectedAgentRecord && !gatewayDraftClient
          ? 'Agent updated through local gateway dev mode.'
          : 'Agent created through local gateway dev mode.',
      )
      setScreen('dashboard')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to save gateway agent.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function saveLocalGatewayProviderProfile(input: GatewayProviderProfileDraft) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      const saved = input.profileId
        ? await gatewayClient.updateProviderProfile({
            profileId: input.profileId,
            providerId: input.providerId,
            label: input.label,
            ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
            ...(input.secretRef ? { secretRef: input.secretRef } : {}),
            ...(input.secretValue ? { secretValue: input.secretValue } : {}),
          })
        : await gatewayClient.createProviderProfile({
            providerId: input.providerId,
            label: input.label,
            ...(input.secretRef ? { secretRef: input.secretRef } : {}),
            ...(input.secretValue ? { secretValue: input.secretValue } : {}),
            ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
          })
      await refreshGatewaySnapshot()
      setSelectedGatewayProviderProfileId(saved.providerProfile.profileId)
      setGatewayEditingProviderProfile(undefined)
      setGatewayError('')
      setNotice(
        input.profileId
          ? 'Provider profile updated through local gateway dev mode.'
          : 'Provider profile created through local gateway dev mode.',
      )
      setScreen('dashboard')
    } catch (error) {
      setGatewayError(
        error instanceof Error ? error.message : 'Failed to save gateway provider profile.',
      )
    } finally {
      setGatewayBusy(false)
    }
  }

  async function setLocalGatewayProviderProfileStatus(status: 'active' | 'archived') {
    if (!gatewayClient || !gatewaySelectedProviderProfile) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateProviderProfile({
        profileId: gatewaySelectedProviderProfile.profileId,
        status,
      })
      await refreshGatewaySnapshot()
      setGatewayEditingProviderProfile(undefined)
      setGatewayError('')
      setNotice(
        status === 'archived'
          ? 'Provider profile archived through local gateway dev mode.'
          : 'Provider profile restored through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(
        error instanceof Error
          ? error.message
          : 'Failed to update gateway provider profile status.',
      )
    } finally {
      setGatewayBusy(false)
    }
  }

  async function saveLocalGatewayCronSchedule() {
    if (!gatewayClient || !gatewaySelectedSession) return
    setGatewayBusy(true)
    try {
      const response = gatewaySelectedCronSchedule
        ? await gatewayClient.updateCronSchedule({
            scheduleId: gatewaySelectedCronSchedule.scheduleId,
            sessionId: gatewaySelectedSession.sessionId,
            ...(gatewaySelectedWorkspace ? { workspaceId: gatewaySelectedWorkspace.workspaceId } : {}),
            ...(gatewaySelectedAgentRecord ? { agentId: gatewaySelectedAgentRecord.agentId } : {}),
            ...(gatewaySelectedProviderProfile
              ? { providerProfileId: gatewaySelectedProviderProfile.profileId }
              : {}),
            computerId: gatewayRunComputerId,
            label: gatewayCronLabel,
            prompt: gatewayPrompt,
            cronExpr: gatewayCronExpr,
            timezone: gatewayCronTimezone,
            allowedTools: ['file.write'],
            enabled: gatewaySelectedCronSchedule.enabled,
          })
        : await gatewayClient.createCronSchedule({
            sessionId: gatewaySelectedSession.sessionId,
            ...(gatewaySelectedWorkspace ? { workspaceId: gatewaySelectedWorkspace.workspaceId } : {}),
            ...(gatewaySelectedAgentRecord ? { agentId: gatewaySelectedAgentRecord.agentId } : {}),
            ...(gatewaySelectedProviderProfile
              ? { providerProfileId: gatewaySelectedProviderProfile.profileId }
              : {}),
            computerId: gatewayRunComputerId,
            label: gatewayCronLabel,
            prompt: gatewayPrompt,
            cronExpr: gatewayCronExpr,
            timezone: gatewayCronTimezone,
            allowedTools: ['file.write'],
            enabled: true,
          })
      await refreshGatewaySnapshot()
      setSelectedGatewayCronScheduleId(response.cronSchedule.scheduleId)
      setGatewayError('')
      setNotice(
        gatewaySelectedCronSchedule
          ? 'Cron schedule updated through local gateway dev mode.'
          : 'Cron schedule created through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to save cron schedule.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function runLocalGatewayCronNow() {
    if (!gatewayClient || !gatewaySelectedCronSchedule || !gatewaySelectedClientId) return
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.runCronNow({
        scheduleId: gatewaySelectedCronSchedule.scheduleId,
      })
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice('Cron schedule triggered through local gateway dev mode.')
      await openLocalGatewayTrace(gatewaySelectedClientId, response.run.sessionId)
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to run cron schedule now.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function reviewLocalGatewayCronGrant() {
    if (!gatewayClient || !gatewaySelectedCronSchedule) return
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.cronGrant({
        scheduleId: gatewaySelectedCronSchedule.scheduleId,
      })
      setGatewayCronGrantPreview(response.cronGrant)
      setGatewayError('')
      setNotice('Cron grant reviewed through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to review cron grant.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function createLocalGatewayCronGrant() {
    if (!gatewayClient || !gatewaySelectedCronSchedule) return
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.createCronGrant({
        scheduleId: gatewaySelectedCronSchedule.scheduleId,
        expiresInMs: 24 * 60 * 60 * 1000,
        maxExecutionCount: 1,
        actor: gatewayAuthUser?.username ?? 'console-operator',
      })
      setGatewayCronGrantPreview(response.cronGrant)
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice('Scoped cron grant created through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to create cron grant.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function loadLocalGatewayProvenanceReviews() {
    if (!gatewayClient || !gatewaySelectedWorkspace?.workspaceId) return
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.provenanceReviews({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
      })
      setGatewayProvenanceReviews(response.provenanceReviews)
      setGatewayError('')
      setNotice('Provenance review queue loaded through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to load provenance reviews.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function decideLocalGatewayProvenanceReview(decision: 'approved' | 'rejected') {
    if (!gatewayClient || !gatewaySelectedWorkspace?.workspaceId || !gatewaySelectedPendingProvenanceReview) return
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.decideProvenanceReview({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
        reviewId: gatewaySelectedPendingProvenanceReview.reviewId,
        decision,
        reviewer: gatewayAuthUser?.username ?? 'console-operator',
      })
      setGatewayProvenanceReviews((reviews) =>
        reviews.map((review) =>
          review.reviewId === response.provenanceReview.reviewId ? response.provenanceReview : review,
        ),
      )
      setGatewayError('')
      setNotice(`Provenance review ${decision} through local gateway dev mode.`)
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to decide provenance review.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function applyLocalGatewayProvenanceReview() {
    if (!gatewayClient || !gatewaySelectedWorkspace?.workspaceId || !gatewaySelectedApprovedProvenanceReview) return
    setGatewayBusy(true)
    try {
      await gatewayClient.applyProvenanceReview({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
        reviewId: gatewaySelectedApprovedProvenanceReview.reviewId,
        reviewer: gatewayAuthUser?.username ?? 'console-operator',
      })
      const response = await gatewayClient.provenanceReviews({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
      })
      setGatewayProvenanceReviews(response.provenanceReviews)
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice('Approved provenance review applied through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to apply provenance review.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function deleteLocalGatewayCronSchedule() {
    if (!gatewayClient || !gatewaySelectedCronSchedule) return
    setGatewayBusy(true)
    try {
      await gatewayClient.deleteCronSchedule({
        scheduleId: gatewaySelectedCronSchedule.scheduleId,
      })
      await refreshGatewaySnapshot()
      setSelectedGatewayCronScheduleId(undefined)
      setGatewayError('')
      setNotice('Cron schedule deleted through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to delete cron schedule.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function toggleLocalGatewayCronSchedule() {
    if (!gatewayClient || !gatewaySelectedCronSchedule) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateCronSchedule({
        scheduleId: gatewaySelectedCronSchedule.scheduleId,
        enabled: !gatewaySelectedCronSchedule.enabled,
      })
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice(
        gatewaySelectedCronSchedule.enabled
          ? 'Cron schedule disabled through local gateway dev mode.'
          : 'Cron schedule enabled through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to toggle cron schedule.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function saveLocalGatewayBudget() {
    if (!gatewayClient) return
    const scopeId =
      gatewayBudgetScopeType === 'client'
        ? gatewaySelectedClientId
        : gatewayBudgetScopeType === 'workspace'
          ? gatewaySelectedWorkspace?.workspaceId
          : gatewaySelectedAgentRecord?.agentId
    if (!scopeId) {
      setGatewayError(`Select a ${gatewayBudgetScopeType} before saving a budget.`)
      return
    }
    setGatewayBusy(true)
    try {
      const maxEstimatedCostUsd = Number(gatewayBudgetMaxUsd)
      const warnAtUsd = Number(gatewayBudgetWarnUsd)
      const response = gatewaySelectedBudget
        ? await gatewayClient.updateBudget({
            budgetId: gatewaySelectedBudget.budgetId,
            label: gatewayBudgetLabel,
            maxEstimatedCostUsd,
            warnAtUsd,
            status: gatewaySelectedBudget.status,
          })
        : await gatewayClient.createBudget({
            scopeType: gatewayBudgetScopeType,
            scopeId,
            label: gatewayBudgetLabel,
            maxEstimatedCostUsd,
            warnAtUsd,
            status: 'active',
          })
      await refreshGatewaySnapshot()
      setSelectedGatewayBudgetId(response.budget.budgetId)
      setGatewayError('')
      setNotice(
        gatewaySelectedBudget
          ? 'Budget updated through local gateway dev mode.'
          : 'Budget created through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to save budget.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function toggleLocalGatewayBudgetStatus() {
    if (!gatewayClient || !gatewaySelectedBudget) return
    setGatewayBusy(true)
    try {
      await gatewayClient.updateBudget({
        budgetId: gatewaySelectedBudget.budgetId,
        status: gatewaySelectedBudget.status === 'archived' ? 'active' : 'archived',
      })
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice(
        gatewaySelectedBudget.status === 'archived'
          ? 'Budget restored through local gateway dev mode.'
          : 'Budget archived through local gateway dev mode.',
      )
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to toggle budget.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function deleteLocalGatewayBudget() {
    if (!gatewayClient || !gatewaySelectedBudget) return
    setGatewayBusy(true)
    try {
      await gatewayClient.deleteBudget({
        budgetId: gatewaySelectedBudget.budgetId,
      })
      await refreshGatewaySnapshot()
      setSelectedGatewayBudgetId(undefined)
      setGatewayError('')
      setNotice('Budget deleted through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to delete budget.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function saveLocalGatewayDeploymentTarget() {
    if (!gatewayClient || !gatewaySelectedWorkspace?.workspaceId) {
      setGatewayError('Select a workspace before saving a deployment target.')
      return
    }
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.createDeploymentTarget({
        workspaceId: gatewaySelectedWorkspace.workspaceId,
        label: gatewayDeploymentLabel,
        kind: 'vps',
        config: {
          sshHost: gatewayDeploymentSshHost,
          sshUser: gatewayDeploymentSshUser,
          sshPort: Number.parseInt(gatewayDeploymentSshPort, 10),
          remoteRoot: gatewayDeploymentRemoteRoot,
          serviceName: gatewayDeploymentServiceName,
          envFilePath: gatewayDeploymentEnvFilePath || undefined,
          domain: gatewayDeploymentDomain || undefined,
        },
      })
      await refreshGatewaySnapshot()
      setSelectedGatewayDeploymentTargetId(response.deploymentTarget.targetId)
      setGatewayError('')
      setNotice('Deployment target created through local gateway dev mode.')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to save deployment target.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function previewLocalGatewayDeployment() {
    if (!gatewayClient || !gatewaySelectedDeploymentTarget) return
    if (!gatewaySelectedDeploymentTargetExecutable) {
      setGatewayError(
        gatewaySelectedDeploymentTarget.executionUnavailableReason
        ?? 'This deployment target does not have a real executor yet.',
      )
      return
    }
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.planDeployment({
        targetId: gatewaySelectedDeploymentTarget.targetId,
        operation: gatewayDeploymentOperation,
      })
      const plan = response.deploymentPlan
      setGatewayDeploymentPreview(
        [
          `${plan.operation.toUpperCase()} ${plan.targetLabel}`,
          plan.summary,
          '',
          'Prerequisites:',
          ...plan.prerequisites.map((value) => `- ${value}`),
          '',
          'Warnings:',
          ...plan.warnings.map((value) => `- ${value}`),
          '',
          'Steps:',
          ...plan.steps.map((step) => `- [${step.phase}] ${step.label}: ${step.commandPreview}`),
        ].join('\n'),
      )
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to build deployment plan.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function executeLocalGatewayDeploymentAction() {
    if (!gatewayClient || !gatewaySelectedDeploymentTarget) return
    if (!gatewaySelectedDeploymentTargetExecutable) {
      setGatewayError(
        gatewaySelectedDeploymentTarget.executionUnavailableReason
        ?? 'This deployment target does not have a real executor yet.',
      )
      return
    }
    setGatewayBusy(true)
    try {
      const response = await gatewayClient.executeDeployment({
        targetId: gatewaySelectedDeploymentTarget.targetId,
        operation: gatewayDeploymentOperation,
        confirm: gatewayDeploymentOperation,
      })
      setGatewayDeploymentPreview(
        [
          `${response.execution.ok ? 'SUCCESS' : 'FAILED'} ${response.plan.operation.toUpperCase()} ${response.plan.targetLabel}`,
          response.execution.detail,
        ].join('\n'),
      )
      await refreshGatewaySnapshot()
      setGatewayError('')
      setNotice(`Deployment ${response.plan.operation} executed through local gateway dev mode.`)
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to execute deployment.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function installLocalGatewayMarketplaceTemplate() {
    if (!gatewayClient || !gatewaySelectedMarketplaceTemplate || !gatewayMarketplaceWorkspaceRoot.trim()) {
      return
    }
    setGatewayBusy(true)
    setGatewayError('')
    try {
      const response = await gatewayClient.installMarketplaceTemplate({
        templateId: gatewaySelectedMarketplaceTemplate.templateId,
        workspaceRoot: gatewayMarketplaceWorkspaceRoot.trim(),
      })
      setNotice(
        `Installed ${response.template.label} with ${response.installedFiles.length} seeded file${response.installedFiles.length === 1 ? '' : 's'}.`,
      )
      await refreshGatewaySnapshot()
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Marketplace install failed.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function bootstrapLocalGatewayHostedAuth(username: string, password: string) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      await gatewayClient.bootstrapAuth({ username, password })
      const login = await gatewayClient.login({ username, password })
      setGatewayAuthUser({ username: login.user.username, role: login.user.role })
      setGatewayAuthBootstrapRequired(false)
      await refreshGatewaySnapshot()
      setNotice('Hosted gateway admin bootstrapped.')
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to bootstrap hosted auth.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function loginLocalGatewayHostedAuth(username: string, password: string) {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      const login = await gatewayClient.login({ username, password })
      setGatewayAuthUser({ username: login.user.username, role: login.user.role })
      await refreshGatewaySnapshot()
      setNotice('Hosted gateway login successful.')
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Hosted gateway login failed.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function logoutLocalGatewayHostedAuth() {
    if (!gatewayClient) return
    setGatewayBusy(true)
    try {
      await gatewayClient.logout()
      setGatewayAuthUser(undefined)
      setGatewaySnapshot(null)
      setNotice('Hosted gateway session ended.')
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Hosted gateway logout failed.')
    } finally {
      setGatewayBusy(false)
    }
  }

  function updateState(next: Partial<ConsoleState>) {
    setState((current) => ({ ...current, ...next }))
  }

  if (localGatewayHostedAuthRequired) {
    return (
      <Shell
        username={shellUsername}
        onSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        state={state}
        updateState={updateState}
        closeSettings={() => setSettingsOpen(false)}
        banner={prototypeBanner}
        showSettings={showSettings}
      >
        <HostedGatewayAuthScreen
          bootstrapRequired={gatewayAuthBootstrapRequired}
          busy={gatewayBusy}
          notice={gatewayError || dashboardNotice}
          onBootstrap={bootstrapLocalGatewayHostedAuth}
          onLogin={loginLocalGatewayHostedAuth}
        />
      </Shell>
    )
  }

  if (prototypeAuthRequired || prototypeUnlockRequired) {
    return (
      <Shell
        username={shellUsername}
        onSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        state={state}
        updateState={updateState}
        closeSettings={() => setSettingsOpen(false)}
        banner={prototypeBanner}
        showSettings={showSettings}
      >
        <AuthScreen
          account={state.account}
          lastUser={state.lastUser}
          onCreate={async (username, password) => {
            const salt = makeSalt()
            const passwordHash = await hashPrototypePassword({ password, salt })
            updateState({
              account: {
                username,
                salt,
                passwordHash,
                passwordAlgorithm: 'pbkdf2-sha256-v1',
                passwordIterations: PROTOTYPE_PASSWORD_ITERATIONS,
              },
              lastUser: username,
            })
            setUnlocked(true)
          }}
          onUnlock={async (password) => {
            if (!state.account) return
            const hash = await hashPrototypePassword({
              password,
              salt: state.account.salt,
              algorithm: state.account.passwordAlgorithm ?? 'sha256-v1',
              iterations: state.account.passwordIterations,
            })
            if (hash === state.account.passwordHash) {
              updateState({
                lastUser: state.account.username,
                ...(state.account.passwordAlgorithm === 'pbkdf2-sha256-v1'
                  ? {}
                  : {
                      account: {
                        ...state.account,
                        passwordHash: await hashPrototypePassword({
                          password,
                          salt: state.account.salt,
                        }),
                        passwordAlgorithm: 'pbkdf2-sha256-v1',
                        passwordIterations: PROTOTYPE_PASSWORD_ITERATIONS,
                      },
                    }),
              })
              setUnlocked(true)
              setNotice('')
            } else {
              setNotice('Password did not match.')
            }
          }}
          notice={notice}
        />
      </Shell>
    )
  }

  return (
    <Shell
      username={shellUsername}
      onSettings={() => setSettingsOpen(true)}
      settingsOpen={settingsOpen}
      state={state}
      updateState={updateState}
      closeSettings={() => setSettingsOpen(false)}
      banner={prototypeBanner}
      showSettings={showSettings}
    >
      {screen === 'dashboard' && (
        <Dashboard
          viewModel={dashboardViewModel}
          onNewClient={() => {
            if (localGatewayMode) {
              setGatewayDraftClient(undefined)
              setGatewayEditingClient(undefined)
              setScreen('new-client')
              return
            }
            if (developmentFixturePreview) {
              setNotice(
                'Development fixture preview only. Clear ?mainspringConsoleSource=development-gateway-fixture to resume the prototype localStorage flow.',
              )
              return
            }
            setScreen('new-client')
          }}
          onOpenClient={(clientId) => {
            if (localGatewayMode) {
              void openLocalGatewayTrace(clientId)
              return
            }
            if (developmentFixturePreview) {
              setSelectedPreviewClientId(clientId)
              setSelectedEvent(0)
              setScreen('trace')
              return
            }
            setSelectedClientId(clientId)
            const selectedClientAgent = state.agents.find((agent) => agent.clientId === clientId)
            setScreen(selectedClientAgent ? 'skills' : 'agent-spec')
          }}
          onGuide={() =>
            setNotice(
              localGatewayMode
                ? 'Local gateway mode: create clients, draft agents, start runs, inspect traces, and resolve approvals without exposing provider keys to the browser.'
                : 'Prototype flow: create client, write agent spec, enable only needed skills, mark provider status, open the sample trace.',
            )
          }
          primaryActionLabel="New client"
          controlPanel={
            localGatewayMode ? (
              <div className="gateway-operator-panel">
                <div className="gateway-composer">
                  <select
                    value={gatewaySelectedClientId ?? ''}
                    onChange={(event) => {
                    const nextClientId = event.target.value || undefined
                    setSelectedClientId(nextClientId)
                    setSelectedGatewayWorkspaceId(undefined)
                    setSelectedGatewaySessionId(undefined)
                    setGatewayDraftClient(undefined)
                    setGatewayEditingClient(undefined)
                    setGatewayWorkspaceDraft(undefined)
                  }}
                    disabled={gatewayBusy || !gatewaySnapshot || gatewaySnapshot.clients.length === 0}
                  >
                    {!gatewaySnapshot || gatewaySnapshot.clients.length === 0 ? (
                      <option value="">No client selected</option>
                    ) : (
                      gatewaySnapshot.clients.map((client) => (
                      <option key={client.clientId} value={client.clientId}>
                        {client.name}{client.status === 'archived' ? ' (archived)' : ''}
                      </option>
                      ))
                  )}
                </select>
                <select
                  value={gatewaySelectedWorkspace?.workspaceId ?? ''}
                  onChange={(event) => {
                    const nextWorkspaceId = event.target.value || undefined
                    setSelectedGatewayWorkspaceId(nextWorkspaceId)
                    setSelectedGatewaySessionId(undefined)
                  }}
                  disabled={gatewayBusy || gatewayClientWorkspaces.length === 0}
                >
                  {gatewayClientWorkspaces.length === 0 ? (
                    <option value="">No workspace selected</option>
                  ) : (
                    gatewayClientWorkspaces.map((workspace) => (
                      <option key={workspace.workspaceId} value={workspace.workspaceId}>
                        {workspace.name}{workspace.status === 'archived' ? ' (archived)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <select
                  value={gatewaySelectedSession?.sessionId ?? ''}
                    onChange={(event) => {
                      const nextSessionId = event.target.value || undefined
                      setSelectedGatewaySessionId(nextSessionId)
                      if (gatewaySelectedClientId) {
                        setSelectedClientId(gatewaySelectedClientId)
                      }
                    }}
                    disabled={gatewayBusy || gatewayAvailableSessions.length === 0}
                  >
                    {gatewayAvailableSessions.length === 0 ? (
                      <option value="">No runtime session linked yet</option>
                    ) : (
                      gatewayAvailableSessions.map((session) => (
                        <option key={session.sessionId} value={session.sessionId}>
                          {formatGatewaySessionOptionLabel({
                            session,
                            latestRun: selectGatewayRunForSession({
                              snapshot: gatewaySnapshot!,
                              sessionId: session.sessionId,
                            }),
                          })}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={gatewaySelectedProviderProfile?.profileId ?? ''}
                    onChange={(event) =>
                      setSelectedGatewayProviderProfileId(event.target.value || undefined)
                    }
                    disabled={gatewayBusy || !gatewaySnapshot || gatewaySnapshot.providerProfiles.length === 0}
                  >
                    {!gatewaySnapshot || gatewaySnapshot.providerProfiles.length === 0 ? (
                      <option value="">No provider profile selected</option>
                    ) : (
                      gatewaySnapshot.providerProfiles.map((profile) => (
                        <option key={profile.profileId} value={profile.profileId}>
                          {profile.label} | {profile.providerId}
                          {profile.status === 'archived' ? ' (archived)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <input
                    value={gatewayPrompt}
                    onChange={(event) => setGatewayPrompt(event.target.value)}
                    placeholder="Prompt for the local gateway run"
                  />
                  <select
                    value={gatewaySelectedCronSchedule?.scheduleId ?? ''}
                    onChange={(event) => setSelectedGatewayCronScheduleId(event.target.value || undefined)}
                    disabled={gatewayBusy || gatewayCronSchedules.length === 0}
                  >
                    {gatewayCronSchedules.length === 0 ? (
                      <option value="">No cron schedule selected</option>
                    ) : (
                      gatewayCronSchedules.map((schedule) => (
                        <option key={schedule.scheduleId} value={schedule.scheduleId}>
                          {schedule.label} | {schedule.cronExpr}
                          {schedule.enabled ? '' : ' (disabled)'}
                        </option>
                      ))
                    )}
                  </select>
                  <input
                    value={gatewayCronLabel}
                    onChange={(event) => setGatewayCronLabel(event.target.value)}
                    placeholder="Cron schedule label"
                  />
                  <input
                    value={gatewayCronExpr}
                    onChange={(event) => setGatewayCronExpr(event.target.value)}
                    placeholder="Cron expression"
                  />
                  <select
                    value={gatewayCronTimezone}
                    onChange={(event) => setGatewayCronTimezone(event.target.value as 'local' | 'utc')}
                  >
                    <option value="local">Local time</option>
                    <option value="utc">UTC</option>
                  </select>
                  <select
                    value={gatewaySelectedBudget?.budgetId ?? ''}
                    onChange={(event) => setSelectedGatewayBudgetId(event.target.value || undefined)}
                    disabled={gatewayBusy || gatewayRelevantBudgets.length === 0}
                  >
                    {gatewayRelevantBudgets.length === 0 ? (
                      <option value="">No budget selected</option>
                    ) : (
                      gatewayRelevantBudgets.map((budget) => (
                        <option key={budget.budgetId} value={budget.budgetId}>
                          {budget.label} | {budget.scopeType}
                          {budget.status === 'archived' ? ' (archived)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={gatewayBudgetScopeType}
                    onChange={(event) =>
                      setGatewayBudgetScopeType(event.target.value as 'client' | 'workspace' | 'agent')
                    }
                  >
                    <option value="client">Client budget</option>
                    <option value="workspace">Workspace budget</option>
                    <option value="agent">Agent budget</option>
                  </select>
                  <input
                    value={gatewayBudgetLabel}
                    onChange={(event) => setGatewayBudgetLabel(event.target.value)}
                    placeholder="Budget label"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={gatewayBudgetMaxUsd}
                    onChange={(event) => setGatewayBudgetMaxUsd(event.target.value)}
                    placeholder="Max USD"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={gatewayBudgetWarnUsd}
                    onChange={(event) => setGatewayBudgetWarnUsd(event.target.value)}
                    placeholder="Warn USD"
                  />
                  <select
                    value={gatewaySelectedDeploymentTarget?.targetId ?? ''}
                    onChange={(event) => setSelectedGatewayDeploymentTargetId(event.target.value || undefined)}
                    disabled={gatewayBusy || gatewayDeploymentTargets.length === 0}
                  >
                    {gatewayDeploymentTargets.length === 0 ? (
                      <option value="">No deployment target selected</option>
                    ) : (
                      gatewayDeploymentTargets.map((target) => (
                        <option key={target.targetId} value={target.targetId}>
                          {target.label} | {target.kind}
                          {target.executionSupported ? '' : ' (metadata only)'}
                          {target.status === 'archived' ? ' (archived)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <input
                    value={gatewayDeploymentLabel}
                    onChange={(event) => setGatewayDeploymentLabel(event.target.value)}
                    placeholder="Deployment target label"
                  />
                  <input
                    value={gatewayDeploymentSshHost}
                    onChange={(event) => setGatewayDeploymentSshHost(event.target.value)}
                    placeholder="SSH host"
                  />
                  <input
                    value={gatewayDeploymentSshUser}
                    onChange={(event) => setGatewayDeploymentSshUser(event.target.value)}
                    placeholder="SSH user"
                  />
                  <input
                    value={gatewayDeploymentSshPort}
                    onChange={(event) => setGatewayDeploymentSshPort(event.target.value)}
                    placeholder="SSH port"
                  />
                  <input
                    value={gatewayDeploymentRemoteRoot}
                    onChange={(event) => setGatewayDeploymentRemoteRoot(event.target.value)}
                    placeholder="Remote root"
                  />
                  <input
                    value={gatewayDeploymentServiceName}
                    onChange={(event) => setGatewayDeploymentServiceName(event.target.value)}
                    placeholder="systemd service name"
                  />
                  <input
                    value={gatewayDeploymentEnvFilePath}
                    onChange={(event) => setGatewayDeploymentEnvFilePath(event.target.value)}
                    placeholder="Remote env file path"
                  />
                  <input
                    value={gatewayDeploymentDomain}
                    onChange={(event) => setGatewayDeploymentDomain(event.target.value)}
                    placeholder="Optional Caddy domain"
                  />
                  <select
                    value={gatewayDeploymentOperation}
                    onChange={(event) =>
                      setGatewayDeploymentOperation(event.target.value as 'deploy' | 'rollback' | 'destroy')
                    }
                  >
                    <option value="deploy">Deploy</option>
                    <option value="rollback">Rollback</option>
                    <option value="destroy">Destroy</option>
                  </select>
                  <select
                    value={gatewaySelectedMarketplaceTemplate?.templateId ?? ''}
                    onChange={(event) =>
                      setSelectedGatewayMarketplaceTemplateId(event.target.value || undefined)
                    }
                    disabled={gatewayBusy || gatewayMarketplaceTemplates.length === 0}
                  >
                    {gatewayMarketplaceTemplates.length === 0 ? (
                      <option value="">No template selected</option>
                    ) : (
                      gatewayMarketplaceTemplates.map((template) => (
                        <option key={template.templateId} value={template.templateId}>
                          {template.label} | {template.provenance}
                        </option>
                      ))
                    )}
                  </select>
                  <input
                    value={gatewayMarketplaceWorkspaceRoot}
                    onChange={(event) => setGatewayMarketplaceWorkspaceRoot(event.target.value)}
                    placeholder="Template workspace root"
                  />
                  <small>
                    Source: local gateway dev at {localGatewayUrlFromEnv()}
                    {gatewaySelectedClientRecord
                      ? ` | client ${gatewaySelectedClientRecord.name} (${gatewaySelectedClientRecord.status})`
                      : ''}
                    {gatewaySelectedWorkspace
                      ? ` | workspace ${gatewaySelectedWorkspace.name} (${gatewaySelectedWorkspace.status})`
                      : ''}
                    {gatewaySelectedSession ? ` | session ${gatewaySelectedSession.sessionId}` : ''}
                    {gatewaySelectedProviderProfile
                      ? ` | provider ${gatewaySelectedProviderProfile.label} (${gatewaySelectedProviderProfile.credentialState}, ${gatewaySelectedProviderProfile.status})`
                      : ''}
                    {gatewaySelectedCronSchedule
                      ? ` | cron ${gatewaySelectedCronSchedule.label} (${gatewaySelectedCronSchedule.enabled ? 'enabled' : 'disabled'})`
                      : gatewayCronSchedules.length > 0
                        ? ` | ${gatewayCronSchedules.length} cron schedule${gatewayCronSchedules.length === 1 ? '' : 's'}`
                        : ''}
                    {gatewaySelectedBudget
                      ? ` | budget ${gatewaySelectedBudget.label} (${gatewaySelectedBudget.status}, ${gatewaySelectedBudgetEvaluation?.status ?? 'ok'})`
                      : gatewayRelevantBudgets.length > 0
                        ? ` | ${gatewayRelevantBudgets.length} budget${gatewayRelevantBudgets.length === 1 ? '' : 's'}`
                        : ''}
                    {gatewaySelectedDeploymentTarget
                      ? ` | deploy ${gatewaySelectedDeploymentTarget.label} (${gatewaySelectedDeploymentTarget.status}, ${gatewaySelectedDeploymentTarget.executionMode})`
                      : gatewayDeploymentTargets.length > 0
                        ? ` | ${gatewayDeploymentTargets.length} deployment target${gatewayDeploymentTargets.length === 1 ? '' : 's'}`
                        : ''}
                    {gatewaySelectedMarketplaceTemplate
                      ? ` | template ${gatewaySelectedMarketplaceTemplate.label}`
                      : gatewayMarketplaceTemplates.length > 0
                        ? ` | ${gatewayMarketplaceTemplates.length} template${gatewayMarketplaceTemplates.length === 1 ? '' : 's'}`
                        : ''}
                    {gatewayAvailableSessions.length > 0
                      ? ` | ${gatewayAvailableSessions.length} linked session${gatewayAvailableSessions.length === 1 ? '' : 's'}`
                      : ''}
                    {gatewayBusy ? ' | working' : ''}
                  </small>
                  <BudgetToolPolicySummary evaluation={gatewaySelectedBudgetEvaluation} />
                  <PricingCatalogStatusSummary pricingCatalog={gatewaySnapshot?.pricingCatalog} />
                  <UsageStatusSummary usageStatus={gatewaySnapshot?.usageStatus} />
                  <CronGrantSummary
                    schedule={gatewaySelectedCronSchedule}
                    preview={gatewayCronGrantPreview}
                  />
                  <ProvenanceReviewSummary reviews={gatewayProvenanceReviews} />
                  <button
                    className="ghost-button"
                    onClick={() => {
                      if (!gatewaySelectedClientRecord) return
                      setGatewayDraftClient(undefined)
                      setGatewayEditingClient({
                        clientId: gatewaySelectedClientRecord.clientId,
                        workspaceId: gatewaySelectedWorkspace?.workspaceId,
                        name: gatewaySelectedClientRecord.name,
                        contact: '',
                        billingLabel: '',
                        workspaceName:
                          gatewaySelectedWorkspace?.name
                          ?? `${gatewaySelectedClientRecord.name} Workspace`,
                        workspaceRoot: '',
                      })
                      setScreen('new-client')
                    }}
                    disabled={gatewayBusy || !gatewaySelectedClientRecord}
                  >
                    Edit client
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      if (!gatewaySelectedClientRecord) return
                      setGatewayWorkspaceDraft({
                        clientId: gatewaySelectedClientRecord.clientId,
                        clientName: gatewaySelectedClientRecord.name,
                        workspaceName: `${gatewaySelectedClientRecord.name} Workspace`,
                        workspaceRoot: '',
                      })
                      setScreen('new-workspace')
                    }}
                    disabled={gatewayBusy || !gatewaySelectedClientRecord}
                  >
                    New workspace
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setGatewayEditingProviderProfile({
                        profileId: gatewaySelectedProviderProfile?.profileId,
                        providerId: gatewaySelectedProviderProfile?.providerId ?? 'openrouter',
                        label: gatewaySelectedProviderProfile?.label ?? 'OpenRouter',
                        defaultModelId: gatewaySelectedProviderProfile?.defaultModelId ?? '',
                        secretRef: '',
                        credentialState: gatewaySelectedProviderProfile?.credentialState,
                        status: gatewaySelectedProviderProfile?.status,
                      })
                      setScreen('provider-profile')
                    }}
                    disabled={gatewayBusy}
                  >
                    {gatewaySelectedProviderProfile ? 'Edit provider' : 'New provider'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void saveLocalGatewayCronSchedule()}
                    disabled={gatewayBusy || !gatewaySelectedSession || !gatewayCronLabel.trim() || !gatewayCronExpr.trim()}
                  >
                    {gatewaySelectedCronSchedule ? 'Save cron' : 'New cron'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void toggleLocalGatewayCronSchedule()}
                    disabled={gatewayBusy || !gatewaySelectedCronSchedule}
                  >
                    {gatewaySelectedCronSchedule?.enabled ? 'Disable cron' : 'Enable cron'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void runLocalGatewayCronNow()}
                    disabled={gatewayBusy || !gatewaySelectedCronSchedule || !gatewaySelectedClientId}
                  >
                    Run cron now
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void reviewLocalGatewayCronGrant()}
                    disabled={gatewayBusy || !gatewaySelectedCronSchedule}
                  >
                    Review cron grant
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void createLocalGatewayCronGrant()}
                    disabled={gatewayBusy || !gatewaySelectedCronSchedule}
                  >
                    Create scoped cron grant
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void loadLocalGatewayProvenanceReviews()}
                    disabled={gatewayBusy || !gatewaySelectedWorkspace}
                  >
                    Review provenance
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void decideLocalGatewayProvenanceReview('approved')}
                    disabled={gatewayBusy || !gatewaySelectedPendingProvenanceReview}
                  >
                    Approve provenance
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void decideLocalGatewayProvenanceReview('rejected')}
                    disabled={gatewayBusy || !gatewaySelectedPendingProvenanceReview}
                  >
                    Reject provenance
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void applyLocalGatewayProvenanceReview()}
                    disabled={gatewayBusy || !gatewaySelectedApprovedProvenanceReview}
                  >
                    Apply provenance
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void deleteLocalGatewayCronSchedule()}
                    disabled={gatewayBusy || !gatewaySelectedCronSchedule}
                  >
                    Delete cron
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void saveLocalGatewayBudget()}
                    disabled={
                      gatewayBusy
                      || !gatewayBudgetLabel.trim()
                      || !gatewayBudgetMaxUsd.trim()
                      || !gatewayBudgetWarnUsd.trim()
                    }
                  >
                    {gatewaySelectedBudget ? 'Save budget' : 'New budget'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void toggleLocalGatewayBudgetStatus()}
                    disabled={gatewayBusy || !gatewaySelectedBudget}
                  >
                    {gatewaySelectedBudget?.status === 'archived' ? 'Restore budget' : 'Archive budget'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void deleteLocalGatewayBudget()}
                    disabled={gatewayBusy || !gatewaySelectedBudget}
                  >
                    Delete budget
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void saveLocalGatewayDeploymentTarget()}
                    disabled={
                      gatewayBusy
                      || !gatewaySelectedWorkspace
                      || !gatewayDeploymentLabel.trim()
                      || !gatewayDeploymentSshHost.trim()
                      || !gatewayDeploymentSshUser.trim()
                      || !gatewayDeploymentRemoteRoot.trim()
                      || !gatewayDeploymentServiceName.trim()
                    }
                  >
                    New deploy target
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void installLocalGatewayMarketplaceTemplate()}
                    disabled={
                      gatewayBusy
                      || !gatewaySelectedMarketplaceTemplate
                      || !gatewayMarketplaceWorkspaceRoot.trim()
                    }
                  >
                    Install template
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void previewLocalGatewayDeployment()}
                    disabled={gatewayBusy || !gatewaySelectedDeploymentTarget || !gatewaySelectedDeploymentTargetExecutable}
                  >
                    Preview {gatewayDeploymentOperation}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void executeLocalGatewayDeploymentAction()}
                    disabled={gatewayBusy || !gatewaySelectedDeploymentTarget || !gatewaySelectedDeploymentTargetExecutable}
                  >
                    Execute {gatewayDeploymentOperation}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      void setLocalGatewayProviderProfileStatus(
                        gatewaySelectedProviderProfile?.status === 'archived'
                          ? 'active'
                          : 'archived',
                      )
                    }
                    disabled={gatewayBusy || !gatewaySelectedProviderProfile}
                  >
                    {gatewaySelectedProviderProfile?.status === 'archived'
                      ? 'Restore provider'
                      : 'Archive provider'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      void setLocalGatewayClientStatus(
                        gatewaySelectedClientRecord?.status === 'archived' ? 'active' : 'archived',
                      )
                    }
                    disabled={gatewayBusy || !gatewaySelectedClientRecord}
                  >
                    {gatewaySelectedClientRecord?.status === 'archived' ? 'Restore client' : 'Archive client'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void deleteLocalGatewayClient()}
                    disabled={
                      gatewayBusy
                      || !gatewaySelectedClientRecord
                      || gatewayClientDeleteGuard?.allowed === false
                    }
                  >
                    Delete client
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      void setLocalGatewayWorkspaceStatus(
                        gatewaySelectedWorkspace?.status === 'archived' ? 'active' : 'archived',
                      )
                    }
                    disabled={gatewayBusy || !gatewaySelectedWorkspace}
                  >
                    {gatewaySelectedWorkspace?.status === 'archived'
                      ? 'Restore workspace'
                      : 'Archive workspace'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void deleteLocalGatewayWorkspace()}
                    disabled={
                      gatewayBusy
                      || !gatewaySelectedWorkspace
                      || gatewayWorkspaceDeleteGuard?.allowed === false
                    }
                  >
                    Delete workspace
                  </button>
                  {gatewaySelectedClientRecord && gatewayClientDeleteGuard && !gatewayClientDeleteGuard.allowed ? (
                    <small className="gateway-action-hint">
                      Client delete blocked: {gatewayClientDeleteGuard.blockers.join(', ')}.
                    </small>
                  ) : null}
                  {gatewaySelectedWorkspace && gatewayWorkspaceDeleteGuard && !gatewayWorkspaceDeleteGuard.allowed ? (
                    <small className="gateway-action-hint">
                      Workspace delete blocked: {gatewayWorkspaceDeleteGuard.blockers.join(', ')}.
                    </small>
                  ) : null}
                  {gatewayDeploymentPreview ? (
                    <pre className="gateway-deployment-preview">{gatewayDeploymentPreview}</pre>
                  ) : null}
                  <button
                    className="ghost-button"
                    onClick={() => {
                      if (!gatewaySelectedClientId) return
                      setGatewayDraftClient(undefined)
                      setGatewayEditingClient(undefined)
                      setScreen('agent-spec')
                    }}
                    disabled={gatewayBusy || !gatewaySelectedClientId}
                  >
                    {gatewaySelectedAgentRecord ? 'Edit agent' : 'New agent'}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      gatewaySelectedClientId
                        ? void openLocalGatewayTrace(
                            gatewaySelectedClientId,
                            gatewaySelectedSession?.sessionId,
                            gatewaySelectedWorkspace?.workspaceId,
                          )
                        : undefined
                  }
                    disabled={gatewayBusy || !gatewaySelectedClientId || !gatewaySelectedSession}
                  >
                    Open trace
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void startLocalGatewayRun()}
                    disabled={
                      gatewayBusy
                      || !gatewaySelectedSession
                      || (gatewayRunBudgetWarnings.length > 0 && !gatewayAllowBudgetWarning)
                    }
                  >
                    Start run
                  </button>
                  {gatewayAuthMode === 'hosted' ? (
                    <button
                      className="ghost-button"
                      onClick={() => void logoutLocalGatewayHostedAuth()}
                      disabled={gatewayBusy}
                    >
                      Logout hosted auth
                    </button>
                  ) : null}
                </div>
                {gatewayRunBudgetWarnings.length > 0 ? (
                  <>
                    <label className="inline-checkbox">
                      <input
                        type="checkbox"
                        checked={gatewayAllowBudgetWarning}
                        onChange={(event) => setGatewayAllowBudgetWarning(event.target.checked)}
                        disabled={gatewayBusy}
                      />
                      <span>
                        Acknowledge warning budget before run:{' '}
                        {gatewayRunBudgetWarnings
                          .map(
                            (evaluation) =>
                              `${evaluation.label} ($${evaluation.usedEstimatedCostUsd.toFixed(3)} / $${evaluation.maxEstimatedCostUsd.toFixed(3)})`,
                          )
                          .join(', ')}
                      </span>
                    </label>
                    {gatewayRunBudgetWarnings.map((evaluation) => (
                      <BudgetToolPolicySummary key={evaluation.budgetId} evaluation={evaluation} />
                    ))}
                  </>
                ) : null}
                <label className="field">
                  <span>Run backend</span>
                  <select
                    value={gatewayRunComputerId}
                    onChange={(event) => setGatewayRunComputerId(event.target.value)}
                    disabled={gatewayBusy}
                  >
                    <option value="computer_local">Host process-dev</option>
                    <option value="computer_wsl" disabled={!gatewayWslBackend?.available}>
                      {gatewayWslBackend?.available
                        ? 'WSL cell'
                        : `WSL blocked${gatewayWslBackend?.reason ? ` (${gatewayWslBackend.reason})` : ''}`}
                    </option>
                    <option value="computer_docker" disabled={!gatewayDockerBackend?.available}>
                      {gatewayDockerBackend?.available
                        ? 'Docker cell'
                        : `Docker blocked${gatewayDockerBackend?.reason ? ` (${gatewayDockerBackend.reason})` : ''}`}
                    </option>
                  </select>
                </label>
                {gatewayReadModel ? (
                  <GatewayDashboardQueues
                    activeRuns={gatewayReadModel.projection.activeRuns}
                    pendingApprovals={gatewayReadModel.projection.pendingApprovals}
                    onOpenRunTrace={(run) => {
                      const targetClientId = run.clientId ?? gatewaySelectedClientId
                      if (!targetClientId) return
                      void openLocalGatewayTrace(targetClientId, run.sessionId, run.workspaceId)
                    }}
                    onOpenApprovalTrace={(approval) => {
                      const targetClientId = approval.clientId ?? gatewaySelectedClientId
                      if (!targetClientId) return
                      void openLocalGatewayTrace(targetClientId, approval.sessionId)
                    }}
                    onResolveApproval={(approval, decision) =>
                      void resolveLocalGatewayQueueApproval(approval, decision)
                    }
                    approvalActionBusy={gatewayBusy}
                  />
                ) : null}
                {gatewaySelectedClientDetail ? (
                  <GatewayClientDetailPanel
                    detail={gatewaySelectedClientDetail}
                    liveInventory={gatewayLiveInventory}
                    browserAccessUrl={gatewayClient?.browserAccessUrl}
                    onOpenUsageTrace={(entry) =>
                      gatewaySelectedClientId
                        ? void openLocalGatewayTrace(
                            gatewaySelectedClientId,
                            entry.sessionId,
                            entry.workspaceId,
                          )
                        : undefined
                    }
                    onOpenArtifactTrace={(artifact) =>
                      gatewaySelectedClientId
                        ? void openLocalGatewayTrace(
                            gatewaySelectedClientId,
                            artifact.sessionId,
                            artifact.workspaceId,
                          )
                        : undefined
                    }
                    onOpenApprovalTrace={(approval) =>
                      gatewaySelectedClientId
                        ? void openLocalGatewayTrace(
                            gatewaySelectedClientId,
                            approval.sessionId,
                            approval.workspaceId,
                          )
                        : undefined
                    }
                    onOpenSessionTrace={(session) =>
                      gatewaySelectedClientId
                        ? void openLocalGatewayTrace(
                            gatewaySelectedClientId,
                            session.sessionId,
                            session.workspaceId,
                          )
                        : undefined
                    }
                    onResolveApproval={(approval, decision) =>
                      void resolveLocalGatewayClientApproval(approval, decision)
                    }
                    approvalActionBusy={gatewayBusy}
                  />
                ) : null}
              </div>
            ) : undefined
          }
          notice={dashboardNotice}
        />
      )}
      {screen === 'new-workspace' && gatewayWorkspaceDraft && (
        <NewWorkspace
          clientName={gatewayWorkspaceDraft.clientName}
          initialName={gatewayWorkspaceDraft.workspaceName}
          initialRoot={gatewayWorkspaceDraft.workspaceRoot}
          onCancel={() => {
            setGatewayWorkspaceDraft(undefined)
            setScreen('dashboard')
          }}
          onCreate={(workspace) =>
            void createLocalGatewayWorkspaceRecord({
              clientId: gatewayWorkspaceDraft.clientId,
              workspaceName: workspace.name,
              workspaceRoot: workspace.root,
            })}
        />
      )}
      {screen === 'new-client' && (
        <NewClient
          existingClient={
            localGatewayMode && gatewayEditingClient
              ? {
                  id: gatewayEditingClient.clientId,
                  name: gatewayEditingClient.name,
                  contact: gatewayEditingClient.contact,
                  workspace: gatewayEditingClient.workspaceRoot,
                  workspaceName: gatewayEditingClient.workspaceName,
                  billingLabel: gatewayEditingClient.billingLabel,
                }
              : undefined
          }
          localGatewayMode={localGatewayMode}
          onCancel={() => {
            setGatewayEditingClient(undefined)
            setGatewayWorkspaceDraft(undefined)
            setScreen('dashboard')
          }}
          onCreate={(client) => {
            if (localGatewayMode) {
              if (gatewayEditingClient) {
                void updateLocalGatewayClientRecord(client)
                return
              }
              void createLocalGatewayClientRecord(client)
              return
            }
            setSelectedClientId(client.id)
            updateState({ clients: [client, ...state.clients] })
            setScreen('agent-spec')
          }}
        />
      )}
      {screen === 'provider-profile' && (
        <ProviderProfileForm
          existingProfile={gatewayEditingProviderProfile}
          onCancel={() => {
            setGatewayEditingProviderProfile(undefined)
            setScreen('dashboard')
          }}
          onSave={(profile) => void saveLocalGatewayProviderProfile(profile)}
        />
      )}
      {screen === 'agent-spec' && activeClient && (
        <AgentSpec
          client={activeClient}
          existingAgent={activeAgent}
          providerState={providerState}
          onBack={() => {
            if (localGatewayMode) {
              setGatewayDraftClient(undefined)
              setGatewayEditingClient(undefined)
              setGatewayWorkspaceDraft(undefined)
              setScreen('dashboard')
              return
            }
            setScreen(activeAgent ? 'skills' : 'dashboard')
          }}
          onSave={(agent) => {
            if (localGatewayMode) {
              void createLocalGatewayAgentDraft(agent)
              return
            }
            const agents = state.agents.some((item) => item.id === agent.id)
              ? state.agents.map((item) => (item.id === agent.id ? agent : item))
              : [agent, ...state.agents]
            updateState({ agents })
            setScreen('skills')
          }}
        />
      )}
      {screen === 'skills' && activeClient && activeAgent && (
        <Skills
          clientName={activeClient.name}
          agent={activeAgent}
          providerReady={providerReady}
          providerState={providerState}
          onSettings={() => setSettingsOpen(true)}
          onBack={() => setScreen('agent-spec')}
          onSave={(agent) => {
            updateState({
              agents: state.agents.map((item) => (item.id === agent.id ? agent : item)),
            })
            setNotice('Draft saved locally.')
          }}
          onLaunch={() => setScreen(providerReady ? 'trace' : 'skills')}
        />
      )}
      {screen === 'trace' && runTraceViewModel && (
        <RunTrace
          trace={runTraceViewModel}
          selectedEvent={selectedEvent}
          setSelectedEvent={setSelectedEvent}
          onBack={() =>
            setScreen(localGatewayMode || developmentFixturePreview ? 'dashboard' : 'skills')
          }
          actions={
            localGatewayMode && gatewaySelectedPendingApproval
              ? [
                  {
                    label: 'Approve',
                    onClick: () => void resolveLocalGatewayApproval('approved'),
                    disabled: gatewayBusy,
                  },
                  {
                    label: 'Deny',
                    onClick: () => void resolveLocalGatewayApproval('denied'),
                    disabled: gatewayBusy,
                  },
                ]
              : []
          }
        />
      )}
    </Shell>
  )
}

function Shell({
  children,
  username,
  onSettings,
  settingsOpen,
  state,
  updateState,
  closeSettings,
  banner,
  showSettings,
}: {
  children: React.ReactNode
  username?: string
  onSettings: () => void
  settingsOpen: boolean
  state: ConsoleState
  updateState: (next: Partial<ConsoleState>) => void
  closeSettings: () => void
  banner: string
  showSettings: boolean
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Mainspring home">
          <span className="brand-mark">ms</span>
          <span>Mainspring</span>
        </div>
        <nav className="top-actions" aria-label="Account">
          {showSettings ? (
            <>
              <button className="text-button" onClick={onSettings}>
                Settings
              </button>
              <span className="divider" />
            </>
          ) : null}
          <span className="muted">{username ?? 'local user'}</span>
        </nav>
      </header>
      <div className="prototype-banner">{banner}</div>
      <main>{children}</main>
      {showSettings ? (
        <SettingsDrawer
          open={settingsOpen}
          state={state}
          updateState={updateState}
          onClose={closeSettings}
        />
      ) : null}
    </div>
  )
}

function AuthScreen({
  account,
  lastUser,
  onCreate,
  onUnlock,
  notice,
}: {
  account?: Account
  lastUser?: string
  onCreate: (username: string, password: string) => Promise<void>
  onUnlock: (password: string) => Promise<void>
  notice: string
}) {
  const [mode, setMode] = useState<AuthMode>(account ? 'unlock' : 'create')
  const [username, setUsername] = useState(lastUser ?? 'austin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localNotice, setLocalNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'create') {
      if (!username.trim()) return setLocalNotice('Choose a username.')
      if (password.length < 8) return setLocalNotice('Use at least 8 characters.')
      if (password !== confirm) return setLocalNotice('Passwords do not match.')
      await onCreate(username.trim(), password)
      return
    }
    await onUnlock(password)
  }

  return (
    <section className="auth-grid">
      <form className="auth-form" onSubmit={submit}>
        <h1>{mode === 'create' ? 'Create local account' : 'Welcome back'}</h1>
        <p>Stored on this machine. Password required every launch.</p>
        {mode === 'create' && (
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
        )}
        {mode === 'unlock' && (
          <div className="remembered-user">
            <span>Last user</span>
            <strong>{account?.username ?? lastUser}</strong>
          </div>
        )}
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === 'create' && (
          <label>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
        )}
        <button className="primary-button" type="submit">
          {mode === 'create' ? 'Create account' : 'Unlock'}
        </button>
        <button
          className="link-button"
          type="button"
          onClick={() => setMode(mode === 'create' ? 'unlock' : 'create')}
        >
          {mode === 'create' ? 'Use existing account' : 'Create new local account'}
        </button>
        {(localNotice || notice) && <p className="notice">{localNotice || notice}</p>}
      </form>
      <aside className="rules-panel">
        <h2>Local sign-in rules</h2>
        <div className="rule-row">Last user remembered</div>
        <div className="rule-row">Prototype PBKDF2 password hash in localStorage</div>
        <div className="rule-row">No secure provider key storage</div>
        <div className="returning-row">
          <span>Last user: {lastUser ?? 'none'}</span>
          <button className="secondary-button" onClick={() => setMode('unlock')}>
            Unlock
          </button>
        </div>
      </aside>
    </section>
  )
}

function HostedGatewayAuthScreen({
  bootstrapRequired,
  busy = false,
  notice,
  onBootstrap,
  onLogin,
}: {
  bootstrapRequired: boolean
  busy?: boolean
  notice?: string
  onBootstrap: (username: string, password: string) => Promise<void>
  onLogin: (username: string, password: string) => Promise<void>
}) {
  const [mode, setMode] = useState<HostedGatewayAuthMode>(bootstrapRequired ? 'create-admin' : 'login')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localNotice, setLocalNotice] = useState('')

  useEffect(() => {
    setMode(bootstrapRequired ? 'create-admin' : 'login')
  }, [bootstrapRequired])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLocalNotice('')
    if (!username.trim()) return setLocalNotice('Username is required.')
    if (password.length < 8) return setLocalNotice('Use at least 8 characters.')
    if (mode === 'create-admin') {
      if (password !== confirm) return setLocalNotice('Passwords do not match.')
      await onBootstrap(username.trim(), password)
      return
    }
    await onLogin(username.trim(), password)
  }

  return (
    <section className="auth-grid">
      <form className="auth-form" onSubmit={submit}>
        <p className="breadcrumb">Hosted gateway auth</p>
        <h1>{mode === 'create-admin' ? 'Create hosted admin' : 'Sign in to gateway'}</h1>
        <p>
          {mode === 'create-admin'
            ? 'Bootstraps the first hosted gateway admin in the local gateway app database.'
            : 'Uses the hosted gateway session boundary instead of prototype browser localStorage auth.'}
        </p>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'create-admin' ? 'new-password' : 'current-password'}
          />
        </label>
        {mode === 'create-admin' ? (
          <label>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}
        <button className="primary-button" type="submit" disabled={busy}>
          {mode === 'create-admin' ? 'Bootstrap admin' : 'Login'}
        </button>
        {localNotice && <small>{localNotice}</small>}
        {notice && <small>{notice}</small>}
        {!bootstrapRequired ? (
          <button className="secondary-button" type="button" onClick={() => setMode('login')}>
            Use login
          </button>
        ) : null}
      </form>
      <div className="auth-sidebar">
        <div className="rule-row">Server-side users and sessions in the gateway app database</div>
        <div className="rule-row">Password hashing uses Node scrypt, not prototype PBKDF2 localStorage</div>
        <div className="rule-row">Session token stays in browser memory for this app session</div>
      </div>
    </section>
  )
}

export function Dashboard({
  viewModel,
  onNewClient,
  onOpenClient,
  onGuide,
  primaryActionLabel = 'New client',
  controlPanel,
  notice,
}: {
  viewModel: DashboardViewModel
  onNewClient: () => void
  onOpenClient: (clientId: string) => void
  onGuide: () => void
  primaryActionLabel?: string
  controlPanel?: React.ReactNode
  notice: string
}) {
  if (viewModel.clients.length === 0) {
    return (
      <section className="empty-state">
        <h1>No agents yet.</h1>
        <p>Create a client, then attach an agent.</p>
        {controlPanel}
        <div className="button-row center">
          <button className="primary-button" onClick={onNewClient}>
            {primaryActionLabel}
          </button>
          <button className="ghost-button" onClick={onGuide}>
            Open guide
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
        <footer className="status-strip">
          {viewModel.statusStrip.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </footer>
      </section>
    )
  }

  return (
    <section className="dashboard-list">
      <div>
        <p className="breadcrumb">Dashboard</p>
        <h1>Clients</h1>
      </div>
      <button className="secondary-button" onClick={onNewClient}>
        {primaryActionLabel}
      </button>
      {controlPanel}
      {viewModel.clients.map((client) => (
        <button className="client-row" key={client.id} onClick={() => onOpenClient(client.id)}>
          <span>
            <strong>{client.name}</strong>
            <small>{client.subtitle}</small>
            {client.activeRunSummary && <small>{client.activeRunSummary}</small>}
            {client.usageSummary && <small>{client.usageSummary}</small>}
          </span>
          <span>{client.statusLabel}</span>
        </button>
      ))}
      {notice && <p className="notice">{notice}</p>}
      <footer className="status-strip dashboard-status-strip">
        {viewModel.statusStrip.map((label) => (
          <span key={label}>{label}</span>
        ))}
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
  approvalActionBusy = false,
}: {
  activeRuns: ConsoleDashboardRunRow[]
  pendingApprovals: ConsoleDashboardApprovalRow[]
  onOpenRunTrace: (run: ConsoleDashboardRunRow) => void
  onOpenApprovalTrace: (approval: ConsoleDashboardApprovalRow) => void
  onResolveApproval?: (
    approval: ConsoleDashboardApprovalRow,
    decision: 'approved' | 'denied',
  ) => void
  approvalActionBusy?: boolean
}) {
  return (
    <div className="gateway-queue-panel">
      <div className="gateway-detail-section">
        <h2>Pending approvals</h2>
        {pendingApprovals.length === 0 ? (
          <p>No pending approvals in the live queue.</p>
        ) : (
          pendingApprovals.slice(0, 6).map((approval) => (
            <div className="gateway-detail-row" key={approval.approvalId}>
              <strong>{approval.targetKey ?? approval.approvalId}</strong>
              <small>
                {[approval.clientName, approval.agentName]
                  .filter((value): value is string => Boolean(value))
                  .join(' | ')}
              </small>
              <small>
                {[approval.runId, `requested ${formatDetailTimestamp(approval.requestedAt)}`]
                  .filter((value): value is string => Boolean(value))
                  .join(' | ')}
              </small>
              <div className="button-row">
                {onResolveApproval ? (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onResolveApproval(approval, 'approved')}
                      disabled={approvalActionBusy}
                    >
                      Approve
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => onResolveApproval(approval, 'denied')}
                      disabled={approvalActionBusy}
                    >
                      Deny
                    </button>
                  </>
                ) : null}
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onOpenApprovalTrace(approval)}
                >
                  Open approval trace
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="gateway-detail-section">
        <h2>Active runs</h2>
        {activeRuns.length === 0 ? (
          <p>No active runs in the live queue.</p>
        ) : (
          activeRuns.slice(0, 6).map((run) => (
            <div className="gateway-detail-row" key={run.runId}>
              <strong>{run.agentName ?? run.clientName ?? run.runId}</strong>
              <small>
                {[run.status, run.providerLabel ?? run.providerId, run.modelId ?? run.modelFamily]
                  .filter((value): value is string => Boolean(value))
                  .join(' | ')}
              </small>
              <small>
                {[
                  run.clientName,
                  run.eventCount > 0 ? `${run.eventCount} events` : undefined,
                  run.pendingInboundCount > 0 ? `${run.pendingInboundCount} pending inbound` : undefined,
                  run.lastEventAt ? formatDetailTimestamp(run.lastEventAt) : undefined,
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(' | ')}
              </small>
              <div className="button-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onOpenRunTrace(run)}
                >
                  Open run trace
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

type GatewayLiveInventory = {
  toolCalls: Awaited<ReturnType<LocalGatewayClient['toolCalls']>>['toolCalls']
  deploymentTargets: Awaited<ReturnType<LocalGatewayClient['deploymentTargets']>>['deploymentTargets']
  deploymentRuns: Awaited<ReturnType<LocalGatewayClient['deploymentRuns']>>['deploymentRuns']
  cells: Awaited<ReturnType<LocalGatewayClient['cells']>>['cells']
  cellLeases: Awaited<ReturnType<LocalGatewayClient['cellLeases']>>['cellLeases']
  cellSnapshots: Awaited<ReturnType<LocalGatewayClient['cellSnapshots']>>['cellSnapshots']
  cellStatus?: Awaited<ReturnType<LocalGatewayClient['cellStatus']>>['cellStatus']
  executionBackendStatus?: Awaited<ReturnType<LocalGatewayClient['executionBackendStatus']>>['executionBackends']
  executionBackends?: ConsoleGatewaySnapshot['executionBackends']
  loading: boolean
  error?: string
}

export function GatewayClientDetailPanel({
  detail,
  liveInventory,
  browserAccessUrl,
  onOpenUsageTrace,
  onOpenArtifactTrace,
  onOpenApprovalTrace,
  onOpenSessionTrace,
  onResolveApproval,
  approvalActionBusy = false,
}: {
  detail: ConsoleDashboardClientDetail
  liveInventory?: GatewayLiveInventory
  browserAccessUrl?: LocalGatewayClient['browserAccessUrl']
  onOpenUsageTrace: (
    entry: ConsoleDashboardClientDetail['usageEntries'][number],
  ) => void
  onOpenArtifactTrace: (
    artifact: ConsoleDashboardClientDetail['artifacts'][number],
  ) => void
  onOpenApprovalTrace: (
    approval: ConsoleDashboardClientDetail['approvals'][number],
  ) => void
  onOpenSessionTrace: (
    session: ConsoleDashboardClientDetail['sessions'][number],
  ) => void
  onResolveApproval?: (
    approval: ConsoleDashboardClientDetail['approvals'][number],
    decision: 'approved' | 'denied',
  ) => void
  approvalActionBusy?: boolean
}) {
  const [selectedUsageEntryId, setSelectedUsageEntryId] = useState<string | undefined>(
    detail.usageEntries[0]?.entryId,
  )
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>(
    detail.artifacts[0]?.artifactId,
  )
  const [selectedMemoryEntryId, setSelectedMemoryEntryId] = useState<string | undefined>(
    detail.memoryEntries[0]?.entryId,
  )
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | undefined>(
    detail.approvals[0]?.approvalId,
  )
  const [selectedRunLogRunId, setSelectedRunLogRunId] = useState<string | undefined>(
    detail.runLogRuns[0]?.runId,
  )
  const selectedUsageEntry =
    detail.usageEntries.find((entry) => entry.entryId === selectedUsageEntryId)
    ?? detail.usageEntries[0]
  const selectedArtifact =
    detail.artifacts.find((artifact) => artifact.artifactId === selectedArtifactId)
    ?? detail.artifacts[0]
  const [selectedArtifactUrl, setSelectedArtifactUrl] = useState<string>()
  const [selectedArtifactDownloadUrl, setSelectedArtifactDownloadUrl] = useState<string>()
  useEffect(() => {
    let cancelled = false
    const artifactId = selectedArtifact?.artifactId
    if (!artifactId) {
      setSelectedArtifactUrl(undefined)
      setSelectedArtifactDownloadUrl(undefined)
      return
    }
    if (!browserAccessUrl) {
      setSelectedArtifactUrl(undefined)
      setSelectedArtifactDownloadUrl(undefined)
      return
    }
    void browserAccessUrl({ kind: 'artifact', artifactId })
      .then((access) => {
        if (cancelled) return
        const urls = deriveLocalGatewayArtifactAccessUrls(access.url)
        setSelectedArtifactUrl(urls?.previewUrl)
        setSelectedArtifactDownloadUrl(urls?.downloadUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedArtifactUrl(undefined)
          setSelectedArtifactDownloadUrl(undefined)
        }
      })
    return () => {
      cancelled = true
    }
  }, [browserAccessUrl, selectedArtifact?.artifactId])
  const selectedMemoryEntry =
    detail.memoryEntries.find((entry) => entry.entryId === selectedMemoryEntryId)
    ?? detail.memoryEntries[0]
  const selectedApproval =
    detail.approvals.find((approval) => approval.approvalId === selectedApprovalId)
    ?? detail.approvals[0]
  const selectedRunLogRun =
    detail.runLogRuns.find((run) => run.runId === selectedRunLogRunId)
    ?? detail.runLogRuns[0]
  const selectedArtifactPresentation = selectedArtifact
    ? artifactPresentation({
        mediaType: selectedArtifact.mediaType,
        kind: selectedArtifact.kind,
      })
    : undefined

  return (
    <section className="gateway-detail-panel">
      <div className="gateway-detail-header">
        <div>
          <p className="breadcrumb">Selected client</p>
          <h2>{detail.name}</h2>
        </div>
        <div className="gateway-detail-totals">
          <span>{detail.workspaceCount} workspace{detail.workspaceCount === 1 ? '' : 's'}</span>
          <span>{detail.agentCount} agent{detail.agentCount === 1 ? '' : 's'}</span>
          <span>{detail.memoryEntryCount} memor{detail.memoryEntryCount === 1 ? 'y' : 'ies'}</span>
          <span>{detail.usageEntryCount} usage {detail.usageEntryCount === 1 ? 'entry' : 'entries'}</span>
          <span>{detail.artifactCount} artifact{detail.artifactCount === 1 ? '' : 's'}</span>
          <span>{detail.toolCallCount} tool call{detail.toolCallCount === 1 ? '' : 's'}</span>
          <span>{detail.deploymentTargetCount} deployment target{detail.deploymentTargetCount === 1 ? '' : 's'}</span>
          <span>{detail.cellCount} cell{detail.cellCount === 1 ? '' : 's'}</span>
          <span>{detail.runLogRunCount} RunLog run{detail.runLogRunCount === 1 ? '' : 's'}</span>
          {detail.estimatedCostUsd > 0 ? <span>est ${detail.estimatedCostUsd.toFixed(3)}</span> : null}
        </div>
      </div>
      <div className="gateway-detail-grid">
        <div className="gateway-detail-section">
          <h2>Recent memory</h2>
          {detail.memoryEntries.length === 0 ? (
            <p>No durable memory entries projected yet.</p>
          ) : (
            <>
              {detail.memoryEntries.slice(0, 5).map((entry) => (
                <button
                  className={`gateway-detail-row ${selectedMemoryEntry?.entryId === entry.entryId ? 'gateway-detail-row-active' : ''}`}
                  key={entry.entryId}
                  onClick={() => setSelectedMemoryEntryId(entry.entryId)}
                  type="button"
                >
                  <strong>{entry.scope === 'session' ? 'Session memory' : 'Workspace memory'}</strong>
                  <small>
                    {[entry.workspaceName, entry.sessionId, formatDetailTimestamp(entry.createdAt)]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>{entry.textPreview}</small>
                </button>
              ))}
              {selectedMemoryEntry ? (
                <div className="gateway-detail-inspector">
                  <h2>Memory entry</h2>
                  <KeyValue
                    label="Scope"
                    value={selectedMemoryEntry.scope === 'session' ? 'Session' : 'Workspace'}
                  />
                  <KeyValue
                    label="Workspace"
                    value={selectedMemoryEntry.workspaceName ?? 'Unassigned'}
                  />
                  <KeyValue
                    label="Session"
                    value={selectedMemoryEntry.sessionId ?? 'Workspace-scoped'}
                  />
                  <KeyValue
                    label="Tags"
                    value={
                      selectedMemoryEntry.tags.length > 0
                        ? selectedMemoryEntry.tags.join(', ')
                        : 'No tags'
                    }
                  />
                  <KeyValue
                    label="Stored"
                    value={formatDetailTimestamp(selectedMemoryEntry.createdAt)}
                  />
                  <KeyValue label="Preview" value={selectedMemoryEntry.textPreview} />
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Recent usage</h2>
          {detail.usageEntries.length === 0 ? (
            <p>No usage ledger entries projected yet.</p>
          ) : (
            <>
              {detail.usageEntries.slice(0, 5).map((entry) => (
                <button
                  className={`gateway-detail-row ${selectedUsageEntry?.entryId === entry.entryId ? 'gateway-detail-row-active' : ''}`}
                  key={entry.entryId}
                  onClick={() => setSelectedUsageEntryId(entry.entryId)}
                  type="button"
                >
                  <strong>{entry.providerLabel ?? entry.providerId ?? 'Provider pending'}</strong>
                  <small>
                    {[entry.modelId, entry.agentName, formatDetailTimestamp(entry.createdAt)]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>
                    {[
                      typeof entry.totalTokens === 'number'
                        ? `${entry.totalTokens.toLocaleString()} tokens`
                        : undefined,
                      typeof entry.estimatedCostUsd === 'number' && entry.estimatedCostUsd > 0
                        ? `est $${entry.estimatedCostUsd.toFixed(3)}`
                        : undefined,
                      entry.workspaceName,
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                </button>
              ))}
              {selectedUsageEntry ? (
                <div className="gateway-detail-inspector">
                  <h2>Usage entry</h2>
                  <KeyValue label="Provider" value={selectedUsageEntry.providerLabel ?? selectedUsageEntry.providerId ?? 'Pending'} />
                  <KeyValue label="Model" value={selectedUsageEntry.modelId ?? 'Unknown'} />
                  <KeyValue label="Agent" value={selectedUsageEntry.agentName ?? 'Unassigned'} />
                  <KeyValue label="Workspace" value={selectedUsageEntry.workspaceName ?? 'Unassigned'} />
                  <KeyValue
                    label="Tokens"
                    value={
                      typeof selectedUsageEntry.totalTokens === 'number'
                        ? selectedUsageEntry.totalTokens.toLocaleString()
                        : 'Unknown'
                    }
                  />
                  <KeyValue
                    label="Estimated cost"
                    value={
                      typeof selectedUsageEntry.estimatedCostUsd === 'number'
                        ? `$${selectedUsageEntry.estimatedCostUsd.toFixed(3)}`
                        : 'Not projected'
                    }
                  />
                  <KeyValue label="Run" value={selectedUsageEntry.runId} />
                  <KeyValue label="Session" value={selectedUsageEntry.sessionId} />
                  <KeyValue label="Recorded" value={formatDetailTimestamp(selectedUsageEntry.createdAt)} />
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => onOpenUsageTrace(selectedUsageEntry)}
                    >
                      Open usage trace
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Recent artifacts</h2>
          {detail.artifacts.length === 0 ? (
            <p>No artifacts projected yet.</p>
          ) : (
            <>
              {detail.artifacts.slice(0, 5).map((artifact) => (
                <button
                  className={`gateway-detail-row ${selectedArtifact?.artifactId === artifact.artifactId ? 'gateway-detail-row-active' : ''}`}
                  key={artifact.artifactId}
                  onClick={() => setSelectedArtifactId(artifact.artifactId)}
                  type="button"
                >
                  <strong>{artifact.label ?? artifact.kind}</strong>
                  <small>
                    {[artifact.kind, artifact.mediaType, artifact.agentName, formatDetailTimestamp(artifact.createdAt)]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>
                    {[
                      typeof artifact.sizeBytes === 'number'
                        ? formatByteSize(artifact.sizeBytes)
                        : undefined,
                      artifact.workspaceName,
                      artifact.runId,
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                </button>
              ))}
              {selectedArtifact ? (
                <div className="gateway-detail-inspector">
                  <h2>Artifact detail</h2>
                  <KeyValue label="Label" value={selectedArtifact.label ?? selectedArtifact.kind} />
                  <KeyValue label="Kind" value={selectedArtifact.kind} />
                  <KeyValue label="Media type" value={selectedArtifact.mediaType ?? 'Unknown'} />
                  <KeyValue
                    label="Size"
                    value={
                      typeof selectedArtifact.sizeBytes === 'number'
                        ? formatByteSize(selectedArtifact.sizeBytes)
                        : 'Unknown'
                    }
                  />
                  <KeyValue label="Agent" value={selectedArtifact.agentName ?? 'Unassigned'} />
                  <KeyValue label="Workspace" value={selectedArtifact.workspaceName ?? 'Unassigned'} />
                  <KeyValue label="Run" value={selectedArtifact.runId} />
                  <KeyValue label="Session" value={selectedArtifact.sessionId} />
                  <KeyValue label="Recorded" value={formatDetailTimestamp(selectedArtifact.createdAt)} />
                  {selectedArtifactPresentation ? (
                    <KeyValue label="Preview" value={selectedArtifactPresentation.hint} />
                  ) : null}
                  {selectedArtifactPresentation?.previewKind === 'image' && selectedArtifactUrl ? (
                    <img
                      className="gateway-artifact-preview"
                      src={selectedArtifactUrl}
                      alt={selectedArtifact.label ?? selectedArtifact.kind}
                    />
                  ) : null}
                  {selectedArtifactPresentation?.previewKind === 'text' && selectedArtifactUrl ? (
                    <iframe
                      className="gateway-artifact-preview-frame"
                      src={selectedArtifactUrl}
                      title={selectedArtifact.label ?? selectedArtifact.kind}
                    />
                  ) : null}
                  {selectedArtifactPresentation?.previewKind === 'pdf' && selectedArtifactUrl ? (
                    <iframe
                      className="gateway-artifact-preview-frame"
                      src={selectedArtifactUrl}
                      title={selectedArtifact.label ?? selectedArtifact.kind}
                    />
                  ) : null}
                  {selectedArtifactPresentation?.previewKind === 'audio' && selectedArtifactUrl ? (
                    <audio
                      className="gateway-artifact-media-player"
                      controls
                      src={selectedArtifactUrl}
                    />
                  ) : null}
                  {selectedArtifactPresentation?.previewKind === 'video' && selectedArtifactUrl ? (
                    <video
                      className="gateway-artifact-media-player"
                      controls
                      src={selectedArtifactUrl}
                    />
                  ) : null}
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => onOpenArtifactTrace(selectedArtifact)}
                    >
                      Open artifact trace
                    </button>
                    {selectedArtifactUrl ? (
                      <a
                        className="secondary-button gateway-link-button"
                        href={selectedArtifactUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selectedArtifactPresentation?.previewLabel ?? 'Open artifact'}
                      </a>
                    ) : null}
                    {selectedArtifactDownloadUrl ? (
                      <a
                        className="ghost-button gateway-link-button"
                        href={selectedArtifactDownloadUrl}
                      >
                        Download artifact
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Recent tool calls</h2>
          {detail.toolCalls.length === 0 ? (
            <p>No tool-call read models projected yet.</p>
          ) : (
            <>
              {detail.toolCalls.slice(0, 6).map((toolCall) => (
                <div className="gateway-detail-row" key={toolCall.toolCallId}>
                  <strong>{toolCall.toolName}</strong>
                  <small>
                    {[toolCall.status, toolCall.agentName, toolCall.workspaceName]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>
                    {[toolCall.runId, formatDetailTimestamp(toolCall.updatedAt)]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                </div>
              ))}
              <div className="gateway-detail-summary">
                <span>{detail.deploymentRunCount} deployment run{detail.deploymentRunCount === 1 ? '' : 's'}</span>
                <span>{detail.cellLeaseCount} cell lease{detail.cellLeaseCount === 1 ? '' : 's'}</span>
                <span>{detail.cellSnapshotCount} cell snapshot{detail.cellSnapshotCount === 1 ? '' : 's'}</span>
              </div>
            </>
          )}
        </div>
        <div className="gateway-detail-section gateway-runlog-detail-section">
          <h2>RunLog detail</h2>
          {detail.runLogRuns.length === 0 ? (
            <p>No RunLog run summaries projected yet.</p>
          ) : (
            <>
              {detail.runLogRuns.slice(0, 5).map((run) => (
                <button
                  className={`gateway-detail-row ${selectedRunLogRun?.runId === run.runId ? 'gateway-detail-row-active' : ''}`}
                  key={run.runId}
                  onClick={() => setSelectedRunLogRunId(run.runId)}
                  type="button"
                >
                  <strong>{run.agentName ?? run.runId}</strong>
                  <small>
                    {[run.status, run.providerLabel ?? run.providerId, run.modelId, formatDetailTimestamp(run.updatedAt)]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>
                    {[
                      `${run.eventCount} events`,
                      `${run.checkpointCount} checkpoints`,
                      `${run.policyDecisionCount} policy decisions`,
                      `${run.errorCount} errors`,
                      `${run.artifactCount} artifacts`,
                    ].join(' | ')}
                  </small>
                </button>
              ))}
              {selectedRunLogRun ? (
                <div className="gateway-detail-inspector">
                  <h2>RunLog run</h2>
                  <KeyValue label="Run" value={selectedRunLogRun.runId} />
                  <KeyValue label="Session" value={selectedRunLogRun.sessionId} />
                  <KeyValue label="Status" value={selectedRunLogRun.status} />
                  <KeyValue label="Agent" value={selectedRunLogRun.agentName ?? 'Unassigned'} />
                  <KeyValue label="Workspace" value={selectedRunLogRun.workspaceName ?? 'Unassigned'} />
                  <KeyValue label="Provider" value={selectedRunLogRun.providerLabel ?? selectedRunLogRun.providerId ?? 'Pending'} />
                  <KeyValue label="Model" value={selectedRunLogRun.modelId ?? 'Unknown'} />
                  <KeyValue label="Events" value={String(selectedRunLogRun.eventCount)} />
                  <KeyValue label="Pending approvals" value={String(selectedRunLogRun.pendingApprovalCount)} />
                  <KeyValue label="Approval decisions" value={String(selectedRunLogRun.approvalDecisionCount)} />
                  <KeyValue label="Tool calls" value={String(selectedRunLogRun.toolCallCount)} />
                  <KeyValue label="Artifacts" value={String(selectedRunLogRun.artifactCount)} />
                  <KeyValue label="Updated" value={formatDetailTimestamp(selectedRunLogRun.updatedAt)} />
                  <div className="gateway-runlog-inspector-grid">
                    <div>
                      <h3>Checkpoints</h3>
                      {selectedRunLogRun.checkpoints.length === 0 ? (
                        <small>No checkpoints projected.</small>
                      ) : (
                        selectedRunLogRun.checkpoints.slice(0, 5).map((checkpoint) => (
                          <small key={`${checkpoint.eventId}:${checkpoint.seq}`}>
                            #{checkpoint.seq} {checkpoint.kind ?? 'checkpoint'} ({checkpoint.eventId})
                          </small>
                        ))
                      )}
                    </div>
                    <div>
                      <h3>Policy decisions</h3>
                      {selectedRunLogRun.policyDecisions.length === 0 ? (
                        <small>No policy decisions projected.</small>
                      ) : (
                        selectedRunLogRun.policyDecisions.slice(0, 5).map((decision) => (
                          <small key={decision.decisionId}>
                            {decision.state}: {decision.surface}/{decision.targetKey}
                          </small>
                        ))
                      )}
                    </div>
                    <div>
                      <h3>Errors</h3>
                      {selectedRunLogRun.errors.length === 0 ? (
                        <small>No errors projected.</small>
                      ) : (
                        selectedRunLogRun.errors.slice(0, 5).map((error) => (
                          <small key={`${error.eventId}:${error.seq}`}>
                            #{error.seq} {error.type}{error.message ? `: ${error.message}` : ''}
                          </small>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Live local inventory</h2>
          {liveInventory?.error ? (
            <p>{liveInventory.error}</p>
          ) : liveInventory?.loading ? (
            <p>Loading live local inventory…</p>
          ) : (
            <>
              <div className="gateway-detail-summary">
                <span>{liveInventory?.toolCalls.length ?? 0} direct tool call{(liveInventory?.toolCalls.length ?? 0) === 1 ? '' : 's'}</span>
                <span>{liveInventory?.deploymentTargets.length ?? 0} direct deployment target{(liveInventory?.deploymentTargets.length ?? 0) === 1 ? '' : 's'}</span>
                <span>{liveInventory?.deploymentRuns.length ?? 0} direct deployment run{(liveInventory?.deploymentRuns.length ?? 0) === 1 ? '' : 's'}</span>
                <span>{liveInventory?.cells.length ?? 0} direct cell{(liveInventory?.cells.length ?? 0) === 1 ? '' : 's'}</span>
              </div>
              {liveInventory && (
                <>
                  <KeyValue
                    label="Backend default"
                    value={
                      liveInventory.executionBackendStatus?.backends.find(
                        (backend) => backend.key === liveInventory.executionBackendStatus?.defaultBackend,
                      )?.label
                      ?? liveInventory.executionBackends?.backends.find(
                        (backend) => backend.key === liveInventory.executionBackends?.defaultBackend,
                      )?.label
                      ?? 'Unknown'
                    }
                  />
                  <KeyValue
                    label="Backend status"
                    value={
                      (liveInventory.executionBackendStatus?.backends ?? liveInventory.executionBackends?.backends)
                        ?.map(
                          (backend) =>
                            `${backend.key}:${backend.available ? 'ready' : 'blocked'}${backend.unsafe ? ':unsafe' : ''}`,
                        )
                        .join(' | ') ?? 'Unknown'
                    }
                  />
                  <KeyValue
                    label="Cell leases"
                    value={
                      liveInventory.cellStatus
                        ? [
                            `active:${liveInventory.cellStatus.leases.active}`,
                            `released:${liveInventory.cellStatus.leases.released}`,
                            `expired:${liveInventory.cellStatus.leases.expired}`,
                          ].join(' | ')
                        : 'Unknown'
                    }
                  />
                  <KeyValue
                    label="Cell capacity"
                    value={
                      liveInventory.cellStatus?.capacityEnforced
                        ? `max ${liveInventory.cellStatus.maxActiveLeasesPerCell} active per cell`
                        : 'Not capped'
                    }
                  />
                  <KeyValue
                    label="Last capacity block"
                    value={
                      liveInventory.cellStatus
                      && 'lastCapacityBlock' in liveInventory.cellStatus
                      && liveInventory.cellStatus.lastCapacityBlock
                        ? [
                            liveInventory.cellStatus.lastCapacityBlock.cellId,
                            `${liveInventory.cellStatus.lastCapacityBlock.activeLeases}/${liveInventory.cellStatus.lastCapacityBlock.maxActiveLeases}`,
                            liveInventory.cellStatus.lastCapacityBlock.requestedComputerId,
                          ].join(' | ')
                        : 'None projected'
                    }
                  />
                  <KeyValue
                    label="Isolation note"
                    value={
                      liveInventory.executionBackends?.backends.find(
                        (backend) => backend.key === 'wsl',
                      )?.reason ?? 'No isolated backend issue reported.'
                    }
                  />
                  <KeyValue
                    label="Backend observations"
                    value={
                      liveInventory.executionBackendStatus?.backends
                        .map((backend) =>
                          `${backend.key}:cells ${backend.observedCells} active ${backend.activeLeases}`,
                        )
                        .join(' | ') ?? 'Unknown'
                    }
                  />
                  <KeyValue
                    label="Latest deployment target"
                    value={
                      liveInventory.deploymentTargets[0]
                        ? [
                            liveInventory.deploymentTargets[0].label,
                            liveInventory.deploymentTargets[0].kind,
                            liveInventory.deploymentTargets[0].executionMode,
                          ].join(' | ')
                        : 'None projected'
                    }
                  />
                  <KeyValue
                    label="Latest cell snapshot"
                    value={liveInventory.cellSnapshots[0]?.label ?? 'None projected'}
                  />
                  <KeyValue
                    label="Latest cell backend"
                    value={
                      liveInventory.cells[0]?.backend
                        ? [
                            liveInventory.cells[0].backend?.backendLabel
                              ?? liveInventory.cells[0].backend?.backend
                              ?? 'unknown',
                            liveInventory.cells[0].backend?.backendCapabilities?.isolationStrength
                              ?? 'unknown boundary',
                            liveInventory.cells[0].backend?.backendCapabilities?.networkPolicy
                              ?? 'unknown network',
                            liveInventory.cells[0].backend?.backendUnsafe ? 'unsafe' : 'isolated-capable',
                          ].join(' | ')
                        : 'None projected'
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Recent activity</h2>
          {detail.auditEvents.length === 0 ? (
            <p>No lifecycle activity projected yet.</p>
          ) : (
            detail.auditEvents.slice(0, 6).map((event) => (
              <div className="gateway-detail-row" key={event.eventId}>
                <strong>{formatGatewayAuditAction(event.action)}</strong>
                <small>
                  {[event.workspaceName, event.runId, event.sessionId]
                    .filter((value): value is string => Boolean(value))
                    .join(' | ')}
                </small>
                <small>
                  {[event.actor, formatDetailTimestamp(event.createdAt)]
                    .filter((value): value is string => Boolean(value))
                    .join(' | ')}
                </small>
              </div>
            ))
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Recent approvals</h2>
          {detail.approvals.length === 0 ? (
            <p>No approval metadata projected yet.</p>
          ) : (
            <>
              {detail.approvals.slice(0, 6).map((approval) => (
                <button
                  className={`gateway-detail-row ${selectedApproval?.approvalId === approval.approvalId ? 'gateway-detail-row-active' : ''}`}
                  key={approval.approvalId}
                  onClick={() => setSelectedApprovalId(approval.approvalId)}
                  type="button"
                >
                  <strong>{approval.targetKey ?? approval.status}</strong>
                  <small>
                    {[approval.status, approval.agentName, approval.workspaceName]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                  <small>
                    {[
                      approval.runId,
                      approval.resolvedAt
                        ? `resolved ${formatDetailTimestamp(approval.resolvedAt)}`
                        : `requested ${formatDetailTimestamp(approval.requestedAt)}`,
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join(' | ')}
                  </small>
                </button>
              ))}
              {selectedApproval ? (
                <div className="gateway-detail-inspector">
                  <h2>Approval detail</h2>
                  <KeyValue label="Target" value={selectedApproval.targetKey ?? selectedApproval.status} />
                  <KeyValue label="Status" value={selectedApproval.status} />
                  <KeyValue label="Agent" value={selectedApproval.agentName ?? 'Unassigned'} />
                  <KeyValue label="Workspace" value={selectedApproval.workspaceName ?? 'Unassigned'} />
                  <KeyValue label="Run" value={selectedApproval.runId} />
                  <KeyValue label="Session" value={selectedApproval.sessionId} />
                  <KeyValue label="Requested" value={formatDetailTimestamp(selectedApproval.requestedAt)} />
                  <KeyValue
                    label="Resolved"
                    value={
                      selectedApproval.resolvedAt
                        ? formatDetailTimestamp(selectedApproval.resolvedAt)
                        : 'Pending'
                    }
                  />
                  <div className="button-row">
                    {onResolveApproval && selectedApproval.status === 'pending' ? (
                      <>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => onResolveApproval(selectedApproval, 'approved')}
                          disabled={approvalActionBusy}
                        >
                          Approve
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => onResolveApproval(selectedApproval, 'denied')}
                          disabled={approvalActionBusy}
                        >
                          Deny
                        </button>
                      </>
                    ) : null}
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => onOpenApprovalTrace(selectedApproval)}
                    >
                      Open approval trace
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="gateway-detail-section">
          <h2>Linked sessions</h2>
          {detail.sessions.length === 0 ? (
            <p>No linked sessions projected yet.</p>
          ) : (
            detail.sessions.slice(0, 6).map((session) => (
              <div className="gateway-detail-row" key={session.sessionId}>
                <strong>{session.sessionId}</strong>
                <small>
                  {[session.status, session.workspaceName]
                    .filter((value): value is string => Boolean(value))
                    .join(' | ')}
                </small>
                <small>
                  {[
                    session.latestRunId,
                    session.latestRunStatus,
                    formatDetailTimestamp(session.updatedAt),
                  ]
                    .filter((value): value is string => Boolean(value))
                    .join(' | ')}
                </small>
                <div className="button-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => onOpenSessionTrace(session)}
                  >
                    Open session trace
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function formatGatewayAuditAction(action: string): string {
  return action
    .split('.')
    .map((segment) => {
      if (!segment) return segment
      return segment[0]!.toUpperCase() + segment.slice(1)
    })
    .join(' ')
}

function NewClient({
  onCreate,
  onCancel,
  existingClient,
  localGatewayMode = false,
}: {
  onCreate: (client: Client) => void
  onCancel: () => void
  existingClient?: Client
  localGatewayMode?: boolean
}) {
  const isEditing = Boolean(existingClient)
  const [name, setName] = useState(existingClient?.name ?? 'Northline Dental')
  const [contact, setContact] = useState(existingClient?.contact ?? 'Austin (555) 555-1212')
  const [workspaceName, setWorkspaceName] = useState(
    existingClient?.workspaceName ?? `${existingClient?.name ?? 'Northline Dental'} Workspace`,
  )
  const [workspace, setWorkspace] = useState(
    existingClient?.workspace ?? 'E:\\Mainspring\\workspaces\\northline-dental',
  )
  const [billingLabel, setBillingLabel] = useState(
    existingClient?.billingLabel ?? 'retainer - local records only',
  )

  return (
    <section className="sheet narrow">
      <h1>{isEditing ? 'Edit client' : 'New client'}</h1>
      <p>Clients own workspaces, agents, sessions, and usage records.</p>
      <label>
        Client name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Owner contact
        <small>Optional local note. No email required.</small>
        <input value={contact} onChange={(event) => setContact(event.target.value)} />
      </label>
      <label>
        Workspace name
        <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
      </label>
      <label>
        {localGatewayMode && isEditing ? 'Workspace folder override' : 'Workspace folder'}
        {localGatewayMode && isEditing ? (
          <small>Optional. Existing workspace roots stay server-side unless you enter a new path.</small>
        ) : null}
        <div className="inline-field">
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
          <button className="secondary-button" type="button">
            Browse
          </button>
        </div>
      </label>
      <label>
        Billing label
        <small>{localGatewayMode ? 'Optional local billing label. Usage and budgets come from the local gateway.' : 'Prototype local note. No billing ledger exists.'}</small>
        <input value={billingLabel} onChange={(event) => setBillingLabel(event.target.value)} />
      </label>
      <div className="preview-block">
        <h2>Permissions preview</h2>
        <p>Default scope for this client. You can adjust later.</p>
        <KeyValue label="Workspace" value={workspaceName} />
        <KeyValue label="Workspace root" value={workspace || 'Not shown in browser'} />
        <KeyValue label="Secrets scope" value="Client-scoped secrets only" />
        <KeyValue
          label="Usage ledger"
          value={localGatewayMode ? 'Local gateway usage ledger and budgets' : 'Not implemented; local note only'}
        />
      </div>
      <div className="button-row">
        <button
          className="primary-button"
          onClick={() =>
            onCreate({
              id: existingClient?.id ?? makeId('client'),
              name,
              contact,
              workspace,
              workspaceName,
              billingLabel,
            })
          }
        >
          {isEditing ? 'Save client' : 'Create client'}
        </button>
        <button className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function NewWorkspace({
  clientName,
  initialName,
  initialRoot,
  onCreate,
  onCancel,
}: {
  clientName: string
  initialName: string
  initialRoot: string
  onCreate: (workspace: { name: string; root: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [root, setRoot] = useState(initialRoot)

  return (
    <section className="sheet narrow">
      <h1>New workspace</h1>
      <p>{clientName} can have more than one workspace, each with its own runtime session trail.</p>
      <label>
        Workspace name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Workspace folder
        <div className="inline-field">
          <input value={root} onChange={(event) => setRoot(event.target.value)} />
          <button className="secondary-button" type="button">
            Browse
          </button>
        </div>
      </label>
      <div className="preview-block">
        <h2>Creation preview</h2>
        <p>A new workspace record and linked runtime session will be created through the local gateway.</p>
        <KeyValue label="Client" value={clientName} />
        <KeyValue label="Workspace" value={name} />
        <KeyValue label="Workspace root" value={root} />
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={() => onCreate({ name, root })}>
          Create workspace
        </button>
        <button className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

export function ProviderProfileForm({
  existingProfile,
  onCancel,
  onSave,
}: {
  existingProfile?: GatewayProviderProfileDraft
  onCancel: () => void
  onSave: (profile: GatewayProviderProfileDraft) => void
}) {
  const [providerId, setProviderId] = useState(existingProfile?.providerId ?? 'openrouter')
  const [label, setLabel] = useState(existingProfile?.label ?? 'OpenRouter')
  const [defaultModelId, setDefaultModelId] = useState(existingProfile?.defaultModelId ?? '')
  const [secretRef, setSecretRef] = useState(existingProfile?.secretRef ?? '')
  const [secretValue, setSecretValue] = useState('')
  const editMode = Boolean(existingProfile?.profileId)
  const existingManagedSecret =
    editMode && existingProfile?.credentialState === 'configured' && !existingProfile?.secretRef

  return (
    <section className="sheet narrow">
      <p className="breadcrumb">Dashboard / Provider profile</p>
      <h1>{editMode ? 'Edit provider profile' : 'New provider profile'}</h1>
      <p>
        Credentials stay on the local gateway. Use an env ref, or write a managed secret once and
        let the gateway keep only the encrypted local copy.
      </p>
      <label>
        Provider ID
        <input value={providerId} onChange={(event) => setProviderId(event.target.value)} />
      </label>
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label>
        Default model ID
        <input
          value={defaultModelId}
          onChange={(event) => setDefaultModelId(event.target.value)}
          placeholder="openrouter/free"
        />
      </label>
      <label>
        Secret ref
        <small>
          {editMode
            ? 'Optional ref replacement. Leave blank to keep the current gateway-side secret source.'
            : 'Optional when a managed secret value is supplied below.'}
        </small>
        <input
          value={secretRef}
          onChange={(event) => setSecretRef(event.target.value)}
          placeholder="env:OPENROUTER_API_KEY"
        />
      </label>
      <label>
        Managed secret
        <small>
          {existingManagedSecret
            ? 'Write-only rotation field. Leave blank to keep the current encrypted local secret.'
            : 'Write-only. The browser submits this once and cannot read it back.'}
        </small>
        <input
          type="password"
          value={secretValue}
          onChange={(event) => setSecretValue(event.target.value)}
          placeholder={editMode ? 'Replace managed secret' : 'Paste provider API key'}
        />
      </label>
      <div className="preview-block">
        <h2>Gateway handling</h2>
        <KeyValue label="Provider" value={providerId || 'Not set'} />
        <KeyValue label="Label" value={label || 'Not set'} />
        <KeyValue label="Model" value={defaultModelId || 'No default'} />
        <KeyValue
          label="Secret transport"
          value={
            secretValue.trim()
              ? 'Write-only secret to encrypted local gateway storage'
              : secretRef.trim()
                ? 'Opaque gateway secret reference'
                : existingManagedSecret
                  ? 'Keep current encrypted local gateway secret'
                  : 'Missing'
          }
        />
      </div>
      <small className="gateway-action-hint">
        The gateway snapshot never returns managed secret values and does not echo saved refs back
        into browser state.
      </small>
      <div className="button-row">
        <button
          className="primary-button"
          onClick={() =>
            onSave({
              profileId: existingProfile?.profileId,
              providerId: providerId.trim(),
              label: label.trim(),
              defaultModelId: defaultModelId.trim(),
              secretRef: secretRef.trim(),
              ...(secretValue.trim() ? { secretValue: secretValue.trim() } : {}),
              credentialState: existingProfile?.credentialState,
              status: existingProfile?.status,
            })
          }
        >
          Save provider
        </button>
        <button className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function formatDetailTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatByteSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
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
  providerState: DashboardViewModel['providerState']
  onSave: (agent: Agent) => void
  onBack: () => void
}) {
  const isEditing = Boolean(existingAgent)
  const [name, setName] = useState(existingAgent?.name ?? 'Front desk assistant')
  const [outcome, setOutcome] = useState(
    existingAgent?.outcome ??
      'Answer intake questions, draft follow-ups, and prepare appointment notes.',
  )
  const [instructions, setInstructions] = useState(
    existingAgent?.instructions ??
      'Stay plain, careful, and friendly. Ask before writing files, sending messages, or using paid tools.',
  )
  const [voice, setVoice] = useState(existingAgent?.voice ?? 'Plain, careful, friendly')
  const [model, setModel] = useState(existingAgent?.model ?? 'Saved model: default chat')
  const [approvalMode, setApprovalMode] = useState<Agent['approvalMode']>(
    existingAgent?.approvalMode ?? 'Balanced',
  )
  const providerReadiness =
    providerState === 'ready'
      ? 'set'
      : providerState === 'unavailable'
        ? 'unavailable'
        : providerState === 'unverified'
          ? 'unverified'
          : 'missing'

  const readiness = [
    ['Provider auth', providerReadiness],
    ['Model', model ? 'set' : 'missing'],
    ['Workspace', client.workspace ? 'set' : 'missing'],
    ['Prompt', instructions ? 'set' : 'missing'],
    ['Policy', approvalMode ? 'set' : 'missing'],
  ]

  return (
    <section className="spec-layout">
      <div className="spec-main">
        <p className="breadcrumb">
          {client.name} / {isEditing ? existingAgent?.name : 'New agent'}
        </p>
        <h1>{isEditing ? 'Edit agent' : 'Agent spec'}</h1>
        <p>Define what this agent is allowed to do before tools are enabled.</p>
        <FormRow label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </FormRow>
        <FormRow label="Outcome">
          <textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} />
        </FormRow>
        <FormRow label="Instructions">
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </FormRow>
        <FormRow label="Voice">
          <select value={voice} onChange={(event) => setVoice(event.target.value)}>
            <option>Plain, careful, friendly</option>
            <option>Direct, concise, technical</option>
            <option>Warm, patient, client-ready</option>
          </select>
        </FormRow>
        <FormRow label="Model">
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option>Saved model: default chat</option>
            <option>Saved model: coding</option>
            <option>Local fallback</option>
          </select>
        </FormRow>
        <FormRow label="Workspace access">
          <span>{client.workspace.split('\\').pop()} workspace</span>
        </FormRow>
        <FormRow label="Approval mode">
          <div className="segmented">
            {(['Ask first', 'Balanced', 'Autonomous'] as const).map((mode) => (
              <button
                key={mode}
                className={approvalMode === mode ? 'active' : ''}
                onClick={() => setApprovalMode(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </FormRow>
        <div className="button-row">
          <button
            className="primary-button"
            onClick={() =>
              onSave({
                id: existingAgent?.id ?? makeId('agent'),
                clientId: client.id,
                name,
                outcome,
                instructions,
                voice,
                model,
                approvalMode,
                skills: existingAgent?.skills ?? starterSkills,
              })
            }
          >
            Save agent
          </button>
          <button className="ghost-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
      <aside className="ready-panel">
        <h2>Ready when</h2>
        {readiness.map(([label, value]) => (
          <KeyValue key={label} label={label} value={value} />
        ))}
      </aside>
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
  providerState: DashboardViewModel['providerState']
  onSettings: () => void
  onBack: () => void
  onSave: (agent: Agent) => void
  onLaunch: () => void
}) {
  const [draft, setDraft] = useState(agent)
  const skillRows = Object.entries(draft.skills)

  function toggleSkill(name: string) {
    setDraft((current) => ({
      ...current,
      skills: { ...current.skills, [name]: !current.skills[name] },
    }))
  }

  return (
    <section className="wide-workspace">
      <p className="breadcrumb">
        {clientName} / {agent.name}
      </p>
      <div className="top-rule" />
      <h1>Skills and automations</h1>
      <p>Add only what the agent needs. Risky actions ask first.</p>
      <div className="two-column">
        <div>
          <h2>Skills</h2>
          {skillRows.map(([name, enabled]) => (
            <button className="data-row" key={name} onClick={() => toggleSkill(name)}>
              <span>{name}</span>
              <span>{enabled ? 'Enabled' : 'Off'}</span>
              <span>{name === 'File tools' ? 'Workspace only' : enabled ? 'Low' : 'Approval'}</span>
              <span className={`switch ${enabled ? 'on' : ''}`} />
            </button>
          ))}
        </div>
        <div>
          <h2>Automation draft</h2>
          <KeyValue label="Trigger" value="Manual draft only" action="Locked" />
          <KeyValue label="Schedule" value="Use local gateway cron controls" action="Runtime" />
          <KeyValue label="Budget cap" value="Policy draft only" action="Deferred" />
          <KeyValue label="Human checkpoint" value="Policy draft only" action="Deferred" />
          <div className="muted-table">
            <p>Prototype editor keeps examples here. Live cron schedules run through the local gateway.</p>
            <KeyValue label="Daily inbox draft" value="0 9 * * *" action="Disabled" />
            <KeyValue label="Weekly report" value="0 8 * * 1" action="Disabled" />
          </div>
        </div>
      </div>
      <footer className="bottom-action">
        <span>
          {providerReady
            ? 'Prototype trace available; no runtime run will start.'
            : providerState === 'unavailable'
              ? 'Provider reference is saved, but this local host cannot resolve it.'
              : providerState === 'unverified'
                ? 'Provider reference is saved, but auth is not verified in this prototype.'
              : 'Provider auth is prototype-only.'}
        </span>
        <div className="button-row">
          {!providerReady && (
            <button className="primary-button" onClick={onSettings}>
              Open settings
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => {
              onSave(draft)
              if (providerReady) onLaunch()
            }}
          >
            {providerReady ? 'Open sample trace' : 'Save draft'}
          </button>
          <button className="ghost-button" onClick={onBack}>
            Back
          </button>
        </div>
      </footer>
    </section>
  )
}

export function RunTrace({
  trace,
  selectedEvent,
  setSelectedEvent,
  onBack,
  actions = [],
}: {
  trace: RunTraceViewModel
  selectedEvent: number
  setSelectedEvent: (index: number) => void
  onBack: () => void
  actions?: Array<{ label: string; onClick: () => void; disabled?: boolean }>
}) {
  const safeIndex = Math.min(selectedEvent, Math.max(trace.events.length - 1, 0))
  const active = trace.events[safeIndex]

  return (
    <section className="trace-page">
      <p className="breadcrumb">
        {trace.clientName} / {trace.agentName} / Run
      </p>
      <h1>Run trace</h1>
      <p>{trace.intro}</p>
      <div className="trace-box">
        <div className="event-list">
          {trace.events.map((event, index) => (
            <button
              key={event.label}
              className={index === safeIndex ? 'event-row selected' : 'event-row'}
              onClick={() => setSelectedEvent(index)}
            >
              <span>{event.time}</span>
              <strong>{event.label}</strong>
            </button>
          ))}
        </div>
        <aside className="event-detail">
          <h2>{active.detail.Title}</h2>
          {Object.entries(active.detail)
            .filter(([label]) => label !== 'Title')
            .map(([label, value]) => (
              <KeyValue key={label} label={label} value={value} />
            ))}
          <button className="link-button">Copy event</button>
        </aside>
      </div>
      <footer className="trace-footer">
        {trace.footer.map((item) => (
          <span key={item}>{item}</span>
        ))}
        {actions.map((action) => (
          <button
            key={action.label}
            className="secondary-button"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
        <button className="ghost-button" onClick={onBack}>
          {trace.source === 'gateway-projection-preview' ? 'Back to dashboard' : 'Back to agent'}
        </button>
      </footer>
    </section>
  )
}

function SettingsDrawer({
  open,
  state,
  updateState,
  onClose,
}: {
  open: boolean
  state: ConsoleState
  updateState: (next: Partial<ConsoleState>) => void
  onClose: () => void
}) {
  const [editingProvider, setEditingProvider] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [editingModel, setEditingModel] = useState('')
  const [modelValue, setModelValue] = useState('')

  function saveProvider(providerName: string) {
    const suffix = keyValue.trim().slice(-4)
    updateState({
      providers: state.providers.map((provider) =>
        provider.provider === providerName
          ? {
              ...provider,
              status: 'Saved locally',
              maskedKey: suffix ? `key ending ${suffix}` : 'saved key',
            }
          : provider,
      ),
    })
    setEditingProvider('')
    setKeyValue('')
  }

  function saveModel(label: string) {
    updateState({ models: { ...state.models, [label]: modelValue || state.models[label] } })
    setEditingModel('')
    setModelValue('')
  }

  return (
    <aside className={`settings-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-head">
        <h1>Settings</h1>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <section>
        <h2>Provider auths</h2>
        <p>
          Prototype only. Do not paste real provider keys; this stores a masked suffix in
          browser localStorage and cannot authenticate providers.
        </p>
        {state.providers.map((provider) => (
          <div className="settings-row" key={provider.provider}>
            <span>{provider.provider}</span>
            <small>{provider.maskedKey ?? provider.status}</small>
            <button className="secondary-button" onClick={() => setEditingProvider(provider.provider)}>
              {provider.status === 'Saved locally' ? 'Edit' : 'Add key'}
            </button>
            {editingProvider === provider.provider && (
              <div className="drawer-editor">
                <input
                  autoFocus
                  placeholder={`${provider.provider} test suffix`}
                  value={keyValue}
                  onChange={(event) => setKeyValue(event.target.value)}
                />
                <button className="primary-button" onClick={() => saveProvider(provider.provider)}>
                  Save prototype status
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      <section>
        <h2>Saved models</h2>
        <p>Default models used across agents. Reuse anywhere.</p>
        {Object.entries(state.models).map(([label, value]) => (
          <div className="settings-row" key={label}>
            <span>{label}</span>
            <small>{value}</small>
            <button
              className="secondary-button"
              onClick={() => {
                setEditingModel(label)
                setModelValue(value)
              }}
            >
              Edit
            </button>
            {editingModel === label && (
              <div className="drawer-editor">
                <input value={modelValue} onChange={(event) => setModelValue(event.target.value)} />
                <button className="primary-button" onClick={() => saveModel(label)}>
                  Save model
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      <section>
        <h2>Agent presets</h2>
        <p>Reusable starting points for new agents.</p>
        {state.presets.map((preset) => (
          <div className="settings-row" key={preset}>
            <span>{preset}</span>
            <small>{presetDescription(preset)}</small>
            <button className="secondary-button">Edit preset</button>
          </div>
        ))}
      </section>
      <section>
        <h2>Local account</h2>
        <KeyValue label="User" value={state.account?.username ?? 'not created'} />
        <KeyValue label="Password" value="Prototype PBKDF2-SHA256 hash in localStorage" />
      </section>
    </aside>
  )
}

function presetDescription(preset: string) {
  if (preset === 'Support agent') return 'Answers questions and resolves issues.'
  if (preset === 'Coding agent') return 'Writes, reviews, and refactors code.'
  return 'General assistant for daily tasks.'
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}

function KeyValue({
  label,
  value,
  action,
}: {
  label: string
  value: string
  action?: string
}) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
      {action && <small>{action}</small>}
    </div>
  )
}
