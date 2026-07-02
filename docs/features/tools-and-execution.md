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

Process tools can target:

| Backend | Meaning | Truth |
| --- | --- | --- |
| `host` | Host process execution. | Not sandboxed. |
| `wsl` | WSL route when available. | Not full VM isolation. |
| `docker` | Local Docker container route when available. | Container route, not a complete VM. |
| `auto` | Runtime default. | Must not silently downgrade explicit isolated-capable requests. |

`HyperCellScheduler` currently records local backend leases, capacity checks, expiry, and safe status summaries.

## What It Does Not Do

- Host execution is not a sandbox.
- Process execution is not secure containment.
- WSL and Docker routes are not full VM isolation.
- `HyperCellScheduler` is not a full HyperCell VM pool.
- `cells:check:integration` intentionally refuses host execution.

## How To Verify

```bash
pnpm cells:check
pnpm cells:check:integration
pnpm execution-backends:check
```

`cells:check` is stable on hosts without WSL or Docker because unavailable isolated-capable backends must report exact blockers while host execution remains unsafe-labeled.

`cells:check:integration` is stricter and requires an available WSL or Docker backend. When prerequisites are missing, it exits nonzero with `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED` and a JSON summary of backend availability.
