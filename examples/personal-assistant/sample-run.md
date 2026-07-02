# Sample Run

Command:

```bash
pnpm example:personal-assistant
```

Expected flow:

1. Create a local personal session rooted in `examples/personal-assistant/workspace`.
2. Start one real run through the SDK/runtime path.
3. The mock provider requests `file.read` for `notes/today.md`.
4. The runtime returns the workspace note through the normal tool path.
5. The provider emits a final assistant summary using that note text.
