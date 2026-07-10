# Mainspring Full Codebase Review

Last reviewed: 2026-07-10. This review is evidence-led: implementation and
tests are the source of truth, while product documentation is checked against
them.

## Executive assessment

Mainspring has a strong, coherent durability and policy spine. New work can
already enter through RunLog, be durably claimed from SQLite WAL, execute behind
provider/tool/policy boundaries, and return only sanitized host projections.
The older mailbox runtime remains a deliberately separate compatibility lane.

The largest remaining product risk is not another runtime: it is the breadth of
the gateway and console read paths. The operator console now conditionally
revalidates an in-memory safe snapshot rather than rebuilding it on every
refresh, and Activity uses bounded cursor pages for canonical RunLog rows,
mailbox compatibility history, approval history, and selected public traces.
The first broad compatibility projection still reads every app-state collection.
That is appropriate for a small local installation and materially cheaper on
normal refreshes, but usage, artifacts, audit, memory, and other aggregate
collections remain candidates for later dedicated read models.

## Verified inventory

### Runtime and storage

```text
SDK / HTTP / channel adapter
-> RunLog intake
-> SQLite WAL RunLog + execution outbox
-> RunLogWorker lease claim / heartbeat
-> RunLogExecutor
-> ProviderRouter / AgentProvider.query
-> ToolRegistry / RuntimePolicyGuard / approval receipts
-> events, checkpoints, projections, SDK and gateway DTOs
```

- `src/core` owns the canonical RunLog kernel, worker, scheduler, executor,
  approval receipts, and run contracts.
- `src/adapters/sqlite/SqliteRunLogStore.ts` owns RunLog SQLite persistence,
  migrations, execution outbox, projections, and indexes.
- `src/context`, `src/memory`, `src/skills`, `src/tools`, `src/policy`, and
  `src/providers` provide bounded collaborators rather than alternate run loops.
- `src/hosts/runlog` and `src/sdk/RunLogMainspring.ts` project canonical events
  to embedded callers.

Compatibility flow, intentionally not a second product architecture:

```text
createMainspring -> SQLite mailbox -> SessionRuntimeSupervisor
-> RuntimeKernel -> AgentProvider.query -> ToolRegistry
-> mailbox rows -> compatibility SDK/gateway projection
```

`docs/migration-runlog.md` maps the dependency edges and correctly prohibits
new product behavior from landing there without a compatibility reason.

### Gateway and host boundaries

- `LocalGateway` is the public facade for clients, workspaces, agents,
  provider profiles, secrets, runs, approvals, cron, usage/budgets, artifacts,
  provenance, marketplace, cells, deployment, and console snapshots.
- `AppStateStore` persists host/app metadata independently of RunLog execution.
  It must stay a read-model/metadata store rather than a second run truth.
- `createLocalGatewayServer` authenticates/authorizes, validates input, calls
  a gateway operation, and returns sanitized DTOs. Hosted auth has persisted
  admin/operator/viewer roles and fails unknown mutations closed to admin.
- `ConsoleSnapshotAdapter` is the browser DTO boundary; it removes secrets,
  private receipt material, host paths, and backend internals.

### Console, desktop, and public package surfaces

- The Vite console entry point is `apps/console/src/main.tsx`; `App.tsx` is a
  small public component/test facade around `ConnectedConsoleApp`.
- The connected application renders live gateway DTOs, with a browser-side
  response tripwire for secret/path markers. The older presentation components
  remain testable exports, not the runtime data source.
- The Electron shell is intentionally a narrow wrapper with lifecycle and
  diagnostics foundations; a secure vault is not implemented, nor are an
  embedded worker, browser pool, or updater.
- `package.json` exports canonical SDK/core/context/adapter/gateway/protocol
  subpaths and retains `mainspring/compat` as a tested migration surface.

## Evidence-backed code-health findings

