# Desktop Assets

This folder contains desktop packaging resources for the experimental Electron shell.

Current files:

- `icon.png`
- `icon.ico`

These are generated from the repo script:

```powershell
pnpm desktop:assets
```

The current experimental desktop shell has verified Windows NSIS packaging in this checkout. Linux users should run Mainspring from source for now; `pnpm desktop:packaging:check` guards against accidental Linux desktop package targets.
