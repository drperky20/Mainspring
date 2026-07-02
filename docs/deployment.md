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

The image runs non-root, uses named volumes, does not publish a public port, and does not mount the Docker socket.

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

## VPS Lane

The local gateway can plan and execute guarded VPS deployment commands after explicit operator confirmation.

It does not copy provider secrets. Remote env files must be managed separately.

Check:

```bash
pnpm deploy:check
```
