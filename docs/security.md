# Security

Mainspring treats agents as untrusted workers.

## Implemented Controls

- mailbox/event journal boundary
- tool manifests
- canonical RunLog `DecisionRecord` events for guarded tool executions
- approval receipts
- RunLog approval receipt configured-key mode for non-local hosts; local-dev fallback is explicit
- file workspace containment
- output redaction and truncation
- gateway JSON/SSE text redaction for browser-unsafe path markers and common provider key environment markers
- console snapshot/read-model preview redaction for browser-unsafe path markers and common provider key environment markers
- shared pure provider-marker helper for gateway and console browser-boundary checks
- managed local provider secrets
- hash-only, pre-mutation provider-profile authority records with hosted-principal attribution
- local gateway hosted-auth mode
- hosted gateway admin/operator/viewer route authorization with fail-closed mutation classification
- hash-only, pre-mutation deployment authority records with hosted-principal attribution
- hash-only, pre-mutation client/workspace/agent/session topology authority records with hosted-principal attribution and cross-client workspace binding checks
- admin-only hosted user management, final-active-admin protection, and session revocation after password changes or account disabling
- local-only gateway binding
- local gateway browser-origin allowlist for localhost/loopback console origins; hostile browser origins are rejected before hosted auth bootstrap/login
- bounded in-process hosted-login backoff and authenticated-session attribution for gateway approval audit records
- gateway-dev refuses an external `0.0.0.0` bind unless hosted auth/bootstrap credentials and a configured RunLog approval key are supplied
- browser adapter public-target checks for initial opens plus adapter-reported current URLs after open and before/after page interaction/read actions
- short-lived hosted browser-access tickets for local artifact and SSE reads, with scoped SSE targets bound to a matching canonical-or-compatibility run/session pair and auth-like query parameters rejected on ticketed URLs
- console-side local gateway URL validation that rejects embedded `user:password@host` credentials
- console-side response tripwires that reject browser-unsafe secret/path fields, common provider key environment markers, and common Windows drive-letter, UNC, and Unix host absolute paths in successful JSON responses
- Docker runtime packaging guardrails
- Kubernetes gateway deployment manifests with single-replica SQLite, non-root execution, dropped capabilities, read-only root filesystem, disabled service-account token mounting, health probes, resource limits, existing Secret/PVC references, and guarded destroy
- unapprovable hard blocks for catastrophic shell, credential-disclosure, Git remote/hook mutation, approval-disabling, and network-to-shell patterns
- RunLog cron/headless grant decisions before due runs are queued or failed
- local-agent security regression corpus for shell, filesystem, browser/fetch, memory, skill, bridge, and cron policy boundaries
- repo-local red-team matrix that maps each tested or deferred failure class to evidence and remaining work
- memory, skill, and local template provenance scanner with staged JSONL review records
- pinned Ed25519 remote template catalogs with bounded HTTPS retrieval, redirect target revalidation, expiry checks, per-file hashes, deterministic provenance scanning, text-only payloads, collision rejection, and pre-existing symlink traversal rejection

## Hard Truths

- Host shell execution is not a sandbox.
- A `DecisionRecord` is an audit/enforcement fact, not an isolation boundary.
- Process execution must not be marketed as secure containment.
- WSL/Docker routing is not a full VM isolation product.
- Renderer localStorage provider auth is prototype-only.
- Browser automation is not a security boundary.
- Provider keys must not be stored in browser localStorage.
- The desktop shell is not a secret vault.
- Local hosted auth and its role checks are not enterprise SSO or tenant isolation.
- Local browser-origin checks reduce cross-site localhost risk, but they are not a hosted identity system.
- RunLog local-dev approval receipt fallback is for examples/tests/local development only.
- Local budget enforcement is not payment billing.
- RunLog cron grants are scheduling authority checks, not process containment.
- Signed template catalogs establish integrity from a configured key pin; they do not establish publisher reputation, key revocation, or content quality.
- Generated Kubernetes workload controls are not proof of cluster admission policy, storage durability, backup, ingress safety, or production readiness.

## Required Practice

- Pass secret refs, not plaintext values.
- Keep decrypted secrets out of prompts, logs, events, and browser DTOs.
- Put dangerous actions behind policy and approvals.
- Hard-blocked actions must stay blocked even if an approval receipt is supplied.
- Side-effecting RunLog cron schedules should use scoped, expiring grants instead of waiting for unattended approval.
- Treat memory, skills, and local templates as behavior mutation. Use provenance scanning and staged review for suspicious or third-party writes.
- New tool, host, cron, memory, skill, subagent, channel, or browser side-effect surfaces need a row in `docs/security-redteam-matrix.md` and either an executable regression or an explicit limitation.
- Add leak tests for new browser-facing fields.
- Keep new runtime work inside the RunLog/provider/tool/policy/approval spine; treat the mailbox kernel as compatibility code during migration.

## Checks

```bash
pnpm security:mainspring
pnpm security:sensitive-patterns
pnpm secrets:check
pnpm auth:check
```
