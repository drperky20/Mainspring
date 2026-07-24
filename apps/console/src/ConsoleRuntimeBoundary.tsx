import {
  Component,
  createRef,
  type ErrorInfo,
  type ReactNode,
  type Ref,
} from 'react'
import './ConsoleRuntimeBoundary.css'

type ConsoleRuntimeBoundaryProps = {
  children: ReactNode
}

type ConsoleRuntimeBoundaryState = {
  errorId?: string
}

type ConsoleRuntimeFallbackProps = {
  errorId: string
  headingRef?: Ref<HTMLHeadingElement>
  onReload: () => void
  onRetry: () => void
}

export function createConsoleErrorId(
  timestamp = Date.now(),
  randomValue = Math.random(),
): string {
  const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : 0
  const normalizedRandom = Number.isFinite(randomValue) ? randomValue : 0
  const timePart = Math.max(0, Math.floor(normalizedTimestamp)).toString(36)
  const randomPart = Math.floor(Math.min(Math.max(normalizedRandom, 0), 0.999999999) * 0xffffff)
    .toString(36)
    .padStart(5, '0')
  return `console-${timePart}-${randomPart}`
}

export function ConsoleRuntimeFallback({
  errorId,
  headingRef,
  onReload,
  onRetry,
}: ConsoleRuntimeFallbackProps) {
  return (
    <main className="console-crash-shell">
      <section
        aria-describedby="console-crash-description"
        aria-labelledby="console-crash-title"
        className="console-crash-card"
        role="alert"
      >
        <div className="console-crash-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="console-crash-kicker">Operator console interrupted</p>
        <h1 id="console-crash-title" ref={headingRef} tabIndex={-1}>
          Mainspring hit an unexpected UI error.
        </h1>
        <p id="console-crash-description">
          Your gateway and durable runs are separate from this browser view. Retry the interface first,
          or reload the console if the same screen fails again.
        </p>
        <div className="console-crash-actions">
          <button className="console-crash-primary" type="button" onClick={onRetry}>
            Try interface again
          </button>
          <button className="console-crash-secondary" type="button" onClick={onReload}>
            Reload console
          </button>
        </div>
        <dl className="console-crash-diagnostic">
          <div>
            <dt>Diagnostic ID</dt>
            <dd>{errorId}</dd>
          </div>
          <div>
            <dt>Next step</dt>
            <dd>Include this ID when reporting the crash.</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

export class ConsoleRuntimeBoundary extends Component<
  ConsoleRuntimeBoundaryProps,
  ConsoleRuntimeBoundaryState
> {
  state: ConsoleRuntimeBoundaryState = {}

  private readonly headingRef = createRef<HTMLHeadingElement>()

  static getDerivedStateFromError(): ConsoleRuntimeBoundaryState {
    return { errorId: createConsoleErrorId() }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const errorName = error instanceof Error ? error.name : typeof error
    console.error('[mainspring-console] unrecoverable render error', {
      componentStack: info.componentStack,
      errorId: this.state.errorId,
      errorName,
    })
    queueMicrotask(() => this.headingRef.current?.focus())
  }

  private readonly retry = () => {
    this.setState({ errorId: undefined })
  }

  private readonly reload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.errorId) {
      return (
        <ConsoleRuntimeFallback
          errorId={this.state.errorId}
          headingRef={this.headingRef}
          onReload={this.reload}
          onRetry={this.retry}
        />
      )
    }

    return this.props.children
  }
}
