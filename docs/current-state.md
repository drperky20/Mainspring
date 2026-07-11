# Current State

Last rewritten: 2026-07-10.

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
  - New SDK code can create and list durable `RunIntent` records, run them through the durable `RunLogWorker` or explicit test-only drain helpers, inspect complete or tailed `RunLogProjection` views, cancel active runs, and approve/deny pending RunLog approval requests.
  - `src/sdk/RunLogMainspring.test.ts` proves provider-only runs and approved tool resume through the public handle.
  - `pnpm example:coding-agent` now uses `createRunLogMainspring` for a read-then-approved-write coding workflow.
  - `pnpm example:personal-assistant` now uses `createRunLogMainspring` for a read-only `file.read` workspace tool run.
  - `pnpm example:support-agent` now uses `createRunLogMainspring` for a read-only approved-FAQ `file.read` workspace tool run.
  - `pnpm example:agency-client-agent` now uses `createRunLogMainspring` for a read-then-approved-write client deliverable workflow.
  - `pnpm example:local-first-agent` now uses `createRunLogMainspring` for approval-gated `memory.write`, provenance-scanned persistence, and `memory.read`.
  - `pnpm openrouter:e2e` now uses `createRunLogMainspring` for optional live OpenRouter verification when `OPENROUTER_API_KEY` and network access are available.
  - `mainspring-runlog` and `pnpm start:runlog` launch a durable local RunLog worker with explicit SQLite paths, ordered worker shutdown, host-side env secret resolution, and an EchoProvider fallback for no-key local bring-up. The existing `mainspring-runtime` executable remains the named mailbox compatibility runner.
  - Public child-run helpers preserve parent authority: a child can provide only prompt, run ID, and metadata; session, workspace, provider, credential ref, model, agent, and tool scope are inherited from its persisted parent.
  - Requested `computerId` values are first-class durable RunLog state. They are preserved through child runs and passed to tool contexts so shell backend selection honors the requested host/WSL/Docker computer instead of silently falling back to host execution.
- Durable execution and projection spine:
  - SQLite lifecycle commands commit run status, lifecycle events, and execution-outbox records together.
  - `RunLogWorker` claims work with fenced leases, heartbeats, bounded retry backoff, cancellation propagation, restart recovery, and opt-in bounded concurrency. `maxConcurrentRuns` defaults to one; same-workspace execution is serialized inside the local process.
  - Run summaries and global tool-call summaries use independent persisted cursors; each projection catches up transactionally, is idempotent across restart, and never copies raw tool input or output into the tool-call read model.
  - `context.assembled` telemetry records sanitized inclusion, compression, rehydration, and drop decisions before provider dispatch.
- Explicit RunLog gateway/API lane:
  - `CreateLocalMainspringGatewayOptions.runLog` accepts a `RunLogMainspring` host.
  - When that host is configured, the default HTTP `POST /runs/start` route validates app-state identifiers, atomically queues a RunLog-backed `RunIntent`, and returns a current compact compatibility dispatch DTO without waiting for provider or tool execution.
  - `/runlog/runs/start` creates `RunIntent` records and returns sanitized `RunLogProjection` responses.
  - `/runlog/tool-calls` returns reverse-paginated canonical tool-call summaries from the durable RunLog projection, with opaque browser row IDs and no raw tool input, output, policy payload, or host path.
  - `/runlog/runs/:runId/events` tails the same projection.
  - `/runlog/approvals/:approvalId/resolve` approves or denies through scoped RunLog receipts and returns the updated projection.
  - `pnpm gateway:dev` now constructs a local RunLog host by default, backed by `.mainspring/runlog/runlog.sqlite` and `.mainspring/runlog/workspaces`.
  - Local gateway server startup owns the RunLog worker lifecycle. Its sanitized snapshot exposes worker state, queued-run count, and durable outbox counts; shutdown stops the worker before the dev host closes its store.
  - RunLog `RunIntent` / `RunRecord` now carry opaque provider credential refs such as `env:...` or `managed:...`; provider calls receive only parsed refs plus an in-process host secret resolver.
  - Browser-facing RunLog event responses include only explicitly `public` events. `sensitive` and `artifact-only` event payloads remain host/SDK-only, and artifact-only records are not promoted through the generic event endpoint.
  - Event-stream browser-access target validation resolves a supplied canonical RunLog run from the durable store before falling back to a compatibility run, and only issues a scoped URL when its session/run pair matches. Hosted mode represents that URL with a short-lived ticket; session-only targets retain legacy session validation and global snapshot streams remain supported.
  - Gateway JSON bodies are bounded to 1 MiB before parsing, including streamed requests with missing or misleading `Content-Length` headers.
  - Gateway HTTP error bodies pass through the same browser-response sanitizer as successful DTOs, so invalid identifiers and host-side failures cannot echo known path or credential markers into the renderer.
