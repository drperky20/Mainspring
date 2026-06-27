# Hermes Agent Harness TypeScript Port Goal

Last updated: 2026-06-27.

This is the durable goal prompt for porting the useful architecture and agentic harness ideas from:

```text
C:\Users\drper\Downloads\hermes-agent-2026.6.19\hermes-agent-2026.6.19\agent
```

into Mainspring as a copied-in-spirit, lightweight, TypeScript-native implementation.

Gateway update: also treat the Hermes gateway folder as a first-class reference:

```text
C:\Users\drper\Downloads\hermes-agent-2026.6.19\hermes-agent-2026.6.19\gateway
```

Important update: the current Mainspring runtime is not sacred. The user has explicitly allowed replacing the existing Mainspring version instead of preserving it. Treat the current repo as evidence and salvageable material, not as a preservation target.

## Goal Prompt

Work in `E:\Mainspring`. Use the current Mainspring repository as the source of truth for what exists today, but do not preserve its architecture for its own sake. Use the Hermes `agent` folder as the primary architecture reference and build a lightweight TypeScript-native version of the useful agentic harness ideas.

Run for as long as needed across milestones. Use `gpt-5.4-mini` high-thinking subagents for broad audits, implementation slices, and verification when useful. Keep the work token-dense and cheap: summarize findings compactly, avoid verbose planning artifacts, and encode decisions into small durable docs and tests.

The target is not to paste or mechanically translate every Hermes file. The target is to replace Mainspring's current thin harness with a Mainspring-owned TypeScript harness with comparable practical complexity: context management, turn lifecycle, provider adapters, retry/fallback policy, tool dispatch, tool result handling, guardrails, memory/context providers, usage/pricing accounting, streaming/event projection, and coding-context helpers.

## Replacement Directive

The old preserve-the-runtime-spine constraint is removed for this goal. Future milestones may replace, collapse, rename, or rebuild these current pieces when the Hermes-informed TypeScript architecture makes that the better path:

- `SDK/control host`
- per-session SQLite mailbox
- `SessionRuntimeSupervisor`
- `RuntimeKernel`
- `AgentProvider.query`
- `ToolRegistry`
- `RuntimePolicyGuard` / `ApprovalReceipt`
- `events_out`
- SDK/control event projection

Do not keep any of those pieces merely because earlier docs said to preserve them. Keep a piece only if it remains the best TypeScript implementation after auditing Hermes and the current repo.

Replacement still needs discipline:

- Replace intentionally, with small verified slices.
- Document what old piece was removed or superseded.
- Preserve useful tests when they still describe desired behavior.
- Rewrite or delete stale tests/docs instead of making compatibility shims forever.
- Do not leave duplicate runtime paths unless a milestone explicitly needs a temporary bridge.
- Avoid fake product surfaces. If a capability is not implemented, say so.

## Security Truth

- Host process execution is not a sandbox unless a real sandbox is implemented and tested.
- Process execution must not be marketed as secure containment.
- Browser execution is adapter-trusted unless a real isolation backend is implemented and tested.
- Browser/localStorage provider auth is prototype-only until replaced with real secure storage.
- Provider keys and durable auth state must not be stored in renderer `localStorage`.
- Do not claim HyperCells, VM isolation, operator roles, budget caps, critical policy classes, secure desktop secrets, or provider auth managers exist unless current code implements and tests them.

## Hermes Agent Areas To Study

Audit all files under the Hermes `agent` folder, but group them by concept instead of copying file-for-file:

- Turn lifecycle:
  - `conversation_loop.py`
  - `turn_context.py`
  - `turn_finalizer.py`
  - `turn_retry_state.py`
  - `iteration_budget.py`
  - `trajectory.py`
- Context and compression:
  - `context_engine.py`
  - `context_compressor.py`
  - `conversation_compression.py`
  - `context_references.py`
  - `coding_context.py`
  - `subdirectory_hints.py`
- Provider and transport harness:
  - `codex_runtime.py`
  - `codex_responses_adapter.py`
  - `chat_completion_helpers.py`
  - `anthropic_adapter.py`
  - `gemini_*`
  - `bedrock_adapter.py`
  - `transports/*`
- Tool harness:
  - `tool_executor.py`
  - `tool_guardrails.py`
  - `tool_dispatch_helpers.py`
  - `tool_result_classification.py`
  - `agent_runtime_helpers.py`
- Credentials and secrets:
  - `credential_*`
  - `secret_scope.py`
  - `secret_sources/*`
  - `redact.py`
  - `message_sanitization.py`
- Usage, pricing, rate limits:
  - `usage_pricing.py`
  - `account_usage.py`
  - `credits_tracker.py`
  - `rate_limit_tracker.py`
  - `nous_rate_guard.py`
- Registries and providers:
  - `browser_registry.py`
  - `memory_provider.py`
  - `memory_manager.py`
  - `image_gen_*`
  - `video_gen_*`
  - `tts_*`
  - `transcription_*`
  - `web_search_*`
