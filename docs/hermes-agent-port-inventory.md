# Hermes Agent Port Inventory

Last updated: 2026-06-27.

This inventory maps Hermes Agent ideas into a TypeScript-native Mainspring replacement plan. It is not a promise to clone Hermes file-for-file. The current Mainspring runtime is replaceable; each existing module is classified by whether it should be kept, merged, replaced, or deleted after equivalent tested replacement paths exist.

## Hermes Source Areas

| Hermes area | Representative files | Useful ideas to port | Mainspring target | Decision |
| --- | --- | --- | --- | --- |
| Turn loop | `conversation_loop.py`, `turn_context.py`, `turn_finalizer.py`, `turn_retry_state.py`, `iteration_budget.py`, `trajectory.py` | Turn bundle, bounded iteration budget, retry state, finalization summary, deterministic turn projection | `src/agent/*`, then replacement for `src/runner/RuntimeKernel.ts` | Port first |
| Tool execution | `tool_executor.py`, `tool_dispatch_helpers.py`, `tool_guardrails.py`, `tool_result_classification.py`, `agent_runtime_helpers.py` | Single dispatcher, argument normalization, guardrail controller, result classification, blocked synthetic result | `src/tools/*`, `src/policy/*`, `src/agent/*` | Merge and replace |
| Context and compression | `context_engine.py`, `context_compressor.py`, `conversation_compression.py`, `context_references.py`, `coding_context.py` | Context pack, budget decisions, protected recent turns, compact summaries, workspace hints | New `src/agent/Context*` and `src/agent/WorkspaceContext*` | Port next |
| Provider harness | `chat_completion_helpers.py`, `codex_responses_adapter.py`, `anthropic_adapter.py`, `gemini_*`, `bedrock_adapter.py` | Provider-normalized error handling, retry/fallback, usage extraction, tool-call loop isolation | `src/providers/*` and new provider policy helpers | Merge selectively |
| Transport/session bridge | `codex_runtime.py`, `transports/*` | Event projector, approval bridge, session adapter, replay-safe history | `src/events/*`, `src/sdk/*`, future replacement store | Adapt only |
| Memory/session | `memory_manager.py`, `memory_provider.py`, `context_engine.py` | Non-blocking memory fan-out, session recall, serialized background writes | Current `src/tools/MemoryTool.ts` then new store-backed memory layer | Replace prototype |
| Credentials/secrets | `credential_*`, `secret_scope.py`, `redact.py`, `message_sanitization.py` | Env/managed secret references, scoped disclosure, redaction before logs/events | `src/protocol`, `src/providers`, future desktop secret adapter | Keep principle, replace storage later |
| Usage/pricing | `usage_pricing.py`, `account_usage.py`, `credits_tracker.py`, `rate_limit_tracker.py` | Normalized usage records, pricing estimates, rate-limit notes | New `src/agent/UsageAccounting.ts` | Port after loop |
| Coding workspace | `coding_context.py`, `file_safety.py`, `runtime_cwd.py`, `shell_hooks.py`, `subdirectory_hints.py` | Workspace root context, safe path intent, shell-output hints, subdir locality | `src/tools/FileTools.ts`, `src/tools/ShellTool.ts`, new workspace context | Merge |
| Registries and media | `browser_registry.py`, `web_search_registry.py`, `image_gen_*`, `video_gen_*`, `tts_*`, `transcription_*` | Provider registry shape for optional edge capabilities | `src/providers/ProviderRegistry.ts`, future optional plugin registries | Omit for now except browser/web |
| Skills/plugins | `skill_*`, `plugin_llm.py`, `curator.py` | Skill provenance, guarded install/update, compact skill command shape | `src/skills/*`, `src/tools/SkillTools.ts` | Merge later |
| Local/control gateway | `gateway/session.py`, `gateway/session_context.py`, `gateway/stream_events.py`, `gateway/stream_dispatch.py`, `gateway/stream_consumer.py`, `gateway/platform_registry.py`, `gateway/channel_directory.py`, `gateway/relay/*`, `gateway/authz_mixin.py` | Session source/context, route keys, channel/platform registry, event stream fan-out, delivery/consumer separation, relay auth descriptor shape | `src/gateway/*`, `src/events/*`, future local harness API | Port selectively |

