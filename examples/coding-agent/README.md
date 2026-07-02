# Coding Agent

Run a codebase assistant with traceable edits and test evidence.

## Runnable Walkthrough

This example is the current default runnable example in the repo.

```bash
pnpm example:coding-agent
```

It uses `MockProvider`, writes one approved report into the example workspace, and prints a JSON summary containing the session, run, event types, resolved approval count, and final assistant text.

## Shape

- Workspace: one repository checkout.
- Tools: `file.read`, `file.write`, `shell.exec`.
- Policy: source mutation and shell require approval.
- Artifacts: patch, test logs, screenshots, coverage reports.

## Guardrails

- Always capture before/after diff.
- Run targeted tests before broad tests.
- Store command exit code and truncated output.
- Never expose environment secrets to the model.

## Example Artifacts

- [Sample Run](sample-run.md)
- [Expected Events](expected-events.md)
