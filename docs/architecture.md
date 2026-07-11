# Architecture

Mainspring is moving to a TypeScript-native RunLog Fabric: a small durable kernel for agent execution, with infrastructure adapters around it instead of infrastructure assumptions inside it.

## Canonical Flow

```text
SDK / HTTP / channel adapter
-> RunLog intake
-> SQLite WAL RunLog
-> DB lease scheduler
-> RunLogExecutor
-> ProviderRouter
-> ToolRegistry / RuntimePolicyGuard / approvals
-> lazy workspace, browser, memory, artifact adapters
-> RunLog events and checkpoints
-> SDK / gateway / console projections
```

The legacy mailbox spine still exists for compatibility:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

New work should target the RunLog path first. Compatibility code may project RunLog events back to existing SDK/gateway shapes while the older mailbox runtime is retired in slices.

## Canonical Source Layout

| Area | Path | Role |
| --- | --- | --- |
| Core | `src/core` | `AgentSpec`, `RunIntent`, append-only events, checkpoints, scheduler, executor, provider routing. |
| SQLite adapter | `src/adapters/sqlite` | Default WAL-backed RunLog, run leases, checkpoints, agents, and cron rows. |
| Blob adapter | `src/adapters/local-blob` | Local content-addressed artifact/blob storage. |
| Capabilities | `src/capabilities` | Optional runtime capabilities such as workspace and cron. |
| Hosts | `src/hosts` | Read-model projections for SDK, gateway, console, and future channel hosts. |
| Compat | `src/compat` | Temporary exports that help old runtime/gateway code migrate to the RunLog model. |
| Legacy runtime | `src/mailbox`, `src/runner`, `src/runtime` | Existing mailbox/kernel path kept working during migration. |

## Storage Model

The default local deployment needs only:

- one Node process
- one SQLite database using WAL
- local content-addressed blob storage
- local workspace directories materialized only when needed

Agents are data, not resident processes. Idle agents are rows plus blob/workspace references. A run is executable only while a scheduler lease is active.

Scale adapters can replace pieces independently:

- SQLite -> Postgres for multi-host leases
- local blobs -> S3/R2/MinIO
- DB lease queue -> Redis/BullMQ only when measured bottlenecks justify it
- local process/workspace -> Docker, VPS, or the guarded Kubernetes gateway deployment driver; managed workers remain future infrastructure

## Runtime Rules

- Providers propose text and tool calls; Mainspring owns side effects.
- Tools execute only through `ToolRegistry`.
- Risky tools go through `RuntimePolicyGuard` and approval receipts.
- Checkpoints are written after provider/tool/approval boundaries.
- Workspaces are leased lazily. Text-only runs do not hydrate files.
- Browser automation is lazy. No browser process should run just because an agent exists.
- Cron is stored as due rows in the RunLog SQLite adapter and creates ordinary queued runs.
- Subagents should be child runs with parent IDs, not permanent subprocesses.
- Secrets belong in environment, local secret store, or an external secret adapter, never renderer localStorage.
- Gateway artifacts and usage are runtime projections: ordinary app-state callers
  receive read-only stores, while dedicated projection collaborators own writes.
- Artifact downloads resolve an opaque row beneath the configured artifact root,
  verify its real path, and open the file before the HTTP response is created.

## Security Truth

- Host shell execution is not a sandbox.
- Docker/WSL routing is not VM isolation.
- Browser/localStorage provider auth is prototype-only until replaced.
- Process execution must not be marketed as secure containment.
- Hosted gateway admin/operator/viewer roles are a local HTTP authorization boundary; they are not tenant isolation or enterprise identity.
- Signed remote template catalogs provide pinned publisher integrity, not hosted reputation, payments, or remote skill trust.
- HyperCells, VM pools, billing, hosted marketplace reputation/payments, tenant isolation, and secure desktop secrets should not be claimed unless backed by implementation.
