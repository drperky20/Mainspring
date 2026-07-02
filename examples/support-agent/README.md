# Support Agent

Create a customer support concierge for a local business.

## Runnable Walkthrough

This example is now runnable with no paid key:

```bash
pnpm example:support-agent
```

It uses `MockProvider`, runs one real SDK/runtime session, reads an approved support FAQ through `file.read`, and prints a JSON summary of the session, run, events, and tool activity.

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
