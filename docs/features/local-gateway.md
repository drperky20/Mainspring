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
- pinned signed remote template catalog sync and text-only installs
- deployment target/run metadata
- optional hosted-auth mode
- hosted admin/operator/viewer authorization

When the gateway is configured with a RunLog SDK host, the default `/runs/start` route creates a `RunIntent`, drains through `RunLogKernel`, and returns the compact compatibility run dispatch DTO. Gateways without a RunLog host keep the mailbox-compatible SDK run path. The explicit `/runlog/runs/start`, `/runlog/runs/:runId/events`, and `/runlog/approvals/:approvalId/resolve` routes expose `RunLogProjection`-based responses for RunLog-aware clients.

The local dev server created by `pnpm gateway:dev` now configures that RunLog host by default. It stores RunLog state under `.mainspring/runlog/runlog.sqlite`, materializes RunLog workspaces under `.mainspring/runlog/workspaces`, and uses env-backed OpenRouter/OpenAI credentials only when the matching key is present. Without a live provider key it uses `EchoProvider` so source checkout bring-up stays local and free. Managed provider profile secrets are resolved host-side for RunLog provider calls through opaque credential refs; raw secret values are not written to RunLog events or browser DTOs.

`GatewayProviderProfileControl` owns provider-profile create/update authority. Before the app-state store can write a profile or rotate a managed secret, it persists a hash-only `provider_config.write` decision in the gateway audit trail; the post-mutation audit row retains that decision for compatibility. In hosted mode, the route supplies the authenticated principal as the actor rather than accepting browser-provided attribution. Secret values pass only to host-side managed-secret encryption and are never retained in the decision or browser DTOs.

`MAINSPRING_GATEWAY_ENV=production` disables the sample client/workspace bootstrap by default and fails startup unless explicit provider, model, and provider credential configuration is present. The Kubernetes deployment driver sets this mode and also sets `MAINSPRING_GATEWAY_BOOTSTRAP_SAMPLE_STATE=0` explicitly.

`MAINSPRING_RUNLOG_APPROVAL_KEY_MODE=configured` makes RunLog approval receipt signing fail closed unless `MAINSPRING_RUNLOG_APPROVAL_KEY` is set. The default `local-dev` mode keeps no-key source checkout examples ergonomic and should not be used for non-local deployments.

## Health and snapshot transport

`GET /health` is a cheap liveness response. It reads the runtime health state
without constructing the broad console projection, so startup probes and
desktop diagnostics do not pay the cost of `/snapshot`.

`GET /snapshot` remains a compatible full sanitized console document. It sends
`Cache-Control: no-store`, `Vary: Authorization, Origin`, and a deterministic
ETag. A client may send `If-None-Match`; unchanged state receives `304 Not
Modified` with no body. The server keeps only its already-sanitized DTO in a
process-local revision cache. The browser client keeps its ETag and last safe
projection only in memory, never in URLs or persistent browser storage.

The revision combines app-state writes, RunLog lifecycle state, runtime health,
and a process-local mailbox mutation token. A bounded 30-second database/WAL
fingerprint probe remains for mailbox-compatible external writers. This makes normal
in-process refreshes inexpensive while retaining eventual discovery of legacy
out-of-process mailbox writes. It is not a real-time multi-process event bus.

The full snapshot is still a compatibility aggregate. Runs, traces, and other
advanced read models should move to bounded, purpose-specific endpoints before
the aggregate is narrowed or removed.

`GET /runlog/runs` returns a canonical, sanitized RunLog activity page with a
default limit of 25 and a maximum of 100 rows. `nextCursor` is opaque and can
be sent back as `cursor` to continue in reverse creation order. Each row uses
a bounded 64-event projection tail.

`GET /compatibility/runs` supplies the matching cursor-paginated mailbox
compatibility history. It requires the gateway app-state store and queries only
the metadata rows and session mailboxes represented by its page; canonical
RunLog records are excluded. `CompatibilityRunPageReader` owns this bounded
read model behind the stable `LocalGateway.compatibilityRuns` facade. Its
app-state-scoped cache retains at most 64 session projections without calling
the broad snapshot revision. Each entry invalidates immediately for its own
process-local mailbox mutation; a per-session database/WAL fingerprint is
refreshed at most every 30 seconds for legacy external writers. The console
merges both pages into one Activity timeline. Older/no-app-state embedders
retain the compatible `/snapshot` path.

