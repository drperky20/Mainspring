import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ConsoleGatewayMemoryEntry,
  ConsoleGatewayArtifact,
  ConsoleGatewayRunEvent,
  ConsoleGatewaySnapshot,
} from 'mainspring/gateway'
import {
  createLocalGatewayClient,
  type LocalGatewayClient,
} from './localGatewayClient'
import {
  ProviderForm,
  providerCatalog,
  type ProviderProfileDraft,
} from './ConsoleProviderCatalog'
import {
  ClientForm,
  defaultSkills,
  type DraftClient,
} from './ConsoleClientForms'
import {
  deriveLocalGatewayArtifactAccessUrls,
  isAllowedLocalGatewayUrl,
  localGatewayUrlFromEnv,
} from './localGatewayTransport'
import { useGatewaySnapshot } from './useGatewaySnapshot'
import { useApprovalHistoryPage } from './useApprovalHistoryPage'
import { useCompatibilityRunPage } from './useCompatibilityRunPage'
import { useRunLogActivityPage } from './useRunLogActivityPage'
import { useRunLogTracePage } from './useRunLogTracePage'
import { useRunLogToolCallHistoryPage } from './useRunLogToolCallHistoryPage'
import { useUsageHistoryPage } from './useUsageHistoryPage'
import { useArtifactHistoryPage } from './useArtifactHistoryPage'
import { useAuditHistoryPage } from './useAuditHistoryPage'
import { useMemoryHistoryPage } from './useMemoryHistoryPage'
import type { ArtifactOpenMode } from './artifactPresentation'
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
  ArtifactsScreen,
  AuditScreen,
  ConnectionNotice,
  ConsoleConnectionScreen,
  OverviewScreen,
  RunsScreen,
  MemoryScreen,
  ToolCallsScreen,
  UsageScreen,
} from './OperatorConsoleScreens'
import { SettingsScreen } from './ConsoleSettings'
import {
  Dialog,
  shortId,
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
import './controlRoomWorkspace.css'
import { type ClientWorkspaceTab } from './ConsoleClientWorkspaceFrame'
import { readConsoleLocation, writeConsoleLocation } from './ConsoleLocation'
import { useCompatibilityRunEvents } from './useCompatibilityRunEvents'
import {
  ClientsScreen,
  modelLabel,
  type AgentDraft,
  type SnapshotAgent,
  type SnapshotClient,
  type SnapshotProvider,
  type SnapshotWorkspace,
} from './ConsoleClientWorkspaceViews'

type ClientTab = ClientWorkspaceTab

const DEFAULT_GATEWAY_URL = localGatewayUrlFromEnv(
  typeof window === 'undefined' ? '' : window.location.search,
)
const SETUP_STORAGE_KEY = 'mainspring.console.setup.v2'

export function ConnectedConsoleApp() {
  const initialLocation = readConsoleLocation(
    typeof window === 'undefined' ? '' : window.location.search,
  )
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL)
  const [sessionToken, setSessionToken] = useState<string>()
  const [setup, setSetup] = useState<SetupState>(() => readSetupState())
  const [screen, setScreen] = useState<ConsoleScreen>(initialLocation.screen)
  const [activityTab, setActivityTab] = useState<ActivityTab>(initialLocation.activityTab)
  const [clientTab, setClientTab] = useState<ClientTab>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [selectedProviderProfileId, setSelectedProviderProfileId] = useState<string>()
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(initialLocation.runId)
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
    startChatStream,
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
  const runLogToolCallHistoryEnabled = screen === 'activity'
    && activityTab === 'tools'
    && snapshot?.runLog?.configured === true
  const runLogToolCallHistory = useRunLogToolCallHistoryPage({
    enabled: runLogToolCallHistoryEnabled,
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
  const usageHistoryEnabled = screen === 'activity' && activityTab === 'usage'
  const usageHistory = useUsageHistoryPage({
    enabled: usageHistoryEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const artifactHistoryEnabled = screen === 'activity' && activityTab === 'artifacts'
  const artifactHistory = useArtifactHistoryPage({
    enabled: artifactHistoryEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const auditHistoryEnabled = screen === 'activity' && activityTab === 'audit'
  const auditHistory = useAuditHistoryPage({
    enabled: auditHistoryEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    limit: 25,
  })
  const memoryHistoryEnabled = screen === 'activity'
    && activityTab === 'memory'
    && Boolean(selectedWorkspace?.workspaceId)
  const memoryHistory = useMemoryHistoryPage({
    enabled: memoryHistoryEnabled,
    gatewayClient,
    revision: snapshot?.generatedAt,
    workspaceId: selectedWorkspace?.workspaceId,
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
  const compatibilityRunEvents = useCompatibilityRunEvents({
    enabled: screen === 'activity'
      && activityTab === 'runs'
      && selectedRun?.source === 'compatibility',
    gatewayClient,
    sessionId: selectedRun?.source === 'compatibility' ? selectedRun.sessionId : undefined,
    runId: selectedRun?.source === 'compatibility' ? selectedRun.runId : undefined,
    revision: snapshot?.generatedAt,
  })

  const displayedRunEvents = runLogTraceEnabled ? runLogTrace.events : compatibilityRunEvents.events
  const displayedRunEventsLoading = runLogTraceEnabled
    ? runLogTrace.loading
    : compatibilityRunEvents.loading
  const displayedRunEventsError = runLogTraceEnabled
    ? runLogTrace.error
    : compatibilityRunEvents.error
  const reloadSelectedRunEvents = useCallback(async () => {
    if (runLogTraceEnabled) {
      await runLogTrace.reload()
      return
    }
    await compatibilityRunEvents.reload()
  }, [compatibilityRunEvents.reload, runLogTrace.reload, runLogTraceEnabled])

  function navigateToScreen(nextScreen: ConsoleScreen) {
    setScreen(nextScreen)
    writeConsoleLocation({
      screen: nextScreen,
      activityTab,
      ...(nextScreen === 'activity' && activityTab === 'runs' && selectedRunId
        ? { runId: selectedRunId }
        : {}),
    })
  }

  function navigateToActivityTab(nextActivityTab: ActivityTab) {
    setActivityTab(nextActivityTab)
    setScreen('activity')
    writeConsoleLocation({
      screen: 'activity',
      activityTab: nextActivityTab,
      ...(nextActivityTab === 'runs' && selectedRunId ? { runId: selectedRunId } : {}),
    })
  }

  function selectRun(runId?: string) {
    setSelectedRunId(runId)
    setActivityTab('runs')
    setScreen('activity')
    writeConsoleLocation({ screen: 'activity', activityTab: 'runs', ...(runId ? { runId } : {}) })
  }

  useEffect(() => {
    if (selectedAgent && selectedAgent.agentId !== selectedAgentId) {
      setSelectedAgentId(selectedAgent.agentId)
    }
  }, [selectedAgent, selectedAgentId])

  useEffect(() => {
    if (!operatorModel) return
    if (selectedRunId && !operatorModel.runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(undefined)
      if (screen === 'activity' && activityTab === 'runs') {
        writeConsoleLocation({ screen: 'activity', activityTab: 'runs' })
      }
      return
    }
    if (activityRunsEnabled && !runActivityPagesLoaded) return
    if (!selectedRunId && runListModel?.runs[0]) {
      setSelectedRunId(runListModel.runs[0]?.runId)
      if (screen === 'activity' && activityTab === 'runs') {
        writeConsoleLocation({ screen: 'activity', activityTab: 'runs', runId: runListModel.runs[0].runId })
      }
    }
  }, [activityRunsEnabled, activityTab, operatorModel, runActivityPagesLoaded, runListModel, screen, selectedRunId])

  async function completeSetup(next: SetupState) {
    await refresh()
    writeSetupState(next)
    setSetup(next)
    setScreen('home')
    writeConsoleLocation({ screen: 'home', activityTab: 'runs' })
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
      await reloadSelectedRunEvents()
      setToast({ kind: 'ok', text: `Run ${shortId(run.runId)} cancelled.` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function retryOperatorRun(run: OperatorRunRow) {
    if (!run.retryable || run.source !== 'runlog') {
      setToast({ kind: 'info', text: 'Only failed or cancelled RunLog work can be retried.' })
      return
    }
    setBusy(true)
    try {
      const result = await gatewayClient.retryRun({ runId: run.runId, allowBudgetWarning: true })
      await refresh()
      selectRun(result.run.runId)
      setToast({ kind: 'ok', text: `Fresh retry ${shortId(result.run.runId)} queued.` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function openOperatorArtifact(artifact: ConsoleGatewayArtifact, mode: ArtifactOpenMode) {
    setBusy(true)
    try {
      const access = await gatewayClient.browserAccessUrl({
        kind: 'artifact',
        artifactId: artifact.artifactId,
      })
      const urls = deriveLocalGatewayArtifactAccessUrls(access.url)
      if (!urls) throw new Error('Gateway returned an unsafe artifact access URL.')
      const targetUrl = mode === 'download' ? urls.downloadUrl : urls.previewUrl
      const opened = typeof window !== 'undefined'
        ? window.open(targetUrl, '_blank', 'noopener,noreferrer')
        : null
      if (!opened) {
        throw new Error('The browser blocked the artifact window. Allow pop-ups for this console.')
      }
      setToast({ kind: 'ok', text: mode === 'download' ? 'Artifact download opened.' : 'Artifact preview opened.' })
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

  async function correctWorkspaceMemory(
    entry: ConsoleGatewayMemoryEntry,
    text: string,
    reason?: string,
  ) {
    const workspaceId = selectedWorkspace?.workspaceId
    if (!workspaceId) {
      setToast({ kind: 'error', text: 'Select a workspace before correcting memory.' })
      return
    }
    setBusy(true)
    try {
      await gatewayClient.correctMemoryEntry({
        workspaceId,
        entryId: entry.entryId,
        text,
        ...(reason ? { reason } : {}),
      })
      await memoryHistory.reload()
      void refresh().catch(() => undefined)
      setToast({ kind: 'ok', text: 'Memory correction saved.' })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteWorkspaceMemory(entry: ConsoleGatewayMemoryEntry, reason?: string) {
    const workspaceId = selectedWorkspace?.workspaceId
    if (!workspaceId) {
      setToast({ kind: 'error', text: 'Select a workspace before deleting memory.' })
      return
    }
    setBusy(true)
    try {
      await gatewayClient.deleteMemoryEntry({
        workspaceId,
        entryId: entry.entryId,
        ...(reason ? { reason } : {}),
      })
      await memoryHistory.reload()
      void refresh().catch(() => undefined)
      setToast({ kind: 'ok', text: 'Memory deleted.' })
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
    writeConsoleLocation({ screen: 'activity', activityTab: 'runs', runId })
  }

  function navigateFromOverview(destination: 'clients' | 'runs' | 'approvals' | 'usage') {
    if (destination === 'clients') {
      setScreen('workspaces')
      writeConsoleLocation({ screen: 'workspaces', activityTab: 'runs' })
      return
    }
    setActivityTab(destination)
    setScreen('activity')
    writeConsoleLocation({ screen: 'activity', activityTab: destination })
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
      const runInput = {
        sessionId: session.sessionId,
        input: trimmedPrompt,
        allowedTools: input.tools,
        allowBudgetWarning: true,
        workspaceId: selectedWorkspace.workspaceId,
        agentId: selectedAgent.agentId,
        providerProfileId: provider?.profileId,
        providerId: provider?.providerId,
        modelId: selectedAgent.defaultModelId ?? provider?.defaultModelId,
      }
      const run = input.addChatMessage
        ? await startChatStream(runInput, { runLabel: shortId, scopeKey })
        : (await gatewayClient.startRun({ ...runInput, mode: input.mode })).run
      updateScopedRunUi(scopeKey, (current) => ({
        ...current,
        lastRun: {
          runId: run.runId,
          sessionId: run.sessionId,
          mode: input.mode,
          prompt: trimmedPrompt,
        },
        runEvents: [],
      }))
      if (!input.addChatMessage) {
        observeRun(run, {
          addChatMessage: false,
          runLabel: shortId(run.runId),
          scopeKey,
        })
      }
      await refresh()
      setToast({ kind: 'ok', text: `Run ${shortId(run.runId)} started.` })
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
        onScreen={navigateToScreen}
        onSelectClient={(clientId) => {
          setSelectedClientId(clientId)
          navigateToScreen('workspaces')
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
              onTab={navigateToActivityTab}
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
                onRetry={(run) => void retryOperatorRun(run)}
                onLoadMoreEvents={() => void runLogTrace.loadMore()}
                onLoadMoreRuns={() => {
                  void Promise.all([
                    runLogActivity.loadMore(),
                    compatibilityRunActivity.loadMore(),
                  ])
                }}
                onReloadEvents={() => void reloadSelectedRunEvents()}
                onSelectRun={selectRun}
              />
            ) : activityTab === 'tools' ? (
              <ToolCallsScreen
                error={runLogToolCallHistoryEnabled ? runLogToolCallHistory.error : undefined}
                hasMore={runLogToolCallHistoryEnabled && Boolean(runLogToolCallHistory.nextCursor)}
                loading={runLogToolCallHistoryEnabled && runLogToolCallHistory.loading}
                toolCalls={runLogToolCallHistory.toolCalls}
                onLoadMore={() => void runLogToolCallHistory.loadMore()}
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
            ) : activityTab === 'usage' ? (
              <UsageScreen
                entries={usageHistory.entries}
                error={usageHistoryEnabled ? usageHistory.error : undefined}
                hasMore={usageHistoryEnabled && Boolean(usageHistory.nextCursor)}
                loading={usageHistoryEnabled && usageHistory.loading}
                model={operatorModel}
                onLoadMore={() => void usageHistory.loadMore()}
              />
            ) : activityTab === 'artifacts' ? (
              <ArtifactsScreen
                actionBusy={busy}
                artifacts={artifactHistory.artifacts}
                error={artifactHistoryEnabled ? artifactHistory.error : undefined}
                hasMore={artifactHistoryEnabled && Boolean(artifactHistory.nextCursor)}
                loading={artifactHistoryEnabled && artifactHistory.loading}
                onLoadMore={() => void artifactHistory.loadMore()}
                onOpenArtifact={(artifact, mode) => void openOperatorArtifact(artifact, mode)}
              />
            ) : activityTab === 'audit' ? (
              <AuditScreen
                error={auditHistoryEnabled ? auditHistory.error : undefined}
                events={auditHistory.events}
                hasMore={auditHistoryEnabled && Boolean(auditHistory.nextCursor)}
                loading={auditHistoryEnabled && auditHistory.loading}
                onLoadMore={() => void auditHistory.loadMore()}
              />
            ) : (
              <MemoryScreen
                actionBusy={busy}
                entries={memoryHistory.entries}
                error={memoryHistoryEnabled ? memoryHistory.error : undefined}
                hasMore={memoryHistoryEnabled && Boolean(memoryHistory.nextCursor)}
                loading={memoryHistoryEnabled && memoryHistory.loading}
                workspaceId={selectedWorkspace?.workspaceId}
                workspaceName={selectedWorkspace?.name}
                onCorrect={(entry, text, reason) => correctWorkspaceMemory(entry, text, reason)}
                onDelete={(entry, reason) => deleteWorkspaceMemory(entry, reason)}
                onLoadMore={() => void memoryHistory.loadMore()}
              />
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
