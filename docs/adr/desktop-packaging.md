# ADR: Desktop Packaging

## Status

Accepted for the current experimental shell.

## Decision

Mainspring keeps an Electron shell under `apps/desktop` for loading the console.

The supported packaged desktop lane is Windows NSIS.

Linux users run from source. Linux desktop installer packaging is not currently supported.

## Security Position

The desktop shell:

- is not a runtime gateway
- is not a secret vault
- exposes no raw shell bridge
- exposes no raw filesystem bridge
- keeps Electron isolation settings enabled

## Verification

```bash
pnpm desktop:typecheck
pnpm desktop:build
pnpm desktop:packaging:check
pnpm desktop:systems:check
```
