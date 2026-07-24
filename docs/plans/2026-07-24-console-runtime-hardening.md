# Console runtime hardening

Date: 2026-07-24

## Scope

This change adds a production root error boundary around the React operator console. It is intentionally narrow: it protects the browser view from render and lifecycle crashes without claiming to recover gateway, provider, or durable RunLog failures.

## Product behavior

- Uncaught React render or lifecycle failures replace a blank screen with a Mainspring-branded recovery surface.
- The recovery surface explains that the browser view is separate from durable gateway runs.
- Operators can retry the React tree or reload the page.
- Focus moves to the error heading after a crash, and the fallback exposes an alert relationship for assistive technology.
- A bounded diagnostic ID is shown while raw error messages remain out of the rendered UI.
- The full component stack remains available only in the local browser console for development and support.
- The layout adapts to narrow screens and respects reduced-motion preferences.

## Verification

Focused static tests cover the fallback semantics, actions, diagnostic ID, and non-disclosure of raw error text. The existing repository confidence gate remains:

```bash
pnpm verify
```

A full browser screenshot audit was not performed in the connector-only environment. Visual verification should cover desktop, 560px mobile width, keyboard focus after a forced render error, retry behavior, reload behavior, and reduced-motion mode.
