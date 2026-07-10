import type { DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConsoleGatewayRunEvent, ConsoleGatewaySnapshot } from 'mainspring/gateway'
import {
  createLocalGatewayClient,
  type LocalGatewayClient,
} from './localGatewayClient'
import {
  ProviderForm,
  providerCatalog,
  providerModels,
  type ProviderProfileDraft,
} from './ConsoleProviderCatalog'
import {
  ClientDetailsPanel,
  ClientForm,
  defaultSkills,
  type DraftClient,
} from './ConsoleClientForms'
import {
  isAllowedLocalGatewayUrl,
  localGatewayUrlFromEnv,
} from './localGatewayTransport'
import { useGatewaySnapshot } from './useGatewaySnapshot'
import { useApprovalHistoryPage } from './useApprovalHistoryPage'
import { useCompatibilityRunPage } from './useCompatibilityRunPage'
import { useRunLogActivityPage } from './useRunLogActivityPage'
import { useRunLogTracePage } from './useRunLogTracePage'
import {
  createChatMessage,
  createScopedRunUiState,
  useConsoleRunActivity,
  type LastRunState,
  type MainspringChatMessage,
} from './useConsoleRunActivity'
import {
  ActivityNavigation,
  ConsoleSidebar,
  type ActivityTab,
  type ConsoleScreen,
} from './ConsoleNavigation'
import {
  ConsoleToast,
  SetupWizard,
  type SetupState,
  type ToastState,
} from './ConsoleSetup'
import {
  ApprovalsScreen,
  ConnectionNotice,
  ConsoleConnectionScreen,
  OverviewScreen,
  RunsScreen,
  UsageScreen,
} from './OperatorConsoleScreens'
import { InfoRow, SettingsScreen } from './ConsoleSettings'
import {
  ActionRail,
  Dialog,
  FragmentWithEdge,
  ToolToggle,
  shortId,
  toolTone,
  type AutomationNode,
} from './ConsoleWorkflowPrimitives'
import {
  buildOperatorRunLogRows,
  buildOperatorCompatibilityRunRows,
  buildOperatorApprovalRows,
  buildOperatorConsoleViewModel,
  type OperatorApprovalRow,
  type OperatorRunRow,
} from './operatorConsoleViewModel'
import './controlRoom.css'

type ClientTab = 'chat' | 'agents' | 'automations' | 'access'

type AgentDraft = {
  name: string
  defaultModelId: string
  instructions: string
  outcome: string
  approvalMode: string
  skills: Record<string, boolean>
}

type SnapshotClient = ConsoleGatewaySnapshot['clients'][number]
type SnapshotWorkspace = ConsoleGatewaySnapshot['workspaces'][number]
type SnapshotAgent = ConsoleGatewaySnapshot['agents'][number]
type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

const DEFAULT_GATEWAY_URL = localGatewayUrlFromEnv(
  typeof window === 'undefined' ? '' : window.location.search,
)
const SETUP_STORAGE_KEY = 'mainspring.console.setup.v2'

const toolOptions = [
  { key: 'agent', label: 'Agent', description: 'Support agent', locked: true },
  { key: 'prompt', label: 'Prompt', description: 'Automation instruction', locked: true },
  { key: 'file.read', label: 'File read', description: 'Inspect workspace files.' },
  { key: 'file.write', label: 'File write', description: 'Write approved outputs.' },
  { key: 'voice.call', label: 'Voice call', description: 'Design placeholder for call tools.' },
] as const

