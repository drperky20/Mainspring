# Sample Run

Command:

```bash
pnpm example:coding-agent
```

Expected flow:

1. Create a local session rooted in `examples/coding-agent/workspace`.
2. Start one run through the SDK and mailbox-backed runtime path.
3. The mock provider requests `file.write`.
4. The script resolves the approval through the normal approval API.
5. The tool writes `workspace/reports/next-step.txt`.
6. The provider returns a final assistant result.
