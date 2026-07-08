# Phase 1 UI and Backend Baseline

Date: 2026-07-07

This is the baseline punch list for the Mainspring SaaS console rebuild. It follows the goal file contract: test the current build first, then use the failures to drive redesign, mockups, and implementation.

## What Passed

- Local gateway health is up at `http://127.0.0.1:8787/health`.
  - Response: `mode=local-gateway-dev`, `ok=true`, `running=true`, `authMode=local-dev`, `authenticated=true`.
- OpenRouter live backend e2e passed through the runlog/provider path.
  - Command: `pnpm openrouter:e2e`
  - Result: `OPENROUTER_E2E_OK`
  - Provider: `openrouter`
  - Model: `openrouter/free`
  - Transport: `openrouter-chat-completions`
  - Run status: `completed`
  - Event count: `13`
  - Secret echo check: `keyEchoed=false`
- Codex CLI auth and headless execution are usable after fixing the local config enum.
  - Backup created: `C:\Users\drper\.codex\config.toml.bak-mainspring-phase1-20260707012837`
  - Config fix: `service_tier` changed from `default` to `fast`.
  - `codex login status`: logged in using ChatGPT.
  - `codex exec`: returned `MAINSPRING_CODEX_CLI_AUTH_OK`.
- Current repo test surface passed.
  - Command: `pnpm test -- --run apps/console/src/App.test.tsx apps/console/src/localGatewayClient.test.ts`
  - Actual configured run: 75 test files, 501 tests passed.
- Embedded browser can load the current console at `http://127.0.0.1:5173/`.
- Chrome can load the current console at `http://127.0.0.1:5173/`.

## Baseline Failures

### Docker backend is not complete

The goal requires every backend process to run in Docker. Current `docker/compose.local.yml` only defines `mainspring-runtime`.

Missing Docker services:

- gateway API server
- web console serving path or nginx/static container
- database or durable app-state service
- provider proxy / connector service
- worker/runner service split, if runtime and gateway should be independently operated

The current browser app is backed by a bare-metal local dev gateway on `127.0.0.1:8787`, so the current stack fails the Docker-only backend requirement.

### State is still browser-local

Embedded browser showed a previously configured console state with clients and settings. Chrome opened to the setup wizard. That means setup/account/client state is not yet consistently owned by the backend.

Required fix:

- account setup, provider profiles, clients, agents, automations, and selected workspace state must be persisted through the backend
- local storage can only be a cache or draft layer, not the source of truth

### Setup flow is incomplete for the target product

Current setup wizard has the rough shape of account -> providers -> finish, but it does not yet satisfy the target flow.

Required setup flow:

- owner account name
- username
- password
- provider selection
- provider connection method
- default client seed or first-client creation
- service/model selection
- backend-persisted auth/session result

### Provider support is not aligned with the target UI

Current built-in provider registry only has OpenRouter and OpenAI. The console catalog shows other providers mostly as static catalog/connector rows.

Required provider work:

- OpenRouter: keep live path and add model catalog search/listing from the OpenRouter API
- OpenAI API key: keep direct provider path
- Codex: add a first-class connector backed by the authenticated Codex CLI/device/OAuth path, not only static UI copy
- Anthropic: do not claim subscription reuse unless an official current path is implemented and verified; otherwise expose direct API key or OpenRouter routing
- Gemini, Mistral, Groq, xAI, DeepSeek: show as direct connectors only when adapters exist; otherwise route through OpenRouter and label clearly

### Provider logos are not real assets

Current provider UI uses text badges such as `OR`, `AI`, and `CX`. The target requires real provider logos sourced from official brand assets.

Required fix:

- source official brand assets before implementation
- store attribution/source metadata with the asset decision
- do not use generated or approximated third-party provider logos

### Chat is not Vercel AI SDK streaming UI yet

Current chat starts a run with `gatewayClient.startRun(...)`, then reads `gatewayClient.runEvents(...)` after the run. That is useful but not the requested live streaming chat experience.

Required fix:

- add an AI SDK-compatible chat transport or adapter
- map gateway run events to AI SDK event/message parts
- stream assistant deltas into the chat feed as they arrive
- keep action logs visible beside the chat without making approvals blocking

### Automation builder is static, not a workflow canvas

Current embedded and Chrome checks found `draggableCount=0`. The code also has no `onDrop`/drag contract in `ConnectedConsoleApp.tsx`.

Required automation flow:

- draggable node toolbox
- canvas/grid area
- agent node
- tool nodes
- prompt/config node
- run button
- live action rail
- save/load automation definition through backend
- per-run ephemeral workspace policy visible in the run details

### Agent builder is useful but incomplete

Current agent builder supports name, connected service, model, approval mode, workspace prompt, system prompt, and basic tool toggles. It does not yet expose the full target contract.

Required agent flow:

- client-scoped agents
- selected model/service per agent
- system prompt
- workspace prompt
- tool allowlist
- approval policy
- non-blocking approval failure behavior
- saved through backend
- usable by chat and automation runner

### Client/workspace model needs simplification

The target model is one client equals one primary workspace. The current code still exposes workspace concepts separately in places.

Required product rule:

- every client automatically owns one primary workspace
- users should not choose between workspaces during normal use
- agents belong to a client and operate in that client workspace
- any per-run scratch workspace is an implementation detail surfaced only in run details

## Phase 2 Design Input

The redesign should not add more tabs. The target product map is:

- Setup wizard when not configured
- Full-screen app shell after setup
- Animated collapsible sidebar
- Sidebar items: Clients, Settings
- Empty state: Add new client
- Client detail tabs: Chat, Agents, Automations
- Settings: account, provider connections, gateway status

Visual constraints:

- simple SaaS console, not a landing page
- calm, mostly neutral palette
- rounded but not bubbly
- no decorative gradients or blobs
- real logos only for providers
- action rail and popup dialogs are allowed
- workflow canvas should be clear enough for non-dev users but expose enough details for developers

## Phase 2 Implementation Punch List

1. Add a Docker compose stack for gateway, runtime/worker, durable storage, and console delivery.
2. Move app setup/client/provider/agent/automation state into backend APIs.
3. Add first-class Codex connector surface backed by verified Codex auth/execution.
4. Add OpenRouter model listing/search against the OpenRouter API.
5. Replace static provider badges with official provider logo assets.
6. Build a frozen design spec and image mockup set before implementation.
7. Rebuild the UI around the minimal navigation model: Clients and Settings only.
8. Implement backend-backed setup wizard.
9. Implement client-scoped chat with AI SDK-compatible streaming.
10. Implement client-scoped agent builder with prompts, model, tools, and non-blocking approvals.
11. Implement automation canvas with draggable nodes and live action rail.
12. Add e2e tests for embedded browser, Chrome, and Codex CLI/headless flows.