export function ConnectedConsoleApp() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL)
  const [sessionToken, setSessionToken] = useState<string>()
  const [setup, setSetup] = useState<SetupState>(() => readSetupState())
  const [screen, setScreen] = useState<ConsoleScreen>('home')
  const [activityTab, setActivityTab] = useState<ActivityTab>('runs')
  const [clientTab, setClientTab] = useState<ClientTab>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [selectedProviderProfileId, setSelectedProviderProfileId] = useState<string>()
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const [selectedRunEvents, setSelectedRunEvents] = useState<ConsoleGatewayRunEvent[]>([])
  const [runEventsLoading, setRunEventsLoading] = useState(false)
  const [runEventsError, setRunEventsError] = useState<string>()
  const [toast, setToast] = useState<ToastState>()
  const [busy, setBusy] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)

  const gatewayClient = useMemo(() => {
    const client = createLocalGatewayClient(gatewayUrl)
    client.setSessionToken(sessionToken ?? undefined)
    return client
  }, [gatewayUrl, sessionToken])
  const {
    snapshot,
    auth,
    connectionState,
    connectionError,
    lastUpdatedAt,
    refresh,
    retry: retrySnapshot,
  } = useGatewaySnapshot(gatewayClient)
  const {
    observeRun,
    runUiByScope,
    updateScopedRunUi,
  } = useConsoleRunActivity({ gatewayClient, gatewayUrl, refresh })

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
  const operatorModel = useMemo(
    () => snapshot ? buildOperatorConsoleViewModel(snapshot) : undefined,
    [snapshot],
  )
  const activityRunsEnabled = screen === 'activity' && activityTab === 'runs'
  const runLogActivityEnabled = activityRunsEnabled
    && snapshot?.runLog?.configured === true
  const runLogActivity = useRunLogActivityPage({
    enabled: runLogActivityEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const compatibilityRunActivity = useCompatibilityRunPage({
    enabled: activityRunsEnabled && Boolean(snapshot),
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const approvalHistoryEnabled = screen === 'activity' && activityTab === 'approvals'
  const approvalHistory = useApprovalHistoryPage({
    enabled: approvalHistoryEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const runListModel = useMemo(() => {
    if (!operatorModel || !snapshot || !activityRunsEnabled) return operatorModel
    const runLogRows = runLogActivityEnabled
      ? runLogActivity.loaded
        ? buildOperatorRunLogRows(snapshot, runLogActivity.runs)
        : []
      : []
    const compatibilityRows = compatibilityRunActivity.loaded
      ? buildOperatorCompatibilityRunRows(snapshot, compatibilityRunActivity.runs)
      : compatibilityRunActivity.error
        ? operatorModel.runs.filter((run) => run.source === 'compatibility')
        : []
    const pagesReady = (runLogActivity.loaded || !runLogActivityEnabled || Boolean(runLogActivity.error))
      && (compatibilityRunActivity.loaded || Boolean(compatibilityRunActivity.error))
    if (!pagesReady) {
      return { ...operatorModel, runs: [], activeRuns: [] }
    }
    const runs = [...runLogRows, ...compatibilityRows].sort((left, right) =>
      (right.lastActivityAt ?? right.createdAt ?? '').localeCompare(
        left.lastActivityAt ?? left.createdAt ?? '',
      ) || right.runId.localeCompare(left.runId),
    )
    return {
      ...operatorModel,
      runs,
      activeRuns: runs.filter((run) => run.active),
    }
  }, [
    operatorModel,
    activityRunsEnabled,
    compatibilityRunActivity.error,
    compatibilityRunActivity.loaded,
    compatibilityRunActivity.runs,
    runLogActivity.loaded,
    runLogActivity.error,
    runLogActivity.runs,
    runLogActivityEnabled,
    snapshot,
  ])
  const runActivityPagesLoaded = !activityRunsEnabled || (
    (runLogActivity.loaded || !runLogActivityEnabled || Boolean(runLogActivity.error))
    && (compatibilityRunActivity.loaded || Boolean(compatibilityRunActivity.error))
  )
  const approvalListModel = useMemo(() => {
    if (!operatorModel || !snapshot || !approvalHistoryEnabled || !approvalHistory.loaded) return operatorModel
    const approvals = buildOperatorApprovalRows(snapshot, approvalHistory.approvals)
    return {
      ...operatorModel,
      approvals,
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending'),
    }
  }, [approvalHistory.approvals, approvalHistory.loaded, approvalHistoryEnabled, operatorModel, snapshot])
  const activeRunScopeKey = selectedClient && selectedAgent
    ? `${selectedClient.clientId}:${selectedAgent.agentId}`
    : undefined
  const activeRunUi = activeRunScopeKey
    ? runUiByScope[activeRunScopeKey] ?? createScopedRunUiState()
    : createScopedRunUiState()
  const selectedRun = runListModel?.runs.find((run) => run.runId === selectedRunId)
    ?? operatorModel?.runs.find((run) => run.runId === selectedRunId)
  const runLogTraceEnabled = screen === 'activity'
    && activityTab === 'runs'
    && selectedRun?.source === 'runlog'
  const runLogTrace = useRunLogTracePage({
    enabled: runLogTraceEnabled,
    gatewayClient,
    runId: selectedRun?.runId,
    revision: snapshot?.generatedAt,
    limit: 80,
  })

  const loadSelectedRunEvents = useCallback(async (run: OperatorRunRow | undefined) => {
    if (!run || run.source === 'runlog') {
      setSelectedRunEvents([])
      setRunEventsError(undefined)
      return
    }
    setRunEventsLoading(true)
    setRunEventsError(undefined)
    try {
      const result = await gatewayClient.runEvents({
        sessionId: run.sessionId,
        runId: run.runId,
      })
      setSelectedRunEvents(result.events)
    } catch (error) {
      setSelectedRunEvents([])
      setRunEventsError(errorMessage(error))
    } finally {
      setRunEventsLoading(false)
    }
  }, [gatewayClient])

  const displayedRunEvents = runLogTraceEnabled ? runLogTrace.events : selectedRunEvents
  const displayedRunEventsLoading = runLogTraceEnabled ? runLogTrace.loading : runEventsLoading
  const displayedRunEventsError = runLogTraceEnabled ? runLogTrace.error : runEventsError
  const reloadSelectedRunEvents = useCallback(async () => {
    if (runLogTraceEnabled) {
      await runLogTrace.reload()
      return
    }
    await loadSelectedRunEvents(selectedRun)
  }, [loadSelectedRunEvents, runLogTrace.reload, runLogTraceEnabled, selectedRun])

  useEffect(() => {
    if (selectedAgent && selectedAgent.agentId !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.agentId)
    }
  }, [selectedAgent, selectedAgentId])

  useEffect(() => {
    if (!operatorModel) return
    if (selectedRunId && !operatorModel.runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(undefined)
      return
    }
    if (activityRunsEnabled && !runActivityPagesLoaded) return
    if (!selectedRunId && runListModel?.runs[0]) {
      setSelectedRunId(runListModel.runs[0]?.runId)
    }
  }, [activityRunsEnabled, operatorModel, runActivityPagesLoaded, runListModel, selectedRunId])

  useEffect(() => {
    if (screen !== 'activity' || activityTab !== 'runs') return
    if (selectedRun?.source === 'runlog') return
    void loadSelectedRunEvents(selectedRun)
  }, [activityTab, loadSelectedRunEvents, screen, selectedRun?.runId, selectedRun?.source])

  async function completeSetup(next: SetupState) {
    await refresh()
    writeSetupState(next)
    setSetup(next)
    setScreen('home')
  }

  function applyGatewayUrl(value: string) {
    const normalized = value.trim().replace(/\/+$/, '')
    if (!isAllowedLocalGatewayUrl(normalized)) {
      setToast({
        kind: 'error',
        text: 'Use a loopback gateway URL such as http://127.0.0.1:8787.',
      })
      return
    }
    if (normalized === gatewayUrl) {
      setToast({ kind: 'info', text: 'The local gateway URL is already active.' })
      return
    }
    setGatewayUrl(normalized)
  }

  async function cancelOperatorRun(run: OperatorRunRow) {
    if (!run.cancellable) {
      setToast({ kind: 'info', text: 'This run cannot be cancelled through the current gateway route.' })
      return
    }
    setBusy(true)
    try {
      await gatewayClient.cancelRun({
        sessionId: run.sessionId,
        runId: run.runId,
        reason: 'Cancelled from the Mainspring console.',
      })
      await refresh()
      await loadSelectedRunEvents(run)
      setToast({ kind: 'ok', text: `Run ${shortId(run.runId)} cancelled.` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function resolveOperatorApproval(
    approval: OperatorApprovalRow,
    decision: 'approved' | 'denied',
    reason?: string,
  ) {
    setBusy(true)
    try {
      const input = {
        approvalId: approval.approvalId,
        sessionId: approval.sessionId,
        runId: approval.runId,
        decision,
        ...(reason ? { reason } : {}),
      }
      if (approval.source === 'runlog') {
        await gatewayClient.resolveRunLogApproval(input)
      } else {
        await gatewayClient.resolveApproval(input)
      }
      await refresh()
      setToast({
        kind: 'ok',
        text: `${decision === 'approved' ? 'Approved' : 'Denied'} ${approval.targetKey ?? 'the requested action'}.`,
      })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  function openRun(runId: string) {
    setSelectedRunId(runId)
    setActivityTab('runs')
    setScreen('activity')
  }

  function navigateFromOverview(destination: 'clients' | 'runs' | 'approvals' | 'usage') {
    if (destination === 'clients') {
      setScreen('workspaces')
      return
    }
    setActivityTab(destination)
    setScreen('activity')
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
    const scopeKey = activeRunScopeKey
    if (!scopeKey) {
      setToast({ kind: 'error', text: 'Select a client agent before starting a run.' })
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
      updateScopedRunUi(scopeKey, (current) => ({
        ...current,
        chatInput: '',
        chatMessages: [...current.chatMessages, createChatMessage('user', trimmedPrompt)],
      }))
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
      updateScopedRunUi(scopeKey, (current) => ({
        ...current,
        lastRun: {
          runId: result.run.runId,
          sessionId: result.run.sessionId,
          mode: input.mode,
          prompt: trimmedPrompt,
        },
        runEvents: [],
      }))
      observeRun(result.run, {
        addChatMessage: Boolean(input.addChatMessage),
        runLabel: shortId(result.run.runId),
        scopeKey,
      })
      if (input.addChatMessage) {
        updateScopedRunUi(scopeKey, (current) => ({
          ...current,
          chatMessages: [
            ...current.chatMessages,
            createChatMessage('assistant', `Run ${shortId(result.run.runId)} started. Live actions will appear on the rail.`),
          ],
        }))
      }
      await refresh()
      setToast({ kind: 'ok', text: `Run ${shortId(result.run.runId)} started.` })
    } catch (error) {
      if (input.addChatMessage) {
        updateScopedRunUi(scopeKey, (current) => ({
          ...current,
          chatMessages: [
            ...current.chatMessages,
            createChatMessage('assistant', errorMessage(error)),
          ],
        }))
      }
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  function retryConnection() {
    void retrySnapshot().catch(() => undefined)
  }

  if (connectionState === 'loading' && !snapshot) {
    return <ConsoleConnectionScreen state="loading" onRetry={retryConnection} />
  }

  if (connectionState === 'offline' && !snapshot) {
    return (
      <ConsoleConnectionScreen
        detail={connectionError}
        state="offline"
        onRetry={retryConnection}
      />
    )
  }

  if (!setup.complete || connectionState === 'unauthorized') {
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
      <a className="control-skip-link" href="#main-content">Skip to main content</a>
      <ConsoleSidebar
        collapsed={sidebarCollapsed}
        clients={clients}
        connectionState={connectionState}
        gatewayUrl={gatewayUrl}
        pendingApprovals={operatorModel?.counts.pendingApprovals ?? 0}
        activeRuns={operatorModel?.counts.activeRuns ?? 0}
        screen={screen}
        selectedClientId={selectedClientId}
        setup={setup}
        onCollapse={() => setSidebarCollapsed((value) => !value)}
        onNewClient={() => setClientDialogOpen(true)}
        onScreen={setScreen}
        onSelectClient={(clientId) => {
          setSelectedClientId(clientId)
          setScreen('workspaces')
          setClientTab('chat')
        }}
      />
      <main className="simple-main" id="main-content">
        <ConnectionNotice
          detail={connectionError}
          lastUpdatedAt={lastUpdatedAt}
          state={connectionState}
          onRetry={retryConnection}
        />
        {screen === 'home' && operatorModel ? (
          <OverviewScreen
            model={operatorModel}
            onNavigate={navigateFromOverview}
            onOpenRun={openRun}
          />
        ) : screen === 'workspaces' ? (
          <ClientsScreen
            agents={selectedAgents}
            automationPrompt={activeRunUi.automationPrompt}
            busy={busy}
            chatInput={activeRunUi.chatInput}
            chatMessages={activeRunUi.chatMessages}
            client={selectedClient}
            clients={clients}
            clientTab={clientTab}
            lastRun={activeRunUi.lastRun}
            provider={selectedProviderProfile}
            providers={snapshot?.providerProfiles ?? []}
            runEvents={activeRunUi.runEvents}
            selectedAgent={selectedAgent}
            workspace={selectedWorkspace}
            onAutomationPrompt={(automationPrompt) => updateScopedRunUi(activeRunScopeKey, (current) => ({
              ...current,
              automationPrompt,
            }))}
            onChatInput={(chatInput) => updateScopedRunUi(activeRunScopeKey, (current) => ({
              ...current,
              chatInput,
            }))}
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
        ) : screen === 'activity' && operatorModel ? (
          <>
            <ActivityNavigation
              activeRuns={operatorModel.counts.activeRuns}
              activeTab={activityTab}
              pendingApprovals={operatorModel.counts.pendingApprovals}
              onTab={setActivityTab}
            />
            {activityTab === 'runs' ? (
              <RunsScreen
                actionBusy={busy}
                events={displayedRunEvents}
                eventsError={displayedRunEventsError}
                eventsLoading={displayedRunEventsLoading}
                hasMoreEvents={runLogTraceEnabled && Boolean(runLogTrace.nextCursor)}
                model={runListModel ?? operatorModel}
                runsError={runLogActivity.error ?? compatibilityRunActivity.error}
                runsLoading={activityRunsEnabled && (
                  runLogActivity.loading || compatibilityRunActivity.loading
                )}
                hasMoreRuns={Boolean(runLogActivity.nextCursor || compatibilityRunActivity.nextCursor)}
                selectedRun={selectedRun}
                onCancel={(run) => void cancelOperatorRun(run)}
                onLoadMoreEvents={() => void runLogTrace.loadMore()}
                onLoadMoreRuns={() => {
                  void Promise.all([
                    runLogActivity.loadMore(),
                    compatibilityRunActivity.loadMore(),
                  ])
                }}
                onReloadEvents={() => void reloadSelectedRunEvents()}
                onSelectRun={setSelectedRunId}
              />
            ) : activityTab === 'approvals' ? (
              <ApprovalsScreen
                actionBusy={busy}
                error={approvalHistoryEnabled ? approvalHistory.error : undefined}
                hasMore={approvalHistoryEnabled && Boolean(approvalHistory.nextCursor)}
                loading={approvalHistoryEnabled && approvalHistory.loading}
                model={approvalListModel ?? operatorModel}
                onLoadMore={() => void approvalHistory.loadMore()}
                onResolve={(approval, decision, reason) => {
                  void resolveOperatorApproval(approval, decision, reason)
                }}
              />
            ) : (
              <UsageScreen model={operatorModel} />
            )}
          </>
        ) : screen === 'settings' ? (
          <SettingsScreen
            auth={auth}
            connectionError={connectionError}
            connectionState={connectionState}
            gatewayUrl={gatewayUrl}
            lastUpdatedAt={lastUpdatedAt}
            providers={snapshot?.providerProfiles ?? []}
            selectedProviderId={selectedProviderProfileId}
            setup={setup}
            onGatewayUrl={applyGatewayUrl}
            onNewProvider={() => setProviderDialogOpen(true)}
            onProvider={setSelectedProviderProfileId}
            onResetSetup={() => {
              const next = { ...setup, complete: false }
              writeSetupState(next)
              setSetup(next)
            }}
          />
        ) : null}
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
      {toast ? <ConsoleToast toast={toast} onDismiss={() => setToast(undefined)} /> : null}
    </div>
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
              <button
                className="workspace-selector"
                disabled
                title="Each client currently has one primary workspace."
                type="button"
                aria-label="Current workspace"
              >
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
          createChatMessage(
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

  return (
    <div className="automation-grid">
      <section className="automation-board">
        <div className="automation-toolbar">
          <div>
            <span className="automation-back">Test workflow</span>
            <div className="automation-title-row">
              <h2>Workflow test</h2>
              <span className="status-pill">Draft</span>
            </div>
            <p>Runs once in the selected client workspace. This draft is not scheduled or persisted.</p>
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
            <button
              className="simple-secondary automation-action-save"
              disabled
              title="Durable automation definitions are not available yet."
              type="button"
            >
              Save unavailable
            </button>
            <button className="simple-secondary automation-action-more" disabled type="button" aria-label="More automation actions unavailable">
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
                <button disabled type="button" aria-label="Zoom out unavailable">-</button>
                <span>100%</span>
                <button disabled type="button" aria-label="Zoom in unavailable">+</button>
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

  return (
    <section className="access-panel">
      <div className="mini-head">
        <div>
          <h2>Client access preview</h2>
          <p>Dedicated client accounts and authenticated dashboard routes are not implemented yet.</p>
        </div>
        <span className="status-pill">Not enabled</span>
      </div>
      <div className="access-link-row">
        <label>
          Planned client dashboard route
          <input readOnly value={dashboardLink} />
        </label>
        <button className="simple-primary" disabled type="button">Copy unavailable</button>
      </div>
      <div className="access-grid">
        <InfoRow label="Role" value="Not provisioned" />
        <InfoRow label="Workspace" value={workspace?.name ?? 'Default workspace'} />
        <InfoRow label="Invite expires" value="Not applicable" />
      </div>
      <button className="simple-secondary" disabled type="button">Regenerate unavailable</button>
    </section>
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

function allModels(): Array<{ id: string; label: string }> {
  return providerModels()
}

function modelLabel(modelId: string): string {
  return allModels().find((model) => model.id === modelId)?.label ?? modelId
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'client'
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
