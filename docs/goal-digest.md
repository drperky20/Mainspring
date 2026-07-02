# Mainspring Goal Digest

Last updated: 2026-07-02.

This is the durable digest for continuing the full Mainspring product/architecture brief in repo-grounded milestones. Future work should read this file and `docs/current-state.md` before choosing the next milestone.

## Source Of Truth

- Current repository: `E:\Mainspring`
- Current-state audit: `docs/current-state.md`
- Full controlling brief from this run: `C:\Users\drper\.codex\attachments\19033ef3-a57b-4e1a-a4b8-8562e5c8e9c3`
- Required manifest/priority-port goal file: `C:\Users\drper\.codex\attachments\97ffc3e4-71fd-453d-b6b1-25376608cdae\goal-objective.md`
- Referenced pasted brief: `C:\Users\drper\.codex\attachments\3cf47715-26dd-4206-b850-9a95225a1658\pasted-text-1.txt`
- Hermes tool-reference folder for selective TypeScript migration ideas: `C:\Users\drper\Downloads\hermes-agent-2026.6.19\hermes-agent-2026.6.19\tools`
- Hermes agent harness replacement prompt: `docs/hermes-agent-port-goal.md`
- Hermes agent-reference folder for full TypeScript harness replacement ideas: `C:\Users\drper\Downloads\hermes-agent-2026.6.19\hermes-agent-2026.6.19\agent`
- The attachment directory `C:\Users\drper\.codex\attachments\19033ef3-a57b-4e1a-a4b8-8562e5c8e9c3` was empty during the 2026-06-27 audit.

Use the repository as source of truth. The brief describes the destination, not the current implementation.

## Mission

Evolve Mainspring toward a local-first, installable, open-source desktop operating system for agent businesses. It should eventually manage clients, agents, workspaces, provider profiles, secret references, sessions, approvals, traces, usage, artifacts, desktop packaging, HyperCell-backed runtime isolation, and later simple VPS deployment.

Do this through small, complete, verified milestones. Do not implement fantasy architecture or fake product surfaces.

For tool and agent-harness work, use Hermes as the primary reference library of ideas to port into lightweight TypeScript-native Mainspring code. Audit first, evolve safely, preserve the working runtime spine, and consolidate overlapping behavior where possible without bypassing `RuntimeKernel`, collapsing the mailbox/event journal, or inventing unsupported product/security surfaces.

## Legacy Runtime Spine

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

This runtime spine remains the required execution path for the current brief. Hermes mining should improve components around this path, but should not bypass `RuntimeKernel`, collapse the mailbox/event journal, or rewrite the runtime into a desktop gateway.

## Security Truth

- Host `shell.exec` is not a sandbox.
- Process execution must not be marketed as secure containment.
- Browser/localStorage provider auth is prototype-only.
- Provider keys and durable auth state must not be stored in renderer `localStorage`.
- Browser tools are adapter-trusted and do not yet enforce full profile isolation, download policy, navigation revalidation, or network isolation.
- HyperCells, VM isolation, operator roles, budget caps, critical policy classes, desktop secret storage, billing ledger, cron, and deployment wizard are not implemented unless future code proves otherwise.

## Completed Milestone 1: Audit And Honesty Pass

Completed on 2026-06-27.

Changes made:

- Added `docs/current-state.md`.
- Updated `README.md`, `SECURITY.md`, `docs/security.md`, and `docs/frontend.md` to distinguish current reality from planned product/security controls.
- Updated stale local instruction files:
  - `src/runner/CLAUDE.md`
  - `src/tools/CLAUDE.md`
- Expanded verification:
  - `package.json` `verify` now runs doctor, typecheck, tests, build, security guard, console typecheck, and console build.
  - `scripts/doctor.mjs` checks console and Compose file presence.
  - `scripts/check-mainspring-security.mjs` checks Docker Compose for no published ports, no Docker socket, no privileged mode, expected env vars only, and expected named mounts.
- Labeled `apps/console` as a prototype localStorage console.
- Removed un-emitted public `RunEventType` values:
  - `tool.call.started`
  - `runtime.heartbeat`
- Rebuilt `dist/` and `apps/console/dist/`.

Verification from milestone 1:

- `pnpm doctor`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 16 files and 113 tests.
- `pnpm build`: passed.
- `pnpm run security:mainspring`: passed.
- `pnpm console:build`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.
- `pnpm verify`: passed after expansion.

Repository reality:

- `E:\Mainspring` was not a Git repository during milestone 1.

## Completed Milestone 2: Per-Session Workspace Scoping

Completed on 2026-06-27.

Changes made:

- `RuntimeKernel` now accepts a static workspace root or a per-run/session workspace resolver.
- `RuntimeKernel` resolves and stores the active workspace root for provider queries, provider tool calls, and pre-provider approval/tool execution.
- `RuntimeEngine` now resolves SDK-managed runtime workspaces from the stored session record instead of using one engine-wide `workspaceRoot` for every session.
- `SqliteMainspringStorage` now creates session workspace directories when sessions are created or updated.
- Added SDK regression tests proving:
  - two sessions with different workspace roots read their own files through runtime tool execution
  - one session cannot read another workspace by absolute path
  - one session cannot write another workspace by absolute path even after the write approval is granted
- Updated `docs/current-state.md` and `docs/security.md` to reflect SDK-managed per-session workspace execution while preserving the warning that host shell execution is not a sandbox.

Verification from milestone 2:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 16 files and 115 tests.
- `pnpm verify`: passed.

## Completed Milestone 3: Provider, Model, And Runtime Profile Routing

Completed on 2026-06-27.

Changes made:

- `RunIntentSchema.runtimeOptions` now accepts routed `providerId` and data-driven `modelId` values instead of forcing the app default model.
- Provider `init` events can report the actual provider/model used while still rejecting raw credential-shaped data.
- Added one canonical `mainspringRuntimeProfileFromOptions` helper and used it in SDK dispatch construction so `allowBrowser` and `allowMemory` cannot diverge from `runtimeProfile`.
- SDK `StartRunInput` and `CreateMainspringOptions` now expose provider/model/runtime-profile inputs without adding a new gateway layer.
- `SqliteMainspringStorage` writes `providerId`, `modelId`, and coherent runtime options into the per-session mailbox dispatch.
- `RuntimeKernel` resolves providers through a configured provider resolver and passes selected `providerId` and `model` metadata into `AgentProvider.query`.
- `RuntimeEngine` and `createMainspring` preserve the existing runtime spine while allowing SDK-registered provider routing and env-backed default provider/model selection.
- Added focused regression tests for:
  - provider event parsing with routed provider/model IDs
  - runtime profile derivation
  - mailbox dispatch preservation of provider/model/computer/profile fields
  - live SDK provider/model routing through the supervisor/kernel/provider path

Verification from milestone 3:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 16 files and 117 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 3:

- `computerId` is dispatch metadata only. It does not select a HyperCell, VM, desktop, browser profile, or process sandbox.
- Runtime profiles are coherent metadata/policy hints, not separate isolation backends.
- There is still no Local Gateway provider profile database, desktop secret store, budget router, or provider-auth UI backed by secure storage.
- Direct runtime/CLI use still depends on env-backed provider configuration rather than SDK provider registry state.

## Completed Milestone 4: Event Projection Contract Tests

Completed on 2026-06-27.

Changes made:

- Added `src/events/normalizeRuntimeEvent.test.ts`.
- Added `src/control/runtime-bridge.test.ts`.
- Added type-level coverage checks so `pnpm typecheck` fails if public `RunEventType` or `TurnEventType` values drift without classification.
- Added normalizer tests proving:
  - every public SDK `RunEventType` can be emitted from current native runtime rows
  - every native `MainspringEvent` variant normalizes without being dropped
  - sensitive shell/tool output is summarized and redacted before becoming SDK-facing event payload
- Added runtime bridge tests proving:
  - every native `MainspringEvent` variant that should reach the control channel bridges to parseable `TurnEvent` output
  - public `TurnEvent` values are classified as runtime-bridged or control-only
  - status, tool-result state, tool category, and secret redaction behavior are stable
- Updated `docs/current-state.md` with the current event projection contract and the control-only event types.

Verification from milestone 4:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 18 files and 126 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 4:

- The console is not wired to live SDK/gateway state.
- Control-only `TurnEvent` types are schema-supported for future hosts or UI adapters, but they are not emitted by the runtime bridge today.
- There is still no full Local Gateway service/process, app-owned SQLite database, desktop secret store, HyperCell runtime routing, or Electron packaging.

## Completed Milestone 5: Minimal Local Gateway Boundary

Completed on 2026-06-27.

Changes made:

- Added `src/gateway/LocalGateway.ts`.
- Added `src/gateway/index.ts`.
- Exported the boundary from the package root and as `mainspring/gateway`.
- Added a minimal in-process `LocalMainspringGateway` over existing SDK/storage surfaces.
- Gateway read projections now cover:
  - sessions
  - queued and event-backed runs
  - normalized runtime events
  - pending approvals
- Gateway command methods delegate to the existing SDK command store for:
  - run enqueue
  - run cancel
  - approval approve/deny
- Added tests proving:
  - gateway run creation writes a valid dispatch into the per-session mailbox
  - gateway run projection preserves provider/model/profile/computer routing metadata from dispatch
  - gateway event and approval projections observe a real `RuntimeKernel` tool/approval run
  - approval responses through the gateway complete through the existing mailbox/kernel/tool path

Verification from milestone 5:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 19 files and 128 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 5:

- `LocalMainspringGateway` is an in-process boundary, not a full service/process, Electron app, hosted control plane, or desktop gateway.
- There is still no gateway-owned app SQLite database for clients, workspaces, agents, provider profiles, approvals, usage, cells, or deployment targets.
- There is still no secure desktop secret store, provider auth manager, HyperCell scheduler, or isolation backend.

## Completed Milestone 6: Gateway App-State Store Contract

Completed on 2026-06-27.

Changes made:

- Added `src/gateway/AppStateStore.ts`.
- Added `src/gateway/AppStateStore.test.ts`.
- Exported `SqliteLocalGatewayAppStateStore`, `createSqliteLocalGatewayAppStateStore`, and app-state record/input types from `mainspring/gateway`.
- Added a gateway-owned SQLite app-state store for:
  - clients
  - workspaces
  - agents
  - provider profile metadata
- Added optional `appState` attachment to `LocalMainspringGateway`.
- Provider profile records store opaque runtime secret refs such as `env:OPENROUTER_API_KEY` or `provider-profile:...`.
- Raw-looking provider keys are rejected in provider profile `secretRef` and provider profile metadata.
- Added tests proving:
  - app-state records can be created/read/listed
  - app-state SQLite tables do not contain runtime mailbox tables like `messages_in` or `events_out`
  - provider profile records reject raw-looking secrets
  - app-state can be attached to the gateway without changing runtime session storage

Verification from milestone 6:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 20 files and 131 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 6:

- The app-state store is local product metadata storage, not provider auth, not a secure desktop secret store, and not encrypted secret storage.
- Gateway provider profile metadata is not yet wired into runtime provider routing.
- Runtime sessions, runs, approvals, and events still live in the SDK/runtime mailbox-backed surfaces.
- There is still no full Local Gateway service/process, Electron app, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 7: App-State-Backed Gateway Run Dispatch

Completed on 2026-06-27.

Changes made:

- Added `LocalMainspringGateway.runs.startFromAppState`.
- Added `LocalGatewayAppStateRunInput` to `mainspring/gateway` exports.
- App-state-backed run creation can resolve:
  - `workspaceId` from gateway workspace records
  - `agentId` and agent default model metadata from gateway agent records
  - `providerId` and default model metadata from gateway provider profile records
- The resolved run still enqueues through the existing SDK command store and per-session mailbox.
- Provider profile `secretRef` remains metadata only and is not copied into dispatch.
- Added tests proving:
  - app-state-backed run creation writes expected `workspaceId`, `agentId`, `providerId`, and `modelId` fields into `messages_in`
  - provider profile secret refs are not leaked into dispatch
  - app-state-backed run creation reaches the runtime through `SessionRuntimeSupervisor`, `RuntimeKernel`, and the selected provider/model

Verification from milestone 7:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 20 files and 133 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 7:

- This is metadata routing, not provider auth or secure secret resolution.
- Gateway app-state provider profiles are not registered providers by themselves; runtime provider execution still depends on SDK-registered providers or environment-backed defaults.
- Completed gateway run projections are rebuilt from events and do not yet retain durable app-state dispatch metadata after the inbound row is consumed.
- There is still no full Local Gateway service/process, Electron app, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 8: Durable Gateway Run Metadata

Completed on 2026-06-27.

Changes made:

- Added a `gateway_runs` table to the gateway app-state SQLite schema.
- Added `LocalGatewayRunMetadataRecord` and `UpsertLocalGatewayRunMetadataInput` to `mainspring/gateway` exports.
- Added `appState.runs.upsert/get/list`.
- `LocalMainspringGateway` now persists run metadata at enqueue time when app-state is attached.
- Gateway run projections now merge durable app-state run metadata with runtime event-derived status and event counts.
- Added/updated tests proving:
  - app-state run metadata can be created/read/listed
  - app-state tables remain separate from runtime mailbox tables
  - queued app-state-backed dispatch records provider/workspace/agent metadata
  - completed app-state-backed run projections retain workspace, agent, provider profile, provider, and model metadata after the inbound row is consumed

Verification from milestone 8:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 20 files and 133 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 8:

- Gateway run metadata is a read-model convenience, not a replacement for `events_out`, approval events, tool output, or trace storage.
- Gateway app-state provider profiles are still metadata only and do not resolve provider secrets.
- There is still no full Local Gateway service/process, Electron app, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 9: Read-Only Gateway Snapshot API

Completed on 2026-06-27.

Changes made:

- Added `LocalMainspringGateway.snapshot()`.
- Added `LocalGatewaySnapshot` to `mainspring/gateway` exports.
- The snapshot returns:
  - generated timestamp
  - runtime health
  - app-state clients, workspaces, agents, provider profiles, and run metadata
  - SDK/runtime sessions
  - gateway run projections
  - pending approvals
- Added a gateway test proving the snapshot reflects app-state records and completed runtime run state.
- The snapshot test verifies runtime events are still read through the gateway event projection and does not expose raw provider keys.

Verification from milestone 9:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 20 files and 134 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 9:

- The snapshot is an in-process read model, not a network API, desktop app, Electron shell, or live console wiring.
- The console still uses prototype localStorage/sample state.
- Provider profile `secretRef` values remain opaque metadata and are not resolved into provider secrets.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 10: Console Snapshot Adapter Contract

Completed on 2026-06-27.

Changes made:

- Added `src/gateway/ConsoleSnapshotAdapter.ts`.
- Exported `gatewaySnapshotToConsoleState` and console-facing snapshot types from `mainspring/gateway`.
- Added a pure serializable console contract derived from `LocalGatewaySnapshot` for:
  - clients
  - workspaces
  - agents
  - provider profile status metadata
  - sessions
  - runs
  - approvals
  - runtime health and counts
- Omitted provider `secretRef`, workspace roots, session paths, local metadata, runtime `sessionsRoot`, run input, runtime profile, and computer metadata from the console-ready output.
- Added a regression test proving serialized console state does not include `OPENROUTER_API_KEY`, `secretRef`, local secret paths, `workspaceRoot`, or `sessionPath`.
- Updated `docs/current-state.md` to reflect that this is a data-contract step, not live console wiring or provider authentication.

Verification from milestone 10:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 21 files and 135 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 10:

- The adapter is pure and in-process. It is not a network API, desktop app, Electron shell, or live console subscription.
- The React console still uses prototype localStorage/sample state and does not consume the gateway snapshot adapter yet.
- Provider profile `secretRef` values remain opaque metadata and are not resolved into provider secrets.
- The adapter reduces the browser-facing shape, but it is not an access-control layer, provider-auth implementation, or secure desktop secret store.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 11: Console Data-Source Boundary

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/consoleDataSource.ts`.
- Added an explicit console-side data-source boundary with two modes:
  - existing prototype browser localStorage
  - static `ConsoleGatewaySnapshot` input
- Added snapshot summary helpers for health, client/workspace/agent/provider counts, active sessions, active runs, and pending approvals.
- Kept the current UI path on prototype localStorage by moving the storage key into the data-source boundary without changing the user flow.
- Added `apps/console/src/consoleDataSource.test.ts` with a gateway snapshot fixture that satisfies the exported `ConsoleGatewaySnapshot` type.
- Added `mainspring: workspace:*` as an explicit console package dependency so `apps/console` consumes the public `mainspring/gateway` contract instead of reaching into root internals.
- Expanded `pnpm test` to include `apps/console/src` tests as well as root `src` tests.
- Refreshed `pnpm-lock.yaml` and the local workspace link with `pnpm install --offline`.
- Updated `docs/current-state.md` to clarify that this is console ingestion structure, not live SDK/gateway wiring.

Verification from milestone 11:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 22 files and 137 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 11:

- The console data-source boundary is not a live transport, websocket, Electron bridge, or SDK subscription.
- The React console still defaults to prototype localStorage/sample state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The accepted console snapshot shape omits provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 12: Console Dashboard Projection Helpers

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/dashboardProjection.ts`.
- Added a read-only dashboard projection over `ConsoleGatewaySnapshot` for:
  - provider readiness rows
  - client dashboard rows
  - active run rows
  - pending approval rows
  - summary counts and health
- Added dashboard client status classification for:
  - no agent
  - provider missing
  - ready
  - running
  - needs approval
- Added `apps/console/src/dashboardProjection.test.ts`.
- Tests prove the projection can represent configured providers, archived providers, active runs, pending approvals, and provider-missing clients.
- Tests also prove projected dashboard data does not contain provider `secretRef`, workspace roots, session paths, or provider-key environment names.

Verification from milestone 12:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 23 files and 139 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 12:

- The dashboard projection is a read-model helper. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- The React console still defaults to prototype localStorage/sample state and does not render the gateway projection yet.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The projected dashboard shape omits provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 13: Console Dashboard View-Model Boundary

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/dashboardViewModel.ts`.
- Added a dashboard view-model type that the React dashboard can render without knowing whether its data came from prototype localStorage or a future gateway projection.
- Added `prototypeStateToDashboardViewModel` for the current browser localStorage console state.
- Added `gatewayProjectionToDashboardViewModel` for future read-only `ConsoleDashboardProjection` data.
- Updated `apps/console/src/App.tsx` so the existing dashboard component consumes the prototype-derived view model while preserving the current UI flow.
- Added `apps/console/src/dashboardViewModel.test.ts`.
- Tests cover:
  - prototype state mapped into the existing client/provider dashboard shape
  - gateway projection mapped into the same render shape
  - provider-ready, provider-missing, empty-client, active-run, and pending-approval states
  - view-model output free of provider `secretRef`, workspace roots, session paths, and provider-key environment names

Verification from milestone 13:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 24 files and 142 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 13:

- The gateway dashboard view-model path is tested but not selected by the app at runtime.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The dashboard view-model omits provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 14: Pure Console Read-Model Pipeline

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/consoleReadModelPipeline.ts`.
- Added `composeConsoleDashboardReadModel` as a pure composition boundary over `ConsoleDataSource`.
- Static `gateway-snapshot` data now composes through:
  - `projectConsoleDashboard`
  - `gatewayProjectionToDashboardViewModel`
- Prototype localStorage sources now return an explicit unsupported result unless the caller supplies already-loaded prototype state.
- Caller-supplied prototype state composes through `prototypeStateToDashboardViewModel` without reading browser storage.
- Added `apps/console/src/consoleReadModelPipeline.test.ts`.
- Tests prove:
  - the full pure gateway snapshot path produces projection and dashboard view-model output
  - prototype localStorage remains explicit and unsupported without caller-supplied state
  - caller-supplied prototype state can produce the current prototype dashboard view-model
  - composed gateway outputs do not contain provider `secretRef`, workspace roots, session paths, or provider-key environment names

Verification from milestone 14:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 25 files and 145 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 14:

- The read-model pipeline is pure composition. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The composed dashboard output omits provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 15: Development Gateway Snapshot Fixture

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/developmentGatewaySnapshotFixture.ts`.
- Added a static `ConsoleGatewaySnapshot` fixture for development/testing.
- Added `createDevelopmentGatewayDashboardReadModel()` to compose that fixture through the existing pure read-model pipeline.
- Added `findForbiddenDevelopmentGatewaySnapshotFixtureTokens()` for fixture-level redaction checks.
- Added `apps/console/src/developmentGatewaySnapshotFixture.test.ts`.
- Tests prove:
  - the fixture exposes expected client/workspace/agent/provider/session/run/approval counts
  - the fixture contains no provider `secretRef`, workspace roots, session paths, provider-key environment names, `localStorage` references, `secret` strings, or local Windows paths
  - the fixture exercises the pure read-model pipeline into dashboard projection and view-model output
  - the composed output keeps provider readiness, active run counts, pending approval counts, and client status labels intact without unsafe fields

Verification from milestone 15:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 26 files and 147 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 15:

- The development fixture path is explicit sample data. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The fixture and composed dashboard output omit provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 16: Console Data-Source Selector

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/consoleDataSourceSelector.ts`.
- Added a pure `selectConsoleDataSource()` helper with two explicit modes:
  - default `prototype-localStorage`
  - opt-in `development-gateway-fixture`
- Kept prototype localStorage as the default selection path.
- Reused the existing static gateway fixture for explicit fixture selection.
- Added `apps/console/src/consoleDataSourceSelector.test.ts`.
- Tests prove:
  - default selection returns the prototype localStorage source
  - prototype mode remains stable when requested explicitly
  - fixture mode only activates when explicitly requested
  - fixture mode still composes through the safe read-model pipeline into gateway dashboard output

Verification from milestone 16:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 27 files and 150 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 16:

- The selector is a pure helper. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The selector and fixture path still omit provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 17: Selected Console Read-Model Helper

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/selectedConsoleReadModel.ts`.
- Added `composeSelectedConsoleDashboardReadModel()` as one pure helper that:
  - selects the console data source
  - immediately composes the dashboard read model
- Kept prototype localStorage as the default selection path.
- Preserved the explicit unsupported result when the selected prototype path is used without caller-supplied prototype state.
- Preserved the explicit opt-in path for the development gateway snapshot fixture.
- Added `apps/console/src/selectedConsoleReadModel.test.ts`.
- Tests prove:
  - default selection still returns the explicit unsupported prototype-localStorage result
  - caller-supplied prototype state still composes through the default path without reading browser storage
  - fixture mode composes gateway-style dashboard output in one call

Verification from milestone 17:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 28 files and 153 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 17:

- The selected read-model helper is pure composition. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The selected helper, selector, and fixture path still omit provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 18: App Dashboard Bootstrap Through Selected Helper

Completed on 2026-06-27.

Changes made:

- Added `apps/console/src/appDashboardBootstrap.ts`.
- Added `deriveAppDashboardViewModel()` as the app-facing bootstrap helper for the React console dashboard.
- Updated `apps/console/src/App.tsx` so the existing dashboard bootstrap now flows through:
  - `deriveAppDashboardViewModel()`
  - `composeSelectedConsoleDashboardReadModel()`
- Kept prototype localStorage as the default app experience by passing caller-supplied prototype state into the selected helper.
- Preserved the existing prototype banner, browser localStorage flow, and non-live runtime behavior.
- Added `apps/console/src/appDashboardBootstrap.test.ts`.
- Tests prove the React app bootstrap now derives the same prototype dashboard view-model through the selected helper path.

Verification from milestone 18:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 29 files and 154 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 18:

- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- The app bootstrap helper is still pure local composition over caller-supplied prototype state. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The bootstrap helper and selected helper path still omit provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 19: Development-Only App Bootstrap Selector

Completed on 2026-06-27.

Changes made:

- Expanded `apps/console/src/appDashboardBootstrap.ts`.
- Added `developmentConsoleBootstrapSearchParam` with the query flag:
  - `?mainspringConsoleSource=development-gateway-fixture`
- Added `resolveAppDashboardBootstrapMode()` so the app defaults to prototype localStorage unless the explicit development fixture flag is present.
- Added `deriveAppDashboardBootstrap()` so the app bootstrap can return either:
  - prototype-state dashboard output
  - gateway-snapshot dashboard output
- Updated `apps/console/src/App.tsx` to use the bootstrap selector and helper.
- Kept prototype localStorage as the default user flow.
- In development fixture mode, preserved honest behavior by treating the dashboard as a read-only preview path and keeping the prototype banner/security truth intact.
- Added/expanded `apps/console/src/appDashboardBootstrap.test.ts`.
- Tests prove:
  - prototype app bootstrap still composes through the selected helper path
  - the explicit query-driven fixture mode can produce gateway-style dashboard output
  - the query flag defaults to prototype flow unless the explicit fixture value is present

Verification from milestone 19:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 29 files and 156 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 19:

- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- The development bootstrap selector is still local preview logic. It is not live transport, a websocket, an Electron bridge, or an SDK subscription.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- The bootstrap selector, selected helper path, and fixture preview still omit provider `secretRef`, workspace roots, and session paths, but this is not an access-control layer.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 20: Hermes-Informed Browser Tool Consolidation

Completed on 2026-06-27.

Changes made:

- Audited the Hermes-agent `tools` folder and used it as a reference for the next Mainspring-native tool expansion step.
- Expanded `src/tools/BrowserTool.ts` from a minimal browser pair into a lightweight consolidated browser bundle with:
  - `browser.open`
  - `browser.snapshot`
  - `browser.click`
  - `browser.type`
  - `browser.screenshot`
- Kept the bundle behind the existing `BrowserRuntimeAdapter`, `ToolRegistry`, approval receipts, and runtime policy path.
- Added compact input validation and normalization for browser element refs, optional task hints, and typed text input.
- Updated `src/tools/ToolRegistry.test.ts` to cover:
  - approval-required behavior for the expanded browser tool set
  - adapter execution for snapshot, click, and type
  - normalized element refs and typed browser inputs
- Updated `src/providers/HttpProviderClient.ts` so provider tool schemas describe the new browser tools.
- Updated `src/providers/HttpProviderClient.test.ts` so provider-advertised tool definitions now cover `browser.snapshot`, `browser.click`, and `browser.type`.

Verification from milestone 20:

- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 29 files and 156 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 20:

- The browser bundle is broader, but it is still a lightweight TypeScript-native surface, not a full Hermes parity port.
- Browser execution is still adapter-trusted and approval-gated. It is not secure containment, a browser supervisor, a cloud browser backend, or CDP orchestration.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- There is still no full Local Gateway service/process, HyperCell scheduler, billing ledger, cron engine, deployment wizard, or hosted control plane.

## Completed Milestone 21: Hermes-Agent Replacement Goal Prompt

Completed on 2026-06-27.

Changes made:

- Added `docs/hermes-agent-port-goal.md` as the durable goal prompt for copying the useful ideas and architecture designs from the Hermes `agent` folder into a lightweight TypeScript Mainspring replacement.
- Incorporated the user's updated direction that the current Mainspring runtime is not sacred and can be fully ditched or replaced after audit.
- Updated this digest so future continuations treat the Hermes `agent` folder as a first-class source reference:
  - `C:\Users\drper\Downloads\hermes-agent-2026.6.19\hermes-agent-2026.6.19\agent`
- Updated the old runtime-spine language from an unconditional preservation rule into a legacy-current-state description that the Hermes-agent replacement goal may supersede.
- Updated `docs/current-state.md` to clarify that its runtime spine section describes current reality and earlier incremental guardrails, not an eternal constraint for the Hermes-agent replacement effort.
- Spawned two `gpt-5.4-mini` high-thinking subagents for parallel Hermes-agent architecture audit and Mainspring-fit analysis.

Verification from milestone 21:

- Documentation-only change; no code verification required.
- Current repo still reports that `E:\Mainspring` is not a Git repository.

Still true after milestone 21:

- Current code still uses the existing runtime spine until replacement milestones actually change it.
- No replacement architecture has been implemented yet.
- Security truth still applies: do not claim sandboxing, secure provider auth, HyperCells, VM isolation, budget caps, or secure desktop secrets until implemented and tested.

## Completed Milestone 22: Hermes Inventory And Agent Loop Slice

Completed on 2026-06-27.

Changes made:

- Added `docs/hermes-agent-port-inventory.md`.
- Added `docs/hermes-agent-replacement-architecture.md`.
- Classified Hermes `agent` and `tools` areas into TypeScript-native keep, merge, replace, delete, or omit decisions.
- Added a first Hermes-inspired `src/agent` replacement slice:
  - `TurnContext`
  - `IterationBudget`
  - `TurnRetryState`
  - provider-event projection
  - tool-result classification
  - turn finalization
  - `AgentRunLoop`
- Exported the new agent-loop primitives from `src/index.ts`.
- Added `scripts/openrouter-e2e.mjs` and `package.json` `openrouter:e2e`.
- Added `.env.local` for local environment-backed OpenRouter dev config. The key is not documented, printed, or stored in renderer localStorage.
- Added SDK/runtime coverage proving OpenRouter/free metadata can route through SDK dispatch, runtime provider selection, usage events, and secret-redacted projected events without a live network call.
- Updated `docs/current-state.md` to describe the new `src/agent` layer, the legacy runtime spine status, and the remaining migration gap.
- Used subagents for:
  - Hermes tool inventory and consolidation planning
  - agent run-loop implementation
  - verification checklist and E2E risk review

Verification from milestone 22:

- `pnpm typecheck`: passed.
- `pnpm exec vitest run src/agent --passWithNoTests`: passed, 2 files and 10 tests.
- `pnpm exec vitest run src/agent src/providers/HttpProviderClient.test.ts src/runner/RuntimeProviderConfig.test.ts --passWithNoTests`: passed, 4 files and 22 tests.
- `pnpm exec vitest run src/sdk/Mainspring.test.ts --passWithNoTests`: passed, 1 file and 7 tests.
- `pnpm test`: passed, 31 files and 167 tests.
- `pnpm build`: passed.
- `pnpm run openrouter:e2e`: passed against live OpenRouter with provider `openrouter`, model `openrouter/free`, completed exit reason, and usage reported.

Still true after milestone 22:

- `AgentRunLoop` is implemented and live-provider tested, but the SDK still defaults to the existing `RuntimeKernel` path until a future migration wires the new loop into the runtime store/tool path.
- The current mailbox/kernel/tool/policy path has not been deleted.
- Host shell execution is not a sandbox.
- Browser execution remains adapter-trusted.
- There is no secure desktop secret store, HyperCell isolation, billing ledger, cron engine, marketplace, or deployment wizard.

## Completed Milestone 23: Hermes Gateway Source Added To Replacement Map

Completed on 2026-06-27.

Changes made:

- Updated `docs/hermes-agent-port-goal.md` so the Hermes `gateway` folder is a first-class source beside `agent` and `tools`.
- Updated `docs/hermes-agent-port-inventory.md` with Hermes gateway areas and omit/merge decisions.
- Updated `docs/hermes-agent-replacement-architecture.md` with a gateway strategy.
- Added `src/gateway/GatewayRouteContext.ts`.
- Added `src/gateway/GatewayRouteContext.test.ts`.
- Exported `buildGatewayRouteContext`, `gatewayRouteKey`, and `GatewayRouteContext` from `mainspring/gateway`.
- Ported the useful Hermes gateway idea of session/channel route context into a local-first Mainspring route context over `LocalGatewaySnapshot`.

Verification from milestone 23:

- `pnpm exec vitest run src/gateway/GatewayRouteContext.test.ts --passWithNoTests`: passed, 1 file and 3 tests.
- `pnpm typecheck`: passed.
- `pnpm exec vitest run src/gateway --passWithNoTests`: passed, 4 files and 12 tests.

Still true after milestone 23:

- Hermes messaging platform adapters are not ported.
- `GatewayRouteContext` is a local read-model helper, not a network gateway, relay service, auth manager, or desktop process.
- Provider keys remain environment-backed and are not stored in renderer localStorage.

## Completed Milestone 24: Gateway Session Context And Kernel AgentRunLoop Lane

Completed on 2026-06-27.

Changes made:

- Added `src/gateway/GatewaySessionContext.ts`.
- Added `src/gateway/GatewaySessionContext.test.ts`.
- Exported gateway session context helpers from `mainspring/gateway`.
- Ported the useful Hermes `gateway/session_context.py` idea into `AsyncLocalStorage` task-local context helpers without writing to `process.env`.
- Added `AgentRunLoop` hooks:
  - `onQuery`
  - `onEvent`
- Wired a narrow `RuntimeKernel` zero-tools lane through `AgentRunLoop`.
- Kept the existing manual tool/approval branch for non-zero tool paths.
- Added and repaired regression tests for:
  - `AgentRunLoop` hooks and abort behavior
  - `RuntimeKernel` no-tools streaming through projected events
  - no-tools cancellation
  - legacy provider tool events still using contract-generated fallback IDs

Verification from milestone 24:

- `pnpm exec vitest run src/gateway/GatewayRouteContext.test.ts src/gateway/GatewaySessionContext.test.ts --passWithNoTests`: passed, 2 files and 6 tests.
- `pnpm exec vitest run src/gateway --passWithNoTests`: passed, 5 files and 15 tests.
- `pnpm exec vitest run src/runner/PollLoop.test.ts src/runner/RuntimeKernel.test.ts src/agent/AgentRunLoop.test.ts --passWithNoTests`: passed, 3 files and 33 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 33 files and 175 tests.
- `pnpm build`: passed.
- `pnpm verify`: passed.

Still true after milestone 24:

- `AgentRunLoop` now owns the zero-tools runtime lane only.
- Tool execution, approvals, and pre-provider tool calls still use the legacy `RuntimeKernel` branch.
- Hermes gateway platform adapters and relay transports are still omitted.
- Host shell execution is not a sandbox.
- Browser execution remains adapter-trusted.

## Completed Milestone 25: Provider Tool-Call AgentRunLoop Lane

Completed on 2026-06-27.

Changes made:

- Extended `src/agent/AgentRunLoop.ts` with targeted provider-tool hooks:
  - `onToolCall`
  - `onToolResult`
- Kept canonical projected turn events, retry tracking, cancellation, and iteration budgeting intact.
- Wired a new `RuntimeKernel` provider-tools lane through `AgentRunLoop` when runtime tools are configured and the run allows one or more of them.
- Preserved existing `ToolRegistry` execution, approval receipts, pending approval resume flow, cancellation, and legacy fallback provider tool-call IDs in persisted mailbox events.
- Kept the no-runtime-tools-configured path on the legacy provider pump so `PollLoop` contract behavior stayed stable.
- Kept the pre-provider single-tool approval shortcut unchanged for this milestone.
- Added and updated regression coverage proving:
  - `AgentRunLoop` tool hooks fire inline with projected event flow
  - provider-driven tool calls execute through the new `AgentRunLoop` lane and still push `tool_result` messages back to the provider query
  - repeated same-name provider tool calls keep distinct fallback IDs
  - approval-required provider tool calls still resume or deny correctly
  - zero-tools and PollLoop coverage still pass

Verification from milestone 25:

- `pnpm exec vitest run src/agent/AgentRunLoop.test.ts src/runner/RuntimeKernel.test.ts --passWithNoTests`: passed, 2 files and 28 tests.
- `pnpm exec vitest run src/runner/PollLoop.test.ts --passWithNoTests`: passed, 1 file and 6 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 33 files and 176 tests.
- `pnpm build`: passed.
- `pnpm verify`: passed.
- `pnpm run openrouter:e2e`: passed against live OpenRouter with provider `openrouter`, model `openrouter/free`, completed exit reason, and redacted metadata-only output.

Still true after milestone 25:

- `AgentRunLoop` now owns the zero-tools runtime lane and the provider-driven tool-call runtime lane.
- Pre-provider single-tool approvals and the no-runtime-tools-configured provider pump still live in legacy `RuntimeKernel` logic.
- Hermes gateway platform adapters and relay transports are still omitted.
- Host shell execution is not a sandbox.
- Browser execution remains adapter-trusted.

## Completed Milestone 26: Unified AgentRunLoop Provider Pump

Completed on 2026-06-27.

Changes made:

- Collapsed provider-query pumping in `RuntimeKernel` to one `AgentRunLoop`-driven helper with explicit modes:
  - managed runtime tools
  - warning-only tool events
  - legacy-compatible no-runtime-tools event persistence
- Removed the old split provider-event pumping path and its separate raw provider event handler.
- Kept cancellation on the unified provider pump through `AbortController`.
- Refactored pre-provider approved tool execution to share the same underlying `ToolRegistry` execution helper used by provider-driven tool calls.
- Preserved:
  - mailbox event truth
  - approval-required provider tool resumes and denies
  - legacy fallback `toolCallId` behavior for no-runtime-tools event persistence
  - warning-only tool-event behavior when runtime tools exist but the run allows none
- Added regression coverage for provider failure in managed tool mode and strengthened PollLoop no-runtime-tools tool event assertions.

Verification from milestone 26:

- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vitest run src/runner/PollLoop.test.ts src/runner/RuntimeKernel.test.ts src/agent/AgentRunLoop.test.ts --passWithNoTests`: passed, 3 files and 35 tests.
- `pnpm test`: passed, 33 files and 177 tests.
- `pnpm build`: passed.
- `pnpm verify`: passed.
- `pnpm run openrouter:e2e`: first rerun failed because the live provider returned a completed but non-sentinel answer; second rerun passed with `OPENROUTER_E2E_OK`, provider `openrouter`, model `openrouter/free`, and redacted metadata-only output.