| Finding | Evidence | Impact | Decision |
| --- | --- | --- | --- |
| Broad gateway facade | `src/gateway/LocalGateway.ts` remains a large stable public facade. | Ownership is difficult to discover; snapshot/projection work is mixed with domain operations. | Keep the stable facade; `CompatibilityRunPageReader` now owns the bounded compatibility page/cache path, and further internal collaborators remain a P2 refactor. |
| Broad app-state store | `src/gateway/AppStateStore.ts` is 3,273 lines. | Repository methods, SQL mappings, schema, and migrations are co-located. | Preserve the interface; split only behind tested repository seams. |
| Broad connected console | `apps/console/src/ConnectedConsoleApp.tsx` is now 1,860 lines. | Connection lifecycle, selection, commands, dialogs, and remaining workspace panels still share one file. | Navigation, provider catalog/form, first-run setup, and client editing are now extracted; split remaining client/workspace panels only behind stable props. |
| Broad snapshot compatibility DTO | `/snapshot` still includes every app-state collection. | Fresh projection cost and unbounded growth pressure remain. | ETag transport, server-only sanitized cache, adaptive refresh, and cursor pages for canonical/compatibility runs, approvals, and traces are complete; usage, artifacts, audit, and memory need future dedicated read models before the aggregate narrows. |
| Large style surface | `styles.css` is 3,359 lines and `controlRoom.css` is 1,428 lines. | Visual tokens and feature rules are hard to locate. | Split only after the connected UI has stable feature boundaries. |
| Serial worker dispatch | Default `RunLogWorker` behavior is one active claim. | Safe baseline but unnecessary queue latency for independent work. | Complete: hosts can opt into bounded concurrency; same-workspace work remains serialized in the local executor. |
| Bounded history is uneven | Activity, approvals, and public traces are paginated; the primary snapshot still aggregates numerous unrelated collections. | Long-lived local state can increase snapshot cost. | Preserve compatibility now; add endpoint/read-model pagination for usage, artifacts, audit, and memory as concrete callers migrate. |

No dead runtime architecture was found. The compatibility mailbox modules are
still reachable through exported APIs, examples, tests, and gateway fallback,
so deleting them would be an unsafe breaking change.

## Security boundary review

| Privileged path | Authority and durable evidence | Browser/secret posture | Remaining limit |
| --- | --- | --- | --- |
| Shell, terminal, file, browser, web | ToolRegistry plus RuntimePolicyGuard; DecisionRecord before protected work; scoped approvals. | Tool outputs and gateway responses are redacted and bounded. | Host execution and browser automation are not sandboxes. |
| Provider credentials | Opaque credential references with host-side resolution. | Keys never belong in prompts, events, URLs, or renderer storage. | No hosted KMS or desktop vault. |
| Memory and skills | Policy, provenance scan, staged review, durable review record. | Sanitized review DTOs; no automatic activation. | Taint is advisory; no hosted reputation/revocation service. |
| Remote templates | Pinned Ed25519 catalog, bounded HTTPS fetch, expiry/hash checks, scan, atomic install. | Catalog content/URLs stay host-side. | Integrity is not publisher reputation or key revocation. |
| Cron | Scoped, expiring grants and RunLog decisions before side-effecting dispatch. | Grant projections omit private hashes. | Compatibility gateway cron remains mailbox-backed without a RunLog host. |
| Child runs | RunLog child creation narrows inherited parent context and records a decision. | Credential references stay opaque. | No remote cross-host identity/dispatch fabric. |
| Gateway administration | Hosted auth/session attribution and role authorization before mutations. | User/password verifier material is omitted from DTOs. | Local roles are not tenancy, SSO, or enterprise identity. |
| Deployment/cells | Explicit deployment driver and backend capability truth. | Browser DTOs expose only safe status. | Docker/WSL are not VM isolation; generated Kubernetes controls are not production certification. |

The full regression corpus is mapped in
`docs/security-redteam-matrix.md`. New privileged surfaces should add a matrix
row and executable regression or an explicit limitation.

## Operator experience review

