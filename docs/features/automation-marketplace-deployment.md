# Automation, Marketplace, And Deployment

## What It Does

Mainspring has three local gateway feature lanes:

- cron schedules stored in app-state SQLite; RunLog-configured gateways dispatch due runs through RunLog cron policy, while gateways without RunLog keep the mailbox compatibility path
- a trusted local template catalog seeded from `examples/templates.json`
- optional remote template catalogs signed with pinned Ed25519 publisher keys
- guarded local, container, `vps`, and Kubernetes deployment targets with plan, execute, rollback, and destroy flows

Marketplace installs can create client/workspace/agent records and copy approved markdown/JSON seed files. Configured remote catalogs are fetched only over public HTTPS with redirect target revalidation, bounded to 1 MiB, checked against publisher/key pins and validity windows, and cached only after every embedded file hash, signature, and deterministic provenance scan passes. Entries that need review fail closed instead of becoming installable. `POST /marketplace/remotes/sync` refreshes the in-memory trusted catalog; existing installs use the verified cached payload and preserve publisher provenance.

Remote sources are opt-in host configuration under `createLocalMainspringGateway({ marketplace: { remote: { sources: [...] } } })`. Each source requires `catalogUrl`, `publisherId`, `keyId`, and `publicKeyPem`. The verified cache is intentionally process-local, so a restart requires another explicit sync and never silently trusts stale persisted catalog content.

Deployment plans can run `npm pack` and prepare `ssh` / `scp` command previews for explicit execution.

The Kubernetes driver builds and pushes a release-specific gateway image tag, validates an existing namespace/Secret/PVC, generates a single-replica hardened Deployment/Service/NetworkPolicy/optional Ingress manifest, applies it server-side with `kubectl`, and waits for rollout. It never creates Secret or PVC data and guarded destroy preserves both.

## What It Does Not Do

- It does not run arbitrary marketplace scripts.
- It does not install executable remote marketplace code; signed remote templates remain markdown/JSON data only.
- It does not provide paid marketplace distribution.
- It does not provide hosted publisher reputation, key revocation, discovery, payments, or account identity.
- Cron schedule creation/run-now and provenance review controls are available through the local gateway API/client and React console.
- It does not make unsupported deployment target kinds executable; unsupported target kinds fail closed.
- It does not bypass the runtime policy, mailbox, approval, and tool execution path.

## How To Verify

```bash
pnpm cron:check
pnpm marketplace:check
pnpm deploy:check
```
