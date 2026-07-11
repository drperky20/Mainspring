# Changelog

All notable changes to Mainspring will be documented in this file.

The format follows Keep a Changelog and the project uses Semantic Versioning once public release tags begin.

## [Unreleased]

- Consolidated CI around one cross-platform verification matrix, a retained-artifact
  Chromium console E2E lane, pinned pnpm activation, and the canonical local release
  command so pull requests and release jobs exercise the same gates.
- Repaired hosted cross-platform verification: artifact containment now handles
  macOS canonical temp paths, RunLog outbox ties retain enqueue order, and Windows
  managed-secret checks use an explicit PowerShell Security preflight plus PowerShell
  Core when the hosted runner provides it.
- Updated hosted CI actions to the current Node 24-compatible checkout, setup-node,
  and artifact-upload majors, with the repository workflow verifier enforcing the
  same versions locally and in CI.

### Added
- `GatewayBudgetEvaluator` now owns read-only budget scope matching, usage rollups,
  and warning/block derivation while `GatewayBudgetControl` retains durable authority.
- `GatewaySnapshotReader` now owns read-only aggregate snapshot assembly, RunLog
  summary projection, worker/outbox status, and server-only revision-token caching,
  leaving `LocalGateway` focused on stable facade and command orchestration.
- `GatewayProjectionSynchronizer` now owns restart-safe catch-up of approval,
  usage, tool-call, artifact, execution-cell, and terminal-lease projections;
  `LocalGateway` supplies read-only runtime readers and keeps the public facade.
- `GatewayRunInputResolver` now owns the shared session, workspace/client,
  agent, provider-profile, and runtime-profile binding checks used by gateway
  and RunLog ingress plus cron preparation.
- `GatewayCronScheduler` now owns bounded cron polling lifecycle, due-row
  selection, overlapping-tick coalescing, timer cleanup, and operator-visible
  tick errors while `LocalGateway` retains policy and run orchestration.
- `ConsoleClientWorkspaceFrame` now owns the selected-client header, workspace
  context, client tabs, and two-column shell while the connected app retains
  feature state and command orchestration.
- `ConsoleClientWorkspaceViews` now owns client chat, agent editing, automation
  testing, access preview, tool configuration, and their feature-local helpers,
  reducing the connected shell to composition and gateway state orchestration.
- The console control-room skin now keeps client/setup/chat/automation feature
  styling in `controlRoomWorkspace.css`, leaving shell, activity, and shared
  state styling in `controlRoom.css` without changing the rendered design.
- Console run detail navigation now preserves a validated screen/activity/run
  deep link, and compatibility trace loading is session-bound and abortable so
  fast run changes cannot apply stale event responses to the selected run.
- Runtime kernel, SQLite mailbox, SDK, provider registry, tool registry, policy guard, approval receipts, and event journal package surfaces.
- Prototype founder-cockpit console with explicit localStorage honesty and development gateway fixture previews.
- Launch-baseline branding assets, examples, and open-source documentation set.
- Conditional console snapshot delivery with a server-only sanitized revision cache, adaptive browser revalidation, and a cheap health probe.
- Configurable bounded RunLog worker concurrency with same-workspace process-local serialization and deterministic performance coverage.
- `ConsoleNavigation` and `useConsoleRunActivity` boundaries for the connected operator shell.
- Workspace-scoped, cursor-paginated memory history with browser-safe previews and no browser-supplied host paths.
- Durable operator memory correction and deletion with append-only JSONL replacement/tombstone records, opaque workspace-scoped gateway routes, provenance-aware corrections, audit evidence, and console confirmation dialogs.
- Durable, restart-safe canonical RunLog tool-call summaries with a dedicated cursor, bounded `GET /runlog/tool-calls` history route, opaque browser IDs, and an incremental Activity view.
- Bounded `GatewayDeploymentControl` ownership for deployment target configuration and driver execution.
- Bounded `GatewayProvenanceReviewControl` ownership for staged review decisions and durable memory/skill applies.
- Bounded `GatewayCronControl` ownership for cron schedule configuration, scoped grant issuance, and pre-dispatch trigger authority.
- Bounded `GatewayBudgetControl` ownership for budget configuration, warning acknowledgement, and hard-block authority.
- Bounded `GatewayProviderProfileControl` ownership for provider configuration and managed-secret authority.
- Bounded `GatewayTopologyControl` ownership for client/workspace/agent/session topology, with cross-client binding checks and pre-mutation authority records.
- Bounded `GatewayMarketplaceControl` ownership for verified template file installation and client/workspace/agent provisioning.
- Bounded `GatewayRunControl` ownership for run ingress and approval-response authority.
- Explicit runtime projection writes for artifact and usage read models, with non-negative usage validation and root-contained, symlink-safe artifact download handles.
- Canonical RunLog artifact-created and completed-tool outputs now feed the gateway
  artifact inventory through the same bounded-ID/path-derived projection seam as
  compatibility events.

