# Mainspring product and runtime hardening design

Date: 2026-07-09

## Context

Mainspring already has two execution paths. The canonical path is the SQLite-backed RunLog Fabric (`RunLogKernel` -> scheduler -> executor -> provider/tool/policy boundaries -> append-only events and checkpoints). The legacy mailbox and `RuntimeKernel` path remains a compatibility surface and currently contains several reliability features that have not yet reached RunLog. The local gateway projects both paths plus app metadata into browser-safe DTOs. The production console, however, renders a narrow client/settings application and bypasses most of its mature operator read models.

The worktree also contains staged security, gateway, tool-execution, console, and CI changes that predate this review. This design preserves those changes and keeps new work unstaged for explicit review.

## Options considered

1. **Rewrite the runtime and console around a new application framework.** This could create cleaner files quickly, but it would discard proven security seams, widen the migration, and make the existing 513-test baseline less useful.
2. **Promote the older tested dashboard components into production unchanged.** This would expose more data, but those components are split from the live gateway application and retain prototype/local-storage assumptions.
3. **Harden and integrate the existing canonical seams.** Keep RunLog, gateway DTOs, and live client workflows; repair RunLog invariants; add focused operator screens over the existing sanitized snapshot; and retire misleading or duplicate behavior gradually.

Option 3 is the selected approach. It gives the product a coherent operator surface. It does not claim that isolation, hosted tenancy, or durable background workers are complete.

## Architecture changes

### RunLog reliability

- Anchor checkpoints to the actual latest event sequence rather than the first event returned by an ascending query.
- Make long-run projection and event counts correct beyond the current 500/1,000-event limits.
- Guarantee a terminal `run.failed` event for provider failures.
- Enforce the existing `maxToolIterations` option.
- Add native RunLog cancellation that aborts an active provider query, persists `run.cancelled`, and prevents a cancelled run from later completing.
- Add durable run enumeration so SDK and gateway hosts can discover runs after restart without depending solely on gateway metadata.

These changes stay inside the current store/kernel/executor abstractions. Lease heartbeat, atomic approval-side-effect recovery, background workers, and full ContextLens assembly remain follow-up work because each needs a larger end-to-end design.

### Console product spine

- Use the existing browser-safe gateway snapshot and dashboard projection as the production read boundary.
- Add top-level Overview, Clients/Workspaces, Runs, Approvals, Usage, and Settings navigation.
- Add a run detail surface with a live event timeline, tool calls, checkpoints, policy decisions, errors, usage, and cancellation where supported.
- Add a working approval queue for both RunLog and compatibility approvals.
- Scope chat and recent run state by client and agent to prevent context/trace bleed when switching clients.
- Represent initial loading, offline/stale, empty, and ready states separately.
- Apply a dark desktop control-room visual system while preserving the current React/Vite stack and brand assets.

The console will not add fake routes or controls. Existing automation controls that do not persist remain clearly framed as a test workflow.

### Developer and release experience

- Make `verify` execute the project doctor rather than pnpm's built-in `doctor` command.
- Replace unsupported `pnpm pack --dry-run` with a cross-platform disposable-directory package check.
- Keep workflow validation aligned with commands that actually execute.
- Add focused documentation for the new operator surfaces and update RunLog-first contribution/runtime guidance.

## Data flow

```text
Run intent
  -> SQLite run row + intake events
  -> leased execution
  -> provider/tool/policy events
  -> checkpoint at latest sequence
  -> terminal status/event
  -> RunLog projection
  -> sanitized gateway snapshot/events endpoint
  -> console overview / run detail / approvals / usage
```

The browser receives sanitized IDs, summaries, and public event payloads only. Raw approval snapshots, credentials, workspace roots, and sensitive event bodies remain server-side.

## Error and state handling

- Runtime cancellation is idempotent for already-cancelled runs and rejected for terminal completed/failed runs.
- Iteration exhaustion is a deterministic failed terminal state with an auditable runtime error.
- Provider failures always produce both the error fact and terminal run fact.
- The console keeps the last good snapshot visible when refresh fails, marks it stale, and distinguishes that state from an empty workspace.
- Mutations surface inline/toast errors and refresh the snapshot only after a successful gateway response.

## Verification

- Focused RunLog tests for checkpoint sequence, long projections, provider terminal failure, cancellation, iteration bounds, and run enumeration.
- Pure console projection/view-model tests plus component/static tests for new surfaces and scoped state helpers.
- Gateway client tests for RunLog approval resolution and event loading.
- Full `pnpm typecheck`, `pnpm test`, `pnpm build`, console build/browser-safety checks, docs checks, package checks, and the repaired release workflow verifier.
- Browser smoke verification of the built console when a local browser backend is available; otherwise static/source and build verification is recorded explicitly.

## Deferred roadmap

1. Background RunLog worker with lease renewal and graceful shutdown.
2. Atomic intake/claim/approval/terminal transactions and crash-safe tool-effect commits.
3. RunLog usage-to-budget projection and tool-output spill/redaction parity.
4. Text-first ContextLens runtime assembly with durable rehydration and memory retrieval.
5. Explicit execution-backend selection for RunLog and contained browser leases.
6. Split gateway/store/server monoliths after behavior has migrated behind tested services.
