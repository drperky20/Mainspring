# Sample Run

Command:

```bash
pnpm example:tool-approval
```

Expected flow:

1. Create a temporary RunLog root under `examples/tool-approval`.
2. Start one `RunIntent` through `createRunLogMainspring`.
3. Receive a provider-requested `file.write` tool call.
4. Pause on a RunLog approval request before the file exists.
5. Approve the request with a scoped receipt.
6. Resume the run, execute `file.write`, and complete provider continuation.
7. Remove temporary RunLog state and generated report output.

Expected final text:

```text
RunLog approved the file write and completed the tool run.
```
