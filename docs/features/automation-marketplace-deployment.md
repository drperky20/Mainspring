# Automation, Marketplace, And Deployment

## What It Does

Mainspring has three local gateway feature lanes:

- cron schedules stored in app-state SQLite; RunLog-configured gateways dispatch due runs through RunLog cron policy, while gateways without RunLog keep the mailbox compatibility path
- a trusted local template catalog seeded from `examples/templates.json`
- guarded `vps` deployment targets with plan, dry-run, execute, rollback, and destroy flows

Marketplace installs can create client/workspace/agent records and copy approved markdown/json seed files.

Deployment plans can run `npm pack` and prepare `ssh` / `scp` command previews for explicit execution.

## What It Does Not Do

- It does not run arbitrary marketplace scripts.
- It does not install remote marketplace code.
- It does not provide paid marketplace distribution.
- Cron schedule creation/run-now and provenance review controls are available through the local gateway API/client and React console.
- It does not make unsupported deployment target kinds executable; unsupported target kinds fail closed.
- It does not bypass the runtime policy, mailbox, approval, and tool execution path.

## How To Verify

```bash
pnpm cron:check
pnpm marketplace:check
pnpm deploy:check
```
