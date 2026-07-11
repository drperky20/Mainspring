import type { ConsoleConnectionState } from './OperatorConsoleScreens'

export type ConsoleScreen = 'home' | 'workspaces' | 'activity' | 'settings'
export type ActivityTab = 'runs' | 'tools' | 'approvals' | 'usage' | 'artifacts' | 'audit' | 'memory'

type NavigationClient = {
  clientId: string
  name: string
}

type NavigationAccount = {
  accountName: string
  username: string
}

export function MainspringMark() {
  return (
    <span className="mainspring-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path d="M20 3l3 5 6-2 2 6 6 2-2 6 2 6-6 2-2 6-6-2-3 5-3-5-6 2-2-6-6-2 2-6-2-6 6-2 2-6 6 2 3-5z" />
        <path d="M14 13c8-4 14-2 14 2 0 6-17 2-17 8 0 4 8 6 17 1" />
      </svg>
    </span>
  )
}

export function ConsoleSidebar({
  activeRuns,
  collapsed,
  clients,
  connectionState,
  gatewayUrl,
  pendingApprovals,
  screen,
  selectedClientId,
  setup,
  onCollapse,
  onNewClient,
  onScreen,
  onSelectClient,
}: {
  activeRuns: number
  collapsed: boolean
  clients: NavigationClient[]
  connectionState: ConsoleConnectionState
  gatewayUrl: string
  pendingApprovals: number
  screen: ConsoleScreen
  selectedClientId?: string
  setup: NavigationAccount
  onCollapse: () => void
  onNewClient: () => void
  onScreen: (screen: ConsoleScreen) => void
  onSelectClient: (clientId: string) => void
}) {
  const gatewayConnected = connectionState === 'ready'
  const gatewayLabel = connectionState === 'ready'
    ? 'Live snapshot'
    : connectionState === 'stale'
      ? 'Snapshot stale'
      : connectionState === 'unauthorized'
        ? 'Needs sign in'
        : 'Offline'
  const navigation: Array<{ id: ConsoleScreen; label: string; code: string; count?: number }> = [
    { id: 'home', label: 'Home', code: '01' },
    { id: 'workspaces', label: 'Workspaces', code: '02' },
    { id: 'activity', label: 'Activity', code: '03', count: pendingApprovals || activeRuns },
    { id: 'settings', label: 'Settings', code: '04' },
  ]

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
        {navigation.map((item) => (
          <button
            aria-current={screen === item.id ? 'page' : undefined}
            className={screen === item.id ? 'active' : ''}
            key={item.id}
            type="button"
            onClick={() => onScreen(item.id)}
          >
            <span className="sidebar-nav-code" aria-hidden="true">{item.code}</span>
            <strong>{item.label}</strong>
            {item.count ? <em>{item.count}</em> : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-clients">
        <span className="sidebar-client-label">Workspaces</span>
        {clients.length > 0 ? (
          <div className="sidebar-client-list">
            {clients.map((client) => (
              <button
                aria-current={client.clientId === selectedClientId ? 'true' : undefined}
                className={client.clientId === selectedClientId ? 'client-chip active' : 'client-chip'}
                key={client.clientId}
                type="button"
                onClick={() => onSelectClient(client.clientId)}
              >
                <span aria-hidden="true">{initials(client.name)}</span>
                <strong>{client.name}</strong>
              </button>
            ))}
          </div>
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

export function ActivityNavigation({
  activeRuns,
  activeTab,
  pendingApprovals,
  onTab,
}: {
  activeRuns: number
  activeTab: ActivityTab
  pendingApprovals: number
  onTab: (tab: ActivityTab) => void
}) {
  const tabs: Array<{ id: ActivityTab; label: string; count?: number }> = [
    { id: 'runs', label: 'Runs', count: activeRuns },
    { id: 'tools', label: 'Tools' },
    { id: 'approvals', label: 'Approvals', count: pendingApprovals },
    { id: 'usage', label: 'Usage' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'audit', label: 'Audit' },
    { id: 'memory', label: 'Memory' },
  ]
  return (
    <nav className="control-activity-nav" aria-label="Activity views">
      {tabs.map((tab) => (
        <button
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={activeTab === tab.id ? 'active' : ''}
          key={tab.id}
          type="button"
          onClick={() => onTab(tab.id)}
        >
          {tab.label}
          {tab.count ? <span>{tab.count}</span> : null}
        </button>
      ))}
    </nav>
  )
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'MS'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}
