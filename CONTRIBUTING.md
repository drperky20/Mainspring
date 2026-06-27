# Contributing To Mainspring

Mainspring is built around one core rule: the runtime must make agent actions inspectable, bounded, and replayable.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm run security:mainspring
```

## Boundaries

- Keep this repository usable as a single `mainspring` package.
- Keep business/control-plane concepts as contracts, docs, SDK metadata, or external wrapper examples unless an actual app is added.
- Keep model/tool/runtime behavior under `src/runner`, `src/tools`, `src/providers`, `src/policy`, `src/mailbox`, and `src/storage`.
- Keep browser-facing responses product-safe. Do not expose raw sandbox paths, provider keys, internal tokens, or process details.
- Prefer event-sourced changes over hidden state mutation.
- Add a protocol/contract test when changing `src/protocol`, `src/control`, or `src/contracts`.
- Add runtime tests when changing policy, tool execution, event emission, or provider loops.

## Pull Request Checklist

- The change preserves tenant isolation.
- Dangerous tool behavior has policy coverage.
- New response payloads are redacted where needed.
- Public docs explain any new operator-facing concept.
- Local checks pass or the blocker is documented.