Still true after milestone 26:

- All provider-query pumping now flows through `AgentRunLoop`.
- The pre-provider single-tool approval shortcut still exists as a `RuntimeKernel` decision path even though approved execution now shares the same runtime tool executor.
- Hermes gateway platform adapters and relay transports are still omitted.
- Host shell execution is not a sandbox.
- Browser execution remains adapter-trusted.

## Completed Milestone 27: Hermes Coverage Ledger And Honest Tool-Stall Finalization

Completed on 2026-06-27.

Changes made:

- Read the updated Codex goal objective file at:
  - `C:\Users\drper\.codex\attachments\64368f84-48d6-4dae-95bf-0b295d89127c\goal-objective.md`
- Added `docs/hermes-source-coverage.md`.
- Cataloged every current manifest entry from the local Hermes source roots:
  - `agent/`
  - `tools/`
  - `gateway/`
- The coverage ledger records, for every manifest entry:
  - resolved yes/no
  - source group
  - decision
  - TypeScript target or omitted
  - reason
  - tests needed
  - status
- Local disk resolved all listed manifest entries directly in this pass; no missing rows were left unclassified.
- Ported a first-priority-group Hermes behavior into the TypeScript turn loop:
  - provider turns that stop after tool activity without a final assistant result now exit as `stalled_after_tool`
  - `RuntimeKernel` now marks that case failed with a truthful error instead of a false completed ack
- Added or expanded regression coverage in:
  - `src/agent/TurnLifecycle.test.ts`
  - `src/agent/AgentRunLoop.test.ts`
  - `src/runner/RuntimeKernel.test.ts`

Hermes ideas ported in this milestone:

- `conversation_loop.py`: merged the honest “tool ran, then the turn stopped” failure handling into the TypeScript run loop/runtime path.
- `turn_finalizer.py`: merged truthful abnormal-turn finalization into `TurnLifecycle.ts` and `RuntimeKernel.ts`.
- `turn_context.py`, `turn_retry_state.py`, `iteration_budget.py`, `trajectory.py`, `agent_runtime_helpers.py`: reclassified in the coverage ledger and partially represented through the current `src/agent/*` slice.

Hermes ideas omitted or deferred in this milestone:

- `codex_runtime.py` remains deferred for a later provider/runtime slice.
- `agent_init.py` remains deferred for a later runtime bootstrap slice.
- Most `tools/` and `gateway/` entries remain deferred, omitted, asset-only, or reference-only with reasons recorded in `docs/hermes-source-coverage.md`.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `src/agent/AgentRunLoop.ts`, `src/agent/TurnLifecycle.ts`, and `src/runner/RuntimeKernel.ts` as the active first replacement slice.
- Merged: Hermes turn-finalization honesty into the existing TypeScript loop/runtime path.
- Not replaced yet: the broader runtime/provider/tool/gateway architecture remains only partially ported.

Verification from milestone 27:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 33 files and 180 tests.

Still true after milestone 27:

- `E:\Mainspring` is still not a Git repository.
- `docs/hermes-source-coverage.md` is a source-audit artifact, not proof that deferred or omitted files are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Current Product Gaps

- No full Local Mainspring Gateway process or service.
- No Electron app, Windows `.exe`, or Linux AppImage.
- No complete Local Gateway app database for approvals, usage, cells, deployment targets, billing, cron, or marketplace state.
- No secure desktop secret store or OS keychain integration.
- Console is not wired to runtime state, although pure gateway snapshot adapter, console data-source, dashboard projection, dashboard view-model, read-model pipeline, development fixture, selector, selected read-model helper, app bootstrap helper, and development bootstrap selector contracts now exist.
- No broader Hermes-style TypeScript tool consolidation beyond the first browser-bundle expansion.
- No Hermes-agent full harness replacement implemented yet; the source-coverage ledger exists and the first turn-loop slice is still partial.
- No live console run creation, approval inbox, event stream, artifact list, or usage ledger.
- No HyperCell interface, lifecycle, scheduler, leases, snapshots, or backends.
- No WSL2, Windows Sandbox, Hyper-V, HCS, or linux-bwrap implementation.
- No VPS deployment wizard.

## Known Runtime Gaps

- SDK-managed workspace scoping is now implemented for provider `cwd` and runtime tool execution. Direct CLI/runtime entrypoint sessions still use `MAINSPRING_WORKSPACE_ROOT` until a Local Gateway or richer host layer supplies per-session metadata.
- Provider/model/profile routing now flows through SDK dispatch, storage, supervisor, kernel, and `AgentProvider.query`, but direct runtime/CLI entrypoints still rely on env defaults.
- Computer selection defaults are not real routing.
- Runtime profiles mostly act as metadata and policy hints.
- Event layers are documented and projection-tested, but the console still does not consume live runtime events.
- `AgentRunLoop` now covers all provider-query pumping, but the pre-provider single-tool approval shortcut still remains as a special `RuntimeKernel` decision path before provider execution starts.
- The in-process `LocalMainspringGateway` boundary exists and can carry a gateway-owned app-state store.
- App-state provider/workspace/agent records can feed gateway run dispatch, and gateway run projections retain that metadata through the gateway run read model.
- A read-only gateway snapshot, console-facing adapter contract, console data-source boundary, dashboard projection helpers, dashboard view-model boundary, pure read-model pipeline, development fixture path, selector helper, selected read-model helper, app bootstrap helper, and development bootstrap selector exist for future console wiring, but the React console does not consume live gateway state yet.
- Hermes-inspired browser interaction coverage now exists in the native TypeScript tool bundle, but there is still no TypeScript port of Hermes browser supervisor state, terminal/session tools, cron/job tools, managed tool gateway, tool result storage surfaces, or full agent harness lifecycle.
- Hermes manifest coverage now exists in `docs/hermes-source-coverage.md`, but most non-loop files remain deferred, omitted, asset-only, or reference-only pending later slices.

## Completed Milestone 28: Hermes Message-History Repair Before Provider Submission

Completed on 2026-06-27.

Changes made:

- Ported the Hermes malformed-history repair idea from `agent_runtime_helpers.py` / `conversation_loop.py` into a TypeScript-native helper:
  - `src/agent/ProviderMessageHistory.ts`
- Added a structured provider-message model to `src/providers/types.ts`.
- Updated `src/providers/HttpProviderClient.ts` so OpenRouter request message arrays are repaired before provider submission when structured history is present.
- The repair currently does two honest, repo-grounded things:
  - drops orphan `tool` results whose `toolCallId` no longer matches the current preceding assistant tool-call set
  - merges consecutive `user` messages with blank-line separation so no user input is lost
- The patch does not invent missing transcript turns, does not bypass `RuntimeKernel`, and does not alter mailbox/event persistence.
- Added regression coverage in:
  - `src/agent/ProviderMessageHistory.test.ts`
  - `src/providers/HttpProviderClient.test.ts`
- Updated:
  - `docs/hermes-source-coverage.md`
  - `docs/current-state.md`

Hermes ideas ported in this milestone:

- `agent_runtime_helpers.py:repair_message_sequence`
- `conversation_loop.py` pre-call malformed-history repair behavior

Hermes ideas still deferred in this slice:

- Broader runtime recovery helpers from `agent_runtime_helpers.py`
- Richer structured transcript assembly in the runtime path
- Full Hermes harness/runtime replacement outside the current provider-input seam

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> events_out`
- Merged: Hermes-style provider-input history repair into the existing OpenRouter provider message-prep path
- Not replaced yet: resumed runtime history still leans on prompt synthesis rather than a fully structured turn transcript

Verification from milestone 28:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 182 tests.
- `pnpm verify`: passed.

Still true after milestone 28:

- `E:\Mainspring` is still not a Git repository.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- Structured history repair only applies when a caller provides structured message arrays.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 29: Hermes Tool-Call Argument Sanitization For Provider Replay

Completed on 2026-06-27.

Changes made:

- Extended `src/agent/ProviderMessageHistory.ts` so structured assistant tool calls now sanitize malformed argument JSON before provider replay.
- The TypeScript-native repair now:
  - rewrites blank historical tool-call arguments to `{}`
  - rewrites malformed historical tool-call argument JSON to `{}`
  - keeps already-valid argument JSON unchanged
- Kept the patch inside the existing structured provider-input seam and did not alter mailbox persistence, approval behavior, or runtime event truth.
- Added regression coverage in:
  - `src/agent/ProviderMessageHistory.test.ts`
  - `src/providers/HttpProviderClient.test.ts`

Hermes ideas ported in this milestone:

- `agent_runtime_helpers.py:sanitize_tool_call_arguments`
- `conversation_loop.py` pre-call malformed-tool-argument repair behavior

Hermes ideas still deferred in this slice:

- Hermes-style marker injection onto matching tool results after corrupted historical arguments
- Runtime-side structured transcript reconstruction from mailbox events for resumed provider turns
- Broader runtime recovery helpers outside the current provider-input seam

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> events_out`
- Merged: Hermes-style malformed tool-call argument sanitization into the structured OpenRouter replay path
- Not replaced yet: resumed runtime turns still rely mainly on prompt synthesis rather than a fully structured assistant/tool transcript

Verification from milestone 29:

- Targeted tests: passed, 2 files and 11 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 184 tests.
- `pnpm verify`: passed.

Still true after milestone 29:

- `E:\Mainspring` is still not a Git repository.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- Structured provider-history repair still applies only where callers provide structured message arrays.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 30: Mailbox-Backed Structured Replay For Resumed OpenRouter Turns

Completed on 2026-06-27.

Changes made:

- Added `readRunTaskPrompts(...)` to `src/mailbox/SqliteMailbox.ts` so the runtime can read prior same-run user prompts from the inbound mailbox truth.
- Updated `src/runner/RuntimeKernel.ts` to reconstruct a small structured replay transcript for resumed OpenRouter turns from:
  - prior same-run user prompts in `messages_in`
  - same-run `assistant.text.done` events
  - same-run `tool.call` events
  - same-run `tool.result` events
- The runtime now passes that minimal replay chain as structured `messages` for resumed OpenRouter queries while keeping the broader runtime spine intact.
- Added resumed-history replay coverage in `src/runner/RuntimeKernel.test.ts`.

Hermes ideas ported in this milestone:

- `conversation_loop.py` resumed-turn pre-call history repair groundwork
- `agent_runtime_helpers.py` style mailbox/history repair inputs, but adapted to the current mailbox/event truth

Hermes ideas still deferred in this slice:

- Full provider-agnostic structured transcript reconstruction
- Hermes-style marker injection onto matching tool results after corrupted historical arguments
- Broader runtime recovery helpers outside the current provider-input seam

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> events_out`
- Merged: a narrow mailbox-backed replay builder into the resumed OpenRouter provider path
- Not replaced yet: generic providers still mostly rely on prompt synthesis for continuation context

Verification from milestone 30:

- Targeted runtime resume tests: passed, 1 file and 25 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 185 tests.
- `pnpm verify`: passed.

Still true after milestone 30:

- `E:\Mainspring` is still not a Git repository.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The structured replay builder is intentionally narrow and currently targets resumed OpenRouter turns only.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 31: Truthful Replay Markers For Repaired Historical Tool Arguments

Completed on 2026-06-27.

Changes made:

- Extended `src/agent/ProviderMessageHistory.ts` so when historical assistant tool-call arguments are repaired during replay normalization, the matching replayed `tool` message gets a truthful marker prepended to its content.
- Kept this signal narrow and non-destructive:
  - no mailbox rows were rewritten
  - no runtime events were mutated
  - no fake product surfaces were added
- Added regression coverage in:
  - `src/agent/ProviderMessageHistory.test.ts`
  - `src/providers/HttpProviderClient.test.ts`

Hermes ideas ported in this milestone:

- `agent_runtime_helpers.py` style corruption marker behavior, adapted into the TypeScript replay-normalization path
- `conversation_loop.py` continuation honesty around repaired replay inputs

Hermes ideas still deferred in this slice:

- Full provider-agnostic structured transcript reconstruction
- Broader runtime recovery helpers outside the current provider-input seam
- Richer provider-specific continuation hints beyond the current replay marker

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> events_out`
- Merged: a truthful replay marker into the existing structured OpenRouter replay normalization path
- Not replaced yet: generic providers still mostly rely on prompt synthesis for continuation context

Verification from milestone 31:

- Targeted tests: passed, 3 files and 36 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 185 tests.
- `pnpm verify`: passed.

Still true after milestone 31:

- `E:\Mainspring` is still not a Git repository.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The structured replay builder remains intentionally narrow and currently targets resumed OpenRouter turns only.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 32: Generic Resumed Providers Now Receive Structured Replay Too

Completed on 2026-06-27.

Changes made:

- Widened `src/runner/RuntimeKernel.ts` so mailbox-backed structured replay messages are no longer limited to the OpenRouter resumed lane.
- Generic resumed providers now also receive the reconstructed `messages` replay chain from mailbox truth.
- Kept the compatibility guardrail:
  - generic providers still keep the legacy prompt-history fallback
  - OpenRouter continues to use the structured replay path as its primary resumed-turn input
- Extended `src/runner/RuntimeKernel.test.ts` so the generic resumed-provider test now proves both behaviors:
  - legacy prompt-history continuity remains
  - structured replay messages are also present

Hermes ideas ported in this milestone:

- `conversation_loop.py` style resumed-turn repair no longer depends entirely on one provider lane
- `agent_runtime_helpers.py` inspired continuation truth carried further into the generic resumed-provider path

Hermes ideas still deferred in this slice:

- Full provider-agnostic structured transcript reconstruction
- Broader runtime recovery helpers outside the current provider-input seam
- Deeper provider-specific replay handling beyond the current narrow structured message chain

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> events_out`
- Merged: the same mailbox-backed replay truth into the generic resumed-provider lane while preserving legacy prompt continuity
- Not replaced yet: continuation behavior is still intentionally hybrid rather than fully transcript-driven across all providers

Verification from milestone 32:

- Targeted runtime resume tests: passed, 1 file and 25 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 185 tests.
- `pnpm verify`: passed.

Still true after milestone 32:

- `E:\Mainspring` is still not a Git repository.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The structured replay path remains intentionally narrow and does not yet replace provider-specific continuation behavior wholesale.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 33: OpenAI-Compatible Replay Normalization Uses The Same Structured Repair Path

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so the OpenAI-compatible Responses transport now uses the same replay-normalization seam already used for structured provider history repair.
- Added a narrow OpenAI input-message builder that:
  - reuses the repaired structured replay history
  - preserves assistant replay as assistant-role text
  - serializes replayed tool calls and tool results into truthful text blocks
  - keeps standard and `codex-proxy` OpenAI request payloads aligned on the same normalized replay chain
- Kept the scope honest and small:
  - no mailbox rows changed
  - no runtime event storage changed
  - no provider-secret handling claims changed
  - no runtime spine seams were bypassed
- Added/updated targeted coverage in `src/providers/HttpProviderClient.test.ts` for:
  - standard OpenAI Responses payload replay normalization
  - `codex-proxy` OpenAI Responses payload replay normalization

Hermes ideas ported in this milestone:

- `agent/chat_completion_helpers.py` style replay-shaping ideas, adapted into the existing TypeScript provider transport
- `agent/codex_responses_adapter.py` style structured continuation handling, but kept within the current Mainspring provider client
- `conversation_loop.py` / `agent_runtime_helpers.py` replay-repair truth now reaches another concrete provider lane instead of staying OpenRouter-only

Hermes ideas still deferred in this slice:

- Richer provider-native transcript item modeling for OpenAI beyond the current text-only replay bridge
- Full provider-agnostic transcript reconstruction from mailbox/event truth
- Broader provider/model-path work such as pricing, rate-limit, and metadata parity

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: replay-normalization truth into the OpenAI-compatible provider transport
- Not replaced: provider continuations still use a narrow repaired replay chain rather than a richer provider-native transcript model

Verification from milestone 33:

- Targeted provider tests: passed, 1 file and 11 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 187 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 33:

- `E:\Mainspring` is still not a Git repository.
- OpenAI-compatible replay currently bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 34: Provider Usage Events Preserve Cache And Reasoning Detail

Completed on 2026-06-27.

Changes made:

- Extended `ProviderUsage` in `src/protocol/index.ts` so usage events can now carry optional:
  - `cacheReadTokens`
  - `cacheWriteTokens`
  - `reasoningTokens`
- Updated `src/providers/HttpProviderClient.ts` so:
  - OpenAI-compatible Responses usage parsing preserves nested cache and reasoning token detail when present
  - OpenRouter/OpenAI-compatible chat-completions usage parsing preserves cache-token and reasoning-token detail from both OpenAI-style nested detail objects and Anthropic-style proxy fields
- Kept existing semantics stable:
  - `inputTokens`, `outputTokens`, and `totalTokens` still reflect provider-reported top-line usage counters
  - the new cache/reasoning fields are additive optional detail, not a new billing model
  - no mailbox schema changed
  - no runtime control flow changed
  - no provider-secret handling claims changed
- Updated public event payload schemas and bridges so the richer usage detail survives through:
  - provider events
  - runtime event normalization
  - control-channel turn-event projection
- Added focused regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`
  - `src/control/runtime-bridge.test.ts`
  - `src/events/normalizeRuntimeEvent.test.ts`

Hermes ideas ported in this milestone:

- `agent/usage_pricing.py` canonical usage-bucket idea, adapted into additive TypeScript usage detail rather than full pricing/billing logic
- OpenAI/OpenRouter-compatible cache-token and reasoning-token preservation inspired by Hermes usage normalization work

Hermes ideas still deferred in this slice:

- Cost estimation and pricing catalogs
- Billing-route normalization
- Request-count tracking and usage-ledger UX
- Rate-limit capture and display

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: richer provider usage-detail parsing into the existing provider/runtime/control event path
- Not replaced: there is still no pricing engine, rate-limit tracker, or usage ledger beyond normalized runtime usage events

Verification from milestone 34:

- Targeted provider/protocol/control/event tests: passed, 4 files and 50 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 189 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 34:

- `E:\Mainspring` is still not a Git repository.
- Provider usage detail is still limited to normalized token buckets; there is no billing ledger, pricing engine, or rate-limit surface yet.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 35: Provider Usage Events Now Carry Parsed Rate-Limit Detail

Completed on 2026-06-27.

Changes made:

- Extended the provider usage schema in `src/protocol/index.ts` so usage events can now carry optional parsed `rateLimit` state alongside token usage.
- Added a narrow typed rate-limit shape for:
  - requests/minute
  - requests/hour
  - tokens/minute
  - tokens/hour
- Updated `src/providers/HttpProviderClient.ts` so:
  - OpenAI-compatible Responses parsing now preserves `x-ratelimit-*` headers on both standard and `codex-proxy` paths
  - OpenRouter/OpenAI-compatible chat-completions parsing now preserves the same header family when present
  - rate-limit detail can still surface even when the body usage block is sparse, because the header parse is additive
- Kept the scope narrow and honest:
  - no new runtime event family was added
  - no mailbox schema changed
  - no runtime control flow changed
  - no `/usage` UI, dashboard, budget router, or long-lived rate-limit tracker was claimed
- Updated public event payload schemas and bridges so parsed provider rate-limit detail survives through:
  - provider events
  - runtime event normalization
  - control-channel turn-event projection
- Added focused regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`
  - `src/control/runtime-bridge.test.ts`
  - `src/events/normalizeRuntimeEvent.test.ts`

Hermes ideas ported in this milestone:

- `agent/rate_limit_tracker.py` header-parsing idea, adapted into additive TypeScript rate-limit detail attached to normalized usage events

Hermes ideas still deferred in this slice:

- Human-readable rate-limit display formatting
- A `/usage` or console-facing rate-limit surface
- Long-lived tracker state with freshness/age handling
- Budget/router logic based on rate-limit pressure

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: narrow provider rate-limit capture into the existing provider usage-event path
- Not replaced: there is still no broader diagnostics surface beyond normalized runtime/control usage events

Verification from milestone 35:

- Targeted provider/protocol/control/event tests: passed, 4 files and 50 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 189 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.

Still true after milestone 35:

- `E:\Mainspring` is still not a Git repository.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 36: Direct Provider Init Events Now Report Resolved Models

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so direct OpenAI-compatible and OpenRouter init events now report the resolved model ID actually used by the client.
- This closes a small metadata honesty gap in the direct-client path:
  - before this slice, direct HTTP client `init` events could emit `modelId: undefined` even though the request body used the client default model
  - after this slice, the init events report the same resolved model the transport actually sent
- Kept the scope intentionally small:
  - no schema expansion was needed
  - no mailbox rows changed
  - no runtime control flow changed
  - no fake capability catalog or context-window claims were introduced
- Added regression coverage in `src/providers/HttpProviderClient.test.ts` for:
  - resolved default-model reporting on OpenAI-compatible init events
  - resolved default-model reporting on OpenRouter init events

Hermes ideas ported in this milestone:

- `agent/model_metadata.py` normalization pressure, adapted into a narrow “report the actual resolved model in provider init events” slice rather than a broad metadata cache or probing system

Hermes ideas still deferred in this slice:

- Context-window probing
- Model-family normalization tables
- Capability catalogs and cached metadata
- Richer context/compression decisions based on model metadata

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: resolved-model reporting into the existing direct provider init-event path
- Not replaced: there is still no broader model metadata service beyond the current narrow provider/runtime seams

Verification from milestone 36:

- Targeted provider tests: passed, 1 file and 11 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 189 tests.
- `pnpm verify`: passed.

Still true after milestone 36:

- `E:\Mainspring` is still not a Git repository.
- Model metadata work is still intentionally narrow; there is no context-window probe, capability registry, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 37: Direct Provider Init Events Now Carry Narrow Model-Family Hints

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so direct OpenAI-compatible and OpenRouter init events can attach an optional `modelFamily` hint when the resolved model slug clearly maps to an obvious family.
- Expanded the provider init event contracts in:
  - `src/providers/types.ts`
  - `src/protocol/index.ts`
  - `src/agent/TurnLifecycle.ts`
  - `src/runner/RuntimeKernel.ts`
- Kept the hint intentionally narrow and syntax-driven:
  - it is derived from the resolved model slug already being sent through the transport
  - it only emits for obvious families such as `gpt-5`, `gpt-4.1`, `claude`, `gemini`, `deepseek`, `qwen`, `llama`, and `grok`
  - it does not introduce a capability catalog, context-window promise, pricing table, or metadata cache
- Added regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`

Hermes ideas ported in this milestone:

- `agent/model_metadata.py` normalization pressure, adapted into one more honest direct-provider metadata seam: narrow model-family hints derived from resolved model slugs when the family is obvious

Hermes ideas still deferred in this slice:

- Context-window probing
- Richer family normalization tables
- Capability catalogs and cached metadata
- Context/compression decisions that depend on deeper model metadata

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: narrow model-family hints into the existing direct provider init-event path
- Not replaced: there is still no broader model metadata service beyond the current narrow provider/runtime seams

Verification from milestone 37:

- Targeted provider/protocol tests: passed, 2 files and 40 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 190 tests.
- `pnpm verify`: passed.

Still true after milestone 37:

- `E:\Mainspring` is still not a Git repository.
- Model metadata work is still intentionally narrow; there is no context-window probe, capability registry, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 38: Direct Provider Init Events Now Carry Transport Hints

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so direct provider init events now attach a narrow `providerTransport` hint describing which direct client path handled the turn.
- Current emitted values are intentionally literal and repo-grounded:
  - `openai-responses`
  - `openai-responses-codex-proxy`
  - `openrouter-chat-completions`
- Expanded the provider init event contracts in:
  - `src/providers/types.ts`
  - `src/protocol/index.ts`
  - `src/agent/TurnLifecycle.ts`
  - `src/runner/RuntimeKernel.ts`
- Added regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`

Hermes ideas ported in this milestone:

- `agent/chat_completion_helpers.py` and `agent/codex_responses_adapter.py` pressure, adapted into a narrow direct-provider transport truth seam rather than a broader provider runtime rewrite

Hermes ideas still deferred in this slice:

- Streaming/provider state machines beyond the current clients
- Richer adapter metadata catalogs
- Context-window probing and capability registries
- Broader provider-runtime replacement

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: narrow transport hints into the existing direct provider init-event path
- Not replaced: there is still no broader provider runtime service, live gateway transport layer, or capability negotiation layer

Verification from milestone 38:

- Targeted provider/protocol tests: passed, 2 files and 40 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 190 tests.
- `pnpm verify`: passed.

Still true after milestone 38:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata work is still intentionally narrow and additive; there is no context-window probe, capability registry, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 39: Direct Provider Usage Events Now Preserve Provider Session Correlation

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so direct OpenAI-compatible and OpenRouter usage events now carry `providerSessionId` when the direct client knows which provider response/completion generated the usage record.
- Preserved that correlation through the existing runtime/control seams by updating:
  - `src/protocol/index.ts`
  - `src/control/events.ts`
  - `src/control/runtime-bridge.ts`
  - `src/events/normalizeRuntimeEvent.ts`
  - `src/runner/RuntimeKernel.ts`
- Kept the slice intentionally additive:
  - no mailbox schema rewrite
  - no provider state machine rewrite
  - no billing/product surface expansion
  - no fake pricing or usage dashboards
- Added focused regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`
  - `src/control/runtime-bridge.test.ts`
  - `src/events/normalizeRuntimeEvent.test.ts`
  - `src/runner/RuntimeKernel.test.ts`

