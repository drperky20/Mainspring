import type { DragEvent } from 'react'
import { useEffect, useState } from 'react'
import type {
  ConsoleGatewayRunEvent,
  ConsoleGatewaySnapshot,
} from 'mainspring/gateway'
import {
  providerModels,
} from './ConsoleProviderCatalog'
import {
  ClientDetailsPanel,
  defaultSkills,
  type DraftClient,
} from './ConsoleClientForms'
import {
  ActionRail,
  FragmentWithEdge,
  ToolToggle,
  shortId,
  toolTone,
  type AutomationNode,
} from './ConsoleWorkflowPrimitives'
import {
  createChatMessage,
  type LastRunState,
  type MainspringChatMessage,
} from './useConsoleRunActivity'
import { ConsoleClientWorkspaceFrame, type ClientWorkspaceTab } from './ConsoleClientWorkspaceFrame'
import { InfoRow } from './ConsoleSettings'

export type AgentDraft = {
  name: string
  defaultModelId: string
  instructions: string
  outcome: string
  approvalMode: string
  skills: Record<string, boolean>
}

export type SnapshotClient = ConsoleGatewaySnapshot['clients'][number]
export type SnapshotWorkspace = ConsoleGatewaySnapshot['workspaces'][number]
export type SnapshotAgent = ConsoleGatewaySnapshot['agents'][number]
export type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

const toolOptions = [
  { key: 'agent', label: 'Agent', description: 'Support agent', locked: true },
  { key: 'prompt', label: 'Prompt', description: 'Automation instruction', locked: true },
  { key: 'file.read', label: 'File read', description: 'Inspect workspace files.' },
  { key: 'file.write', label: 'File write', description: 'Write approved outputs.' },
  { key: 'voice.call', label: 'Voice call', description: 'Design placeholder for call tools.' },
] as const

export function ClientsScreen({
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
  clientTab: ClientWorkspaceTab
  lastRun?: LastRunState
  provider?: SnapshotProvider
  providers: SnapshotProvider[]
  runEvents: ConsoleGatewayRunEvent[]
  selectedAgent?: SnapshotAgent
  workspace?: SnapshotWorkspace
  onAutomationPrompt: (value: string) => void
  onChatInput: (value: string) => void
  onClientTab: (tab: ClientWorkspaceTab) => void
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
    <ConsoleClientWorkspaceFrame
      client={client}
      details={(
        <ClientDetailsPanel
          agent={selectedAgent}
          client={client}
          provider={provider}
          workspace={workspace}
          onSave={onEditClient}
        />
      )}
      onCreateClient={onCreateClient}
      onTab={onClientTab}
      tab={clientTab}
      workspace={workspace}
    >
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
    </ConsoleClientWorkspaceFrame>
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

function enabledTools(agent?: SnapshotAgent): string[] {
  const skills = { ...defaultSkills, ...(agent?.skills ?? {}) }
  return Object.entries(skills).filter(([, enabled]) => enabled).map(([key]) => key)
}

function promptSummary(prompt: string): string {
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

export function modelLabel(modelId: string): string {
  return allModels().find((model) => model.id === modelId)?.label ?? modelId
}
