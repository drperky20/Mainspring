# Coding Agent

Run a codebase assistant with traceable edits and test evidence.

## Runnable Walkthrough

This example is the current default runnable example in the repo.

```bash
pnpm example:coding-agent
```

It uses `createRunLogMainspring`, `MockProvider`, SQLite RunLog state, the built-in `file.read` and `file.write` tools, scoped RunLog approval receipts, and `RunLogProjection`.

The run reads the workspace README, pauses before writing a next-step report, approves that exact local workspace write, resumes through `ToolRegistry`, prints a JSON summary, and removes temporary runtime state.

## Shape

- Workspace: one repository checkout.
- Tools in this runnable walkthrough: `file.read`, `file.write`.
- Policy: workspace mutation requires approval.
- Future coding-agent shape: shell execution, patch artifacts, test logs, screenshots, and coverage reports.

## Guardrails

- Always capture before/after diff.
- Run targeted tests before broad tests.
- Store command exit code and truncated output.
- Never expose environment secrets to the model.
- Host file tools are not containment; this example demonstrates approval-gated local workspace mutation, not a sandbox.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