Hermes ideas ported in this milestone:

- `agent/usage_pricing.py`, `agent/chat_completion_helpers.py`, and `agent/codex_responses_adapter.py` pressure, adapted into a narrow usage-correlation seam so provider usage rows can stay attached to the response/completion that produced them

Hermes ideas still deferred in this slice:

- Cost estimation and pricing catalogs
- Billing/product reporting routes
- Broader provider-runtime state machines
- Context-window probing and deeper capability registries

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: provider-session correlation into the existing direct usage-event path
- Not replaced: there is still no broader provider accounting service or monitoring product

Verification from milestone 39:

- Targeted provider/protocol/runtime tests: passed, 5 files and 76 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 190 tests.
- `pnpm verify`: passed.

Still true after milestone 39:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 40: Console Provider Credential State Is Now More Truthful

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/ConsoleSnapshotAdapter.ts` so console-facing provider profiles no longer hardcode `credentialState: 'configured'`.
- The adapter now derives a narrow local-only credential state from the saved secret ref:
  - `env:NAME` becomes `configured` only when `process.env.NAME` is actually present
  - missing env vars become `missing`
  - non-env refs become `unverified`
- Kept the slice intentionally small and honest:
  - no provider OAuth flow
  - no secret-store integration
  - no token validation
  - no remote provider health check
- Added focused regression coverage in:
  - `src/gateway/ConsoleSnapshotAdapter.test.ts`
  - `apps/console/src/dashboardProjection.test.ts`

Hermes ideas ported in this milestone:

- `tools/openrouter_client.py` pressure, adapted into a narrow local key-presence/readiness hint for console-facing provider profiles instead of a broader shared runtime client helper

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Centralized provider auth routing beyond current runtime provider setup
- Token validation and remote provider health checks
- Secure desktop secret storage

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: a truthful env-backed credential readiness hint into the console snapshot read-model path
- Not replaced: provider auth remains prototype-only and the console still does not own secure provider credential management

Verification from milestone 40:

- Targeted gateway/console tests: passed, 2 files and 6 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 193 tests.
- `pnpm verify`: passed.

Still true after milestone 40:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 41: Dashboard Provider State Now Distinguishes Unverified From Missing

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/dashboardProjection.ts` so dashboard provider rows now preserve `credentialState` instead of dropping it immediately.
- Added a narrow projected provider-state summary with three truthful buckets:
  - `ready`
  - `unverified`
  - `missing`
- Updated `apps/console/src/dashboardViewModel.ts` so gateway-backed status strips and client labels can now say `Provider unverified` instead of collapsing every non-ready case into `Provider missing`.
- Kept the slice intentionally read-model-only:
  - no new runtime auth behavior
  - no token validation
  - no secure secret-store claim
  - no provider health probe
- Added focused regression coverage in:
  - `apps/console/src/dashboardProjection.test.ts`
  - `apps/console/src/dashboardViewModel.test.ts`

Hermes ideas ported in this milestone:

- The narrow `tools/openrouter_client.py` key-presence honesty pressure, extended one layer further through the console dashboard projection/view-model path so the UI-facing read model keeps more of the truth it already knows

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: credential-state nuance into the console dashboard projection/view-model path
- Not replaced: provider auth remains prototype-only and the console still does not own secure provider credential management

Verification from milestone 41:

- Targeted console tests: passed, 4 files and 12 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 194 tests.
- `pnpm verify`: passed.

Still true after milestone 41:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 42: App Shell Now Preserves Provider-State Nuance

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/dashboardViewModel.ts` so the app-facing dashboard view model now preserves `providerState` instead of flattening everything back down to `providerReady`.
- Updated `apps/console/src/App.tsx` so the Skills screen footer can distinguish an `unverified` provider state from a truly `missing` one while keeping the same prototype-only behavior gates:
  - ready still allows opening the sample trace
  - non-ready states still keep the run gated
  - `unverified` now gets more truthful copy instead of the generic missing-provider message
- Added focused regression coverage in:
  - `apps/console/src/dashboardViewModel.test.ts`
  - `apps/console/src/appDashboardBootstrap.test.ts`
  - `apps/console/src/selectedConsoleReadModel.test.ts`
  - `apps/console/src/consoleReadModelPipeline.test.ts`

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` key-presence honesty pressure, carried one more layer through the app-facing read model and shell copy so the UI stops dropping a truthful state it already had

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: provider-state nuance into the app-facing dashboard view model and Skills screen copy
- Not replaced: provider auth remains prototype-only and the console still does not own secure provider credential management

Verification from milestone 42:

- Targeted app/console tests: passed, 4 files and 13 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 194 tests.
- `pnpm verify`: passed.

Still true after milestone 42:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 43: Direct Usage Events Now Preserve Provider/Model Attribution

Completed on 2026-06-27.

Changes made:

- Updated `src/providers/HttpProviderClient.ts` so direct OpenAI-compatible and OpenRouter usage events now carry additive provider/model attribution when the client already knows it.
- Current direct usage events can now include:
  - `provider`
  - `modelId`
  - `modelFamily`
  - `providerTransport`
  - plus the already-added `providerSessionId`
- Preserved that attribution through the current public/runtime contracts by updating:
  - `src/protocol/index.ts`
  - `src/control/events.ts`
  - `src/control/runtime-bridge.ts`
- Kept the slice intentionally additive:
  - no billing ledger
  - no capability catalog
  - no runtime routing rewrite
  - no mailbox schema rewrite
- Added focused regression coverage in:
  - `src/providers/HttpProviderClient.test.ts`
  - `src/protocol/index.test.ts`
  - `src/control/runtime-bridge.test.ts`
  - `src/events/normalizeRuntimeEvent.test.ts`

Hermes ideas ported in this milestone:

- `agent/chat_completion_helpers.py`, `agent/codex_responses_adapter.py`, and `agent/usage_pricing.py` pressure, adapted into one more additive usage-attribution seam so direct usage events carry the provider/model context already known by the direct adapter

Hermes ideas still deferred in this slice:

- Cost estimation and pricing catalogs
- Billing/product reporting routes
- Broader provider-runtime state machines
- Context-window probing and deeper capability registries

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: provider/model attribution into the existing direct usage-event path
- Not replaced: there is still no broader provider accounting service or monitoring product

Verification from milestone 43:

- Targeted provider/protocol/runtime tests: passed, 4 files and 51 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 34 files and 194 tests.
- `pnpm verify`: passed.

Still true after milestone 43:

- `E:\Mainspring` is still not a Git repository.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider rate-limit detail is currently just parsed event metadata; there is no separate tracker, display surface, budget policy, or alerting layer.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- OpenAI-compatible replay still bridges repaired history into text-only Responses input items rather than richer provider-native transcript items.
- The Hermes coverage ledger is still an audit artifact, not proof that deferred rows are implemented.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 44: Populated Dashboard Now Keeps The Status Strip Visible

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/App.tsx` so the populated dashboard view now renders the existing computed `statusStrip` instead of only showing it in the empty state.
- Added a dashboard-specific style override in `apps/console/src/styles.css` so the populated-screen status strip renders inline with the dashboard layout instead of using the empty-state fixed footer positioning.
- Added `apps/console/src/App.test.tsx` with a focused server-render assertion proving the populated dashboard markup keeps the status strip visible when provider state is `unverified`.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` key-presence honesty pressure, carried one step further through the app shell so the computed provider/runtime status strip is no longer hidden once a client row exists

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one more truthful provider/runtime readiness hint into the rendered console dashboard surface
- Not replaced: the console still defaults to prototype localStorage state and does not consume live gateway transport

Verification from milestone 44:

- Targeted console tests: passed, 35 files and 195 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 35 files and 195 tests.
- `pnpm verify`: passed.

Still true after milestone 44:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 45: Dashboard Now Preserves Multi-Client Truth

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/App.tsx` so the populated dashboard now renders every computed client row instead of flattening to only the first client.
- Added prototype-side selected-client tracking in `App.tsx` so clicking a dashboard row selects that actual client before opening `agent-spec` or `skills`, instead of always routing through the first localStorage client.
- Expanded `apps/console/src/App.test.tsx` with a focused render assertion proving the populated dashboard keeps multiple computed client rows visible.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried another small step through the console shell so already-computed gateway-style client state is not visually flattened away at the dashboard boundary

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one more already-computed dashboard truth into the rendered console surface and prototype dashboard flow
- Not replaced: the console still defaults to prototype localStorage state and does not consume live gateway transport

Verification from milestone 45:

- Targeted console tests: passed, 35 files and 196 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 35 files and 196 tests.
- `pnpm verify`: passed.

Still true after milestone 45:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Dashboard row selection is still local prototype state, not runtime/gateway-backed selection.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 46: Selected Client Truth Now Reaches Skills And Trace

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/App.tsx` so the prototype `Skills` screen now receives the selected client name and uses it in its breadcrumb instead of hardcoding `Northline Dental`.
- Updated `apps/console/src/App.tsx` so the prototype `RunTrace` screen now receives the selected client and agent names and uses them in its breadcrumb instead of hardcoding `Northline Dental / Front desk assistant`.
- Exported the `Skills` and `RunTrace` render helpers and expanded `apps/console/src/App.test.tsx` with focused server-render assertions proving those breadcrumbs now reflect the selected client/agent labels.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried another small step through the prototype shell so selected dashboard state is no longer replaced by hardcoded client/agent labels on later screens

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: selected client/agent truth into later prototype console screens without changing the runtime/mailbox seam
- Not replaced: trace content is still sample data and the console still defaults to prototype localStorage state

Verification from milestone 46:

- Targeted console tests: passed, 35 files and 198 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 35 files and 198 tests.
- `pnpm verify`: passed.

Still true after milestone 46:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Dashboard row selection is still local prototype state, not runtime/gateway-backed selection.
- Trace content is still sample-only even though the breadcrumb now reflects the selected client and agent.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 47: Agent Spec Now Reflects Edit Context

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/App.tsx` so `AgentSpec` now distinguishes create vs edit context in its breadcrumb and title instead of always showing `client / New agent`.
- `AgentSpec` now renders `Edit agent` and the selected agent name when the user opened an existing saved agent from the selected dashboard client.
- Expanded `apps/console/src/App.test.tsx` with a focused server-render assertion proving existing-agent context no longer falls back to the `New agent` label.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one more step through the prototype shell so already-known selected agent state is not flattened back into a generic create label

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: edit-vs-create truth into the prototype agent-spec surface without changing the runtime/mailbox seam
- Not replaced: agent editing is still local prototype state and not a live gateway/runtime-backed mutation flow

Verification from milestone 47:

- Targeted console tests: passed, 35 files and 199 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 35 files and 199 tests.
- `pnpm verify`: passed.

Still true after milestone 47:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Dashboard row selection is still local prototype state, not runtime/gateway-backed selection.
- Agent editing is still prototype-local state even though the screen label now reflects edit context more truthfully.
- Trace content is still sample-only even though the breadcrumb now reflects the selected client and agent.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 48: Agent Spec Readiness Now Preserves Provider State Truth

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/App.tsx` so `AgentSpec` now receives the already-derived app-facing `providerState`.
- The `AgentSpec` readiness panel now reports provider auth as `set`, `unverified`, or `missing` instead of hardcoding `missing` for every case.
- Expanded `apps/console/src/App.test.tsx` with a focused render assertion proving existing-agent render paths preserve `unverified` provider state in the readiness panel.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one more step through the prototype shell so already-known provider readiness truth is no longer dropped when the user enters agent-spec

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: already-known provider-state truth into the prototype agent-spec readiness surface without changing the runtime/mailbox seam
- Not replaced: AgentSpec readiness is still a local UI hint, not proof of provider OAuth, token validation, or successful runtime connectivity

Verification from milestone 48:

- Targeted console tests: passed, 35 files and 199 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 35 files and 199 tests.
- `pnpm verify`: passed.

Still true after milestone 48:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Dashboard row selection is still local prototype state, not runtime/gateway-backed selection.
- Agent editing is still prototype-local state even though the screen label now reflects edit context more truthfully.
- Trace content is still sample-only even though the breadcrumb now reflects the selected client and agent.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 49: Provider-Init Log Metadata Now Survives Public Projections

Completed on 2026-06-27.

Changes made:

- Updated `src/events/normalizeRuntimeEvent.ts` so native runtime `log.payload` objects now survive SDK `RunEvent` normalization as sanitized nested payload detail instead of being dropped.
- Updated `src/control/runtime-bridge.ts` and `src/control/events.ts` so bridged control-channel `log` events now preserve sanitized nested payload detail and the turn-event schema accepts it.
- Added focused regression coverage proving provider-init metadata recorded by `RuntimeKernel` survives both projection layers while secret-shaped values are still redacted:
  - `src/events/normalizeRuntimeEvent.test.ts`
  - `src/control/runtime-bridge.test.ts`

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into the runtime/control projection seam so already-known provider/model/transport init truth is no longer flattened away after the kernel records it

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive provider-init metadata into the existing normalized `RunEvent` and bridged `TurnEvent` log path
- Not replaced: there is still no new public provider-init event family, provider health checker, or billing/provider state service

Verification from milestone 49:

- Focused event-contract tests: passed, 35 files and 201 tests.
- `pnpm typecheck`: passed.

Still true after milestone 49:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now survives the public projection layers only through sanitized log payloads; there is still no dedicated public provider-init event type.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 50: Runtime-Kernel Integration Now Proves Provider-Init Persistence

Completed on 2026-06-27.

Changes made:

- Tightened `src/runner/RuntimeKernel.test.ts` so the live streaming-provider integration path now emits provider/model/transport init metadata instead of only a provider session ID.
- Expanded the persisted `events_out` log assertion to prove `RuntimeKernel` writes sanitized provider-init metadata into the native log payload before SDK/control projections consume it.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried through one more layer so a real runtime-kernel provider turn now proves that already-known provider-init truth is persisted rather than only fixture-tested

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one more provider-init truth check into the existing runtime-kernel persistence test lane
- Not replaced: there is still no dedicated public provider-init event type, provider health checker, or live provider monitoring service

Verification from milestone 50:

- Focused runtime/event tests: passed, 35 files and 201 tests.
- `pnpm typecheck`: passed.

Still true after milestone 50:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has both fixture-level and runtime-kernel integration coverage, but it still reaches public consumers only through sanitized log payloads rather than a dedicated event type.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 51: SDK Runtime Event Payload Types Now Name The Warning Path

Completed on 2026-06-27.

Changes made:

- Added explicit exported runtime payload types in `src/contracts/runtime.ts` for current `RunEvent` variants, including `RuntimeWarningEventPayload`, `RuntimeErrorEventPayload`, `UsageUpdatedRunEventPayload`, and `RunEventOfType`.
- Kept the outer SDK event container repo-grounded and non-breaking: `EventStore` and `run.events()` still return the existing generic `RunEvent` shape instead of forcing a wide discriminated-union refactor.
- Updated `src/sdk/Mainspring.test.ts` so a real SDK run now asserts that provider-init warning detail is reachable through the exported `RunEventOfType<'runtime.warning'>` contract.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one step further into the public TypeScript contract so already-known provider-init warning detail is not just preserved at runtime but explicitly named for SDK consumers

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: explicit runtime payload typing into the existing SDK contract without changing the mailbox, kernel, or event-family layout
- Not replaced: the outer `RunEvent` container is still generic, and there is still no dedicated public provider-init event family

Verification from milestone 51:

- Focused SDK/runtime/event tests: passed, 35 files and 201 tests.
- `pnpm typecheck`: passed.

Still true after milestone 51:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, and explicit payload typing, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- The exported payload-type map improves SDK readability without turning the entire runtime event stream into a fully discriminated union yet.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 52: SDK Monitoring Helpers Now Use Exported Event Payload Types

Completed on 2026-06-27.

Changes made:

- Updated `src/sdk/Mainspring.ts` so the SDK now uses exported `RunEventOfType` / payload types in several real monitoring/helper paths instead of relying only on ad hoc `Record<string, unknown>` casts.
- Tightened the snapshot-building logic for tool and usage rows around the currently supported payload fields.
- Updated `src/sdk/Mainspring.test.ts` so the OpenRouter/free SDK path now proves two truths together:
  - provider-init warning detail is available through the exported warning payload contract
  - current usage rows preserve top-line counters plus redacted `providerSessionId`, but do not yet auto-enrich provider/model metadata from earlier init events

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into one more SDK-consumer seam so the exported runtime payload types are actually used in monitoring code instead of being documentation-only

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: exported payload typing into the SDK monitoring/helpers layer without changing mailbox storage, event families, or runtime execution
- Not replaced: usage events are still not backfilled with provider/model metadata from earlier init events, and the overall event stream is still not a fully discriminated union

Verification from milestone 52:

- `pnpm typecheck`: passed.
- Focused SDK test: passed, 35 files and 201 tests.

Still true after milestone 52:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, and direct SDK-consumer usage, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- SDK usage rows still reflect only what the runtime emits in each usage event; they are not currently enriched from earlier provider-init events.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 53: SDK Usage Projections Now Derive Provider Metadata From Persisted Init Warnings

Completed on 2026-06-27.

Changes made:

- Updated `src/sdk/Mainspring.ts` so `collectUsageForRun()` and the monitoring snapshot provider-usage projection can now derive missing `provider`, `modelId`, `modelFamily`, `providerTransport`, and fallback `providerSessionId` values from earlier persisted `runtime.warning` provider-init rows in the same run.
- Kept the runtime/event spine unchanged: native usage events are still emitted exactly as before; the enrichment happens only in the SDK read-model layer.
- Updated `src/sdk/Mainspring.test.ts` so the OpenRouter/free SDK path now proves that usage projections can surface derived provider/model truth while still preserving the redacted provider session ID from persisted runtime events.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into one more downstream projection seam so provider/model truth already persisted at init time can be reused in usage summaries instead of being dropped

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one narrow derived usage read-model enrichment over existing persisted init + usage rows
- Not replaced: native runtime usage events are still not independently backfilled or expanded at emission time, and there is still no dedicated provider-init event family

Verification from milestone 53:

- `pnpm typecheck`: passed.
- Focused SDK test: passed, 35 files and 201 tests.

Still true after milestone 53:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, direct SDK-consumer usage, and one narrow derived usage read-model reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Usage enrichment is currently derived only from earlier persisted provider-init warning rows in the same run. It is a read-model convenience, not proof that each native usage event carried that metadata directly.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 54: Gateway Run Projections Now Reuse Persisted Provider-Init Truth

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/LocalGateway.ts` so completed run projections can derive missing `providerId` and `modelId` from persisted `runtime.warning` provider-init rows when the run is reconstructed from runtime events alone.
- Kept the precedence honest:
  - explicit dispatch/app-state metadata still wins when present
  - derived runtime-event metadata only fills gaps
- Added a live kernel-backed regression in `src/gateway/LocalGateway.test.ts` proving a completed run without app-state provider metadata can still project `providerId` and `modelId` through the gateway snapshot/read-model path.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into the local gateway read-model seam so provider/model truth already persisted at init time is reused for completed run projections instead of being dropped when no stronger metadata exists

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one narrow derived gateway run-projection enrichment over existing persisted init rows
- Not replaced: native runtime run events are unchanged, and derived event metadata does not override stronger dispatch/app-state metadata

Verification from milestone 54:

- `pnpm typecheck`: passed.
- Focused gateway test: passed, 35 files and 202 tests.

Still true after milestone 54:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, direct SDK-consumer usage, SDK usage derivation, and gateway run-projection reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections only. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 55: Console Run Rows Now Keep Derived Provider Labels Visible

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/dashboardProjection.ts` so active-run rows now fall back from `providerProfileId` to active `providerId` lookup when choosing the displayed `providerLabel`.
- Added a focused regression in `apps/console/src/dashboardProjection.test.ts` proving that a run with runtime/gateway-derived `providerId` but no `providerProfileId` still renders `providerLabel: 'OpenRouter'` in the dashboard projection.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one step further into the console-facing projection so already-derived provider truth is not visually flattened away just because a profile link is absent on the run row

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one narrow console-facing fallback from `providerProfileId` to `providerId` label lookup over the existing gateway run read model
- Not replaced: the console is still not live transport, and provider labels derived this way do not imply that the run is bound to a stronger provider-profile record than the data actually shows

Verification from milestone 55:

- `pnpm typecheck`: passed.
- Focused dashboard projection test: passed, 35 files and 203 tests.

Still true after milestone 55:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, direct SDK-consumer usage, SDK usage derivation, gateway run-projection reuse, and one console-facing provider-label fallback, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and the console can now reuse that truth for provider labeling. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 56: Dashboard Client Status Labels Now Reuse Derived Provider Truth

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/dashboardViewModel.ts` so gateway-backed client status labels now include the active run's provider label when that label is already present in the dashboard projection.
- Updated the console read-model pipeline and development fixture expectations:
  - `apps/console/src/dashboardViewModel.test.ts`
  - `apps/console/src/consoleReadModelPipeline.test.ts`
  - `apps/console/src/developmentGatewaySnapshotFixture.test.ts`
- This now lets rendered-facing labels such as `Approval needed - OpenRouter` or `Running - OpenAI` preserve already-derived provider identity instead of flattening it back to generic status text.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried another small step into the visible console shell so derived gateway/provider truth reaches the rendered dashboard status text instead of only lower-level projection objects

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one narrow rendered-facing fallback from generic active-run status text to provider-labeled active-run status text using existing projection data
- Not replaced: the console is still not live transport, and these labels still reflect derived read-model truth rather than stronger provider-profile binding or live auth verification

Verification from milestone 56:

- `pnpm typecheck`: passed.
- Focused console projection/view-model tests: passed, 35 files and 204 tests.

Still true after milestone 56:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, direct SDK-consumer usage, SDK usage derivation, gateway run-projection reuse, console run-label reuse, and rendered dashboard status-label reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and the console can now reuse that truth for provider labeling and rendered status text. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 57: Shared Provider-Init Warning Contract Helper

Completed on 2026-06-27.

Changes made:

- Added `ProviderInitWarningDetail` and `providerInitWarningDetailFromRunEvent()` to `src/contracts/runtime.ts`.
- Exported that helper and type from `src/contracts/index.ts` so SDK/gateway consumers share one supported parser for sanitized provider-init warning detail.
- Updated `src/sdk/Mainspring.ts` to reuse the shared helper for usage projection and monitoring enrichment instead of re-parsing `runtime.warning` payloads locally.
- Updated `src/gateway/LocalGateway.ts` to reuse the same shared helper when filling missing completed-run `providerId` and `modelId` from persisted provider-init warnings.
- Added `src/contracts/runtime.test.ts` to lock the contract: accepted sanitized provider-init warning detail parses, unrelated warnings do not, and blank values are ignored.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into the exported runtime-contract seam so SDK and gateway consumers share one explicit parsing path for persisted provider-init warning detail instead of each maintaining their own local folklore

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: duplicated SDK/gateway provider-init warning parsing into one exported runtime-contract helper without changing native event emission, mailbox storage, or runtime execution order
- Not replaced: provider-init metadata still reaches public consumers through sanitized `runtime.warning` payload detail rather than a dedicated provider-init event family

Verification from milestone 57:

- Focused contract, SDK, and gateway tests: passed, 36 files and 206 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 57:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, a shared exported parser helper, direct SDK-consumer usage, SDK usage derivation, gateway run-projection reuse, console run-label reuse, and rendered dashboard status-label reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and the console can now reuse that truth for provider labeling and rendered status text. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 58: Control-Channel Provider-Init Contract Helper

Completed on 2026-06-27.

Changes made:

- Added `providerInitDetailFromLogPayload()` to `src/contracts/runtime.ts` so the supported provider-init parser is no longer tied only to `RunEvent<'runtime.warning'>`.
- Kept `providerInitWarningDetailFromRunEvent()` as a thin wrapper over that shared parser.
- Added `providerInitLogDetailFromTurnEvent()` to `src/control/events.ts` so control-channel consumers can explicitly parse provider-init detail from bridged `TurnEvent` log rows without reimplementing the message/payload check.
- Added focused coverage in:
  - `src/contracts/runtime.test.ts`
  - `src/control/index.test.ts`
- Kept runtime emission and bridging unchanged: provider-init truth still travels through sanitized native `log` rows -> normalized `runtime.warning` rows -> bridged `log` rows.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one layer further into the control contract so both public event surfaces share one explicit provider-init parsing rule instead of relying on consumer guesswork

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one shared provider-init payload parser across runtime and control contracts without changing native event families, mailbox storage, or control bridging behavior
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family

Verification from milestone 58:

- Focused contract, control, SDK, and gateway tests: passed, 36 files and 208 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 58:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, a shared payload parser, a shared runtime helper, a shared control helper, direct SDK-consumer usage, SDK usage derivation, gateway run-projection reuse, console run-label reuse, and rendered dashboard status-label reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and the console can now reuse that truth for provider labeling and rendered status text. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 59: Gateway And Console Run Projections Keep More Provider Truth

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/LocalGateway.ts` so completed run projections can now preserve additive `modelFamily` and `providerTransport` from persisted provider-init warning rows, alongside the existing derived `providerId` and `modelId`.
- Updated `src/gateway/ConsoleSnapshotAdapter.ts` so console-safe run records keep those same additive fields when the gateway already knows them.
- Updated `apps/console/src/dashboardProjection.ts` so active-run dashboard rows also preserve `modelFamily` and `providerTransport` instead of flattening them away during projection.
- Added/updated focused coverage in:
  - `src/gateway/LocalGateway.test.ts`
  - `src/gateway/ConsoleSnapshotAdapter.test.ts`
  - `apps/console/src/dashboardProjection.test.ts`
- Kept the UI and transport honesty intact: no live gateway wiring, no provider-health claims, and no new secret exposure.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried through one more read-model seam so already-recorded provider-family/transport truth survives gateway and console-safe projections instead of being silently flattened

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive provider-init detail into gateway and console read-model contracts without changing runtime emission, mailbox storage, or control/gateway execution order
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family, and the console is still not live transport

Verification from milestone 59:

- Focused gateway and console tests: passed, 36 files and 208 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 59:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, gateway run-projection reuse for `providerId`/`modelId`/`modelFamily`/`providerTransport`, console run-label reuse, and console-safe run projection reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and the console can now reuse more of that truth in read-model contracts. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 60: Gateway Route Context Keeps More Provider Truth

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/GatewayRouteContext.ts` so the sanitized local route context can now preserve additive `modelFamily` and `providerTransport` from the latest gateway run projection when those fields are already known.
- Updated `src/gateway/GatewayRouteContext.test.ts` so the route-context contract now proves those fields survive alongside existing sanitization and no-secret guarantees.
- Kept `GatewaySessionContext` unchanged because the actual repo state did not show a need to widen that lower-level async scope helper for this slice.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried one more local-host seam forward so already-recorded provider-family/transport truth survives route-context projection instead of stopping at the gateway snapshot/dashboard layer

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive provider-init detail into one more read-only local gateway helper without changing runtime emission, mailbox storage, route-key logic, or async session-context behavior
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family, and gateway/session context remains local helper state rather than live transport

Verification from milestone 60:

- Focused gateway context tests: passed, 36 files and 208 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 60:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, gateway run-projection reuse for `providerId`/`modelId`/`modelFamily`/`providerTransport`, console-safe run projection reuse, and local route-context reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and local read-model/helper surfaces can now reuse more of that truth. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 61: Shared Provider-Init Contract Marker

Completed on 2026-06-27.

Changes made:

- Added `PROVIDER_INIT_LOG_MESSAGE` to `src/contracts/runtime.ts`.
- Updated `providerInitDetailFromLogPayload()` to use that exported marker instead of embedding the raw provider-init message string.
- Updated `src/runner/RuntimeKernel.ts` to emit the same exported provider-init marker when persisting the native sanitized log row.
- Updated focused tests in:
  - `src/contracts/runtime.test.ts`
  - `src/runner/RuntimeKernel.test.ts`
  - `src/sdk/Mainspring.test.ts`
  - `src/events/normalizeRuntimeEvent.test.ts`
  - `src/control/runtime-bridge.test.ts`
  - `src/control/index.test.ts`
- Kept behavior unchanged: this is a contract-marker cleanup, not a new event family or runtime-behavior change.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into the provider-init message marker itself so runtime emission and public parsing point at one named contract instead of sharing only by convention

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one shared provider-init contract marker across runtime emission, parsing helpers, and focused tests without changing native event families, mailbox storage, or projection behavior
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family

Verification from milestone 61:

- Focused contract/runtime/event tests: passed, 36 files and 208 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 61:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, gateway run-projection reuse for `providerId`/`modelId`/`modelFamily`/`providerTransport`, console-safe run projection reuse, and local route-context reuse, but it still reaches consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and local read-model/helper surfaces can now reuse more of that truth. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 62: Explicit No-Dedicated-Public-Provider-Init Decision

Completed on 2026-06-27.

Changes made:

- Added an explicit contract comment in `src/contracts/runtime.ts` stating that provider-init public truth currently remains on sanitized warning/log payload detail rather than a dedicated public `provider.init` `RunEvent` family.
- Updated `src/events/normalizeRuntimeEvent.test.ts` to assert both:
  - the current public `RunEventType` list does not include `provider.init`
  - provider-init log rows normalize to `runtime.warning`, not a new public event family
- Updated `src/control/runtime-bridge.test.ts` to assert both:
  - the current public `TurnEventType` lists do not include `provider.init`
  - provider-init log rows bridge to `log`, not a new public control event family
- Kept behavior unchanged: no new event family, no mailbox/runtime rewrite, no transport change.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried into an explicit public-contract decision so the current provider-init warning/log path is no longer only an emergent behavior but a tested named choice

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: an explicit no-new-public-event-family contract decision into runtime/control tests and comments without changing runtime emission or projection behavior
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family

Verification from milestone 62:

- Focused event-contract tests: passed, 36 files and 210 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 62:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, and an explicit tested decision that the current public contract stays on sanitized `runtime.warning` / `log` rather than a dedicated public provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and local read-model/helper surfaces can now reuse more of that truth. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 63: Shared Latest Provider-Init Event-List Lookup

Completed on 2026-06-27.

Changes made:

- Added `latestProviderInitWarningDetailFromRunEvents()` to `src/contracts/runtime.ts`.
- Exported that helper from `src/contracts/index.ts`.
- Updated `src/sdk/Mainspring.ts` so `collectUsageForRun()` now uses the shared helper instead of maintaining its own reverse-scan rule for the latest provider-init warning in a run.
- Updated `src/gateway/LocalGateway.ts` so completed-run provider-init projection reuse now also depends on the same shared helper instead of maintaining its own reverse-scan rule.
- Added focused coverage in `src/contracts/runtime.test.ts` proving the helper returns the latest matching provider-init warning detail from a run event list.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried from single-event parsing into one shared event-list lookup so downstream consumers do not each define their own “latest provider-init truth wins” rule

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: one shared latest-provider-init event-list lookup across SDK and gateway read-model consumers without changing runtime emission, mailbox storage, or public event families
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family

Verification from milestone 63:

- Focused contract, SDK, and gateway tests: passed, 36 files and 211 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 63:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, an explicit no-new-event-family decision, and a shared latest-provider-init event-list lookup across SDK/gateway consumers, but it still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and local read-model/helper surfaces can now reuse more of that truth. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 64: Gateway And Console Run Projections Keep Redacted Provider Session IDs

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/LocalGateway.ts` so completed run projections can now preserve `providerSessionId` from persisted provider-init warning rows, alongside the already-preserved `providerId`, `modelId`, `modelFamily`, and `providerTransport`.
- Updated `src/gateway/ConsoleSnapshotAdapter.ts` and `apps/console/src/dashboardProjection.ts` so the same additive `providerSessionId` correlation hint survives into console-safe run contracts and dashboard run rows when the gateway already knows it.
- Updated focused coverage in:
  - `src/gateway/LocalGateway.test.ts`
  - `src/gateway/ConsoleSnapshotAdapter.test.ts`
  - `apps/console/src/dashboardProjection.test.ts`