- Console-facing RunLog projection:
  - `LocalMainspringGateway.snapshot()` can include an optional sanitized RunLog read model discovered from the durable RunLog store, including runs created outside gateway app-state metadata.
  - RunLog `usage.reported` events are synchronized into the gateway usage ledger so console totals, pricing, and budget transitions use canonical runtime facts.
  - `gatewaySnapshotToConsoleState()` projects RunLog runs, pending approvals, tool calls, checkpoint summaries, policy decision summaries, and error summaries without exposing raw private event fields.
  - The React console data-source summary and dashboard projection count RunLog active runs and pending approvals beside legacy compatibility runs.
  - The selected-client console detail panel now shows RunLog run summaries with checkpoint, policy decision, error, tool-call, and artifact counts from sanitized DTO fields.
- Gateway snapshot transport:
  - `GET /health` returns runtime liveness without constructing the broad console snapshot.
  - `GET /snapshot` remains a compatible sanitized aggregate, with `no-store` cache policy, ETag/`If-None-Match` support, and a `304` response with no body for unchanged state.
  - The server caches only the sanitized projection in process memory. The console retains its ETag and last safe projection in memory, adapts refresh timing to visibility/failure state, aborts stale work, and does not put auth material in URLs.
  - In-process mailbox writes invalidate the snapshot revision immediately; a 30-second compatibility probe discovers legacy external mailbox writers eventually. This is not a real-time cross-process event stream.
  - `GET /runlog/runs` delegates bounded canonical pagination and console-safe summary projection to `RunLogActivityPage` without constructing the broad snapshot. `GET /compatibility/runs` delegates to `CompatibilityRunPageReader`, which pages metadata-backed mailbox compatibility rows and touches only the sessions represented in that page; an app-state-scoped cache retains at most 64 session projections without consulting the broad snapshot revision. Each cached entry records its own in-process mailbox mutation revision, while a per-session database/WAL probe runs at most every 30 seconds for legacy external writers. It requires the gateway app-state store and otherwise the console falls back to its compatible snapshot.
  - `GET /runlog/tool-calls` delegates to `RunLogToolCallHistoryPage` and its separate durable projection cursor. It never reads the compatibility inventory, avoids constructing the broad snapshot, uses a reverse opaque cursor, and exposes only sanitized summary fields with an opaque scoped tool-call ID.
  - `GET /approval-history` delegates to `ApprovalHistoryPage`, requires gateway app-state metadata, and merges its bounded compatibility approvals with canonical RunLog approval summaries, preferring the RunLog row when a gateway mirror has the same approval ID. It never returns tool input, receipt snapshots, hashes, paths, or signing material; cancelled history is canonical RunLog-only because compatibility approval metadata has no cancelled state. Older/no-app-state embedders retain the compatible snapshot path.
  - `GET /runlog/runs/:runId/trace` delegates reverse pagination and a second public-event projection check to `RunLogActivityPage`. Sensitive and artifact-only records stay host/SDK-only; the console expands earlier events only while a selected RunLog detail view is open.
  - `GET /usage-history` delegates to `UsageHistoryPage`, requires gateway app-state metadata, and returns reverse-paginated browser-safe ledger rows only while the Activity Usage view is open. The aggregate snapshot still supplies compatibility summaries and provider/model breakdowns.
  - `GET /artifact-history` delegates to `ArtifactHistoryPage`, requires gateway app-state metadata, and returns reverse-paginated browser-safe artifact inventory only while the Activity Artifacts view is open. It omits durable filesystem paths and metadata; artifact bytes stay behind the existing scoped browser-access route.
  - `GET /audit-history` delegates to `AuditHistoryPage`, requires gateway app-state metadata, and returns reverse-paginated browser-safe audit rows only while the Activity Audit view is open. It omits durable audit metadata while retaining sanitized category, action, actor, target, and linkage fields.
  - `GET /memory-history?workspaceId=...` delegates to `MemoryHistoryPage`, requires gateway app-state metadata, resolves the workspace root host-side, and returns reverse-paginated browser-safe previews only while the Activity Memory view is open. It omits source metadata and never accepts or returns a workspace path. `POST /memory-history/:opaqueEntryId/correct` and `/delete` delegate mutable-memory authority to `GatewayMemoryControl`, which resolves the same opaque ID only inside that registered workspace, requires operator authority, and returns only a refreshed preview or opaque deletion receipt. The JSONL store is still read per selected workspace to produce deterministic ordering; this is not yet a global memory index.
