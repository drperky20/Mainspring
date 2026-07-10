# Console And Desktop

## What It Does

The console lives in `apps/console` and is live-gateway-first. Its main product surface is a local operator control room:

- complete a first-run setup wizard for the local account and model service
- create and manage clients; each client gets a default workspace and first agent
- use Overview, Clients, Runs, Approvals, Usage, and Settings as the global operator navigation
- edit client details, workspace prompt, agent system prompt, model, tool toggles, and approval mode
- chat with the selected client's agent through the gateway run API
- test client-scoped automations through a simple node board and visible action rail
- connect OpenRouter and OpenAI provider profiles while keeping provider secrets server-side
- review active and historical runs, pending approvals, usage, pricing coverage, and budgets from gateway-backed data
- inspect a run's sanitized event timeline, tool calls, checkpoints, policy decisions, and errors, then cancel active RunLog or compatibility runs
- inspect selected-client RunLog checkpoint, policy, error, tool-call, artifact, usage, session, deployment, cell, and recent-memory summaries
- approve or deny pending tool work from dashboard and client detail surfaces
- review scoped cron grants and staged memory/skill provenance mutations

The console renders gateway DTOs and contains browser-edge regression guards for unsafe response fields, path markers, provider key environment markers, artifact URLs, SSE URLs, and localhost gateway URL selection.

When the local gateway is configured with a RunLog host, the gateway snapshot can include an optional sanitized projection discovered from the durable RunLog store. The console overview, runs, approvals, and usage screens consume that projection while preserving the browser DTO boundary.
Run, approval, usage, artifact, and session trace views use that sanitized projection;
they do not expose private receipt payloads, raw host paths, or provider credentials.

The console depends on Vercel AI SDK packages for the chat UI boundary and uses AI SDK UI message roles in the client surface. Mainspring still dispatches chat through the existing gateway `/runs/start` route; a dedicated AI SDK streaming transport endpoint is a future backend adapter.

Provider support is intentionally honest:

- OpenRouter and OpenAI API-key or managed-secret profiles are wired through existing gateway provider profiles.
- Codex device-code OAuth is documented as a connector path, but the console does not mark it connected until a backend connector exists.
- Anthropic subscription credential reuse is not exposed as third-party client auth; use a direct API adapter when implemented or route Anthropic models through OpenRouter today.
- Other provider logos are represented by neutral badges until licensing and direct adapters are in place.

The desktop shell lives in `apps/desktop`. It is an Electron wrapper for the console with Windows packaging. It now owns a private user-data layout, single-instance coordination, unclean-shutdown detection, and a narrow preload diagnostics API. The embedded gateway, worker, vault, and updater remain explicitly disabled until their host integrations are implemented.

## What It Does Not Do

- The console does not enforce runtime security by itself.
- Client workspace links are selector links protected only by the gateway mode in front of them; dedicated per-client account auth is not implemented.
- Provider keys must not be stored in renderer localStorage.
- Hosted auth session tokens are kept in memory by the renderer and are not persisted in browser storage.
- RunLog data shown in the console is a sanitized projection, not raw RunLog private receipt or workspace state.
- Trace views are projection-backed inspection surfaces, not a raw live `events_out` stream or general checkpoint replay controller.
- The desktop shell does not yet start the gateway, worker, or execution cells.
- The desktop shell is not a secure cross-platform desktop secret vault.
- An update feed is not an updater implementation; desktop diagnostics report update support as disabled or unavailable until a packaged updater exists.
- Linux desktop installer packaging is not a supported release lane; Linux users run from source.

## How To Verify

```bash
pnpm console:typecheck
pnpm console:browser-safety:check
pnpm console:build
pnpm desktop:typecheck
pnpm desktop:build
pnpm desktop:packaging:check
pnpm desktop:systems:check
```
