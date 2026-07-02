# Local Agent Security Red-Team Matrix

Last updated: 2026-07-02.

This matrix maps local-agent failure classes to current Mainspring evidence. It is deliberately conservative: a class is marked covered only when code and tests exercise the behavior.

| Failure class | Current answer | Evidence | Remaining work |
| --- | --- | --- | --- |
| Host shell execution without approval | Requires scoped approval before execution. | `src/security/agent-security-regression.test.ts`; `ToolRegistry`; `RuntimePolicyGuard`; `ShellTool` manifest. | Host execution remains unsafe host process execution after approval. |
| Loader/env-var injection through shell | Requires approval before execution. | `src/security/agent-security-regression.test.ts`. | Add deeper command risk classification before approval if advisory classifier is implemented. |
| Remote URL piped to shell | Hard-blocked below approval. | `src/security/agent-security-regression.test.ts`; `RuntimePolicyGuard` hardline patterns. | Broaden corpus as parser bypasses are discovered. |
| Interpreter indirection for remote shell install | Hard-blocked when the command carries the pipe-to-shell payload. | `src/security/agent-security-regression.test.ts`. | Add language-specific bypass samples in future corpus expansion. |
| Catastrophic filesystem wipe / fork bomb / raw disk write | Hard-blocked by policy patterns. | `RuntimePolicyGuard`; `ToolRegistry.test.ts`. | Add dedicated samples to the security corpus as follow-up. |
| Workspace `../` traversal | Rejected by path-boundary checks before file access. | `src/security/agent-security-regression.test.ts`; `PathSecurity`; `assertPathContained`. | Keep Windows and POSIX path variants in regression tests. |
| Symlink/junction workspace escape | Rejected by realpath path-boundary checks before file access. | `src/security/agent-security-regression.test.ts`; `assertPathContained`. | Add TOCTOU-aware write/open patterns where feasible. |
| Workspace mutation without approval | Requires approval and does not execute. | `src/security/agent-security-regression.test.ts`; file tool manifests. | Approved host mutations are still unsafe host filesystem changes. |
| Browser navigation to local/private target | Requires approval through browser policy path. | `src/security/agent-security-regression.test.ts`; `BrowserTool`; `RuntimePolicyGuard`. | Browser adapter still needs stronger URL revalidation and trace/artifact policy. |
| Web fetch SSRF to local/metadata target | Rejected before fetch. | `src/security/agent-security-regression.test.ts`; `UrlPolicy`; `WebTools`. | Keep DNS rebinding/redirect cases covered by `assertPublicNetworkTarget`. |
| Memory persistence | Requires approval, provenance scan, and staged review when content triggers review. | `src/security/agent-security-regression.test.ts`; `src/provenance/ProvenanceReview.test.ts`; `MemoryTool`. | Operator-facing review UX is still pending. |
| Skill/catalog write | Requires approval, provenance scan, and staged review for remote/uploaded or high-capability skill manifests. | `src/security/agent-security-regression.test.ts`; `src/provenance/ProvenanceReview.test.ts`; `SkillTools`; `pnpm skills:check`. | Remote marketplace trust is still not implemented. |
| MCP/tool bridge bypass | Requires approval when registered through `ToolRegistry`; executor is not reached. | `src/security/agent-security-regression.test.ts`. | Future MCP host surfaces need direct DecisionRecord adapters. |
| Cron/headless side-effect escalation | Denied by default and records a cron `DecisionRecord`; RunLog-configured gateway cron schedules use the same fail-closed policy path and expose HTTP/client grant preview/create. | `src/security/agent-security-regression.test.ts`; `RunLogCron`; `SqliteRunLogStore`; `src/gateway/LocalGateway.test.ts`; `src/gateway/server/createLocalGatewayServer.test.ts`; `apps/console/src/localGatewayClient.test.ts`. | Gateways without a RunLog host remain mailbox-compatible; dedicated visual console controls are pending. |
| Mutated headless cron prompt after grant | Denied by prompt-hash mismatch. | `src/security/agent-security-regression.test.ts`; `RunLogCron`. | Add visual console affordances so operators can inspect changed grant state without calling the API directly. |
| Cross-agent/channel spoofing | Deferred with explicit limitation. | `docs/implementation-backlog.md`. | Needs RunLog-native channel send decisions and identity model. |
| Subagent privilege expansion | Deferred with explicit limitation. | `docs/implementation-backlog.md`; `docs/current-state.md`. | Implement child RunLog runs with parent authority attenuation. |
| Malicious remote skill payload | Blocked or staged by local skill/template provenance scanner depending on finding severity. | `src/provenance/ProvenanceReview.test.ts`; `scripts/check-skill-provenance.mjs`. | Scanner is local and deterministic; it is not a remote trust service. |
| Skill memory poisoning | Memory and skill writes are scanned and staged on review findings. | `src/provenance/ProvenanceReview.test.ts`; `MemoryTool`; `SkillTools`. | Taint labels beyond scan findings and operator-facing review UX remain pending. |
| Browser localhost/metadata SSRF through browser adapter | Partially covered by approval requirement. | `src/security/agent-security-regression.test.ts`. | Add browser URL allow/deny revalidation at adapter boundary. |

## Rule

When a new tool, host surface, cron mode, memory/skill write path, subagent API, or channel adapter is added, it should land with either:

- a new row here with code-backed evidence, or
- an explicit deferred limitation in `docs/implementation-backlog.md`.
