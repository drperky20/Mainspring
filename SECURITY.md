# Security Policy

Mainspring treats agents as useful but untrusted workers. The current package has real runtime policy checks, approval receipts, redaction, workspace containment for file tools, and non-root Docker packaging. It does not yet provide desktop sandboxing, VM isolation, secure desktop secret storage, or browser-side secure auth flows.

## Report A Vulnerability

Open a private security advisory or contact the maintainers through the distribution channel you are using. Include reproduction steps, affected version, expected impact, and whether host execution, secrets, or workspace containment are involved.

## Current Security Truth

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- Browser adapter execution is trusted, not isolated.
- Tool execution is policy-gated and approval-aware.
- File tools enforce realpath workspace containment.
- Logs, runtime events, and bridged control output redact obvious secret-shaped values.
- Docker packaging runs non-root and the local security guard rejects privileged mode and Docker-socket mounts.
- Renderer `localStorage` provider auth is prototype-only and must not be used for real provider keys.

## Not Implemented Yet

- HyperCells or VM isolation
- secure desktop secret store
- billing ledger or budget caps
- hosted control plane
- production browser isolation

## Production Expectations

- Replace development secrets in local env files.
- Use a real secret-management system before multi-user or production deployments.
- Add stronger workload isolation before trusting shell or browser execution with higher-risk tasks.
- Review current-state and deployment docs alongside this file before making security claims.
