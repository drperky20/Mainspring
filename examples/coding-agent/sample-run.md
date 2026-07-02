# Sample Run

Command:

```bash
pnpm example:coding-agent
```

Expected flow:

1. Create temporary SQLite RunLog state rooted under `examples/coding-agent`.
2. Start one `RunIntent` through `createRunLogMainspring`.
3. The mock provider requests `file.read` for the workspace README.
4. `RunLogExecutor` records an allowed policy decision, executes the read through `ToolRegistry`, and checkpoints the tool result.
5. The mock provider requests `file.write` for `workspace/reports/next-step.txt`.
6. `RunLogExecutor` records a `requires_approval` policy decision and pauses the run.
7. The script approves the exact write request with a scoped RunLog receipt.
8. The approved resume writes the report through `ToolRegistry`, checkpoints the tool result, and returns a final assistant result.
9. The example prints a JSON summary and removes temporary RunLog state plus the generated report.
