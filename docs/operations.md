# Operations

## Main Checks

```bash
pnpm verify
pnpm release:check
pnpm test:typecheck
pnpm console:e2e
pnpm benchmark:overhaul
```

`verify` runs the repository doctor explicitly through `pnpm run doctor`, then source
typecheck, tests, build, security checks, docs checks, and console checks. The explicit
`run` matters because `pnpm doctor` by itself names a pnpm built-in command.

`release:check` adds gateway systems, gateway help, examples, desktop systems, package
checks, pnpm tarball validation, an npm package dry-run, and Docker Compose config validation.
`package:pack:check` invokes pnpm's supported `--pack-destination` mode in an OS temp
directory, requires one non-empty tarball, and removes the temp directory before it
reports success.

`test:typecheck` is a separate strict TypeScript lane for production-critical RunLog,
worker, ContextLens, desktop, and browser-to-gateway test modules. It deliberately does
not claim that every historical fixture is strict-clean: the older broad
`LocalGateway.test.ts` and `createLocalGatewayServer.test.ts` fixtures still contain
strict-null and outdated discriminant errors, so they remain outside this focused lane
until that fixture debt is repaired.

`console:e2e` builds the runtime, creates a unique operating-system temporary state
root, starts an EchoProvider-backed gateway and Vite console on reserved loopback
ports, then runs the Chromium operator workflow. It strips provider credentials from
the gateway child environment and removes all generated sessions, workspaces, SQLite
files, traces, and screenshots when it exits. Install the browser once with
`pnpm exec playwright install chromium` if the local Playwright browser cache is empty.
When `MAINSPRING_E2E_ARTIFACTS_DIR` is set, Playwright traces, failure screenshots,
videos, and the HTML report are written there instead of the temporary root and are
preserved for inspection. Gateway, Vite, and Playwright output is inherited by the
calling terminal or CI job so the live run can be diagnosed without a hidden log file.
It also runs `agentic:check`, which exercises examples plus denied approvals, provider errors, cancellation, replay, budgets, cron, marketplace, deployment, and execution backend verifiers through the built package.
Desktop systems include `desktop:packaging:check`, which keeps Electron packaging Windows-only and rejects Linux desktop package targets while preserving source/dev and Docker usage.
Gateway systems include `cells:check`, which verifies backend capability truth, unsafe host labeling, cell lease lifecycle, capacity blocking, expiry, and exact fail-closed status when no isolated-capable backend is available.
It runs `package:check` before package validation so exported npm subpaths, the runtime binary, npm ignore hygiene, package metadata placeholders, package-visible Markdown placeholder tokens, and every package-visible Markdown link are checked against `dist` and the package file allowlist.
It runs `docs:check` during `verify` so the rewritten docs index stays aligned with package-visible docs, the goal digest remains repo-local, and removed legacy docs do not return to the public docs surface.
It runs `release:workflow:check` so GitHub workflows keep read-only contents permissions, frozen installs, job timeouts, concurrency cancellation, pull request / `main` push / manual release-check triggers, and expected release/package commands.
The normal CI workflow has one cross-platform `pnpm verify` matrix and one Linux
Chromium `pnpm console:e2e` job for every push and pull request. It retains browser
failure evidence for seven days. The hosted release workflow invokes the canonical
`pnpm release:check` package script directly, so local and GitHub release gates cannot
silently diverge; pnpm `9.15.4` is activated explicitly before every frozen install.
Hosted workflows use the current Node 24-compatible `actions/checkout@v7`,
`actions/setup-node@v6`, and `actions/upload-artifact@v7` majors; the local workflow
verifier checks those action versions so action-runtime drift fails before a push.
Aggregate gateway snapshots retain a bounded newest-first tail of artifact, tool-call,
usage, and audit rows. Exact history counts and provider/model usage rollups remain in
the snapshot for operator metrics; the Activity detail routes continue to provide the
full cursor-paginated history when a view is opened.
The Windows verify leg preflights `Microsoft.PowerShell.Security` and pins the
managed-secret integration to `pwsh`; local Windows hosts without PowerShell Core
fall back to Windows PowerShell 5.1 through the runtime selector.
It runs `optional-verifiers:check` so optional verifier prerequisite diagnostics stay machine-readable without requiring live external services during `release:check`.

`cells:check:integration` is intentionally not part of `release:check`; it requires a real WSL or Docker backend and rejects host execution. Missing prerequisites are reported with `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED`.

`openrouter:e2e` is also optional. It requires `OPENROUTER_API_KEY` and network access, is not part of `release:check`, and reports missing credentials with `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED` without echoing key values. When credentials are present, it runs a live OpenRouter request through `createRunLogMainspring`, `RunIntent`, `RunLogKernel`, `RunLogExecutor`, `ProviderRouter`, `OpenRouterProvider`, and `RunLogProjection`; it verifies RunLog lifecycle events, provider-init detail, assistant output, usage when reported, and no key echo in RunLog events.

`examples:check` is an alias for the runnable examples smoke suite. It includes the RunLog-native `provider-run`, `tool-approval`, `coding-agent`, `personal-assistant`, `support-agent`, `agency-client-agent`, and `local-first-agent` examples.

`benchmark:overhaul` builds the package and runs deterministic local fixtures
for bounded RunLog concurrency plus fresh, cached, conditionally revalidated
console snapshots, cold and warm cursor-paginated compatibility activity,
canonical RunLog activity, approval history, and a public-only RunLog trace
page. It records comparative evidence only; do not turn its timings into a
cross-machine CI threshold or a claim about live provider latency.

## Focused Checks

```bash
pnpm run doctor
pnpm gateway:systems:check
pnpm examples:check
pnpm examples:smoke
pnpm agentic:check
pnpm docs:check
pnpm package:check
pnpm package:pack:check
pnpm desktop:packaging:check
pnpm desktop:systems:check
pnpm security:sensitive-patterns
pnpm cells:check
pnpm cells:check:integration
pnpm optional-verifiers:check
pnpm openrouter:e2e
pnpm test:typecheck
pnpm console:e2e
pnpm benchmark:overhaul
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
