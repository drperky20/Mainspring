# Mainspring Goal Digest

Last updated: 2026-06-27.

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

## Next Recommended Small Milestone

Keep moving through the provider/runtime truth path with the next narrow slice: either extend the same additive provider-session/model truth into one more local helper surface, or switch to a different repo-grounded seam where already-recorded runtime truth is still being flattened away.

Goal:

- Keep console/provider/runtime truth repo-grounded while expanding already-known behavior one projection boundary at a time.
- Prefer one small next slice:
  - preserve one more already-recorded runtime log/detail field through `RunEvent` and `TurnEvent` projections if it is still being flattened,
  - tighten one more SDK helper or read-model consumer to use the exported provider-init contract pieces instead of ad hoc inspection where that improves honesty without widening scope,
  - or, if repo-grounded and additive, extend the same derived provider-metadata truth into one more run/session/detail surface with focused tests and explicit docs about what is derived vs directly emitted,
  - thread one more truthful runtime/provider hint into a read-only gateway or console projection without claiming live auth/health,
  - or switch to a nearby trace/detail read-model seam where provider/runtime context still falls back to placeholders
- Keep the slice narrow and repo-grounded: no mailbox rewrites, no secret-store claims, no fake product surfaces.
- Preserve `RuntimeKernel`, event journaling, approval flow, and current runtime security honesty.

Likely files:

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
