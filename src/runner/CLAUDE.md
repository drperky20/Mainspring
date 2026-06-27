# Mainspring Runner Context

This directory owns the runtime runner spine. Keep it focused on mailbox-driven execution, not product orchestration.

## Owns

- `SessionRuntimeSupervisor` session discovery.
- Per-session `MainspringMailbox` access.
- `RuntimeKernel` polling and provider orchestration.
- Runtime cancellation handling.
- Tool invocation through `ToolRegistry`.
- Policy and approval receipt flow.
- `events_out`, `messages_out`, processing acks, and heartbeat writes.
- Optional control-channel projection through `ChannelBridge`.

## Rules

- Do not bypass `RuntimeKernel`.
- Do not collapse `messages_in`, `messages_out`, `events_out`, heartbeat, or per-session mailbox paths into a UI database.
- Keep Local Gateway, desktop, installer, billing, and HyperCell orchestration outside this package layer unless a sibling host boundary already exists.
- Preserve `AgentProvider.query()` and its `push`, `end`, `abort`, and `events` shape.
- Use runtime contracts from `src/protocol` and public exports from this package, not stale workspace packages.
- Resolve approvals through mailbox approval-response rows and `ApprovalReceipt`, not side-channel booleans.
- Host shell execution is not secure containment. Do not describe process execution as a sandbox.
- Do not leak provider secrets, bearer tokens, mailbox paths, raw host paths, or unsafe shell output into logs/events.
- Keep long-running loops stoppable and testable.

## Validate

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm run security:mainspring`
- `pnpm verify` for the full root plus console lane
