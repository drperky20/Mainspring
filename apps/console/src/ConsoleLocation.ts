import type { ActivityTab, ConsoleScreen } from './ConsoleNavigation'

export type ConsoleLocationState = {
  screen: ConsoleScreen
  activityTab: ActivityTab
  runId?: string
}

const screens: readonly ConsoleScreen[] = ['home', 'workspaces', 'activity', 'settings']
const activityTabs: readonly ActivityTab[] = [
  'runs',
  'tools',
  'approvals',
  'usage',
  'artifacts',
  'audit',
  'memory',
]

function isScreen(value: string | null): value is ConsoleScreen {
  return value !== null && screens.includes(value as ConsoleScreen)
}

function isActivityTab(value: string | null): value is ActivityTab {
  return value !== null && activityTabs.includes(value as ActivityTab)
}

function safeRunId(value: string | null): string | undefined {
  const normalized = value?.trim()
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9_-]+$/.test(normalized)) return undefined
  return normalized
}

export function readConsoleLocation(search: string): ConsoleLocationState {
  const params = new URLSearchParams(search)
  const screenValue = params.get('screen')
  const activityValue = params.get('activity')
  const screen: ConsoleScreen = isScreen(screenValue) ? screenValue : 'home'
  const activityTab: ActivityTab = isActivityTab(activityValue) ? activityValue : 'runs'
  return {
    screen,
    activityTab,
    ...(screen === 'activity' && activityTab === 'runs'
      ? { runId: safeRunId(params.get('runId')) }
      : {}),
  }
}

/**
 * Keeps operator navigation shareable without putting session paths, tokens,
 * prompts, or provider material in the URL. The gateway query parameter and
 * any unrelated host-owned parameters are preserved.
 */
export function writeConsoleLocation(state: ConsoleLocationState): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (state.screen === 'home') url.searchParams.delete('screen')
  else url.searchParams.set('screen', state.screen)

  if (state.screen === 'activity') url.searchParams.set('activity', state.activityTab)
  else url.searchParams.delete('activity')

  if (state.screen === 'activity' && state.activityTab === 'runs' && state.runId) {
    url.searchParams.set('runId', state.runId)
  } else {
    url.searchParams.delete('runId')
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}
