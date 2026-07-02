# Expected Events

The runnable coding-agent example should emit a sequence that includes:

- `run.created`
- `input.received`
- `run.queued`
- `run.claimed`
- `workspace.lease.created`
- `provider.init`
- `tool.call.requested`
- `policy.decision.recorded`
- `tool.call.completed`
- `checkpoint.saved`
- `tool.call.requested`
- `policy.decision.recorded`
- `approval.requested`
- `checkpoint.saved`
- `run.awaiting_approval`
- `approval.approved`
- `run.queued`
- `workspace.lease.created`
- `approval.receipt.used`
- `policy.decision.recorded`
- `tool.call.completed`
- `checkpoint.saved`
- `provider.init`
- `assistant.result`
- `run.completed`
- `workspace.lease.released`
