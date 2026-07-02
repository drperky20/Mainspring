# Local Gateway

## What It Does

The local gateway is a development control-plane host around the SDK/runtime.

It provides:

- local HTTP API
- app-state SQLite
- sanitized browser snapshots
- client/workspace/agent records
- provider profile metadata
- managed local secrets
- usage and budget rows
- cron schedules
- trusted local template installs
- deployment target/run metadata
- optional hosted-auth mode

The gateway can enqueue runs and project events, but actual work still flows through the mailbox/runtime/tool/policy spine.

Browser-facing gateway data must omit secrets, host paths, database paths, provider key environment markers, and backend internals. Gateway JSON/SSE sanitization redacts common browser-unsafe field markers, provider key environment markers, and host absolute paths embedded in free text before writing browser responses.

Hosted browser-access URLs are short-lived local bearer URLs for artifact preview/download and SSE reads. They are minted only after normal gateway auth, and ticketed reads reject extra auth-like query parameters such as session-token or OAuth token fields.

## What It Does Not Do

- It does not provide hosted SaaS tenancy.
- It does not provide enterprise SSO.
- It does not provide secure desktop identity.
- It does not execute tools or providers outside the runtime.
- Browser DTO sanitization is not a replacement for gateway-side auth, OS permissions, or artifact access checks.
- Console response guards are regression tripwires, not the primary security boundary.

## How To Verify

```bash
pnpm gateway:systems:check
pnpm gateway:surface:check
pnpm gateway:dev:help
pnpm auth:check
pnpm secrets:check
```
