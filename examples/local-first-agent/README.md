# Local-First Agent

Self-host Mainspring on a single machine.

## Shape

- The `mainspring` runtime package runs locally as an embedded SDK process or Docker container.
- An optional host wrapper can add API, console, worker, Postgres, and object storage locally.
- Runtime sandboxes use Docker when shell/browser workloads need stronger isolation.
- Provider credentials stay in `.env` and are passed as scoped refs.
- Artifacts live in local object storage or filesystem.

## Upgrade Path

Move Postgres and object storage to managed services first. Add worker replicas only after queue depth and concurrency require it.