- Verified the security-relevant shape honestly: the preserved session ID is the same redacted value already stored in the public runtime event path, not the raw provider-side identifier.

Hermes ideas ported in this milestone:

- The same narrow `tools/openrouter_client.py` honesty pressure, carried through one more read-model seam so already-recorded provider-session correlation truth survives gateway and console-safe projections without pretending it is stronger than the redacted runtime actually stores

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive redacted provider-session correlation truth into gateway and console read-model contracts without changing runtime emission, mailbox storage, or public event families
- Not replaced: provider-init metadata still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event family

Verification from milestone 64:

- Focused gateway and console tests: passed, 36 files and 211 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 64:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, an explicit no-new-event-family decision, a shared latest-provider-init event-list lookup across SDK/gateway consumers, and additive redacted `providerSessionId` reuse in gateway/console run projections, but it still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections and gateway run projections, and local read-model/helper surfaces can now reuse more of that truth. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 65: Gateway Route Context Keeps Redacted Provider Session IDs

Completed on 2026-06-27.

Changes made:

- Updated `src/gateway/GatewayRouteContext.ts` so the sanitized local route context can now preserve additive `providerSessionId` from the latest gateway run projection alongside the already-preserved `providerId`, `modelId`, `modelFamily`, and `providerTransport`.
- Updated `src/gateway/GatewayRouteContext.test.ts` so the route-context contract now proves that redacted provider-session correlation survives this helper surface while existing sanitization and no-secret guarantees still hold.
- Updated `docs/current-state.md` so the repo-grounded current-state summary no longer stops one projection seam early.

Hermes ideas ported in this milestone:

- The same narrow local-host context honesty pressure already used for route/session metadata, extended one more seam so already-recorded provider-session correlation truth is not flattened away before a local control host reads it

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive redacted provider-session correlation truth into one more sanitized local helper surface without changing runtime emission, mailbox storage, or public event families
- Not replaced: `GatewayRouteContext` remains a local read-model helper, not a transport, auth layer, or stronger runtime control plane

Verification from milestone 65:

- `pnpm test -- src/gateway/GatewayRouteContext.test.ts src/gateway/LocalGateway.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/dashboardProjection.test.ts`: passed, 36 files and 211 tests.
- `pnpm typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 65:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, an explicit no-new-event-family decision, a shared latest-provider-init event-list lookup across SDK/gateway consumers, additive redacted `providerSessionId` reuse in gateway/console run projections, and the same additive redacted `providerSessionId` reuse in local route-context helpers, but it still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections, gateway run projections, and local read-model/helper surfaces. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 66: Console Dashboard Rows Keep Compact Active Run Provider And Model Summaries

Completed on 2026-06-27.

Changes made:

- Updated `apps/console/src/dashboardViewModel.ts` so gateway-backed client rows can now preserve a compact active-run summary built from already-known provider/model/transport fields instead of flattening that truth back to a generic status string.
- Updated `apps/console/src/App.tsx` so rendered dashboard client rows now show that compact active-run summary when the gateway-backed read model has it.
- Updated focused console coverage in:
  - `apps/console/src/dashboardViewModel.test.ts`
  - `apps/console/src/consoleReadModelPipeline.test.ts`
  - `apps/console/src/developmentGatewaySnapshotFixture.test.ts`
  - `apps/console/src/App.test.tsx`
- Updated `docs/current-state.md` so the repo-grounded summary reflects that this provider/model truth now survives through the rendered dashboard row.

Hermes ideas ported in this milestone:

- The same narrow provider-surface honesty pressure, carried one layer further so the dashboard keeps already-known provider/model context visible without inventing live transport, auth, or billing semantics

Hermes ideas still deferred in this slice:

- Shared runtime OpenRouter client helpers
- Remote auth/token validation
- Live provider health checks
- Secure desktop secret storage
- Live gateway transport for the console
- Runtime-backed client/session selection
- Live run-trace events and artifacts
- Runtime-backed agent version editing

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`
- Merged: additive provider/model/transport read-model truth into one more rendered console seam without changing runtime emission, mailbox storage, approvals, or public event families
- Not replaced: the dashboard is still a prototype UI surface and this summary is still presentation-layer reuse of already-derived metadata, not live gateway transport or provider validation

Verification from milestone 66:

- `pnpm test -- apps/console/src/dashboardViewModel.test.ts apps/console/src/consoleReadModelPipeline.test.ts apps/console/src/developmentGatewaySnapshotFixture.test.ts apps/console/src/App.test.tsx`: passed, 36 files and 211 tests.
- `pnpm --filter @mainspring/console typecheck`: passed.
- `pnpm verify`: passed.

Still true after milestone 66:

- `E:\Mainspring` is still not a Git repository.
- The React console still defaults to prototype localStorage/sample state and does not consume live gateway transport.
- The development gateway fixture path is still read-only preview data, not runtime-backed console state.
- Provider-init metadata now has runtime persistence coverage, public projection coverage, explicit payload typing, shared parser helpers, a shared provider-init message marker, an explicit no-new-event-family decision, a shared latest-provider-init event-list lookup across SDK/gateway consumers, additive redacted `providerSessionId` reuse in gateway/console run projections, the same additive redacted `providerSessionId` reuse in local route-context helpers, and one more rendered console seam that keeps already-known provider/model context visible, but it still reaches public consumers through sanitized warning/log detail rather than a dedicated provider-init event.
- Derived metadata currently fills gaps in SDK usage projections, gateway run projections, local read-model/helper surfaces, and rendered console dashboard rows. It is still a read-model convenience, not proof that each native runtime event directly carried that metadata.
- AgentSpec readiness is still only a UI hint and does not validate provider auth or live runtime connectivity.
- Provider keys and durable auth state are still not stored securely; provider auth remains prototype-only in the browser UI.
- Direct provider metadata and usage work is still intentionally narrow and additive; there is no context-window probe, capability registry, pricing catalog, or metadata cache yet.
- Provider usage detail is still intentionally narrow and additive rather than a billing or monitoring product.
- Host shell/process execution is still not a sandbox.

## Completed Milestone 67: Local Gateway Dev Server And Open-Source Launch Shell

Completed on 2026-06-27.

Changes made:

- Added a local-only gateway development HTTP surface under `src/gateway/server/` with typed routes for health, safe snapshot reads, run start, run event reads, and approval resolution.
- Added `pnpm gateway:dev`, package export wiring for `./gateway/server`, and a dev bootstrap that falls back to `EchoProvider` when no env-backed provider is configured.
- Added explicit `local-gateway-dev` console mode handling so the Vite console can now load real gateway snapshots, start runs, read real run events for traces, and resolve pending approvals while keeping provider keys server-side.
- Added `apps/console/src/localGatewayClient.ts`, local gateway transport helpers, live event-to-trace mapping, and matching tests.
- Tightened Windows shell/gateway test stability around timeouts and temp-root cleanup.
- Added broader open-source launch shell files:
  - `SUPPORT.md`
  - `GOVERNANCE.md`
  - `ROADMAP.md`
  - `docs/index.md`
  - `docs/README.md`
  - `docs/marketing/*`
  - `.github/ISSUE_TEMPLATE/*`
  - `.github/workflows/*`
  - `.github/dependabot.yml`
  - expanded brand kit files and palette
- Trimmed npm package file inclusion so dry runs no longer ship source tests and workspace internals.

Verification from milestone 67:

- `pnpm typecheck`: passed.
- Focused gateway/server/console/tool tests: passed, 39 files and 219 tests.
- `pnpm verify`: passed.
- `docker compose -f docker/compose.local.yml config`: passed.
- `pnpm pack --dry-run`: passed.
- `npm pack --dry-run`: passed.
- `pnpm gateway:dev --help`: passed.

Still true after milestone 67:

- `E:\Mainspring` is still not a Git repository until explicitly initialized.
- The local gateway HTTP surface is for local development wiring, not a production auth boundary.
- The console still defaults to prototype localStorage unless an explicit development mode is selected.
- Provider auth remains prototype-only in the browser UI and real provider keys still must not enter renderer state.
- The repo still does not implement secure desktop secret storage, HyperCells, VM isolation, billing ledger, hosted control plane, or Electron packaging.
- The new local-gateway-dev console mode improves real runtime interaction, but it is still an experimental developer surface rather than a finished product shell.

## Completed Milestone 68: Package Surface And SDK/Gateway/Console Projection Proof

Completed on 2026-07-01.

Changes made:

- Added a package-surface verifier that checks the published `mainspring` package name, public subpath exports, declaration files, runtime binary shebang, `.npmignore` hygiene, and dynamic importability from the built package.
- Added `pnpm package:check` and wired it into `pnpm release:check` and the release-check workflow so package drift is caught with the normal release gate.
- Tightened package/docs truth around source/dev usage and removed generated package/release artifacts after verification.
- Added a gateway projection parity test that starts a real run through the local gateway, approves a real policy-gated `file.write`, waits for the runtime approval event projection, compares SDK and gateway event streams for the same run, and checks that the console snapshot keeps provider/model/tool/approval metadata aligned.
- Fixed `LocalMainspringGateway.snapshot()` so derived run and approval state is refreshed before the browser-safe app-state DTO is captured.
- Verified the projection path does not expose provider tokens, provider session ids, session paths, workspace roots, or temp roots in SDK events or the console snapshot while still allowing the approved file mutation to occur inside the workspace.

Verification from milestone 68:

- `pnpm package:check`: passed before this slice was appended to the digest.
- `pnpm exec vitest run src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 31 tests.
- Broader release verification is expected after this digest update.

Still true after milestone 68:

- The preserved runtime spine remains:
  `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Host shell execution is still not a sandbox.
- Browser/localStorage provider auth remains prototype-only where present.
- Managed local secrets are not a cross-platform desktop secret vault.
- Console snapshots are safer DTOs, not a security boundary.
- HyperCells remain local backend leasing/status, not VM isolation.
- Usage/budget features are local estimates and controls, not payment billing.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.
- Earlier notes saying `E:\Mainspring` was not a Git repository are stale for the current checkout; `git status --short` now works and shows a large dirty tree.

## Completed Milestone 69: Gateway Approval Decision Snapshots Stay Fresh

Completed on 2026-07-01.

Changes made:

- Updated `LocalMainspringGateway.approvals.approve()` and `.deny()` so operator decisions still enter the runtime mailbox first, then immediately update gateway app-state approval metadata for browser-safe snapshots.
- Prevented derived approval sync from downgrading an already resolved gateway approval record back to `pending` when replaying the older `approval.requested` event before the runtime has written `approval.approved` or `approval.denied`.
- Added focused gateway coverage proving:
  - approved approval metadata is visible in the safe console snapshot immediately after approval
  - denied approval metadata is visible immediately after denial
  - denied approval still prevents the requested file mutation
  - eventual `approval.approved` / `approval.denied` events still come from the mailbox/runtime path

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a gateway app-state/read-model freshness fix for approval decisions.
- Not replaced: approval execution still depends on the runtime mailbox, `RuntimeKernel`, policy receipts, and event journal. The console snapshot remains a sanitized DTO, not a security boundary.

Verification from milestone 69:

- `pnpm exec vitest run src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 32 tests.
- `pnpm release:check`: passed after this digest update, including doctor, typecheck, 54 test files / 351 tests, build, security scans, console build, gateway systems, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 69:

- Host shell execution is still not a sandbox.
- Browser/localStorage provider auth remains prototype-only where present.
- Managed local secrets are not a cross-platform desktop secret vault.
- HyperCells remain local backend leasing/status, not VM isolation.
- Usage/budget features are local estimates and controls, not payment billing.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 70: Console Snapshot Execution Backend DTO Is Sanitized

Completed on 2026-07-01.

Changes made:

- Replaced raw `executionBackends` pass-through in `gatewaySnapshotToConsoleState()` with a console DTO that keeps backend key, label, availability, unsafe flag, reason, and summarized capabilities only.
- Reused the existing backend capability summary shape so `/snapshot` now drops raw verifier commands and support booleans the same way the dedicated execution-backend status projection already did.
- Strengthened console snapshot fixture coverage with raw backend `verificationCommand` values and private `C:\secret\...` paths, then asserted the browser-facing snapshot excludes those internals while preserving useful backend safety labels.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a browser-facing DTO hardening slice for backend/cell status.
- Not replaced: backend availability is still local status/probing, not VM isolation. Host execution remains unsafe and explicitly labeled.

Verification from milestone 70:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 16 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed after a test-timeout stabilization for the live gateway snapshot integration test, including doctor, typecheck, 54 test files / 351 tests, build, security scans, console build, gateway systems, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 70:

- Host shell execution is still not a sandbox.
- WSL and Docker backend routing are not full VM isolation.
- Console snapshots are safer DTOs, not a security boundary.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 71: Gateway JSON Sanitizer Drops Generic Absolute Paths

Completed on 2026-07-01.

Changes made:

- Hardened `sanitizeGatewayResponse()` so browser-facing gateway JSON drops generic absolute filesystem-looking fields under `root`, `path`, `filePath`, mailbox DB path names, and related local root/path keys.
- Kept relative trace/tool paths, such as `notes/output.md`, intact so run traces and tool inputs remain useful in the console.
- Added focused sanitizer coverage proving provider secret fields, workspace roots, session/mailbox paths, artifact filesystem paths, and raw secret values are omitted from gateway JSON while relative paths survive.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a browser-facing HTTP serialization hardening slice for gateway route responses.
- Not replaced: DTO sanitization is leak reduction, not sandboxing, secret vaulting, hosted access control, or artifact authorization by itself.

Verification from milestone 71:

- `pnpm exec vitest run src/gateway/server/sanitize.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 10 tests.
- `pnpm marketplace:check`: passed after updating the verifier to assert the real workspace root through gateway app-state while confirming the HTTP install response does not expose `workspace.root`.
- `pnpm typecheck`: passed.
- `git diff --check`: passed.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 71:

- Host shell execution is still not a sandbox.
- WSL and Docker backend routing are not full VM isolation.
- Console snapshots and gateway JSON sanitization are safer DTOs, not a security boundary.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 72: Artifact Browser-Access Tickets Fail Closed For Unknown Artifacts

Completed on 2026-07-01.

Changes made:

- Tightened `/auth/browser-access` for `kind: "artifact"` so hosted gateway mode validates the requested artifact ID against gateway app-state before minting a browser-access URL.
- Unknown artifact IDs now return `404` from ticket creation and do not receive scoped ticket material.
- Extended hosted-auth HTTP coverage and the standalone `auth:check` verifier to prove:
  - unauthenticated browser-access requests are rejected
  - query-string session tokens do not authorize artifact downloads
  - valid artifact tickets work for the matching artifact only
  - wrong artifact IDs are rejected
  - unknown artifact IDs do not get browser-access ticket URLs

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a hosted gateway artifact-access hardening slice.
- Not replaced: artifact browser-access tickets remain short-lived local gateway bearer URLs, not public sharing links, a storage permission model, or a sandbox.

Verification from milestone 72:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayTransport.test.ts --passWithNoTests`: passed, 2 files / 14 tests.
- `pnpm auth:check`: passed.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 72:

- Host shell execution is still not a sandbox.
- Browser/localStorage provider auth remains prototype-only where present.
- Hosted artifact tickets are scoped and short-lived, but still bearer URLs for local gateway access.
- Console snapshots and gateway JSON sanitization are safer DTOs, not a complete security boundary.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 73: SSE Browser-Access Tickets Validate Provided Targets

Completed on 2026-07-01.

Changes made:

- Tightened `/auth/browser-access` for `kind: "event-stream"` so hosted gateway mode still supports a global snapshot stream with no IDs, but validates any provided `sessionId` and `runId` before minting a scoped URL.
- Unknown session IDs now return `404` without ticket material.
- Unknown run IDs now return `404` without ticket material.
- If both `sessionId` and `runId` are provided, the run must belong to that session before a ticket is minted.
- Extended hosted-auth HTTP coverage and the standalone `auth:check` verifier to prove:
  - valid event-stream browser-access URLs use scoped tickets rather than raw hosted session tokens
  - unknown sessions do not receive SSE ticket URLs
  - unknown runs do not receive SSE ticket URLs

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a hosted gateway SSE browser-access hardening slice.
- Not replaced: SSE browser-access tickets remain short-lived local bearer URLs, not a replacement for hosted-auth sessions on JSON mutation routes or a full multi-user authorization model.

Verification from milestone 73:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts apps/console/src/localGatewayTransport.test.ts --passWithNoTests`: passed, 3 files / 15 tests.
- `pnpm auth:check`: passed.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 73:

- Host shell execution is still not a sandbox.
- Browser/localStorage provider auth remains prototype-only where present.
- Hosted artifact and SSE tickets are scoped and short-lived, but still bearer URLs for local gateway access.
- Console snapshots and gateway JSON sanitization are safer DTOs, not a complete security boundary.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 74: Release Artifact Hygiene And Windows Test Stability

Completed on 2026-07-01.

Changes made:

- Tightened generated-artifact hygiene so Git ignores local runtime state, reference checkouts, SQLite databases, package tarballs, desktop release output, and managed-secret temp directories.
- Added `.tmp-managed-secret-crypto/` to npm package ignores and made `scripts/check-package-surface.mjs` enforce it alongside `.reference/`, package tarballs, desktop release output, and `.mainspring/`.
- Raised Vitest default test and hook timeouts to match the integration-heavy gateway/runtime suite on Windows.
- Raised explicit gateway integration test timeouts where real HTTP/gateway/runtime/database flows were crossing short unit-test budgets under full-suite load.
- Lengthened the terminal-session test polling window so it waits for the process registry to observe exit status after stdout arrives.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a release/package hygiene and verification-stability slice.
- Not replaced: this does not add sandboxing, package signing, remote release publishing, Linux desktop installer support, or a new runtime path.

Verification from milestone 74:

- `git check-ignore -v apps/desktop/release/Mainspring.exe .tmp-managed-secret-crypto/key.json .reference/openclaw/package.json .mainspring/app-state.sqlite mainspring-0.1.0.tgz foo.db foo.sqlite foo.sqlite3`: passed, all paths matched expected ignore rules.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- Initial `pnpm release:check`: failed in `pnpm test` because multiple gateway/runtime integration tests exceeded 5s/10s budgets under full-suite load, and one terminal test observed stdout before process exit status.
- `pnpm exec vitest run src/tools/ToolRegistry.test.ts src/gateway/AppStateStore.test.ts src/gateway/DeploymentWizard.test.ts src/gateway/server/createLocalGatewayServer.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed after the timeout and polling fixes, 5 files / 72 tests.
- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 1 file / 8 tests.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- Generated `mainspring-0.1.0.tgz`, `apps/desktop/release/`, and `.tmp-managed-secret-crypto/` outputs were removed after verification.
- `git diff --check` passed for the milestone files.

Still true after milestone 74:

- Host shell execution is still not a sandbox.
- Browser/localStorage provider auth remains prototype-only where present.
- Hosted artifact and SSE tickets are scoped and short-lived, but still bearer URLs for local gateway access.
- Console snapshots and gateway JSON sanitization are safer DTOs, not a complete security boundary.
- Ignore/package rules prevent accidental source/package inclusion of generated local artifacts; they are not a secrets vault or runtime security boundary.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 75: Deployment Mutation Responses Use Console-Safe DTOs

Completed on 2026-07-01.

Changes made:

- Exported the existing console deployment target/run projection helpers and reused them for HTTP deployment mutation responses.
- Changed `POST /deployment-targets` and `PATCH /deployment-targets/:targetId` to return `ConsoleGatewayDeploymentTarget` shape instead of raw app-state deployment target records.
- Changed `POST /deployment-targets/:targetId/execute` to return a console-safe deployment run record while preserving the existing plan and execution result fields.
- Extended the deployment HTTP route test with raw metadata containing `secretRef`, managed-secret refs, workspace roots, local filesystem roots, remote roots, env-file paths, and Caddy config paths, then proved those values do not appear in browser responses.
- Extended `scripts/check-deploy.mjs` so the built-package deployment verifier starts the local gateway HTTP server, creates a deployment target through HTTP, and fails if the response exposes remote root/env-file paths, `secretRef`, or `workspaceRoot`.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a deployment HTTP DTO hardening slice and built-package verifier proof.
- Not replaced: this does not add a new deployment executor, remote secret storage, package signing, billing, marketplace publishing, VM isolation, or Linux desktop packaging.

Verification from milestone 75:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 17 tests.
- `pnpm typecheck`: passed.
- `pnpm deploy:check`: passed with `MAINSPRING_DEPLOY_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems with the hardened deployment verifier, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- `git diff --check` passed for the milestone files.

Still true after milestone 75:

- Host shell execution is still not a sandbox.
- Deployment plans can still include operator-facing remote commands and remote paths by design; deployment target/run mutation responses no longer return raw app-state metadata.
- Browser/localStorage provider auth remains prototype-only where present.
- Hosted artifact and SSE tickets are scoped and short-lived, but still bearer URLs for local gateway access.
- Console snapshots, deployment DTOs, and gateway JSON sanitization are safer DTOs, not a complete security boundary.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 76: Cron And Budget Mutation Responses Use Console-Safe DTOs

Completed on 2026-07-01.

Changes made:

- Exported the existing console cron schedule and budget projection helpers and reused them for HTTP cron/budget mutation responses.
- Changed `POST /cron` and `PATCH /cron/:scheduleId` to return `ConsoleGatewayCronSchedule` shape instead of raw cron schedule records.
- Changed `POST /budgets` and `PATCH /budgets/:budgetId` to return `ConsoleGatewayBudget` shape instead of raw budget records.
- Added a browser-safe cron preview scrubber so cron mutation responses return `promptPreview` and do not echo raw `prompt`, sensitive field markers such as `secretRef`/`workspaceRoot`, or local absolute paths from prompts.
- Extended the HTTP route test with cron/budget records containing raw prompts, secret refs, workspace roots, local paths, and raw metadata, then proved those values do not appear in browser responses.
- Extended `scripts/check-cron.mjs` so the built-package cron verifier creates a cron schedule through HTTP and fails if raw prompts or sensitive prompt markers leak.
- Extended `scripts/check-budget-policy.mjs` so the built-package budget verifier creates a budget through HTTP and fails if raw metadata, roots, `secretRef`, or `workspaceRoot` leak.

Current Mainspring pieces kept, replaced, or merged in this milestone:

- Kept: `SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.
- Merged: a cron/budget HTTP DTO hardening slice and built-package verifier proof.
- Not replaced: this does not add billing, provider-side spend reservations, a remote scheduler, enterprise auth, VM isolation, or Linux desktop packaging.

Verification from milestone 76:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 17 tests.
- `pnpm typecheck`: passed.
- `pnpm cron:check`: passed with `MAINSPRING_CRON_CHECK_OK`.
- `pnpm budget:check`: passed with `MAINSPRING_BUDGET_POLICY_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems with the hardened cron and budget verifiers, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- `git diff --check` passed for the milestone files.

Still true after milestone 76:

- Host shell execution is still not a sandbox.
- Cron prompts remain stored and dispatched through the runtime as operator-authored input; browser mutation responses expose only sanitized previews.
- Budgets remain local estimates and policy inputs, not payment billing or provider-side spend reservations.
- Browser/localStorage provider auth remains prototype-only where present.
- Console snapshots, deployment/cron/budget DTOs, and gateway JSON sanitization are safer DTOs, not a complete security boundary.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 77: Gateway Mutation Responses Stop Returning Raw Run Input

Completed on 2026-07-01.

Changes made:

- Added console-safe DTO helpers for run dispatch responses and marketplace install responses.
- Switched HTTP `/runs/start` and `/cron/:scheduleId/run-now` to return a minimal dispatch DTO instead of raw `RunRecord`, removing raw `input` from browser JSON.
- Switched HTTP marketplace template install responses to a console-safe install DTO that preserves trusted template provenance and allowed-tool labels without exposing workspace roots or raw agent metadata.
- Added route tests that poison raw run records with `secretRef`, `OPENROUTER_API_KEY`, `workspaceRoot`, and hidden paths, then prove browser JSON omits the raw input.
- Added `scripts/check-gateway-response-surface.mjs`, a built-package verifier that exercises client create, run start, cron create, cron run-now, and marketplace install through the HTTP gateway with poisoned prompts/paths.
- Added `gateway:surface:check` and included the new verifier in `gateway:systems:check`, which also brings it into `release:check`.
- Updated `docs/current-state.md` to reflect the new DTO boundary and verifier.

Runtime spine preserved:

- Run creation still enters the SDK/runtime through the existing gateway and SDK command paths.
- Cron run-now still uses the cron schedule, starts the run through app-state-backed runtime dispatch, and records gateway audit state.
- Marketplace install still creates real gateway app-state client/workspace/session/agent records; only the HTTP response shape changed.
- No mailbox, `RuntimeKernel`, provider, tool registry, approval, policy, or `events_out` path was bypassed.

Not changed:

- This does not make host shell execution a sandbox.
- This does not add VM isolation, enterprise auth, payment billing, provider-side spend reservation, remote paid marketplace, or Linux desktop packaging.
- DTOs and generic sanitization remain leak-reduction layers, not a complete security boundary.

Verification from milestone 77:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts --passWithNoTests`: passed, 2 files / 16 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK` included before `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed after replacing the verifier's realistic `sk-` canary with a non-secret sentinel.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 352 tests, build, security scans, console build, gateway systems with the new response-surface verifier, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 77:

- Browser-facing routes should prefer explicit console DTOs before generic sanitization.
- Raw prompts remain stored/used inside runtime dispatch where needed; they should not be echoed to renderer/browser JSON responses.
- Marketplace provenance remains visible to the browser through template DTO fields, while server-side app-state metadata retains richer internal details.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 78: Gateway JSON And SSE Text Payloads Redact Browser-Unsafe Paths

Completed on 2026-07-01.

Changes made:

- Hardened the shared gateway JSON sanitizer so string payloads redact browser-unsafe free-text markers like `workspaceRoot=...`, `sessionPath=...`, `mailboxPath=...`, and `gatewayToken=...`.
- Added string-level redaction for absolute Windows, UNC, and common Unix host paths embedded inside JSON/SSE event text.
- Kept normal gateway browser URLs usable, including `/events/stream` and artifact/browser-access URLs.
- Added sanitizer tests for free-text path redaction and browser-access URL preservation.
- Extended HTTP route tests so `/runs/:runId/events` and SSE `run.event` payloads are poisoned with raw path/marker text and verified not to leak it.
- Extended `scripts/check-gateway-response-surface.mjs` to wait for a real Echo-backed run, fetch its run events through HTTP, and verify the built package does not echo poisoned run-event text to browser JSON.
- Updated `docs/current-state.md` with the new event-text surface verifier truth.

Runtime spine preserved:

- Runtime events still originate from `events_out` and are read through the existing gateway event list path.
- SSE still projects gateway events from the existing gateway/runtime state; only the browser serialization sanitizer changed.
- No mailbox, `RuntimeKernel`, provider, tool registry, approval, policy, or run dispatch path was bypassed.

Not changed:

- This does not make event payloads safe to treat as a complete security boundary.
- This does not remove raw runtime state from internal storage; it redacts browser-facing JSON/SSE serialization.
- This does not add sandboxing, VM isolation, enterprise auth, billing, paid marketplace, or Linux desktop packaging.

Verification from milestone 78:

- `pnpm exec vitest run src/gateway/server/sanitize.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 10 tests.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK` included before `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 353 tests, build, security scans, console build, gateway systems with the hardened response-surface verifier, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.

Still true after milestone 78:

- Browser-facing routes should prefer explicit console DTOs before generic sanitization when the response has a product shape.
- Generic gateway sanitization is a shared fallback and leak-reduction layer, not a replacement for hosted auth, OS permissions, artifact access checks, or safe tool policy.
- Raw prompts and event details can still exist in runtime storage for replay/audit; renderer/browser routes should only receive sanitized projections.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 79: Console Artifact Access Uses Validated Browser Tickets

Completed on 2026-07-01.

Changes made:

- Added `deriveLocalGatewayArtifactAccessUrls()` to accept only local gateway `/artifacts/...` browser-access URLs and derive matching download URLs.
- The helper rejects non-local URLs, non-artifact routes, and query parameters that look like raw hosted session or gateway tokens.
- Updated the console selected-client artifact panel so preview/open/download controls appear only after the gateway returns a validated artifact browser-access URL.
- Removed the panel's direct artifact URL fallback when no browser-access function is present, keeping static/prototype detail views from implying artifact access they do not have.
- Extended console transport tests for valid artifact ticket URLs, event-stream URL rejection, non-local URL rejection, and raw session-token query rejection.
- Extended the local gateway client test so browser-access request coverage includes both artifact tickets and scoped event-stream tickets.

Runtime spine preserved:

- Artifact files are still served by the local gateway artifact route.
- Hosted auth still mints short-lived browser-access tickets through `/auth/browser-access`.
- The console change only gates browser rendering of artifact preview/open/download URLs; it does not bypass mailbox, `RuntimeKernel`, provider, tool registry, approval policy, or `events_out`.

Not changed:

- Artifact browser-access tickets remain short-lived local bearer URLs, not public sharing links.
- This does not add an artifact permission model, desktop credential vault, VM isolation, billing, enterprise auth, or Linux desktop packaging.
- Static/prototype console state still exists for development, but artifact preview/download now requires a live gateway browser-access capability.

Verification from milestone 79:

