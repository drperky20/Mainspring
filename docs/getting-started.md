# Getting Started

## Local Setup

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
cp .env.example .env
pnpm verify
```

## Minimal Embedded Run

```ts
import { EchoProvider, createMainspring } from 'mainspring'

const runtime = createMainspring({
  sessionsRoot: '.mainspring/sessions',
  workspaceRoot: '.mainspring/workspace',
  provider: new EchoProvider(),
})

await runtime.start()
const session = runtime.sessions.create()
const run = session.runs.start({ input: 'Hello', allowedTools: [] })

for await (const event of run.events()) {
  console.log(event)
}

await runtime.stop()
```

## Runtime Entrypoint

```bash
pnpm build
MAINSPRING_SESSIONS_ROOT=.mainspring/sessions \
MAINSPRING_WORKSPACE_ROOT=.mainspring/workspace \
pnpm start
```

## Provider Configuration

```bash
MAINSPRING_PROVIDER=openrouter
MAINSPRING_MODEL=openrouter/free
MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY
OPENROUTER_API_KEY=
```

OpenAI-compatible proxies are also supported:

```bash
MAINSPRING_PROVIDER=openai
MAINSPRING_MODEL=gpt-5.5
MAINSPRING_CREDENTIAL_REF=env:OPENAI_API_KEY
MAINSPRING_OPENAI_BASE_URL=http://127.0.0.1:8645/v1
MAINSPRING_OPENAI_RESPONSES_MODE=codex-proxy
```
