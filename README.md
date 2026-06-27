![Mainspring logo](assets/brand/mainspring-logo.svg)

# Mainspring

**Mainspring is the open-source operating system for agent businesses.**

Mainspring turns raw LLM output into controlled, replayable, policy-bound, inspectable, sellable agent work. It gives builders a runtime plane for consequences and a control plane for sessions, approvals, traces, usage, and operator context.

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

The model owns language reasoning. Mainspring owns everything with consequences.

## What Mainspring Does

- Runs agents through a durable SQLite mailbox and event journal
- Keeps tool execution outside the model in a typed tool registry
- Gates risky actions through policy checks and approval receipts
- Preserves run traces, usage, warnings, and tool output for replay and inspection
- Ships an embeddable TypeScript SDK plus a local prototype founder cockpit
- Stays local-first and explicit about what is implemented versus what is still roadmap

## Who It Is For

- Founders building an agent business for real clients
- Agencies managing multiple customer workspaces and policies
- Developers who want self-hosted agent infrastructure instead of opaque chats
- Operators who need traces, approvals, receipts, and workspace boundaries from day one

## Current Package

This repository currently ships:

| Path | Responsibility |
| --- | --- |
| `src/runner` | `RuntimeKernel`, session supervisor, runtime entrypoint, provider routing |
| `src/mailbox` | per-session SQLite mailbox and `events_out` journal |
| `src/providers` | provider abstraction, OpenRouter/OpenAI-compatible clients, mocks |
| `src/tools` | file, shell, browser-adapter, web, memory, skill, diagnostics tools |
| `src/policy` | policy guard, approval requests, approval receipts |
| `src/sdk` | embeddable SDK for sessions, runs, approvals, monitoring, and usage |
| `src/gateway` | local snapshot and read-model helpers for future host wiring |
| `apps/console` | prototype founder cockpit UI with explicit localStorage honesty |
| `examples/` | agent-business templates for local-first use cases |
| `docker/` | non-root runtime image and local compose packaging |

## Quick Start

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
cp .env.example .env
pnpm verify
```

`pnpm verify` is the main confidence button:

```text
doctor -> typecheck -> tests -> build -> security guard -> console typecheck -> console build
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

More examples live in [examples/](examples/) and [docs/examples.md](docs/examples.md).

## Provider Setup

Mainspring currently supports direct OpenAI-compatible and OpenRouter-style providers through the runtime provider layer.

### OpenRouter

```bash
OPENROUTER_API_KEY=your_key_here
MAINSPRING_PROVIDER_ID=openrouter
MAINSPRING_MODEL_ID=openrouter/free
pnpm verify
```

### OpenAI-Compatible

```bash
OPENAI_API_KEY=your_key_here
MAINSPRING_PROVIDER_ID=openai
MAINSPRING_MODEL_ID=gpt-4.1-mini
pnpm verify
```

Provider keys belong in environment variables or secret references. Do not store them in the browser console.

## Console Status

Run the prototype cockpit locally:

```bash
pnpm console:dev
```

What the console is today:

- local-first prototype UI
- draft clients, agents, provider labels, and skill toggles
- sample trace flow
- development gateway fixture preview for read-only dashboard and trace-style screens

What it is not yet:

- live gateway transport
- runtime-backed approvals
- secure provider credential manager
- billing surface
- Electron desktop app

## Security Model

Mainspring is careful about boundaries, but it is not magic.

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- Browser tools are adapter-trusted.
- File tools enforce workspace containment checks.
- Approval receipts exist for policy-gated actions.
- Docker packaging runs non-root, but Docker is not a complete isolation story by itself.
- Renderer `localStorage` provider auth is prototype-only and must not hold real provider keys.

Read the full security truth in [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).

## Current Limits

- No HyperCells, VM isolation, or secure desktop secret store
- No live hosted control plane
- No billing ledger
- No production-ready browser isolation
- No Electron packaging in this checkout
- Console is still prototype/localStorage by default

That honesty is deliberate. The repo is meant to be useful now without pretending roadmap work already exists.

## Docs

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Current State](docs/current-state.md)
- [Runtime Loop](docs/runtime-loop.md)
- [SDK](docs/sdk.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Brand](docs/brand.md)
- [Positioning](docs/positioning.md)
- [Marketing](docs/marketing.md)
- [Roadmap](docs/roadmap.md)
- [Open Source Notes](docs/open-source.md)
- [Hermes Port Goal](docs/hermes-agent-port-goal.md)

## Roadmap

Near-term pressure:

- keep preserving the mailbox and event-journal runtime spine
- wire more console surfaces to truthful gateway-backed read models
- tighten provider/session/trace projections without widening fake product claims
- continue Hermes-inspired harness replacement in tested TypeScript slices

Longer-term direction:

- local gateway host
- stronger trace and artifact surfaces
- richer client/workspace/agent objects
- future isolation contracts before claiming secure execution

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Good contributions for this phase:

- runtime correctness
- event-journal and replay ergonomics
- documentation clarity
- provider integrations
- policy and approval surfaces
- console polish that preserves prototype honesty

## License

MIT. See [LICENSE](LICENSE).
