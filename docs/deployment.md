# Deployment

## Source Run

```bash
pnpm install
pnpm verify
pnpm build
pnpm start
```

Linux users should use the source path. Linux desktop installer packaging is not currently supported.

## Docker

```bash
docker compose -f docker/compose.local.yml config
docker compose -f docker/compose.local.yml up --build
```

The image runs non-root, uses named volumes, does not publish a public port, and does not mount the Docker socket. The default compose file does not bind-mount host credential files; operators who need Codex CLI auth inside the gateway container should inject that auth intentionally through their own local override file.

## Desktop

Windows package:

```bash
pnpm desktop:pack
```

Cross-platform source/build checks:

```bash
pnpm desktop:packaging:check
pnpm desktop:systems:check
```

`desktop:packaging:check` keeps desktop installer packaging Windows-only. The desktop shell is not a privileged runtime gateway or secret vault.

## Deployment Drivers

The local gateway plans and executes deployment targets through `DeploymentDriverRegistry`.

Bundled drivers:

- `vps` target kind with `vps-ssh` execution mode: packages the repo, uploads over SSH/SCP, installs on the remote host, and restarts systemd after explicit confirmation.
- `local` target kind with `local-filesystem` execution mode: writes local release artifacts and a current-release marker under the configured deployment root.
- `container` target kind with `docker-container` execution mode: builds a Docker image and replaces a named local container through the local Docker Engine.
- `kubernetes` target kind with `kubectl-server-side-apply` execution mode: builds/pushes a release-specific image tag, validates an existing namespace/Secret/PVC and required Secret key names without reading values, applies a generated single-replica hardened gateway manifest, waits for rollout, supports Deployment-history rollback, and preserves data/secrets on guarded destroy.

Custom deployment kinds are safe strings and fail closed unless a driver is registered. Driver config validation, support metadata, plan, execute, rollback, and destroy all come from the registered driver.

Gateway deployment target creation and updates persist a host-side
`deployment.target.write` decision. Every deploy, rollback, or destroy action
requires its exact operation as confirmation, records a bound
`deployment.execute` decision before the driver is invoked, and preserves that
same decision and its resolved-target/preflight-plan hashes in the deployment-run metadata. Browser DTOs omit these internal
decision records and target configuration metadata.

The VPS driver does not copy provider secrets. Remote env files must be managed separately.

The Kubernetes driver is documented in [`deploy/kubernetes/README.md`](../deploy/kubernetes/README.md). Its passing generated-manifest and injected-runner checks do not certify any real cluster, storage class, ingress controller, registry, backup, or disaster-recovery system.

Check:

```bash
pnpm deploy:check
```
