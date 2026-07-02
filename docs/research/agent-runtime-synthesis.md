# Agent Runtime Synthesis

Last updated: 2026-07-02.

This is a repo-grounded synthesis for finishing Mainspring as a local-first TypeScript RunLog Fabric runtime. It uses external systems as references, not as products to clone. The current Mainspring evidence comes from `src/core`, `src/adapters/sqlite`, `src/hosts/runlog`, `src/tools`, `src/provenance`, `docs/current-state.md`, `docs/security-truth-matrix.md`, and `docs/implementation-backlog.md`.

## 1. Executive Summary

Mainspring should keep its selected lane: a small RunLog-centered runtime with SQLite WAL, approval receipts, policy decisions, local workspace/tool execution, and honest security boundaries. The useful external pattern is not "more framework"; it is durable state, explicit permissions, human review, and cheap idle agents.

Adopt:

- Durable run events/checkpoints and host projections as the canonical state model.
- Permission modes that are obvious to operators and code-backed.
- Local provenance scanning and staged review for behavior mutation.
- Examples that prove the real runtime path instead of product theater.

Adapt:

- Hermes-style memory/skills/cron/subagents only through RunLog, ToolRegistry, RuntimePolicyGuard, and scoped approvals.
- OpenHands-style workspace/terminal/browser power only with explicit backend truth and event history.
- Claude Code/Codex/opencode permission modes as policy inputs, never as a model-owned authority.
- Temporal/LangGraph durability lessons as lightweight local RunLog checkpoints, not a mandatory workflow server.

Avoid:

- Default-open host execution.
- "Smart" approvals that override hard policy.
- Plugin/skill marketplaces before local provenance and trust boundaries are real.
- Running idle resident agents for every configured agent.
- Redis/Postgres/Temporal/Kubernetes as required local infrastructure.

## 2. System Matrix

| System | Verified external facts | Mainspring lesson | Decision |
| --- | --- | --- | --- |
| OpenClaw | Treated in this repo as a broad local automation reference with shell/file/process/channel risk classes. | Keep the broad failure-class corpus, but do not copy permissive local automation defaults. | Adapt |
| Hermes Agent | Public docs/repo describe memory, skills, cron, subagents, MCP, messaging gateways, command approval, and multiple terminal backends including local/Docker/SSH/Modal/Daytona. | Use as behavior reference for memory/skills/cron/subagents. Keep Mainspring TypeScript-native and RunLog-bound. | Adapt |
| Claude Code | Official docs expose allow/ask/deny permissions and controlled-environment guidance. | Permission UX should be explicit, inspectable, and independent from backend protection claims. | Adopt |
| Codex CLI / Codex | Official docs distinguish execution-environment controls from approval policy. | Keep Mainspring's security-truth split: backend capability truth plus approval decisions. | Adopt |
| opencode | Docs expose ask/allow/deny permissions and auto mode where explicit denies still apply. | Advisory/auto paths must stay below hard blocks. | Adapt |
| Pi / Inflection | Public product is personal AI rather than a tool-running developer harness; privacy policy and app listings show user data handling is a core trust issue. | Personal-agent memory needs explicit retention and provenance language. | Adapt |
| Cursor | Public guidance emphasizes verifiable goals, tests, context management, and review. | Mainspring examples and release gates should be first-class product surface. | Adopt |
| Aider | Docs describe repo-map context; public docs describe architect mode as planning then editing. | Add cheap context summaries before sending full workspace content; do not make context loading eager. | Adapt |
| OpenHands | Repo and papers describe agent environments with filesystem, terminal, web/browser, and event/log state. Recent project writing notes EventStream complexity. | Keep workspace/browser/shell power, but avoid overcomplicated event buses; RunLog ordering should stay simple. | Adapt |
| Devin | Public materials describe cloud agents with shell/editor/browser in separate compute environments. | Do not claim this level locally. Treat cloud compute separation as future adapter work. | Defer |
| GitHub Copilot Agent / Agent HQ | GitHub docs describe branch-based cloud agent work, reviewable diffs, PR/session logs, and human PR controls. | Agent-authored changes should stay reviewable and tied to logs. | Adopt |
| Jules | Google docs describe asynchronous GitHub-integrated coding tasks and public beta/experimental status. | Async background work should be explicit, auditable, and marked experimental until proven. | Adapt |
| Goose | Docs describe on-machine agent, CLI/API/desktop, MCP extensions, and access controls. | MCP/tool extension power must pass through ToolRegistry and deny/approval policy. | Adapt |

## 3. Threat Model

Mainspring's threat model is local-first personal agents with shell/file/network/browser/tool access. The primary adversaries are prompt injection, untrusted web/file/email content, malicious or overbroad skills/templates, tool bridge bypasses, credential leakage, unsafe headless cron, and accidental destructive host commands. Current defenses are scoped approval receipts, RuntimePolicyGuard decisions, hardline blocks, workspace path checks, secret redaction, local provenance scanning, and release-time security truth checks.

Mainspring does not currently claim hostile multi-tenant protection, hardened browser containment, or hosted cloud compute separation.

## 4. OpenClaw Right/Wrong

Right:

- Treat local automation as a real agent capability surface.
- Make shell/files/browser/channel operations first-class enough to test.
- Preserve operator experience instead of hiding tool state.

Wrong to copy:

- Any default that lets host execution proceed without a durable policy decision.
- Any plugin/skill path that can mutate future behavior without review.
- Any channel/subagent path that expands authority without parent-bound policy.

Current Mainspring response:

