# Sample Run

Command:

```bash
pnpm example:personal-assistant
```

Expected flow:

1. Create temporary SQLite RunLog state rooted under `examples/personal-assistant`.
2. Start one `RunIntent` through `createRunLogMainspring`.
3. The mock provider requests `file.read` for `notes/today.md`.
4. `RunLogExecutor` records a policy decision, executes the read through `ToolRegistry`, checkpoints the tool result, and returns the workspace note to the provider.
5. The provider emits a final assistant summary using that note text.
6. Remove temporary RunLog state and generated note files.
