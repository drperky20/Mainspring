# Provider Run

Run the smallest RunLog-native SDK example.

```bash
pnpm example:provider-run
```

It uses `createRunLogMainspring`, `MockProvider`, SQLite RunLog storage, and `RunLogProjection`. It does not require a live provider key and does not execute tools.

The JSON output includes the RunLog run id, session id, relative workspace path, final assistant text, event types, checkpoint kinds, and usage rows when the provider emits them on the supported usage event path.

## Guardrails

- Provider-only: no shell, file write, browser, memory, or skill tools are requested.
- Local-only: temporary RunLog state is removed after the run.
- Not a sandbox: this example avoids host tools entirely instead of claiming containment.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
