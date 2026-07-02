# Current State

Last rewritten: 2026-07-02.

This is the repo-grounded current state. `docs/goal-digest.md` remains the repo-local long milestone ledger and is excluded from npm package artifacts.

## Exists Now

- TypeScript package named `mainspring`.
- Existing SDK, gateway, console, mailbox runtime, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider abstraction, `ToolRegistry`, policy guard, approval receipts, tools, memory, usage, cron, deployment, and verification scripts.
- New canonical RunLog Fabric skeleton:
  - `src/core` for `AgentSpec`, `RunIntent`, `RunLogEvent`, `RunLogKernel`, `RunLogScheduler`, `RunLogExecutor`, provider routing, and checkpoints.
  - `src/adapters/sqlite` for the default SQLite WAL RunLog store with agents, runs, leases, events, checkpoints, and cron rows.
  - `src/adapters/local-blob` for content-addressed local blob storage.
  - `src/capabilities/workspace` for lazy local workspace leases.
  - `src/capabilities/cron` for due cron rows, scoped headless grants, prompt/schedule hashes, execution limits, and cron policy decisions.
  - `src/hosts/runlog` for host-facing run projections.
  - `src/compat` for migration exports.
- RunLog-native SDK host:
  - `src/sdk/RunLogMainspring.ts` exports `createRunLogMainspring`.
  - New SDK code can create `RunIntent` records, drain through `RunLogKernel`, inspect `RunLogProjection`, and approve/deny pending RunLog approval requests.
  - `src/sdk/RunLogMainspring.test.ts` proves provider-only runs and approved tool resume through the public handle.
  - `pnpm example:personal-assistant` now uses `createRunLogMainspring` for a read-only `file.read` workspace tool run.
  - `pnpm example:support-agent` now uses `createRunLogMainspring` for a read-only approved-FAQ `file.read` workspace tool run.
  - `pnpm openrouter:e2e` now uses `createRunLogMainspring` for optional live OpenRouter verification when `OPENROUTER_API_KEY` and network access are available.
- Explicit RunLog gateway/API lane:
  - `CreateLocalMainspringGatewayOptions.runLog` accepts a `RunLogMainspring` host.
  - When that host is configured, the default HTTP `POST /runs/start` route creates a RunLog-backed run through `RunIntent` and returns the compact compatibility run dispatch DTO.
  - `/runlog/runs/start` creates `RunIntent` records and returns sanitized `RunLogProjection` responses.
  - `/runlog/runs/:runId/events` tails the same projection.
  - `/runlog/approvals/:approvalId/resolve` approves or denies through scoped RunLog receipts and returns the updated projection.
  - `pnpm gateway:dev` now constructs a local RunLog host by default, backed by `.mainspring/runlog/runlog.sqlite` and `.mainspring/runlog/workspaces`.
  - RunLog `RunIntent` / `RunRecord` now carry opaque provider credential refs such as `env:...` or `managed:...`; provider calls receive only parsed refs plus an in-process host secret resolver.
- Console-facing RunLog projection:
  - `LocalMainspringGateway.snapshot()` can include an optional sanitized RunLog read model for runs known to gateway app-state metadata.
  - `gatewaySnapshotToConsoleState()` projects RunLog runs, pending approvals, tool calls, checkpoint summaries, policy decision summaries, and error summaries without exposing raw private event fields.
  - The React console data-source summary and dashboard projection count RunLog active runs and pending approvals beside legacy compatibility runs.
  - The selected-client console detail panel now shows RunLog run summaries with checkpoint, policy decision, error, tool-call, and artifact counts from sanitized DTO fields.
- Package subpaths now expose `mainspring/core`, `mainspring/adapters`, `mainspring/adapters/sqlite`, `mainspring/adapters/local-blob`, `mainspring/capabilities`, `mainspring/hosts/runlog`, and `mainspring/compat`.
- `docs/migration-runlog.md` records the legacy mailbox/`RuntimeKernel` retirement map and `pnpm runlog:migration:check` keeps that map tied to existing source files, package exports, and release checks.
- Focused tests prove provider-only runs, tool calls, approval pauses, approval/denial decisions, SQLite-backed approval resume, SQLite restart recovery, cron-created runs, lazy workspace materialization, and 1000 idle agents stored as data.
- RunLog approval resume now has scoped signed receipts:
  - approval requests persist private run/tool/input/workspace/policy/tool-manifest/provider snapshots in SQLite.
  - approval and denial decisions append durable RunLog events.
  - approved receipts can resume a paused tool after SQLite-backed restart, validate the original snapshot, mark the receipt used, and execute only through `ToolRegistry`.
  - approved tool results are replayed to the provider as reconstructed user/assistant-tool/tool messages so the run can complete with a post-tool assistant result.
  - mutation, expiry, tool-manifest drift, workspace drift, and replay attempts fail closed in focused tests.
- Tool policy decisions are now durable RunLog facts on the canonical tool path:
  - `ToolRegistry` creates a `DecisionRecord` for every guarded tool execution attempt.
  - `RunLogExecutor` appends `policy.decision.recorded` before approval, block, or completion handling.
  - decision states are `allow`, `deny`, `clarify`, `requires_approval`, `stage_for_review`, and `hard_block`.
  - tool completion, approval, and block events carry the related `decisionId`.
  - hard-block shell patterns such as catastrophic wipes, fork bombs, credential dumping, Git remote/hook mutation, approval disabling, and network-to-shell execution cannot be approved by a receipt.
