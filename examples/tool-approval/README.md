# Tool Approval

Run a RunLog-native tool approval example.

```bash
pnpm example:tool-approval
```

It uses `createRunLogMainspring`, `MockProvider`, the built-in `file.write` tool, `RuntimePolicyGuard`, scoped RunLog approval receipts, and `RunLogProjection`.

The first provider turn requests a workspace file write. The run pauses with `approval.requested`, the example approves that exact request, then the approved resume executes the write and completes the run.

## Guardrails

- The file mutation is workspace-scoped and approval-gated.
- The example checks that the output file does not exist before approval.
- Host file tools are not containment; this example demonstrates approval flow, not a sandbox.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
