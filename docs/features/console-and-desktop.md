# Console And Desktop

## What It Does

The console lives in `apps/console` and can run in three modes:

- browser localStorage prototype state
- fixture-backed development data
- live `local-gateway-dev` transport

The console renders gateway DTOs and contains browser-edge regression guards for unsafe response fields, path markers, provider key environment markers, artifact URLs, SSE URLs, and localhost gateway URL selection.

When the local gateway is configured with a RunLog host, the gateway snapshot can include an optional sanitized RunLog projection. The console summary and dashboard consume that projection for active runs and pending approvals while preserving the browser DTO boundary.

The desktop shell lives in `apps/desktop`. It is an experimental Electron wrapper for the console with Windows packaging.

## What It Does Not Do

- The console does not enforce runtime security by itself.
- Browser/localStorage provider auth remains prototype-only.
- Provider keys must not be stored in renderer localStorage.
- RunLog data shown in the console is a sanitized projection, not raw RunLog private receipt or workspace state.
- The desktop shell is not a secure cross-platform desktop secret vault.
- Linux desktop installer packaging is not a supported release lane; Linux users run from source.

## How To Verify

```bash
pnpm console:typecheck
pnpm console:browser-safety:check
pnpm console:build
pnpm desktop:typecheck
pnpm desktop:build
pnpm desktop:packaging:check
pnpm desktop:systems:check
```