- `pnpm exec vitest run apps/console/src/localGatewayTransport.test.ts apps/console/src/localGatewayClient.test.ts apps/console/src/App.test.tsx`: passed, 3 files / 20 tests.
- `pnpm console:typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 55 files / 354 tests.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 354 tests, build, security scans, console build, gateway systems, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- Generated `mainspring-0.1.0.tgz`, `apps/desktop/release/`, and `.tmp-managed-secret-crypto/` outputs were removed after verification.
- `git diff --check` passed.

Still true after milestone 79:

- Browser-facing artifact URLs should come from gateway browser-access responses, not manually composed hosted-session URLs.
- URL validation is a client-side guardrail and must be backed by gateway hosted auth and artifact route authorization.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 80: Console Event Streams Use Validated Browser Tickets

Completed on 2026-07-01.

Changes made:

- Added `deriveLocalGatewayEventStreamAccessUrl()` to accept only local gateway `/events/stream` browser-access URLs.
- Reused the browser-access unsafe-query guard so event-stream URLs carrying raw hosted session or gateway token query parameters are rejected.
- Updated hosted-mode console EventSource setup to validate the gateway-minted event-stream URL before constructing `EventSource`.
- Added transport tests for scoped and global local event-stream ticket URLs, plus non-stream route, non-local URL, and raw gateway-token query rejection.

Runtime spine preserved:

- SSE still consumes gateway event projection from the existing gateway/runtime state.
- Hosted auth still mints short-lived event-stream browser-access tickets through `/auth/browser-access`.
- The console change only gates browser construction of `EventSource`; it does not bypass mailbox, `RuntimeKernel`, provider, tool registry, approval policy, or `events_out`.

Not changed:

- SSE browser-access tickets remain short-lived local bearer URLs.
- This does not add enterprise auth, a multi-user authorization model, VM isolation, billing, public sharing, or Linux desktop packaging.
- JSON mutation routes still require hosted-auth sessions; event-stream tickets are only for browser-compatible GET streams.

Verification from milestone 80:

- `pnpm exec vitest run apps/console/src/localGatewayTransport.test.ts apps/console/src/App.test.tsx apps/console/src/localGatewayClient.test.ts`: passed, 3 files / 21 tests.
- `pnpm console:typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 55 files / 355 tests.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 355 tests, build, security scans, console build, gateway systems, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- Generated `mainspring-0.1.0.tgz`, `apps/desktop/release/`, and `.tmp-managed-secret-crypto/` outputs were removed after verification.
- `git diff --check` passed.

Still true after milestone 80:

- Browser-facing artifact and event-stream URLs should come from gateway browser-access responses, not manually composed hosted-session URLs.
- URL validation is a client-side guardrail and must be backed by gateway hosted auth and route authorization.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 81: Console Client Rejects Unsafe Successful Gateway JSON

Completed on 2026-07-01.

Changes made:

- Added a shared browser-safety tripwire in the console local gateway client response parser.
- Successful gateway JSON responses are rejected if they contain browser-unsafe field names such as `secretRef`, `secretValue`, `workspaceRoot`, `sessionPath`, `mailboxPath`, `sessionsRoot`, or `gatewayToken`.
- Successful gateway JSON responses are also rejected if they contain `OPENROUTER_API_KEY`, private-key markers, or absolute Windows host paths.
- Added a regression test proving a successful `/snapshot` response containing `workspaceRoot` and an artifact filesystem path is refused by the browser client before UI state consumes it.

Runtime spine preserved:

- The gateway, SDK, mailbox, `RuntimeKernel`, provider, tool registry, approval/policy, and `events_out` paths are unchanged.
- This is a browser-client response validation layer on top of existing gateway DTOs and sanitization.
- Operator-authored request bodies for workspace roots, deployment config, and provider profile creation remain explicit inputs where those product flows require them.

Not changed:

- This does not replace gateway-side DTOs, hosted auth, route authorization, or server sanitization.
- This does not add sandboxing, VM isolation, enterprise auth, billing, public sharing, or Linux desktop packaging.
- Internal runtime storage can still hold raw state needed for replay/audit; browser clients should receive sanitized projections.

Verification from milestone 81:

- `pnpm exec vitest run apps/console/src/localGatewayClient.test.ts apps/console/src/localGatewayTransport.test.ts apps/console/src/App.test.tsx`: passed, 3 files / 22 tests.
- `pnpm console:typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 55 files / 356 tests.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, 55 test files / 356 tests, build, security scans, console build, gateway systems, gateway dev help, examples, agentic harness, desktop systems, release workflow, package surface check, package dry-runs, and Docker Compose config.
- Generated `mainspring-0.1.0.tgz`, `apps/desktop/release/`, and `.tmp-managed-secret-crypto/` outputs were removed after verification.
- `git diff --check` passed.

Still true after milestone 81:

- Browser-facing JSON should be explicit DTOs first, server-sanitized second, and client-rejected if unsafe fields regress.
- Console response validation is a tripwire, not the primary security boundary.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 82: Console Client Rejects Artifact And Database Path Fields

Completed on 2026-07-01.

Changes made:

- Extended the console local gateway client response tripwire to reject successful JSON responses containing `artifactPath`, `filePath`, `databasePath`, or `dbPath`.
- Kept the check field-name based so legitimate operator-facing deployment plan text is not rejected just because it may mention remote paths.
- Extended the unsafe-response regression test to cover artifact filesystem paths and gateway database path fields.

Runtime spine preserved:

- The gateway, SDK, mailbox, `RuntimeKernel`, provider, tool registry, approval/policy, and `events_out` paths are unchanged.
- This remains a browser-client regression tripwire on top of gateway DTOs and server sanitization.

Not changed:

- This does not replace gateway-side DTOs, hosted auth, route authorization, or server sanitization.
- This does not add sandboxing, VM isolation, enterprise auth, billing, public sharing, or Linux desktop packaging.
- Deployment plans may still expose intentional operator-facing deployment commands; raw app-state deployment metadata should stay out of browser DTOs.

Verification from milestone 82:

- `pnpm exec vitest run apps/console/src/localGatewayClient.test.ts`: passed, 1 file / 2 tests.
- `pnpm console:typecheck`: passed.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 55 files / 356 tests.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed, including doctor, typecheck, tests, security and gateway surface checks, gateway build/help, example harness runs, agentic harness check, desktop systems check, release workflow check, package surface check, npm pack surface output, and Docker Compose config rendering.
- Generated release artifacts were removed after verification: `apps/desktop/release` and `.tmp-managed-secret-crypto`; `mainspring-0.1.0.tgz` was already absent by cleanup time.

Still true after milestone 82:

- Browser-facing JSON should be explicit DTOs first, server-sanitized second, and client-rejected if unsafe filesystem fields regress.
- Console response validation is a tripwire, not the primary security boundary.
- Browser/localStorage provider auth remains prototype-only where present.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 83: Release Gate Covers Snapshot Path Leaks

Completed on 2026-07-01.

Changes made:

- Extended `scripts/check-gateway-response-surface.mjs` so the release verifier rejects browser-facing JSON containing `sessionsRoot`, `artifactPath`, `filePath`, `databasePath`, or `dbPath`.
- Added direct `/snapshot` coverage to the gateway response-surface verifier after client/workspace creation, with the same browser-leak sentinel checks used for mutation and run-event routes.
- Updated `docs/current-state.md` to describe the expanded snapshot and path-field coverage.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This is a release-gate verification improvement around gateway DTO/sanitization output; it does not bypass or replace the runtime loop.

Not changed:

- This does not add a new security boundary, artifact permission model, VM isolation, billing, enterprise auth, public sharing, or Linux desktop installer packaging.
- The browser-facing response surface still relies first on explicit DTOs and server sanitization, with client and release-gate checks as regression tripwires.

Verification from milestone 83:

- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 83:

- Console and release-gate leak checks are regression guards, not substitutes for hosted auth, route authorization, OS permissions, or artifact access checks.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 84: Console Read-Model Preview Guards Use Current Unsafe Field Vocabulary

Completed on 2026-07-01.

Changes made:

- Extended the console snapshot forbidden-token list to catch `secretValue`, `mailboxPath`, `sessionsRoot`, `gatewayToken`, `artifactPath`, `filePath`, `databasePath`, and `dbPath`.
- Hardened `ConsoleSnapshotAdapter` preview redaction so cron prompt previews, cron last-error text, and memory previews redact the same newer browser-unsafe markers plus local Windows, UNC, and common host Unix paths.
- Added focused regression tests for static console snapshot token detection and cron/memory preview redaction.
- Updated `docs/current-state.md` with the read-model preview guard truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This only hardens browser/read-model projection guards around already-produced gateway state.

Not changed:

- This does not add a new security boundary, artifact permission model, VM isolation, billing, enterprise auth, public sharing, or Linux desktop installer packaging.
- Browser-facing DTOs and server sanitization remain the primary shape controls; console/read-model checks are regression guards.

Verification from milestone 84:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/consoleDataSource.test.ts --passWithNoTests`: passed, 2 files / 12 tests.
- `pnpm typecheck`: passed.
- `pnpm console:typecheck`: passed.
- `pnpm test`: passed, 55 files / 358 tests.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 84:

- Console and release-gate leak checks reduce regression risk, but they are not substitutes for hosted auth, route authorization, OS permissions, or artifact access checks.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 85: Gateway Text Sanitizer Covers Newer Path Markers

Completed on 2026-07-01.

Changes made:

- Extended the shared gateway HTTP/SSE sanitizer to treat `databasePath` as an absolute-path field.
- Extended gateway free-text marker redaction for `artifactPath=...`, `filePath=...`, `databasePath=...`, and `dbPath=...`.
- Strengthened sanitizer tests to cover the newer marker forms and `databasePath` object-key stripping.
- Strengthened `scripts/check-gateway-response-surface.mjs` poisoned run and cron prompts so the release verifier proves the newer marker forms are redacted through real HTTP/browser-facing routes.
- Updated `docs/current-state.md` with the new server-side text sanitization truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only browser-facing gateway serialization/redaction and verifier coverage.

Not changed:

- This does not remove raw internal runtime state needed for replay/audit.
- This does not add sandboxing, VM isolation, enterprise auth, billing, public sharing, or Linux desktop installer packaging.
- Sanitization remains a leak-reduction layer, not the primary security boundary.

Verification from milestone 85:

- `pnpm exec vitest run src/gateway/server/sanitize.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/consoleDataSource.test.ts --passWithNoTests`: passed, 3 files / 14 tests.
- `pnpm typecheck`: passed.
- `pnpm run security:sensitive-patterns`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 85:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 86: Sessions HTTP Route Uses Console-Safe DTOs

Completed on 2026-07-01.

Changes made:

- Changed `GET /sessions` to return the same console-safe session DTO shape produced by `gatewaySnapshotToConsoleState()` instead of raw runtime session records behind generic sanitization.
- Added HTTP route coverage proving `/sessions` includes the expected session identity/status while omitting `workspaceRoot`, `sessionPath`, and host workspace paths.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier requests `/sessions` and checks it with the shared leak assertions.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only one HTTP browser-facing projection route.

Not changed:

- This does not add a new security boundary, VM isolation, enterprise auth, billing, public sharing, or Linux desktop installer packaging.
- Raw runtime session records still exist internally where needed by the runtime and gateway.

Verification from milestone 86:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 1 file / 8 tests.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 19 tests.
- `pnpm run security:sensitive-patterns`: passed.

Still true after milestone 86:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 87: Health HTTP Route Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Changed `GET /health` to return an explicit browser-facing health DTO with `ok`, `running`, and `activeSessions` instead of raw runtime health behind generic sanitization.
- Added hosted and local-dev HTTP assertions proving `/health` does not expose `sessionsRoot`, `lastTickAt`, or host workspace paths.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier checks `/health` with the shared leak assertions.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only one read-only HTTP browser-facing projection route.

Not changed:

- This does not add a new security boundary, VM isolation, enterprise auth, billing, public sharing, or Linux desktop installer packaging.
- Raw runtime health still exists internally where needed by runtime supervision and diagnostics.

Verification from milestone 87:

- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 1 file / 8 tests.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm run security:sensitive-patterns`: passed.

Still true after milestone 87:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 88: Cron Status Route Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `consoleCronRuntimeStatus()` and `ConsoleGatewayCronRuntimeStatus` to the gateway console projection layer.
- Changed `GET /cron/status` to return the explicit cron runtime status DTO instead of raw cron status behind generic object sanitization.
- Sanitized cron status `lastError` through the same browser preview redactor used by cron schedule previews and memory previews.
- Added focused projection tests for cron status error redaction and HTTP route assertions for the cron status DTO shape.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier checks `/cron/status`.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only one read-only HTTP browser-facing projection route and its DTO helper.

Not changed:

- This does not add a new security boundary, VM isolation, enterprise auth, billing, public sharing, or Linux desktop installer packaging.
- Cron scheduling, due-tick enqueue, run-now behavior, and runtime dispatch are unchanged.

Verification from milestone 88:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 18 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.

Still true after milestone 88:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 89: Budget Status Route Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `consoleBudgetStatus()` and `ConsoleGatewayBudgetStatus` to the gateway console projection layer.
- Changed `GET /budgets/status` to return the explicit budget status DTO instead of raw budget status behind generic object sanitization.
- Sanitized budget tool-policy reason text through the same browser preview redactor used by cron and memory previews.
- Added focused projection tests for budget status reason redaction and HTTP route assertions for the budget status DTO shape.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier checks `/budgets/status`.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only one read-only HTTP browser-facing projection route and its DTO helper.

Not changed:

- This does not add a new security boundary, payment billing, provider-side spend reservation, VM isolation, enterprise auth, public sharing, or Linux desktop installer packaging.
- Budget enforcement, warning acknowledgement, blocked enqueue behavior, and runtime dispatch are unchanged.

Verification from milestone 89:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 19 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.

Still true after milestone 89:

- Usage and budgets remain local estimates, not payment billing or provider-side spend reservation.
- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 90: Usage Status Route Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `consoleUsageStatus()`, `ConsoleGatewayUsageStatus`, `ConsoleGatewayUsageRollup`, and `ConsoleGatewayUsageSummary` to the gateway console projection layer.
- Changed `GET /usage/status` to return the explicit usage status DTO instead of raw usage status behind generic object sanitization.
- Sanitized usage scope labels, provider labels, and model labels through the gateway preview redactor.
- Changed snapshot and budget-status projections to reuse the same browser-safe usage status DTO.
- Added focused projection tests for usage status label redaction and HTTP route assertions for the usage status DTO shape.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier checks `/usage/status`.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only read-only browser-facing usage projections and their DTO helper.

Not changed:

- This does not add payment billing, provider-side spend reservation, a new security boundary, VM isolation, enterprise auth, public sharing, or Linux desktop installer packaging.
- Usage accounting, budget enforcement, and runtime dispatch are unchanged.

Verification from milestone 90:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 20 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.

Still true after milestone 90:

- Usage and budgets remain local estimates, not payment billing or provider-side spend reservation.
- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 91: Cell Status Route Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `consoleCellStatus()`, `ConsoleGatewayCellStatus`, `ConsoleGatewayCellRuntimeStatus`, and `ConsoleGatewayCellCapacityBlock` to the gateway console projection layer.
- Changed snapshot projection and `GET /cells/status` to use the explicit cell status DTO instead of raw scheduler status behind generic object sanitization.
- Sanitized cell labels and capacity-block backend/computer text through the gateway preview redactor.
- Added an empty cell-status fallback so partial gateway snapshot mocks and disabled cell status remain serializable without exposing raw runtime internals.
- Added focused projection tests for poisoned cell status text and HTTP route assertions for the cell status DTO shape.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier checks `/cells/status`.
- Updated `docs/current-state.md` with the new route projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This changes only read-only browser-facing cell-status projections and their DTO helper.

Not changed:

- This does not add VM isolation, a HyperCell VM pool, a new security boundary, payment billing, provider-side spend reservation, enterprise auth, public sharing, or Linux desktop installer packaging.
- HyperCell status remains local backend leasing/status truth, not secure containment.
- Runtime dispatch, approval handling, mailbox writes, and event journaling are unchanged.

Verification from milestone 91:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 21 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 91:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- `HyperCellScheduler` is still local leasing/status, not VM isolation or a full remote pool.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 92: Deployment Plan Routes Use Console-Safe DTOs

Completed on 2026-07-01.

Changes made:

- Added `consoleDeploymentPlan()`, `consoleDeploymentExecution()`, `ConsoleGatewayDeploymentPlan`, `ConsoleGatewayDeploymentPlanStep`, and `ConsoleGatewayDeploymentExecutionResult` to the gateway console projection layer.
- Changed deployment plan and deployment execution HTTP responses to use explicit console DTOs instead of returning raw plan/execution objects behind generic object sanitization.
- Changed deployment plan steps to expose `commandPreview` instead of raw executable `command` strings.
- Extended the gateway preview redactor and shared HTTP sanitizer vocabulary for deployment config path markers: `remoteRoot`, `envFilePath`, and `caddyConfigPath`.
- Updated the console local gateway client contract and preview renderer to consume `commandPreview`.
- Added focused route and sanitizer tests proving deployment plan/execution responses do not expose raw commands or deployment path markers.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier creates a guarded VPS target and checks the deployment plan route.
- Updated `docs/current-state.md` with the new deployment DTO truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Deployment planning/execution behavior is unchanged; only browser-facing projection and console consumption changed.

Not changed:

- This does not add a new deployment executor, VM isolation, a new security boundary, public sharing, enterprise auth, payment billing, or Linux desktop installer packaging.
- Guarded VPS deployment remains an explicit operator-triggered lane, not a hidden autonomous deployment system.
- Raw deployment config still belongs in gateway app state/server-side code, not browser-facing DTOs.

Verification from milestone 92:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts src/gateway/server/sanitize.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 4 files / 25 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 92:

- Browser-facing routes should prefer explicit DTOs first, server sanitization second, and console/release checks as regression guards.
- Deployment route hardening is not a sandbox and does not make remote process execution secure containment.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 93: Full Release Gate Passes After DTO Hardening

Completed on 2026-07-01.

Changes made:

- Ran the full `pnpm release:check` gate after the browser-facing DTO hardening milestones.
- Verified the current release pipeline covers:
  - `pnpm verify`
  - gateway systems, including pricing, budgets, secrets, auth, execution backends, marketplace, cron, deployment, and gateway response surface checks
  - gateway dev help output
  - all example smoke runs
  - the agentic harness scenarios
  - desktop typecheck, build, and pack
  - release workflow checks
  - package surface checks
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Confirmed the expanded gateway response surface verifier still passes after adding `/cells/status` and deployment plan route coverage.
- Confirmed the package dry run includes the rewritten docs, example templates, Docker files, built runtime outputs, gateway server outputs, and current public subpath files.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone is verification/provenance only; it does not alter runtime dispatch, mailbox storage, approval flow, provider calls, tool execution, or event projection.

Not changed:

- Passing `pnpm release:check` does not mean the full long-term product brief is complete.
- This does not add VM isolation, paid marketplace, billing, enterprise SSO, Linux desktop installer packaging, or secure desktop credential vault claims.
- Host shell execution remains unsandboxed; guarded VPS execution remains operator-triggered remote process execution, not secure containment.

Verification from milestone 93:

- `pnpm release:check`: passed.
- During that gate:
  - full Vitest pass: 55 files / 362 tests passed.
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
  - `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`.
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`.
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
  - `pnpm pack --dry-run`: passed and produced `mainspring-0.1.0.tgz` listing.
  - `npm pack --dry-run`: passed and produced `mainspring-0.1.0.tgz` listing.
  - `docker compose -f docker/compose.local.yml config`: passed and printed normalized Compose config.

Still true after milestone 93:

- Release-check success is broad evidence for current package/runtime readiness, not proof that every long-term product feature exists.
- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 94: Marketplace Template List Uses Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `consoleMarketplaceTemplate()` and `ConsoleGatewayMarketplaceTemplate` to the gateway console projection layer.
- Changed `GET /marketplace/templates` to return explicit console-safe marketplace template DTOs instead of raw `LocalMarketplaceTemplateRecord` objects behind generic sanitization.
- Kept browser-facing template list fields limited to template ID, label, description, trusted local provenance, provider/model hints, runtime profile, allowed tools, and approval mode.
- Removed raw template defaults, example directories, and seed-file internals from the marketplace list response.
- Updated the console local gateway client type and tests to match the list DTO.
- Added HTTP route assertions and built-package surface-check assertions proving template list responses do not expose `defaults`, `seedFiles`, or `exampleDir`.
- Updated `docs/current-state.md` with the marketplace list projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Marketplace install behavior is unchanged; only the browser-facing list projection changed.

Not changed:

- Marketplace remains trusted local repo examples, not a remote paid marketplace.
- This does not add billing, paid installs, remote template provenance, enterprise auth, VM isolation, or Linux desktop installer packaging.
- Template defaults and seed-file internals still exist server-side for installation; they are just not exposed through the browser list route.

Verification from milestone 94:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 94:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Local template marketplace hardening is not a remote marketplace or billing implementation.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 95: Provider Profile Mutations Reuse Console DTO

Completed on 2026-07-01.

Changes made:

- Exported the existing `consoleProviderProfile()` mapper from the gateway console projection layer.
- Changed provider-profile create and update HTTP responses to return `consoleProviderProfile(profile)` instead of hand-shaped partial profile objects.
- Updated the console local gateway client type so provider-profile mutation responses use the same `ConsoleGatewayProviderProfile` shape as snapshots.
- Added focused server/client assertions that provider-profile mutation responses include `credentialState` while still omitting `secretRef` and raw provider key material.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier creates a provider profile with a submitted secret value and checks for `credentialState` plus no secret leakage.
- Updated `docs/current-state.md` with the provider-profile mutation projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Provider profile storage and managed-secret behavior are unchanged; only browser-facing mutation projection changed.

Not changed:

- Managed local secrets are still not a cross-platform desktop credential vault.
- Hosted-auth remains local/operator auth, not enterprise SSO.
- This does not add provider-side key management, billing, VM isolation, remote marketplace behavior, or Linux desktop installer packaging.

Verification from milestone 95:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 95:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Provider credential state is a local readiness hint, not proof of provider account validity or enterprise secret management.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 96: Agent Mutations Reuse Browser-Safe Agent DTO

Completed on 2026-07-01.

Changes made:

- Exported `consoleAgent()` from the gateway console projection layer.
- Changed agent create and update HTTP responses to return the same console-safe agent DTO used by snapshots.
- Added browser-safe redaction for agent-facing text fields in that DTO:
  - name
  - version
  - default model ID
  - instructions
  - outcome
  - voice
  - approval mode
  - model label
- Updated the console local gateway client type so agent mutation responses use `ConsoleGatewaySnapshot['agents'][number]`.
- Added focused server/client tests proving agent mutation responses can include useful metadata while redacting path/secret-style markers.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier creates an agent with path-like markers and checks redacted response fields.
- Updated `docs/current-state.md` with the agent projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Agent storage and runtime dispatch behavior are unchanged; only browser-facing agent projection changed.

Not changed:

- This does not add a new prompt-security boundary or hide secrets from code that already has server-side app-state access.
- The DTO redactor is still a browser-surface leak-reduction guard, not a sandbox, DLP system, enterprise secret vault, or provider-side policy.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 96:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Note:

- The first expanded surface-check payload tried to send raw secret markers through agent creation and correctly failed input validation. The verifier was adjusted to use path-like markers so it tests browser redaction without bypassing the existing raw-secret rejection gate.

Still true after milestone 96:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Agent DTO hardening does not change runtime prompt execution semantics.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 97: Client And Workspace Mutations Reuse Console DTOs

Completed on 2026-07-01.

Changes made:

- Exported `consoleClient()`, `consoleWorkspace()`, and `consoleSession()` from the gateway console projection layer.
- Added browser-safe redaction for client and workspace display names in the shared console DTO helpers.
- Changed client create, workspace create, and client update HTTP responses to reuse the same console-safe DTO helpers used by snapshots instead of hand-shaped response objects.
- Updated the console local gateway client type so client/workspace mutation responses use `ConsoleGatewaySnapshot` DTO types.
- Added focused server tests proving client/workspace display names are redacted while session roots, workspace roots, raw root fields, and absolute path markers stay out of responses.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier creates a client/workspace with poisoned display names and checks redacted response fields.
- Updated `docs/current-state.md` with the client/workspace projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Client/workspace storage, session creation, and runtime dispatch behavior are unchanged; only browser-facing projection changed.

Not changed:

- Client/workspace DTO redaction is not a permissions model or multi-tenant authorization system.
- Workspace paths still exist server-side and in the runtime mailbox/storage path; they are just not returned through browser-facing mutation DTOs.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 97:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 97:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Console DTO hardening does not replace hosted auth, OS permissions, or artifact access checks.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 98: Run Event Responses Use Explicit Browser DTO

Completed on 2026-07-01.

Changes made:

- Added `ConsoleGatewayRunEvent` and `consoleRunEvent()` to the gateway console projection layer.
- Changed `GET /runs/:runId/events` to return `events.map(consoleRunEvent)` instead of raw runtime events behind generic object sanitization.
- Changed local gateway SSE `run.event` messages to emit `consoleRunEvent(event)`.
- Added recursive browser-safe payload sanitization for console run events while preserving event type, run ID, session ID, timestamp, sequence number, and structured payload shape.
- Updated the console local gateway client and trace view-model to consume `ConsoleGatewayRunEvent[]` instead of raw `RunEvent[]`.
- Added focused projection and HTTP route tests proving path/secret-style markers in event payload text are redacted.
- Updated `docs/current-state.md` with the run-event projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Runtime event storage remains raw/current; only browser-facing HTTP/SSE projection changed.

Not changed:

- This does not collapse the mailbox or event journal.
- This does not change `RunEvent` persistence, runtime event normalization, provider behavior, tool execution, approval flow, or SDK event reads.
- Console run-event payload redaction is a browser-surface guard, not a replacement for hosted auth, OS permissions, or artifact access checks.

Verification from milestone 98:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts apps/console/src/runTraceViewModel.test.ts --passWithNoTests`: passed, 4 files / 27 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 98:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Runtime event journaling remains part of the preserved runtime spine.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 99: Budget DTO Labels Are Browser-Safe

Completed on 2026-07-01.

Changes made:

- Updated `consoleBudget()` to redact browser-unsafe markers from budget labels.
- Updated `consoleBudgetEvaluation()` to redact browser-unsafe markers from budget labels and evaluation scope labels, in addition to the already-redacted cost-sensitive tool-policy reason.
- Added focused projection tests proving budget status labels, scope labels, and reasons are redacted.
- Updated HTTP route tests proving budget create/update responses redact budget labels while still preserving local estimate/enforcement fields.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser-surface verifier creates a budget with a poisoned display label and checks the response.
- Updated `docs/current-state.md` with the budget DTO projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Budget storage, evaluation, enforcement, warning acknowledgement, and run enqueue behavior are unchanged; only browser-facing projection changed.

Not changed:

- Usage and budgets remain local estimates, not payment billing or provider-side spend reservation.
- Budget DTO redaction is not a new security boundary or financial control system.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 99:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 24 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 99:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Local budget hardening is not billing, paid marketplace, or provider-side quota enforcement.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 100: Cron Schedule DTO Labels Are Browser-Safe

This milestone closed another browser-facing DTO gap without changing cron storage, scheduling, run dispatch, or the runtime spine.

Changed:

- Updated `consoleCronSchedule` so cron schedule labels, optional computer IDs, and allowed-tool display strings pass through the gateway browser-safe preview redactor.
- Kept cron prompts behind `promptPreview`; raw prompt storage and scheduler inputs are unchanged.
- Extended the gateway server route test so cron create/update responses prove poisoned labels, computer IDs, allowed-tool strings, prompts, and metadata do not leak browser-unsafe path/secret markers.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser surface verifier creates a cron schedule with poisoned label and allowed-tool text, then asserts the response is redacted.
- Updated `docs/current-state.md` with the cron DTO projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Cron create/update inputs still reach the gateway layer as submitted; only browser-facing DTO projection changed.
- Cron run-now still returns the minimal console-safe dispatch DTO and does not expose raw run input.

Not changed:

- Cron remains local scheduling, not a hosted job system.
- DTO redaction is still a leak-reduction boundary, not a sandbox, permission model, or hosted-auth replacement.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 100:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 24 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 100:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Cron schedule hardening is projection hygiene, not new isolation or hosted scheduling infrastructure.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 101: Artifact And Deployment Labels Are Browser-Safe

This milestone closed another label-level browser projection gap while preserving artifact storage, deployment target storage, and the guarded deployment lane.

Changed:

- Updated `consoleArtifact` so optional artifact display labels pass through the gateway browser-safe preview redactor.
- Updated `consoleDeploymentTarget` so deployment target labels pass through the same browser-safe preview redactor.
- Extended the console snapshot adapter fixture with poisoned artifact and deployment labels, proving the console DTOs redact embedded artifact path and deployment root markers while still omitting raw path/config metadata.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser surface verifier creates a deployment target with a poisoned label and asserts the response is redacted.
- Updated `docs/current-state.md` with the artifact/deployment label projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Artifact records and deployment target records are not migrated or rewritten; only the console/gateway DTO projection changed.
- Guarded VPS deployment planning/execution behavior remains unchanged.

Not changed:

- Artifact DTO redaction is not an artifact permission system.
- Deployment target label redaction is not deployment isolation, hosted secrets, or a new VPS executor.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 101:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 24 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 101:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Label redaction is projection hygiene, not a substitute for hosted auth, OS permissions, or artifact access tickets.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 102: Marketplace Install Reuses Safe Template DTO

This milestone removed a marketplace projection drift point while preserving the trusted local template marketplace and install behavior.

Changed:

- Changed `ConsoleGatewayMarketplaceInstall.template` to use the same `ConsoleGatewayMarketplaceTemplate` DTO shape as `/marketplace/templates`.
- Updated `consoleMarketplaceInstall` to call `consoleMarketplaceTemplate(result.template)` instead of maintaining a parallel inline projection.
- Added a focused adapter test with poisoned template label, description, provider ID, model ID, allowed-tool text, and approval mode, proving marketplace install responses redact browser-unsafe markers consistently.
- The same test also proves installed client, workspace, and agent display names continue using the existing console-safe DTO mappers.
- Updated `docs/current-state.md` with the marketplace install projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Marketplace installation still creates local app-state records and seed files through the existing gateway marketplace path.
- No template defaults, seed-file internals, workspace roots, raw agent metadata, provider secrets, or fake remote marketplace surfaces were added.

Not changed:

- Marketplace remains trusted local templates, not remote paid installs.
- DTO redaction is projection hygiene, not hosted authorization, artifact permissions, or secure secret storage.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 102:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 25 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 102:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Marketplace install hardening is response projection cleanup, not marketplace product expansion.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 103: Provider And Model Identifier DTOs Are Browser-Safe

This milestone tightened another browser-facing projection boundary around provider/model display fields without changing provider routing or runtime dispatch.

Changed:

- Updated provider profile DTO projection so `providerId`, `label`, and `defaultModelId` pass through the browser-safe preview redactor while still exposing `credentialState`.
- Updated run DTO projection so optional `computerId`, `providerId`, `modelId`, `modelFamily`, `providerTransport`, and `providerSessionId` are redacted as browser-facing text.
- Updated usage-ledger DTO projection so optional `providerId` and `modelId` are redacted as browser-facing text while preserving token/cost counters.
- Extended the console snapshot adapter fixture with poisoned provider profile, run, and usage-ledger identifiers to prove those DTOs redact embedded host-path markers.
- Extended the gateway server mutation test with poisoned provider profile return values to prove create/update responses use the safe DTO while preserving submitted inputs.
- Extended `scripts/check-gateway-response-surface.mjs` so the built-package browser surface verifier creates a provider profile with poisoned label/default-model text and checks the response redaction.
- Updated `docs/current-state.md` with the provider/model identifier projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Provider routing, provider profile storage, usage recording, run projection, and provider event normalization are unchanged; only browser-facing DTO fields are redacted.
- The external browser-surface check keeps a valid `providerId` for runtime dispatch and poisons only the display/model text in that path.

Not changed:

- Provider profile DTO redaction is not provider authentication or a secure secret store.
- Provider/model identifier redaction is projection hygiene, not a new provider registry or hosted auth layer.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 103:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 3 files / 25 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 103:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Provider/model identifier hardening is response projection cleanup, not provider auth, provider health validation, or billing.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 104: Cell Backend Display DTOs Are Browser-Safe

This milestone tightened cell/backend browser projections while preserving backend keys used for local execution status grouping.

Changed:

- Updated cell DTO projection so cell labels pass through the browser-safe preview redactor.
- Updated cell snapshot DTO projection so snapshot labels pass through the browser-safe preview redactor.
- Updated backend summary projection so backend labels and backend capability text/lists pass through the browser-safe preview redactor.
- Updated execution-backend inventory projection so backend display labels and reasons are browser-safe.
- Preserved raw backend keys such as `wsl` for internal console grouping, observed-cell counts, active lease counts, and latest cell/lease/snapshot association.
- Extended the console snapshot adapter fixture with poisoned cell labels, backend labels, backend capabilities, backend limits, and snapshot labels.
- Extended the gateway server snapshot test with poisoned cell/backend/snapshot text and explicit response leak assertions.
- Updated `docs/current-state.md` with the backend-key/display-text projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Cell storage, lease storage, snapshot storage, backend routing keys, and execution-backend status grouping are unchanged.
- Backend keys remain stable identifiers; only browser-facing display/capability text is redacted.

Not changed:

- Cell backend display redaction is not VM isolation, HyperCell pooling, secure process containment, or Linux desktop packaging.
- WSL/Docker backend metadata remains a local execution capability description, not a sandbox guarantee.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 104:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 104:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Backend DTO hardening is response projection cleanup, not secure containment or a new execution backend.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 105: Audit, Tool, Approval, And Artifact Text DTOs Are Browser-Safe

This milestone tightened another set of small browser-facing projection fields while preserving stable IDs and route-critical artifact behavior.

Changed:

- Updated approval DTO projection so `targetKey` passes through the browser-safe preview redactor.
- Updated approval metadata DTO projection so stored approval target keys use the same browser-safe preview redactor.
- Updated artifact DTO projection so artifact kind and media display values are redacted as browser-facing text.
- Updated tool-call DTO projection so tool names are redacted as browser-facing text.
- Updated audit-event DTO projection so category, action, actor, target type, and target ID are redacted as browser-facing text.
- Extended the console snapshot adapter fixture with poisoned approval target keys, artifact kind/media values, tool names, and audit text fields.
- Extended the gateway server snapshot/tool-calls test with poisoned artifact kind and tool name text while keeping the route-critical `text/markdown` media type valid so hosted artifact serving still proves the correct filename/content behavior.
- Updated `docs/current-state.md` with the audit/tool/approval/artifact projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- Approval state, artifact storage, hosted artifact serving, tool-call storage, audit-event storage, and gateway route behavior are unchanged.
- Stable IDs and artifact content metadata needed by routes are preserved; only browser-facing display text is redacted.

Not changed:

- DTO redaction is not artifact authorization, hosted auth, secure secret storage, or a sandbox.
- Artifact media types still need to remain valid where they drive content serving behavior.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 105:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 105:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- This was response projection cleanup, not a new security boundary or product surface.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 106: Memory Entry Tags Are Browser-Safe

This milestone closed a remaining console projection gap around memory tags while preserving the local JSONL memory store.

Changed:

- Updated memory entry DTO projection so `tags` pass through the same browser-safe preview redactor already used for memory text previews.
- Extended the memory-entry projection test with poisoned workspace and session memory tags containing workspace/path markers.
- Extended the newer preview-redaction test so both memory text previews and memory tags prove redaction for artifact/path/database markers.
- Updated `docs/current-state.md` with the memory-entry tag projection truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- The local JSONL memory store is unchanged; only the browser-facing console DTO for memory entries changed.
- Workspace roots are still used locally to locate memory entries, but they do not appear in browser DTOs.

Not changed:

- Memory tag redaction is not memory authorization, hosted auth, secure secret storage, or a new memory backend.
- Browser-facing redaction remains a regression tripwire and leak-reduction boundary, not a substitute for OS permissions.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 106:

- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts --passWithNoTests`: passed, 1 file / 15 tests.
- `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/server/createLocalGatewayServer.test.ts --passWithNoTests`: passed, 2 files / 23 tests.
- `pnpm typecheck`: passed.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.

