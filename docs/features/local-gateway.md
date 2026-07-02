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

When the gateway is configured with a RunLog SDK host, the default `/runs/start` route creates a `RunIntent`, drains through `RunLogKernel`, and returns the compact compatibility run dispatch DTO. Gateways without a RunLog host keep the mailbox-compatible SDK run path. The explicit `/runlog/runs/start`, `/runlog/runs/:runId/events`, and `/runlog/approvals/:approvalId/resolve` routes expose `RunLogProjection`-based responses for RunLog-aware clients.

The local dev server created by `pnpm gateway:dev` now configures that RunLog host by default. It stores RunLog state under `.mainspring/runlog/runlog.sqlite`, materializes RunLog workspaces under `.mainspring/runlog/workspaces`, and uses env-backed OpenRouter/OpenAI credentials only when the matching key is present. Without a live provider key it uses `EchoProvider` so source checkout bring-up stays local and free. Managed provider profile secrets are resolved host-side for RunLog provider calls through opaque credential refs; raw secret values are not written to RunLog events or browser DTOs.

When a gateway has a RunLog host, cron tick and run-now dispatch create ordinary RunLog runs with `cron.due` and `policy.decision.recorded` events. Provider-only cron schedules queue normally; side-effecting schedules fail closed unless their metadata carries a scoped, unexpired cron grant. Operators can call `GET /cron/:scheduleId/grant` to preview the current grant decision and `POST /cron/:scheduleId/grant` to create an expiring scoped grant derived from the current schedule. The React console also exposes review/create controls that display the grant state without raw prompt hashes or secret refs. Gateways without a RunLog host keep the mailbox-compatible cron path for older embedders and migration verifiers.

Staged memory/skill provenance reviews are exposed through local gateway routes:

- `GET /provenance-reviews?workspaceId=...`
- `POST /provenance-reviews/:reviewId/decision`
- `POST /provenance-reviews/:reviewId/apply`

These routes read the workspace-local `.mainspring/provenance-review.jsonl` queue, return sanitized browser DTOs, and apply only previously approved staged memory/skill mutations. The React console has matching controls to load the queue, approve/reject a pending item, and apply an approved item. This is local operator review, not remote marketplace trust.

Gateway RunLog routes are local development surfaces. They do not create a hosted worker
pool, do not change host execution limits, and do not create a multi-tenant control plane.

Browser-facing gateway data must omit secrets, host paths, database paths, provider key environment markers, and backend internals. Gateway JSON/SSE sanitization redacts common browser-unsafe field markers, provider key environment markers, and host absolute paths embedded in free text before writing browser responses.

Hosted browser-access URLs are short-lived local bearer URLs for artifact preview/download and SSE reads. They are minted only after normal gateway auth, and ticketed reads reject extra auth-like query parameters such as session-token or OAuth token fields.

Hosted-auth bootstrap and login are still local operator flows, but browser-origin requests now use an explicit localhost/loopback allowlist instead of wildcard CORS. Requests without an `Origin` header remain available for CLI and server-side local tooling; browser requests from non-local origins are rejected before route handling.

## What It Does Not Do

- It does not provide hosted SaaS tenancy.
- It does not provide enterprise SSO.
- It does not provide secure desktop identity.
- It does not accept arbitrary browser origins for hosted-auth bootstrap/login.
- It does not execute tools or providers outside the runtime.
- It does not prove remote skill marketplace trust or third-party reputation.
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
