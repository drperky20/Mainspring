# Release Guide

Use this guide before tagging or publishing Mainspring.

## Preflight

```bash
pnpm install --frozen-lockfile
pnpm release:check
git status --short
```

`release:check` runs verification, gateway systems, examples, desktop systems, workflow parity, package surface checks, package dry-runs, npm dry-run, and Docker Compose config validation.
Desktop systems include a Windows-only packaging guard; Linux users run from source rather than a desktop installer lane.
The GitHub release-check workflow should run on pull requests, pushes to `main`, and manual dispatch.
GitHub workflows should use read-only contents permissions, frozen pnpm installs, explicit job timeouts, and concurrency cancellation for superseded runs.

## Documentation

Update docs when behavior changes:

- `README.md` for front-door truth.
- `docs/index.md` when adding or moving docs.
- Relevant `docs/features/*` page for feature behavior.
- `docs/security.md` and `SECURITY.md` for security truth changes.
- `docs/operations.md` for new scripts or release gates.
- `docs/current-state.md` for repo audit truth.
- repo-local `docs/goal-digest.md` for milestone history. This ledger is excluded from npm package artifacts.

## Package Checklist

- `package.json` version changed intentionally.
- `CHANGELOG.md` updated.
- `README.md` and docs match current behavior.
- Package metadata contains no placeholder repository, homepage, or bug-tracker URLs.
- Real package repository metadata is restored only when a real public repository URL is known.
- No fake claims about sandboxing, HyperCells, secure desktop secrets, payment billing, hosted deployment, or Linux desktop installers.
- No local artifacts are staged:
  - `.env.local`
  - `.mainspring`
  - `*.db`
  - `*.sqlite`
  - logs/cache/tmp folders
  - package tarballs
  - desktop release artifacts unless intentionally tracked

## Publish

Only publish from a clean tree after `pnpm release:check` passes.

```bash
git tag v0.x.y
pnpm publish --access public
```
