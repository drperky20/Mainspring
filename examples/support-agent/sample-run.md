# Sample Run

Command:

```bash
pnpm example:support-agent
```

Expected flow:

1. Create temporary SQLite RunLog state rooted under `examples/support-agent`.
2. Start one `RunIntent` through `createRunLogMainspring`.
3. The mock provider requests `file.read` for `faq/returns.md`.
4. `RunLogExecutor` records a policy decision, executes the read through `ToolRegistry`, checkpoints the tool result, and returns the approved FAQ to the provider.
5. The provider emits a final support-answer draft using that approved text.
6. Remove temporary RunLog state and generated FAQ files.
