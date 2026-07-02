# Personal Assistant

Build a local assistant for one operator.

## Runnable Walkthrough

This example is now runnable with no paid key:

```bash
pnpm example:personal-assistant
```

It uses `MockProvider`, runs one real SDK/runtime session, reads a workspace note through `file.read`, and prints a JSON summary of the session, run, events, and tool activity.

## Shape

- Organization: personal workspace.
- Client: none.
- Workspace: private files and memory.
- Agent: personal operator.
- Tools: `file.read`, `memory.read`, `memory.write`, optional browser.
- Policy: balanced, shell disabled by default.

## Monetization

This is the local-first starter. It proves the runtime loop before adding clients or billing.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
