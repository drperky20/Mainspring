# Current State

Last audited: 2026-06-27.

This document records the repository as it exists today. The long-term product brief points Mainspring toward a local-first desktop operating system for agent businesses, but this checkout is currently a runtime package plus a prototype console. Treat the current code as source of truth.

## What Exists Now

- A publishable TypeScript package named `mainspring`.
- Public exports for the SDK, protocol, control contracts, runtime kernel, mailbox, providers, tools, policy guard, and approval receipts.
- Per-session SQLite mailbox stores under the runtime seam:
  - `messages_in`
  - `messages_out`
  - `events_out`
  - `heartbeat`
  - per-session mailbox paths
- `SessionRuntimeSupervisor` discovery for session mailboxes.
- `RuntimeKernel` execution through `AgentProvider.query`, `ToolRegistry`, `RuntimePolicyGuard`, `ApprovalReceipt`, tools, and `events_out`.
- SDK storage in `src/storage/sqlite/SqliteMainspringStorage.ts` for sessions, run dispatch, approval responses, event reads, and artifact-root bookkeeping.
- SDK-managed sessions store a `workspaceRoot`, create that directory, and route runtime provider queries and tool execution through that per-session root.
- SDK run dispatch carries `providerId`, `modelId`, `runtimeProfile`, and `computerId` fields through the per-session mailbox.
- `RuntimeKernel` resolves requested providers through the configured provider registry/resolver and passes selected provider/model metadata into `AgentProvider.query`.
- Runtime profile derivation is centralized for SDK dispatch so `allowBrowser` and `allowMemory` produce coherent `core`, `core-browser`, or `core-browser-memory` profiles unless an explicit profile is supplied.
- Provider abstractions and OpenRouter/OpenAI-compatible provider clients.
- Provider usage contracts can now preserve optional `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, and parsed provider `rateLimit` detail when providers return those buckets.
- Direct OpenAI-compatible and OpenRouter provider init events now report the resolved model ID actually used, even when the caller relied on the client default.
- Direct OpenAI-compatible and OpenRouter provider init events can now also attach a narrow `modelFamily` hint when the resolved model slug clearly maps to an obvious family such as `gpt-5`, `gpt-4.1`, or `claude`.
- Direct OpenAI-compatible and OpenRouter provider init events can now also attach a narrow `providerTransport` hint so downstream runtime/control layers can tell whether the turn came through `openai-responses`, `openai-responses-codex-proxy`, or `openrouter-chat-completions`.
- Provider-init metadata that `RuntimeKernel` records on its native debug log rows now survives SDK normalization and control-event bridging as sanitized nested log payload detail instead of being dropped before `RunEvent` or `TurnEvent` consumers can see it.
- Runtime-kernel integration tests now prove that a live provider init event carrying provider/model/transport metadata persists that sanitized detail into native `events_out` log rows before later projection.
- The public runtime contract now explicitly exports payload types for `usage.updated`, `runtime.warning`, `runtime.error`, and other current `RunEvent` variants, so the provider-init warning path is documented in TypeScript even though the outer SDK event container remains the existing generic `RunEvent`.
- The public runtime contract now also exports one canonical `providerInitWarningDetailFromRunEvent()` helper plus `ProviderInitWarningDetail`, so downstream SDK/gateway consumers share one supported parser for sanitized provider-init warning detail instead of duplicating local casts.
- The runtime/control contract now also exports one generic `providerInitDetailFromLogPayload()` parser plus `providerInitLogDetailFromTurnEvent()`, so control-channel consumers can reuse the same provider-init parsing rule on bridged `TurnEvent` log rows without inventing a separate event family.
- The runtime contract now also exports `PROVIDER_INIT_LOG_MESSAGE`, so the provider-init parser, runtime emitter, and focused contract tests share one named marker instead of repeating the raw log string.
- The repo now explicitly codifies the current public-contract decision that provider-init remains a sanitized `runtime.warning` / bridged `log` path rather than a dedicated public `provider.init` event family; targeted event-contract tests lock that choice in until the runtime has a stronger reason to widen the surface.
- The runtime contract now also exports `latestProviderInitWarningDetailFromRunEvents()`, so SDK and gateway consumers can share one supported “latest provider-init detail for this run” lookup instead of each scanning the event list their own way.
- SDK monitoring helpers now use those exported payload types for usage/tool-event handling instead of relying only on ad hoc record casts.
- SDK usage projections can now derive missing provider/model/provider-transport detail from earlier persisted provider-init warning rows in the same run when a usage event only carries counters.
- Gateway run projections can now also derive missing provider/model detail from persisted provider-init warning rows when a run is reconstructed from runtime events alone, while still letting stronger dispatch/app-state metadata win when it already exists.
- Gateway run projections can now also preserve additive `modelFamily` and `providerTransport` detail from persisted provider-init warning rows, so that already-recorded provider truth is not flattened away once runs are reconstructed from runtime events.
- Gateway run projections can now also preserve additive `providerSessionId` correlation detail from persisted provider-init warning rows, in the same redacted form already present in the public event path, so that already-recorded tracing truth is not flattened away once runs are reconstructed from runtime events.
- Console dashboard active-run rows can now preserve a human provider label from `providerId` even when `providerProfileId` is absent, so gateway/runtime-derived provider truth is not visually flattened away at the console projection boundary.
- The dashboard view-model and development-fixture read-model pipeline now carry that same provider label into visible client status text for running or approval-blocked clients, so the rendered dashboard no longer drops provider identity when the run only has derived `providerId` truth.
- The dashboard view-model and rendered dashboard rows can now also preserve a compact active-run provider/model summary from gateway-backed run truth, so the console does not flatten active provider/model context back down to a generic status string once that read model reaches the UI.
- The console-safe snapshot and dashboard projection contracts now also preserve additive run `modelFamily` and `providerTransport` detail when the gateway already knows them, while still keeping provider secrets, workspace roots, session paths, and env-key names out of browser-facing data.
- The console-safe snapshot and dashboard projection contracts now also preserve additive run `providerSessionId` correlation detail when the gateway already knows it, again in the same redacted form already present in public runtime events rather than a raw provider-side identifier.
- The Hermes-style local `GatewayRouteContext` helper now also preserves additive run `modelFamily`, `providerTransport`, and redacted `providerSessionId` detail when the gateway already knows them, so route/session-aware local hosts can reuse more provider truth without reopening runtime events directly.
- Direct OpenAI-compatible and OpenRouter usage events can now preserve the provider session/completion ID that produced the reported usage, and that correlation can flow through runtime normalization and control-event bridging.
- Direct OpenAI-compatible and OpenRouter usage events can now also preserve additive provider/model attribution such as `provider`, `modelId`, `modelFamily`, and `providerTransport`, so downstream runtime/control consumers do not have to reconstruct all of that context from earlier init events alone.
- Built-in file, shell, browser-adapter, web, memory, skill, and diagnostics tools.
- Runtime event normalization from native `MainspringEvent` rows into SDK-facing `RunEvent` values.
- Control-channel projection from native runtime events into `TurnEvent` values.
- Focused tests cover the native runtime event projection contracts:
  - every public `RunEventType` is emitted by `normalizeRuntimeEventRow`
  - every native `MainspringEvent` variant normalizes to a SDK-facing event row
  - every native `MainspringEvent` variant bridges to parseable control-channel `TurnEvent` output when it should move up the control channel
  - public `TurnEvent` types are classified as runtime-bridged or control-only
- A minimal in-process `LocalMainspringGateway` boundary under `src/gateway`, exported as `mainspring/gateway`.
- The gateway boundary projects sessions, queued/running runs, runtime events, and approvals over the existing SDK/storage surfaces.
- Gateway run creation, cancellation, and approval responses delegate to the existing SDK command store, so those writes still enter the per-session mailbox.
- A gateway-owned SQLite app-state store contract for clients, workspaces, agents, and provider profile metadata.
- Provider profile records store opaque runtime secret references such as `env:OPENROUTER_API_KEY`; raw provider keys are rejected.
- App-state storage is separate from runtime session mailboxes and does not create `messages_in` or `events_out` tables.
- Gateway run creation can resolve app-state `workspaceId`, `agentId`, and `providerProfileId` metadata into mailbox dispatch fields.
- App-state-backed run creation still enqueues through the SDK command store and per-session mailbox.
- Gateway app-state includes a `gateway_runs` read-model table for durable run metadata such as run ID, session ID, workspace ID, agent ID, provider profile ID, provider ID, and model ID.
- Gateway run projections merge durable app-state run metadata with runtime event-derived status and counts.
- `LocalMainspringGateway.snapshot()` returns a read-only aggregate of app-state records, sessions, run projections, pending approvals, and runtime health.
- A pure console-facing gateway snapshot adapter maps `LocalGatewaySnapshot` into serializable console data while omitting provider `secretRef`, workspace roots, session paths, and app/runtime metadata.
- The console-facing gateway snapshot adapter now resolves a narrow local-only `credentialState` hint for provider profiles:
  - env-backed refs become `configured` only when the current process actually has the referenced env var
  - missing env vars become `missing`
  - non-env refs stay `unverified`
- A Vite React console under `apps/console`.
- A Hermes manifest coverage ledger at `docs/hermes-source-coverage.md` covering the required local `agent/`, `tools/`, and `gateway/` source entries from the current Codex goal objective.
- The TypeScript agent loop now treats provider turns that stop after tool activity without a final assistant result as an explicit failed/stalled condition instead of silently reporting success.
- The console package has an explicit `mainspring` workspace dependency and a small data-source boundary that can accept `ConsoleGatewaySnapshot` data or keep using the prototype localStorage source.
- Console-focused tests cover the data-source boundary and verify accepted gateway snapshot fixtures do not contain provider secret refs, session paths, or workspace roots.
- The console has read-only dashboard projection helpers that map `ConsoleGatewaySnapshot` into provider readiness, client rows, active run rows, and pending approval rows.
- The console dashboard projection now preserves a narrow provider credential nuance:
  - provider rows keep `credentialState`
  - the projection distinguishes overall provider state as `ready`, `unverified`, or `missing`
  - client/dashboard labels can now say `Provider unverified` instead of collapsing that case into `Provider missing`
- The app-facing dashboard view model and Skills screen now preserve that same `providerState` nuance, so gateway-backed UI copy can say `Provider unverified` while still keeping the prototype launch gate behavior unchanged.
- Console projection tests cover active/pending run status, provider readiness, pending approvals, and absence of provider secret refs or local runtime paths in projected dashboard data.
- The existing React dashboard component now consumes a dashboard view-model derived from prototype localStorage state.
- The console has tested dashboard view-model mappers for both prototype localStorage state and future gateway dashboard projections.
- The console has a pure read-model pipeline that composes a static `ConsoleDataSource` into dashboard projection and view-model output without reading browser storage or opening a live transport.
- Console pipeline tests cover the full gateway-snapshot path, the explicit unsupported prototype-localStorage path, and caller-supplied prototype state.
- The console has a development-only static gateway snapshot fixture and helper that exercise the read-model pipeline without live transport.
- Fixture tests prove the development snapshot and composed dashboard output avoid provider secret refs, session paths, workspace roots, provider-key environment names, localStorage references, and local Windows paths.
- The console has an explicit data-source selector that returns prototype localStorage by default and only opts into the development gateway fixture when requested.
- Selector tests prove fixture mode stays opt-in and still composes through the safe read-model pipeline.
- The repo now also has a local-only gateway development HTTP server under `src/gateway/server` for safe snapshot reads, run starts, event reads, approval resolution, and browser-facing sanitized JSON.
- The console now has a pure helper that selects a data source and immediately composes the dashboard read model in one call.
- The selected read-model helper keeps prototype localStorage as the default path, returns the explicit unsupported result when no prototype state is supplied, and can opt into the development gateway fixture for pure gateway-style composition.
- The React console app now routes its dashboard bootstrap through a small app-facing helper that uses the selected read-model helper with caller-supplied prototype state.
- The React console app now has a development-only bootstrap selector driven by the `?mainspringConsoleSource=development-gateway-fixture` query flag.
- The React console app now also recognizes `?mainspringConsoleSource=local-gateway-dev`, can load real gateway snapshots from the local gateway dev server, can start runs through that server, can load real run events for the trace screen, and can resolve pending approvals without exposing provider keys to browser state.
- That selector keeps prototype localStorage as the default app experience and can opt into the static gateway fixture for read-only dashboard preview through the existing selected read-model helper.
- The populated React dashboard now also renders its computed `statusStrip`, so provider/runtime readiness hints are visible even when a client row exists.
- The populated React dashboard now renders every computed client row instead of flattening to only the first client, and the prototype flow now tracks the clicked client before opening its next screen.
- The prototype `Skills` and `RunTrace` screens now use the selected client and agent names instead of hardcoded `Northline Dental` and `Front desk assistant` breadcrumbs.
- The prototype `AgentSpec` screen now distinguishes create vs edit context in its breadcrumb and title instead of always showing `client / New agent`.
- The prototype `AgentSpec` readiness panel now preserves the already-known provider state (`set`, `unverified`, or `missing`) instead of hardcoding provider auth as missing.
- The runtime browser tool bundle is now a consolidated lightweight TypeScript surface with `browser.open`, `browser.snapshot`, `browser.click`, `browser.type`, and `browser.screenshot`.
- The expanded browser bundle is Hermes-inspired in shape, but still intentionally lighter than the Hermes Python tool cluster. It stays behind the `BrowserRuntimeAdapter`, `ToolRegistry`, and runtime approval path.
- A Hermes-inspired replacement agent layer now exists under `src/agent` with:
  - `TurnContext`
  - `IterationBudget`
  - `TurnRetryState`
  - provider-event projection
  - tool-result classification
  - turn finalization
  - `AgentRunLoop`
- `AgentRunLoop` can run an `AgentProvider` query without depending on `RuntimeKernel`, project provider events into canonical turn events, track retry summary and iteration budget, and support cancellation through `AbortSignal`.
- `scripts/openrouter-e2e.mjs` proves the new `AgentRunLoop` path can call OpenRouter through environment-backed local config using `openrouter/free`.
- A Hermes-gateway-inspired route context helper exists under `src/gateway/GatewayRouteContext.ts`. It builds a sanitized local control context from `LocalGatewaySnapshot` using session, workspace, agent, provider, model, and latest-run metadata.
- A task-local gateway session context helper exists under `src/gateway/GatewaySessionContext.ts`. It ports the useful Hermes `gateway/session_context.py` idea through `AsyncLocalStorage` without mutating `process.env`.
- `RuntimeKernel` now routes all provider-query pumping through `AgentRunLoop`.
- That unified provider pump supports three runtime modes:
  - provider-driven tool-call runs when runtime tools are configured and allowed
  - warning-only tool-event projection when runtime tools exist but the run allows none
  - legacy-compatible tool event persistence when no runtime tools are configured
- The unified `AgentRunLoop` path executes tools through the existing `ToolRegistry`, preserves approval receipts and pending-approval resume behavior, and keeps legacy fallback provider tool-call IDs in persisted runtime events where tests depend on them.
- Approved pre-provider single-tool execution now shares the same underlying runtime `ToolRegistry` execution helper used by provider-driven tool calls.
- A non-root Docker runtime image and local Compose file with named volumes and no published runtime port.

## Prototype-Only

- `apps/console` is a browser `localStorage` prototype.
- Console clients, agents, provider auth status, model defaults, presets, and sample trace state are not backed by runtime storage or a Local Gateway.
- The local console account uses a browser-stored SHA-256 password hash and is not secure desktop authentication.
- Provider auth UI stores only masked status/suffix data in browser state and cannot authenticate providers.
- Console-facing provider readiness is still just a local read-model hint. It is not provider OAuth, token validation, or a secure secret-store integration.
- Console-facing provider state remains a local read-model hint only. `unverified` does not mean healthy auth, and `configured` still does not prove the provider will accept requests.
- The launch/trace flow opens a sample trace; it does not enqueue a real run into `messages_in`.
- Usage, cost, billing labels, cron templates, budgets, and artifacts in the console are placeholders or local notes.
- Runtime profiles now flow through SDK dispatch, but they remain policy/routing metadata rather than separate runtime sandboxes.
- Computer and cell-related contracts exist in protocol code, but `computerId` is metadata only. It is not a live Local Gateway, HyperCell manager, or desktop routing target.
- `LocalMainspringGateway` is an in-process boundary/read model, not a desktop app, network service, secure secret store, provider auth manager, or HyperCell scheduler.
- The gateway app-state store is a contract for local product metadata, not a provider-auth implementation and not an OS keychain.
- App-state-backed provider profile routing uses only metadata such as provider ID and default model ID; it does not resolve or inject provider secrets.
- The gateway snapshot is an in-process read-model API, not a network service, desktop app, or live console wiring.
- A local gateway development HTTP surface now exists, but it is intentionally local-only and dev-oriented. It is not a production auth boundary, hosted gateway, or multi-user security layer.
- The console snapshot adapter is a data-contract boundary only. It is not wired into the React console and does not implement provider authentication or credential storage.
- The console data-source boundary is not a live transport. It can accept a static `ConsoleGatewaySnapshot` shape, but the UI still defaults to browser localStorage.
- The default app path still uses prototype localStorage state.
- The gateway dashboard projection/view-model path is renderable only through the explicit development fixture selector. It is still not live transport, polling, or SDK-backed console wiring.
- The `local-gateway-dev` console mode is explicit and experimental. It provides live local dev transport for snapshots, run start, approvals, and trace reads, but it does not create secure browser auth, hosted gateway transport, or a finished desktop boundary.
- The read-model pipeline is pure composition only. It does not poll, subscribe, fetch, open websockets, or read browser localStorage.
- The development gateway snapshot fixture is not wired into `App.tsx`; it is an explicit development/testing path only.
- The data-source selector is not wired into live runtime transport. It only chooses between prototype localStorage and the static development fixture.
- The selected read-model helper is not live transport or browser bootstrap logic. It is a pure development/testing composition layer over the selector and read-model pipeline.
- The app-facing dashboard bootstrap helper still uses caller-supplied prototype state. It does not switch the app to live gateway state, transport, or browser-side gateway loading.
- Dashboard row selection is still a local prototype concern; it is not persisted in runtime storage or driven by gateway session state.
- Prototype trace content is still sample-only even when the breadcrumb now reflects the selected client and agent.
- Agent editing is still prototype-local state; the UI label is more truthful, but there is still no runtime-backed agent versioning or live gateway mutation flow.
- The new local gateway dev console mode still does not provide runtime-backed client CRUD, agent version history editing, billing, artifact browsing, or deployment flows.
- AgentSpec readiness remains a local UI hint only; it is not proof of provider OAuth, token validation, or successful runtime provider connectivity.
- Hermes source coverage classification exists, but most Hermes files remain deferred, omitted, or reference-only for later milestones; only the first turn-loop slice has active TypeScript port work so far.
- The development bootstrap selector is still local preview logic only. The fixture path is read-only, development-only, and does not switch the rest of the app to live gateway state.
- The expanded browser tool bundle does not implement Hermes-level browser supervisor state, CDP transport, dialog handling, cloud browser providers, or secure browser session management.

## Not Implemented Yet

- Electron desktop app.
- Windows `.exe` or Linux AppImage packaging.
- Full Local Mainspring Gateway process or service.
- Complete local app SQLite database for approvals, usage, cells, deployment targets, billing, cron, and marketplace state.
- Secure desktop secret store or OS keychain integration.
- Live console data source wired to SDK or gateway state, although pure gateway snapshot adapter, console data-source, dashboard projection, dashboard view-model, read-model pipeline, development fixture, selector helper, selected read-model helper, app bootstrap helper, and development bootstrap selector contracts now exist.
- Full Hermes agent/tools/gateway replacement is not implemented yet; the coverage ledger exists and the first turn-loop slice is partial.
- Hermes-style rich native tool parity is not implemented yet. The browser bundle is broader now, but there is still no TypeScript port of Hermes browser supervision, terminal/session tools, cron/job tools, managed tool gateway, or richer tool result storage.
- The new `src/agent` layer is not yet wired as the default SDK/runtime execution path. The existing SDK still reaches providers through `RuntimeKernel` until a future migration replaces that path.
- `AgentRunLoop` does not yet own the full runtime. The pre-provider single-tool approval shortcut still exists as a `RuntimeKernel` decision path even though approved execution now shares the same runtime tool executor.
- Hermes gateway platform adapters are not ported. Current gateway work only ports local route/context ideas, not Telegram, Slack, WhatsApp, relay transports, or messaging delivery.
- HyperCell interface, scheduler, lifecycle, leases, snapshots, or provider backends.
- VM, WSL2, Windows Sandbox, Hyper-V, HCS, or linux-bwrap isolation.
- Real computer selection or HyperCell-backed runtime routing.
- Gateway-managed browser profiles, download policy, navigation revalidation beyond current URL checks, or network isolation.
- Operator roles, tenant scopes, budget caps, critical policy classes, billing ledger, cron engine, marketplace, deployment wizard, or hosted control plane.

## Runtime Spine

This is the current SDK/runtime execution path:

```text
SDK/control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK/control event projection
```

This spine remains the required execution path for the current brief. Hermes-informed work should evolve components around it, but should not bypass `RuntimeKernel`, collapse the mailbox/event journal, or rewrite the runtime into a desktop gateway.

The newer `src/agent` work is an internal improvement seam, not a license to skip the runtime spine. `AgentRunLoop` is now used inside `RuntimeKernel`, while the mailbox, approval, tool-registry, and event-projection layers remain the active runtime backbone.

## Event Layers

There are three event layers today:

- `MainspringEvent`: native runtime event stored in `events_out`.
- `RunEvent`: SDK-facing normalized event produced by `normalizeRuntimeEventRow`.
- `TurnEvent`: control-channel event emitted by `bridgeRuntimeEventToTurnEvents`.
- Native `log.payload` metadata can now survive into normalized `runtime.warning` rows and bridged `log` events after sanitization, which is how additive provider-init metadata currently reaches public consumers without inventing a new event family.
- SDK tests now assert that a real runtime/provider turn can surface this provider-init warning detail through the exported `RunEventOfType<'runtime.warning'>` contract.
- Contract tests now also assert that `providerInitWarningDetailFromRunEvent()` accepts the intended sanitized provider-init warning payload and rejects unrelated or blank warning detail.
- Contract, runtime-kernel, SDK, normalizer, and control-bridge tests now share the exported `PROVIDER_INIT_LOG_MESSAGE` constant when asserting the supported provider-init warning/log contract.
- Control contract tests now also assert that bridged `TurnEvent` log rows can expose the same provider-init detail through `providerInitLogDetailFromTurnEvent()` only when the log payload actually matches the supported provider-init message/payload contract.
- Event-contract tests now also assert the negative case explicitly: provider-init detail stays on `runtime.warning` and bridged `log`, and the current public `RunEventType` / `TurnEventType` surfaces do not quietly sprout a dedicated `provider.init` event.
- Contract tests now also assert the event-list lookup path explicitly: when multiple warning rows exist, the shared helper returns the latest matching provider-init detail instead of forcing each consumer to reconstruct that rule.
- SDK usage tests now also reflect the current truth that this runtime path preserves top-line usage counters plus redacted `providerSessionId`, but does not currently enrich usage rows with provider/model metadata from earlier init events.
- SDK usage tests now reflect the newer truth more precisely: the runtime still emits top-line usage counters, while downstream SDK usage projections may derive provider/model/provider-transport detail from earlier persisted provider-init warning rows in the same run.
- Gateway tests now also reflect the same derived-vs-authoritative rule: event-derived provider/model run metadata can fill gaps for completed runs, but it does not override stronger app-state or dispatch metadata.
- Gateway and console contract tests now also reflect that additive provider-init fields such as `modelFamily` and `providerTransport` can survive the read-model path once the runtime already recorded them, without claiming those fields existed on every native event directly.
- Gateway and console contract tests now also reflect that additive provider-init fields such as `providerSessionId`, `modelFamily`, and `providerTransport` can survive the read-model path once the runtime already recorded them, while still preserving redaction and not implying richer billing/auth semantics.
- Gateway route-context tests now also reflect that the same additive provider-init fields can survive one more local read-only helper surface once the gateway run projection already has them.
- Console dashboard tests now also reflect the same rule in UI-facing form: when the run only carries derived `providerId`, the dashboard can still label the provider without claiming a stronger profile linkage than it actually has.
- Console pipeline and fixture tests now also reflect the rendered-facing version of that rule: status labels such as `Approval needed - OpenRouter` or `Running - OpenAI` are derived from already-known run/provider projection data rather than invented profile linkage.

The console should depend on `RunEvent` once it is wired to real local state. Control-plane-compatible websocket paths should use `TurnEvent`.

The current public `RunEventType` list is limited to values the normalizer can emit. `tool.call.started` and `runtime.heartbeat` are not emitted today and should not be documented as supported events unless implementation and tests are added.

Runtime-bridged `TurnEvent` types are:

- `turn.status`
- `text.delta`
- `text.done`
- `tool.call`
- `tool.update`
- `tool.result`
- `approval.requested`
- `approval.resolved`
- `browser.preview`
- `file.preview`
- `artifact.created`
- `usage`
- `log`
- `error`

Control-only `TurnEvent` types are schema-supported but not emitted by the current runtime bridge:

- `reasoning.delta`
- `reasoning.done`
- `progress`
- `source.reference`
- `result.summary`
- `agent.status`
- `provider.retry`
- `provider.fallback`

## Current Security Limits

Implemented controls include:

- File path containment for built-in file tools.
- Per-session SDK workspace scoping for provider `cwd` and runtime tool execution.
- Tool manifest validation.
- Runtime policy decisions.
- Approval receipts bound to run, tool, input hash, nonce, and expiry.
- Environment scrubbing and output caps for shell execution.
- Output redaction before storage or return.
- Public-web URL and SSRF checks for web tools, including redirect target checks.
- Opaque provider secret refs in protocol types.
- Non-root Docker runtime image.
- Compose guardrails for no published ports, no Docker socket, no privileged flag, expected env vars, and expected named mounts.
- Console-facing gateway snapshot adaptation omits provider secret refs, workspace roots, session paths, and metadata from serialized console output.
- Console data-source tests scan accepted gateway snapshot fixtures for provider secret refs, session paths, workspace roots, and provider-key environment names.
- Console dashboard projection tests scan projected dashboard data for provider secret refs, session paths, workspace roots, and provider-key environment names.
- Console dashboard view-model tests scan rendered dashboard data shapes for provider secret refs, session paths, workspace roots, and provider-key environment names.
- Console read-model pipeline tests scan composed gateway outputs for provider secret refs, session paths, workspace roots, and provider-key environment names.
- Development fixture tests scan the fixture and its composed read-model output for provider secret refs, session paths, workspace roots, provider-key environment names, localStorage references, and local Windows paths.
- Data-source selector tests prove default selection stays on prototype localStorage and fixture selection still composes through the safe read-model path.
- Selected read-model helper tests prove default selection stays explicit, caller-supplied prototype state still composes without browser storage reads, and fixture mode composes to the expected gateway-style dashboard output.
- App bootstrap helper tests prove the React console dashboard now derives its prototype view-model through the selected read-model helper path instead of calling the prototype mapper directly.
- Development bootstrap selector tests prove the query flag defaults to prototype flow, only opts into the explicit fixture mode, and can produce gateway-style dashboard preview output without live transport.
- Hermes coverage work now includes a ledger for 252 manifest entries and first-slice loop tests proving stalled-after-tool turns fail honestly in both `AgentRunLoop` and `RuntimeKernel`.
- Structured OpenRouter message preparation now repairs malformed provider history before submission by dropping orphan tool results, merging consecutive user turns, and sanitizing malformed historical tool-call argument JSON to `{}` before replay.
- Resumed OpenRouter turns can now build a small structured replay transcript from mailbox-backed user prompts plus same-run assistant/tool events instead of relying only on prompt-synthesized assistant prose.
- When replayed historical tool-call arguments had to be repaired, the matching replayed tool-result content now carries a truthful marker so the model sees that continuation context was normalized rather than intact.
- Generic resumed providers now also receive the same narrow mailbox-backed replay chain as structured `messages`, while still keeping the legacy prompt-history fallback for continuity.
- Provider usage events can now preserve optional cache-token, reasoning-token, and parsed provider rate-limit detail from OpenAI-compatible and OpenRouter provider responses.
- Direct provider init events now preserve the resolved model ID used by the HTTP transport instead of emitting `undefined` when the request used the client default model.
- Direct provider init events can now also preserve a narrow syntactic `modelFamily` hint when the resolved model slug obviously maps to a known family; this is not a capability catalog, context-window probe, or metadata cache.
- Direct provider init events can now also preserve a narrow `providerTransport` hint describing the actual direct-client path in use; this is additive transport truth, not a promise of live gateway routing, provider capability negotiation, or protocol parity.
- Runtime/provider-init metadata carried in native `log.payload` rows now survives normalized `RunEvent` and bridged `TurnEvent` projections in sanitized form; this is additive trace truth, not a new provider state machine or health-check surface.
- The exported payload-type map makes this warning-path contract more explicit for SDK consumers, but it does not yet convert the entire event stream into a fully discriminated union.
- The exported provider-init warning helper makes the current supported parsing path explicit for SDK/gateway consumers, but it still relies on sanitized `runtime.warning` payload detail rather than a dedicated public provider-init event family.
- The shared provider-init payload parser and control-side `TurnEvent` helper make the same contract explicit across both public event layers, but they still rely on sanitized warning/log payload detail rather than a dedicated provider-init event family.
- The shared provider-init payload parser, control-side `TurnEvent` helper, and exported provider-init message constant now make the same contract explicit across runtime emission and both public event layers, but they still rely on sanitized warning/log payload detail rather than a dedicated provider-init event family.
- That no-dedicated-provider-init choice is now explicit in both contract comments and tests: adding a separate public provider-init event would widen normalizer, bridge, consumer, and documentation surfaces without unlocking stronger runtime truth today.
- The SDK now consumes some of those exported payload types directly in monitoring helpers, but full event-stream discrimination and cross-event usage enrichment are still not implemented.
- The SDK now consumes some of those exported payload types directly in monitoring helpers, and it performs one narrow cross-event enrichment by deriving usage metadata from persisted provider-init warning rows; this is a read-model convenience, not a change to native runtime event emission.
- The SDK and gateway now share the same exported “latest provider-init detail from run events” helper for their event-list scans; this is still a read-model convenience, not a change to native runtime event emission.
- The gateway now performs a matching narrow cross-event enrichment for run projections by deriving provider/model detail from persisted provider-init warning rows only when projection metadata is otherwise missing; this is also a read-model convenience, not a change to native runtime event emission.
- That same gateway read-model path now preserves additive `modelFamily` and `providerTransport` fields when earlier persisted provider-init warning rows supplied them; this remains a read-model convenience, not a change to native runtime event emission.
- That same gateway read-model path now preserves additive `providerSessionId`, `modelFamily`, and `providerTransport` fields when earlier persisted provider-init warning rows supplied them; this remains a read-model convenience, not a change to native runtime event emission.
- The console dashboard now reuses that narrower gateway/provider truth by falling back from `providerProfileId` to active `providerId` label lookup for run rows; this is presentation-layer reuse of already-derived metadata, not a new auth or profile-resolution path.
- The console-safe snapshot and dashboard projection now preserve additive run `providerSessionId`, `modelFamily`, and `providerTransport` fields from the gateway read model, but they still do not imply live provider health, capability validation, or runtime-backed UI transport.
- The local `GatewayRouteContext` helper now preserves the same additive run `providerSessionId`, `modelFamily`, and `providerTransport` fields from the gateway read model, but this is still a sanitized local context helper, not live provider health, capability validation, or a stronger runtime control plane.
- The console view-model now reuses that same run/provider truth in client status labels and compact active-run summaries for active runs; this is still presentation-layer reuse of already-derived metadata, not a new auth, health, or profile-resolution path.
- Direct provider usage events can now also preserve a narrow `providerSessionId` correlation hint when the direct client knows which provider response/completion generated the usage record; this is additive tracing truth, not a new billing ledger or provider state machine.
- Direct provider usage events can now also preserve narrow provider/model attribution fields when the direct client already knows them; this is additive event truth, not a richer billing product, capability registry, or provider state machine.
- Browser registry and provider-schema tests now cover the expanded `browser.snapshot`, `browser.click`, and `browser.type` tools in addition to the existing browser tools.
- Agent lifecycle tests cover sanitized turn contexts, iteration budget consume/refund behavior, retry-state decisions, tool-result classification, deterministic provider-event projection, turn finalization, `AgentRunLoop` completion, retry summary, budget exhaustion, and cancellation.
- Gateway route-context tests cover sanitized local route context, stable route keys, and fail-closed unknown-session handling.
- Gateway session-context tests cover overlapping async scope isolation, nested clear behavior, sanitization, and missing-session rejection.
- Runtime kernel tests cover the unified `AgentRunLoop` provider pump, provider-driven tool-call execution, approval resume/deny behavior, cancellation, managed-lane provider failures, and preservation of legacy fallback tool-event handling.
- SDK tests now cover an offline OpenRouter/free metadata route through SDK dispatch, runtime provider selection, usage events, and secret absence in projected run events.
- A live OpenRouter E2E script exists for local manual verification. It loads `.env.local`, uses `openrouter/free`, and prints only provider/model/status/usage metadata.

Important limits:

- Host `shell.exec` is not a sandbox. It is approved host process execution in the configured workspace root.
- SDK-managed runtime sessions resolve that configured workspace root per session. The direct CLI/runtime entrypoint still uses `MAINSPRING_WORKSPACE_ROOT`.
- Process execution must not be marketed as secure containment.
- Browser execution is adapter-trusted and does not by itself provide profile isolation, download policy, navigation revalidation after open, or network isolation.
- Browser/localStorage provider auth is prototype-only.
- Provider keys and durable auth state must not be stored in renderer localStorage.
- The repo now also ships a fuller open-source launch shell: brand SVG assets, release docs, support and governance docs, GitHub issue templates, CI workflow, release-check workflow, and runnable example config templates.
- Local dev provider credentials may be kept in ignored environment files such as `.env.local` for local testing, but must not be copied into source files, docs, traces, renderer localStorage, or final reports.
- Structured provider-history repair currently applies only where callers provide structured message arrays; the resumed runtime path still relies mainly on prompt synthesis plus mailbox-backed event truth.
- Historical tool-call argument sanitization currently repairs structured provider replay input only; it does not yet rebuild a full structured assistant/tool transcript from mailbox events for resumed runtime turns.
- The mailbox-backed structured replay path is intentionally narrow: it currently reconstructs a minimal same-run user/assistant/tool chain for resumed providers rather than a full provider-agnostic transcript model.
- The replay corruption marker currently lives only in provider-input reconstruction. It does not mutate persisted runtime events, mailbox rows, or outbound transcript storage.
- The widened generic resumed-provider replay path is additive: it supplies structured replay input alongside the existing prompt-history lane rather than replacing provider-specific continuation behavior wholesale.
- The OpenAI-compatible Responses lane now also consumes repaired structured replay, but currently bridges that history into text-only input items instead of a richer provider-native transcript model.
- Provider usage detail is still intentionally narrow: `inputTokens`, `outputTokens`, and `totalTokens` remain the provider-reported top-line counters, while cache/reasoning buckets and parsed rate-limit state are additive optional detail rather than a new billing ledger or monitoring product.
- The current policy model does not enforce operator roles, tenant scopes, budget caps, dangerous pattern classes, or differentiated critical-action classes.
- Provider selection currently uses SDK-registered providers, environment-backed runtime defaults, or gateway app-state metadata routed through SDK run dispatch. There is no secure desktop secret store.
- The current gateway boundary does not add security isolation. It only preserves the command/read boundary around the existing SDK and mailbox runtime.
- The app-state store rejects raw-looking provider secrets, but it is not encrypted secret storage.
- Gateway run metadata is a read-model convenience only. Runtime status, event history, approvals, and tool output still come from the runtime mailbox/event stores.
- The console-facing snapshot adapter reduces what the browser needs to see, but it is not an access-control layer, secret store, or live data transport.
- The console-facing snapshot adapter now reports env-backed credential readiness more truthfully, but it still does not validate provider tokens, perform OAuth, or prove remote provider health.
- The console data-source boundary does not authenticate, authorize, poll, subscribe, or persist gateway state.
- The console dashboard projection does not enforce security policy and does not replace runtime event, approval, or tool-output stores.
- The dashboard view-model boundary does not enforce security policy and does not prove live gateway state is present.
- The read-model pipeline composes already-safe data only. It is not a transport, authorization layer, or secret boundary.
- The development gateway snapshot fixture is sample data only and does not prove a live gateway, secure credential path, or runtime subscription exists.
- The data-source selector does not fetch, subscribe, authenticate, or imply that a live gateway is present.
- The selected read-model helper does not fetch, subscribe, authenticate, or imply that a live gateway is present.
- The app bootstrap helper does not fetch, subscribe, authenticate, or imply that a live gateway is present.
- The development bootstrap selector does not fetch, subscribe, authenticate, or imply that a live gateway is present.
- The Hermes coverage ledger is a source-audit artifact, not proof that deferred or omitted files have been ported.
- The expanded browser tool bundle remains adapter-trusted host/browser execution. It does not by itself provide Hermes-style browser supervision, secure containment, or cloud/session isolation.
- Docker is a runtime packaging option, not the required desktop-local isolation model.

## Long-Term Brief

The product brief asks Mainspring to evolve into one local-first app that can manage clients, workspaces, agents and versions, provider profiles and secret references, local sessions, approvals, traces, artifacts, usage, desktop packaging, HyperCell-backed isolation, and later VPS deployment.

That long-term direction should be approached in small, verified steps:

- Keep the runtime package clean and preserve the mailbox/kernel/tool/policy/event seams.
- Use Hermes as a source of implementation ideas and coverage pressure, but preserve the current runtime spine while migrating in tested slices.
- Add a Local Gateway as a sibling host layer before broad Electron work.
- Port selected Hermes-agent tool patterns into lightweight TypeScript-native Mainspring tools where they fit the existing runtime, consolidating overlapping behavior instead of cloning every Python file.
- Add a local app SQLite database for product/control objects without replacing the runtime mailbox.
- Wire the console to SDK or gateway-backed state before expanding product surfaces.
- Add HyperCell contracts and tests before routing real work away from host execution.
- Research Windows and Linux backends through ADRs before implementation.

## Current Verification Lane

The canonical local lane is:

```bash
pnpm verify
```

It runs doctor, root typecheck, runtime and console-boundary tests, root build, the Mainspring security guard, console typecheck, and console build. The security guard also inspects `docker/compose.local.yml`.
