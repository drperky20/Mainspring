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

### Changed
- Verification lane standardized around `pnpm verify`.
- Public docs now separate implemented behavior, prototype-only surfaces, and roadmap claims more explicitly.
- Operator navigation now groups normal work into Home, Workspaces, Activity, and Settings; runs, approvals, and usage are Activity views.

### Security
- Security language now consistently states that host shell execution is not a sandbox and browser-side provider auth remains prototype-only.
