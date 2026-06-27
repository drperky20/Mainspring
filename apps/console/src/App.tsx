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
import { createLocalGatewayClient } from './localGatewayClient'
import { localGatewayUrlFromEnv } from './localGatewayTransport'
import {
  createPrototypeRunTraceViewModel,
  gatewayProjectionToRunTraceViewModel,
  gatewayRunEventsToTraceViewModel,
  type RunTraceViewModel,
} from './runTraceViewModel'

type Screen = 'dashboard' | 'new-client' | 'agent-spec' | 'skills' | 'trace'

type Account = {
  username: string
  salt: string
  passwordHash: string
}

type Client = {
  id: string
  name: string
  contact: string
  workspace: string
  billingLabel: string
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

async function hashPassword(password: string, salt: string) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
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

export function App() {
  const [state, setState] = useState<ConsoleState>(() => loadState())
  const [unlocked, setUnlocked] = useState(false)
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(2)
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const [selectedPreviewClientId, setSelectedPreviewClientId] = useState<string>()
  const [gatewaySnapshot, setGatewaySnapshot] = useState<ConsoleGatewaySnapshot | null>(null)
  const [gatewayPrompt, setGatewayPrompt] = useState(
    'Review the workspace and propose the next operator action.',
  )
  const [gatewayTrace, setGatewayTrace] = useState<RunTraceViewModel>()
  const [gatewayError, setGatewayError] = useState('')
  const [gatewayBusy, setGatewayBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    saveState(state)
  }, [state])

  const bootstrapMode = useMemo(
    () => resolveAppDashboardBootstrapMode(globalThis.location?.search ?? ''),
    [],
  )
  const localGatewayMode = bootstrapMode === 'local-gateway-dev'
  const gatewayClient = useMemo(
    () => (localGatewayMode ? createLocalGatewayClient(localGatewayUrlFromEnv()) : null),
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
    if (!localGatewayMode || !gatewayClient) return
    let cancelled = false
    const loadSnapshot = async () => {
      try {
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
    const timer = globalThis.setInterval(() => void loadSnapshot(), 1500)
    return () => {
      cancelled = true
      globalThis.clearInterval(timer)
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
  const developmentFixturePreview =
    !localGatewayMode && dashboardBootstrap.source === 'gateway-snapshot'
  const activeClientId = developmentFixturePreview
    ? undefined
    : selectedClientId && state.clients.some((client) => client.id === selectedClientId)
      ? selectedClientId
      : state.clients[0]?.id
  const activeClient = activeClientId
    ? state.clients.find((client) => client.id === activeClientId)
    : undefined
  const activeAgent =
    activeClient && !developmentFixturePreview
      ? state.agents.find((agent) => agent.clientId === activeClient.id)
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
      'Local gateway dev mode. Runs, approvals, and traces come from the local gateway. Provider keys stay server-side.'
    : developmentFixturePreview
    ? 'Development fixture preview only. Clear ?mainspringConsoleSource=development-gateway-fixture to resume the prototype localStorage flow.'
    : notice

  async function openLocalGatewayTrace(clientId: string) {
    if (!gatewayClient || !gatewayReadModel || !gatewaySnapshot) return
    const projection = gatewayReadModel.projection
    const run = projection.activeRuns.find((candidate) => candidate.clientId === clientId)
    const client = projection.clients.find((candidate) => candidate.clientId === clientId)
    const clientName = run?.clientName ?? client?.name ?? 'Client'
    const agentName = run?.agentName ?? client?.primaryAgentName ?? 'Agent'
    setSelectedClientId(clientId)
    setSelectedEvent(0)
    setScreen('trace')
    if (!run) {
      setGatewayTrace(
        gatewayRunEventsToTraceViewModel({
          clientName,
          agentName,
          events: [],
          footer: ['Trace source: local gateway dev', 'No active run selected'],
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
            `Status: ${run.status}`,
            `Pending inbound: ${run.pendingInboundCount}`,
            `Pending approvals: ${run.needsApproval ? 1 : 0}`,
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
    const selected = selectedClientId ?? gatewayReadModel.projection.clients[0]?.clientId
    if (!selected) return
    const workspace = gatewaySnapshot.workspaces.find((candidate) => candidate.clientId === selected)
    const agent = gatewaySnapshot.agents.find(
      (candidate) => candidate.workspaceId && candidate.workspaceId === workspace?.workspaceId,
    )
    const providerProfile =
      gatewaySnapshot.providerProfiles.find((candidate) => candidate.status === 'active') ??
      gatewaySnapshot.providerProfiles[0]
    const session = gatewaySnapshot.sessions[0]
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
        ...(workspace ? { workspaceId: workspace.workspaceId } : {}),
        ...(agent ? { agentId: agent.agentId } : {}),
        ...(providerProfile ? { providerProfileId: providerProfile.profileId } : {}),
      })
      setGatewayError('')
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to start gateway run.')
    } finally {
      setGatewayBusy(false)
    }
  }

  async function resolveLocalGatewayApproval(decision: 'approved' | 'denied') {
    if (!gatewayClient || !gatewayReadModel) return
    const selected = selectedClientId ?? gatewayReadModel.projection.clients[0]?.clientId
    const run = gatewayReadModel.projection.activeRuns.find((candidate) => candidate.clientId === selected)
    const approval = gatewayReadModel.projection.pendingApprovals.find(
      (candidate) => candidate.runId === run?.runId,
    )
    if (!run || !approval) return
    setGatewayBusy(true)
    try {
      await gatewayClient.resolveApproval({
        approvalId: approval.approvalId,
        sessionId: approval.sessionId,
        runId: approval.runId,
        decision,
        reason: `Resolved through local gateway dev mode: ${decision}`,
      })
      setGatewayError('')
      await openLocalGatewayTrace(selected!)
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Failed to resolve approval.')
    } finally {
      setGatewayBusy(false)
    }
  }

  function updateState(next: Partial<ConsoleState>) {
    setState((current) => ({ ...current, ...next }))
  }

  if (!state.account || !unlocked) {
    return (
      <Shell
        username={state.lastUser}
        onSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        state={state}
        updateState={updateState}
        closeSettings={() => setSettingsOpen(false)}
      >
        <AuthScreen
          account={state.account}
          lastUser={state.lastUser}
          onCreate={async (username, password) => {
            const salt = makeSalt()
            const passwordHash = await hashPassword(password, salt)
            updateState({
              account: { username, salt, passwordHash },
              lastUser: username,
            })
            setUnlocked(true)
          }}
          onUnlock={async (password) => {
            if (!state.account) return
            const hash = await hashPassword(password, state.account.salt)
            if (hash === state.account.passwordHash) {
              updateState({ lastUser: state.account.username })
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
      username={state.account.username}
      onSettings={() => setSettingsOpen(true)}
      settingsOpen={settingsOpen}
      state={state}
      updateState={updateState}
      closeSettings={() => setSettingsOpen(false)}
    >
      {screen === 'dashboard' && (
        <Dashboard
          viewModel={dashboardViewModel}
          onNewClient={() => {
            if (localGatewayMode) {
              void startLocalGatewayRun()
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
                ? 'Local gateway mode: start a run, open a client trace, and resolve approvals without exposing provider keys to the browser.'
                : 'Prototype flow: create client, write agent spec, enable only needed skills, mark provider status, open the sample trace.',
            )
          }
          primaryActionLabel={localGatewayMode ? 'Start run' : 'New client'}
          controlPanel={
            localGatewayMode ? (
              <div className="gateway-composer">
                <input
                  value={gatewayPrompt}
                  onChange={(event) => setGatewayPrompt(event.target.value)}
                  placeholder="Prompt for the local gateway run"
                />
                <small>
                  Source: local gateway dev at {localGatewayUrlFromEnv()}
                  {gatewayBusy ? ' | working' : ''}
                </small>
              </div>
            ) : undefined
          }
          notice={dashboardNotice}
        />
      )}
      {screen === 'new-client' && (
        <NewClient
          onCancel={() => setScreen('dashboard')}
          onCreate={(client) => {
            setSelectedClientId(client.id)
            updateState({ clients: [client, ...state.clients] })
            setScreen('agent-spec')
          }}
        />
      )}
      {screen === 'agent-spec' && activeClient && (
        <AgentSpec
          client={activeClient}
          existingAgent={activeAgent}
          providerState={providerState}
          onBack={() => setScreen(activeAgent ? 'skills' : 'dashboard')}
          onSave={(agent) => {
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
            localGatewayMode && gatewayReadModel
              ? gatewayReadModel.projection.pendingApprovals.some(
                  (approval) =>
                    approval.clientId === selectedClientId ||
                    approval.runId
                      === gatewayReadModel.projection.activeRuns.find(
                        (run) => run.clientId === selectedClientId,
                      )?.runId,
                )
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
}: {
  children: React.ReactNode
  username?: string
  onSettings: () => void
  settingsOpen: boolean
  state: ConsoleState
  updateState: (next: Partial<ConsoleState>) => void
  closeSettings: () => void
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Mainspring home">
          <span className="brand-mark">ms</span>
          <span>Mainspring</span>
        </div>
        <nav className="top-actions" aria-label="Account">
          <button className="text-button" onClick={onSettings}>
            Settings
          </button>
          <span className="divider" />
          <span className="muted">{username ?? 'local user'}</span>
        </nav>
      </header>
      <div className="prototype-banner">
        Prototype console: drafts and masked auth status use browser localStorage; runtime runs,
        approvals, usage, and traces are not live yet.
      </div>
      <main>{children}</main>
      <SettingsDrawer
        open={settingsOpen}
        state={state}
        updateState={updateState}
        onClose={closeSettings}
      />
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
        <div className="rule-row">Prototype password hash in localStorage</div>
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

function NewClient({
  onCreate,
  onCancel,
}: {
  onCreate: (client: Client) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('Northline Dental')
  const [contact, setContact] = useState('Austin (555) 555-1212')
  const [workspace, setWorkspace] = useState('E:\\Mainspring\\workspaces\\northline-dental')
  const [billingLabel, setBillingLabel] = useState('retainer - local records only')

  return (
    <section className="sheet narrow">
      <h1>New client</h1>
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
        Workspace folder
        <div className="inline-field">
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
          <button className="secondary-button" type="button">
            Browse
          </button>
        </div>
      </label>
      <label>
        Billing label
        <small>Prototype local note. No billing ledger exists.</small>
        <input value={billingLabel} onChange={(event) => setBillingLabel(event.target.value)} />
      </label>
      <div className="preview-block">
        <h2>Permissions preview</h2>
        <p>Default scope for this client. You can adjust later.</p>
        <KeyValue label="Workspace root" value={workspace} />
        <KeyValue label="Secrets scope" value="Client-scoped secrets only" />
        <KeyValue label="Usage ledger" value="Not implemented; local note only" />
      </div>
      <div className="button-row">
        <button
          className="primary-button"
          onClick={() =>
            onCreate({
              id: makeId('client'),
              name,
              contact,
              workspace,
              billingLabel,
            })
          }
        >
          Create client
        </button>
        <button className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
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
    providerState === 'ready' ? 'set' : providerState === 'unverified' ? 'unverified' : 'missing'

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
          <h2>Automations deferred</h2>
          <KeyValue label="Trigger" value="Manual draft only" action="Locked" />
          <KeyValue label="Schedule" value="Not implemented" action="Deferred" />
          <KeyValue label="Budget cap" value="Not implemented" action="Deferred" />
          <KeyValue label="Human checkpoint" value="Policy draft only" action="Deferred" />
          <div className="muted-table">
            <p>Cron templates are not implemented.</p>
            <KeyValue label="Daily inbox draft" value="0 9 * * *" action="Disabled" />
            <KeyValue label="Weekly report" value="0 8 * * 1" action="Disabled" />
          </div>
        </div>
      </div>
      <footer className="bottom-action">
        <span>
          {providerReady
            ? 'Prototype trace available; no runtime run will start.'
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
        <KeyValue label="Password" value="Prototype SHA-256 hash in localStorage" />
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
