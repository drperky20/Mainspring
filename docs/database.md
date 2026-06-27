# Database

Mainspring's control plane should use Postgres as the canonical state store. Runtime artifacts can live in local filesystem storage for local-first installs or object storage for hosted deployments.

## Ownership Tables

| Table | Purpose |
| --- | --- |
| `organizations` | Tenant boundary, billing owner, policy defaults. |
| `users` | Human operators and client users. |
| `organization_memberships` | Role and permission mapping. |
| `clients` | Customer records for agencies and operators. |
| `workspaces` | Isolated project/runtime roots owned by an organization and optionally linked to a client. |

## Agent Tables

| Table | Purpose |
| --- | --- |
| `agents` | Stable agent identity and current version pointer. |
| `agent_versions` | Immutable prompt, tool, model, memory, and policy configuration. |
| `agent_tools` | Tool capability manifest for a version. |
| `agent_memories` | Memory scopes and retrieval settings. |
| `agent_secrets` | References to encrypted secrets, never plaintext values. |

## Run Tables

| Table | Purpose |
| --- | --- |
| `sessions` | Conversation or workflow container. |
| `turns` | User request, dispatch state, cancellation state, and final status. |
| `run_events` | Append-only normalized event journal. |
| `tool_calls` | Validated tool requests, policy decision, execution status, and sanitized output reference. |
| `approvals` | Approval requests, reviewer decision, risk score, receipt, and expiry. |
| `artifacts` | Files, diffs, screenshots, reports, and generated outputs. |
| `usage_ledger_entries` | Tokens, cached tokens, output tokens, sandbox time, storage, retries, and estimated cost. |

## Security Tables

| Table | Purpose |
| --- | --- |
| `secrets` | Encrypted secret envelopes scoped by organization, workspace, client, or agent. |
| `audit_log_entries` | Human and runtime actions with actor, target, IP, trace id, and before/after metadata. |
| `policy_receipts` | Durable explanation for allowed, denied, or approval-gated actions. |
| `budget_limits` | Per-org, per-client, per-agent, and per-run spend caps. |

## Row-Level Rules

Every table with business data should carry `organization_id`. Client-owned records should also carry `client_id` where applicable. Runtime records should carry `workspace_id`, `agent_id`, `session_id`, and `turn_id` when available.

Hosted deployments should enforce organization membership in application middleware and optionally Postgres row-level security. Local-first deployments can use the same schema without RLS while still preserving ownership fields for export or future hosting.
