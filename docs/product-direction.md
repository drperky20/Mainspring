# Product Direction

Mainspring should make an agent business feel operable from day one.

## Core Jobs

| Job | Product capability |
| --- | --- |
| Create an agent | Builder for prompts, tools, model, permissions, memory, workspace access, and policy. |
| Sell an agent | Client records, agent versions, customer metadata, usage ledger, and exportable billing records. |
| Run an agent | Queue-backed runtime dispatch, sandbox resolution, tool execution, approvals, retries, and cancellation. |
| Debug an agent | Live run trace, tool call details, prompt/context inspection, artifacts, logs, and replay records. |
| Control risk | Approval tiers, network controls, scoped secrets, audit logs, and workspace isolation. |

## Product Objects

Mainspring should treat these as first-class product objects rather than incidental metadata:

- Organization
- User
- Client
- Workspace
- Agent
- AgentVersion
- Session
- Turn
- RunEvent
- ToolCall
- Approval
- Artifact
- Memory
- Secret
- UsageLedgerEntry
- BillingProfile

## Near-Term Console

The console should prioritize founder workflows:

- Dashboard: active runs, approvals waiting, spend today, errors, top agents.
- Clients: customer records, workspaces, sessions, usage, billing metadata.
- Agents: create, version, test, publish, clone, rollback.
- Builder: prompt, tools, memory, policy, model, limits, workspace.
- Sessions: transcript plus event trace.
- Run Trace: dispatch, context, model steps, tool calls, approvals, artifacts, errors, usage.
- Approvals: risk score, requested action, diff, command, receipt.
- Usage: model tokens, cache hits, sandbox time, retries, storage, cost caps.

## Product Boundaries

Do not make the browser talk directly to runtime sandboxes. Do not store decrypted secrets in prompts or logs. Do not let the model invent tools. Do not treat billing as a Stripe button before the usage ledger is trustworthy.
