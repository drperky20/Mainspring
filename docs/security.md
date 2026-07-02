# Security

Mainspring treats agents as untrusted workers.

## Implemented Controls

- mailbox/event journal boundary
- tool manifests
- canonical RunLog `DecisionRecord` events for guarded tool executions
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
- unapprovable hard blocks for catastrophic shell, credential-disclosure, Git remote/hook mutation, approval-disabling, and network-to-shell patterns
- RunLog cron/headless grant decisions before due runs are queued or failed
- local-agent security regression corpus for shell, filesystem, browser/fetch, memory, skill, bridge, and cron policy boundaries
- repo-local red-team matrix that maps each tested or deferred failure class to evidence and remaining work

## Hard Truths

- Host shell execution is not a sandbox.
- A `DecisionRecord` is an audit/enforcement fact, not an isolation boundary.
- Process execution must not be marketed as secure containment.
- WSL/Docker routing is not a full VM isolation product.
- Renderer localStorage provider auth is prototype-only.
- Provider keys must not be stored in browser localStorage.
- The desktop shell is not a secret vault.
- Local hosted auth is not enterprise SSO.
- Local budget enforcement is not payment billing.
- RunLog cron grants are scheduling authority checks, not process containment.

## Required Practice

- Pass secret refs, not plaintext values.
- Keep decrypted secrets out of prompts, logs, events, and browser DTOs.
- Put dangerous actions behind policy and approvals.
- Hard-blocked actions must stay blocked even if an approval receipt is supplied.
- Side-effecting RunLog cron schedules should use scoped, expiring grants instead of waiting for unattended approval.
- New tool, host, cron, memory, skill, subagent, channel, or browser side-effect surfaces need a row in `docs/security-redteam-matrix.md` and either an executable regression or an explicit limitation.
- Add leak tests for new browser-facing fields.
- Keep runtime work inside the mailbox/kernel/tool/policy spine.

## Checks

```bash
pnpm security:mainspring
pnpm security:sensitive-patterns
pnpm secrets:check
pnpm auth:check
```