`GET /approval-history` delegates to `ApprovalHistoryPage`, requires the
gateway app-state store, and pages its compatibility approval metadata together
with canonical RunLog approval summaries, preferring the RunLog source when
both have a mirrored approval ID. It returns only identifiers, status, safe
target labels, timestamps, and client/agent linkage fields—not private tool
input, receipt data, workspace paths, hashes, or signing material. Because the
compatibility store has no cancelled state, a `status=cancelled` page contains
only canonical RunLog rows. Older/no-app-state embedders retain the compatible
`/snapshot` path.

`GET /runlog/runs/:runId/trace` returns public events in reverse-cursor pages
and sends each page in chronological order for display. Sensitive and
artifact-only events remain host/SDK-only. The legacy
`/runlog/runs/:runId/events` projection route remains compatible for existing
RunLog-aware callers.

`GET /usage-history` returns a browser-safe, reverse-cursor page of detailed
usage ledger rows with a default limit of 25 and maximum of 100. It requires
the gateway app-state store and omits ledger metadata, rate-limit details, and
other host-only fields. The compatible snapshot remains the source of summary
and provider/model breakdown data.

`GET /artifact-history` returns a browser-safe, reverse-cursor page of indexed
artifact rows with the same default and maximum limits. It requires the gateway
app-state store, omits durable paths and persistence metadata, and does not
grant file access; artifact content still requires the existing scoped
browser-access route.

`GET /audit-history` returns a browser-safe, reverse-cursor page of local
audit rows with the same limits. It requires the gateway app-state store and
omits durable event metadata while returning sanitized category, action, actor,
target, and optional run/session linkage fields.

`GET /memory-history?workspaceId=...` returns a browser-safe, reverse-cursor
page of memory previews for one gateway-registered workspace with the same
limits. It requires the gateway app-state store, resolves the workspace root
only on the host, and omits memory metadata, raw paths, and source entry IDs.
It never accepts a browser-supplied workspace root. The JSONL source is read
for the selected workspace to produce a deterministic page; this is deliberately not a claim
of a global memory index.

The console fetches these routes only while the related Activity surface is
open: Runs loads the two activity pages, Approvals loads approval history, and
a selected RunLog detail loads its public trace page; Usage loads detailed
ledger history; Artifacts loads the bounded inventory; Audit loads the bounded
authority trail; Memory loads the selected workspace's bounded preview page.

When a gateway has a RunLog host, cron tick and run-now dispatch create ordinary RunLog runs with `cron.due` and `policy.decision.recorded` events. Provider-only cron schedules queue normally; side-effecting schedules fail closed unless their metadata carries a scoped, unexpired cron grant. `GatewayCronControl` owns schedule create/update/delete and grant issuance: it writes a hash-only `cron.schedule.write` or `cron.grant.create` host decision to the audit trail before app-state mutation. Hosted requests use the authenticated principal instead of a browser-supplied grant actor. Operators can call `GET /cron/:scheduleId/grant` to preview the current grant decision and `POST /cron/:scheduleId/grant` to create an expiring scoped grant derived from the current schedule; the preview is read-only and does not synchronize an agent record. The React console also exposes review/create controls that display the grant state without raw prompt hashes or secret refs. Gateways without a RunLog host keep the mailbox-compatible cron path for older embedders and migration verifiers.

`GatewayBudgetControl` owns budget create/update/delete and the budget decision immediately before a run can be queued. Configuration changes write a hash-only `budget.write` decision before mutation. A warning-band run records `budget.warning.acknowledge` as `requires_approval` or `allow`; a hard limit records `budget.run.block` as `hard_block`. The run binding is hashed only, so prompts and secret references never enter the control-plane audit record. Hosted budget routes attach the authenticated principal, not any browser-provided attribution.

`GatewayTopologyControl` owns client, workspace, agent, and linked runtime-session topology. Client/workspace/agent IDs are resolved against host app state, workspace updates must remain attached to the selected client, and client/workspace/agent/session writes persist hash-only `topology.write` authorization before mutation. Workspace roots, agent instructions, and arbitrary metadata are represented by hashes in decision evidence; hosted routes attach the authenticated principal rather than a request-body actor. Deletion remains fail-closed while linked agents, runs, approvals, artifacts, usage, budgets, or runtime sessions exist.

Staged memory/skill provenance reviews are exposed through local gateway routes:

- `GET /provenance-reviews?workspaceId=...`
- `POST /provenance-reviews/:reviewId/decision`
- `POST /provenance-reviews/:reviewId/apply`

