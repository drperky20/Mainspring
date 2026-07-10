import { useCallback, useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import type { ConsoleGatewayRunEvent } from 'mainspring/gateway'
import type { LocalGatewayClient } from './localGatewayClient'

type ChatRole = UIMessage['role']

export type MainspringChatMessage = {
  id: string
  role: ChatRole
  text: string
  timestamp: string
}

export type LastRunState = {
  runId: string
  sessionId: string
  mode: 'chat' | 'automation-test' | 'agent-test'
  prompt: string
}

export type ScopedRunUiState = {
  chatInput: string
  automationPrompt: string
  chatMessages: MainspringChatMessage[]
  lastRun?: LastRunState
  runEvents: ConsoleGatewayRunEvent[]
}

export const DEFAULT_CHAT_INPUT = 'Check what this client needs next and suggest one safe action.'
export const DEFAULT_AUTOMATION_PROMPT =
  'Review new inbox items, draft a short client update, and stop before sending anything external.'

export function createScopedRunUiState(): ScopedRunUiState {
  return {
    chatInput: DEFAULT_CHAT_INPUT,
    automationPrompt: DEFAULT_AUTOMATION_PROMPT,
    chatMessages: [],
    runEvents: [],
  }
}

export function createChatMessage(role: ChatRole, text: string): MainspringChatMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    timestamp: new Date().toISOString(),
  }
}

export function mergeRunEvent(
  events: ConsoleGatewayRunEvent[],
  next: ConsoleGatewayRunEvent,
): ConsoleGatewayRunEvent[] {
  if (events.some((event) => event.seq === next.seq && event.runId === next.runId && event.type === next.type)) {
    return events
  }
  return [...events, next].slice(-80)
}

export function appendAssistantDelta(
  messages: MainspringChatMessage[],
  text: string,
): MainspringChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.text.startsWith('Run ')) {
    return [...messages.slice(0, -1), { ...last, text }]
  }
  if (last?.role === 'assistant') {
    return [...messages.slice(0, -1), { ...last, text: `${last.text}${text}` }]
  }
  return [...messages, createChatMessage('assistant', text)]
}

export function useConsoleRunActivity(input: {
  gatewayClient: LocalGatewayClient
  gatewayUrl: string
  refresh: () => Promise<void>
}): {
  runUiByScope: Record<string, ScopedRunUiState>
  updateScopedRunUi(
    scopeKey: string | undefined,
    update: (current: ScopedRunUiState) => ScopedRunUiState,
  ): void
  observeRun(
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string; scopeKey: string },
  ): void
} {
  const [runUiByScope, setRunUiByScope] = useState<Record<string, ScopedRunUiState>>({})

  const updateScopedRunUi = useCallback((
    scopeKey: string | undefined,
    update: (current: ScopedRunUiState) => ScopedRunUiState,
  ) => {
    if (!scopeKey) return
    setRunUiByScope((current) => ({
      ...current,
      [scopeKey]: update(current[scopeKey] ?? createScopedRunUiState()),
    }))
  }, [])

  const pollRunEvents = useCallback(async (
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string; scopeKey: string },
  ) => {
    const events = await input.gatewayClient.runEvents(run).catch(() => ({ events: [] }))
    updateScopedRunUi(options.scopeKey, (current) => ({ ...current, runEvents: events.events }))
    if (options.addChatMessage && events.events.length > 0) {
      updateScopedRunUi(options.scopeKey, (current) => ({
        ...current,
        chatMessages: [
          ...current.chatMessages,
          createChatMessage(
            'assistant',
            `Run ${options.runLabel} produced ${events.events.length} logged event${events.events.length === 1 ? '' : 's'}.`,
          ),
        ],
      }))
    }
  }, [input.gatewayClient, updateScopedRunUi])

  const streamRunEvents = useCallback(async (
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string; scopeKey: string },
  ) => {
    const streamAccess = await input.gatewayClient
      .browserAccessUrl({ kind: 'event-stream', sessionId: run.sessionId, runId: run.runId })
      .catch(() => undefined)
    const streamUrl = streamAccess?.url
      ?? `${input.gatewayUrl.replace(/\/+$/, '')}/events/stream?sessionId=${encodeURIComponent(run.sessionId)}&runId=${encodeURIComponent(run.runId)}`
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
      updateScopedRunUi(options.scopeKey, (current) => ({
        ...current,
        runEvents: mergeRunEvent(current.runEvents, parsed),
      }))
      if (
        (String(parsed.type) === 'assistant.delta' || String(parsed.type) === 'assistant.text.delta')
        && typeof parsed.payload === 'object'
        && parsed.payload
      ) {
        const text = String((parsed.payload as { text?: unknown }).text ?? '')
        if (text && options.addChatMessage) {
          updateScopedRunUi(options.scopeKey, (current) => ({
            ...current,
            chatMessages: appendAssistantDelta(current.chatMessages, text),
          }))
        }
      }
      if (
        parsed.type === 'run.completed'
        || parsed.type === 'run.failed'
        || parsed.type === 'run.cancelled'
      ) {
        close()
        void pollRunEvents(run, { ...options, addChatMessage: false })
        void input.refresh().catch(() => undefined)
      }
    })
    source.onerror = () => {
      close()
      void pollRunEvents(run, options)
    }
    window.setTimeout(() => {
      if (!settled) {
        close()
        void pollRunEvents(run, { ...options, addChatMessage: false })
      }
    }, 45_000)
  }, [input.gatewayClient, input.gatewayUrl, input.refresh, pollRunEvents, updateScopedRunUi])

  const observeRun = useCallback((
    run: { sessionId: string; runId: string },
    options: { addChatMessage: boolean; runLabel: string; scopeKey: string },
  ) => {
    void streamRunEvents(run, options)
    window.setTimeout(() => {
      void pollRunEvents(run, { ...options, addChatMessage: false })
    }, 2_500)
  }, [pollRunEvents, streamRunEvents])

  return { runUiByScope, updateScopedRunUi, observeRun }
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}
