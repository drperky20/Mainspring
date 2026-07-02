![Mainspring logo](assets/brand/mainspring-logo.svg)

# Mainspring

Mainspring is a local-first TypeScript RunLog Fabric runtime for controlled personal-agent work. It turns model output into durable, policy-bound runs with append-only events, checkpoints, approvals, traces, usage records, and tool execution.

```text
SDK / HTTP / channel adapter
-> RunLog intake
-> SQLite WAL RunLog
-> RunLogScheduler
-> RunLogExecutor
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools / workspace / artifacts
-> RunLog events + checkpoints
-> SDK / gateway / console projection
```

The model reasons. Mainspring owns the parts with consequences.

The older per-session SQLite legacy mailbox and `RuntimeKernel` path still exists as compatibility and migration surface for current SDK/gateway behavior. New runtime work should target RunLog Fabric first.

## What Ships Today

- Embeddable SDK for local sessions, runs, approvals, events, artifacts, and usage.
- Canonical RunLog Fabric core with SQLite WAL events, scheduler leases, checkpoints, provider routing, tool-call handling, policy checks, and host projections.
- Legacy per-session SQLite mailbox and `RuntimeKernel` compatibility path while SDK/gateway migration continues.
- Built-in file, shell, terminal, browser-adapter, web, memory, skill, and diagnostics tools.
- Local gateway development host with app-state SQLite for clients, workspaces, agents, provider profiles, budgets, usage, cron, marketplace templates, deployments, and audit rows.
- Vite console with prototype local state plus explicit `local-gateway-dev` transport for live local gateway workflows.
- Experimental Electron shell for the console, with verified Windows packaging.
- Runnable example agents and a trusted local template catalog.
- Docker runtime image and local release verification scripts.

Mainspring is still local-first infrastructure. It is not a hosted SaaS control plane, not a secure VM pool, and not a payment marketplace.

## Quick Start

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm verify
```

Run an example that does not need a paid provider key:

```bash
pnpm example:coding-agent
```

Run the local gateway and console:

```bash
pnpm gateway:dev
pnpm console:dev
```

Open the console with:

```text
http://127.0.0.1:5173/?mainspringConsoleSource=local-gateway-dev
```

## Minimal SDK Example

```ts
import { EchoProvider, createMainspring } from 'mainspring'

const mainspring = createMainspring({
  sessionsRoot: '.mainspring/sessions',
  workspaceRoot: '.mainspring/workspace',
  provider: new EchoProvider(),
  pollIntervalMs: 25,
})

await mainspring.start()

const session = mainspring.sessions.create()
const run = session.runs.start({
  input: 'Summarize the workspace notes and propose next actions.',
  allowedTools: ['file.read'],
  mode: 'chat',
})

for await (const event of run.events()) {
  console.log(event.type, event.payload)
}

await mainspring.stop()
```

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/core` | RunLog Fabric kernel, scheduler, executor, provider routing, events, checkpoints. |
| `src/adapters` | SQLite WAL RunLog storage and local content-addressed blob storage. |
| `src/capabilities` | Optional RunLog capabilities such as workspace leases and cron rows. |
| `src/hosts` | RunLog projections for SDK, gateway, console, and future hosts. |
| `src/compat` | Temporary compatibility exports for migration. |
| `src/runner` | Legacy runtime kernel, supervisor, provider config, runtime entrypoint. |
| `src/mailbox` | Legacy per-session SQLite mailbox, event journal, attachments. |
| `src/providers` | Provider abstraction and OpenAI/OpenRouter-compatible clients. |
| `src/tools` | Tool registry and built-in tools. |
| `src/policy` | Policy guard and approval receipts. |
| `src/sdk` | Local embedding API for sessions, runs, approvals, and monitoring. |
| `src/gateway` | Local gateway, app-state store, auth, cron, budgets, marketplace, deployments. |
| `apps/console` | Operator console. |
| `apps/desktop` | Experimental Electron shell. |
| `examples` | Runnable local agents and template catalog seeds. |
| `docker` | Non-root runtime container and local compose file. |
| `docs` | Architecture, feature, operations, and security documentation. |

## Documentation

Start with [docs/index.md](docs/index.md).

Common paths:

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Runtime Loop](docs/runtime-loop.md)
- [SDK](docs/sdk.md)
- [Local Gateway](docs/features/local-gateway.md)
- [Console And Desktop](docs/features/console-and-desktop.md)
- [Tools And Execution Backends](docs/features/tools-and-execution.md)
- [Secrets And Providers](docs/features/secrets-and-providers.md)
- [Budgets And Usage](docs/features/budgets-and-usage.md)
- [Cron, Marketplace, And Deployments](docs/features/automation-marketplace-deployment.md)
- [Operations And Verification](docs/operations.md)
- [Security](docs/security.md)
- [Current State Audit](docs/current-state.md)

## Verification

The normal confidence gate is:

```bash
pnpm verify
```

The full local release gate is:

```bash
pnpm release:check
```

Focused checks:

```bash
pnpm gateway:systems:check
pnpm examples:smoke
pnpm package:check
pnpm desktop:systems:check
pnpm security:sensitive-patterns
```

## Security Truth

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- Renderer `localStorage` provider auth is prototype-only.
- Provider keys must not be stored in browser localStorage.
- Managed provider secrets are write-only from the browser and resolved host-side.
- WSL and Docker execution backends are explicit backend routes, not a complete VM isolation product.
- The local gateway hosted-auth mode is a local/operator slice, not enterprise SSO or a hosted control plane.

Read [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md) before expanding privileged surfaces.

## Current Limits

- No cross-platform secure desktop keychain.
- No multi-user hosted control plane.
- No full HyperCell VM pool.
- No live provider billing or payment-backed marketplace.
- Linux users run from source; Linux desktop installer packaging is not currently a supported release lane.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The highest-value contributions preserve the runtime spine, improve verification, tighten docs, and avoid fake product surfaces.

## License

MIT. See [LICENSE](LICENSE).