### Changed
- Verification lane standardized around `pnpm verify`.
- Public docs now separate implemented behavior, prototype-only surfaces, and roadmap claims more explicitly.
- Operator navigation now groups normal work into Home, Workspaces, Activity, and Settings; runs, canonical tool calls, approvals, usage, artifacts, audit, and memory are Activity views.

### Security
- Security language now consistently states that host shell execution is not a sandbox and browser-side provider auth remains prototype-only.
- Gateway error bodies now pass through the same path/credential sanitizer as successful browser responses.
- Memory correction/deletion routes accept only opaque browser IDs scoped to registered workspaces; raw JSONL IDs, workspace roots, source metadata, and full values remain host-side.
- Deployment target writes now persist hash-only authorization before app-state mutation, and exact-confirmed driver invocations retain bound target/plan decisions before external execution; hosted session identity replaces browser attribution and browser DTOs omit decision/configuration metadata.
- Provenance review decisions and applies now persist hash-only host decision evidence before queue or workspace mutation, recover a write interrupted before the review journal update, and use the hosted session actor instead of a browser-supplied reviewer.
- Gateway cron schedule create/update/delete and grant issuance now persist hash-only pre-mutation host decisions; hosted session identity overrides a browser-supplied grant actor.
- Manual and scheduled gateway cron triggers now persist hash-only `cron.trigger` authority before schedule cursor mutation or dispatch, carry the trigger decision into RunLog metadata, and attribute HTTP triggers to the hosted session.
- Gateway budget create/update/delete now persist hash-only `budget.write` authority before app-state mutation; warning acknowledgements and hard blocks record the matching pre-enqueue decision, with hosted identity supplied only by the authenticated gateway principal.
- Gateway provider-profile create/update now persist hash-only `provider_config.write` authority before app-state mutation; managed-secret values remain host-side, and hosted identity replaces browser-supplied attribution.
- Gateway client/workspace/agent/session topology mutations now persist hash-only `topology.write` authority before writes, reject cross-client workspace mutation, and use hosted session identity instead of browser attribution; workspace roots remain hash-only in audit evidence.
- Pinned remote-catalog sync and verified local/signed-remote marketplace installs now persist hash-only `marketplace.catalog.sync`/`marketplace.install` authority before registry or file writes, propagate hosted identity through topology provisioning, and record failures without raw template content or workspace roots.
- Gateway compatibility and RunLog ingress now persist hash-only `run.enqueue` authority before runtime enqueue, `run.cancel` before mailbox or RunLog cancellation, and `approval.resolve` before legacy lifecycle mutation or RunLog receipt creation; run/session bindings fail closed, outcome/failure rows retain decision links, and hosted principals replace browser attribution.
- Gateway audit timestamps now advance past the latest durable row so same-tick authorization and outcome records retain observable insertion order.
- Artifact downloads now resolve against the runtime artifact root after realpath validation and stream an already-open file handle; untrusted media types fall back to `application/octet-stream`.
- App-state artifact and usage mutations are separated from their read surfaces through an explicit runtime projection namespace; invalid negative, fractional, non-finite, or oversized numeric values are rejected before ledger writes.
