import { useState } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import { providerModels } from './ConsoleProviderCatalog'

export type DraftClient = {
  name: string
  contact: string
  billingLabel: string
  workspaceName: string
  agentName: string
  modelId: string
  goal: string
  instructions: string
}

type SnapshotClient = ConsoleGatewaySnapshot['clients'][number]
type SnapshotWorkspace = ConsoleGatewaySnapshot['workspaces'][number]
type SnapshotAgent = ConsoleGatewaySnapshot['agents'][number]
type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

export const defaultSkills = {
  'web.fetch': true,
  'file.read': true,
  'file.write': false,
  'browser.screenshot': false,
  'voice.call': false,
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

export function ClientForm({
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
            {providerModels().map((model) => (
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

export function ClientDetailsPanel({
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function clientDraftFromSnapshot(
  client: SnapshotClient,
  workspace?: SnapshotWorkspace,
  agent?: SnapshotAgent,
): DraftClient {
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
