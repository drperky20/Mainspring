import type { DragEvent, FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import type { ConsoleGatewayRunEvent, ConsoleGatewaySnapshot } from 'mainspring/gateway'
import anthropicLogo from './assets/providers/anthropic.png'
import deepseekLogo from './assets/providers/deepseek.ico'
import geminiLogo from './assets/providers/gemini.svg'
import groqLogo from './assets/providers/groq.svg'
import mistralLogo from './assets/providers/mistral.ico'
import openaiLogo from './assets/providers/openai.svg'
import openrouterLogo from './assets/providers/openrouter.ico'
import {
  createLocalGatewayClient,
  type GatewayProviderModel,
  type LocalGatewayClient,
} from './localGatewayClient'

type AppScreen = 'clients' | 'settings'
type ClientTab = 'chat' | 'agents' | 'automations' | 'access'
type ProviderStatus = 'live' | 'connector' | 'catalog'
type ToastKind = 'ok' | 'error' | 'info'
type ChatRole = UIMessage['role']

type ToastState = {
  kind: ToastKind
  text: string
}

type SetupState = {
  complete: boolean
  accountName: string
  username: string
}

type DraftClient = {
  name: string
  contact: string
  billingLabel: string
  workspaceName: string
  agentName: string
  modelId: string
  goal: string
  instructions: string
}

type AgentDraft = {
  name: string
  defaultModelId: string
  instructions: string
  outcome: string
  approvalMode: string
  skills: Record<string, boolean>
}

type MainspringChatMessage = {
  id: string
  role: ChatRole
  text: string
  timestamp: string
}

type LastRunState = {
  runId: string
  sessionId: string
  mode: 'chat' | 'automation-test' | 'agent-test'
  prompt: string
}

type AutomationNode = {
  id: string
  title: string
  detail: string
  strong?: boolean
  tone?: 'agent' | 'prompt' | 'read' | 'write' | 'browser' | 'voice' | 'web'
}

type ProviderCatalogItem = {
  id: string
  label: string
  badge: string
  status: ProviderStatus
  profileProviderId?: 'openrouter' | 'openai' | 'codex'
  defaultModelId: string
  models: Array<{ id: string; label: string }>
  setup: string
  note: string
}

type HealthAuth = Awaited<ReturnType<LocalGatewayClient['health']>>['auth']
type SnapshotClient = ConsoleGatewaySnapshot['clients'][number]
type SnapshotWorkspace = ConsoleGatewaySnapshot['workspaces'][number]
type SnapshotAgent = ConsoleGatewaySnapshot['agents'][number]
type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

const DEFAULT_GATEWAY_URL = import.meta.env.VITE_MAINSPRING_GATEWAY_URL ?? 'http://127.0.0.1:8787'
const SETUP_STORAGE_KEY = 'mainspring.console.setup.v2'

const toolOptions = [
  { key: 'agent', label: 'Agent', description: 'Support agent', locked: true },
  { key: 'prompt', label: 'Prompt', description: 'Automation instruction', locked: true },
  { key: 'file.read', label: 'File read', description: 'Inspect workspace files.' },
  { key: 'file.write', label: 'File write', description: 'Write approved outputs.' },
  { key: 'voice.call', label: 'Voice call', description: 'Design placeholder for call tools.' },
] as const

const defaultSkills = {
  'web.fetch': true,
  'file.read': true,
  'file.write': false,
  'browser.screenshot': false,
  'voice.call': false,
}

const providerCatalog: ProviderCatalogItem[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'OR',
    status: 'live',
    profileProviderId: 'openrouter',
    defaultModelId: 'openrouter/auto',
    setup: 'API key or managed secret reference',
    note: 'Uses the existing Mainspring OpenRouter provider profile.',
    models: [
      { id: 'openrouter/auto', label: 'Auto router' },
      { id: 'openrouter/free', label: 'Free router' },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet via OpenRouter' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini Flash via OpenRouter' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat via OpenRouter' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    badge: 'AI',
    status: 'live',
    profileProviderId: 'openai',
    defaultModelId: 'gpt-4.1-mini',
    setup: 'API key or managed secret reference',
    note: 'Uses the existing Mainspring OpenAI provider profile.',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT 4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT 4.1' },
      { id: 'o4-mini', label: 'o4 mini' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    badge: 'CX',
    status: 'live',
    profileProviderId: 'codex',
    defaultModelId: 'codex-auto',
    setup: 'Codex CLI with mounted Codex home auth',
    note: 'Uses the backend Codex CLI provider path with ChatGPT auth from CODEX_HOME.',
    models: [
      { id: 'codex-auto', label: 'Codex account default' },
      { id: 'gpt-5-codex-mini', label: 'GPT 5 Codex mini' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    badge: 'CL',
    status: 'connector',
    defaultModelId: 'anthropic/claude-sonnet-4',
    setup: 'Direct API adapter needed',
    note: 'Use OpenRouter today. Subscription credential reuse is not presented as third-party client auth.',
    models: [
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet via OpenRouter' },
      { id: 'anthropic/claude-opus-4', label: 'Claude Opus via OpenRouter' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    badge: 'GM',
    status: 'catalog',
    defaultModelId: 'google/gemini-2.5-flash',
    setup: 'Available through OpenRouter catalog today',
    note: 'Direct Gemini provider support can be added behind the same profile UI later.',
    models: [{ id: 'google/gemini-2.5-flash', label: 'Gemini Flash via OpenRouter' }],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    badge: 'MI',
    status: 'catalog',
    defaultModelId: 'mistralai/mistral-small-3.2-24b-instruct',
    setup: 'Available through OpenRouter catalog today',
    note: 'Use an OpenRouter profile until Mainspring has a direct adapter.',
    models: [{ id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small via OpenRouter' }],
  },
  {
    id: 'groq',
    label: 'Groq',
    badge: 'GQ',
    status: 'catalog',
    defaultModelId: 'meta-llama/llama-3.3-70b-instruct',
    setup: 'Available through OpenRouter catalog today',
    note: 'Direct Groq provider support can reuse the provider profile pattern.',
    models: [{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B via OpenRouter' }],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: 'DS',
    status: 'catalog',
    defaultModelId: 'deepseek/deepseek-chat',
    setup: 'Available through OpenRouter catalog today',
    note: 'Shown as catalog routing until a direct DeepSeek provider exists.',
    models: [{ id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat via OpenRouter' }],
  },
]

const providerLogoSources: Record<string, string> = {
  anthropic: anthropicLogo,
  codex: openaiLogo,
  deepseek: deepseekLogo,
  google: geminiLogo,
  groq: groqLogo,
  mistral: mistralLogo,
  openai: openaiLogo,
  openrouter: openrouterLogo,
}

const starterClient: DraftClient = {
  name: 'Northline Dental',
  contact: 'ops@northline.example',
  billingLabel: 'Pilot',
  workspaceName: 'Northline Workspace',
  agentName: 'Front desk assistant',
  modelId: 'openrouter/auto',
  goal: 'Answer inbound questions, collect lead details, and hand off anything uncertain.',
  instructions:
    'Be brief, ask one question at a time, summarize what changed, and keep every action tied to the client workspace.',
}

export function ConnectedConsoleApp() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL)
  const [sessionToken, setSessionToken] = useState<string>()
  const [setup, setSetup] = useState<SetupState>(() => readSetupState())
  const [snapshot, setSnapshot] = useState<ConsoleGatewaySnapshot | null>(null)
  const [auth, setAuth] = useState<HealthAuth>()
  const [screen, setScreen] = useState<AppScreen>('clients')
  const [clientTab, setClientTab] = useState<ClientTab>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [selectedProviderProfileId, setSelectedProviderProfileId] = useState<string>()
  const [chatInput, setChatInput] = useState('Check what this client needs next and suggest one safe action.')
  const [automationPrompt, setAutomationPrompt] = useState(
    'Review new inbox items, draft a short client update, and stop before sending anything external.',
  )
  const [chatMessages, setChatMessages] = useState<MainspringChatMessage[]>([])
  const [lastRun, setLastRun] = useState<LastRunState>()
  const [runEvents, setRunEvents] = useState<ConsoleGatewayRunEvent[]>([])
  const [toast, setToast] = useState<ToastState>()
  const [busy, setBusy] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)

  const gatewayClient = useMemo(() => {
    const client = createLocalGatewayClient(gatewayUrl)
    client.setSessionToken(sessionToken ?? undefined)
    return client
  }, [gatewayUrl, sessionToken])

  const refresh = useCallback(async () => {
    const health = await gatewayClient.health()
    setAuth(health.auth)
    if (!health.auth || health.auth.authMode === 'local-dev' || health.auth.authenticated) {
      setSnapshot(await gatewayClient.snapshot())
    }
  }, [gatewayClient])

  useEffect(() => {
    let alive = true
    void refresh().catch((error) => {
      if (!alive) return
      setToast({ kind: 'error', text: error instanceof Error ? error.message : 'Gateway unavailable.' })
    })
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined)
    }, 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    if (!snapshot) return
    const firstClient = snapshot.clients.find((client) => client.status === 'active') ?? snapshot.clients[0]
    const selectedStillExists = snapshot.clients.some((client) => client.clientId === selectedClientId)
    if (firstClient && (!selectedClientId || !selectedStillExists)) {
      setSelectedClientId(firstClient.clientId)
    }
    if (!firstClient && selectedClientId) {
      setSelectedClientId(undefined)
    }
  }, [selectedClientId, snapshot])

  const clients = snapshot?.clients.filter((client) => client.status !== 'archived') ?? []
  const selectedClient = clients.find((client) => client.clientId === selectedClientId)
  const selectedWorkspace = useMemo(
    () => findWorkspace(snapshot, selectedClient?.clientId),
    [selectedClient?.clientId, snapshot],
  )
  const selectedAgents = useMemo(
    () => listAgents(snapshot, selectedWorkspace?.workspaceId),
    [selectedWorkspace?.workspaceId, snapshot],
  )
  const selectedAgent = selectedAgents.find((agent) => agent.agentId === selectedAgentId) ?? selectedAgents[0]
  const selectedProviderProfile =
    snapshot?.providerProfiles.find((profile) => profile.profileId === selectedProviderProfileId)
    ?? findProviderForAgent(snapshot, selectedAgent)

  useEffect(() => {
    if (selectedAgent && selectedAgent.agentId !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.agentId)
    }
  }, [selectedAgent, selectedAgentId])

  async function completeSetup(next: SetupState) {
    writeSetupState(next)
    setSetup(next)
    await refresh()
  }

  async function createClient(draft: DraftClient) {
    setBusy(true)
    try {
      const clientName = draft.name.trim()
      const workspaceRoot = `.mainspring/workspaces/${slugify(clientName)}-${Date.now().toString(36)}`
      const created = await gatewayClient.createClient({
        name: clientName,
        contact: draft.contact.trim() || undefined,
        billingLabel: draft.billingLabel.trim() || undefined,
        workspaceName: draft.workspaceName.trim() || `${clientName} Workspace`,
        workspaceRoot,
      })
      const workspace = created.workspace
      if (workspace) {
        const profile = selectedProviderProfile ?? snapshot?.providerProfiles[0]
        await gatewayClient.createAgent({
          workspaceId: workspace.workspaceId,
          name: draft.agentName.trim() || 'Client agent',
          version: 'v1',
          defaultModelId: draft.modelId.trim() || profile?.defaultModelId || 'openrouter/auto',
          instructions: draft.instructions.trim(),
          outcome: draft.goal.trim(),
          approvalMode: 'Non-blocking',
          modelLabel: modelLabel(draft.modelId),
          skills: defaultSkills,
        })
      }
      setClientDialogOpen(false)
      setSelectedClientId(created.client.clientId)
      setClientTab('chat')
      await refresh()
      setToast({ kind: 'ok', text: `${clientName} is ready.` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function updateClientAndAgent(input: {
    client: SnapshotClient
    workspace?: SnapshotWorkspace
    agent?: SnapshotAgent
    draft: DraftClient
  }) {
    setBusy(true)
    try {
      await gatewayClient.updateClient({
        clientId: input.client.clientId,
        name: input.draft.name,
        contact: input.draft.contact,
        billingLabel: input.draft.billingLabel,
        ...(input.workspace
          ? {
              workspaceId: input.workspace.workspaceId,
              workspaceName: input.draft.workspaceName,
            }
          : {}),
      })
      if (input.agent) {
        await gatewayClient.updateAgent({
          agentId: input.agent.agentId,
          name: input.draft.agentName,
          defaultModelId: input.draft.modelId,
          instructions: input.draft.instructions,
          outcome: input.draft.goal,
          approvalMode: input.agent.approvalMode ?? 'Non-blocking',
          modelLabel: modelLabel(input.draft.modelId),
          skills: input.agent.skills ?? defaultSkills,
        })
      }
      await refresh()
      setToast({ kind: 'ok', text: 'Client details saved.' })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function saveAgent(agent: SnapshotAgent | undefined, draft: AgentDraft) {
    if (!selectedWorkspace) {
      setToast({ kind: 'error', text: 'Create a client workspace first.' })
      return
    }
    setBusy(true)
    try {
      if (agent) {
        await gatewayClient.updateAgent({
          agentId: agent.agentId,
          name: draft.name,
          defaultModelId: draft.defaultModelId,
          instructions: draft.instructions,
          outcome: draft.outcome,
          approvalMode: draft.approvalMode,
          modelLabel: modelLabel(draft.defaultModelId),
          skills: draft.skills,
        })
      } else {
        const created = await gatewayClient.createAgent({
          workspaceId: selectedWorkspace.workspaceId,
          name: draft.name,
          version: 'v1',
          defaultModelId: draft.defaultModelId,
          instructions: draft.instructions,
          outcome: draft.outcome,
          approvalMode: draft.approvalMode,
          modelLabel: modelLabel(draft.defaultModelId),
          skills: draft.skills,
        })
        setSelectedAgentId(created.agent.agentId)
      }
      await refresh()
      setToast({ kind: 'ok', text: 'Agent saved.' })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function saveProvider(input: ProviderProfileDraft) {
    const catalogItem = providerCatalog.find((provider) => provider.id === input.catalogId)
    if (!catalogItem?.profileProviderId) {
      setToast({ kind: 'info', text: 'That connector is visible, but it needs a backend adapter before it can be connected.' })
      return
    }
    setBusy(true)
    try {
      const created = await gatewayClient.createProviderProfile({
        providerId: catalogItem.profileProviderId,
        label: input.label,
        defaultModelId: input.modelId,
        ...(input.secretMode === 'value'
          ? { secretValue: input.secretValue }
          : { secretRef: input.secretRef }),
      })
      setSelectedProviderProfileId(created.providerProfile.profileId)
      setProviderDialogOpen(false)
      await refresh()
      setToast({ kind: 'ok', text: `${input.label} connected.` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function startRun(input: {
    mode: LastRunState['mode']
    prompt: string
    tools: string[]
    addChatMessage?: boolean
  }) {
    if (!selectedClient || !selectedWorkspace || !selectedAgent) {
      setToast({ kind: 'error', text: 'Add a client and agent first.' })
      return
    }
    const session = findSession(snapshot, selectedClient.clientId, selectedWorkspace.workspaceId)
    if (!session) {
      setToast({ kind: 'error', text: 'This client has no open gateway session yet. Create a fresh client to get an attached workspace session.' })
      return
    }

    const trimmedPrompt = input.prompt.trim()
    if (!trimmedPrompt) return
    if (input.addChatMessage) {
      setChatMessages((messages) => [
        ...messages,
        makeChatMessage('user', trimmedPrompt),
      ])
      setChatInput('')
    }
    setBusy(true)
    try {
      const provider = selectedProviderProfile
      const result = await gatewayClient.startRun({
        sessionId: session.sessionId,
        input: trimmedPrompt,
        mode: input.mode,
        allowedTools: input.tools,
        allowBudgetWarning: true,
        workspaceId: selectedWorkspace.workspaceId,
        agentId: selectedAgent.agentId,
        providerProfileId: provider?.profileId,
        providerId: provider?.providerId,
        modelId: selectedAgent.defaultModelId ?? provider?.defaultModelId,
      })
      setLastRun({
        runId: result.run.runId,
        sessionId: result.run.sessionId,
        mode: input.mode,
        prompt: trimmedPrompt,
      })
      setRunEvents([])
      void streamRunEvents(result.run, {
        addChatMessage: Boolean(input.addChatMessage),
        runLabel: shortId(result.run.runId),
      })
      window.setTimeout(() => {
        void pollRunEvents(result.run, {
          addChatMessage: false,
          runLabel: shortId(result.run.runId),
        })
      }, 2500)
      if (input.addChatMessage) {
        setChatMessages((messages) => [
          ...messages,
          makeChatMessage('assistant', `Run ${shortId(result.run.runId)} started. Live actions will appear on the rail.`),
        ])
      }
      await refresh()
      setToast({ kind: 'ok', text: `Run ${shortId(result.run.runId)} started.` })
    } catch (error) {
      if (input.addChatMessage) {
        setChatMessages((messages) => [...messages, makeChatMessage('assistant', errorMessage(error))])
      }
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function streamRunEvents(
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string },
  ) {
    const streamAccess = await gatewayClient
      .browserAccessUrl({ kind: 'event-stream', sessionId: run.sessionId, runId: run.runId })
      .catch(() => undefined)
    const streamUrl = streamAccess?.url ?? `${gatewayUrl.replace(/\/+$/, '')}/events/stream?sessionId=${encodeURIComponent(run.sessionId)}&runId=${encodeURIComponent(run.runId)}`
    if (typeof EventSource === 'undefined') {
      await pollRunEvents(run, options)
      return
    }
    const source = new EventSource(streamUrl)
    let settled = false
    const close = () => {
      settled = true
      source.close()
    }
    source.addEventListener('run.event', (event) => {
      const parsed = safeJsonParse<ConsoleGatewayRunEvent>(event.data)
      if (!parsed) return
      setRunEvents((events) => mergeRunEvent(events, parsed))
      if (String(parsed.type) === 'assistant.delta' && typeof parsed.payload === 'object' && parsed.payload) {
        const text = String((parsed.payload as { text?: unknown }).text ?? '')
        if (text && options.addChatMessage) {
          setChatMessages((messages) => appendAssistantDelta(messages, text))
        }
      }
      if (parsed.type === 'run.completed' || parsed.type === 'run.failed') close()
    })
    source.onerror = () => {
      close()
      void pollRunEvents(run, options)
    }
    window.setTimeout(() => {
      if (!settled) close()
    }, 45_000)
  }

  async function pollRunEvents(
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string },
  ) {
    const events = await gatewayClient.runEvents(run).catch(() => ({ events: [] }))
    setRunEvents(events.events)
    if (options.addChatMessage && events.events.length > 0) {
      setChatMessages((messages) => [
        ...messages,
        makeChatMessage('assistant', `Run ${options.runLabel} produced ${events.events.length} logged event${events.events.length === 1 ? '' : 's'}.`),
      ])
    }
  }

  if (!setup.complete) {
    return (
      <SetupWizard
        auth={auth}
        busy={busy}
        gatewayClient={gatewayClient}
        providerProfiles={snapshot?.providerProfiles ?? []}
        onBusy={setBusy}
        onConnectProvider={saveProvider}
        onDone={completeSetup}
        onSessionToken={(token) => {
          setSessionToken(token)
        }}
        onToast={setToast}
        toast={toast}
      />
    )
  }

  return (
    <div className={`simple-console ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      <Sidebar
        auth={auth}
        collapsed={sidebarCollapsed}
        clients={clients}
        gatewayUrl={gatewayUrl}
        screen={screen}
        selectedClientId={selectedClientId}
        setup={setup}
        onCollapse={() => setSidebarCollapsed((value) => !value)}
        onNewClient={() => setClientDialogOpen(true)}
        onScreen={setScreen}
        onSelectClient={(clientId) => {
          setSelectedClientId(clientId)
          setScreen('clients')
          setClientTab('chat')
        }}
      />
      <main className="simple-main">
        {screen === 'clients' ? (
          <ClientsScreen
            agents={selectedAgents}
            automationPrompt={automationPrompt}
            busy={busy}
            chatInput={chatInput}
            chatMessages={chatMessages}
            client={selectedClient}
            clients={clients}
            clientTab={clientTab}
            lastRun={lastRun}
            provider={selectedProviderProfile}
            providers={snapshot?.providerProfiles ?? []}
            runEvents={runEvents}
            selectedAgent={selectedAgent}
            workspace={selectedWorkspace}
            onAutomationPrompt={setAutomationPrompt}
            onChatInput={setChatInput}
            onClientTab={setClientTab}
            onCreateClient={() => setClientDialogOpen(true)}
            onEditClient={(draft) => {
              if (!selectedClient) return
              void updateClientAndAgent({
                client: selectedClient,
                workspace: selectedWorkspace,
                agent: selectedAgent,
                draft,
              })
            }}
            onNewAgent={() => setSelectedAgentId(undefined)}
            onProvider={setSelectedProviderProfileId}
            onSaveAgent={saveAgent}
            onSelectAgent={setSelectedAgentId}
            onStartRun={startRun}
          />
        ) : (
          <SettingsScreen
            auth={auth}
            gatewayUrl={gatewayUrl}
            providers={snapshot?.providerProfiles ?? []}
            selectedProviderId={selectedProviderProfileId}
            setup={setup}
            onGatewayUrl={setGatewayUrl}
            onNewProvider={() => setProviderDialogOpen(true)}
            onProvider={setSelectedProviderProfileId}
            onResetSetup={() => {
              const next = { ...setup, complete: false }
              writeSetupState(next)
              setSetup(next)
            }}
          />
        )}
      </main>
      {clientDialogOpen ? (
        <Dialog title="Add new client" onClose={() => setClientDialogOpen(false)}>
          <ClientForm
            defaultModelId={selectedProviderProfile?.defaultModelId}
            onCancel={() => setClientDialogOpen(false)}
            onSubmit={createClient}
            submitLabel="Create client"
          />
        </Dialog>
      ) : null}
      {providerDialogOpen ? (
        <Dialog title="Connect service" onClose={() => setProviderDialogOpen(false)}>
          <ProviderForm
            gatewayClient={gatewayClient}
            providerProfiles={snapshot?.providerProfiles ?? []}
            onCancel={() => setProviderDialogOpen(false)}
            onSubmit={saveProvider}
          />
        </Dialog>
      ) : null}
      {toast ? <Toast toast={toast} onDismiss={() => setToast(undefined)} /> : null}
    </div>
  )
}

function SetupWizard({
  auth,
  busy,
  gatewayClient,
  providerProfiles,
  toast,
  onBusy,
  onConnectProvider,
  onDone,
  onSessionToken,
  onToast,
}: {
  auth?: HealthAuth
  busy: boolean
  gatewayClient: LocalGatewayClient
  providerProfiles: SnapshotProvider[]
  toast?: ToastState
  onBusy: (value: boolean) => void
  onConnectProvider: (input: ProviderProfileDraft) => Promise<void>
  onDone: (setup: SetupState) => Promise<void>
  onSessionToken: (token: string | undefined) => void
  onToast: (toast: ToastState | undefined) => void
}) {
  const [step, setStep] = useState<'account' | 'providers' | 'finish'>('account')
  const [accountName, setAccountName] = useState('Mainspring HQ')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onBusy(true)
    try {
      if (auth?.authMode === 'hosted') {
        if (!password.trim()) throw new Error('Password is required for hosted auth.')
        if (auth.bootstrapRequired) {
          await gatewayClient.bootstrapAuth({ username: username.trim(), password })
        }
        await gatewayClient.login({ username: username.trim(), password })
        onSessionToken(gatewayClient.getSessionToken())
      }
      setStep('providers')
      onToast({ kind: 'ok', text: 'Account step complete.' })
    } catch (error) {
      onToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      onBusy(false)
    }
  }

  async function finish() {
    await onDone({
      complete: true,
      accountName: accountName.trim() || 'Mainspring',
      username: username.trim() || 'admin',
    })
  }

  return (
    <div className="setup-scene">
      <div className="setup-brand">
        <MainspringMark />
        <span>Mainspring</span>
      </div>
      <section className="setup-card">
        <div className="setup-steps" aria-label="Setup steps">
          {['account', 'providers', 'finish'].map((item, index) => (
            <button
              className={step === item ? 'active' : ''}
              key={item}
              type="button"
              onClick={() => setStep(item as typeof step)}
            >
              <span>{index + 1}</span>
              {item}
            </button>
          ))}
        </div>
        {step === 'account' ? (
          <form className="setup-panel" onSubmit={submitAccount}>
            <div>
              <h1>Set up your account</h1>
              <p>Keep it simple: one owner account, then connect one model service.</p>
            </div>
            <label>
              Account name
              <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            </label>
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                autoComplete="new-password"
                placeholder={auth?.authMode === 'hosted' ? 'Required for hosted gateway' : 'Used only for hosted gateway setup'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="simple-primary" disabled={busy} type="submit">Continue</button>
          </form>
        ) : step === 'providers' ? (
          <div className="setup-panel">
            <div>
              <h1>Connect a service</h1>
              <p>OpenRouter and OpenAI API-key profiles are wired to the backend today. Other providers are shown as connector or catalog routes.</p>
            </div>
            <ProviderForm
              compact
              gatewayClient={gatewayClient}
              providerProfiles={providerProfiles}
              onCancel={() => setStep('finish')}
              onSubmit={async (input) => {
                await onConnectProvider(input)
                setStep('finish')
              }}
            />
            <button className="simple-text" type="button" onClick={() => setStep('finish')}>Skip for now</button>
          </div>
        ) : (
          <div className="setup-panel">
            <div>
              <h1>Ready for clients</h1>
              <p>The dashboard will start with one action: add a client. Each client gets a workspace and an agent.</p>
            </div>
            <div className="setup-summary">
              <span>{accountName}</span>
              <span>{providerProfiles.length} connected service{providerProfiles.length === 1 ? '' : 's'}</span>
              <span>Open-source local gateway</span>
            </div>
            <button className="simple-primary" disabled={busy} type="button" onClick={() => void finish()}>Open dashboard</button>
          </div>
        )}
      </section>
      {toast ? <Toast toast={toast} onDismiss={() => onToast(undefined)} /> : null}
    </div>
  )
}

function Sidebar({
  auth,
  collapsed,
  clients,
  gatewayUrl,
  screen,
  selectedClientId,
  setup,
  onCollapse,
  onNewClient,
  onScreen,
  onSelectClient,
}: {
  auth?: HealthAuth
  collapsed: boolean
  clients: SnapshotClient[]
  gatewayUrl: string
  screen: AppScreen
  selectedClientId?: string
  setup: SetupState
  onCollapse: () => void
  onNewClient: () => void
  onScreen: (screen: AppScreen) => void
  onSelectClient: (clientId: string) => void
}) {
  const gatewayConnected = !auth || auth.authMode === 'local-dev' || auth.authenticated
  const gatewayLabel = gatewayConnected ? 'Connected' : 'Needs sign in'
  const selectedClient = clients.find((client) => client.clientId === selectedClientId) ?? clients[0]

  return (
    <aside className="simple-sidebar">
      <div className="sidebar-head">
        <div className="sidebar-brand">
          <MainspringMark />
          <span>Mainspring</span>
        </div>
        <button className="icon-button" type="button" aria-label="Collapse sidebar" onClick={onCollapse}>
          {collapsed ? '>' : '<'}
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Main">
        <button className={screen === 'clients' ? 'active' : ''} type="button" onClick={() => onScreen('clients')}>
          <span className="sidebar-nav-icon clients" aria-hidden="true" />
          <strong>Clients</strong>
        </button>
        <button className={screen === 'settings' ? 'active' : ''} type="button" onClick={() => onScreen('settings')}>
          <span className="sidebar-nav-icon settings" aria-hidden="true" />
          <strong>Settings</strong>
        </button>
      </nav>
      <div className="sidebar-clients">
        <span className="sidebar-client-label">Client</span>
        {selectedClient ? (
          <button
            className="sidebar-current-client"
            type="button"
            onClick={() => onSelectClient(selectedClient.clientId)}
          >
            <strong>{selectedClient.name}</strong>
            <span aria-hidden="true">v</span>
          </button>
        ) : (
          <button className="sidebar-empty" type="button" onClick={onNewClient}>Add new client</button>
        )}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-gateway-card" title={gatewayUrl}>
          <span className={gatewayConnected ? 'gateway-status-dot is-connected' : 'gateway-status-dot'} />
          <div>
            <strong>Local Docker gateway</strong>
            <small>{gatewayLabel}</small>
          </div>
          <span className="gateway-chevron" aria-hidden="true">&gt;</span>
        </div>
        <div className="sidebar-open-source">
          <span>v0.1.0</span>
          <span>Open source / MIT License</span>
        </div>
        <div className="sidebar-account">
          <span>{initials(setup.accountName || setup.username)}</span>
          <strong>{setup.accountName}</strong>
        </div>
      </div>
    </aside>
  )
}

function ClientsScreen({
  agents,
  automationPrompt,
  busy,
  chatInput,
  chatMessages,
  client,
  clients,
  clientTab,
  lastRun,
  provider,
  providers,
  runEvents,
  selectedAgent,
  workspace,
  onAutomationPrompt,
  onChatInput,
  onClientTab,
  onCreateClient,
  onEditClient,
  onNewAgent,
  onProvider,
  onSaveAgent,
  onSelectAgent,
  onStartRun,
}: {
  agents: SnapshotAgent[]
  automationPrompt: string
  busy: boolean
  chatInput: string
  chatMessages: MainspringChatMessage[]
  client?: SnapshotClient
  clients: SnapshotClient[]
  clientTab: ClientTab
  lastRun?: LastRunState
  provider?: SnapshotProvider
  providers: SnapshotProvider[]
  runEvents: ConsoleGatewayRunEvent[]
  selectedAgent?: SnapshotAgent
  workspace?: SnapshotWorkspace
  onAutomationPrompt: (value: string) => void
  onChatInput: (value: string) => void
  onClientTab: (tab: ClientTab) => void
  onCreateClient: () => void
  onEditClient: (draft: DraftClient) => void
  onNewAgent: () => void
  onProvider: (profileId: string) => void
  onSaveAgent: (agent: SnapshotAgent | undefined, draft: AgentDraft) => Promise<void>
  onSelectAgent: (agentId: string) => void
  onStartRun: (input: {
    mode: LastRunState['mode']
    prompt: string
    tools: string[]
    addChatMessage?: boolean
  }) => Promise<void>
}) {
  if (clients.length === 0 || !client) {
    return (
      <section className="empty-client-screen">
        <h1>Add new client</h1>
        <p>Start with a client. Mainspring will create the workspace and first agent automatically.</p>
        <button className="simple-primary large" type="button" onClick={onCreateClient}>Add new client</button>
      </section>
    )
  }

  return (
    <section className={`client-screen ${clientTab === 'automations' ? 'is-automation-tab' : ''}`}>
      <header className="screen-header">
        <div>
          <p>{workspace?.name ?? 'Client workspace'}</p>
          <div className="screen-title-row">
            <h1>{client.name}</h1>
            {clientTab === 'automations' ? (
              <button className="workspace-selector" type="button" aria-label="Current workspace">
                <span className="workspace-selector-icon" aria-hidden="true" />
                <span>Default workspace</span>
                <span aria-hidden="true">v</span>
              </button>
            ) : null}
          </div>
        </div>
        <button className="simple-secondary" type="button" onClick={onCreateClient}>New client</button>
      </header>
      <div className="client-layout">
        {clientTab === 'automations' ? null : (
          <ClientDetailsPanel
            agent={selectedAgent}
            client={client}
            provider={provider}
            workspace={workspace}
            onSave={onEditClient}
          />
        )}
        <div className="workspace-area">
          <div className="client-tabs">
            {(['chat', 'agents', 'automations', 'access'] as ClientTab[]).map((tab) => (
              <button className={clientTab === tab ? 'active' : ''} key={tab} type="button" onClick={() => onClientTab(tab)}>
                <span className={`client-tab-icon ${tab}`} aria-hidden="true" />
                <span>{tab}</span>
              </button>
            ))}
          </div>
          {clientTab === 'chat' ? (
            <ChatPanel
              agent={selectedAgent}
              busy={busy}
              chatInput={chatInput}
              messages={chatMessages}
              provider={provider}
              runEvents={runEvents}
              lastRun={lastRun}
              onChatInput={onChatInput}
              onSend={(prompt) =>
                onStartRun({
                  mode: 'chat',
                  prompt,
                  tools: enabledTools(selectedAgent),
                  addChatMessage: true,
                })
              }
            />
          ) : clientTab === 'agents' ? (
            <AgentBuilder
              agents={agents}
              provider={provider}
              providers={providers}
              selectedAgent={selectedAgent}
              onNewAgent={onNewAgent}
              onProvider={onProvider}
              onSave={onSaveAgent}
              onSelectAgent={onSelectAgent}
            />
          ) : clientTab === 'automations' ? (
            <AutomationBuilder
              agent={selectedAgent}
              busy={busy}
              prompt={automationPrompt}
              provider={provider}
              runEvents={runEvents}
              lastRun={lastRun}
              onPrompt={onAutomationPrompt}
              onRun={(prompt, tools) =>
                onStartRun({
                  mode: 'automation-test',
                  prompt,
                  tools,
                })
              }
            />
          ) : (
            <AccessPanel client={client} workspace={workspace} />
          )}
        </div>
      </div>
    </section>
  )
}

function ClientDetailsPanel({
  agent,
  client,
  provider,
  workspace,
  onSave,
}: {
  agent?: SnapshotAgent
  client: SnapshotClient
  provider?: SnapshotProvider
  workspace?: SnapshotWorkspace
  onSave: (draft: DraftClient) => void
}) {
  const [editing, setEditing] = useState(false)
  const draft = clientDraftFromSnapshot(client, workspace, agent)

  return (
    <aside className="client-detail-panel">
      <div className="mini-head">
        <h2>Client</h2>
        <button className="simple-text" type="button" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <ClientForm
          initial={draft}
          onCancel={() => setEditing(false)}
          onSubmit={(next) => {
            onSave(next)
            setEditing(false)
          }}
          submitLabel="Save details"
        />
      ) : (
        <div className="detail-list">
          <InfoRow label="Contact" value={client.contact || 'Not set'} />
          <InfoRow label="Billing" value={client.billingLabel || 'Not set'} />
          <InfoRow label="Workspace" value={workspace?.name ?? 'Not set'} />
          <InfoRow label="Agent" value={agent?.name ?? 'Not set'} />
          <InfoRow label="Model" value={agent?.defaultModelId ?? provider?.defaultModelId ?? 'Not set'} />
          <InfoRow label="Approval" value={agent?.approvalMode ?? 'Non-blocking'} />
        </div>
      )}
    </aside>
  )
}

function ChatPanel({
  agent,
  busy,
  chatInput,
  messages,
  provider,
  runEvents,
  lastRun,
  onChatInput,
  onSend,
}: {
  agent?: SnapshotAgent
  busy: boolean
  chatInput: string
  messages: MainspringChatMessage[]
  provider?: SnapshotProvider
  runEvents: ConsoleGatewayRunEvent[]
  lastRun?: LastRunState
  onChatInput: (value: string) => void
  onSend: (prompt: string) => Promise<void>
}) {
  const renderedMessages =
    messages.length > 0
      ? messages
      : [
          makeChatMessage(
            'assistant',
            `You are chatting with ${agent?.name ?? 'the client agent'}. Messages dispatch Mainspring runs and use AI SDK UI message roles.`,
          ),
        ]

  return (
    <div className="chat-grid">
      <section className="chat-panel">
        <div className="mini-head">
          <div>
            <h2>Chat</h2>
            <p>{agent?.name ?? 'Create an agent first'} | {provider?.label ?? 'No service selected'}</p>
          </div>
          <span className="status-pill">{agent?.defaultModelId ?? provider?.defaultModelId ?? 'model needed'}</span>
        </div>
        <div className="message-feed">
          {renderedMessages.map((message) => (
            <article className={`message-bubble ${message.role}`} key={message.id}>
              <span>{message.role}</span>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void onSend(chatInput)
          }}
        >
          <textarea value={chatInput} onChange={(event) => onChatInput(event.target.value)} />
          <button className="simple-primary" disabled={busy || !agent} type="submit">Send</button>
        </form>
      </section>
      <ActionRail runEvents={runEvents} lastRun={lastRun} />
    </div>
  )
}

function AgentBuilder({
  agents,
  provider,
  providers,
  selectedAgent,
  onNewAgent,
  onProvider,
  onSave,
  onSelectAgent,
}: {
  agents: SnapshotAgent[]
  provider?: SnapshotProvider
  providers: SnapshotProvider[]
  selectedAgent?: SnapshotAgent
  onNewAgent: () => void
  onProvider: (profileId: string) => void
  onSave: (agent: SnapshotAgent | undefined, draft: AgentDraft) => Promise<void>
  onSelectAgent: (agentId: string) => void
}) {
  const [draft, setDraft] = useState(() => agentDraft(selectedAgent, provider))

  useEffect(() => {
    setDraft(agentDraft(selectedAgent, provider))
  }, [provider, selectedAgent])

  return (
    <div className="agent-builder">
      <aside className="agent-list">
        <div className="mini-head">
          <h2>Agents</h2>
          <button className="simple-text" type="button" onClick={onNewAgent}>New</button>
        </div>
        {agents.map((agent) => (
          <button
            className={agent.agentId === selectedAgent?.agentId ? 'agent-row active' : 'agent-row'}
            key={agent.agentId}
            type="button"
            onClick={() => onSelectAgent(agent.agentId)}
          >
            <strong>{agent.name}</strong>
            <span>{agent.defaultModelId ?? 'no model'}</span>
          </button>
        ))}
      </aside>
      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave(selectedAgent, draft)
        }}
      >
        <div className="mini-head">
          <h2>{selectedAgent ? 'Edit agent' : 'New agent'}</h2>
          <button className="simple-primary" type="submit">Save agent</button>
        </div>
        <div className="field-grid">
          <label>
            Name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Connected service
            <select value={provider?.profileId ?? ''} onChange={(event) => onProvider(event.target.value)}>
              <option value="">No service selected</option>
              {providers.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.label} | {profile.credentialState}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select
              value={draft.defaultModelId}
              onChange={(event) => setDraft({ ...draft, defaultModelId: event.target.value })}
            >
              {allModels().map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
          </label>
          <label>
            Approval mode
            <select
              value={draft.approvalMode}
              onChange={(event) => setDraft({ ...draft, approvalMode: event.target.value })}
            >
              <option>Non-blocking</option>
              <option>Ask first for writes</option>
              <option>Manual review</option>
            </select>
          </label>
        </div>
        <label>
          Workspace prompt
          <textarea value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })} />
        </label>
        <label>
          System prompt
          <textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
        </label>
        <div className="tool-grid">
          {toolOptions.map((tool) => (
            <ToolToggle
              checked={Boolean(draft.skills[tool.key])}
              description={tool.description}
              key={tool.key}
              label={tool.label}
              onChange={(checked) =>
                setDraft({
                  ...draft,
                  skills: {
                    ...draft.skills,
                    [tool.key]: checked,
                  },
                })
              }
            />
          ))}
        </div>
      </form>
    </div>
  )
}

function AutomationBuilder({
  agent,
  busy,
  prompt,
  provider,
  runEvents,
  lastRun,
  onPrompt,
  onRun,
}: {
  agent?: SnapshotAgent
  busy: boolean
  prompt: string
  provider?: SnapshotProvider
  runEvents: ConsoleGatewayRunEvent[]
  lastRun?: LastRunState
  onPrompt: (value: string) => void
  onRun: (prompt: string, tools: string[]) => Promise<void>
}) {
  const [tools, setTools] = useState<Record<string, boolean>>(() => ({
    ...defaultSkills,
    ...(agent?.skills ?? {}),
  }))
  const [canvasNodes, setCanvasNodes] = useState<AutomationNode[]>(() => [
    { id: 'agent', title: 'Agent', detail: agent?.name ?? 'No agent', strong: true, tone: 'agent' },
    { id: 'prompt', title: 'Prompt', detail: promptSummary(prompt), tone: 'prompt' },
    { id: 'file.read', title: 'File read', detail: 'Workspace context', tone: 'read' },
  ])
  const [draggingTool, setDraggingTool] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [savedAt, setSavedAt] = useState<string | undefined>()
  const selectedTools = Object.entries(tools).filter(([, enabled]) => enabled).map(([key]) => key)

  useEffect(() => {
    setTools({ ...defaultSkills, ...(agent?.skills ?? {}) })
    setCanvasNodes((nodes) =>
      nodes.map((node) =>
        node.id === 'agent'
          ? { ...node, detail: agent?.name ?? 'No agent' }
          : node.id === 'prompt'
            ? { ...node, detail: promptSummary(prompt) }
            : node,
      ),
    )
  }, [agent, prompt])

  function addToolNode(key: string) {
    const tool = toolOptions.find((item) => item.key === key)
    if (!tool) return
    if (!('locked' in tool)) {
      setTools((current) => ({ ...current, [tool.key]: true }))
    }
    setCanvasNodes((nodes) => {
      if (nodes.some((node) => node.id === tool.key)) return nodes
      return [...nodes, { id: tool.key, title: tool.label, detail: tool.description, tone: toolTone(tool.key) }]
    })
  }

  function removeToolNode(key: string) {
    if (key === 'agent' || key === 'prompt' || key === 'file.read') return
    setTools((current) => ({ ...current, [key]: false }))
    setCanvasNodes((nodes) => nodes.filter((node) => node.id !== key))
  }

  function dropTool(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const key = event.dataTransfer.getData('application/mainspring-tool')
    addToolNode(key)
  }

  function saveAutomation() {
    setSavedAt(new Date().toISOString())
    setEditing(false)
  }

  return (
    <div className="automation-grid">
      <section className="automation-board">
        <div className="automation-toolbar">
          <div>
            <button className="simple-text automation-back" type="button">Back to automations</button>
            <div className="automation-title-row">
              <h2>Daily follow-up</h2>
              <span className="status-pill">Ready</span>
            </div>
            <p>Runs every day at 9:00 AM</p>
          </div>
          <div className="automation-actions">
            <button className="simple-secondary automation-action-edit" type="button" onClick={() => setEditing((value) => !value)}>
              {editing ? 'Done editing' : 'Edit automation'}
            </button>
            <button
              className="simple-primary automation-action-run"
              disabled={busy || !agent}
              type="button"
              onClick={() => void onRun(prompt, selectedTools)}
            >
              Run
            </button>
            <button className="simple-secondary automation-action-save" type="button" onClick={saveAutomation}>
              Save automation
            </button>
            <button className="simple-secondary automation-action-more" type="button" aria-label="Automation actions">
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="automation-workspace">
          <aside className="automation-toolbox" aria-label="Automation toolbox" data-testid="automation-toolbox">
            <strong>Add nodes</strong>
            {toolOptions.map((tool) => (
              <ToolToggle
                checked={'locked' in tool ? true : Boolean(tools[tool.key])}
                description={tool.description}
                dragKey={tool.key}
                key={tool.key}
                label={tool.label}
                onChange={(checked) => {
                  if ('locked' in tool) {
                    addToolNode(tool.key)
                    return
                  }
                  if (checked) {
                    addToolNode(tool.key)
                  } else {
                    removeToolNode(tool.key)
                  }
                }}
                onDragComplete={() => addToolNode(tool.key)}
                onPointerDragStart={() => setDraggingTool(tool.key)}
              />
            ))}
            <div className="toolbox-drag-helper">
              <span aria-hidden="true" />
              <small>Drag a node to the canvas</small>
            </div>
          </aside>
          <div className="automation-canvas-area">
            <div className="canvas-head">
              <strong className="section-kicker">Canvas</strong>
              <div className="zoom-control" aria-label="Canvas zoom">
                <button type="button">-</button>
                <span>100%</span>
                <button type="button">+</button>
              </div>
            </div>
            <div
              className="node-canvas"
              aria-label="Automation canvas"
              data-testid="automation-canvas"
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropTool}
              onMouseUp={() => {
                if (!draggingTool) return
                addToolNode(draggingTool)
                setDraggingTool(null)
              }}
            >
              {canvasNodes.map((node, index) => (
                <FragmentWithEdge
                  detail={node.detail}
                  isLast={index === canvasNodes.length - 1}
                  key={node.id}
                  strong={node.strong}
                  tone={node.tone}
                  title={node.title}
                />
              ))}
            </div>
            {editing ? (
              <>
                <label className="automation-prompt-field">
                  Prompt
                  <textarea
                    value={prompt}
                    onChange={(event) => onPrompt(event.target.value)}
                  />
                </label>
                <div className="workspace-mode">
                  <strong>Ephemeral run workspace</strong>
                  <span>Each automation run can use a disposable workspace and only keep explicit outputs.</span>
                </div>
              </>
            ) : null}
          </div>
          <aside className="automation-side run-activity-panel">
            <div className="mini-head">
              <h2>Run activity</h2>
              <span className="status-pill">{busy ? 'Running' : 'Ready'}</span>
            </div>
            <ActionRail runEvents={runEvents} lastRun={lastRun} compact />
            <div className="run-id-footer">
              <span>Run ID</span>
              <strong>{lastRun?.runId ? shortId(lastRun.runId) : '-'}</strong>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function AccessPanel({
  client,
  workspace,
}: {
  client: SnapshotClient
  workspace?: SnapshotWorkspace
}) {
  const origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin
  const dashboardLink = `${origin}/client/${encodeURIComponent(client.clientId)}`
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard?.writeText(dashboardLink).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="access-panel">
      <div className="mini-head">
        <div>
          <h2>Client access</h2>
          <p>Share a simple authenticated dashboard link for this workspace.</p>
        </div>
        <span className="status-pill">Require sign in</span>
      </div>
      <div className="access-link-row">
        <label>
          Client dashboard link
          <input readOnly value={dashboardLink} />
        </label>
        <button className="simple-primary" type="button" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="access-grid">
        <InfoRow label="Role" value="Client viewer" />
        <InfoRow label="Workspace" value={workspace?.name ?? 'Default workspace'} />
        <InfoRow label="Invite expires" value="Manual reset" />
      </div>
      <button className="simple-secondary" type="button">Regenerate link</button>
    </section>
  )
}

function SettingsScreen({
  auth,
  gatewayUrl,
  providers,
  selectedProviderId,
  setup,
  onGatewayUrl,
  onNewProvider,
  onProvider,
  onResetSetup,
}: {
  auth?: HealthAuth
  gatewayUrl: string
  providers: SnapshotProvider[]
  selectedProviderId?: string
  setup: SetupState
  onGatewayUrl: (value: string) => void
  onNewProvider: () => void
  onProvider: (profileId: string) => void
  onResetSetup: () => void
}) {
  return (
    <section className="settings-screen">
      <header className="screen-header">
        <div>
          <p>{setup.accountName}</p>
          <h1>Settings</h1>
        </div>
        <button className="simple-secondary" type="button" onClick={onNewProvider}>Connect service</button>
      </header>
      <div className="settings-grid">
        <section className="settings-section">
          <h2>Gateway</h2>
          <label>
            Local gateway URL
            <input value={gatewayUrl} onChange={(event) => onGatewayUrl(event.target.value)} />
          </label>
          <InfoRow label="Auth mode" value={auth?.authMode ?? 'local-dev'} />
          <InfoRow label="Signed in" value={!auth || auth.authenticated || auth.authMode === 'local-dev' ? 'yes' : 'no'} />
          <button className="simple-text" type="button" onClick={onResetSetup}>Run setup again</button>
        </section>
        <section className="settings-section">
          <div className="mini-head">
            <h2>Connected services</h2>
            <button className="simple-text" type="button" onClick={onNewProvider}>Add</button>
          </div>
          {providers.length === 0 ? (
            <p>No services connected yet.</p>
          ) : providers.map((profile) => (
            <button
              className={profile.profileId === selectedProviderId ? 'provider-row active' : 'provider-row'}
              key={profile.profileId}
              type="button"
              onClick={() => onProvider(profile.profileId)}
            >
              <ProviderBadge providerId={profile.providerId} />
              <span>
                <strong>{profile.label}</strong>
                <small>{profile.providerId} | {profile.credentialState}</small>
              </span>
              <em>{profile.defaultModelId ?? 'model unset'}</em>
            </button>
          ))}
        </section>
        <section className="settings-section wide">
          <h2>Provider paths</h2>
          <div className="provider-catalog-grid">
            {providerCatalog.map((provider) => (
              <article className="catalog-card" key={provider.id}>
                <ProviderBadge providerId={provider.id} />
                <div>
                  <strong>{provider.label}</strong>
                  <span>{provider.setup}</span>
                  <p>{provider.note}</p>
                </div>
                <small>{provider.status}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

type ProviderProfileDraft = {
  catalogId: string
  label: string
  modelId: string
  secretMode: 'ref' | 'value'
  secretRef: string
  secretValue: string
}

function secretRefForProvider(providerId?: ProviderCatalogItem['profileProviderId']): string {
  if (providerId === 'openai') return 'env:OPENAI_API_KEY'
  if (providerId === 'codex') return 'env:CODEX_HOME'
  return 'env:OPENROUTER_API_KEY'
}

function ProviderForm({
  compact = false,
  gatewayClient,
  providerProfiles,
  onCancel,
  onSubmit,
}: {
  compact?: boolean
  gatewayClient: LocalGatewayClient
  providerProfiles: SnapshotProvider[]
  onCancel: () => void
  onSubmit: (input: ProviderProfileDraft) => Promise<void>
}) {
  const [catalogId, setCatalogId] = useState('openrouter')
  const catalogItem = providerCatalog.find((provider) => provider.id === catalogId) ?? providerCatalog[0]
  const [label, setLabel] = useState(catalogItem.label)
  const [modelId, setModelId] = useState(catalogItem.defaultModelId)
  const [secretMode, setSecretMode] = useState<'ref' | 'value'>('ref')
  const [secretRef, setSecretRef] = useState(secretRefForProvider(catalogItem.profileProviderId))
  const [secretValue, setSecretValue] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [liveModels, setLiveModels] = useState<GatewayProviderModel[]>([])
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  function selectCatalog(nextId: string) {
    const next = providerCatalog.find((provider) => provider.id === nextId) ?? providerCatalog[0]
    setCatalogId(next.id)
    setLabel(next.label)
    setModelId(next.defaultModelId)
    setSecretRef(secretRefForProvider(next.profileProviderId))
  }

  useEffect(() => {
    if (catalogItem.id !== 'openrouter') {
      setLiveModels([])
      setModelStatus('idle')
      return
    }
    let canceled = false
    setModelStatus('loading')
    gatewayClient.openRouterModels({ q: modelSearch, limit: 80 })
      .then((result) => {
        if (canceled) return
        setLiveModels(result.models)
        setModelStatus('ready')
        setModelId((current) =>
          result.models.some((model) => model.id === current) ? current : result.models[0]?.id ?? current,
        )
      })
      .catch(() => {
        if (canceled) return
        setLiveModels([])
        setModelStatus('error')
      })
    return () => {
      canceled = true
    }
  }, [catalogItem.id, gatewayClient, modelSearch])

  const modelOptions =
    catalogItem.id === 'openrouter' && liveModels.length > 0
      ? liveModels.map((model) => ({ id: model.id, label: model.name }))
      : catalogItem.models

  return (
    <form
      className={compact ? 'provider-form compact' : 'provider-form'}
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit({ catalogId, label, modelId, secretMode, secretRef, secretValue })
      }}
    >
      <div className="provider-picker">
        {providerCatalog.map((provider) => (
          <button
            className={provider.id === catalogId ? 'provider-tile active' : 'provider-tile'}
            key={provider.id}
            type="button"
            onClick={() => selectCatalog(provider.id)}
          >
            <ProviderBadge providerId={provider.id} />
            <span>
              <strong>{provider.label}</strong>
              <small>{provider.status}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="field-grid">
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Model
          {catalogItem.id === 'openrouter' ? (
            <input
              placeholder="Search OpenRouter models"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
            />
          ) : null}
          <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </label>
        <label>
          Secret mode
          <select value={secretMode} onChange={(event) => setSecretMode(event.target.value as 'ref' | 'value')}>
            <option value="ref">Use environment or secret ref</option>
            <option value="value">Store managed secret</option>
          </select>
        </label>
        {secretMode === 'ref' ? (
          <label>
            Secret ref
            <input value={secretRef} onChange={(event) => setSecretRef(event.target.value)} />
          </label>
        ) : (
          <label>
            API key
            <input
              autoComplete="off"
              placeholder="Stored by the gateway secret store"
              type="password"
              value={secretValue}
              onChange={(event) => setSecretValue(event.target.value)}
            />
          </label>
        )}
      </div>
      <div className="provider-note">
        <strong>{catalogItem.setup}</strong>
        <span>{catalogItem.note}</span>
        {catalogItem.id === 'openrouter' ? (
          <em>
            {modelStatus === 'loading'
              ? 'Loading OpenRouter models'
              : modelStatus === 'ready'
                ? `${modelOptions.length} model${modelOptions.length === 1 ? '' : 's'} available`
                : modelStatus === 'error'
                  ? 'Using fallback model list'
                  : 'OpenRouter model catalog'}
          </em>
        ) : null}
        {providerProfiles.some((profile) => profile.providerId === catalogItem.profileProviderId) ? <em>Already connected</em> : null}
      </div>
      <div className="dialog-actions">
        <button className="simple-primary" type="submit">
          {catalogItem.profileProviderId ? 'Connect service' : 'Show connector'}
        </button>
        <button className="simple-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ClientForm({
  defaultModelId,
  initial = { ...starterClient },
  onCancel,
  onSubmit,
  submitLabel,
}: {
  defaultModelId?: string
  initial?: DraftClient
  onCancel: () => void
  onSubmit: (draft: DraftClient) => void | Promise<void>
  submitLabel: string
}) {
  const [draft, setDraft] = useState<DraftClient>({
    ...initial,
    modelId: initial.modelId || defaultModelId || starterClient.modelId,
  })

  return (
    <form
      className="client-form"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(draft)
      }}
    >
      <div className="field-grid">
        <label>
          Client name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Contact
          <input value={draft.contact} onChange={(event) => setDraft({ ...draft, contact: event.target.value })} />
        </label>
        <label>
          Billing label
          <input value={draft.billingLabel} onChange={(event) => setDraft({ ...draft, billingLabel: event.target.value })} />
        </label>
        <label>
          Workspace name
          <input value={draft.workspaceName} onChange={(event) => setDraft({ ...draft, workspaceName: event.target.value })} />
        </label>
        <label>
          Agent name
          <input value={draft.agentName} onChange={(event) => setDraft({ ...draft, agentName: event.target.value })} />
        </label>
        <label>
          Model
          <select value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}>
            {allModels().map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Client workspace prompt
        <textarea value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} />
      </label>
      <label>
        Agent system prompt
        <textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
      </label>
      <div className="dialog-actions">
        <button className="simple-primary" type="submit">{submitLabel}</button>
        <button className="simple-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ActionRail({
  compact = false,
  lastRun,
  runEvents,
}: {
  compact?: boolean
  lastRun?: LastRunState
  runEvents: ConsoleGatewayRunEvent[]
}) {
  const eventRows =
    runEvents.length > 0
      ? runEvents.slice(-8).reverse()
      : lastRun
        ? [{
            type: 'run.started' as const,
            runId: lastRun.runId,
            sessionId: lastRun.sessionId,
            payload: { prompt: lastRun.prompt },
          }]
        : []

  return (
    <aside className={compact ? 'action-rail compact' : 'action-rail'}>
      {compact ? null : (
        <div className="mini-head">
          <h2>Actions</h2>
          <span>{eventRows.length}</span>
        </div>
      )}
      {eventRows.length === 0 ? (
        compact ? (
          <div className="run-ready-state">
            <span>✓</span>
            <strong>Ready to run</strong>
            <p>Click Run to execute this automation. Activity will appear here.</p>
          </div>
        ) : (
          <p>No run yet.</p>
        )
      ) : (
        eventRows.map((event, index) => (
          <article className="action-event" key={`${event.runId}:${event.type}:${event.seq ?? index}`}>
            <span>{event.type}</span>
            <strong>{shortId(event.runId)}</strong>
            {'payload' in event && event.payload ? <small>{previewPayload(event.payload)}</small> : null}
          </article>
        ))
      )}
    </aside>
  )
}

function Dialog({
  children,
  onClose,
  title,
}: {
  children: ReactNode
  onClose: () => void
  title: string
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mini-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>x</button>
        </div>
        {children}
      </section>
    </div>
  )
}

function ToolToggle({
  checked,
  description,
  dragKey,
  label,
  onChange,
  onDragComplete,
  onPointerDragStart,
}: {
  checked: boolean
  description: string
  dragKey?: string
  label: string
  onChange: (checked: boolean) => void
  onDragComplete?: () => void
  onPointerDragStart?: () => void
}) {
  return (
    <button
      className={checked ? 'tool-toggle active' : 'tool-toggle'}
      data-testid={dragKey ? `tool-${dragKey}` : undefined}
      draggable={Boolean(dragKey)}
      type="button"
      onClick={() => onChange(!checked)}
      onMouseDown={() => {
        if (!dragKey) return
        onPointerDragStart?.()
      }}
      onDragStart={(event) => {
        if (!dragKey) return
        event.dataTransfer.setData('application/mainspring-tool', dragKey)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        if (!dragKey) return
        onDragComplete?.()
      }}
    >
      <span className={`tool-node-icon ${toolTone(dragKey ?? '') ?? ''}`}>{nodeIcon(label, toolTone(dragKey ?? ''))}</span>
      <span className="switch-dot" />
      <strong>{label}</strong>
      <small>{description}</small>
    </button>
  )
}

function FlowNode({
  detail,
  strong = false,
  title,
  tone,
}: {
  detail: string
  strong?: boolean
  title: string
  tone?: AutomationNode['tone']
}) {
  return (
    <div className={strong ? `flow-node strong ${tone ?? ''}` : `flow-node ${tone ?? ''}`}>
      <span className="flow-node-icon">{nodeIcon(title, tone)}</span>
      <strong>{title}</strong>
      <span>{detail}</span>
      <small>Ready</small>
    </div>
  )
}

function FragmentWithEdge({
  detail,
  isLast,
  strong,
  title,
  tone,
}: {
  detail: string
  isLast: boolean
  strong?: boolean
  title: string
  tone?: AutomationNode['tone']
}) {
  return (
    <>
      <FlowNode detail={detail} strong={strong} title={title} tone={tone} />
      {isLast ? null : <FlowEdge />}
    </>
  )
}

function FlowEdge() {
  return <div className="flow-edge" aria-hidden="true" />
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ProviderBadge({ providerId }: { providerId: string }) {
  const catalog = providerCatalog.find((provider) => provider.id === providerId || provider.profileProviderId === providerId)
  const logo = providerLogoSources[catalog?.id ?? providerId]
  return (
    <span className={logo ? 'provider-badge has-logo' : 'provider-badge'} title={catalog?.label ?? providerId}>
      {logo ? <img alt="" src={logo} /> : (catalog?.badge ?? providerId.slice(0, 2).toUpperCase())}
    </span>
  )
}

function MainspringMark() {
  return (
    <span className="mainspring-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path d="M20 3l3 5 6-2 2 6 6 2-2 6 2 6-6 2-2 6-6-2-3 5-3-5-6 2-2-6-6-2 2-6-2-6 6-2 2-6 6 2 3-5z" />
        <path d="M14 13c8-4 14-2 14 2 0 6-17 2-17 8 0 4 8 6 17 1" />
      </svg>
    </span>
  )
}

function Toast({ onDismiss, toast }: { onDismiss: () => void; toast: ToastState }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4200)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <button className={`simple-toast ${toast.kind}`} type="button" onClick={onDismiss}>
      {toast.text}
    </button>
  )
}

function findWorkspace(snapshot: ConsoleGatewaySnapshot | null, clientId?: string): SnapshotWorkspace | undefined {
  if (!snapshot || !clientId) return undefined
  return snapshot.workspaces.find((workspace) => workspace.clientId === clientId && workspace.status !== 'archived')
}

function listAgents(snapshot: ConsoleGatewaySnapshot | null, workspaceId?: string): SnapshotAgent[] {
  if (!snapshot || !workspaceId) return []
  return snapshot.agents.filter((agent) => agent.workspaceId === workspaceId && agent.status !== 'archived')
}

function findSession(snapshot: ConsoleGatewaySnapshot | null, clientId?: string, workspaceId?: string) {
  if (!snapshot) return undefined
  return [...snapshot.sessions]
    .filter((session) => session.clientId === clientId || session.workspaceId === workspaceId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function findProviderForAgent(snapshot: ConsoleGatewaySnapshot | null, agent?: SnapshotAgent): SnapshotProvider | undefined {
  if (!snapshot) return undefined
  const active = snapshot.providerProfiles.filter((profile) => profile.status === 'active')
  if (!agent) return active[0]
  return active.find((profile) => profile.defaultModelId === agent.defaultModelId) ?? active[0]
}

function enabledTools(agent?: SnapshotAgent): string[] {
  const skills = { ...defaultSkills, ...(agent?.skills ?? {}) }
  return Object.entries(skills).filter(([, enabled]) => enabled).map(([key]) => key)
}

function promptSummary(prompt: string) {
  const trimmed = prompt.trim()
  if (!trimmed) return 'Automation instruction'
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}...` : trimmed
}

function toolTone(key: string): AutomationNode['tone'] {
  if (key === 'agent') return 'agent'
  if (key === 'prompt') return 'prompt'
  if (key === 'file.read') return 'read'
  if (key === 'file.write') return 'write'
  if (key === 'browser.screenshot') return 'browser'
  if (key === 'voice.call') return 'voice'
  return 'web'
}

function nodeIcon(title: string, tone?: AutomationNode['tone']) {
  if (tone === 'agent') return 'A'
  if (tone === 'prompt') return 'P'
  if (tone === 'read') return 'R'
  if (tone === 'write') return 'W'
  if (tone === 'browser') return 'B'
  if (tone === 'voice') return 'V'
  return title.slice(0, 1).toUpperCase()
}

function agentDraft(agent?: SnapshotAgent, provider?: SnapshotProvider): AgentDraft {
  return {
    name: agent?.name ?? 'Client operator',
    defaultModelId: agent?.defaultModelId ?? provider?.defaultModelId ?? 'openrouter/auto',
    instructions:
      agent?.instructions
      ?? 'Use the workspace context, keep responses short, and continue without blocked approvals when possible.',
    outcome: agent?.outcome ?? 'Help this client complete day-to-day work with clear logs and safe handoffs.',
    approvalMode: agent?.approvalMode ?? 'Non-blocking',
    skills: { ...defaultSkills, ...(agent?.skills ?? {}) },
  }
}

function clientDraftFromSnapshot(client: SnapshotClient, workspace?: SnapshotWorkspace, agent?: SnapshotAgent): DraftClient {
  return {
    name: client.name,
    contact: client.contact ?? '',
    billingLabel: client.billingLabel ?? '',
    workspaceName: workspace?.name ?? `${client.name} Workspace`,
    agentName: agent?.name ?? 'Client agent',
    modelId: agent?.defaultModelId ?? 'openrouter/auto',
    goal: agent?.outcome ?? 'Help this client complete daily work.',
    instructions: agent?.instructions ?? 'Be brief, safe, and specific.',
  }
}

function allModels(): Array<{ id: string; label: string }> {
  const seen = new Set<string>()
  return providerCatalog.flatMap((provider) => provider.models).filter((model) => {
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })
}

function modelLabel(modelId: string): string {
  return allModels().find((model) => model.id === modelId)?.label ?? modelId
}

function makeChatMessage(role: ChatRole, text: string): MainspringChatMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    timestamp: new Date().toISOString(),
  }
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function mergeRunEvent(events: ConsoleGatewayRunEvent[], next: ConsoleGatewayRunEvent): ConsoleGatewayRunEvent[] {
  if (events.some((event) => event.seq === next.seq && event.runId === next.runId && event.type === next.type)) {
    return events
  }
  return [...events, next].slice(-80)
}

function appendAssistantDelta(messages: MainspringChatMessage[], text: string): MainspringChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.text.startsWith('Run ')) {
    return [
      ...messages.slice(0, -1),
      { ...last, text },
    ]
  }
  if (last?.role === 'assistant') {
    return [
      ...messages.slice(0, -1),
      { ...last, text: `${last.text}${text}` },
    ]
  }
  return [...messages, makeChatMessage('assistant', text)]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'client'
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'MS'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function shortId(value?: string): string {
  if (!value) return 'run'
  const parts = value.split('_')
  return parts.length > 1 ? parts.slice(-1)[0] : value.slice(0, 8)
}

function previewPayload(payload: unknown): string {
  try {
    const value = JSON.stringify(payload)
    return value.length > 110 ? `${value.slice(0, 107)}...` : value
  } catch {
    return String(payload)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function readSetupState(): SetupState {
  const fallback = { complete: false, accountName: 'Mainspring HQ', username: 'admin' }
  try {
    const raw = window.localStorage.getItem(SETUP_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<SetupState>
    return {
      complete: Boolean(parsed.complete),
      accountName: typeof parsed.accountName === 'string' ? parsed.accountName : fallback.accountName,
      username: typeof parsed.username === 'string' ? parsed.username : fallback.username,
    }
  } catch {
    return fallback
  }
}

function writeSetupState(setup: SetupState): void {
  window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup))
}
