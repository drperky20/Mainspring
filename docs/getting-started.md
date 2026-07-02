# Getting Started

## Requirements

- Node.js 20 or newer
- Corepack and pnpm
- Git

Docker is optional. It is only needed for the container runtime path.

## Install

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm verify
```

## Run A Local Example

```bash
pnpm example:provider-run
```

Run all examples:

```bash
pnpm examples:check
```

`provider-run` uses the canonical RunLog SDK host and does not require a live provider key. `tool-approval` uses the same host to show an approval-gated workspace write. `personal-assistant` uses the same host for a read-only workspace tool run. The other examples keep the compatibility SDK host covered while migration continues. The examples do not provide containment; host tool examples inherit the normal local runtime limits.

## Run The Gateway And Console

```bash
pnpm gateway:dev
pnpm console:dev
```

Open:

```text
http://127.0.0.1:5173/?mainspringConsoleSource=local-gateway-dev
```

The gateway is local-only. Remote and wildcard bind overrides fail closed.

## Configure A Provider

OpenRouter:

```bash
OPENROUTER_API_KEY=...
MAINSPRING_PROVIDER=openrouter
MAINSPRING_MODEL=openrouter/free
MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY
```

OpenAI-compatible:

```bash
OPENAI_API_KEY=...
MAINSPRING_PROVIDER=openai
MAINSPRING_MODEL=gpt-4.1-mini
MAINSPRING_CREDENTIAL_REF=env:OPENAI_API_KEY
```

Provider keys belong in environment variables or managed secret storage. Do not store them in browser localStorage.

## Next

- [Architecture](architecture.md)
- [Runtime Loop](runtime-loop.md)
- [Local Gateway](features/local-gateway.md)
- [Security](security.md)
