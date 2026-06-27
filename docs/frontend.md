# Frontend Console

The Mainspring console is an operator cockpit for agent businesses. It should be approachable for non-technical founders while still exposing the runtime trace developers need.

This repository currently ships the runtime package, SDK, contracts, docs, Docker image, examples, and a Vite console prototype. The console in `apps/console` stores draft state in browser `localStorage`; it is not wired to live runtime state, secure desktop auth, provider-secret storage, real approvals, usage, artifacts, or `events_out` yet.

The console below is the recommended product surface for a hosted or local-first control-plane wrapper built on top of the package once a real Local Gateway or SDK-backed data source exists.

## Information Architecture

| Page | Primary job |
| --- | --- |
| Dashboard | See active runs, waiting approvals, spend, failures, and revenue-facing health. |
| Clients | Manage customers, workspaces, assigned agents, usage, and billing metadata. |
| Agents | Browse agents, versions, publish state, test sessions, and rollback options. |
| Builder | Configure prompt, tools, memory, model, permissions, budgets, and workspace access. |
| Sessions | Review conversations and workflow history. |
| Run Trace | Inspect dispatch, context, model calls, tool calls, approvals, artifacts, errors, and usage. |
| Approvals | Review dangerous actions with diffs, commands, risk scores, and receipts. |
| Tools | Enable capabilities, view schemas, configure risk tiers, and test tool output. |
| Memory | Inspect memory scopes, source documents, retrieval summaries, and injection warnings. |
| Artifacts | Browse generated files, diffs, screenshots, reports, and downloadable bundles. |
| Settings | Organization, users, secrets, providers, budgets, network policy, and deployment mode. |

## Design Direction

Avoid enterprise sludge. The console should feel like a precise founder cockpit: dense where it matters, calm where it can be, and opinionated about safe defaults.

Use three levels of visibility:

- Founder mode: clients, agents, sessions, approvals, usage.
- Builder mode: prompt, tools, memory, policies, model, workspace.
- Debug mode: raw events, tool IO, provider payloads, receipts, artifacts.

## Live Trace Contract

The current prototype trace is sample data. A production frontend should subscribe to normalized `RunEvent` records instead of bespoke runtime logs. That keeps the UI portable across local-first, Docker, and cloud-hosted deployments.

The trace should make these moments obvious:

- Dispatch leased.
- Sandbox resolved.
- Context assembled.
- Model call started and completed.
- Tool call requested.
- Policy decision made.
- Approval requested or granted.
- Tool executed.
- Artifact written.
- Usage recorded.
- Turn finalized.
