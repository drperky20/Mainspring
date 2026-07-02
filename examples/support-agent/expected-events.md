# Expected Events

The runnable support-agent example should emit a sequence that includes:

- `run.created`
- `input.received`
- `provider.init`
- `tool.call.requested`
- `policy.decision.recorded`
- `tool.call.completed`
- `checkpoint.saved`
- `assistant.result`
- `run.completed`
