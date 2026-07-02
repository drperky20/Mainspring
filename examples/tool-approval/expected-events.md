# Expected Events

The runnable tool-approval example should emit a sequence that includes:

- `run.created`
- `input.received`
- `run.queued`
- `run.claimed`
- `workspace.lease.created`
- `provider.init`
- `tool.call.requested`
- `policy.decision.recorded`
- `approval.requested`
- `checkpoint.saved`
- `run.awaiting_approval`
- `approval.approved`
- `approval.receipt.used`
- `tool.call.completed`
- `provider.init`
- `assistant.result`
- `run.completed`
- `workspace.lease.released`

It should not write `reports/approved-note.txt` before the approval receipt is created.
