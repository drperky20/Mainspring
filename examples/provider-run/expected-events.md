# Expected Events

The runnable provider-run example should emit a sequence that includes:

- `run.created`
- `input.received`
- `run.queued`
- `run.claimed`
- `provider.init`
- `assistant.delta`
- `assistant.result`
- `run.completed`
- `workspace.lease.released`

It should not emit tool-call or approval events.
