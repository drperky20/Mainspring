# Security

Mainspring treats agents as untrusted workers.

## Implemented Controls

- mailbox/event journal boundary
- tool manifests
- policy decisions
- approval receipts
- file workspace containment
- output redaction and truncation
- gateway JSON/SSE text redaction for browser-unsafe path markers and common provider key environment markers
- console snapshot/read-model preview redaction for browser-unsafe path markers and common provider key environment markers
- shared pure provider-marker helper for gateway and console browser-boundary checks
- managed local provider secrets
- local gateway hosted-auth mode
- local-only gateway binding
- short-lived hosted browser-access tickets for local artifact and SSE reads, with auth-like query parameters rejected on ticketed URLs
- console-side local gateway URL validation that rejects embedded `user:password@host` credentials
- console-side response tripwires that reject browser-unsafe secret/path fields, common provider key environment markers, and common Windows drive-letter, UNC, and Unix host absolute paths in successful JSON responses
- Docker runtime packaging guardrails

## Hard Truths

- Host shell execution is not a sandbox.
- Process execution must not be marketed as secure containment.
- WSL/Docker routing is not a full VM isolation product.
- Renderer localStorage provider auth is prototype-only.
- Provider keys must not be stored in browser localStorage.
- The desktop shell is not a secret vault.
- Local hosted auth is not enterprise SSO.
- Local budget enforcement is not payment billing.

## Required Practice

- Pass secret refs, not plaintext values.
- Keep decrypted secrets out of prompts, logs, events, and browser DTOs.
- Put dangerous actions behind policy and approvals.
- Add leak tests for new browser-facing fields.
- Keep runtime work inside the mailbox/kernel/tool/policy spine.

## Checks

```bash
pnpm security:mainspring
pnpm security:sensitive-patterns
pnpm secrets:check
pnpm auth:check
```
