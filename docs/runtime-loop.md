# Runtime Loop

The runtime turns a model response into controlled work.

## Responsibilities

| Component | Responsibility |
| --- | --- |
| LLM provider | Language reasoning, tool-call proposals, final text. |
| Runtime kernel | Poll inbound mailbox rows, start provider queries, route provider events, write terminal status. |
| Mailbox | Durable inbound commands, outbound messages, event journal, processing acks, heartbeat. |
| Tool registry | Tool manifest registration, policy checks, approval receipt validation, execution. |
| Policy guard | Risk scoring and approval decisions. |
| Tools | Files, shell, browser adapter, memory, web, skills, diagnostics. |
| Event journal | Durable trace of text, tools, approvals, usage, logs, and errors. |

## Turn Flow

```text
SDK/control plane writes GatewayRunDispatch
-> SQLite inbound mailbox
-> SessionRuntimeSupervisor discovers session
-> RuntimeKernel reads pending inbound row
-> provider receives prompt + system prompt + tool manifests
-> provider emits text/tool events
-> ToolRegistry validates requested tool
-> RuntimePolicyGuard scores risk
-> approval request or tool execution
-> tool result is sanitized
-> result is pushed back to provider
-> provider emits final text
-> RuntimeKernel writes terminal run.status
-> SDK/control plane streams normalized events
```

## Failure Handling

- Provider error: emit `error`, mark run failed unless retry policy says otherwise.
- Unknown tool: emit tool failure and push failure observation to the provider.
- Approval required: emit `approval.requested`, persist pending approval state, and resume when a receipt arrives.
- Cancellation: send cancel signal to provider, clear pending approvals, and emit terminal cancelled state.
- Bad output: redact and truncate before returning it to the model, event stream, or logs.

## Design Rule

Tool output is observation, not instruction. Retrieved files, webpages, logs, command output, and model-generated tool results cannot override policy or operator approvals.
