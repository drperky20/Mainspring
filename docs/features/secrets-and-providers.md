# Secrets And Providers

## What It Does

Mainspring supports these provider paths:

- Echo provider for local no-key work
- Mock provider for tests
- bundled OpenRouter-compatible HTTP provider
- bundled OpenAI-compatible HTTP provider
- explicitly registered custom providers

Provider config should pass refs, not raw secret values:

```bash
MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY
OPENROUTER_API_KEY=...
```

Runtime provider IDs are safe strings resolved through `ProviderRegistry`. `openrouter` is the default bundled provider and `openai` remains bundled, but other provider IDs must be registered with a provider manifest/factory before use. Generic provider env resolution supports `MAINSPRING_PROVIDER`, `MAINSPRING_MODEL`, `MAINSPRING_PROVIDER_BASE_URL`, and `env:<PROVIDER_ID>_API_KEY` credential refs; provider-specific behavior belongs in adapter capability metadata.

In `local-gateway-dev`, a browser can submit a provider secret once. The gateway encrypts it in local app-state storage and resolves it host-side during provider query. The browser cannot read the value back. RunLog-backed gateway starts carry only opaque credential refs such as `managed:provider_profile_...`; the raw value is injected into provider calls through the host resolver and is not appended to RunLog events.

`openrouter:e2e` is an optional live-provider verifier. Missing credentials fail closed with `MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED` without echoing key values. With credentials present, it uses `createRunLogMainspring`, `RunIntent`, the SQLite RunLog store, `ProviderRouter`, and `OpenRouterProvider` rather than a direct provider shortcut.

## What It Does Not Do

- It is not a cross-platform desktop credential vault.
- It is not OAuth provider auth.
- It is not hosted KMS.
- It is not enterprise secret management.
- `openrouter:e2e` is not part of `release:check` because it requires `OPENROUTER_API_KEY` and network access.
- It is not a provider account health monitor or billing proof; it verifies one short live RunLog turn and event redaction.
- Provider keys must not be stored in renderer localStorage.

## How To Verify

```bash
pnpm secrets:check
pnpm security:sensitive-patterns
pnpm optional-verifiers:check
pnpm openrouter:e2e
```

Set `MAINSPRING_OPENROUTER_E2E_SKIP_ENV_FILE=1` when testing the missing-key branch without loading `.env.local`.
