# Coding Agent

Run a codebase assistant with traceable edits and test evidence.

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
