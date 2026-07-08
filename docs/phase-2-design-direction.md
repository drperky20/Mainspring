# Phase 2 Design Direction

Date: 2026-07-07

This direction is locked for the Mainspring console redesign. The UI is a product console for operators and clients, not a marketing site.

## Design Read

Mainspring should feel like a quiet SaaS workbench for managing clients, agents, provider connections, and test runs. It needs to be understandable to a normal client user while leaving enough surface area for developers to inspect prompts, tools, approvals, and run events.

## Product Shape

- Full-screen app shell.
- One animated collapsible sidebar.
- Only two global destinations for now: Clients and Settings.
- No global chat, global automations, or global test area.
- Every client owns one default workspace automatically.
- Client detail owns the working surface: Chat, Agents, Automations, and Access.
- Provider setup is account-scoped first, then selectable per client agent.
- The agent action rail is contextual to the selected client, selected agent, and current run.

## Visual System

- Theme: warm neutral light mode with a restrained dark text scale.
- Accent: one muted blue-green action color used only for primary actions, live states, and selected nodes.
- Surfaces: flat white and off-white bands with exact 1px borders.
- Radius: 8px for controls and cards, 12px only for major modal sheets.
- Shadows: minimal, used only for popups, command sheets, and draggable nodes.
- Typography: clean product sans with strong hierarchy, no oversized marketing type inside the app.
- Icons: simple functional symbols, used before text where the action is obvious.
- Motion: short, practical transitions for sidebar collapse, modal entry, tab changes, node drag/drop, and run event streaming.

## Screen Inventory

These are the only screens/components Phase 3 mockups may explore.

- Setup wizard: account name, password, provider selection, API key/OAuth/device-code connection, first model choice.
- Empty client state: centered "Add new client" action with no secondary noise.
- Client create/edit popup: client name, contact, notes, default mock data, save/cancel.
- Clients list: compact rows, search, selected client state.
- Client workspace: client header, tabs, contextual right action rail.
- Chat: Vercel AI SDK style streaming message feed, agent selector, model/provider indicator.
- Agents: agent list plus builder popup for system prompt, workspace prompt, tools, approvals, model.
- Automations: simple node canvas, draggable toolbox, agent node, tool nodes, prompt node, run button, live action rail.
- Access: client invite link, auth state, role copy controls.
- Settings: connected providers, model catalog refresh, local backend status, open-source/developer metadata.

## Interaction Rules

- New users see setup first, then an empty Clients workspace with one clear add action.
- Adding a client creates the default workspace automatically.
- Creating an agent defaults to that client's workspace and chosen provider/model.
- Running chat or automation always writes visible run events into the contextual action rail.
- Approvals are non-blocking in the UI: denied, skipped, or expired approval events remain visible, and the run continues when the backend can continue.
- Popups are used for creation/editing only. The main canvas remains calm.

## Phase 3 Mockup Direction

The mockups should stay utilitarian and simple, not image-led marketing. The selected final master should use:

- a collapsed/expanded sidebar state,
- a client empty state,
- a client workspace with tabs,
- an agent builder popup,
- an automation canvas with visible run actions,
- a setup wizard provider step,
- desktop and mobile responsive interpretations.

Any UI not listed above is out of scope unless Phase 5 testing proves it is required by backend capability.