- RunLog cron rows now fail closed at the schedule-to-run boundary:
  - side-effecting headless schedules deny by default without queueing work.
  - scoped cron grants bind agent, prompt hash, schedule hash, allowed tools, expiration, and execution count.
  - due cron rows append `policy.decision.recorded` before `run.queued` or `run.failed`.
  - prompt mutation, grant expiry, execution-limit exhaustion, and schedule mismatch fail closed in focused tests.
- Gateway cron scheduling now uses the same RunLog cron policy path when the gateway is configured with a RunLog host:
  - provider-only schedules become ordinary RunLog runs with `cron.due` and `policy.decision.recorded` events.
  - side-effecting schedules fail closed without a scoped grant.
  - `GET /cron/:scheduleId/grant` previews the current scoped grant decision without returning the raw prompt.
  - `POST /cron/:scheduleId/grant` derives an expiring scoped grant from the current schedule, agent, prompt hash, schedule hash, workspace, and allowed tools.
  - sanitized cron schedule DTOs expose grant id, expiry, execution counts, allowed tools, and last decision state.
  - the React console exposes dedicated controls to review the current grant decision and create a short-lived scoped grant without showing raw prompt hashes or secret refs.
  - gateways constructed without a RunLog host keep the mailbox compatibility dispatch path for older embedders and migration verifiers.
- Local-agent security regression coverage now exists in `src/security/agent-security-regression.test.ts` with a companion matrix in `docs/security-redteam-matrix.md`.
  - The focused corpus covers host shell approval, loader/env-var injection, network-to-shell hard blocks, path traversal, symlink/junction escape, workspace mutation approval, browser/local URL policy, web-fetch SSRF rejection, memory and skill write approval, MCP/tool bridge policy routing, headless cron denial, and cron grant mutation.
  - The matrix explicitly records partial/deferred classes such as cross-agent spoofing, subagent privilege expansion, malicious remote skill payload review, skill memory poisoning, and browser-adapter private-network enforcement.
- Memory, skill, and local template provenance now has a canonical module:
  - `src/provenance/ProvenanceReview.ts` scans memory mutations, skill manifests, and local template catalog entries with deterministic content hashes.
  - staged review records persist in `.mainspring/provenance-review.jsonl`.
  - `memory.write` and `skills.install` / `skills.update` scan before persistence, block high-risk findings, and stage review findings.
  - approved staged memory and skill writes can be applied through exported review helpers.
  - the local gateway and React console can list, approve, reject, and apply staged memory/skill review records through sanitized browser DTOs.
  - `pnpm skills:check` scans local example templates and runs inside `pnpm verify` and `pnpm release:check`.

## Prototype Or Migration Surfaces

- The old mailbox/runtime path is still present and still important for existing `createMainspring` SDK/gateway behavior.
- Some compatibility examples still exercise the old mailbox/runtime path during migration, especially write-heavy and memory-focused flows.
- The default gateway `/runs/start` route is RunLog-backed in the local dev server and in gateways configured with `CreateLocalMainspringGatewayOptions.runLog`; gateways constructed without a RunLog host remain mailbox-compatible for migration tests and older embedders.
- Non-tool host surfaces such as channel sends, provider config mutation, artifact publish, and future subagent creation still need explicit `DecisionRecord` adapters as those surfaces become RunLog-native.
- Desktop packaging is experimental and Windows-focused.
- Provider auth and renderer storage must continue moving toward env/local-secret/external-secret adapters.
- Some existing docs/scripts still describe older mailbox-first architecture and should be consolidated around RunLog Fabric.

## Not Implemented Yet

- Full replacement of `RuntimeKernel` and per-session mailbox execution with RunLog execution.
- Broader provider-account auth beyond env/local managed refs, such as OAuth provider auth or hosted KMS.
- Postgres, Redis/BullMQ, S3/R2/MinIO, Docker, VPS, Kubernetes, and managed-cloud adapters.
- Browser lease adapter with Playwright trace/artifact capture.
- Memory retrieval adapter connected to RunLog context assembly.
- Remote skill marketplace trust, signed catalog distribution, and third-party reputation.
- General checkpoint replay/retry controls beyond the implemented approval-resume continuation.
- Child-run/subagent helper APIs beyond the parent-run data model.
- Hosted or remote provenance review trust beyond the local staged review queue.
- Not implemented: hosted multi-tenant auth, real billing, remote marketplace trust, VM isolation, or secure desktop credential vault.

## Runtime Seams To Preserve During Migration

- Provider calls go through `AgentProvider.query`.
- Tool side effects go through `ToolRegistry`.
- Risk decisions go through `RuntimePolicyGuard` and approval receipts.
- Tool-path policy decisions must emit `policy.decision.recorded` before the tool executor is reached.
- RunLog cron/headless decisions must emit `policy.decision.recorded` before enqueueing or failing the due run.
- Durable events remain the public trace boundary.
- RunLog approval decisions must keep using scoped signed receipts and one-time-use receipt rows.
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
pnpm exec vitest run src/core src/tools src/policy
pnpm exec vitest run src/security src/policy src/tools src/core
pnpm runlog:migration:check
pnpm exec tsc --noEmit
```

Broader repo verification remains:

```bash
pnpm verify
pnpm release:check
```