- Live SaaS-style console:
  - `apps/console/src/ConnectedConsoleApp.tsx` is the default app surface and connects to the local gateway over the public browser-safe gateway client.
  - The first-run UI is a setup wizard for account basics and provider profile setup.
  - The first-level UI is organized around Home, Workspaces, Activity, and Settings. Runs, canonical tool calls, approvals, usage, artifacts, audit, and memory remain explicit Activity views; detailed Tool Calls, Usage, Artifacts, Audit, and per-selected-workspace Memory history load incrementally only while their view is open; loading, stale, offline, unauthorized, empty, and error states remain visible.
  - `ConsoleNavigation.tsx` owns primary/activity navigation; `ConsoleProviderCatalog.tsx`, `ConsoleSetup.tsx`, `ConsoleClientForms.tsx`, and `ConsoleSettings.tsx`/`ConsoleSettings.css` own provider, first-run, client-editing, and settings UI/style boundaries; `ConsoleWorkflowPrimitives.tsx` owns shared dialogs, including labelled initial focus, Escape dismissal, Tab cycling within the dialog, and focus return, plus the action rail, tool toggles, and automation-flow rendering; `useConsoleRunActivity.ts` owns scoped run streaming; and dedicated cursor hooks load RunLog, canonical tool-call, compatibility, approval, trace, usage, artifact, audit, and per-workspace memory pages only while their Activity surface is visible.
  - On narrow screens, primary navigation remains visible at the bottom and client tabs become a two-column grid so every client surface stays reachable without horizontal clipping.
  - The run detail view exposes the sanitized event timeline, tool calls, checkpoints, policy decisions, errors, and native RunLog or compatibility-run cancellation.
  - Chat and run-control state is scoped by client and agent so switching workspaces does not leak UI state between operators' contexts.
  - Each client gets a default workspace and first agent; chat, agent editing, and automation testing are scoped inside the selected client.
  - The console exposes OpenRouter and OpenAI provider profiles as live backend-backed service connections; Codex OAuth, direct Anthropic, and other providers are visible as connector or catalog paths until backend adapters exist.
  - Dedicated per-client dashboard links, per-client accounts, and tenant authorization are not implemented.
