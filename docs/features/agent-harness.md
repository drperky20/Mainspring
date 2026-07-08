# Agent Harness

## What It Does

Mainspring is an application harness for agent work. It separates model reasoning from side effects by putting runs, events, tools, approvals, provider credentials, artifacts, and operator projections behind typed runtime boundaries.

The canonical path is RunLog-first:

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

The harness records durable intent before work starts, claims queued work through a lease, routes provider calls through a provider registry, executes tools only through `ToolRegistry`, pauses on approval-required operations, and projects the same event spine to SDK callers, the local gateway, the console, and audit views.

Provider credentials are runtime references, not prompt text. Environment refs such as `env:OPENROUTER_API_KEY`, provider-profile refs, and managed secret refs can be resolved host-side without sending raw keys through browser DTOs or logs.

## What It Does Not Do

Mainspring does not make host execution safe by naming it a tool. Host shell execution is not a sandbox. Docker and WSL routes are explicit execution backends, not a complete VM isolation product. Browser automation is not a security boundary, and local hosted auth is not enterprise SSO.

The legacy mailbox/`RuntimeKernel` path is still present for compatibility while the RunLog migration continues. New runtime behavior should target RunLog Fabric first unless it is intentionally maintaining compatibility.

## How To Verify

Run the normal release confidence gate:

```bash
pnpm verify
```

Run the full release gate before publishing:

```bash
pnpm release:check
```

Focused harness checks:

```bash
pnpm agentic:check
pnpm examples:check
pnpm security:mainspring
pnpm security:sensitive-patterns
pnpm secrets:check
```