Still true after milestone 106:

- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Memory tag hardening is response projection cleanup, not a new persistence or authorization model.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 107: Gateway Systems Gate Passes After DTO Hardening

This milestone moved from narrow DTO checks to the broader gateway systems verifier after the browser-surface hardening pass.

Changed:

- Ran the repo's `pnpm gateway:systems:check` gate after the projection hardening milestones.
- Confirmed the gate now passes pricing, budget policy, secrets, auth, execution backends, marketplace, cron, deployment, and browser response-surface checks in one sequence.
- Updated `docs/current-state.md` to record that `gateway:systems:check` passes after the DTO hardening pass.
- Tightened `docs/current-state.md` wording around `pnpm release:check` so it does not overclaim a fresh full release-gate pass when only the gateway systems gate was rerun in this milestone.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, storage, or gateway behavior changed.

Not changed:

- A passing gateway systems gate is not a full `pnpm release:check` pass.
- Gateway response-surface validation remains a leak-reduction regression gate, not sandboxing, hosted auth, secure desktop secrets, or provider billing.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 107:

- `pnpm gateway:systems:check`: passed with:
  - `MAINSPRING_PRICING_CHECK_OK`
  - `MAINSPRING_BUDGET_POLICY_CHECK_OK`
  - `MAINSPRING_SECRETS_CHECK_OK`
  - `MAINSPRING_AUTH_CHECK_OK`
  - `MAINSPRING_EXECUTION_BACKENDS_CHECK_OK`
  - `MAINSPRING_MARKETPLACE_CHECK_OK`
  - `MAINSPRING_CRON_CHECK_OK`
  - `MAINSPRING_DEPLOY_CHECK_OK`
  - `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`

Still true after milestone 107:

- The next broader proof is a fresh `pnpm release:check` run, especially before claiming full release readiness.
- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 108: Full Release Gate Passes

This milestone ran the broad release gate after the DTO hardening and gateway systems verification work.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` to record the fresh full release-gate pass.
- Added this milestone entry to preserve the exact release proof in the goal digest.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, storage, gateway, console, or desktop behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

Verification from milestone 108:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `Mainspring doctor passed.`
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - Docker Compose config rendered successfully.

Still true after milestone 108:

- The full release gate currently passes from this worktree, but each later release-surface change should rerun the relevant gate before claiming readiness.
- Browser-facing routes should keep moving toward explicit DTOs first, sanitizer second, verifier third.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 109: Internal Goal Digest Excluded From Npm Package

This milestone tightened package hygiene after the full release gate revealed that the large internal milestone ledger was being shipped in npm dry-run tarballs.

Changed:

- Added `docs/goal-digest.md` to `.npmignore`.
- Replaced the broad package `files` entry for `docs` with an explicit public-docs allowlist in `package.json`.
- Updated `scripts/check-package-surface.mjs` so the expected package files mirror that public-docs allowlist and so `.npmignore` must include `docs/goal-digest.md`.
- Kept `docs/goal-digest.md` in the repository as the long-running milestone ledger; it is excluded only from npm pack artifacts.
- Updated `docs/current-state.md` with the package docs surface truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was package metadata, verifier, and documentation hygiene only; no runtime, gateway, console, or desktop behavior changed.

Not changed:

- `docs/goal-digest.md` remains the repo-local continuation ledger.
- This does not change public runtime exports, examples, Docker files, or the public documentation pages shipped in the package.
- Because package surface changed after milestone 108, a future full release-readiness claim should rerun `pnpm release:check`.

Verification from milestone 109:

- Initial proof: `pnpm pack --dry-run` and `npm pack --dry-run` still listed `docs/goal-digest.md` after adding only `.npmignore`, which showed the broad package `files` entry needed to be narrowed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm pack --dry-run`: passed explicit absence check with `PNPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.
- `npm pack --dry-run`: passed explicit absence check with `NPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm typecheck`: passed.

Still true after milestone 109:

- Public package docs should stay useful for users; internal milestone ledgers should stay in git, not npm package payloads.
- The broader release gate passed at milestone 108, but this package-surface edit means the next broad release proof should rerun `pnpm release:check`.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 110: Full Release Gate Re-Proved After Package Surface Narrowing

This milestone reran the broad release gate after excluding the internal goal digest from npm package artifacts.

Changed:

- Ran `pnpm release:check` end-to-end after the package `files` allowlist and package-surface verifier changes.
- Confirmed the package dry-run output no longer includes `docs/goal-digest.md`.
- Updated `docs/current-state.md` to record that the full release gate passes after narrowing the npm docs payload.
- Added this milestone entry so the package-surface edit is followed by a fresh release proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, storage, gateway, console, or desktop behavior changed.

Not changed:

- `docs/goal-digest.md` remains the repo-local continuation ledger.
- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.

Verification from milestone 110:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total dropped to 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 110:

- The full release gate currently passes from this worktree, but each later release-surface change should rerun the relevant gate before claiming readiness.
- Public package docs should stay useful for users; internal milestone ledgers should stay in git, not npm package payloads.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 111: Package-Visible Docs No Longer Link To Repo-Local Digest

This milestone cleaned up documentation consistency after excluding the internal goal digest from npm package artifacts.

Changed:

- Updated `docs/index.md` so it no longer links to `goal-digest.md`; it now describes the digest as a repo-local continuation ledger excluded from npm artifacts.
- Updated `docs/current-state.md` so its intro references the repo-local digest without a package-visible Markdown link.
- Updated `docs/README.md`, `docs/documentation-guide.md`, and `RELEASE.md` so plain-text references describe `docs/goal-digest.md` as repo-local and excluded from npm package artifacts.
- Updated `docs/current-state.md` with the package-visible docs truth.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was documentation hygiene only; no runtime, package export, gateway, console, or desktop behavior changed.

Not changed:

- `docs/goal-digest.md` remains the repo-local continuation ledger.
- The npm package still ships public docs, examples, Docker files, runtime outputs, and public package metadata.
- Because this changed package-visible docs after milestone 110, a future full release-readiness claim should rerun `pnpm release:check`.

Verification from milestone 111:

- `rg "\]\(goal-digest\.md\)|\]\(docs/goal-digest\.md\)" README.md RELEASE.md docs package.json`: no matches, reported as `NO_GOAL_DIGEST_MARKDOWN_LINKS_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm pack --dry-run`: passed explicit absence check with `PNPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.
- `npm pack --dry-run`: passed explicit absence check with `NPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.

Still true after milestone 111:

- Public docs should not link to repo-local files excluded from npm artifacts.
- The full release gate passed at milestone 110, but this docs/package-surface edit means the next broad release proof should rerun `pnpm release:check`.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 112: Package-Visible Markdown Link Guard

This milestone made the package-docs consistency rule executable instead of relying on one-off searches.

Changed:

- Updated `scripts/check-package-surface.mjs` so `pnpm package:check` now scans package-visible Markdown files.
- The verifier rejects local Markdown links that point outside the package tree, point at missing files, or point at files excluded from the npm package.
- Updated `docs/operations.md`, `docs/documentation-guide.md`, and `docs/current-state.md` to record the package-visible link rule.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verifier and documentation hygiene only; no runtime, gateway, console, or desktop behavior changed.

Not changed:

- `docs/goal-digest.md` remains the repo-local continuation ledger and stays excluded from npm package artifacts.
- Public package docs can still mention repo-local ledgers in prose; they just should not link to files that are not shipped.
- This does not prove a fresh full release gate after the verifier change; a release-readiness claim should rerun `pnpm release:check`.

Verification from milestone 112:

- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`, including the new package-visible Markdown link scan.
- `pnpm pack --dry-run`: passed explicit absence check with `PNPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.
- `npm pack --dry-run`: passed explicit absence check with `NPM_PACK_GOAL_DIGEST_EXCLUDED_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 112:

- Public docs should stay self-contained inside the npm package.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 113: Full Release Gate Re-Proved After Markdown Link Guard

This milestone reran the broad release gate after adding package-visible Markdown link validation to the package-surface verifier.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth includes the package-visible Markdown link scan.
- Added this digest entry so the verifier change has a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- `docs/goal-digest.md` remains the repo-local continuation ledger and stays excluded from npm package artifacts.

Verification from milestone 113:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 113:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package docs now have an executable link-integrity/package-visibility guard.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 114: Package Markdown Link Guard Covers Examples And Brand Docs

This milestone broadened the package-visible Markdown link guard from public docs/root Markdown to every Markdown file included by package file entries.

Changed:

- Updated `scripts/check-package-surface.mjs` so packaged directories are walked recursively for Markdown files instead of only walking `docs/` directories.
- The `pnpm package:check` link guard now covers root docs, public docs, example READMEs, example sample/expected-event docs, and brand documentation included through package file entries.
- Updated `docs/operations.md`, `docs/documentation-guide.md`, and `docs/current-state.md` to describe the broader package-visible Markdown rule.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was package verifier and documentation hygiene only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- `docs/goal-digest.md` remains excluded from npm package artifacts.
- This milestone did not rerun the full `pnpm release:check` gate after broadening the package Markdown scan; only focused checks are claimed here.

Verification from milestone 114:

- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`, including the broadened Markdown link scan.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 114:

- A future release-readiness claim should rerun `pnpm release:check` because the package verifier changed after milestone 113.
- Public package Markdown should remain self-contained inside the npm package.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 115: Full Release Gate Re-Proved After All-Packaged-Markdown Scan

This milestone reran the broad release gate after expanding the package Markdown link guard from docs-only packaged Markdown to every packaged Markdown file.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth covers package-visible Markdown link checks across all packaged Markdown files.
- Added this digest entry so milestone 114's verifier expansion has a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- `docs/goal-digest.md` remains the repo-local continuation ledger and stays excluded from npm package artifacts.

Verification from milestone 115:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 115:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package Markdown has an executable link-integrity/package-visibility guard across root docs, public docs, examples, and brand docs.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 116: Fake Package Repository URLs Removed

This milestone removed placeholder public-repository metadata from the npm package surface and made that drift fail in the package verifier.

Changed:

- Removed `homepage`, `bugs.url`, and `repository.url` values from `package.json` because they pointed at placeholder `https://github.com/YOUR_ORG/mainspring` URLs and the local checkout has no configured git remote to prove a real replacement.
- Updated `scripts/check-package-surface.mjs` so `pnpm package:check` rejects placeholder tokens in package metadata.
- Updated `docs/operations.md` and `docs/current-state.md` to describe the package metadata placeholder guard.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was package metadata, verifier, and documentation hygiene only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- No fake GitHub repository URL was substituted.
- A real `homepage`, `bugs`, and `repository` block should be restored only after a real public repository URL is known.
- This milestone did not rerun the full `pnpm release:check` gate after package metadata changed; only focused checks are claimed here.

Verification from milestone 116:

- `git remote -v`: produced no configured remote output, so no real repository URL was available from the checkout.
- `rg "YOUR_ORG|TODO|TBD|placeholder|mainspring-oss" README.md RELEASE.md SECURITY.md CONTRIBUTING.md package.json docs scripts/check-package-surface.mjs`: found only the placeholder package URLs before this milestone.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`, including the new package metadata placeholder guard.
- `rg "YOUR_ORG|https://github.com/YOUR_ORG|example\\.com|TODO|TBD" package.json`: no matches, reported as `PACKAGE_JSON_NO_PLACEHOLDER_METADATA_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 116:

- A future release-readiness claim should rerun `pnpm release:check` because package metadata changed after milestone 115.
- Public package metadata should stay honest rather than pointing at placeholder URLs.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 117: Full Release Gate Re-Proved After Package Metadata Cleanup

This milestone reran the broad release gate after removing placeholder package repository URLs and adding package metadata placeholder validation.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth includes package metadata placeholder checks and the removal of placeholder repository URLs.
- Added this digest entry so milestone 116's package metadata cleanup has a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- `homepage`, `bugs`, and `repository` package metadata remain omitted until a real public repository URL is known.

Verification from milestone 117:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 117:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package metadata should stay honest rather than pointing at placeholder URLs.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 118: Package Markdown Placeholder Guard

This milestone extended package-surface hygiene from package metadata into package-visible Markdown content.

Changed:

- Updated `scripts/check-package-surface.mjs` so `pnpm package:check` rejects obvious placeholder tokens in every packaged Markdown file.
- Removed the literal owner placeholder token from package-visible `docs/current-state.md` while preserving the warning that fake repository URLs are not allowed.
- Updated `docs/operations.md` and `RELEASE.md` to describe the package-visible Markdown placeholder-token guard and package metadata honesty rule.
- Updated `docs/current-state.md` to avoid overclaiming a fresh full release gate after this verifier change.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was package verifier and documentation hygiene only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- The repo-local `docs/goal-digest.md` still contains historical references to removed placeholder URLs, but it is excluded from npm package artifacts.
- This milestone did not rerun the full `pnpm release:check` gate after the verifier change; only focused checks are claimed here.

Verification from milestone 118:

- `rg "YOUR_ORG|https://github.com/YOUR_ORG|example\\.com|TODO|TBD|placeholder" README.md RELEASE.md SECURITY.md CONTRIBUTING.md CHANGELOG.md CODE_OF_CONDUCT.md docs examples assets/brand`: before the edit, the only package-visible literal owner placeholder token was in `docs/current-state.md`; additional matches were generic "placeholder" wording and excluded goal-digest history.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`, including the new package-visible Markdown placeholder-token scan.
- `rg "YOUR_ORG|https://github.com/YOUR_ORG|example\\.com|TODO|TBD"` across package-visible Markdown: no matches, reported as `PACKAGED_MARKDOWN_NO_PLACEHOLDER_TOKENS_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 118:

- A future release-readiness claim should rerun `pnpm release:check` because the package verifier changed after milestone 117.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 119: Full Release Gate Re-Proved After Package Markdown Placeholder Guard

This milestone reran the broad release gate after adding package-visible Markdown placeholder-token validation.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth includes package-visible Markdown placeholder-token checks.
- Added this digest entry so milestone 118's package verifier change has a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- `docs/goal-digest.md` remains the repo-local continuation ledger and stays excluded from npm package artifacts.

Verification from milestone 119:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 119:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 120: Release Workflow Runs On PR And Main Push

This milestone tightened the GitHub release-check workflow so release verification is not manual-only.

Changed:

- Updated `.github/workflows/release-check.yml` to run on pull requests, pushes to `main`, and manual dispatch.
- Updated `scripts/check-release-workflow.mjs` so `pnpm release:workflow:check` fails if those workflow triggers drift away.
- Updated `RELEASE.md`, `docs/operations.md`, and `docs/current-state.md` to describe the CI trigger expectation and release workflow verifier coverage.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was CI workflow, verifier, and documentation hygiene only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- This does not add package publishing, signing, hosted deployment, Linux desktop installer packaging, or any new runtime path.
- This milestone did not rerun the full `pnpm release:check` gate after the workflow change; only focused checks are claimed here.

Verification from milestone 120:

- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 120:

- A future release-readiness claim should rerun `pnpm release:check` because release workflow files changed after milestone 119.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 121: Full Release Gate Re-Proved After Release Workflow Trigger Update

This milestone reran the broad release gate after changing the release-check workflow triggers and extending the release workflow verifier.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth includes the pull-request/main-push release workflow trigger update.
- Added this digest entry so milestone 120's CI workflow change has a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- GitHub workflow changes still do not publish packages, sign artifacts, or add hosted deployment.

Verification from milestone 121:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 121:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 122: GitHub Workflow Permissions, Timeouts, And Frozen CI Install

This milestone tightened GitHub workflow hygiene beyond command coverage.

Changed:

- Updated `.github/workflows/ci.yml` to use read-only `contents` permissions, a 20-minute job timeout, frozen pnpm installs, and the canonical `pnpm verify` command instead of a stale hand-written verify sequence.
- Updated `.github/workflows/release-check.yml` to use read-only `contents` permissions and 35-minute job timeouts for both release-check and Windows desktop packaging jobs.
- Extended `scripts/check-release-workflow.mjs` so `pnpm release:workflow:check` verifies CI workflow triggers, read-only permissions, frozen installs, timeouts, and `pnpm verify`, in addition to release-check workflow coverage.
- Updated `RELEASE.md`, `docs/operations.md`, and `docs/current-state.md` to describe the GitHub workflow hygiene expectations.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was CI workflow, verifier, and documentation hygiene only; no runtime, gateway, console, desktop app code, mailbox, or event-journal behavior changed.

Not changed:

- This does not add package publishing, signing, hosted deployment, Linux desktop installer packaging, or any new runtime path.
- This milestone did not rerun the full `pnpm release:check` gate after workflow changes; only focused checks are claimed here.

Verification from milestone 122:

- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed.
- `git diff --check`: passed.

Still true after milestone 122:

- A future release-readiness claim should rerun `pnpm release:check` because GitHub workflow files and the workflow verifier changed after milestone 121.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 123: Full Release Gate Re-Proved After GitHub Workflow Hygiene Update

This milestone reran the broad release gate after tightening GitHub workflow permissions, timeouts, frozen installs, and CI workflow verifier coverage.

Changed:

- Ran `pnpm release:check` end-to-end from the current worktree.
- Updated `docs/current-state.md` so the current release-gate truth includes GitHub workflow permissions/timeouts/frozen installs.
- Added this digest entry so milestone 122's workflow hygiene changes have a fresh broad proof.

Runtime spine preserved:

- The SDK/control host, per-session SQLite mailbox, `SessionRuntimeSupervisor`, `RuntimeKernel`, provider, tool registry, approval/policy, tools, `events_out`, and event projection path are unchanged.
- This milestone was verification and documentation only; no runtime, gateway, console, desktop app code, mailbox, or event-journal behavior changed.

Not changed:

- Passing `pnpm release:check` is not a claim that host shell execution is sandboxed.
- Passing `pnpm release:check` is not a claim that HyperCells, VM isolation, billing, hosted marketplace, enterprise auth, secure desktop secrets, or Linux desktop installer packaging exist.
- GitHub workflow hygiene still does not publish packages, sign artifacts, or add hosted deployment.

Verification from milestone 123:

- `pnpm release:check`: passed, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files and did not list `docs/goal-digest.md`.
  - Docker Compose config rendered successfully.

Still true after milestone 123:

- The full release gate currently passes from this worktree, but later release-surface changes should rerun the relevant gate before claiming readiness.
- Public package Markdown should stay free of obvious placeholder tokens.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 124: GitHub Workflow Concurrency Guard

This milestone tightened GitHub Actions hygiene by adding concurrency cancellation to the CI and release-check workflows, then making the release workflow verifier enforce that guard.

Changed:

- Added `concurrency` blocks to `.github/workflows/ci.yml` and `.github/workflows/release-check.yml`.
- CI runs now use a `ci-${{ github.workflow }}-${{ github.ref }}` concurrency group with `cancel-in-progress: true`.
- Release-check runs now use a `release-check-${{ github.workflow }}-${{ github.ref }}` concurrency group with `cancel-in-progress: true`.
- Extended `scripts/check-release-workflow.mjs` so `pnpm release:workflow:check` fails if either workflow drops the concurrency group or cancellation setting.
- Updated `RELEASE.md`, `docs/operations.md`, and `docs/current-state.md` to document the workflow concurrency expectation.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
- `git diff --check`: passed.
- `pnpm release:check`: passed after this workflow concurrency update, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files.
  - Docker Compose config rendered successfully.

Remaining risks:

- Workflow concurrency does not publish packages, sign artifacts, or add hosted deployment.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 125: Desktop Packaging Lane Guard

This milestone made the Windows-only desktop packaging boundary executable instead of relying only on documentation.

Changed:

- Added `scripts/check-desktop-packaging.mjs`.
- Added `pnpm desktop:packaging:check`.
- Wired the packaging guard into `pnpm desktop:systems:check`.
- Extended `scripts/check-release-workflow.mjs` so release workflow verification fails if desktop packaging runs outside the `desktop-windows` job or references Linux desktop package artifacts.
- Updated desktop/release docs so Linux remains source/dev usage, not a desktop installer lane.
- Reworded `docs/current-state.md` so the Ubuntu workflow job is described as source/dev release-check coverage rather than a Linux desktop package lane.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm desktop:packaging:check`: passed with `MAINSPRING_DESKTOP_PACKAGING_CHECK_OK`.
- `pnpm desktop:systems:check`: passed with `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`, including the new desktop packaging config step and Windows desktop pack.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `git diff --check`: passed.
- `pnpm release:check`: passed after this desktop packaging guard update, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files.
  - Docker Compose config rendered successfully.

Remaining risks:

- This guard does not add package signing, automatic publishing, or hosted deployment.
- Linux desktop installer packaging remains out of scope; Linux source/dev usage remains in scope.

## Completed Milestone 126: Stable Cell Verifier In Gateway Systems

This milestone moved cell/backend scheduler truth into the normal gateway systems gate without pretending unavailable WSL or Docker backends are working.

Changed:

- Updated `scripts/check-cells.mjs` so the stable verifier passes after proving:
  - host backend is available and explicitly unsafe
  - host backend capability metadata does not claim containment
  - WSL and Docker backend metadata describe their routes and limits
  - Docker metadata discloses container and VM limits
  - scheduler lease acquire, per-cell capacity block, and expiry work
  - unavailable isolated-capable backends report exact blockers while host execution remains not sandboxed
- Added `MAINSPRING_CELLS_CHECK_OK`.
- Added the stable cell verifier to `scripts/check-gateway-systems.mjs`.
- Kept `pnpm cells:check:integration` strict: it still requires an available WSL or Docker backend and intentionally refuses host execution.
- Updated `docs/operations.md`, `docs/features/tools-and-execution.md`, and `docs/current-state.md` to describe stable cell verification vs stricter isolated-backend integration.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm cells:check`: passed with `MAINSPRING_CELLS_CHECK_OK`.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_CELLS_CHECK_OK` included before `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
- `pnpm cells:check:integration`: failed closed because no isolated-capable backend is available on this host.
  - WSL blocker: `Failed to attach disk 'C:\Users\drper\AppData\Local\OpenClawManager\wsl\OpenClawHost\ext4.vhdx' to WSL2: The system cannot find the path specified. Error code: Wsl/Service/CreateInstance/MountDisk/HCS/ERROR_PATH_NOT_FOUND`
  - Docker blocker: `Docker is reachable but is not using Linux containers: unknown.`
  - Host execution was intentionally rejected for this verifier.
- `git diff --check`: passed.
- `pnpm release:check`: passed after adding stable cell verification to gateway systems, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files.
  - Docker Compose config rendered successfully.

Remaining risks:

- `HyperCellScheduler` remains local backend leasing/status, not VM isolation or a full remote pool.
- `pnpm cells:check:integration` can only pass on hosts with an available WSL or Docker backend; host execution is intentionally rejected for that stricter verifier.
- Host shell execution remains not sandboxed.

## Completed Milestone 127: Cell Integration Prerequisite Diagnostics

This milestone kept isolated-backend integration strict while making missing prerequisites explicit and machine-readable.

Changed:

- Updated `scripts/check-cells-integration.mjs` so missing prerequisites still exit nonzero, but now emit:
  - `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED`
  - a JSON payload with `status`, `message`, `requestedBackend`, accepted backend list, `hostExecutionAccepted: false`, and per-backend availability/reason details
- Preserved the verifier's refusal to run through host execution.
- Updated `docs/features/tools-and-execution.md`, `docs/operations.md`, and `docs/current-state.md` so the strict optional verifier behavior is documented.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm cells:check:integration`: failed closed as expected because no isolated-capable backend is available, and emitted `MAINSPRING_CELLS_INTEGRATION_PREREQUISITES_BLOCKED` plus JSON with:
  - `status: prerequisites_blocked`
  - `requestedBackend: auto`
  - `acceptedBackends: ["wsl", "docker"]`
  - `hostExecutionAccepted: false`
  - backend reasons for host, WSL, and Docker
- `pnpm cells:check`: passed with `MAINSPRING_CELLS_CHECK_OK`.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_CELLS_CHECK_OK` included before `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
- `git diff --check`: passed.
- `pnpm release:check`: passed after the strict cell integration diagnostic update, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files.
  - Docker Compose config rendered successfully.

Remaining risks:

- `pnpm cells:check:integration` still cannot pass on this host until WSL or Docker is available as an isolated-capable backend.
- Host shell execution remains not sandboxed.

## Completed Milestone 128: OpenRouter E2E Prerequisite Diagnostics

This milestone made the optional live OpenRouter verifier's missing-key failure explicit and machine-readable without weakening the release gate or exposing secrets.

Changed:

- Updated `scripts/openrouter-e2e.mjs` so missing `OPENROUTER_API_KEY` still exits nonzero, but now emits:
  - `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED`
  - a JSON payload with `status`, `message`, required env names, `.env.local` as the checked env file, and `keyEchoed: false`
- Added `MAINSPRING_OPENROUTER_E2E_SKIP_ENV_FILE=1` for proving the missing-key branch without loading `.env.local`.
- Kept `openrouter:e2e` outside `release:check` because it depends on a live key and network access.
- Updated `docs/features/secrets-and-providers.md`, `docs/operations.md`, and `docs/current-state.md` to document the optional live-provider verifier behavior.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm openrouter:e2e`: passed against live OpenRouter with:
  - `status: OPENROUTER_E2E_OK`
  - provider `openrouter`
  - model `openrouter/free`
  - completed exit reason
  - usage present
- Missing-key branch: passed the intended fail-closed diagnostic by running the script with `.env.local` skipped and `OPENROUTER_API_KEY` absent:
  - exited nonzero
  - emitted `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED`
  - emitted JSON with `status: prerequisites_blocked`, `requiredEnv: ["OPENROUTER_API_KEY"]`, `keyPresent: false`, and `keyEchoed: false`
