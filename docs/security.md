# Security

Mainspring treats agents as useful but untrusted workers. The current package has real runtime controls, but it does not yet provide desktop sandboxing, VM isolation, operator roles, or budget enforcement.

## Implemented Today

| Layer | Current control |
| --- | --- |
| Mailbox boundary | Host writes inbound rows; runner owns outbound rows, event rows, and heartbeat. |
| Tools | Manifest validation plus explicit permission declarations. |
| Policy | `RuntimePolicyGuard` allow/approval decisions for tool execution and skill install. |
| Approvals | `ApprovalReceipt` binds approval id, run id, target tool, input hash, expiry, and nonce. |
| Files | Built-in file tools use realpath workspace containment. |
| Shell | Shell execution requires approval, scrubs obvious secret env vars, caps output, and runs in the configured workspace root. SDK-managed sessions resolve that root per session. |
| Web | Web tools reject non-public targets and re-check redirect targets. |
| Browser | Browser tools require an injected adapter and validate public HTTP(S) open targets. |
| Logs/events | Runtime values are sanitized and obvious secret material is redacted. |
| Docker runtime | Image runs as UID/GID `10001`, declares expected volumes, and does not expose a public port. |
| Compose guard | Security script checks no published ports, no Docker socket, no privileged mode, expected env vars only, and expected named mounts. |

## Current Limits

- Host `shell.exec` is not a sandbox. It is approved host process execution.
- SDK-managed runtime sessions use their stored workspace root for provider `cwd` and tool containment. The direct CLI/runtime entrypoint still depends on `MAINSPRING_WORKSPACE_ROOT`.
- Process execution must not be marketed as secure containment.
- Path checks, environment scrubbing, and output caps reduce blast radius but do not isolate hostile code.
- Browser execution is adapter-trusted. The current browser tool does not provide per-run browser profiles, download policy, full navigation revalidation, or network isolation.
- The Vite console is a `localStorage` prototype. It is not secure authentication or provider-secret storage.
- Provider keys and durable auth state must not be stored in renderer `localStorage`.
- Single-round SHA-256 in the prototype console must not be treated as desktop password storage.
- The current policy model does not enforce operator roles, tenant scopes, budget caps, dangerous pattern classes, or differentiated critical-action classes.

## Planned Controls

These are target controls, not implemented security claims:

- Local Gateway-owned auth, provider profiles, approval broker, app database, and event stream.
- OS keychain or credential-store integration for provider secrets.
- HyperCell-backed execution for real shell, file mutation, browser, and web mutation paths.
- WSL2, Windows Sandbox, Hyper-V VM, HCS, and linux-bwrap backends after ADR-backed research.
- Per-run or per-cell browser profiles, download policy, and stronger navigation/network enforcement.
- Operator roles, tenant scopes, budget caps, critical policy classes, and immutable audit logs.

## Required Practice

- Keep decrypted secret values out of prompts, logs, events, traces, browser payloads, and tool outputs.
- Pass secret references, not plaintext secrets, through runtime contracts.
- Resolve approvals through the mailbox approval-response path and `ApprovalReceipt`; do not add renderer-only approval booleans.
- Keep product orchestration outside `RuntimeKernel`.
- Preserve the mailbox, tool, policy, provider, and event seams documented in [Current State](current-state.md).
