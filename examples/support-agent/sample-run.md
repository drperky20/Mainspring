# Sample Run

Command:

```bash
pnpm example:support-agent
```

Expected flow:

1. Create a local support session rooted in `examples/support-agent/workspace`.
2. Start one real run through the SDK/runtime path.
3. The mock provider requests `file.read` for `faq/returns.md`.
4. The runtime returns the approved FAQ through the normal tool path.
5. The provider emits a final support-answer draft using that approved text.