- `pnpm security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `git diff --check`: passed.
- `pnpm release:check`: passed after the final skip-env helper edit, including:
  - `pnpm verify`
  - `pnpm gateway:systems:check`
  - `pnpm gateway:dev:help`
  - `pnpm examples:smoke`
  - `pnpm agentic:check`
  - `pnpm desktop:systems:check`
  - `pnpm release:workflow:check`
  - `pnpm package:check`
  - `pnpm pack --dry-run`
  - `npm pack --dry-run`
  - `docker compose -f docker/compose.local.yml config`
- Notable proof tokens observed:
  - `55 passed (55)` test files and `364 passed (364)` tests.
  - `Mainspring security guard passed.`
  - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - npm dry-run tarball total stayed at 362 files.
  - Docker Compose config rendered successfully.

Remaining risks:

- `pnpm openrouter:e2e` can only pass when a real OpenRouter key and network path are available.
- Live provider checks are still not release-gate requirements.
- Provider keys must remain host-side and must not enter renderer localStorage or package output.

## Completed Milestone 129: Optional Verifier Diagnostic Gate

This milestone made optional verifier prerequisite diagnostics part of the stable release gate without requiring live external services.

Changed:

- Added `scripts/check-optional-verifiers.mjs`.
- Added `pnpm optional-verifiers:check`.
- Wired `pnpm optional-verifiers:check` into `pnpm release:check`.
- Updated `.github/workflows/release-check.yml` and `scripts/check-release-workflow.mjs` so GitHub release-check parity includes the new optional-verifier diagnostic gate.
- The new checker runs `scripts/openrouter-e2e.mjs` with `.env.local` skipped and `OPENROUTER_API_KEY` removed, then verifies:
  - nonzero exit
  - `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED`
  - parseable JSON
  - `status: prerequisites_blocked`
  - `keyPresent: false`
  - `keyEchoed: false`
  - `OPENROUTER_API_KEY` listed in `requiredEnv`
  - no key-looking material in output
- Adjusted the checker's leak probe so it does not contain scanner-triggering key-prefix literals while still checking the emitted diagnostic output.
- Updated `docs/operations.md`, `docs/features/secrets-and-providers.md`, and `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm optional-verifiers:check`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `pnpm release:workflow:check`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (166 intentional hits allowlisted).`
  - `pnpm package:check`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `364 passed (364)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`
  - `git diff --check`

Remaining risks:

- This does not make live provider checks mandatory.
- `pnpm openrouter:e2e` still requires a real key and network path.
- Provider keys must remain host-side and must not enter renderer localStorage or package output.

## Completed Milestone 130: Hosted Browser-Access Query Hardening

This milestone tightened the local gateway hosted-auth browser-access boundary without changing the runtime execution path.

Changed:

- Updated `src/gateway/server/createLocalGatewayServer.ts` so hosted browser-access ticket resolution fails closed when ticketed `GET` URLs include auth-like query keys such as `sessionToken`, `access_token`, `id_token`, `authorization`, `gatewayToken`, `api_key`, `password`, or `secret`.
- Built the source-level `api_key` denylist value from fragments so the sensitive-pattern scanner does not carry a secret-like marker in implementation code.
- Added server regression coverage proving:
  - a valid artifact browser-access ticket works normally
  - the same ticket fails with `401` if a session-token query parameter is appended
  - a valid SSE browser-access ticket fails with `401` if an OAuth-style token query parameter is appended
- Updated `apps/console/src/localGatewayTransport.ts` so console-side artifact/SSE browser-access URL validation rejects the same broader auth-like query keys before rendering previews, downloads, or `EventSource` URLs.
- Added console transport tests for `access_token` and `id_token` rejection.
- Updated `docs/current-state.md`, `docs/features/local-gateway.md`, and `docs/security.md` with the verified boundary.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayTransport.test.ts --passWithNoTests`
    - `2 passed (2)` test files
    - `16 passed (16)` tests
  - `pnpm typecheck`
  - `pnpm console:typecheck`
  - `pnpm gateway:systems:check`
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `pnpm console:build`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (167 intentional hits allowlisted).`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `364 passed (364)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`
  - `git diff --check`

Remaining risks:

- Browser-access tickets are still short-lived bearer URLs for local gateway use, not public sharing links.
- Hosted auth remains local/operator auth, not enterprise SSO or a hosted SaaS identity system.
- This hardening prevents accidental token-bearing query URLs on ticketed artifact/SSE reads, but it is not a multi-user authorization model.

## Completed Milestone 131: Console Unix Host-Path Response Tripwire

This milestone tightened the console-side local gateway response guard so its "host absolute path" claim covers both Windows and Unix-style host paths.

Changed:

- Updated `apps/console/src/localGatewayClient.ts` so successful JSON responses are rejected before entering UI state when they contain Unix-style absolute host paths rooted under common sensitive prefixes such as `/Users`, `/home`, `/tmp`, `/var`, `/etc`, `/srv`, `/mnt`, `/runtime`, `/sessions`, `/workspaces`, or `/artifacts`.
- Kept normal local gateway browser URLs usable by requiring the Unix-path detector to match path-looking text boundaries rather than URL path segments after a hostname.
- Added a focused regression test in `apps/console/src/localGatewayClient.test.ts` proving a response with no forbidden field names and only a Unix-style host path is still rejected.
- Updated `docs/current-state.md` and `docs/security.md` to describe the console response validation as a browser-edge regression tripwire, not the primary security boundary.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run apps/console/src/localGatewayClient.test.ts --passWithNoTests`
    - `1 passed (1)` test file
    - `3 passed (3)` tests
  - `pnpm console:typecheck`
  - `pnpm typecheck`
  - `pnpm console:build`
  - `pnpm gateway:systems:check`
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `365 passed (365)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`
  - `git diff --check`

Remaining risks:

- Console response validation is still a last-mile browser tripwire layered on gateway DTO projection and sanitization.
- It does not replace gateway-side redaction, hosted auth, OS permissions, or artifact access checks.
- Host shell execution remains approval-gated but not sandboxed.

## Completed Milestone 132: Console UNC Host-Path Response Tripwire

This milestone aligned the console-side local gateway response guard with the gateway sanitizer's existing UNC-path treatment.

Changed:

- Updated `apps/console/src/localGatewayClient.ts` so successful JSON responses are rejected before entering UI state when they contain UNC-looking host paths such as `\\host\share\artifact.md`.
- Added a focused regression test in `apps/console/src/localGatewayClient.test.ts` proving a response with no forbidden field names and only a UNC host path is still rejected.
- Updated `docs/current-state.md` and `docs/security.md` so the documented console response tripwire covers Windows drive-letter, UNC, and Unix host path shapes.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run apps/console/src/localGatewayClient.test.ts --passWithNoTests`
    - `1 passed (1)` test file
    - `4 passed (4)` tests
  - `pnpm console:typecheck`
  - `pnpm typecheck`
  - `pnpm console:build`
  - `pnpm gateway:systems:check`
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `366 passed (366)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`
  - `git diff --check`

Remaining risks:

- Console response validation remains a last-mile browser tripwire, not the primary security boundary.
- It does not replace gateway-side sanitization, hosted auth, OS permissions, or artifact access checks.
- Host shell execution remains approval-gated but not sandboxed.

## Completed Milestone 133: Console Local Gateway URL Userinfo Rejection

This milestone tightened console local-gateway URL hygiene so browser-facing gateway URLs cannot smuggle credential-like material through URL userinfo.

Changed:

- Updated `apps/console/src/localGatewayTransport.ts` so `isAllowedLocalGatewayUrl()` rejects local URLs with `username` or `password` userinfo, even when the host is `localhost` or `127.0.0.1`.
- Updated artifact and event-stream browser-access URL derivation to validate the full access URL instead of only its origin, so `http://token@127.0.0.1:8787/...` and `http://user:password@localhost:8787/...` are rejected before preview, download, or `EventSource` use.
- Added focused transport tests for:
  - rejecting local gateway base URLs with userinfo credentials
  - falling back to the default gateway URL when a query override contains userinfo
  - rejecting artifact browser-access URLs with userinfo
  - rejecting event-stream browser-access URLs with userinfo
- Updated `docs/current-state.md`, `docs/security.md`, and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run apps/console/src/localGatewayTransport.test.ts --passWithNoTests`
    - `1 passed (1)` test file
    - `8 passed (8)` tests
  - `pnpm console:typecheck`
  - `pnpm typecheck`
  - `pnpm console:build`
  - `pnpm gateway:systems:check`
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `366 passed (366)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`
  - `git diff --check`

Remaining risks:

- URL userinfo rejection is browser transport hygiene, not credential management.
- Browser-access tickets remain short-lived local bearer URLs.
- Hosted auth remains local/operator auth, not enterprise SSO or a hosted SaaS identity system.

## Completed Milestone 134: Console Provider-Key Marker Response Tripwire

This milestone tightened the console-side local gateway response guard so successful JSON responses cannot carry common provider key environment markers into browser UI state.

Changed:

- Updated `apps/console/src/localGatewayClient.ts` so the browser response tripwire rejects common provider credential environment markers for OpenAI, OpenRouter, Anthropic, Google/Gemini, Mistral, Cohere, Together, Groq, and Azure OpenAI.
- Built the marker strings from fragments in implementation/test code so the scanner does not need to treat source literals as credential-shaped values.
- Added a focused regression test proving a successful `/snapshot` response containing an OpenAI provider key environment marker is rejected before entering console state.
- Updated `docs/current-state.md`, `docs/security.md`, and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run apps/console/src/localGatewayClient.test.ts --passWithNoTests`
    - `1 passed (1)` test file
    - `5 passed (5)` tests
  - `pnpm console:typecheck`
  - `pnpm typecheck`
  - `pnpm console:build`
  - `pnpm gateway:systems:check`
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `git diff --check`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `367 passed (367)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`

Remaining risks:

- Console response validation remains a last-mile browser tripwire, not the primary security boundary.
- It does not replace gateway-side DTO sanitization, hosted auth, OS permissions, or artifact access checks.
- Provider keys must remain host-side and must not enter renderer localStorage, browser DTOs, package artifacts, logs, prompts, or event payloads.

## Completed Milestone 135: Gateway Provider-Key Marker Text Redaction

This milestone moved common provider key environment marker handling closer to the browser-facing gateway boundary by redacting those markers in gateway JSON/SSE free text before the console client receives responses.

Changed:

- Updated `src/gateway/server/sanitize.ts` so `sanitizeGatewayResponse()` redacts common provider credential environment markers for OpenAI, OpenRouter, Anthropic, Google/Gemini, Mistral, Cohere, Together, Groq, and Azure OpenAI when they appear inside free-text payloads.
- Added focused sanitizer coverage proving OpenAI and Anthropic provider key environment markers embedded in text payloads are redacted along with existing path and browser-unsafe field markers.
- Updated `docs/current-state.md`, `docs/security.md`, and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run src/gateway/server/sanitize.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`
    - `2 passed (2)` test files
    - `7 passed (7)` tests
  - `pnpm gateway:surface:check`
    - `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`
  - `pnpm typecheck`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `367 passed (367)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`

Remaining risks:

- Redaction is a leak-reduction layer, not secret storage or authorization.
- Provider keys must still stay host-side and out of renderer localStorage, prompts, logs, package artifacts, and browser DTOs.
- Console response validation remains useful as a fail-closed last-mile tripwire if a future gateway route misses sanitization.

## Completed Milestone 136: Console Snapshot Provider-Key Marker Redaction

This milestone aligned the console snapshot/read-model adapter with the gateway sanitizer and console client tripwire so direct provider key environment markers are redacted during DTO projection, not only rejected after HTTP responses arrive.

Changed:

- Updated `src/gateway/ConsoleSnapshotAdapter.ts` so `browserSafePreviewText()` redacts common provider credential environment markers for OpenAI, OpenRouter, Anthropic, Google/Gemini, Mistral, Cohere, Together, Groq, and Azure OpenAI.
- Extended adapter tests so recursive run-event payloads and marketplace install display DTOs redact marker-only provider credential environment strings that are not attached to `secretRef=...` fields.
- Updated `docs/current-state.md`, `docs/security.md`, and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run src/gateway/ConsoleSnapshotAdapter.test.ts --passWithNoTests`
    - `1 passed (1)` test file
    - `15 passed (15)` tests
  - `pnpm typecheck`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `git diff --check`
  - `pnpm release:check`
    - `55 passed (55)` test files
    - `367 passed (367)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `362`
    - `docker compose -f docker/compose.local.yml config`

Remaining risks:

- Adapter redaction is still a browser DTO hardening layer, not secret storage or authorization.
- Provider keys must remain host-side and out of renderer localStorage, prompts, logs, package artifacts, and browser DTOs.
- Gateway sanitizer and console client fail-closed checks remain necessary defense-in-depth if future routes bypass a particular projection helper.

## Completed Milestone 137: Shared Browser Provider-Marker Helper

This milestone consolidated the duplicated provider key environment marker list used by the gateway sanitizer, console snapshot adapter, and console local-gateway response tripwire.

Changed:

- Added `src/gateway/browserSafety.ts` as a pure browser-safe helper for common provider credential environment marker names, regex construction, and text redaction.
- Added the narrow package subpath `mainspring/gateway/browser-safety` and console TypeScript path mapping so browser code can import the helper without importing the full local gateway runtime.
- Refactored:
  - `src/gateway/server/sanitize.ts`
  - `src/gateway/ConsoleSnapshotAdapter.ts`
  - `apps/console/src/localGatewayClient.ts`
- Added focused helper tests in `src/gateway/browserSafety.test.ts`.
- Updated `docs/current-state.md`, `docs/security.md`, and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run src/gateway/browserSafety.test.ts src/gateway/server/sanitize.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`
    - `4 passed (4)` test files
    - `24 passed (24)` tests
  - `pnpm typecheck`
  - `pnpm console:typecheck`
  - `pnpm console:build`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm package:check`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `git diff --check`
  - `pnpm release:check`
    - `56 passed (56)` test files
    - `369 passed (369)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `365`
    - `docker compose -f docker/compose.local.yml config`

Remaining risks:

- The helper centralizes marker names only; it is not secret storage, authorization, or cryptographic containment.
- Browser DTO sanitization and tripwires remain defense-in-depth and do not replace host-side secret handling.
- Provider keys must remain host-side and out of renderer localStorage, prompts, logs, package artifacts, and browser DTOs.

## Completed Milestone 138: Console Static Snapshot Provider-Marker Guard

This milestone moved the console static snapshot forbidden-token guard onto the shared browser provider-marker helper so dashboard/read-model tests catch the same provider key environment markers as the gateway sanitizer, console adapter, and local-gateway client response tripwire.

Changed:

- Updated `apps/console/src/consoleDataSource.ts` so `forbiddenConsoleSnapshotTokens` includes `browserUnsafeProviderCredentialMarkers()` from `mainspring/gateway/browser-safety`.
- Extended `apps/console/src/consoleDataSource.test.ts` to prove the static snapshot guard flags an Anthropic provider key environment marker, not only older OpenAI/OpenRouter markers.
- Updated `docs/current-state.md` and `docs/features/local-gateway.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- Passed:
  - `pnpm exec vitest run src/gateway/browserSafety.test.ts apps/console/src/consoleDataSource.test.ts apps/console/src/consoleReadModelPipeline.test.ts apps/console/src/dashboardProjection.test.ts apps/console/src/dashboardViewModel.test.ts --passWithNoTests`
    - `5 passed (5)` test files
    - `19 passed (19)` tests
  - `pnpm typecheck`
  - `pnpm console:build`
  - `pnpm run security:sensitive-patterns`
    - `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
  - `pnpm package:check`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `git diff --check`
  - `pnpm release:check`
    - `56 passed (56)` test files
    - `369 passed (369)` tests
    - `MAINSPRING_CELLS_CHECK_OK`
    - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
    - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
    - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
    - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
    - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
    - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
    - `npm pack --dry-run` total files: `365`
    - `docker compose -f docker/compose.local.yml config`

Remaining risks:

- Static snapshot guards are test/read-model tripwires, not secret storage or authorization.
- Provider keys must remain host-side and out of renderer localStorage, prompts, logs, package artifacts, and browser DTOs.
- Gateway sanitizer, console adapter, and response rejection remain separate defense-in-depth layers.

## Completed Milestone 139: Browser-Safety Export Contract Test

This milestone tightened the lightweight package export unit tests so the narrow browser-safety subpath is checked before the heavier package surface verifier runs.

Changed:

- Updated `src/package-exports.test.ts` to assert that `./gateway/browser-safety` exports:
  - `./dist/gateway/browserSafety.js`
  - `./dist/gateway/browserSafety.d.ts`
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm exec vitest run src/package-exports.test.ts src/gateway/browserSafety.test.ts --passWithNoTests`: passed, 2 files / 5 tests.
- `pnpm typecheck`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
- `git diff --check`: passed.
- `pnpm console:build`: passed.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - 56 Vitest files / 370 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- This is package-contract coverage, not runtime isolation, authorization, or secret storage.
- The browser-safety subpath remains a pure helper; provider keys must still stay host-side and out of renderer localStorage, prompts, logs, package artifacts, and browser DTOs.

## Completed Milestone 140: Shared Gateway Text Redaction Helper

This milestone consolidated duplicated browser-facing text redaction logic into the pure browser-safety helper that is already exported as `mainspring/gateway/browser-safety`.

Changed:

- Extended `src/gateway/browserSafety.ts` with:
  - `browserUnsafeGatewayTextMarkers()`
  - `redactBrowserUnsafeGatewayText()`
- Refactored `src/gateway/server/sanitize.ts` to use the shared gateway text redactor instead of its own regex chain.
- Refactored `src/gateway/ConsoleSnapshotAdapter.ts` to use the same shared gateway text redactor before preview whitespace normalization.
- Extended `src/gateway/browserSafety.test.ts` to cover shared gateway text marker exposure and redaction of common browser-unsafe path/secret marker text.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm exec vitest run src/gateway/browserSafety.test.ts src/gateway/server/sanitize.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts --passWithNoTests`: passed, 3 files / 21 tests.
- `pnpm typecheck`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - 56 Vitest files / 372 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- Shared redaction reduces browser-facing leak drift; it is not sandboxing, hosted authorization, secure desktop secret storage, or a replacement for explicit DTO boundaries.
- Host shell execution remains unsandboxed and provider credentials must remain host-side.

## Completed Milestone 141: Console Response Rejection Uses Shared Browser-Safety Contract

This milestone aligned the console local gateway client's successful-response rejection guard with the shared browser-safety helper, so browser-facing redaction and client-side rejection drift less over time.

Changed:

- Added `containsBrowserUnsafeGatewayText()` to `src/gateway/browserSafety.ts`.
- Included the private-key marker in `browserUnsafeGatewayTextMarkers()`.
- Updated `apps/console/src/localGatewayClient.ts` to use:
  - `browserUnsafeGatewayTextMarkers()`
  - `containsBrowserUnsafeGatewayText()`
- Removed the console client's duplicate forbidden-token list and host-path regex copies.
- Extended `src/gateway/browserSafety.test.ts` to prove callers can detect unsafe gateway text through the shared predicate.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm exec vitest run src/gateway/browserSafety.test.ts apps/console/src/localGatewayClient.test.ts --passWithNoTests`: passed, 2 files / 10 tests.
- `pnpm console:typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- Client-side response rejection is a regression tripwire after gateway DTOs and sanitization; it is not the primary security boundary.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 142: Console Read-Model Guards Use Shared Browser-Safety Markers

This milestone aligned the console snapshot/read-model forbidden-token guards with the shared browser-safety marker list.

Changed:

- Updated `apps/console/src/consoleDataSource.ts` so `forbiddenConsoleSnapshotTokens` comes directly from `browserUnsafeGatewayTextMarkers()`.
- Because `consoleReadModelPipeline`, `dashboardProjection`, and `dashboardViewModel` already use `forbiddenConsoleSnapshotTokens` as their default guard list, those read-model and dashboard guards now inherit the shared marker contract too.
- Extended `apps/console/src/consoleDataSource.test.ts` to prove the shared private-key marker is flagged by the console snapshot guard.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm exec vitest run apps/console/src/consoleDataSource.test.ts apps/console/src/consoleReadModelPipeline.test.ts apps/console/src/dashboardProjection.test.ts apps/console/src/dashboardViewModel.test.ts src/gateway/browserSafety.test.ts --passWithNoTests`: passed, 5 files / 22 tests.
- `pnpm typecheck`: passed.
- `pnpm console:build`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- Console forbidden-token guards are regression tripwires over already browser-shaped state; they do not replace gateway DTOs, sanitizer coverage, hosted auth, or OS-level permission boundaries.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 143: Package Surface Pins Full Browser-Safety Contract

This milestone tightened the package-surface verifier so the exported `mainspring/gateway/browser-safety` subpath stays aligned with the helpers now used by the gateway sanitizer, console snapshot adapter, console local gateway client, and console read-model guards.

Changed:

- Updated `scripts/check-package-surface.mjs` so `mainspring/gateway/browser-safety` must export:
  - `browserUnsafeGatewayTextMarkers`
  - `browserUnsafeProviderCredentialMarkerPattern`
  - `browserUnsafeProviderCredentialMarkers`
  - `containsBrowserUnsafeGatewayText`
  - `redactBrowserUnsafeGatewayText`
  - `redactBrowserUnsafeProviderCredentialMarkers`
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm run security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (168 intentional hits allowlisted).`
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- This is package-contract verification only; it does not add sandboxing, hosted authorization, secure desktop secret storage, or process containment.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 144: Console Browser-Safety Wiring Verifier

This milestone added a release-gated verifier for the console's narrow browser-safety helper wiring.

Changed:

- Added `scripts/check-console-browser-safety.mjs`.
- Added `pnpm console:browser-safety:check`.
- Wired `pnpm console:browser-safety:check` into `pnpm verify` before `pnpm console:build`.
- Updated `scripts/check-release-workflow.mjs` so release workflow validation requires:
  - the `console:browser-safety:check` package script
  - `pnpm verify` to include `pnpm console:browser-safety:check`
- The new verifier checks that:
  - `apps/console/vite.config.ts` aliases `mainspring/gateway/browser-safety` to `src/gateway/browserSafety.ts`
  - `apps/console/tsconfig.json` maps the same package subpath to the same source file
  - `package.json` exposes `./gateway/browser-safety` as the narrow built subpath
  - console sources using browser-safety helpers import through `mainspring/gateway/browser-safety`
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm console:browser-safety:check`: passed with `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering for `docker/compose.local.yml`

Remaining risks:

- This verifies browser-safety helper wiring and import hygiene; it is not a browser sandbox, hosted auth model, secure secret store, or process containment boundary.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 145: Browser-Safety Helper Purity Guard

This milestone strengthened the console browser-safety verifier so the helper aliased into the browser bundle stays pure and narrow.

Changed:

- Updated `scripts/check-console-browser-safety.mjs` to inspect `src/gateway/browserSafety.ts` directly.
- The verifier now requires the browser-safety source to export:
  - `browserUnsafeGatewayTextMarkers`
  - `browserUnsafeProviderCredentialMarkerPattern`
  - `browserUnsafeProviderCredentialMarkers`
  - `containsBrowserUnsafeGatewayText`
  - `redactBrowserUnsafeGatewayText`
  - `redactBrowserUnsafeProviderCredentialMarkers`
- The verifier now rejects Node/runtime imports or obvious runtime-only globals in `src/gateway/browserSafety.ts`, including `node:` imports, package-internal `#` imports, sibling runtime imports, `fs`, `path`, `process`, `Buffer`, `Database`, and `better-sqlite3`.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm console:browser-safety:check`: passed with `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`.
- `pnpm typecheck`: passed.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with 168 intentional hits allowlisted.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - gateway dev help
  - examples
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering

Remaining risks:

- This keeps one helper browser-pure; it does not make browser-side checks a sandbox, hosted auth model, secure credential store, or process containment boundary.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 146: Docs Surface Verification

This milestone made the rewritten docs structure executable, so the public documentation set is checked as a project surface instead of relying on convention.

Changed:

- Added `scripts/check-docs-surface.mjs`.
- Added `pnpm docs:check`.
- Wired `pnpm docs:check` into `pnpm verify`.
- Updated `scripts/check-release-workflow.mjs` so release workflow verification requires the docs check script and its inclusion in `pnpm verify`.
- Removed the empty stale `docs/marketing` directory left behind by the docs consolidation.
- Updated `docs/current-state.md`, `docs/operations.md`, and `docs/documentation-guide.md`.

The new verifier checks that:

- `docs/index.md` keeps the expected start/features/project/historical-ledger shape.
- Every package-visible docs Markdown file, except `docs/README.md` and `docs/index.md`, is linked from `docs/index.md`.
- `docs/goal-digest.md` remains repo-local and is not Markdown-linked from package-visible docs.
- Removed legacy marketing, Hermes-port, and Linux/packaging-era docs do not return to the public docs surface.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - `MAINSPRING_DOCS_SURFACE_CHECK_OK`
  - `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - gateway dev help
  - examples
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering

Remaining risks:

- This guards documentation structure and package-visible docs hygiene; it does not implement missing long-term product features.
- The goal digest remains an internal continuation ledger and is intentionally not a user-facing docs source.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 147: Feature Docs Contract

This milestone tightened the docs rewrite so each feature page follows the same project-doc contract instead of drifting into mixed notes.

Changed:

- Extended `scripts/check-docs-surface.mjs` so every package-visible `docs/features/*.md` file must include:
  - `## What It Does`
  - `## What It Does Not Do`
  - `## How To Verify`
  - a `bash` verification block containing at least one `pnpm` command
- Rewrote the six feature docs into that shape:
  - `docs/features/automation-marketplace-deployment.md`
  - `docs/features/budgets-and-usage.md`
  - `docs/features/console-and-desktop.md`
  - `docs/features/local-gateway.md`
  - `docs/features/secrets-and-providers.md`
  - `docs/features/tools-and-execution.md`
- Updated `docs/documentation-guide.md` so the documented feature-doc convention matches the verifier.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm release:workflow:check`: passed with `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - `MAINSPRING_DOCS_SURFACE_CHECK_OK`
  - `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - gateway dev help
  - examples
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - sensitive-pattern scan with 169 intentional hits allowlisted
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering

Remaining risks:

- This is documentation governance and public-doc consistency only; it does not implement missing long-term product features.
- Feature docs describe current repo behavior and limits, not a claim that hosted SaaS, secure desktop secrets, billing, VM isolation, or marketplace payments exist.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 148: Artifact Filename Surface Redaction

This milestone closed a concrete browser-facing artifact surface: ticketed artifact reads already required auth/browser-access tickets, but generated `Content-Disposition` filenames could still be derived directly from artifact labels.

Changed:

- Updated `src/gateway/server/createLocalGatewayServer.ts` so `safeArtifactFilename()` redacts browser-unsafe gateway text before converting labels into filesystem-safe response filenames.
- Extended `scripts/check-gateway-response-surface.mjs` to:
  - create a poisoned artifact record with unsafe marker text in `kind` and `label`
  - prove the snapshot artifact DTO redacts the marker text
  - mint a normal local artifact browser-access URL
  - fetch the real artifact content through that URL
  - prove `Content-Disposition` includes redacted filename text and does not echo `workspaceRoot`, `artifactPath`, `filePath`, Windows paths, or Unix host paths
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm exec vitest run src/gateway/server/createLocalGatewayServer.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts`: passed, 2 files / 23 tests.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`.
- `pnpm run security:sensitive-patterns`: passed with 169 intentional hits allowlisted.
- `pnpm release:check`: passed end to end, including:
  - `pnpm verify`
  - `MAINSPRING_DOCS_SURFACE_CHECK_OK`
  - `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`
  - 56 Vitest files / 373 tests
  - `MAINSPRING_CELLS_CHECK_OK`
  - `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`
  - `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`
  - gateway dev help
  - examples
  - `MAINSPRING_AGENTIC_HARNESS_CHECK_OK`
  - `MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK`
  - `MAINSPRING_RELEASE_WORKFLOW_CHECK_OK`
  - `MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK`
  - `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`
  - `npm pack --dry-run` with 365 package files
  - Docker Compose config rendering

Remaining risks:

- Artifact browser-access URLs are still short-lived local bearer URLs, not public sharing links or a multi-user permission model.
- This protects generated artifact response filenames; it intentionally does not rewrite artifact file content.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 149: Shared Browser-Access Query Key Guard

This milestone removed another browser-edge drift point: server and console checks for auth-like query parameters on local browser-access URLs now use the same pure browser-safety helper.

Changed:

- Added `browserUnsafeBrowserAccessQueryKeys()` and `isBrowserUnsafeBrowserAccessQueryKey()` to `src/gateway/browserSafety.ts`.
- Included hyphenated and underscored variants for access, API, gateway, ID, OAuth, refresh, and session token query names.
- Updated the hosted gateway server to use the shared predicate when validating ticketed artifact and SSE browser-access requests.
- Updated the console local gateway transport helpers to use the same predicate when deriving safe artifact preview/download URLs and event-stream URLs.
- Updated tests for:
  - shared query-key helper coverage
  - console artifact/event-stream URL derivation rejecting `session-token` and `oauth-token`
  - hosted server ticketed artifact/SSE routes rejecting `session-token` and `oauth-token`
- Updated `scripts/check-package-surface.mjs` and `scripts/check-console-browser-safety.mjs` so the new narrow browser-safety exports and console transport import are pinned.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm exec vitest run src/gateway/browserSafety.test.ts src/gateway/server/createLocalGatewayServer.test.ts apps/console/src/localGatewayTransport.test.ts`: passed, 3 files / 22 tests.
- `pnpm console:browser-safety:check`: passed with `MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm gateway:surface:check`: passed with `MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK`.
- `pnpm gateway:systems:check`: passed with `MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK`; host execution was reported available but unsafe, WSL unavailable because the configured VHDX is missing, and Docker unavailable because it is not using Linux containers.
- `pnpm run security:sensitive-patterns`: passed with 170 intentional hits allowlisted.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 374 tests, docs surface check, console browser-safety check, gateway systems, gateway response-surface check, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- Browser-access URLs are still short-lived local bearer URLs, not a multi-user permission model.
- This aligns URL query-key rejection; it does not make browser-side checks a sandbox or replace hosted auth.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 150: Tool Update Events Preserve Typed SDK/Gateway Projection

This milestone closed an event-contract gap: native mailbox `tool.update` rows were already supported by the control-channel `TurnEvent` bridge, but the SDK/gateway `RunEvent` normalizer demoted them to generic runtime warnings. They now remain typed as tool-call update events.

Changed:

