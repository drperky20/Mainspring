# Support Agent

Create a customer support concierge for a local business.

## Runnable Walkthrough

This example is now runnable with no paid key:

```bash
pnpm example:support-agent
```

It uses `createRunLogMainspring`, `MockProvider`, the default `file.read` tool, SQLite RunLog state, and `RunLogProjection`. It reads an approved support FAQ through the canonical RunLog tool path and prints a JSON summary of the run, events, policy decision, checkpoint, and tool activity.

## Shape

- Client: local business.
- Workspace files: refund policy, tone guide, escalation rules, product FAQ.
- Agent: support concierge.
- Tools: `file.read`, `web.fetch`, `memory.read`.
- Approval: required before customer-record writes, refunds, discounts, or escalations.

## Deliverables

- Draft replies.
- Source citations.
- Escalation notes.
- Cost and usage report per client.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
