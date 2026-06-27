# Deployment

Mainspring currently deploys as one runtime package. You can embed it in a product API, run it as a local process, or build the supplied non-root Docker image.

## Local Package

```bash
pnpm install
cp .env.example .env
pnpm verify
pnpm build
pnpm start
```

Runtime inputs are configured with `MAINSPRING_*` environment variables:

```bash
MAINSPRING_SESSIONS_ROOT=.mainspring/sessions
MAINSPRING_WORKSPACE_ROOT=.mainspring/workspace
MAINSPRING_PROVIDER=openrouter
MAINSPRING_MODEL=openrouter/free
MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY
```

## Docker

```bash
docker compose -f docker/compose.local.yml up --build
```

The image:

- Runs as UID/GID `10001`.
- Declares `/runtime`, `/workspaces`, `/sessions`, and `/artifacts` volumes.
- Does not expose a public port.
- Does not mount the Docker socket.
- Starts `node dist/runner/main.js`.

## Hosted Product Wrapper

For a SaaS/control-plane product, wrap this package with:

| Layer | Suggested backing |
| --- | --- |
| Product API | Fastify/Express/Next route handlers that write dispatches and read events. |
| Queue | Postgres leases first, Redis/SQS after scale. |
| Runtime runners | Containers or microVMs running `mainspring-runtime`. |
| Metadata | Postgres for users, orgs, clients, agents, sessions, turns, approvals, usage. |
| Artifacts | Local filesystem for self-host, S3-compatible storage for hosted. |
| Secrets | KMS or managed secret store, passed to runtime only as scoped refs. |
| Observability | Structured logs and event-journal projections with redaction. |

The package boundary stays the same: the control plane owns tenancy and business objects; Mainspring owns provider/tool execution and the evented runtime loop.
