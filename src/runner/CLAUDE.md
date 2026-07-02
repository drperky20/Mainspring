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
- Keep backend selection truth additive: tool input may request `host`, `wsl`, or `docker`, but execution still has to enter through `RuntimeKernel -> ToolRegistry -> ProcessRegistry`.
- Preserve `AgentProvider.query()` and its `push`, `end`, `abort`, and `events` shape.
- Use runtime contracts from `src/protocol` and public exports from this package, not stale workspace packages.
- Resolve approvals through mailbox approval-response rows and `ApprovalReceipt`, not side-channel booleans.
- Host shell and terminal execution are not secure containment. Do not describe `shell.exec`, `terminal.start`, or any process-session helper as a sandbox.
- If an isolated-capable backend is unavailable, fail closed with the exact platform reason. Do not silently fall back from a requested isolated backend to host execution.
- Keep terminal/process helpers run-scoped and additive to the runtime tool layer; they must not become a side-channel runtime supervisor that bypasses mailbox-backed execution.
- Do not leak provider secrets, bearer tokens, mailbox paths, raw host paths, or unsafe shell output into logs/events.
- Keep long-running loops stoppable and testable.

## Validate

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm run security:mainspring`
- `pnpm verify` for the full root plus console lane
