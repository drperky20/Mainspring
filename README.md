![Mainspring logo](assets/brand/mainspring-logo.svg)

# Mainspring

Mainspring is an open-source, local-first TypeScript agent harness for controlled, replayable, policy-bound agent work. It gives an application the runtime pieces that should not live inside a prompt: durable runs, append-only events, tool policy, approvals, checkpoints, usage records, provider routing, workspace access, artifacts, and operator projections.

The model reasons. Mainspring owns the parts with consequences.

## How The Agent Harness Works

```text
SDK / HTTP / channel adapter
-> RunLog intake
-> SQLite WAL RunLog
-> RunLogScheduler lease
-> RunLogExecutor
-> ProviderRouter / AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools / workspace / browser / memory / artifacts
-> RunLog events + checkpoints
-> SDK / gateway / console projection
```

An app starts a run through the SDK, gateway, or a channel adapter. Mainspring records the intent, claims the run through a scheduler lease, asks the configured provider for the next step, executes allowed tools through a registry, pauses for approval when policy requires it, and writes every important boundary back to the RunLog. Hosts then project that event log into SDK state, gateway responses, console views, audits, and recovery checkpoints.

The harness is provider-neutral and side-effect aware. Provider credentials are represented as opaque refs or managed secrets; raw keys should not enter prompts, browser DTOs, event logs, or package artifacts. Built-in tools are useful local tools, not a sandbox. Host shell execution, WSL, Docker, and browser automation remain explicit operator-controlled execution routes with documented limits.

The older legacy mailbox and `RuntimeKernel` path still exists as compatibility and migration surface for current SDK/gateway behavior. New runtime work should target RunLog Fabric first.

## What Ships Today

- Embeddable SDK for local sessions, runs, approvals, events, artifacts, usage, and host projections.
- Canonical RunLog Fabric core with SQLite WAL events, scheduler leases, checkpoints, provider routing, tool-call handling, policy checks, and recovery state.
- Provider registry for Echo, OpenAI-compatible, OpenRouter-compatible, and Codex CLI-backed provider routes.
- Legacy per-session SQLite mailbox and `RuntimeKernel` compatibility path while SDK/gateway migration continues.
- Built-in file, shell, terminal, browser-adapter, web, memory, skill, and diagnostics tools.
- Local gateway development host with RunLog-backed run creation, app-state SQLite for clients, workspaces, agents, provider profiles, budgets, usage, cron, marketplace templates, deployments, and audit rows.
- Vite console for the live local gateway: setup wizard, client/workspace creation, agent editing, connected provider profiles, client-scoped chat testing, and visual automation test runs.
- Experimental Electron shell for the console, with verified Windows packaging.
- Runnable example agents and a trusted local template catalog.
- Docker runtime image and local release verification scripts.

Mainspring is local-first open-source infrastructure with a SaaS-shaped local console. It is not a hosted multi-tenant control plane, not a secure VM pool, not a payment marketplace, and not a replacement for a real process/container/VM security boundary.

## Quick Start

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm verify
```

Run the smallest RunLog-native example. It does not need a paid provider key:

```bash
pnpm example:provider-run
```

Run a RunLog-native approval example:

```bash
pnpm example:tool-approval
```

Run the local gateway and console:

```bash
pnpm gateway:dev
pnpm console:dev
```

`pnpm gateway:dev` stores local RunLog state under `.mainspring/runlog` and falls back to `EchoProvider` when no OpenRouter/OpenAI env credential is configured.

The gateway and console are separate local processes. The console defaults to `http://127.0.0.1:8787` and can be pointed at another loopback gateway from Settings.

Open the console with:

```text
http://127.0.0.1:5173/?mainspringConsoleSource=local-gateway-dev
```

## Provider Credentials

Use environment variables or managed secret storage. Do not commit real provider keys and do not store keys in browser localStorage.

```bash
OPENROUTER_API_KEY=...
MAINSPRING_PROVIDER=openrouter
MAINSPRING_MODEL=openrouter/free
MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY
```

```bash
OPENAI_API_KEY=...
MAINSPRING_PROVIDER=openai
MAINSPRING_MODEL=gpt-4.1-mini
MAINSPRING_CREDENTIAL_REF=env:OPENAI_API_KEY
```

## Minimal SDK Example

```ts
import { EchoProvider, createRunLogMainspring } from 'mainspring'

const mainspring = createRunLogMainspring({
  rootPath: '.mainspring/runlog',
  workspaceRoot: '.mainspring/workspace',
  provider: new EchoProvider(),
  agent: {
    agentId: 'agent_default',
    instructions: 'Answer briefly and use tools only when allowed.',
    capabilities: ['provider'],
  },
})

const run = mainspring.runs.start({
  input: 'Summarize the workspace notes and propose next actions.',
  sessionId: 'local-session',
})

await run.drainUntilIdle()

console.log(run.status())
console.log(run.result())
console.log(run.projection().events.map((event) => event.type))

mainspring.close()
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
| `src/providers` | Provider registry, provider abstractions, and OpenAI/OpenRouter-compatible clients. |
| `src/tools` | Tool registry and built-in tools. |
| `src/policy` | Policy guard and approval receipts. |
| `src/sdk` | Local embedding API for sessions, runs, approvals, and monitoring. |
| `src/gateway` | Local gateway, app-state store, auth, cron, budgets, marketplace, deployments. |
| `apps/console` | Operator console. |
| `apps/desktop` | Experimental Electron shell. |
| `examples` | Runnable local agents and template catalog seeds. |
| `docker` | Non-root runtime, gateway, console, and local compose files. |
| `docs` | Architecture, feature, operations, and security documentation. |

## Documentation

Start with [docs/index.md](docs/index.md).

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Runtime Loop](docs/runtime-loop.md)
- [Agent Harness](docs/features/agent-harness.md)
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
pnpm secrets:check
pnpm security:mainspring
pnpm security:sensitive-patterns
pnpm security:truth
pnpm gateway:systems:check
pnpm examples:check
pnpm package:check
pnpm desktop:systems:check
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
