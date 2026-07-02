# GPT-5.4 Mini Documentation Review

Date: 2026-07-02

Reviewer: Curie, writer, GPT-5.4 Mini

Scope:

- `README.md`
- `SECURITY.md`
- `package.json`
- `docs/README.md`
- `docs/index.md`
- `docs/getting-started.md`
- `docs/examples.md`
- `docs/security.md`
- `docs/runtime-loop.md`
- `docs/current-state.md`
- `docs/architecture.md`
- `docs/features/local-gateway.md`
- `docs/features/console-and-desktop.md`
- `docs/sdk.md`
- `docs/operations.md`
- `docs/migration-runlog.md`
- `docs/security-truth.md`
- `examples/*/README.md`
- `examples/*/sample-run.json`
- `src/sdk/RunLogMainspring.ts`
- `src/gateway/server/dev.ts`
- `src/index.ts`

Commands run by reviewer:

- `pnpm docs:check`
- `pnpm security:truth`
- `pnpm package:check`
- `pnpm example:provider-run`
- `pnpm example:tool-approval`

Result:

- Documentation is mostly aligned with the current RunLog-first codebase.
- Public wording is conservative about security and local-first limits.
- Example commands and sample outputs reviewed by the agent matched the current runnable paths.

## Strengths

- `README.md` works as a GitHub front door: it explains RunLog Fabric, the legacy compatibility boundary, quickstart commands, verification, and security limits.
- Security messaging matches code-backed limits around host execution, localStorage, managed secret references, and unavailable hosted/cloud-payment features.
- Provider and tool-approval examples are accurate no-key RunLog examples.
- Existing checks enforce the public docs, security truth, package surface, and example command drift.

## Accepted Findings

| Area | Finding | Risk | Fix |
| --- | --- | --- | --- |
| Review artifact | `docs/reviews/gpt-5.4-mini-docs-review.md` was missing. | The required model review would remain undocumented. | Added this file. |
| SDK public surfaces | `docs/sdk.md` listed public surfaces but omitted `mainspring/adapters/local-blob`, `mainspring/compat`, and `mainspring/gateway/browser-safety`. | The section could be read as an exhaustive export list while missing supported exports. | Update the section to mirror `package.json` exports and mark `compat` as temporary migration surface. |
| Gateway and console dev process | The README listed `pnpm gateway:dev` and `pnpm console:dev` without explicitly saying they are separate processes. | New contributors may expect one command to run both. | Add a concise clarification near the dev commands. |

## Rejected Or Non-Issues

- RunLog vs mailbox wording is consistent across the reviewed docs.
- EchoProvider fallback, `.mainspring/runlog`, and host-side secret handling match the current code.
- Provider and tool-approval example docs are executable and aligned with sample output.

## Verification Summary

- Code examples checked by the reviewer: 2 of 2 passed.
- Commands checked by the reviewer: 5 of 5 passed.
