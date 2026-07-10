import type { ReactNode } from 'react'
import type { ConsoleGatewayRunEvent } from 'mainspring/gateway'
import type { LastRunState } from './useConsoleRunActivity'

export type AutomationNode = {
  id: string
  title: string
  detail: string
  strong?: boolean
  tone?: 'agent' | 'prompt' | 'read' | 'write' | 'browser' | 'voice' | 'web'
}

export function ActionRail({
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

export function Dialog({
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

export function ToolToggle({
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

export function FragmentWithEdge({
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

export function toolTone(key: string): AutomationNode['tone'] {
  if (key === 'agent') return 'agent'
  if (key === 'prompt') return 'prompt'
  if (key === 'file.read') return 'read'
  if (key === 'file.write') return 'write'
  if (key === 'browser.screenshot') return 'browser'
  if (key === 'voice.call') return 'voice'
  return 'web'
}

export function shortId(value?: string): string {
  if (!value) return 'run'
  const parts = value.split('_')
  return parts.length > 1 ? parts.slice(-1)[0] : value.slice(0, 8)
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

function FlowEdge() {
  return <div className="flow-edge" aria-hidden="true" />
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

function previewPayload(payload: unknown): string {
  try {
    const value = JSON.stringify(payload)
    return value.length > 110 ? `${value.slice(0, 107)}...` : value
  } catch {
    return String(payload)
  }
}
