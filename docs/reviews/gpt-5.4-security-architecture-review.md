# GPT-5.4 Security Architecture Review

Date: 2026-07-02

Reviewer: Russell, security-reviewer, GPT-5.4

Scope:

- `README.md`
- `RELEASE.md`
- `SECURITY.md`
- `docs/architecture.md`
- `docs/current-state.md`
- `docs/migration-runlog.md`
- `docs/security.md`
- `docs/security-truth.md`
- `docs/security-redteam-matrix.md`
- `docs/implementation-backlog.md`
- `src/core`
- `src/runner/RuntimeKernel.ts`
- `src/mailbox/SqliteMailbox.ts`
- `src/policy`
- `src/gateway`
- `src/tools`
- `src/provenance`

Commands run by reviewer:

- `pnpm audit --prod`
- `pnpm run secrets:check`
- `pnpm run security:sensitive-patterns`
- `pnpm run security:truth`

Result:

- Overall risk: medium.
- No hardcoded secrets, dependency CVEs, release-claim drift, or false containment claims were found in the reviewed surface.
- The RunLog path is substantially stronger than the legacy mailbox path, but several local-gateway and future subagent/browser boundaries still need hardening before hosted or multi-tenant claims are safe.

## Strengths

- RunLog canonicality is code-backed. Documentation accurately marks the mailbox and `RuntimeKernel` path as compatibility-only migration surface.
- RunLog approval handling uses signed receipts, snapshot binding, expiry, and one-time use semantics.
- Cron and headless execution fail closed and record policy decisions before queueing or failure.
- Shell, file, and web guardrails include hard blocks for network-to-shell/destructive patterns, realpath workspace containment, and public-network-only URL checks.
- Memory and skill mutation paths are scanned and staged before persistence where appropriate.
- `pnpm security:truth` and release-claim checks are wired into verification and release checks.

## Accepted Findings

| Area | Finding | Risk | Recommended fix |
| --- | --- | --- | --- |
| RunLog approvals | `RunLogApprovalReceipt` falls back to a static repo-known local-dev key when `MAINSPRING_RUNLOG_APPROVAL_KEY` is unset. | A non-local deployment could accidentally use a predictable approval-signing key. | Require a configured approval key outside explicit local-dev/test lanes, or fail closed when hosted/release profiles use the fallback. |
| Legacy mailbox approvals | The compatibility mailbox path still allows `approval_response` to become a local unsigned legacy receipt before tool execution. | Channel spoofing and identity binding remain softer than RunLog receipts. | Keep RuntimeKernel/mailbox feature-frozen and migrate privileged approval/cron/channel entrypoints to RunLog. |
| Local gateway auth boundary | The local gateway sends wildcard CORS headers, exposes `x-mainspring-auth-token`, and keeps `/auth/bootstrap` and `/auth/login` unauthenticated. | A malicious website could target a localhost operator lane if browser-origin controls are weak. | Replace wildcard CORS with an explicit local-origin allowlist and add CSRF-resistant handling for bootstrap/login. |
| Browser adapter boundary | `browser.open` validates the initial URL, while redirect and later-navigation revalidation remain partial. | Browser-capable runs can drift into localhost, metadata, or private-network targets after initial validation. | Revalidate URL state after redirects/navigation and before privileged browser actions. |
| Subagents | Subagent APIs are not ready for parent-child authority attenuation. | Child runs could inherit too much policy, workspace, or tool authority if implemented directly. | Do not ship subagent APIs until parent-child authority attenuation and `DecisionRecord` coverage exist. |
| Memory and skills | The current scanner is deterministic but heuristic, and taint labels beyond scan findings are pending. | Reviewed or persisted content can still carry untrusted behavioral influence into future runs. | Add taint labels or stronger provenance semantics for web/email/file-derived memory and skill mutations. |

## Rejected Or Non-Issues

- No dependency advisory was found by `pnpm audit --prod`.
- No hardcoded provider keys or obvious secret values were found by `pnpm run secrets:check`.
- Public docs did not claim implemented HyperCells, hardened cloud compute boundaries, operator permission tiers, hosted payment flows, hosted marketplace security, or secure desktop secrets.
- Host shell execution is consistently described as unsafe host execution rather than a protected runtime boundary.

## Follow-Up

The next security milestone should be small and code-backed: harden the local gateway browser-origin/auth boundary, then require an explicit RunLog approval signing key outside local-dev/test profiles.
