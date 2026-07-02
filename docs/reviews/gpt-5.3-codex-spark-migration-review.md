# gpt-5.3-codex-spark Migration Review

Last updated: 2026-07-02.

Reviewer: `gpt-5.3-codex-spark` via Codex subagent `019f217d-8832-7d10-8b68-7c63866d9c74`.

## Scope Inspected

- `docs/migration-runlog.md`
- `scripts/check-runlog-migration.mjs`
- `src/index.ts`
- `src/compat/runlog.ts`
- `src/core/index.ts`
- `src/sdk/RunLogMainspring.ts`
- `src/sdk/Mainspring.ts`
- `src/storage/sqlite/SqliteMainspringStorage.ts`
- `src/runner/main.ts`
- `src/gateway/LocalGateway.ts`
- `src/gateway/server/createLocalGatewayServer.ts`
- `src/hosts/runlog/RunLogProjection.ts`
- `src/events/normalizeRuntimeEvent.ts`
- `package.json`
- `scripts/check-package-surface.mjs`
- `docs/implementation-backlog.md`

## Mailbox / RuntimeKernel Retirement Risks

- `RuntimeKernel` remains release-critical through `src/runner/main.ts`, `src/sdk/Mainspring.ts`, and legacy gateway/storage paths.
- `SqliteMainspringStorage` still normalizes and exposes mailbox-backed events.
- Gateway behavior remains intentionally dual-runtime: RunLog when a `RunLogMainspring` host is configured, mailbox compatibility otherwise.
- `MAINSPRING_RUNTIME_IDENTITY` still advertises mailbox compatibility transport.
- Removing `RuntimeKernel`, `SessionRuntimeSupervisor`, `RuntimeEngine`, `MainspringMailbox`, or `SqliteMainspringStorage` now would break supported compatibility surfaces.

Accepted action:

- Keep legacy runtime components as compatibility-only until SDK/gateway compatibility has RunLog-backed replacement coverage.

Rejected action:

- Do not delete legacy runtime modules in the current release-polish slice.

## Duplicate Projections / Compat Exports

- Mailbox projection remains in `src/events/normalizeRuntimeEvent.ts`.
- RunLog projection remains in `src/hosts/runlog/RunLogProjection.ts`.
- Gateway DTOs currently combine both models.
- `src/compat/runlog.ts` and the package `./compat` export are intentionally present.

Accepted action:

- Treat projection duplication as a migration fact, not an immediate bug.
- Keep `./hosts/runlog` as the canonical path for new code.

Rejected action:

- Do not remove `./compat` until package-surface and consumer compatibility evidence says it is safe.

## Test Gaps

- `scripts/check-runlog-migration.mjs` proves migration-map presence and file existence, not behavioral parity for every future retirement step.
- There is no test proving the compat export can be removed safely.
- There is no enforced deletion order for legacy runtime components.

Accepted action:

- Add a future backlog item or migration-check expansion before removing compat exports or legacy runtime entrypoints.

## Low-Risk Refactors

- Add clearer deprecation comments on `createMainspring` and legacy runtime exports.
- Centralize gateway RunLog-vs-mailbox branch selection behind one small utility.
- Consider shared browser-safe DTO filtering helpers to reduce projection drift.

## Safe Removals / Merges

Not safe now:

- `RuntimeKernel`
- `SessionRuntimeSupervisor`
- `RuntimeEngine`
- `MainspringMailbox`
- `SqliteMainspringStorage`
- mailbox event normalization

Potentially safe later:

- `src/compat/runlog.ts` and package `./compat` after internal and external consumers have canonical imports.

## Release-Blocking Imports

- `src/runner/main.ts` imports the legacy runtime chain.
- `src/sdk/Mainspring.ts` imports `RuntimeEngine` and legacy types.
- `src/storage/sqlite/SqliteMainspringStorage.ts` imports mailbox schema/event normalization.
- `src/index.ts` publicly re-exports legacy runtime and mailbox types.
- `src/gateway/LocalGateway.ts` and server setup use both mailbox and RunLog projections.

## Outcome

The current migration state is acceptable for a security-truthful release only if docs keep calling legacy mailbox/`RuntimeKernel` compatibility-only. The next safe code slice is not deletion; it is either a deprecation/branch-centralization slice or one host-surface RunLog migration with tests.
