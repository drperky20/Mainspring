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
| `coding-agent` | Approval-backed file mutation workflow. |
| `personal-assistant` | RunLog-native local note-reading assistant using `file.read`. |
| `support-agent` | Support workflow over policy and FAQ files. |
| `agency-client-agent` | Client deliverable workflow. |
| `local-first-agent` | Local memory workflow. |

`provider-run`, `tool-approval`, and `personal-assistant` use `createRunLogMainspring` and the canonical RunLog path. The other examples currently use the compatibility SDK host to keep approval, replay, memory, and local tool workflows covered while migration continues. The examples do not provide containment; host tool examples inherit the normal local runtime limits.
