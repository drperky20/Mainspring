# Release Guide

Mainspring uses `pnpm verify` as the canonical confidence gate before any release tag or package publish.

## Preflight

1. Update `CHANGELOG.md`.
2. Confirm no secrets or local-only files are staged:
   - `.env.local`
   - provider keys
   - local screenshots or logs
3. Run:

```bash
pnpm install --offline
pnpm verify
```

4. If runtime or docs behavior changed materially, update:
   - `README.md`
   - `docs/current-state.md`
   - `docs/security.md`
   - `docs/goal-digest.md`

## Package Checklist

- `package.json` version updated intentionally
- `README.md` matches current product truth
- `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md` present
- `assets/brand/` and `examples/` included in the published package metadata
- No fake claims about sandboxing, HyperCells, secure desktop secrets, billing, or hosted deployment

## Suggested Release Flow

```bash
pnpm verify
git status --short
git tag v0.x.y
pnpm publish --access public
```

Only publish from a clean tree that has already passed verification.
