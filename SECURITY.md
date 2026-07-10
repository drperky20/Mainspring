# Security Policy

Mainspring treats agents as useful but untrusted workers. It has real local runtime controls, but it is not magic containment.

## Report A Vulnerability

Open a private security advisory or contact the maintainers through the distribution channel you are using. Include reproduction steps, affected version, expected impact, and whether host execution, provider secrets, workspace containment, gateway auth, or browser DTOs are involved.

## Current Security Truth

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- Tool execution is policy-gated and approval-aware.
- Approval receipts bind approval id, run id, target tool, input hash, expiry, and nonce.
- File tools enforce workspace containment.
- Logs, runtime events, and bridged control output redact obvious secret-shaped values.
- Provider keys must not be stored in renderer localStorage.
- Browser-managed provider secrets are write-only and resolved host-side.
- Local gateway managed secrets are encrypted at rest in app-state storage; Windows can use Credential Manager for the local master key.
- Local gateway hosted-auth mode uses `scrypt` password hashing, server-side sessions, and admin/operator/viewer route authorization. It is not enterprise SSO, tenant isolation, or a cloud identity boundary.
- Host, WSL, and Docker execution backends are explicit. WSL/Docker availability must be detected and fail closed when unavailable.
- Docker execution is a local container route, not a complete VM isolation product.
- The Electron shell exposes no raw shell or filesystem bridge to the renderer.

## Not Implemented

- Not implemented: cross-platform secure desktop credential vault.
- Not implemented: full HyperCell VM pool.
- Not implemented: tenant-scoped hosted authorization or enterprise identity federation.
- Not implemented: payment-backed billing or provider-side spend reservation.
- Not implemented: production browser isolation.
- Not implemented: managed Kubernetes control plane or production-cluster certification.
- Linux desktop installer packaging.

## Required Practice

- Pass secret references, not plaintext secrets, through runtime contracts.
- Keep decrypted secrets out of prompts, logs, events, browser payloads, and tool outputs.
- Resolve dangerous work through the policy and approval path.
- Keep browser DTOs sanitized and tested.
- Keep product orchestration outside `RuntimeKernel`.
- Preserve the mailbox, tool, policy, provider, and event seams.

Read [docs/security.md](docs/security.md) for the detailed security model.
