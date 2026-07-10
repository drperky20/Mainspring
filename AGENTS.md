# Mainspring contributor guide

Mainspring is a local-first agent runtime and operator workspace. Its canonical
execution path is:

```text
SDK / HTTP / channel adapter -> RunLog -> SQLite WAL/outbox -> RunLogWorker
-> RunLogExecutor -> ProviderRouter -> ToolRegistry / RuntimePolicyGuard
-> events, checkpoints, sanitized projections
```

## Non-negotiable invariants

- New execution behavior is RunLog-first. The mailbox, `RuntimeKernel`, and
  `SessionRuntimeSupervisor` are compatibility surfaces, not a second product.
- Provider calls stay behind `AgentProvider`/`ProviderRouter`; tool side effects
  stay behind `ToolRegistry` and policy/approval records.
- Hard policy blocks cannot be overridden by a model, heuristic, or receipt.
- Preserve lease fencing, idempotency, cancellation, restart recovery, durable
  approvals, and terminal-state conflict protections.
- Browser DTOs must omit secrets, host paths, private approval data, raw
  workspace roots, unsafe artifact paths, and server-only configuration.
- Host shell, Docker, WSL, browser automation, local roles, and the desktop
  shell must retain their documented limitations. Do not market them as secure
  containment, tenancy, or a vault.

## Directory map

- `src/core`: canonical RunLog lifecycle, worker, executor, approvals.
- `src/adapters/sqlite`: RunLog persistence/migrations.
- `src/providers`, `src/tools`, `src/policy`, `src/context`: runtime edges.
- `src/gateway`: local control-plane facade, app-state metadata, browser DTOs,
  HTTP server, deployment/cell/marketplace helpers.
- `apps/console`: React operator workspace; keep gateway response guards.
- `apps/desktop`: Electron lifecycle/diagnostics wrapper.
- `docs`: implementation truth; `docs/reviews` is repository-local evidence.

## Development and verification

```bash
pnpm install --frozen-lockfile
pnpm run doctor
pnpm typecheck
pnpm test
pnpm verify
pnpm release:check
pnpm benchmark:overhaul
```

Use focused checks for changed surfaces: `pnpm gateway:systems:check`,
`pnpm agentic:check`, `pnpm security:mainspring`, `pnpm console:e2e`,
`pnpm deploy:check`, `pnpm package:check`, and `pnpm benchmark:overhaul`.

## Where new work belongs

- Runtime execution: `src/core` plus RunLog adapters/hosts.
- Provider capabilities: provider registry/adapters, never renderer code.
- Side effects: tool manifests and `ToolRegistry` only.
- Browser data: explicit sanitized gateway DTOs plus leak tests.
- Compatibility changes: only to preserve existing public mailbox/SDK behavior.

Update the relevant feature doc, current state, security matrix, and verification
evidence with every behavior change. Do not commit local databases, workspaces,
credentials, runtime artifacts, build output, or package tarballs.