## Hermes Tools Folder

| Hermes tools group | Representative files | Current Mainspring equivalent | Decision |
| --- | --- | --- | --- |
| Registry, approval, schema, result storage | `approval.py`, `registry.py`, `schema_sanitizer.py`, `tool_output_limits.py`, `tool_result_storage.py`, `tool_backend_helpers.py`, `slash_confirm.py` | `src/tools/ToolRegistry.ts`, `src/policy/*`, `src/agent/TurnLifecycle.ts` | Merge/replace. Fold approval, schema validation, output budgets, and result spillover into one TS registry/policy/result layer. |
| Browser automation | `browser_tool.py`, `browser_supervisor.py`, `browser_cdp_tool.py`, `browser_dialog_tool.py`, `browser_camofox.py` | `src/tools/BrowserTool.ts` | Merge. Keep compact adapter API; add supervisor/session behavior later if needed. |
| File/workspace tools | `file_tools.py`, `file_operations.py`, `file_state.py`, `patch_parser.py`, `path_security.py` | `src/tools/FileTools.ts` | Replace with richer consolidated workspace bundle. |
| Terminal/process tools | `terminal_tool.py`, `read_terminal_tool.py`, `code_execution_tool.py`, `process_registry.py` | `src/tools/ShellTool.ts` | Replace shell-only surface with session/process-aware local tools; do not claim sandboxing. |
| Web/search tools | `web_tools.py`, `x_search_tool.py`, `url_safety.py`, `website_policy.py` | `src/tools/WebTools.ts` | Merge URL safety and policy ideas into current lightweight web bundle. |
| Memory/session search | `memory_tool.py`, `session_search_tool.py`, `thread_context.py` | `src/tools/MemoryTool.ts` | Replace prototype file-backed memory with session/context store. |
| Delegation/orchestration | `delegate_tool.py`, `async_delegation.py`, `mixture_of_agents_tool.py`, `send_message_tool.py` | None in runtime package | Omit for now; host/subagent orchestration is outside first replacement slice. |
| Approvals/security | `approval.py`, `write_approval.py`, `tirith_security.py`, `threat_patterns.py`, `skills_guard.py` | `src/policy/*` | Merge into a real guardrail controller after turn loop. |
| MCP/managed tools | `mcp_tool.py`, `managed_tool_gateway.py`, `mcp_oauth*` | None | Defer; avoid fake marketplace/auth surfaces. |
| Skills | `skills_tool.py`, `skills_hub.py`, `skill_manager_tool.py`, `skills_sync.py` | `src/skills/SkillRegistry.ts`, `src/tools/SkillTools.ts` | Merge only provenance and guarded install/update. |
| Media/voice | `image_generation_tool.py`, `video_generation_tool.py`, `vision_tools.py`, `tts_tool.py`, `transcription_tools.py`, `voice_mode.py` | None | Omit until product requires media tools. |
| Cron/todo/kanban | `cronjob_tools.py`, `todo_tool.py`, `kanban_tools.py` | None | Omit for this milestone; no fake scheduler. |
| Integrations | `discord_tool.py`, `homeassistant_tool.py`, `feishu_*`, `microsoft_graph_*`, `yuanbao_tools.py` | None | Omit. |

## Tool Port Order

1. `ToolRegistry.ts` plus approval/schema/result-budget behavior.
2. `ShellTool.ts` plus `FileTools.ts` as one host-exec/workspace utility bundle.
3. `BrowserTool.ts` plus `WebTools.ts` behind one URL/policy layer.
4. `MemoryTool.ts`, `SkillTools.ts`, and `MainspringTools.ts` as durable local state, guarded skill persistence, and native diagnostics/event tail.

Scope traps to omit from the lightweight baseline:

- connector-specific messaging and media stacks
- cloud browser vendor fan-out
- MCP OAuth hub sync
- todo/kanban/cron surfaces
- delegation tools inside the runtime core
- any tool that exists mostly for Hermes UI/product affordances rather than Mainspring's local harness

## Current Mainspring Module Classification

