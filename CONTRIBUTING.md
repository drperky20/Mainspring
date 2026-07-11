# Contributing To Mainspring

Mainspring is built around one rule: agent actions must be inspectable, bounded, and replayable.

## Set Up

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm verify
```

## Development Checks

Use the smallest check that proves your change, then run broader checks before handing off.

```bash
pnpm run doctor
pnpm typecheck
pnpm test
pnpm verify
pnpm gateway:systems:check
pnpm examples:smoke
pnpm release:check
```

For a substantial change, make a coherent implementation batch before repeatedly
testing it. During the batch, use focused boundary tests and compilation only when
needed to protect a critical contract. At the handoff or commit boundary, run one
complete release pass. If it fails, preserve the exact failure as the next
correction instead of hiding it behind repeated full-suite retries.

Console changes also require a real terminal-driven browser pass:

```bash
MAINSPRING_E2E_ARTIFACTS_DIR=output/playwright/manual pnpm console:e2e
```

Watch gateway, Vite, and Playwright logs, inspect desktop and phone layouts, and
retain screenshots or traces when visual, accessibility, or interaction behavior
needs evidence.

Desktop changes:

```bash
pnpm desktop:typecheck
pnpm desktop:build
pnpm desktop:systems:check
```

## Architecture Boundaries

Preserve the runtime spine:

```text
SDK / HTTP / channel adapter
-> RunLog intake
-> SQLite WAL RunLog
-> RunLogScheduler lease
-> RunLogExecutor / ProviderRouter
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools / workspace / memory / artifacts
-> RunLog events + checkpoints
-> SDK / gateway / console projection
```

New runtime work should target the RunLog path. The mailbox, `SessionRuntimeSupervisor`,
and `RuntimeKernel` remain compatibility surfaces for existing `createMainspring`
consumers; keep them working while migration continues, but do not add a second source
of runtime truth. Provider calls, tool execution, policy decisions, approval receipts,
durable events, and sanitized host projections remain the seams to preserve.

## Security Boundaries

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- Provider keys must not be stored in renderer localStorage.
- Browser-facing DTOs must not expose raw secrets, host paths, database paths, backend internals, or deployment private fields.
- Requested isolated-capable backends must fail closed when unavailable.
- Gateway app-state must not become a second runtime truth source.

## Docs Expectations

User-facing docs live in focused pages under `docs/`. `docs/current-state.md` and `docs/goal-digest.md` are audit/history references, not the main how-to path.

When behavior changes, update the relevant feature doc and verification command. See [docs/documentation-guide.md](docs/documentation-guide.md).

## Pull Request Checklist

- Runtime spine preserved.
- New privileged behavior has policy/approval coverage.
- Browser-facing payloads are sanitized.
- Tests cover success and fail-closed behavior.
- Docs explain current behavior and limits.
- Verification commands pass or blockers are documented accurately.
- CI uses the canonical local commands and preserves browser failure evidence.
- No local runtime artifacts, package tarballs, DBs, logs, caches, or secrets are staged.
