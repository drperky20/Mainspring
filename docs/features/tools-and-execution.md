# Tools And Execution

## What It Does

Tools are runtime capabilities exposed through `ToolRegistry`.

Tool areas:

- file/workspace tools
- shell execution
- terminal sessions
- memory
- web
- browser adapter
- skills
- diagnostics

Browser tools validate initial `browser.open` targets as public HTTP(S) URLs and, when the adapter exposes `currentUrl`, re-check the adapter-reported page URL after open and before/after click, type, snapshot, and screenshot actions. `PlaywrightBrowserRuntimeAdapter` is an optional host-owned lease implementation: it starts/stops Playwright tracing, assigns bounded snapshot element refs, writes screenshots and traces below a configured artifact root, and emits run-bound `browser.lease.*` / `artifact.created` events without returning host paths to the provider. `createPlaywrightBrowserToolSessionFactory` attaches one such lease to a RunLog execution attempt and releases it on completion, cancellation, or approval pause. This is still browser automation, not a security boundary or VM isolation product.

Process tools can target:

| Backend | Meaning | Truth |
| --- | --- | --- |
| `host` | Host process execution. | Not sandboxed. |
| `wsl` | WSL route when available. | Not full VM isolation. |
| `docker` | Local Docker container route when available. | Container route, not a complete VM. |
| `auto` | Runtime default. | Must not silently downgrade explicit isolated-capable requests. |

Execution backends are resolved through `ExecutionBackendRegistry`. The bundled adapters are `host`, `wsl`, and `docker`; WSL reports unavailable outside Windows, and host execution stays explicitly unsafe-labeled. Custom backend IDs are safe strings and must be registered before resolution can execute them. Adapter metadata owns availability, capability summaries, and process spawn specs.

`HyperCellScheduler` currently records local backend leases, capacity checks, expiry, and safe status summaries.

## What It Does Not Do

- Host execution is not a sandbox.
- Process execution is not secure containment.
- WSL and Docker routes are not full VM isolation.
- `HyperCellScheduler` is not a full HyperCell VM pool.
- `cells:check:integration` intentionally refuses host execution.
- Playwright browser leases are optional host adapters; they do not provide a browser sandbox, hosted identity, or cross-restart page persistence.
- A browser lease is scoped to one execution attempt. Approval pauses release
  the page/context, and a resumed attempt must create a fresh lease.

## How To Verify

```bash
pnpm cells:check
pnpm cells:check:integration
pnpm execution-backends:check
```

`cells:check` is stable on hosts without WSL or Docker because unavailable isolated-capable backends must report exact blockers while host execution remains unsafe-labeled.

`cells:check:integration` is stricter and requires an available WSL or Docker backend. When prerequisites are missing, it exits nonzero with `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED` and a JSON summary of backend availability.