| Current module | Classification | Rationale |
| --- | --- | --- |
| `src/agent/TurnLifecycle.ts` | keep | New Hermes-inspired turn primitives added for the replacement path. |
| `src/runner/RuntimeKernel.ts` | replace | Works today, but mixes mailbox polling, provider loop, tool dispatch, policy, and event writing. Supersede with `src/agent` loop slices before deleting. |
| `src/runtime/RuntimeEngine.ts` | merge | Useful supervisor shell, but should delegate to the new agent loop/store once ready. |
| `src/runner/SessionRuntimeSupervisor.ts` | merge | Keep session-level lifecycle idea, simplify around new harness. |
| `src/runner/PollLoop.ts` | delete eventually | Thin compatibility wrapper around old kernel. |
| `src/providers/*` | merge | OpenRouter path is useful and already env-ref based; add Hermes-style error/retry/fallback helpers without broad provider bloat. |
| `src/tools/ToolRegistry.ts` | replace or merge | Current single dispatcher is valuable; needs Hermes-style guardrails, result classification, and richer routing. |
| `src/tools/BrowserTool.ts` | keep and merge | Recent consolidated browser bundle is a good lightweight start. |
| `src/tools/FileTools.ts` | replace | Too small for Hermes-level workspace behavior; port safe path, patch, file state, and capped read/write behavior. |
| `src/tools/ShellTool.ts` | replace | Host shell execution exists but is not a session/process harness and is not sandboxed. |
| `src/tools/WebTools.ts` | merge | Useful lightweight web/search bundle; add URL safety and policy checks. |
| `src/tools/MemoryTool.ts` | replace | Prototype file-backed memory should become session/context-store-backed memory. |
| `src/tools/SkillTools.ts`, `src/skills/*` | merge | Keep manifest validation; add provenance and guard checks later. |
| `src/policy/*` | merge | Approval receipts and policy guard are useful; add guardrail controller and failure history. |
| `src/events/*` | merge | Keep normalizers, add deterministic provider/tool projector from `src/agent`. |
| `src/mailbox/*`, `src/storage/*` | merge or replace later | Durable journal is useful, but schema can be replaced if the new run transcript store is clearer. |
| `src/gateway/*` | keep as product boundary | In-process read model is separate from agent harness; do not let it become a fake desktop gateway. |
| `src/gateway/GatewayRouteContext.ts` | keep | New Hermes-gateway-inspired local route context that distills session, workspace, agent, provider, and run metadata without platform connector bloat. |
| `apps/console/*` | keep as prototype UI only | Not part of first harness replacement; do not store provider keys in renderer localStorage. |

## First Large Replacement Slice

The first implementation slice is the agent loop/run-state layer:

- `TurnContext`
- `IterationBudget`
- `TurnRetryState`
- provider-event projection
- tool-result classification
- turn finalization summary
- a small `AgentRunLoop` that can run an `AgentProvider` query without depending on `RuntimeKernel`
- OpenRouter `openrouter/free` E2E through environment-backed config
- Hermes gateway-inspired route context from `LocalGatewaySnapshot`

This does not delete `RuntimeKernel` yet. It creates a tested replacement path that future milestones can wire into storage, tools, approvals, and SDK dispatch.

## Gateway Port Notes

Hermes gateway is mostly broad platform glue. Mainspring should port the seams, not the platform integrations:

- Keep: session route identity, current-session context, stream event categories, dispatch/consumer separation, relay descriptor ideas, local authorization boundary shape.
- Merge: app-state records, snapshot/read-model adapters, event projection, route context.
- Omit now: Telegram/Slack/WhatsApp/Feishu/QQ/WeCom/Matrix/email platform adapters, media-specific delivery, sticker caches, kanban watchers, restart forensics.
- First TS port: `src/gateway/GatewayRouteContext.ts` builds a sanitized local route context from `LocalGatewaySnapshot`, replacing Hermes' messaging-platform session context with a local-first Mainspring control context.

## Security Notes

- The local OpenRouter key must stay in environment-backed dev config and must not be copied into source, docs, traces, renderer localStorage, or final reports.
- Host shell tools are process execution only, not sandboxing.
- Browser tools remain adapter-trusted until a real isolated backend exists.
- Budget caps, secure desktop secrets, operator roles, HyperCells, VM isolation, billing, marketplace, cron, and deployment remain unimplemented.
