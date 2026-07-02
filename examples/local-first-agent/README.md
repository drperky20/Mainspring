# Local-First Agent

Self-host Mainspring on a single machine.

## Shape

- The `mainspring` runtime package runs locally as an embedded SDK process or Docker container.
- An optional host wrapper can add API, console, worker, Postgres, and object storage locally.
- Runtime execution can route through Docker when shell/browser workloads need a non-host backend; Docker is not VM isolation.
- Provider credentials stay in `.env` and are passed as scoped refs.
- Artifacts live in local object storage or filesystem.

## Upgrade Path

Move Postgres and object storage to managed services first. Add worker replicas only after queue depth and concurrency require it.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)

## Runnable Walkthrough

Run the local no-paid-key walkthrough:

```bash
pnpm example:local-first-agent
```

It uses `createRunLogMainspring`, `MockProvider`, the `memory.write` and `memory.read` tools, scoped RunLog approval receipts, and `RunLogProjection`. It writes one approval-backed memory entry under the workspace `.mainspring` store, reads it back through `memory.read`, prints a JSON summary, and then cleans up its local runtime state.