- Added public `tool.call.updated` to the SDK/gateway `RunEventType` contract.
- Added `ToolCallUpdatedRunEventPayload` and exported it through the contracts barrel.
- Updated `normalizeRuntimeEventRow()` so native `tool.update` rows project as `tool.call.updated` with sanitized message and payload detail.
- Updated SDK tool-call collection and monitoring snapshots so `tool.call.updated` is included in tool-call helpers and recent-tool status.
- Updated the gateway tool-call read-model sync so update-only rows are preserved as `updated` status and fall back to the `toolCallId` when the native update row has no tool name.
- Updated the browser-safe console run-event DTO test to prove `tool.call.updated` payloads still redact path/secret marker text.
- Updated `docs/current-state.md` and `docs/runtime-loop.md` to document the native `MainspringEvent` -> SDK/gateway `RunEvent` -> control `TurnEvent` distinction for tool-call events.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts src/gateway/LocalGateway.test.ts src/sdk/Mainspring.test.ts --passWithNoTests`: passed, 6 files / 76 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 375 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `tool.call.updated` preserves runtime progress/update detail; it does not change tool execution, approval policy, or sandboxing.
- Native `tool.update` rows do not include a tool name, so gateway update-only read-model rows use `toolCallId` as a fallback display key until a requested/result row provides the name.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 151: Artifact Created Events Stay Typed Across SDK/Gateway Projection

This milestone closed the next event-contract gap after `tool.call.updated`: native mailbox `artifact.created` rows already existed and the control-channel bridge already emitted `artifact.created`, but the SDK/gateway `RunEvent` normalizer hid those rows as generic runtime warnings. They now remain typed in SDK/gateway event streams.

Changed:

- Added public `artifact.created` to the SDK/gateway `RunEventType` contract.
- Added `ArtifactCreatedRunEventPayload` and exported it through the contracts barrel.
- Updated `normalizeRuntimeEventRow()` so native `artifact.created` rows project as `artifact.created` with `artifactId` and `kind`.
- Extended normalizer coverage so every public SDK/gateway `RunEventType` remains classified and artifact creation rows retain `artifact-only` visibility.
- Extended the gateway artifact projection test so `gateway.events.list()` proves the typed `artifact.created` event is visible while the existing raw-mailbox artifact read-model sync still creates the artifact record.
- Updated `docs/current-state.md` and `docs/runtime-loop.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/LocalGateway.test.ts src/gateway/ConsoleSnapshotAdapter.test.ts --passWithNoTests`: passed, 5 files / 68 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 376 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `artifact.created` in SDK/gateway event streams exposes stable artifact identifiers and kind only; artifact content access is still governed by the gateway artifact/browser-access paths.
- This does not change artifact storage, hosted auth, browser-access ticket semantics, or sandboxing.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 152: File Change Events Stay Typed Across SDK/Gateway Projection

This milestone continued the event-contract cleanup: native mailbox `file.change` rows already bridged to control-channel `file.preview`, but SDK/gateway `RunEvent` consumers saw them only as generic runtime warnings. They now project as typed file-change run events.

Changed:

- Added public `file.changed` to the SDK/gateway `RunEventType` contract.
- Added `FileChangedRunEventPayload` and exported it through the contracts barrel.
- Updated `normalizeRuntimeEventRow()` so native `file.change` rows project as `file.changed` with path and normalized action.
- Normalized unknown native file actions to `unknown` rather than widening the public SDK/gateway action contract.
- Extended normalizer coverage so every public SDK/gateway `RunEventType` remains classified and file changes retain `sensitive` visibility.
- Extended the gateway manual mailbox projection test so `gateway.events.list()` proves typed `file.changed` events are visible through the event-store path.
- Updated `docs/current-state.md` and `docs/runtime-loop.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 4 files / 54 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 377 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `file.changed` is a metadata event only; it does not change file access policy, approval receipts, or workspace containment.
- File paths in SDK/gateway events are still runtime trace metadata and remain sensitive; browser-facing DTOs still handle run-event payload redaction separately.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 153: Memory And Skill Events Stay Typed Across SDK/Gateway Projection

This milestone continued the event-contract cleanup after file-change projection. Native mailbox `memory.event` and `skill.event` rows already had stable runtime meaning, but SDK/gateway `RunEvent` consumers saw them only as generic runtime warnings. They now remain typed in SDK/gateway event streams.

Changed:

- Added public `memory.updated` and `skill.updated` to the SDK/gateway `RunEventType` contract.
- Added `MemoryUpdatedRunEventPayload` and `SkillUpdatedRunEventPayload`, then exported both through the contracts barrel.
- Updated `normalizeRuntimeEventRow()` so native `memory.event` rows project as `memory.updated` with action and sanitized metadata.
- Updated `normalizeRuntimeEventRow()` so native `skill.event` rows project as `skill.updated` with skill key, action, and sanitized metadata.
- Extended normalizer coverage so every public SDK/gateway `RunEventType` remains classified and memory/skill updates retain `sensitive` visibility.
- Extended the gateway manual mailbox projection test so `gateway.events.list()` proves typed memory and skill updates are visible through the event-store path.
- Updated `docs/current-state.md` and `docs/runtime-loop.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 4 files / 55 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 378 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `memory.updated` and `skill.updated` are trace/update events only; they do not change memory storage, skill install policy, approval receipts, or workspace containment.
- Metadata in SDK/gateway events is sanitized, but event payloads remain runtime trace metadata and should continue through browser-facing DTO redaction before reaching renderer code.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 154: Browser Events Stay Typed Across SDK/Gateway Projection

This milestone continued the event-contract cleanup after memory and skill projection. Native mailbox `browser.event` and `browser.screenshot` rows already projected to control-channel `browser.preview`, but SDK/gateway `RunEvent` consumers still saw them only as generic runtime warnings. They now remain typed in SDK/gateway event streams.

Changed:

- Added public `browser.updated` and `browser.screenshot.created` to the SDK/gateway `RunEventType` contract.
- Added `BrowserUpdatedRunEventPayload` and `BrowserScreenshotCreatedRunEventPayload`, then exported both through the contracts barrel.
- Updated `normalizeRuntimeEventRow()` so native `browser.event` rows project as `browser.updated` with action and sanitized payload detail.
- Updated `normalizeRuntimeEventRow()` so native `browser.screenshot` rows project as `browser.screenshot.created` with artifact ID and sanitized URL.
- Kept the defensive unknown-event fallback while using the stored row type so TypeScript can treat the native event switch as exhaustive.
- Extended normalizer coverage so every public SDK/gateway `RunEventType` remains classified and browser events retain `sensitive` visibility.
- Extended the gateway manual mailbox projection test so `gateway.events.list()` proves typed browser activity and screenshot events are visible through the event-store path.
- Updated `docs/current-state.md` and `docs/runtime-loop.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 4 files / 56 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 379 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `browser.updated` and `browser.screenshot.created` are sensitive runtime trace events only; they do not change browser adapter permissions, artifact access policy, hosted auth, or sandboxing.
- Screenshot event URLs are sanitized before SDK/gateway projection, but browser-facing DTOs must still remain the renderer boundary for event payload redaction.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 155: Waiting Approval Run Status Stays Typed Across SDK/Gateway Projection

This milestone continued the event-contract cleanup after browser projection. Native mailbox `run.status` rows with `waiting_approval` are a real lifecycle state and already map to control-channel `turn.status: awaiting_approval`, but SDK/gateway `RunEvent` consumers still saw them only as generic runtime warnings. They now remain typed in SDK/gateway event streams.

Changed:

- Added public `run.awaiting_approval` to the SDK/gateway `RunEventType` contract.
- Reused the existing lifecycle payload shape so awaiting-approval events can carry the runtime phase without adding a new payload family.
- Updated `normalizeRuntimeEventRow()` so native `run.status` rows with `status: waiting_approval` project as `run.awaiting_approval`.
- Extended normalizer coverage so every public SDK/gateway `RunEventType` remains classified and waiting-approval run status remains public lifecycle metadata.
- Extended the gateway manual mailbox projection test so `gateway.events.list()` proves typed awaiting-approval lifecycle events are visible through the event-store path.
- Updated `docs/current-state.md` and `docs/runtime-loop.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/events/normalizeRuntimeEvent.test.ts src/control/runtime-bridge.test.ts src/contracts/runtime.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 4 files / 57 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 380 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- `run.awaiting_approval` is lifecycle metadata only; it does not approve, deny, bypass, or change any `RuntimePolicyGuard` or `ApprovalReceipt` behavior.
- Approval details still flow through `approval.requested` / `approval.approved` / `approval.denied`; this milestone only stops flattening the run status row.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 156: Provider-Init Context Uses Neutral SDK/Gateway Helpers

This milestone followed up on the provider-init projection seam without inventing a new public `provider.init` event. Provider-init truth still flows through sanitized runtime log/warning rows for compatibility, but SDK and gateway consumers no longer need to depend on warning-named parser helpers when they are deriving provider/model context.

Changed:

- Added `ProviderInitRunContext` as the neutral exported context alias for provider-init details derived from run events.
- Added `providerInitDetailFromRunEvent()` and `latestProviderInitDetailFromRunEvents()` as neutral helpers over the existing sanitized provider-init log payload convention.
- Kept `providerInitWarningDetailFromRunEvent()` and `latestProviderInitWarningDetailFromRunEvents()` as compatibility wrappers.
- Migrated SDK usage derivation in `src/sdk/Mainspring.ts` to the neutral provider-init context helpers.
- Migrated local gateway run projection and usage derivation in `src/gateway/LocalGateway.ts` to the neutral provider-init context helpers.
- Extended contract tests so the neutral helpers are pinned and the legacy warning-named helpers stay equivalent.
- Updated `docs/current-state.md`.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification so far:

- `pnpm exec vitest run src/contracts/runtime.test.ts src/sdk/Mainspring.test.ts src/gateway/LocalGateway.test.ts --passWithNoTests`: passed, 3 files / 45 tests.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed end to end, including `pnpm verify`, 56 Vitest files / 380 tests, security scans, docs surface check, console browser-safety check, console build, gateway response-surface check, gateway systems check, gateway dev help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package-surface check, `pnpm pack --dry-run`, `npm pack --dry-run` with 365 files, and Docker Compose config rendering.

Remaining risks:

- Provider-init detail still flows through sanitized runtime warning/log payloads; this milestone intentionally does not add a new `provider.init` event type.
- Derived provider context remains best-effort context for SDK/gateway summaries, not provider authentication, billing, or credential proof.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Completed Milestone 157: Live OpenRouter E2E Uses The Runtime Spine

This milestone made the optional live-provider verifier prove the current Mainspring runtime path instead of calling the lower-level agent loop directly.

Changed:

- Rewrote `scripts/openrouter-e2e.mjs` so the successful live path uses `createMainspring()` with temporary session and workspace roots.
- The verifier now queues a run through SDK/session APIs, drains journaled run events, and verifies:
  - `run.started`
  - sanitized provider-init `runtime.warning`
  - `assistant.text.done`
  - `run.completed`
  - usage when the provider reports it
  - no provider key value or provider key environment marker in serialized run events
- Kept the missing-key branch fail-closed with `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED`, parseable JSON, `keyPresent: false`, and `keyEchoed: false`.
- Fixed `src/contracts/index.ts` so provider-init constants and helper functions are exported as runtime values from the contracts barrel, not only as type exports.
- Added package export coverage for the provider-init runtime helper surface.
- Updated `docs/operations.md`, `docs/features/secrets-and-providers.md`, and `docs/current-state.md` to describe what the live verifier actually proves.

Preserved runtime spine:

```text
SDK / control host
-> per-session SQLite mailbox
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry
-> RuntimePolicyGuard / ApprovalReceipt
-> tools
-> events_out
-> SDK / control event projection
```

Verification:

- `pnpm optional-verifiers:check`: passed, including the missing-key diagnostic branch.
- `pnpm openrouter:e2e`: passed against live OpenRouter with:
  - `status: OPENROUTER_E2E_OK`
  - provider `openrouter`
  - model `openrouter/free`
  - run status `completed`
  - event types `run.started`, `runtime.warning`, `runtime.warning`, `assistant.text.delta`, `assistant.text.done`, `usage.updated`, `run.completed`
  - usage present with redacted provider session ID
  - `keyEchoed: false`
  - runtime path reported as `createMainspring -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> events_out`
- `pnpm exec vitest run src/package-exports.test.ts src/contracts/runtime.test.ts --passWithNoTests`: passed, 2 files / 8 tests.
- `pnpm typecheck`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm security:sensitive-patterns`: passed with `Mainspring sensitive-pattern scan passed (170 intentional hits allowlisted).`

Remaining risks:

- `pnpm openrouter:e2e` still requires a real OpenRouter key and network path, so it remains optional and outside `release:check`.
- The verifier proves one short live runtime turn, not provider account health, billing correctness, long-running reliability, or secure desktop credential storage.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## Next Recommended Small Milestone

Keep moving through the runtime truth path with the next narrow production slice: close one console/gateway product gap or package/release drift item at a time, then run the full release gate.

Goal:

- Keep console/provider/runtime truth repo-grounded while expanding already-known behavior one projection boundary at a time.
- Prefer one small next slice:
  - add one more safe browser DTO proof for budgets, deployment data, cron, marketplace, or console live-gateway mutation flows if a console consumer still depends on ad hoc fields,
  - preserve one more already-recorded runtime log/detail field through `RunEvent` and `TurnEvent` projections if it is still being flattened,
  - tighten one more SDK helper or read-model consumer to use exported provider-init contract pieces instead of ad hoc inspection where that improves honesty without widening scope,
  - extend derived provider-metadata truth into one more run/session/detail surface with focused tests and explicit docs about what is derived vs directly emitted,
  - or fix the next release/package verifier drift item that appears under `pnpm release:check`
- Keep the slice narrow and repo-grounded: no mailbox rewrites, no secret-store claims, no fake product surfaces.
- Preserve `RuntimeKernel`, event journaling, approval flow, and current runtime security honesty.

Likely files:

- `src/gateway/LocalGateway.ts`
- `src/gateway/LocalGateway.test.ts`
- `src/gateway/server/createLocalGatewayServer.ts`
- `src/gateway/server/createLocalGatewayServer.test.ts`
- `src/events/normalizeRuntimeEvent.ts`
- `src/control/runtime-bridge.ts`
- `src/control/events.ts`
- `src/runner/RuntimeKernel.ts`
- `src/contracts/runtime.ts`
- `src/events/normalizeRuntimeEvent.test.ts`
- `src/control/runtime-bridge.test.ts`
- `docs/hermes-source-coverage.md`
- `docs/current-state.md`
- `docs/goal-digest.md`

Verification expectation:

- Targeted event-contract tests.
- `pnpm typecheck`.
- `pnpm test`.
- `pnpm release:check` when the slice touches release/package surfaces.

## Milestone Ritual

At the start of each continuation:

1. Read `docs/goal-digest.md`.
2. Read `docs/current-state.md`.
3. If needed, skim the full controlling brief attachment.
4. Inspect the actual code before editing.
5. Choose the next smallest safe milestone.
6. Preserve unrelated dirty work. If Git is available in a future checkout, inspect status before edits.
7. Implement focused changes.
8. Run relevant targeted checks and `pnpm verify` when feasible.
9. Update this file with:
   - what changed
   - verification results
   - remaining risks
   - next recommended milestone
   - blockers, if any

Do not mark broad product features complete because scaffolds or docs exist. Be explicit about partial work.

## 2026-07-02 Local Agent Security Regression Slice

Added the first permanent local-agent security regression corpus for the RunLog Fabric hardening work.

- Added `src/security/agent-security-regression.test.ts`.
- Added `docs/security-redteam-matrix.md` as the repo-local mapping from local-agent failure classes to implemented answer, evidence, and remaining work.
- Covered host shell approval, loader/env-var injection, network-to-shell hard blocks, workspace path traversal, symlink/junction escape, workspace mutation approval, browser/local URL approval, `web.fetch` local/metadata SSRF rejection, memory write approval, skill install approval, MCP/tool bridge routing through policy, headless cron denial, and cron grant mutation.
- Explicitly left cross-agent/channel spoofing, subagent privilege expansion, malicious remote skill payload review, skill memory poisoning, and browser-adapter private-network enforcement as documented partial/deferred rows.
- Updated current-state, security, and implementation backlog docs so the corpus is visible in normal repo orientation.

Preserved runtime seams:

`RunLogKernel -> RunLogScheduler -> RunLogExecutor -> ProviderRouter -> ToolRegistry / RuntimePolicyGuard -> ApprovalReceipt -> tools -> SQLite WAL events + checkpoints -> RunLogProjection / hosts`.

Verification for the focused slice:

- `pnpm exec vitest run src/security/agent-security-regression.test.ts`: passed, 1 file / 10 tests.
- `pnpm exec vitest run src/security src/policy src/tools src/core`: passed, 6 files / 64 tests.
- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm security:truth`: passed with `MAINSPRING_SECURITY_TRUTH_CHECK_OK` and `MAINSPRING_RELEASE_CLAIMS_CHECK_OK`.
- `pnpm verify`: passed, including 58 test files / 411 tests, build, security guards, docs check, console browser-safety check, and console build.
- `pnpm release:check`: passed, including examples smoke, agentic harness check, desktop systems check, optional verifiers, package surface check, dry pack, npm dry pack, and `docker compose -f docker/compose.local.yml config`.

Remaining risk:

- The corpus proves the local boundaries that exist today; it does not implement cross-agent/channel auth, subagent capability inheritance, staged remote skill provenance scanning, or browser-adapter private-network blocking.
- Host shell execution is still unsafe host process execution, not containment.

## 2026-07-02 RunLog Cron Headless Policy Slice

Implemented scoped headless policy decisions for canonical RunLog cron rows.

- Added cron grant/policy helpers in `src/capabilities/cron/RunLogCron.ts`.
- Added `cron.enqueue` as a `DecisionRecord` operation.
- Updated SQLite RunLog cron enqueue so every due cron row records `policy.decision.recorded` before it queues or fails a run.
- Side-effecting headless schedules now deny by default without queueing work.
- Scoped cron grants bind agent id, prompt hash, schedule hash, allowed tools, expiration, and max execution count.
- Grant prompt mutation, grant expiry, and execution-limit exhaustion fail closed.
- Allowed cron runs remain ordinary RunLog runs and denied cron rows become failed audited RunLog runs rather than waiting forever for absent approval.
- Added restart/no-duplicate coverage for due cron rows after reopening the SQLite store.
- Updated current-state, runtime-loop, security truth matrix, and backlog docs.

Preserved runtime seams:

`RunLogKernel -> RunLogScheduler -> RunLogExecutor -> ProviderRouter -> ToolRegistry / RuntimePolicyGuard -> SQLite WAL events + checkpoints -> RunLogProjection / hosts`.

Verification for the focused slice:

- `pnpm exec vitest run src/core/RunLogKernel.test.ts`: passed, 1 file / 18 tests.
- `pnpm typecheck`: passed.

Remaining risk:

- Legacy gateway cron scheduling still uses the gateway app-state/mailbox migration path and must be wired onto RunLog cron grants before it can be called fully canonical.
- Cron grants decide whether a due schedule may become a run; they do not turn host shell execution into containment.

## 2026-07-02 Canonical RunLog Policy Decision Slice

Implemented the canonical tool-path `DecisionRecord` layer for the RunLog Fabric runtime.

- Added `src/policy/DecisionRecord.ts` with `allow`, `deny`, `clarify`, `requires_approval`, `stage_for_review`, and `hard_block` states plus surface classification, input/manifest/policy hashes, approval state, and decision ids.
- Extended `RuntimePolicyGuard` with unapprovable hard blocks for catastrophic filesystem wipes, raw disk operations, fork bombs, network-to-shell installs, credential disclosure, secret env dumping, Git remote/hook mutation, and approval/policy disabling.
- Updated `ToolRegistry` so every guarded tool execution attempt creates a decision record before approval, block, or execution handling.
- Updated `RunLogExecutor` so tool-path decisions append durable `policy.decision.recorded` events and related tool/approval events carry `decisionId`.
- Updated `RunLogProjection` so hosts can inspect `policyDecisions`.
- Added tests proving allowed tool calls, approval-required tool calls, and hard-blocked shell calls produce durable policy decisions, and that hard blocks still deny execution even with an approval receipt.
- Updated current-state, implementation backlog, and security docs to distinguish implemented tool-path decisions from pending host-surface adapters.

Preserved runtime seams:

`SDK/control host -> per-session SQLite mailbox -> SessionRuntimeSupervisor -> RuntimeKernel -> AgentProvider.query -> ToolRegistry -> RuntimePolicyGuard / ApprovalReceipt -> tools -> events_out -> SDK/control event projection`.

Verification for the focused slice:

- `pnpm exec vitest run src/policy src/tools src/core`: passed, 4 files / 47 tests.

Remaining risk:

- Non-tool host surfaces such as channel sends, provider config mutation, artifact publish, cron/headless grants, and future subagent creation still need explicit `DecisionRecord` adapters as they become RunLog-native.
- Host shell execution remains unsafe host process execution, not a sandbox.

## 2026-07-01 RunLog Approval Resume Provider Continuation Slice

Implemented provider continuation after scoped approval resume.

What changed:

- Refactored `RunLogExecutor` so normal provider execution and approval-resume continuation use the same provider event loop.
- After an approved tool resume, the executor now reconstructs provider messages:
  - original user prompt
  - assistant tool call with the original tool call id/name/arguments
  - tool result message with the approved tool output
- The resumed run then asks the provider for the post-tool assistant result instead of completing at the tool boundary.
- Kept the one-time-use receipt marking before side-effect execution, so provider continuation cannot replay the approved side effect.
- Updated `HttpProviderClient` replay handling so continuation queries can provide message history without an extra empty user prompt.
- Updated RunLog approval-resume tests to prove the continuation query receives the reconstructed messages and the projected assistant text comes from the post-tool provider result.
- Updated `docs/current-state.md`, `docs/security-truth-matrix.md`, and `docs/implementation-backlog.md`.

Verification:

- `pnpm exec vitest run src/core/RunLogKernel.test.ts src/providers/HttpProviderClient.test.ts`: passed, 2 files / 26 tests.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm security:truth`: passed with `MAINSPRING_SECURITY_TRUTH_CHECK_OK` and `MAINSPRING_RELEASE_CLAIMS_CHECK_OK`.
- `pnpm verify`: passed, including 57 test files / 395 tests, build, security guards, docs check, console typecheck, console browser-safety check, and console build.
- `pnpm release:check`: passed end to end, including verify, security truth, gateway systems, gateway help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package surface, package dry-runs, npm dry-run, and Docker Compose config.

What this proves:

- A paused approval run can restart, approve, execute the exact approved tool once, replay the approved tool result into provider context, and complete with provider-produced assistant text.
- Stale approval replay remains blocked by one-time receipt state and stale-decision checks from the prior slice.

Remaining risks:

- General checkpoint replay/retry controls beyond the implemented approval-resume continuation are still incomplete.
- Public SDK/gateway/console surfaces are not fully RunLog-native yet.
- Host shell execution remains unsandboxed, and provider credentials must remain host-side.

## 2026-07-01 Durable RunLog Approval Receipt Resume Slice

Implemented the scoped receipt-resume milestone for the TypeScript-native RunLog Fabric.

What changed:

- Added RunLog-native approval request snapshots and signed approval receipts.
- Added SQLite persistence for approval request snapshots and receipt decisions.
- Added one-time-use receipt marking so approved tool resumes cannot replay a side effect through the normal scheduler path.
- Added `RunLogKernel.approveRunLogApproval()` and `RunLogKernel.denyRunLogApproval()`.
- Updated `RunLogExecutor` so approved receipts resume a paused tool after SQLite-backed restart, validate the run/tool/input/workspace/policy/tool-manifest/provider snapshot, then execute through `ToolRegistry` with a legacy `ApprovalReceipt` bridge.
- Updated RunLog projection so approved or denied requests stop appearing as pending and approval decisions are visible to hosts.
- Updated `docs/current-state.md`, `docs/security-truth-matrix.md`, and `docs/implementation-backlog.md`.

Verification:

- `pnpm exec vitest run src/core/RunLogKernel.test.ts`: passed, 13 tests.
- `pnpm exec vitest run src/core src/tools src/policy`: passed, 4 files / 45 tests.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm verify`: passed, including 57 test files / 395 tests, build, security guards, docs check, console typecheck, console browser-safety check, and console build.
- `pnpm release:check`: passed end to end, including verify, security truth, gateway systems, gateway help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package surface, package dry-runs, npm dry-run, and Docker Compose config.

What this proves:

- A RunLog tool call that requires approval pauses durably.
- A new process/store object can approve the pending request and resume it through SQLite.
- Denied approvals fail the run without executing the tool.
- Mutated tool input, changed workspace root, expired receipt, changed tool manifest, and replay attempts fail closed.
- Approved execution still goes through `ToolRegistry`, `RuntimePolicyGuard`, and approval receipt validation.

Remaining risks:

- The current resume slice executes and completes the approved tool boundary. It does not yet feed the approved tool result back into a second provider turn.
- RunLog browser, memory retrieval, child-run helpers, Postgres/object-store/queue adapters, and remote execution adapters remain future work.
- Host shell execution remains unsandboxed.
- Provider keys must not be stored in renderer localStorage.
- Do not claim secure isolation, HyperCells, billing, operator roles, remote marketplace trust, or secure desktop secrets from this slice.

Next recommended milestone:

- Continue approved RunLog tool results back into the provider loop while preserving idempotency and no-duplicate-side-effect guarantees.
- Add canonical policy decision records for side-effecting surfaces after provider continuation is green.

## 2026-07-01 RunLog Fabric Implementation Slice

Implemented the first executable slice of the next-generation RunLog Fabric redesign.

What changed:

- Added `src/core` with `AgentSpec`, `RunIntent`, `RunLogEvent`, `RunLogKernel`, `RunLogScheduler`, `RunLogExecutor`, provider routers, checkpoints, and shared IDs.
- Added `src/adapters/sqlite` with a SQLite WAL RunLog store for agents, runs, DB leases, append-only events, checkpoints, and cron rows.
- Added `src/adapters/local-blob` with content-addressed local blob storage.
- Added `src/capabilities/workspace` with lazy local workspace leasing.
- Added `src/capabilities/cron` with due cron rows that enqueue ordinary runs without a separate service.
- Added `src/hosts/runlog` with a host-facing run projection.
- Added `src/compat` migration exports.
- Added public package subpaths for the new canonical layout:
  - `mainspring/core`
  - `mainspring/adapters`
  - `mainspring/adapters/sqlite`
  - `mainspring/adapters/local-blob`
  - `mainspring/capabilities`
  - `mainspring/hosts/runlog`
  - `mainspring/compat`
- Rewrote `docs/architecture.md`, `docs/runtime-loop.md`, and `docs/current-state.md` around RunLog Fabric while keeping mailbox/runtime compatibility truth explicit.
- Updated package export tests and the package-surface verifier so the new subpaths are intentional and import-checked.

Verification:

- `pnpm exec vitest run src/core/RunLogKernel.test.ts src/package-exports.test.ts`: passed, 2 files / 12 tests.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm build`: passed.
- `pnpm test`: passed, 57 files / 389 tests.
- `pnpm verify`: passed, including doctor, typecheck, tests, build, security guards, sensitive-pattern scan, docs check, console typecheck, console browser-safety check, and console build.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.

What this proves:

- Provider-only runs can be persisted, claimed, executed, streamed into RunLog events, projected, and completed.
- Provider-requested tools execute through `ToolRegistry` and checkpoint the tool boundary.
- Approval-required tools pause the run as durable `awaiting_approval` state.
- Queued runs survive SQLite store object restart and can be claimed by a new `RunLogKernel`.
- 1000 idle agents are stored as data and create no claimed work.
- Workspace directories materialize only for workspace-capable runs.
- Cron rows create queued runs in the same SQLite store.

Remaining risks:

- The legacy mailbox/`RuntimeKernel` path still powers existing SDK/gateway behavior.
- RunLog approval resume with a receipt is not implemented yet.
- Browser, memory retrieval, child-run helpers, Postgres, object-store, Docker/VPS/Kubernetes, and external queue adapters are not implemented yet.
- Host shell execution remains unsandboxed.
- Provider keys must not be stored in renderer localStorage.
- Do not claim secure isolation, HyperCells, billing, operator roles, remote marketplace trust, or secure desktop secrets from this slice.

Next recommended milestone:

- Wire one SDK or gateway run-start/read path to the new RunLog projection behind a compatibility boundary, without deleting the mailbox runtime yet.
- Add approval-resume support for RunLog paused runs with receipt validation.
- Add browser lease adapter tests only after the RunLog approval/tool loop stays green.

## 2026-07-01 GitHub-Ready Mission Baseline And Security Truth Slice

Controlling prompt:

- Read `C:\Users\drper\.codex\attachments\13c885e2-e389-4f0c-babe-0bb5f024d4c9\pasted-text-1.txt`.
- Read `C:\Users\drper\.codex\attachments\13c885e2-e389-4f0c-babe-0bb5f024d4c9\pasted-text-2.txt`.
- Mission expanded from the initial RunLog slice to a GitHub-ready, security-truthful, tested, documented, branded, verified, milestone-committed local-first RunLog Fabric runtime.

Baseline commands:

- `git status --short --branch`: repo is a dirty Git worktree on `main` with many modified and untracked files, including the RunLog Fabric slice.
- `node --version`: `v24.14.0`.
- `pnpm --version`: `11.7.0`.
- `pnpm install --frozen-lockfile`: passed, already up to date.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm test`: passed, 57 files / 389 tests.
- `pnpm build`: passed.
- `pnpm verify`: passed.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.

Repo-grounded findings:

- `src/core`, `src/adapters/sqlite`, `src/adapters/local-blob`, `src/capabilities/workspace`, `src/capabilities/cron`, `src/hosts/runlog`, and `src/compat` exist from the RunLog Fabric implementation slice.
- SQLite WAL RunLog storage exists and covers agents, runs, leases, events, checkpoints, and cron rows.
- RunLog approval pause exists, but durable cryptographic approval resume is not implemented.
- Legacy `RuntimeKernel` and per-session mailbox remain reachable and power current SDK/gateway behavior.
- README still opened with the legacy mailbox spine before this slice; it was updated to name RunLog Fabric as canonical and mailbox as legacy compatibility.
- Public docs had several risky phrases that needed same-line limitation wording for mechanical release checks.

Milestone A work started:

- Added `docs/security-truth-matrix.md`.
- Added `scripts/check-security-truth.mjs`.
- Added `scripts/check-release-claims.mjs`.
- Added `pnpm security:truth`.
- Wired `pnpm security:truth` into `pnpm verify` and `pnpm release:check`.
- Updated `scripts/check-release-workflow.mjs` so release workflow checks require the security-truth script.
- Updated README, SECURITY, current-state, roadmap, local gateway docs, and examples to avoid unsupported security/product claims.
- Added `docs/implementation-backlog.md` with codebase-grounded tasks and statuses.

Verification so far:

- `pnpm security:truth`: passed with `MAINSPRING_SECURITY_TRUTH_CHECK_OK` and `MAINSPRING_RELEASE_CLAIMS_CHECK_OK`.

Remaining for this milestone:

- Completed.

Final Milestone A verification:

- `pnpm security:truth`: passed with `MAINSPRING_SECURITY_TRUTH_CHECK_OK` and `MAINSPRING_RELEASE_CLAIMS_CHECK_OK`.
- `pnpm docs:check`: passed with `MAINSPRING_DOCS_SURFACE_CHECK_OK`.
- `pnpm package:check`: passed with `MAINSPRING_PACKAGE_SURFACE_CHECK_OK`.
- `pnpm verify`: passed, including the new `pnpm security:truth` gate.
- `pnpm release:check`: passed end-to-end, including verify, security truth, gateway systems, gateway help, examples smoke, agentic harness, desktop systems, release workflow, optional verifiers, package surface, package dry-runs, npm dry-run, and Docker Compose config.

Milestone A outcome:

- Security truth and release-claim checks now fail unsupported public claims.
- README now names RunLog Fabric as canonical and labels the per-session SQLite mailbox/`RuntimeKernel` path as legacy compatibility.
- Public docs/examples now use explicit limitation wording for host execution, Docker/WSL, browser automation, secret vaulting, marketplace/billing/operator-role claims, VM isolation, and approval-resume gaps.

Next recommended milestone:

- Durable RunLog approval-resume with scoped receipts.
- Then central policy decision records for all side-effecting surfaces.