- Prompt/system/harness helpers:
  - `prompt_builder.py`
  - `system_prompt.py`
  - `prompt_caching.py`
  - `model_metadata.py`
  - `models_dev.py`
  - `message_content.py`
  - `think_scrubber.py`
  - `title_generator.py`
- Coding and workspace intelligence:
  - `lsp/*`
  - `file_safety.py`
  - `runtime_cwd.py`
  - `shell_hooks.py`
  - `background_review.py`
- Skills/plugins:
  - `skill_*`
  - `plugin_llm.py`
  - `curator.py`
  - `curator_backup.py`
- Local/control gateway:
  - `gateway/session.py`
  - `gateway/session_context.py`
  - `gateway/stream_events.py`
  - `gateway/stream_dispatch.py`
  - `gateway/stream_consumer.py`
  - `gateway/platform_registry.py`
  - `gateway/channel_directory.py`
  - `gateway/authz_mixin.py`
  - `gateway/relay/*`

## Porting Rules

- Prefer TypeScript modules under clean ownership boundaries. Existing folders can be reused, renamed, or replaced:
  - `src/runner`
  - `src/providers`
  - `src/tools`
  - `src/policy`
  - `src/events`
  - `src/gateway`
  - `src/protocol`
- Add a new abstraction when it removes real duplication, matches a durable Hermes concept, or replaces a weak current Mainspring abstraction.
- Keep implementations small, composable, and testable.
- Favor typed records, discriminated unions, and Zod schemas over ad hoc string handling.
- Keep provider-specific behavior inside provider/client modules or a replacement transport/provider layer.
- Keep tool execution behind a single coherent dispatcher. It may be the current `ToolRegistry`, a rewritten registry, or a Hermes-inspired replacement.
- Keep policy and approval decisions centralized. They may be the current `RuntimePolicyGuard` / `ApprovalReceipt`, a rewritten policy layer, or a Hermes-inspired replacement.
- Keep persistent runtime state in one coherent journal/store. It may replace the current mailbox/event surfaces if the new architecture is clearer and migration/test coverage exists.
- Omit Hermes surfaces that are irrelevant to current Mainspring, product-specific, provider-specific without current use, or too heavy for the current milestone.

## Initial Milestone Order

1. Inventory and map Hermes `agent` architecture to current Mainspring modules, marking each current Mainspring module as keep, replace, merge, or delete.
   Output: `docs/hermes-agent-port-inventory.md`.

2. Design the replacement TypeScript agent harness architecture.
   Output: `docs/hermes-agent-replacement-architecture.md`.

3. Add a TypeScript turn lifecycle model that can supersede current `RuntimeKernel` behavior.
   Ideas: turn context record, retry state, termination reason, finalization summary, tool/result accounting.

4. Add lightweight tool result classification and storage policy.
   Ideas: classify large, error, artifact-like, multimodal, persisted, or redacted results without bypassing `ToolRegistry`.

5. Add context budget and compression planning primitives.
   Ideas: rough token estimates, threshold policy, protected head/tail windows, compression decision objects. Do not invent fake LLM summarization unless wired and tested.

6. Add provider retry/fallback policy helpers.
   Ideas: structured provider error classification, retryable vs terminal errors, empty-response handling, bounded retry counters.

7. Add coding-context helpers.
   Ideas: workspace hints, file safety context, subdirectory hints, and LSP-inspired interfaces where TypeScript support is practical.

8. Add usage/pricing accounting primitives.
   Ideas: normalized usage records and estimated cost, but do not claim billing ledger or budget caps until implemented.

9. Expand provider and registry surfaces selectively.
   Ideas: media/search registries only if they fit current product direction and tests.

10. Delete or retire superseded current-runtime code once replacement paths are tested.
    Avoid long-lived compatibility layers.

## Acceptance Criteria For Each Milestone

Each milestone must include:

- A clear statement of which Hermes ideas were ported.
- A clear statement of which Hermes ideas were omitted and why.
- A clear statement of which current Mainspring pieces were kept, replaced, merged, or deleted.
- Focused TypeScript tests.
- `pnpm typecheck`.
- `pnpm test`.
- `pnpm verify` when feasible.
- Updates to `docs/current-state.md` and `docs/goal-digest.md`.
- No claims that unimplemented security/product features exist.

## Subagent Use

Use `gpt-5.4-mini` high-thinking subagents where they materially help:

- One subagent can inventory Hermes source areas.
- One subagent can map Mainspring fit and conflicts.
- One subagent can review security/trust-boundary claims.
- One subagent can verify tests and docs after a milestone.

Subagents should produce compact, actionable artifacts. They should not duplicate implementation on the same files unless explicitly assigned disjoint ownership.

## Completion Definition

This goal is complete only when Mainspring has a coherent, tested, TypeScript-native agent harness that incorporates the useful Hermes `agent` architecture ideas and no longer depends on weak current-runtime scaffolding unless that scaffolding was intentionally kept after audit.

Completion does not require one-to-one parity with Hermes. It does require that every major Hermes architecture area above has been explicitly ported, mapped to an existing Mainspring equivalent, or intentionally omitted with a documented reason.
