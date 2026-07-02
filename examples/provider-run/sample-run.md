# Sample Run

Command:

```bash
pnpm example:provider-run
```

Expected flow:

1. Create a temporary RunLog root under `examples/provider-run`.
2. Start one `RunIntent` through `createRunLogMainspring`.
3. Drain the run through `RunLogKernel`, `RunLogScheduler`, and `RunLogExecutor`.
4. Read the result through `RunLogProjection`.
5. Remove the temporary RunLog root.

Expected final text:

```text
RunLog provider example completed without tools.
```
