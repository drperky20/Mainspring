# Agency Client Agent

Sell a managed agent to a client.

## Shape

- Organization: your agency.
- Client: one customer account.
- Workspace: separated client files, policies, deliverables, artifacts.
- Agent: client-specific workflow operator.
- Tools: file, web fetch/search, browser preview, memory.
- Policy: shell and source mutation require approval.

## Business Model

Charge a monthly retainer plus usage margin outside Mainspring. Use the usage ledger to report model tokens, runtime time, artifacts, and review work.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)

## Runnable Walkthrough

Run the local no-paid-key walkthrough:

```bash
pnpm example:agency-client-agent
```

It uses `createRunLogMainspring`, `MockProvider`, SQLite RunLog state, the built-in `file.read` and `file.write` tools, scoped RunLog approval receipts, and `RunLogProjection`.

The run reads one client brief, pauses before the client-facing file write, approves that exact request with a local example receipt, resumes through `ToolRegistry`, writes one deliverable, prints a JSON summary, and then cleans up temporary local runtime state.

Host file tools are not containment. This walkthrough demonstrates approval-gated local workspace mutation, not a sandbox or customer delivery integration.