| Journey | Current state | Friction observed | Target direction |
| --- | --- | --- | --- |
| First launch/provider setup | Guided local setup and provider profile controls exist. | The flow was previously coupled to the connected shell. | `ConsoleSetup` and `ConsoleProviderCatalog` now own their UI-local state; keep one clear setup path. |
| Select client/workspace/agent | Live gateway selections are scoped by client/workspace. | Remaining chat/agent/automation panels are still in the shell. | `ConsoleClientForms` owns client editing; retain Home, Workspaces, Activity, and Settings as the first navigation layer. |
| Start, watch, and stop work | Durable RunLog starts, cancellation, SSE run events, and merged cursor-paginated canonical/compatibility Activity rows exist. | The broad snapshot remains a compatibility source for unrelated summary data. | Retain explicit run/event actions and migrate the next aggregate collections only with concrete UI callers. |
| Approval | Prominent approvals and RunLog receipt flow are present. | Detailed policy data can compete with the normal task workflow. | Approval history is cursor-paginated and RunLog-preferred; keep action cards visible and raw traces behind inspection. |
| Inspect outcomes | Runs, artifacts, tool rows, checkpoints, usage, and trace panels exist. | Usage/artifact/audit/memory histories still arrive through the aggregate. | Public RunLog trace pages are bounded; progressively disclose the remaining read models. |
| Offline/stale behavior | Loading, offline, stale, and unauthorized states exist. | Full snapshots are still expensive when state changes. | Complete visibility-aware, abortable, non-overlapping revalidation with bounded backoff. |

Accessibility posture is solid in individual component conventions but needs
explicit regression coverage for keyboard navigation, dialogs, narrow viewports,
and status announcements after the shell is decomposed.

## External comparison matrix

| External behavior | Mainspring equivalent | Gap/security impact | Decision |
| --- | --- | --- | --- |
| Hermes guided setup and doctor | Gateway dev, console setup, `pnpm doctor`. | Mainspring has no single end-user command surface yet. | Adapt through operator workflows, not a hidden installer. |
| Hermes interrupt/redirect and streaming tool progress | Durable cancellation, run events, RunLog projection. | Redirect semantics and general streaming transport remain narrower. | Adapt only through durable RunLog events. |
| Hermes persistent memory/skills/cron | Provenance-scanned memory/skills and scoped cron grants. | Hermes-style self-activation would violate Mainspring trust boundaries. | Adapt governance, reject autonomous activation. |
| Hermes/OpenClaw multi-channel continuity | Compatibility ChannelBridge and session model. | Channel identity and sender auth are not yet RunLog-native. | Defer channel promotion until identity/idempotency are durable. |
| Hermes isolated delegate model | Child RunLog runs with narrowed parent authority. | No remote execution identity fabric. | Keep local child runs; defer remote dispatch. |
| OpenClaw focused personal-assistant framing | Local-first gateway and console. | Mainspring currently foregrounds operator/runtime vocabulary. | Adapt calmer information architecture, retain explicit safety state. |

Reference review used the current official OpenClaw and Hermes repositories as
product references only; no external code is copied. The repository's existing
`docs/research/agent-runtime-synthesis.md` records the detailed rationale.

## Accepted limitations and non-goals

- Hosted billing, paid marketplace/reputation, VM pools, and hosted browser controls are not implemented.
- Signed installers, updater infrastructure, tenancy, and production operations require external product/infrastructure ownership.
- Compatibility mailbox retirement requires explicit public SDK/gateway
  migration coverage; it is not a cleanup-only deletion.
- Usage, artifacts, audit, and memory pagination should be introduced per read
  model after callers move off the unconditional aggregate snapshot.

## Review conclusion

The repository does not need a rewrite. This branch preserves the RunLog spine,
adds safe bounded concurrency, makes normal console refreshes conditional and
cheap, gives canonical and compatibility Activity rows, approval history, and
public traces bounded cursor paths, and splits provider/setup/client editing out
of the connected shell. The next local read-model work is usage, artifacts,
audit, and memory—not a second runtime or a weakening of policy, lease, or
browser-safety boundaries.
