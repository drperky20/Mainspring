# Examples

Run one example:

```bash
pnpm example:provider-run
```

Run all examples:

```bash
pnpm examples:check
```

## Inventory

| Example | Purpose |
| --- | --- |
| `provider-run` | Minimal RunLog-native provider-only run without tools or paid provider keys. |
| `tool-approval` | RunLog-native approval receipt flow for a workspace-scoped `file.write` tool call. |
| `coding-agent` | RunLog-native read-then-approved-write coding workflow. |
| `personal-assistant` | RunLog-native local note-reading assistant using `file.read`. |
| `support-agent` | RunLog-native support workflow reading approved FAQ files through `file.read`. |
| `agency-client-agent` | RunLog-native client deliverable workflow with approval-gated `file.write`. |
| `local-first-agent` | RunLog-native local memory workflow with approval-gated `memory.write` and `memory.read`. |

All runnable examples use `createRunLogMainspring` and the canonical RunLog path. The examples do not provide containment; host tool examples inherit the normal local runtime limits.
