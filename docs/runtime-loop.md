# Runtime Loop

The RunLog runtime loop turns a queued `RunIntent` into durable events, tool decisions, checkpoints, and a final run status.

## Flow

```text
RunLogKernel.startRun
-> append run.created / input.received / run.queued
-> RunLogScheduler.claimNext
-> RunLogExecutor
-> ProviderRouter.resolve
-> AgentProvider.query
-> provider events
-> ToolRegistry if tool_call
-> RuntimePolicyGuard / approval pause if required
-> checkpoint.saved
-> run.completed / run.failed / run.cancelled / run.awaiting_approval
```

Due RunLog cron rows enter the same event log before execution:

```text
SqliteRunLogStore.enqueueDueCronRuns
-> cron policy decision
-> append run.created / cron.due / policy.decision.recorded
-> append run.queued when allowed
-> append run.failed when denied or staged for review
```

## Implemented Pieces

- `src/core/RunLogKernel.ts` starts, drains, lists, and durably cancels runs.
- `src/core/RunLogExecutor.ts` records provider events, routes tool calls, enforces tool-iteration limits, appends checkpoints, aborts active provider queries, and pauses on approval.
- `src/core/RunLogScheduler.ts` claims queued runs with DB leases.
- `src/adapters/sqlite/SqliteRunLogStore.ts` persists agents, runs, events, checkpoints, leases, and cron rows.
- `src/capabilities/cron/RunLogCron.ts` creates scoped headless grants and cron enqueue decisions.
- `src/hosts/runlog/RunLogProjection.ts` projects run events into a host-friendly read model.

`RunLogWorker` defaults to one active claim, but hosts may set a bounded
`maxConcurrentRuns` value. The worker fills available slots with independently
fenced claims and keeps lease heartbeats/cancellation/retry handling per run.
Within one process, `RunLogExecutor` queues runs for the same workspace so
concurrent configuration does not turn conflicting local workspace work into
parallel side effects. This is not distributed workspace locking.

## Event Boundaries

RunLog events are append-only. Important event families:

- `run.created`, `input.received`, `run.queued`, `run.claimed`
- `provider.init`, `assistant.delta`, `assistant.result`, `usage.reported`
- `tool.call.requested`, `tool.call.completed`, `tool.call.blocked`, `tool.call.failed`
- `approval.requested`, `run.awaiting_approval`
- `workspace.lease.created`, `workspace.lease.released`
- `checkpoint.saved`
- `cron.due`
- `policy.decision.recorded`
- `run.completed`, `run.failed`, `run.cancelled`

## Approvals

Approvals are durable runtime state, not UI booleans. A tool that requires approval causes the run to enter `awaiting_approval`. Approval decisions use scoped, signed, one-time receipts; an approved run validates the persisted tool, policy, workspace, provider, and manifest snapshot before resuming from the approval checkpoint. Cancelling the run durably closes its pending approval instead of leaving unresolvable operator work.

## Cron And Headless Runs

RunLog cron rows are headless operators. Side-effecting schedules deny by default unless a scoped cron grant binds the agent, prompt hash, schedule hash, allowed tools, expiration, and execution limit. A due cron row records `policy.decision.recorded` before it is queued or failed; denied cron rows do not wait forever for an absent operator.

## Recovery

SQLite stores queued/running state and checkpoints. If an object/process restarts before a run is claimed, the next `RunLogKernel` instance can claim and execute it. Expired running leases are claimable by later workers.

Run status transitions are conditional store operations so completion, failure, and cancellation cannot silently overwrite a competing terminal state. Provider failures append both a diagnostic runtime event and terminal `run.failed`; cancellation appends `run.cancelled`, releases the lease, and aborts an in-process provider query when one exists.

Run projections page through the append-only log instead of truncating state at an arbitrary event count. Hosts may request a bounded tail for display while status, event counts, checkpoints, policy decisions, and other derived state are computed from the complete run history.

## Legacy Projection

The old mailbox runtime still projects native mailbox events into SDK/gateway events. During migration, compatibility hosts should project RunLog events to those same public DTOs rather than adding another event family.