- `src/security/agent-security-regression.test.ts` and `docs/security-redteam-matrix.md` map the main failure classes.
- Remaining gaps are explicitly tracked for cross-agent spoofing, subagent attenuation, and browser-adapter private-network enforcement.

## 5. Hermes Right/Wrong

Right:

- Memory and skills as durable behavior layers.
- Cron as ordinary scheduled agent work.
- Subagents as a natural decomposition model.
- Multiple execution backends and messaging gateways as observable behavior targets.

Wrong to copy:

- A large Python-centered internal architecture.
- Self-writing skills that automatically become active behavior.
- Approval modes where model or heuristic authority can outrank hard policy.
- Always-on gateway/runtime sprawl for every deployment.

Current Mainspring response:

- Memory and skill writes are approval-gated and provenance-scanned.
- Cron rows and RunLog-configured gateway schedules use ordinary RunLog runs and scoped grants.
- Subagents remain incomplete and should become child RunLog runs, not resident subprocesses.

## 6. Claude Code / Codex Lessons

Adopt:

- Explicit permission modes and durable approvals.
- Repo-local instructions as context, not policy.
- Patch/diff/review-friendly workflows.
- Easy verifier commands and status evidence.
- Clear separation between backend execution limits and approval policy.

Avoid:

- Vague "safe" or "secure" wording.
- Hiding permission-mode changes inside unreviewed prompt/context mutation.
- Treating approval prompts as durable authority without scoped receipts.

Current Mainspring response:

- `pnpm security:truth`, `pnpm verify`, and `pnpm release:check` guard claim drift.
- RunLog approval receipts bind request snapshots and fail closed on mutation/replay.

## 7. What Mainspring Must Not Copy

- Default-open shell execution.
- Hosted marketplace trust before local provenance and trust metadata.
- Full cloud/Kubernetes compute-control claims without adapters and tests.
- Resident agents as the default scale model.
- Event-bus complexity that makes order and replay ambiguous.
- Background cron that bypasses approvals.
- Subagents with more authority than parents.
- Browser automation described as a boundary.

## 8. Codebase-Grounded Gap Analysis

| Gap | Current evidence | Next action |
| --- | --- | --- |
| Research/review artifacts | Backlog marks `docs/research` and `docs/reviews` pending. | This document plus review artifacts close the documentation artifact gap. |
| RuntimeKernel/mailbox retirement | `docs/migration-runlog.md` says legacy path remains compatibility; `src/runner/main.ts`, `src/sdk/Mainspring.ts`, and gateway tests still import it. | Keep compatibility; plan removal only after gateway/SDK behavior is RunLog-backed. |
| Non-tool host side-effect policy | Backlog tracks channel sends/provider config/artifact publish/future subagents as pending DecisionRecord adapters. | Add one adapter slice at a time with tests. |
| Taint labels | Security matrix says taint beyond scan findings remains incomplete. | Add taint metadata for web/email/file-derived memory/skill writes. |
| Browser lease/artifact traces | Current docs mark browser lease adapter and trace artifacts incomplete. | Implement lazy browser lease artifact slice before claiming browser trace coverage. |
| Subagents | Data model hints exist, helper API incomplete. | Implement child RunLog runs with parent authority attenuation. |
| Final release audit | `release:check` passes, but final report cannot claim full completion until all required artifacts exist. | Continue completion audit after research/reviews land. |

## 9. Implementation Backlog Mapping

Immediate:

- Add review artifacts under `docs/reviews`.
- Mark research/review artifact task complete only after docs exist and `docs:check` / `security:truth` pass.
- Keep all research/review docs repo-local unless the public docs index intentionally expands.

Next:

- Taint labels for memory/skill mutations.
- RuntimePolicyGuard adapters for non-tool host surfaces.
- Child RunLog runs for subagents.
- Browser lease/artifact/trace hardening.
- Legacy mailbox/RuntimeKernel retirement only after SDK/gateway compatibility coverage moves.

Deferred/rejected:

- Hosted payment flows, remote marketplace trust, cloud compute pools, production Kubernetes, operator permission tiers, and hosted multi-tenancy.

## 10. Bibliography

- Hermes Agent docs and repository: https://hermes-agent.nousresearch.com/docs/ and https://github.com/NousResearch/hermes-agent
- Hermes AGENTS.md: https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md
- OpenHands repository and architecture references: https://github.com/OpenHands/openhands
- OpenHands v1 architecture note: https://openhands.dev/blog/the-path-to-openhands-v1
- Aider repository map docs: https://aider.chat/docs/repomap.html
- Aider modes docs: https://aider.chat/docs/usage/modes.html
- Goose repository/docs: https://github.com/aaif-goose/goose and https://goose-docs.ai/docs/getting-started/using-extensions/
- Claude Code permissions and environment-control docs.
- Codex CLI reference and environment-control docs.
- opencode permissions/docs: https://opencode.ai/docs/permissions/ and https://opencode.ai/docs/agents/
- GitHub Copilot cloud agent docs: https://docs.github.com/copilot/concepts/agents/cloud-agent/about-cloud-agent
- Jules docs: https://jules.google/docs/
- Devin public capability description: https://cognition.com/blog/introducing-devin
- Inflection Pi privacy/product references: https://hey.pi.ai/ and https://inflection.ai/privacy-policy
- Temporal durable execution docs: https://docs.temporal.io/evaluate/understanding-temporal
- LangGraph persistence docs: https://docs.langchain.com/oss/python/langgraph/persistence
- OpenAI Agents SDK tracing/guardrails docs: https://openai.github.io/openai-agents-python/tracing/ and https://openai.github.io/openai-agents-python/guardrails/
- BullMQ docs: https://docs.bullmq.io/
