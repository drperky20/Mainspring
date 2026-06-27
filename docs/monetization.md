# Monetization

Mainspring is designed for people selling agents, not just running demos.

## Business Objects

| Object | Why it matters |
| --- | --- |
| Organization | The seller or operator. |
| Client | The customer receiving an agent or workflow. |
| Workspace | The client's isolated operating area. |
| Agent | The sellable unit. |
| AgentVersion | Auditable prompt/tool/policy version. |
| Session | Conversation or workflow thread. |
| Turn | Billable execution unit. |
| UsageLedgerEntry | Cost and margin source. |
| Artifact | Deliverable output. |

## Pricing Patterns

- Monthly retainer per client workspace.
- Per-agent subscription.
- Per-turn or per-workflow billing.
- Usage plus margin.
- Human approval/review add-on.
- White-labeled local deployment.

## Cost Controls

- Cap turns per client.
- Cap model spend per agent version.
- Use cheap models for retrieval and expensive models for synthesis.
- Cache stable prompt prefixes.
- Summarize old turns.
- Suspend idle sandboxes.
- Truncate logs and tool output.
- Require approval for high-cost browser or shell workflows.
