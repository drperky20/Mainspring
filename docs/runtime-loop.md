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
-> run.completed / run.failed / run.awaiting_approval
```

## Implemented Pieces

- `src/core/RunLogKernel.ts` starts and drains runs.
- `src/core/RunLogExecutor.ts` records provider events, routes tool calls, appends checkpoints, and pauses on approval.
- `src/core/RunLogScheduler.ts` claims queued runs with DB leases.
- `src/adapters/sqlite/SqliteRunLogStore.ts` persists agents, runs, events, checkpoints, leases, and cron rows.
- `src/hosts/runlog/RunLogProjection.ts` projects run events into a host-friendly read model.

## Event Boundaries

RunLog events are append-only. Important event families:

- `run.created`, `input.received`, `run.queued`, `run.claimed`
- `provider.init`, `assistant.delta`, `assistant.result`, `usage.reported`
- `tool.call.requested`, `tool.call.completed`, `tool.call.blocked`, `tool.call.failed`
- `approval.requested`, `run.awaiting_approval`
- `workspace.lease.created`, `workspace.lease.released`
- `checkpoint.saved`
- `cron.due`
- `run.completed`, `run.failed`, `run.cancelled`

## Approvals

Approvals are durable runtime state, not UI booleans. A tool that requires approval causes the run to enter `awaiting_approval`; future work should resume from the checkpoint with an approval receipt rather than replaying side effects.

## Recovery

SQLite stores queued/running state and checkpoints. If an object/process restarts before a run is claimed, the next `RunLogKernel` instance can claim and execute it. Expired running leases are claimable by later workers.

## Legacy Projection

The old mailbox runtime still projects native mailbox events into SDK/gateway events. During migration, compatibility hosts should project RunLog events to those same public DTOs rather than adding another event family.