- Package subpaths now expose `mainspring/core`, `mainspring/adapters`, `mainspring/adapters/sqlite`, `mainspring/adapters/local-blob`, `mainspring/capabilities`, `mainspring/hosts/runlog`, and `mainspring/compat`.
- Repository verification invokes the project doctor explicitly through `pnpm run doctor`, strict-compiles all root test files through `pnpm test:typecheck`, and then runs the test suite. The release gate uses `pnpm package:pack:check` to create and validate a pnpm tarball in a temporary directory that is removed before success is reported; npm's package dry-run remains a separate check.
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
- Non-tool authority decisions use the same durable `DecisionRecord` shape:
  - attenuated child-run creation appends a public `subagent.create` decision to the parent RunLog before creating the child; the decision binds the generated child run id and records inherited authority without exposing credentials or workspace roots.
  - `GatewayProviderProfileControl` records hash-only `provider_config.write` authority before provider-profile create/update can change app state. Managed-secret values stay host-side and the authenticated hosted principal, rather than browser input, supplies the audit actor.
  - `GatewayDeploymentControl` writes hash-only `deployment.target.write` authorization before deployment-target create/update can persist, and records a `deployment.execute` decision bound to resolved target and preflight-plan hashes before an exact-confirmed driver invocation. Hosted routes supply the authenticated principal for target changes and execute audit rows; browser-supplied attribution is ignored.
  - `GatewayCronControl` records hash-only `cron.schedule.write` decisions before schedule create/update/delete and `cron.grant.create` before a scoped grant can change schedule metadata. Hosted gateway routes supply the authenticated principal as the actor, overriding a request-body grant actor.
  - `GatewayBudgetControl` records hash-only `budget.write` authority before budget create/update/delete, and records `budget.warning.acknowledge` or `budget.run.block` before a warning-band or blocked run can reach an enqueue path. Hosted gateway routes supply the authenticated principal as the actor, never a request body field; run text remains transient and only its binding hash is retained.
  - `GatewayTopologyControl` owns client, workspace, agent, and linked runtime-session mutations. It resolves browser-safe IDs against host app state, rejects cross-client workspace updates, records hash-only `topology.write` authorization before writes, and keeps workspace roots and agent metadata out of decision inputs. Hosted routes supply the authenticated principal rather than browser attribution.
  - `GatewayMarketplaceControl` owns pinned remote-catalog synchronization plus verified local and signed-remote template installation. It persists hash-only `marketplace.catalog.sync` authority before replacing the in-memory remote registry, validates the selected template and runtime profile before writing, persists `marketplace.install` authority before template files are copied, passes the authenticated actor through topology provisioning, and records failure/success evidence without raw template content or workspace roots.
  - artifact handling in the gateway is read-only indexing of runtime-created artifacts; the gateway has no artifact-publish mutation surface.
  - channel sends remain explicitly on the legacy mailbox compatibility path and are not presented as RunLog-native authority.
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
  - `GatewayCronControl` owns schedule/grant control-plane mutations; preview is read-only and does not synchronize an agent record. Its audit records contain only decision and binding hashes, never raw prompts or grant inputs.
  - sanitized cron schedule DTOs expose grant id, expiry, execution counts, allowed tools, and last decision state.
  - the React console exposes dedicated controls to review the current grant decision and create a short-lived scoped grant without showing raw prompt hashes or secret refs.
  - gateways constructed without a RunLog host keep the mailbox compatibility dispatch path for older embedders and migration verifiers.
- Local-agent security regression coverage now exists in `src/security/agent-security-regression.test.ts` with a companion matrix in `docs/security-redteam-matrix.md`.
  - The focused corpus covers host shell approval, loader/env-var injection, network-to-shell hard blocks, path traversal, symlink/junction escape, workspace mutation approval, browser/local URL policy, web-fetch SSRF rejection, memory and skill write approval, MCP/tool bridge policy routing, headless cron denial, cron grant mutation, and budget control/acknowledgement authority.
  - The matrix explicitly records partial/deferred classes such as cross-agent spoofing, subagent privilege expansion, remote skill trust, hosted provenance trust, and browser trace/artifact policy.
- Memory, skill, and local template provenance now has a canonical module:
  - `src/provenance/ProvenanceReview.ts` scans memory mutations, skill manifests, and local template catalog entries with deterministic content hashes.
  - staged review records persist in `.mainspring/provenance-review.jsonl`.
  - `memory.write` and `skills.install` / `skills.update` scan before persistence, block high-risk findings, and stage review findings.
  - JSONL memory correction/deletion now appends `memory.replaced` or `memory.deleted` journal rows rather than rewriting source rows. Replay ignores incomplete trailing rows, normalizes legacy no-ID rows to stable host-only identities, and only applies an unambiguous active target. Gateway corrections rescan the replacement, preserve a fresh operator-reviewed provenance record, and persist hash-only host-decision evidence in both the memory journal and gateway audit store.
  - approved staged memory and skill writes use replay-safe exported review helpers: if a process stops after the durable memory/skill write but before the review journal update, the next apply finds the matching review ID/content hash, marks the review applied, and does not write a duplicate; already-applied matching records also replay without a second write.
  - `GatewayProvenanceReviewControl` owns local gateway review decisions and applies. It records hash-only `provenance.review.decide` or `provenance.review.apply` host decisions in app-state audit before mutating the review queue or reaching a memory/skill writer; hosted requests use the authenticated session actor rather than a caller-provided reviewer. The React console can list, approve, reject, and apply staged memory/skill review records through sanitized browser DTOs that omit decision metadata.
  - persisted memory records and skill manifests carry advisory provenance/taint metadata for future policy and context assembly.
  - `pnpm skills:check` scans local example templates and runs inside `pnpm verify` and `pnpm release:check`.

