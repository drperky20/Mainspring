# Mainspring Tools Context

This directory owns runtime tool manifests and built-in tool implementations. Tools must stay behind `ToolRegistry`, `RuntimePolicyGuard`, and approval receipts.

## Rules

- Tool manifests must be explicit, validated, and permission-declared.
- Dangerous tools require policy review and, where applicable, approval receipts.
- Keep file tools workspace-contained with realpath checks.
- Treat `shell.exec` as approved host process execution, not a sandbox.
- Browser tools are adapter-trusted and must not claim profile, download, or network isolation unless implemented.
- Web tools must keep public-target and redirect-target checks.
- Do not log, return, or persist plaintext secrets.
- Keep tool errors structured, redacted, and debuggable.
- Preserve stable tool keys exposed through `src/protocol` and package exports.
- Do not route tools around `ToolRegistry` or directly from renderer/UI code.

## Validate

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm run security:mainspring`
- `pnpm verify` for the full root plus console lane
