import type { ReactNode } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'

type SnapshotClient = ConsoleGatewaySnapshot['clients'][number]
type SnapshotWorkspace = ConsoleGatewaySnapshot['workspaces'][number]
export type ClientWorkspaceTab = 'chat' | 'agents' | 'automations' | 'access'

export function ConsoleClientWorkspaceFrame({
  client,
  workspace,
  tab,
  children,
  details,
  onCreateClient,
  onTab,
}: {
  client: SnapshotClient
  workspace?: SnapshotWorkspace
  tab: ClientWorkspaceTab
  children: ReactNode
  details?: ReactNode
  onCreateClient: () => void
  onTab: (tab: ClientWorkspaceTab) => void
}) {
  return (
    <section className={`client-screen ${tab === 'automations' ? 'is-automation-tab' : ''}`}>
      <header className="screen-header">
        <div>
          <p>{workspace?.name ?? 'Client workspace'}</p>
          <div className="screen-title-row">
            <h1>{client.name}</h1>
            {tab === 'automations' ? (
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
        {tab === 'automations' ? null : details}
        <div className="workspace-area">
          <nav className="client-tabs" aria-label="Client workspace views">
            {(['chat', 'agents', 'automations', 'access'] as ClientWorkspaceTab[]).map((candidate) => (
              <button className={tab === candidate ? 'active' : ''} key={candidate} type="button" onClick={() => onTab(candidate)}>
                <span className={`client-tab-icon ${candidate}`} aria-hidden="true" />
                <span>{candidate}</span>
              </button>
            ))}
          </nav>
          {children}
        </div>
      </div>
    </section>
  )
}
