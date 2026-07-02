# Operations

## Main Checks

```bash
pnpm verify
pnpm release:check
```

`verify` runs doctor, typecheck, tests, build, security checks, docs checks, and console checks.

`release:check` adds gateway systems, gateway help, examples, desktop systems, package dry-runs, and Docker Compose config validation.
It also runs `agentic:check`, which exercises examples plus denied approvals, provider errors, cancellation, replay, budgets, cron, marketplace, deployment, and execution backend verifiers through the built package.
Desktop systems include `desktop:packaging:check`, which keeps Electron packaging Windows-only and rejects Linux desktop package targets while preserving source/dev and Docker usage.
Gateway systems include `cells:check`, which verifies backend capability truth, unsafe host labeling, cell lease lifecycle, capacity blocking, expiry, and exact fail-closed status when no isolated-capable backend is available.
It runs `package:check` before package dry-runs so exported npm subpaths, the runtime binary, npm ignore hygiene, package metadata placeholders, package-visible Markdown placeholder tokens, and every package-visible Markdown link are checked against `dist` and the package file allowlist.
It runs `docs:check` during `verify` so the rewritten docs index stays aligned with package-visible docs, the goal digest remains repo-local, and removed legacy docs do not return to the public docs surface.
It runs `release:workflow:check` so GitHub workflows keep read-only contents permissions, frozen installs, job timeouts, concurrency cancellation, pull request / `main` push / manual release-check triggers, and expected release/package commands.
It runs `optional-verifiers:check` so optional verifier prerequisite diagnostics stay machine-readable without requiring live external services during `release:check`.

`cells:check:integration` is intentionally not part of `release:check`; it requires a real WSL or Docker backend and rejects host execution. Missing prerequisites are reported with `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED`.

`openrouter:e2e` is also optional. It requires `OPENROUTER_API_KEY` and network access, is not part of `release:check`, and reports missing credentials with `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED` without echoing key values. When credentials are present, it runs a live OpenRouter request through `createRunLogMainspring`, `RunIntent`, `RunLogKernel`, `RunLogExecutor`, `ProviderRouter`, `OpenRouterProvider`, and `RunLogProjection`; it verifies RunLog lifecycle events, provider-init detail, assistant output, usage when reported, and no key echo in RunLog events.

`examples:check` is an alias for the runnable examples smoke suite. It includes the RunLog-native `provider-run`, `tool-approval`, `coding-agent`, `personal-assistant`, `support-agent`, and `agency-client-agent` examples plus the compatibility `local-first-agent` memory workflow during migration.

## Focused Checks

```bash
pnpm gateway:systems:check
pnpm examples:check
pnpm examples:smoke
pnpm agentic:check
pnpm docs:check
pnpm package:check
pnpm desktop:packaging:check
pnpm desktop:systems:check
pnpm security:sensitive-patterns
pnpm cells:check
pnpm cells:check:integration
pnpm optional-verifiers:check
pnpm openrouter:e2e
```

## Gateway Checks

```bash
pnpm pricing:check
pnpm budget:check
pnpm secrets:check
pnpm auth:check
pnpm execution-backends:check
pnpm marketplace:check
pnpm cron:check
pnpm deploy:check
```

## Do Not Commit

- `.env.local`
- `.mainspring`
- `*.db`
- `*.sqlite`
- logs/cache/tmp
- package tarballs
- desktop release artifacts unless intentionally tracked
