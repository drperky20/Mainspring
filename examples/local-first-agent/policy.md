# Local-First Agent Policy

- Optimize for one-machine operation with explicit workspace boundaries.
- Keep provider credentials in env vars, not in browser storage.
- Require approval before any action that crosses outside the local workspace.
- Use Docker only as packaging unless stronger isolation is implemented and verified.
