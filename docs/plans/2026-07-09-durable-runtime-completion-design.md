# Durable runtime completion design

Date: 2026-07-09

## Objective

Make RunLog the durable execution authority for local Mainspring: a run is created, queued, claimed, advanced, retried, paused, resumed, cancelled, projected, and diagnosed through crash-consistent SQLite facts. The gateway becomes an ingress and read host rather than an inline executor.

## Chosen approach

Keep one SQLite RunLog database as the canonical execution database. Add explicit domain-level transactional store commands rather than exposing an arbitrary transaction callback. A durable execution outbox is written in the same transaction as every execution-relevant lifecycle transition and is consumed by a fenced worker.

This preserves local-first deployment, avoids an external queue dependency, and keeps the existing append-only event log as the public trace boundary. Gateway app state remains a separate database; its derived usage/cost projection is cursor-based and idempotent rather than cross-database transactional.

## Invariants

- A lifecycle status and its corresponding durable event commit together or not at all.
- Every runnable RunLog generation has exactly one durable outbox item identified by an idempotency key.
- A claimed item has a worker ID, opaque claim token, lease epoch, expiry, and heartbeat. Only the current claim may mutate execution state.
- Cancellation invalidates queued or claimed outbox work atomically. A terminal run never exposes actionable pending approvals.
- Retryable provider failures reuse the same outbox item with bounded exponential backoff. Non-retryable failures and exhausted attempts become terminal facts.
- A tool without explicit idempotency or reconciliation support is never replayed automatically after an expired in-flight claim; it becomes an auditable ambiguous operation.
- Projection cursors advance with their read-model writes in one transaction. Normal gateway reads use projection rows and bounded timeline pages, not full event scans.
- Context assembly happens before `provider.query()`. Its final selected material is constrained by the provider/model budget and emits sanitized decision telemetry.
- Host execution is a degraded capability, never described as a security boundary. Agent/workspace/computer authorization is validated before RunLog work is queued.

## Data flow

```text
gateway or SDK
  -> transactional RunLog command
  -> runs + events + outbox
  -> RunLogWorker claim/heartbeat/fenced execution
  -> provider/tool/approval outcomes
  -> events + canonical records + next outbox state
  -> incremental projector
  -> gateway/console diagnostics and bounded read APIs
```

## Storage model

Version RunLog migrations with `PRAGMA user_version`. Extend runs with execution generation, lease epoch, attempt metadata, next-attempt time, typed computer selection, and immutable per-run system prompt.

Add canonical tables for execution outbox records, tool execution state, provider calls, usage records, projection cursors/read models, projection failures, and RunLog-to-gateway usage cursors. Tables own operational state; append-only events remain the audit trace.

## Execution and recovery model

`RunLogWorker` polls a bounded outbox claim query, claims with a token and lease epoch, heartbeats active work, and propagates ownership loss to provider/tool abort signals. It records complete, retryable, failed, or cancelled outcomes through fenced store commands. Restart recovery claims expired work. Provider retry and tool replay behavior is explicit and bounded.

The local gateway starts/stops a worker with its RunLog host and returns queued state from run start and approval resolution. SDK drain helpers stay as deterministic compatibility adapters over the same worker claim path.

## Projection and context model

The projector consumes global event sequence batches into versioned run, approval, tool, checkpoint, trace, and raw-usage read models. Gateway pricing consumes raw token projection through a separate idempotent destination cursor. Timeline and run-list APIs use stable keyset pages.

ContextLens introduces typed candidates and decisions. Required exact material is allocated first; optional material is deterministically selected, summarized, encoded, represented by a rehydration stub, or dropped. The first integrated slice is text-first, with durable recoverable storage and memory/file/tool-result sources. Browser/page/artifact image parts remain conditional on a real provider content-part adapter.

## Delivery order

1. Versioned migrations, transactional lifecycle commands, outbox, worker, claims, retries, and crash tests.
2. Incremental projections, gateway usage cursor, bounded read APIs, and scale tests.
3. Context assembly and durable rehydration integrated into provider dispatch.
4. Typed ingress authorization and an app-wide execution-cell gateway with truthful fallback state.
5. Desktop embedded gateway lifecycle, vault boundary, recovery, diagnostics, and disabled-until-configured update state.
6. RunLog compatibility facade, deprecation coverage, strict test types, temporary-data browser E2E, and release validation.

## External limitations

Trusted installer signing, notarization, and published automatic updates need external certificates and release-feed infrastructure. The implementation may expose verified readiness and disabled status but must not claim those distribution services are active without those inputs.
