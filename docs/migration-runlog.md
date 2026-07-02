# RunLog Migration And Legacy Retirement Map

Last updated: 2026-07-02.

RunLog Fabric is the canonical runtime target. A RunLog-backed SDK host now exists for
new embedded usage. The legacy mailbox and `RuntimeKernel` path still exists for the
older `createMainspring` SDK/gateway compatibility surface and live examples. This map
records what can move, what must stay temporarily, and what tests protect each decision.

## Current Execution Split

Canonical RunLog path:

```text
RunLogKernel
-> RunLogScheduler
-> RunLogExecutor
-> ProviderRouter
-> ToolRegistry / RuntimePolicyGuard
-> SQLite WAL events + checkpoints
-> RunLogProjection / hosts
```

Current SDK/gateway compatibility path:

```text
createMainspring
-> SqliteMainspringStorage
-> per-session MainspringMailbox
-> RuntimeEngine
-> SessionRuntimeSupervisor
-> RuntimeKernel
-> AgentProvider.query
-> ToolRegistry / RuntimePolicyGuard
-> mailbox events/outbound rows
-> SDK/gateway projections
```

The compatibility path is not a second product architecture. It is the migration bridge that keeps existing SDK, gateway, examples, and OpenRouter E2E behavior working while public surfaces move to `RunIntent`, RunLog events, and `RunLogProjection`.

## Retirement Table

| Legacy module | Current callers | RunLog-native replacement | Compatibility status | Tests protecting behavior | Removal/deprecation decision |
| --- | --- | --- | --- | --- | --- |
| `src/runtime/RuntimeEngine.ts` | `src/sdk/Mainspring.ts` constructs it for `createMainspring().start()` | `src/core/RunLogKernel.ts` plus a RunLog-backed SDK host | Compatibility runtime loop | `src/index.test.ts`, `src/gateway/LocalGateway.test.ts`, `scripts/openrouter-e2e.mjs` | Keep until SDK/API run creation uses `RunIntent` and public approval handling is RunLog-backed. |
| `src/runner/SessionRuntimeSupervisor.ts` | `RuntimeEngine` polls session mailboxes | `src/core/RunLogScheduler.ts` claim/drain loop | Compatibility poller | `src/runner/SessionRuntimeSupervisor.test.ts` | Keep while existing per-session mailboxes are public SDK/gateway storage. |
| `src/runner/RuntimeKernel.ts` | `SessionRuntimeSupervisor` creates one per mailbox | `src/core/RunLogExecutor.ts` | Compatibility executor | `src/runner/RuntimeKernel.test.ts`, `src/tools/ToolRegistry.test.ts` | Keep behind compatibility path; do not add new product features here unless preserving existing behavior. |
| `src/mailbox/SqliteMailbox.ts` | `SqliteMainspringStorage`, `LocalGateway`, runtime tests | `src/adapters/sqlite/SqliteRunLogStore.ts` | Compatibility event journal and inbound queue | `src/mailbox`, `src/gateway/LocalGateway.test.ts`, `scripts/openrouter-e2e.mjs` | Keep until SDK/gateway storage writes RunLog rows directly. |
| `src/storage/sqlite/SqliteMainspringStorage.ts` | `createMainspring` state, command, event, artifact stores | `SqliteRunLogStore` plus host read models | Compatibility SDK storage | `src/gateway/AppStateStore.test.ts`, `src/gateway/LocalGateway.test.ts` | Split state/app data from run execution before removal. |
| `src/events/normalizeRuntimeEvent.ts` | SDK/gateway projections for mailbox rows | `src/hosts/runlog/RunLogProjection.ts` | Compatibility projection | `src/events/normalizeRuntimeEvent.test.ts`, `src/hosts/runlog` tests | Keep only for mailbox row projection; new hosts should consume `RunLogProjection`. |
| `src/contracts/runtime.ts` run DTOs | SDK, gateway, console client types | `src/core/types.ts` `RunIntent` / `RunLogEvent` and host DTOs | Public compatibility DTOs | `src/package-exports.test.ts`, SDK/gateway tests | Keep DTO shape until public API migration has compatibility tests. |
| `src/sdk/Mainspring.ts` session/run creation | Compatibility examples, OpenRouter E2E, legacy gateway compatibility | `src/sdk/RunLogMainspring.ts` creates `RunIntent` and projects `RunLogProjection` | Public compatibility host plus RunLog-native SDK host. README, `examples/provider-run`, and `examples/tool-approval` now use the RunLog SDK host. The local gateway dev server also creates a RunLog host. | `src/index.test.ts`, `src/sdk/RunLogMainspring.test.ts`, `scripts/check-agentic-harness.mjs`, examples smoke | Keep `createMainspring` until compatibility examples and live-provider E2E move; use `createRunLogMainspring` for new SDK work. |
| `src/gateway/LocalGateway.ts` session/run APIs | HTTP server, console, gateway tests | RunLog intake plus `RunLogProjection` read model | Mixed gateway/app-state surface: local dev and configured gateways use RunLog for default HTTP run start, RunLog-configured gateway cron dispatch, HTTP/client cron grant preview/create, and console cron grant controls. Gateways without RunLog remain mailbox-compatible. Provider-profile credential refs now resolve host-side for RunLog starts. | `src/gateway/LocalGateway.test.ts`, `src/gateway/server/createLocalGatewayServer.test.ts`, `src/gateway/ConsoleSnapshotAdapter.test.ts`, `apps/console/src/localGatewayClient.test.ts`, `apps/console/src/App.test.tsx`, `pnpm gateway:dev:help` | Keep mailbox compatibility until public SDK/runtime migration is complete. |
| `apps/console/src/App.tsx` gateway state | Browser operator UI | Gateway DTOs projected from RunLog host state | Browser client surface now reads optional sanitized RunLog projection through gateway DTOs and selected-client RunLog detail panels | `apps/console/src`, console browser-safety check | Keep browser DTO boundary; do not expose raw RunLog/private fields. |
| `src/compat/runlog.ts` | Temporary RunLog migration subpath | Direct `mainspring/core`, `mainspring/adapters/sqlite`, `mainspring/hosts/runlog` imports | Temporary compatibility exports | `src/package-exports.test.ts`, `scripts/check-package-surface.mjs` | Remove after consumers use canonical subpaths. |
| `docs/operations.md` OpenRouter E2E runtime lane | Maintainer live-provider verification | Future RunLog live-provider E2E | Honest legacy E2E documentation | `scripts/openrouter-e2e.mjs` | Keep as legacy evidence until equivalent RunLog live-provider E2E exists. |

## Migration Rules

- New runtime execution features should target `src/core`, `src/adapters/sqlite`, `src/capabilities`, and `src/hosts/runlog`.
- Legacy mailbox changes are allowed only to preserve existing SDK/gateway behavior or bridge it to RunLog.
- Public browser DTOs must remain sanitized projections and must not expose mailbox paths, provider secrets, private receipt snapshots, or raw workspace roots.
- A compatibility export is temporary unless a package-surface test proves that removing it would be a breaking change.
- Any removal must first prove equivalent behavior through RunLog-backed tests.

## Next Canonicalization Slices

1. Move the remaining compatibility examples that do not need mailbox-only behavior to `createRunLogMainspring`.
2. Move `openrouter:e2e` to a RunLog-native live-provider path once live-provider projection coverage is equivalent.
3. Add taint labels beyond scan findings for web/email/file-derived memory and skill mutations.
4. Add checkpoint replay/retry controls only after RunLog replay semantics are code-backed.
5. Retire mailbox event projection once SDK/gateway/console no longer need it.
