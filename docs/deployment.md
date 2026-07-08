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

Custom deployment kinds are safe strings and fail closed unless a driver is registered. Driver config validation, support metadata, plan, execute, rollback, and destroy all come from the registered driver.

The VPS driver does not copy provider secrets. Remote env files must be managed separately.

Check:

```bash
pnpm deploy:check
```