## Prototype Or Migration Surfaces

- The old mailbox/runtime path is still present and still important for existing `createMainspring` SDK/gateway behavior.
- The compatibility runner resolves each mailbox session to its persisted SDK workspace record. Metadata-free legacy/channel sessions receive separate per-session workspace directories beneath `MAINSPRING_WORKSPACE_ROOT`; this path separation is not a sandbox, and the runner no longer shares one workspace root across all sessions.
- All runnable examples now exercise the RunLog SDK host; the old mailbox/runtime path remains for legacy `createMainspring` SDK/gateway compatibility and tests.
- The default gateway `/runs/start` route is RunLog-backed in the local dev server and in gateways configured with `CreateLocalMainspringGatewayOptions.runLog`; gateways constructed without a RunLog host remain mailbox-compatible for migration tests and older embedders.
- New non-tool mutation surfaces must use `createHostDecisionRecord`; provider-profile, provenance-review, deployment, cron, budget, and operator-memory controls persist this decision shape with hash-only mutation evidence. The existing channel bridge remains compatibility-only until it gains a RunLog-native identity model.
- Desktop packaging is experimental and Windows-focused.
- Provider auth and renderer storage must continue moving toward env/local-secret/external-secret adapters.
- Contributor, governance, operations, and security guidance now describe RunLog Fabric as canonical while keeping the mailbox/`RuntimeKernel` path compatibility-only.

## Not Implemented Yet

- Full replacement of `RuntimeKernel` and per-session mailbox execution with RunLog execution.
- Broader provider-account auth beyond env/local managed refs, such as OAuth provider auth or hosted KMS.
- AI SDK streaming transport endpoint for the console chat surface; the UI package dependency exists, but gateway chat dispatch still goes through `/runs/start`.
- Postgres, Redis/BullMQ, S3/R2/MinIO, and managed-cloud control-plane adapters. Docker execution plus local/container/VPS/Kubernetes deployment drivers exist, but the Kubernetes driver has not been certified against a real production cluster and none of these are VM isolation.
- Browser lease adapter with Playwright trace/artifact capture.
- Browser/page multimodal context and provider-specific content-part adapters.
- Per-provider and richer usage projections beyond the persisted run-summary and tool-call cursors.
- Remote skill marketplace trust, hosted key revocation/discovery, payments, and third-party reputation. Signed remote template catalog distribution is implemented separately with explicit publisher/key pins.
- General checkpoint replay/retry controls beyond the implemented approval-resume continuation.
- Remote child-run/subagent dispatch, identity, and trust boundaries beyond the local attenuating child-run SDK helper.
- Hosted or remote provenance review trust beyond the local staged review queue.
- Not implemented: hosted multi-tenant auth, real billing, paid marketplace/reputation services, VM isolation, secure desktop credential vault, or packaged updater publishing.

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
- Browser/localStorage provider auth is prototype-only in legacy read-model helpers and must not be reintroduced as the live console auth path.
- Provider keys must not be stored in renderer localStorage.
- Process execution must not be marketed as secure containment.
- Hosted gateway sessions now enforce persisted admin/operator/viewer roles before route body parsing. This is local route authorization, not tenant isolation or enterprise identity.
- Do not claim HyperCells, VM isolation, provider-side budget reservation, billing, hosted marketplace reputation/payments, tenant isolation, or secure desktop secrets exist unless implementation proves them.

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
