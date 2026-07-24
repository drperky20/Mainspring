import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ConsoleRuntimeFallback,
  createConsoleErrorId,
} from './ConsoleRuntimeBoundary'

describe('ConsoleRuntimeFallback', () => {
  it('renders an accessible recovery surface without exposing raw error details', () => {
    const markup = renderToStaticMarkup(
      <ConsoleRuntimeFallback
        errorId="console-test-42"
        onReload={() => undefined}
        onRetry={() => undefined}
      />,
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('aria-labelledby="console-crash-title"')
    expect(markup).toContain('Try interface again')
    expect(markup).toContain('Reload console')
    expect(markup).toContain('console-test-42')
    expect(markup).not.toContain('secret provider key')
  })

  it('creates bounded diagnostic identifiers from supplied entropy', () => {
    expect(createConsoleErrorId(1_720_000_000_000, 0.25)).toBe('console-ly5nl9ts-2hwcf')
    expect(createConsoleErrorId(-1, -4)).toBe('console-0-00000')
    expect(createConsoleErrorId(1, 9)).toBe('console-1-9zldq')
    expect(createConsoleErrorId(Number.NaN, Number.POSITIVE_INFINITY)).toBe('console-0-00000')
  })
})
