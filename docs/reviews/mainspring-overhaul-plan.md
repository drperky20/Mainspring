# Mainspring Overhaul Plan

Last updated: 2026-07-10. This is an implementation plan, not a claim that its
items are complete. Status is updated only after code and verification land.

## Guardrails

- Keep one canonical RunLog runtime. Mailbox/RuntimeKernel changes are
  compatibility-only.
- Keep providers behind `AgentProvider`/`ProviderRouter`, side effects behind
  `ToolRegistry`, and hard blocks below approvals.
- Preserve lease fencing, idempotency, cancellation, restart recovery, receipt
  scope, public DTO compatibility, and browser redaction.
- Prefer small, reversible, tested migrations over facade rewrites.

## Phased work

| Priority | Slice | Status | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Establish baseline, architecture review, performance report, and contributor guide. | Complete | Baseline `pnpm verify`; review artifacts; root `AGENTS.md`. |
| P1 | Conditional `/snapshot` transport with deterministic ETag and browser-safe client handling. | Complete | Server-only revision-cache/health tests, browser-safe client tests, 20-sample cached/304 benchmark. |
| P1 | Extract visibility-aware, abortable, non-overlapping gateway refresh lifecycle from the connected console. | Complete | `useGatewaySnapshot`, delay/backoff tests, console type/build, and Playwright workflow. |
| P1 | Add bounded, configurable RunLog worker concurrency without weakening claims, heartbeats, cancellation, or retry behavior. | Complete | Worker saturation and workspace/cancellation tests plus deterministic 3.65x independent-run benchmark. |
| P1 | Split the connected console shell along stable feature/view-model boundaries. | Complete | `ConsoleNavigation`, `useConsoleRunActivity`, provider catalog/form, first-run setup, and client editing are extracted; console type/build and Playwright workflow pass. |
| P1 | Introduce bounded/paginated advanced gateway read models after console callers are incremental. | Complete | `GET /runlog/runs`, `GET /compatibility/runs`, `GET /approval-history`, and public-only `GET /runlog/runs/:runId/trace` use bounded cursors; Activity callers load only their visible surface, and compatibility pages keep a 64-session, per-session-invalidated cache without consulting the broad snapshot revision. |
| P2 | Consolidate `LocalGateway`/`AppStateStore` behind bounded internal services/repositories. | In progress | `CompatibilityRunPageReader` owns metadata pagination, session cache, and mailbox freshness; `ApprovalHistoryPage` owns canonical/compatibility approval merging; `RunLogActivityPage` owns canonical activity/trace reads and public-event projection behind thin HTTP routes. Remaining gateway/app-state domains still need their own tested seams. |
| P2 | Simplify first-level console navigation and split style tokens/base/shell/primitives/features. | In progress | Primary navigation is already constrained; `ConsoleSettings` owns settings UI and feature CSS, while `ConsoleWorkflowPrimitives` owns shared workflow controls and accessible modal focus behavior. Phone-width client tabs now remain reachable in a two-column grid. Broader automated keyboard/narrow-viewport coverage and remaining CSS feature-boundary splits remain. |
| P2 | Improve explicit redirect/session/trace UX where RunLog semantics exist. | Planned | Durable event/recovery/cancellation tests. |
| External | Hosted billing, reputation/revocation, VM isolation, production cluster operations, signed update service. | Deferred | Not implemented; requires infrastructure, credentials, and product ownership outside this checkout. |

## Current implementation sequence

1. Preserve the compatible snapshot DTO while using ETags and a server-only
   sanitized projection cache.
2. Keep refresh state in a visibility-aware hook with bounded backoff and stale
   request cancellation.
3. Keep one default worker claim while allowing explicit bounded concurrency;
   serialize same-workspace work in the local executor.
4. Measure fresh, cached, and conditional transport behavior plus queue drain
   time using deterministic local fixtures.
5. Load canonical RunLog and compatibility activity through bounded cursor
   endpoints, merge their operator rows, page detailed approvals/traces, and
   keep compatibility cache invalidation scoped to each represented mailbox.
6. Keep the compatibility aggregate stable for public callers while the
   console uses extracted provider/setup/client feature boundaries and runs all
   focused and release gates.

## Migration notes

- `/snapshot` remains a compatible JSON document. Conditional callers receive a
  standard `304 Not Modified` with no body and continue holding their last safe
  in-memory projection; the server cache stores only the sanitized DTO.
- Existing console callers may continue using `LocalGatewayClient.snapshot()`;
  the extracted refresh hook uses the additive conditional method.
- RunLog worker concurrency remains configurable and defaults to one active
  claim until a host opts into a safe bounded value. Same-workspace locking is
  process-local, not a claim of distributed coordination.
- No schema rewrite is required for the first transport/worker slices.

## Completion bar

Each completed slice must include targeted tests, relevant security/browser
checks, documentation truth, and a fresh `pnpm verify`. The final branch must
pass `pnpm release:check`, except for explicitly reported external-only checks.
