# Changelog

All notable changes to Mainspring will be documented in this file.

The format follows Keep a Changelog and the project uses Semantic Versioning once public release tags begin.

## [Unreleased]

### Added
- Runtime kernel, SQLite mailbox, SDK, provider registry, tool registry, policy guard, approval receipts, and event journal package surfaces.
- Prototype founder-cockpit console with explicit localStorage honesty and development gateway fixture previews.
- Launch-baseline branding assets, examples, and open-source documentation set.
- Conditional console snapshot delivery with a server-only sanitized revision cache, adaptive browser revalidation, and a cheap health probe.
- Configurable bounded RunLog worker concurrency with same-workspace process-local serialization and deterministic performance coverage.
- `ConsoleNavigation` and `useConsoleRunActivity` boundaries for the connected operator shell.
- Workspace-scoped, cursor-paginated memory history with browser-safe previews and no browser-supplied host paths.
- Durable operator memory correction and deletion with append-only JSONL replacement/tombstone records, opaque workspace-scoped gateway routes, provenance-aware corrections, audit evidence, and console confirmation dialogs.
- Durable, restart-safe canonical RunLog tool-call summaries with a dedicated cursor, bounded `GET /runlog/tool-calls` history route, opaque browser IDs, and an incremental Activity view.
- Bounded `GatewayDeploymentControl` ownership for deployment target configuration and driver execution.
- Bounded `GatewayProvenanceReviewControl` ownership for staged review decisions and durable memory/skill applies.
- Bounded `GatewayCronControl` ownership for cron schedule configuration and scoped grant issuance.
- Bounded `GatewayBudgetControl` ownership for budget configuration, warning acknowledgement, and hard-block authority.
- Bounded `GatewayProviderProfileControl` ownership for provider configuration and managed-secret authority.
- Bounded `GatewayTopologyControl` ownership for client/workspace/agent/session topology, with cross-client binding checks and pre-mutation authority records.

### Changed
- Verification lane standardized around `pnpm verify`.
- Public docs now separate implemented behavior, prototype-only surfaces, and roadmap claims more explicitly.
- Operator navigation now groups normal work into Home, Workspaces, Activity, and Settings; runs, canonical tool calls, approvals, usage, artifacts, audit, and memory are Activity views.

### Security
- Security language now consistently states that host shell execution is not a sandbox and browser-side provider auth remains prototype-only.
- Gateway error bodies now pass through the same path/credential sanitizer as successful browser responses.
- Memory correction/deletion routes accept only opaque browser IDs scoped to registered workspaces; raw JSONL IDs, workspace roots, source metadata, and full values remain host-side.
- Deployment target writes now persist hash-only authorization before app-state mutation, and exact-confirmed driver invocations retain bound target/plan decisions before external execution; hosted session identity replaces browser attribution and browser DTOs omit decision/configuration metadata.
- Provenance review decisions and applies now persist hash-only host decision evidence before queue or workspace mutation, recover a write interrupted before the review journal update, and use the hosted session actor instead of a browser-supplied reviewer.
- Gateway cron schedule create/update/delete and grant issuance now persist hash-only pre-mutation host decisions; hosted session identity overrides a browser-supplied grant actor.
- Gateway budget create/update/delete now persist hash-only `budget.write` authority before app-state mutation; warning acknowledgements and hard blocks record the matching pre-enqueue decision, with hosted identity supplied only by the authenticated gateway principal.
- Gateway provider-profile create/update now persist hash-only `provider_config.write` authority before app-state mutation; managed-secret values remain host-side, and hosted identity replaces browser-supplied attribution.
- Gateway client/workspace/agent/session topology mutations now persist hash-only `topology.write` authority before writes, reject cross-client workspace mutation, and use hosted session identity instead of browser attribution; workspace roots remain hash-only in audit evidence.