These routes read the workspace-local `.mainspring/provenance-review.jsonl` queue, return sanitized browser DTOs, and apply only previously approved staged memory/skill mutations. `GatewayProvenanceReviewControl` records a hash-only `provenance.review.decide` decision before changing the queue and a `provenance.review.apply` decision before reaching the memory or skill writer. Its audit evidence binds the selected workspace and a review-content hash; browser DTOs omit that decision metadata. If a process stops after a durable memory/skill write but before the review journal becomes `applied`, a later apply detects the matching review ID/content hash and completes the journal without a duplicate write. Replaying an already-applied matching review is also side-effect free. The React console has matching controls to load the queue, approve/reject a pending item, and apply an approved item. This is local operator review, not a remote skill reputation service.

Deployment target configuration and driver execution are owned by
`GatewayDeploymentControl`. Target create/update writes persist a
`deployment.target.write` decision, while exact-confirmed deploy, rollback, or
destroy actions write a bound `deployment.execute` decision to the audit trail
and deployment-run metadata before a driver is invoked; the decision binds
hashes of the resolved target and validated preflight plan. The console receives
only sanitized target, plan, and execution DTOs, not decision records or
target configuration metadata.

`GatewayMarketplaceControl` owns pinned remote-catalog synchronization and the
verified template install path. Catalog sync persists hash-only
`marketplace.catalog.sync` authority before replacing the in-memory remote
registry. Installation resolves the selected local or signed-remote template and runtime profile before writing,
persists a hash-only `marketplace.install` decision before copying template
files, then provisions the client/workspace/agent through `GatewayTopologyControl`
with the same trusted actor. The audit trail includes only template/content and
workspace-root hashes plus opaque provisioned IDs; a failed install is recorded
without claiming that partial filesystem/topology work was automatically rolled
back.

Optional remote template sources are configured host-side with a catalog URL, publisher ID, key ID, and Ed25519 public key. Admins can call `POST /marketplace/remotes/sync`; verified templates then appear in `GET /marketplace/templates` with signed publisher provenance and can use the existing admin-only install route. Catalog/file content and source URLs are not returned to the browser. This is pinned template distribution, not a remote skill reputation or paid marketplace service.

Gateway RunLog routes are local development surfaces. They do not create a hosted worker
pool, do not change host execution limits, and do not create a multi-tenant control plane.

Browser-facing gateway data must omit secrets, host paths, database paths, provider key environment markers, and backend internals. Gateway JSON/SSE sanitization redacts common browser-unsafe field markers, provider key environment markers, and host absolute paths embedded in free text before writing browser responses.
The same sanitizer applies to HTTP error bodies, including errors triggered by an
invalid identifier, rather than treating failures as an exception to the
browser boundary.

Hosted browser-access URLs are short-lived local bearer URLs for artifact preview/download and SSE reads. They are minted only after normal gateway auth, and ticketed reads reject extra auth-like query parameters such as session-token or OAuth token fields. For a scoped SSE request, the gateway resolves the supplied RunLog run directly from its canonical store before falling back to a compatibility run, then binds the ticket to that exact session/run pair.

Hosted-auth bootstrap and login are still local operator flows, but browser-origin requests now use an explicit localhost/loopback allowlist instead of wildcard CORS. Requests without an `Origin` header remain available for CLI and server-side local tooling; browser requests from non-local origins are rejected before route handling.

Hosted login failures are rate-limited in the running gateway process, and approval plus provenance-review decisions record the authenticated hosted-session identity instead of caller-provided approval/reviewer text. Hosted sessions carry one of three persisted roles: viewers can read gateway state, operators can also start/cancel runs and perform approval, cron-grant, and provenance-review operations, and admins can use every route. Unclassified mutations fail closed to admin.

Admins can manage hosted users through `GET /auth/users`, `POST /auth/users`, and `PATCH /auth/users/:userId`. Responses omit password verifier material. The final active admin cannot be disabled or demoted, and password changes or account disabling revoke that user's active sessions. This is local gateway authorization, not tenant isolation, enterprise SSO, or a cloud identity control plane.

`pnpm gateway:dev` remains loopback-only by default. An explicit `0.0.0.0` bind now requires hosted auth with bootstrap credentials and a configured RunLog approval-receipt key; it is still intended only for an externally constrained runtime such as a hardened container boundary.

## What It Does Not Do

- It does not provide hosted SaaS tenancy.
- It does not provide enterprise SSO.
- It does not provide secure desktop identity.
- It does not accept arbitrary browser origins for hosted-auth bootstrap/login.
- It does not make the local-dev RunLog approval receipt key suitable for non-local deployments.
- It does not execute tools or providers outside the runtime.
- It does not prove remote skill publisher reputation, key revocation, or third-party quality.
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
