# Phase 3 Mockup Plan

Date: 2026-07-07

Goal: generate 30 rendered mockup images, then synthesize one final master design image. The master freezes the UI inventory for implementation.

## Locked Design Bible

- Product: Mainspring console.
- Mode: simple SaaS product shell.
- Palette: warm off-white, white surfaces, ink text, muted blue-green accent, soft amber warning state.
- Structure: collapsible sidebar, contextual client workspace, right action rail.
- Components: setup wizard, client empty state, client edit popup, chat feed, agent builder, automation canvas, provider settings, access link panel.
- Motion implied: sidebar compression, modal fade/scale, event stream reveal, node drag/drop, tab slide.
- Copy tone: plain, short, operational.

## Desktop Web Set

1. Setup wizard welcome and account step. Generated: `docs/phase-3-mockups/01-setup-account.png`.
2. Setup wizard provider selection with OpenAI, Codex, OpenRouter, Anthropic, Gemini, Mistral, Groq, DeepSeek. Generated: `docs/phase-3-mockups/02-setup-provider-selection.png`.
3. Setup wizard OpenRouter model picker using live catalog. Generated: `docs/phase-3-mockups/03-setup-openrouter-model-picker.png`.
4. Setup wizard Codex device-code/OAuth connection step. Generated: `docs/phase-3-mockups/04-setup-codex-device-code.png`.
5. Empty clients screen with expanded sidebar. Generated: `docs/phase-3-mockups/05-empty-clients-expanded-sidebar.png`.
6. Empty clients screen with collapsed sidebar. Generated: `docs/phase-3-mockups/06-empty-clients-collapsed-sidebar.png`.
7. Add client popup with mock-filled fields. Generated: `docs/phase-3-mockups/07-add-client-popup.png`.
8. Client list with one selected client. Generated: `docs/phase-3-mockups/08-client-list-selected.png`.
9. Client workspace overview with tabs. Generated: `docs/phase-3-mockups/09-client-workspace-overview.png`.
10. Chat tab with streaming answer and model indicator. Generated: `docs/phase-3-mockups/10-chat-streaming.png`.
11. Chat tab with tool/action events in right rail. Generated: `docs/phase-3-mockups/11-chat-action-rail.png`.
12. Agents tab list. Generated: `docs/phase-3-mockups/12-agents-list.png`.
13. Agent builder popup: prompts. Generated: `docs/phase-3-mockups/13-agent-builder-prompts.png`.
14. Agent builder popup: tools and approval policy. Generated: `docs/phase-3-mockups/14-agent-builder-tools-approvals.png`.
15. Automations tab blank canvas. Generated: `docs/phase-3-mockups/15-automation-blank-canvas.png`.
16. Automations tab with agent, prompt, and tool nodes connected. Generated: `docs/phase-3-mockups/16-automation-connected-nodes.png`.
17. Automation running state with action rail events. Generated: `docs/phase-3-mockups/17-automation-running.png`.
18. Automation finished state with saved outputs. Generated: `docs/phase-3-mockups/18-automation-finished.png`.
19. Access tab with invite link and auth status. Generated: `docs/phase-3-mockups/19-access-invite-link.png`.
20. Settings tab provider connections. Generated: `docs/phase-3-mockups/20-settings-provider-connections.png`.
21. Settings tab backend and Docker status. Generated: `docs/phase-3-mockups/21-settings-backend-status.png`.
22. Provider connection popup for API key. Generated: `docs/phase-3-mockups/22-provider-api-key-popup.png`.
23. Provider connection popup for device code. Generated: `docs/phase-3-mockups/23-provider-device-code-popup.png`.
24. Error/expired provider connection state. Generated: `docs/phase-3-mockups/24-provider-expired-state.png`.
25. Final desktop master candidate. Generated: `docs/phase-3-mockups/25-final-desktop-master.png`.

## Mobile Web Set

26. Mobile setup wizard provider step. Generated: `docs/phase-3-mockups/26-mobile-setup-provider.png`.
27. Mobile clients empty state. Generated: `docs/phase-3-mockups/27-mobile-empty-clients.png`.
28. Mobile client workspace tabs and chat. Generated: `docs/phase-3-mockups/28-mobile-client-chat.png`.
29. Mobile automation run/action rail. Generated: `docs/phase-3-mockups/29-mobile-automation-run.png`.
30. Mobile settings provider connections. Generated: `docs/phase-3-mockups/30-mobile-settings-providers.png`.

## Master Image Requirements

- One desktop master image that shows the final product shell and primary workspace state.
- Include expanded sidebar, client workspace tabs, automation canvas, and action rail.
- No additional UI beyond Phase 2 inventory.
- Use real provider logos only where approved assets are available; otherwise use text labels.

## Master Lock

The frozen implementation reference is `docs/phase-3-mockups/25-final-desktop-master.png`.

The generated exploration set includes minor AI artifacts and occasional extra invented labels. Those are not approved scope. Implementation must follow the Phase 2 inventory and the master lock:

- Global sidebar: Clients and Settings only.
- Client workspace tabs: Chat, Agents, Automations, Access only.
- No separate workspace selector.
- Automations are client-scoped.
- Chat is client-agent scoped.
- Action rail is contextual to the active chat or automation run.
- Provider logos come from official/provider-approved assets or remain text labels.

## Logo Exploration

- Selected generated concept: `docs/phase-3-mockups/logo-mainspring-selected.png`.
- Rejected generated concept: `docs/phase-3-mockups/logo-mainspring-rejected-gear.png`.
- Reason: the selected node/spring mark fits the workspace-agent model better; the gear variant reads as generic automation tooling.
