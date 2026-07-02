# Current State

Last rewritten: 2026-07-01.

This is the repo-grounded current state. `docs/goal-digest.md` remains the repo-local long milestone ledger and is excluded from npm package artifacts.

## Exists Now

- TypeScript package named `mainspring`.
- Existing SDK, gateway, console, mailbox runtime, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider abstraction, `ToolRegistry`, policy guard, approval receipts, tools, memory, usage, cron, deployment, and verification scripts.
- New canonical RunLog Fabric skeleton:
  - `src/core` for `AgentSpec`, `RunIntent`, `RunLogEvent`, `RunLogKernel`, `RunLogScheduler`, `RunLogExecutor`, provider routing, and checkpoints.
  - `src/adapters/sqlite` for the default SQLite WAL RunLog store with agents, runs, leases, events, checkpoints, and cron rows.
  - `src/adapters/local-blob` for content-addressed local blob storage.
  - `src/capabilities/workspace` for lazy local workspace leases.
  - `src/capabilities/cron` for due cron rows that enqueue ordinary runs.
  - `src/hosts/runlog` for host-facing run projections.
  - `src/compat` for migration exports.
- Package subpaths now expose `mainspring/core`, `mainspring/adapters`, `mainspring/adapters/sqlite`, `mainspring/adapters/local-blob`, `mainspring/capabilities`, `mainspring/hosts/runlog`, and `mainspring/compat`.
- Focused tests prove provider-only runs, tool calls, approval pauses, SQLite restart recovery, cron-created runs, lazy workspace materialization, and 1000 idle agents stored as data.

## Prototype Or Migration Surfaces

- The old mailbox/runtime path is still present and still important for existing SDK/gateway behavior.
- Gateway and console remain mid-migration; they should consume RunLog projections rather than grow new parallel runtime state.
- Desktop packaging is experimental and Windows-focused.
- Provider auth and renderer storage must continue moving toward env/local-secret/external-secret adapters.
- Some existing docs/scripts still describe older mailbox-first architecture and should be consolidated around RunLog Fabric.

## Not Implemented Yet

- Full replacement of `RuntimeKernel` and per-session mailbox execution with RunLog execution.
- Postgres, Redis/BullMQ, S3/R2/MinIO, Docker, VPS, Kubernetes, and managed-cloud adapters.
- Browser lease adapter with Playwright trace/artifact capture.
- Memory retrieval adapter connected to RunLog context assembly.
- Resuming an approval-paused RunLog run with a cryptographic receipt.
- Child-run/subagent helper APIs beyond the parent-run data model.
- Not implemented: hosted multi-tenant auth, real billing, remote marketplace trust, VM isolation, or secure desktop credential vault.

## Runtime Seams To Preserve During Migration

- Provider calls go through `AgentProvider.query`.
- Tool side effects go through `ToolRegistry`.
- Risk decisions go through `RuntimePolicyGuard` and approval receipts.
- Durable events remain the public trace boundary.
- Host projections must sanitize browser-facing DTOs.
- Compatibility exports should be temporary and should not become a second architecture.

## Security Limits

- Host shell execution is not a sandbox.
- Docker and WSL execution are not equivalent to VM isolation.
- Browser/localStorage provider auth is prototype-only.
- Provider keys must not be stored in renderer localStorage.
- Process execution must not be marketed as secure containment.
- Do not claim HyperCells, VM isolation, operator roles, budget caps, billing, marketplace trust, or secure desktop secrets exist unless implementation proves them.

## Current Verification

Focused RunLog verification:

```bash
pnpm exec vitest run src/core/RunLogKernel.test.ts src/package-exports.test.ts
pnpm exec tsc --noEmit
```

Broader repo verification remains:

```bash
pnpm verify
pnpm release:check
```
