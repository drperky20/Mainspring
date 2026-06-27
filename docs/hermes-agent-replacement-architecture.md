# Hermes-Inspired Mainspring Replacement Architecture

Last updated: 2026-06-27.

This document defines the replacement direction for a lightweight TypeScript-native Mainspring harness. The existing runtime is usable scaffolding, not a preservation constraint.

## Target Shape

```text
SDK or local harness
-> run/session store
-> AgentRunLoop
-> provider client
-> tool router
-> policy and guardrail controller
-> result classifier and transcript projector
-> compact context/memory store
-> event/read-model adapters
```

The long-term goal is one coherent agent harness. Old mailbox/kernel pieces can be merged or removed once the replacement path owns the same behavior with tests.

## Core Modules

| Module | Responsibility | Status |
| --- | --- | --- |
| `src/agent/TurnLifecycle.ts` | Turn context, retry state, iteration budget, provider-event projection, tool-result classification, finalization | Implemented first slice |
| `src/agent/AgentRunLoop.ts` | Provider query loop independent of `RuntimeKernel`; bounded events, cancellation, retry summary, and targeted provider-tool hooks | First slice plus unified provider-query runtime lanes |
| `src/providers/*` | Provider-specific HTTP shape, env credential refs, usage parsing, safe error messages | Existing OpenRouter path kept and merged |
| `src/tools/*` | Consolidated tool bundles; file, shell, browser, web, memory, skill surfaces | Existing, to be widened/replaced |
| `src/policy/*` | Approvals plus Hermes-style guardrail/failure history | Existing, to be merged |
| `src/events/*` | Runtime/read-model event normalization and projection | Existing, to be merged with agent projector |
| `src/gateway/GatewayRouteContext.ts` | Hermes-gateway-inspired local route context over session/workspace/agent/provider/run metadata | Implemented gateway slice |
| Future `src/agent/ContextBudget.ts` | Context pack budget, compression decisions, protected windows | Not implemented |
| Future `src/agent/UsageAccounting.ts` | Normalized provider/tool usage and price estimates | Not implemented |
| Future `src/agent/WorkspaceContext.ts` | Coding/file context, workspace hints, path safety signals | Not implemented |

## First Slice Design

The first replacement slice ports the Hermes narrow-waist turn concepts:

- `TurnContext` sanitizes per-turn text and records stable flags/metrics.
- `IterationBudget` bounds provider/tool cycles.
- `TurnRetryState` records sanitized failures and retry decisions.
- `projectProviderEvent()` maps provider events into deterministic canonical turn events.
- `classifyToolResult()` recognizes completed, failed, blocked, artifact, and file-mutation results.
- `finalizeTurn()` summarizes terminal state.

This slice is deliberately independent from the old mailbox and `RuntimeKernel` so it can become the new center rather than another wrapper.

## Provider Path

OpenRouter remains the first live provider:

- Provider ID: `openrouter`
- Model: `openrouter/free`
- Credential ref: `env:OPENROUTER_API_KEY`
- Local dev config: `.env.local`

Provider keys must be loaded from environment-backed config only. They must not be stored in renderer `localStorage`, docs, event traces, or final reports.

## Tool Strategy

Do not mirror Hermes tools file-for-file. Consolidate by behavior:

- `browser.*`: keep current lightweight adapter bundle and add supervisor/session behavior only when needed.
- `file/workspace.*`: replace tiny file tools with capped reads, safe writes, patch support, and file state summaries.
- `terminal.*`: replace one-shot shell with terminal/session read tools while preserving the truth that host processes are not sandboxed.
- `web.*`: merge URL safety and policy checks.
- `memory/session.*`: replace prototype memory with context-store-backed recall.
- Media, integrations, cron, marketplace, and cloud-heavy surfaces are omitted until product requirements justify them.

## Gateway Strategy

Hermes gateway is a useful architecture reference, but its platform breadth is not the Mainspring baseline.

- Port session/context seams into local control records.
- Port stream/dispatch/consumer separation into read-model and event adapters.
- Port channel/route identity as stable local route keys.
- Keep provider dispatch environment-backed and metadata-routed.
- Omit messaging platform adapters until Mainspring has a real product need.

Current first slice: `GatewayRouteContext` turns `LocalGatewaySnapshot` into a sanitized local routing context with session, workspace, agent, provider, model, and latest-run state.

## Migration Plan

1. Land `src/agent` turn/run-loop primitives with tests.
2. Prove OpenRouter can run through the new loop using env-backed local config.
3. Route one simple SDK/local harness path through `AgentRunLoop`.
   Current progress: completed for the full provider-query pump inside `RuntimeKernel`, including managed tools, warning-only tool events, and legacy-compatible no-runtime-tools event persistence.
4. Keep expanding Hermes gateway seams into local route/context/read-model helpers without platform clones.
5. Pull the remaining pre-provider single-tool shortcut decision path behind the same agent/tool controller so `RuntimeKernel` stops owning special-case tool entrypoints.
6. Replace file/workspace and terminal tools.
7. Add context/memory budget primitives.
8. Merge or delete old `RuntimeKernel` paths when equivalent transcript, approval, cancellation, and event behavior is covered.

## Current Keep/Replace Rules

- Keep current code when it is a good TypeScript implementation of a Hermes concept.
- Merge current code when it has useful tests or public contracts but belongs behind a new interface.
- Replace current code when it mixes unrelated responsibilities or cannot support the target loop cleanly.
- Delete current code only after the replacement path has tests and no active callers.

## Non-Goals For This Milestone

- No Electron app.
- No HyperCell, VM, WSL, Windows Sandbox, or secure containment claim.
- No secure desktop secret store.
- No billing ledger or budget caps.
- No marketplace, cron engine, provider-auth UI, or fake cloud deployment.
- No renderer-localStorage provider key storage.
