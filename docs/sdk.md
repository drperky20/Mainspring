# SDK

Use the SDK when embedding Mainspring in a local app, test harness, or product wrapper.

RunLog Fabric is the canonical runtime path for new code. The older `createMainspring`
factory remains available for mailbox-compatible SDK/gateway workflows while migration
continues.

## RunLog SDK Host

`createRunLogMainspring` writes `RunIntent` records into SQLite WAL RunLog storage,
drains them through `RunLogKernel`, and reads results through `RunLogProjection`.

```ts
import { EchoProvider, createRunLogMainspring } from 'mainspring'

const mainspring = createRunLogMainspring({
  rootPath: '.mainspring',
  provider: new EchoProvider(),
  agent: {
    agentId: 'agent_default',
    instructions: 'Answer briefly and use tools only when allowed.',
    capabilities: ['provider'],
  },
})

const run = mainspring.runs.start({
  input: 'Write a short status note.',
  sessionId: 'local-session',
})

await run.drainUntilIdle()

console.log(run.status())
console.log(run.result())
console.log(run.projection().events.map((event) => event.type))

mainspring.close()
```

For live providers, pass opaque credential refs into runs and provide a host-side
resolver. Store refs in RunLog, not raw secret values:

```ts
const mainspring = createRunLogMainspring({
  rootPath: '.mainspring',
  provider: openRouterProvider,
  secretResolver: (ref) =>
    ref.kind === 'managed' ? localSecretStore.get(ref.key) : process.env[ref.key],
  agent: {
    agentId: 'agent_default',
    instructions: 'Answer briefly.',
    providerId: 'openrouter',
    capabilities: ['provider'],
  },
})

const run = mainspring.runs.start({
  input: 'Use the configured provider.',
  credentialRef: 'managed:provider_profile_default',
})
```

Approval-required tools surface through the same projection:

```ts
const run = mainspring.runs.start({ input: 'Make the reviewed change.' })
await run.drainUntilIdle()

const pending = run.projection().pendingApprovals[0]

if (pending?.approvalId) {
  run.approve({ approvalId: pending.approvalId, actor: 'local-operator' })
  await run.drainUntilIdle()
}
```

This host does not add a second runtime spine. It uses:

```text
RunIntent -> RunLogKernel -> RunLogScheduler -> RunLogExecutor
-> AgentProvider.query -> ToolRegistry / RuntimePolicyGuard
-> RunLog events/checkpoints -> RunLogProjection
```

## Compatibility SDK Host

```ts
import { EchoProvider, createMainspring } from 'mainspring'

const mainspring = createMainspring({
  sessionsRoot: '.mainspring/sessions',
  workspaceRoot: '.mainspring/workspace',
  provider: new EchoProvider(),
  pollIntervalMs: 25,
})

await mainspring.start()

const session = mainspring.sessions.create()
const run = session.runs.start({
  input: 'Write a short status note.',
  allowedTools: [],
  mode: 'chat',
})

for await (const event of run.events()) {
  console.log(event.type, event.payload)
}

await mainspring.stop()
```

## Compatibility Approvals

```ts
const pending = mainspring.approvals.list()[0]

if (pending) {
  mainspring.approvals.approve({
    sessionId: pending.sessionId,
    runId: pending.runId,
    approvalId: pending.approvalId,
    reason: 'Approved by operator',
  })
}
```

## Compatibility Resumed Runs

`resumeRunId` queues a new turn onto an existing run ID. Use it only when the provider session is meant to continue and the runtime should rebuild structured replay context from the same run's mailbox history.

```ts
const followUp = session.runs.start({
  input: 'Continue from the previous tool result.',
  resumeRunId: run.record.runId,
  allowedTools: ['file.read'],
  mode: 'chat',
})
```

## Public Surfaces

This list mirrors the public `package.json` exports. `mainspring/compat` is a
temporary migration surface for legacy mailbox/runtime users, not the preferred
path for new runtime work.

- `mainspring`
- `mainspring/sdk`
- `mainspring/core`
- `mainspring/adapters`
- `mainspring/adapters/sqlite`
- `mainspring/adapters/local-blob`
- `mainspring/capabilities`
- `mainspring/hosts/runlog`
- `mainspring/compat`
- `mainspring/contracts`
- `mainspring/protocol`
- `mainspring/protocol/node`
- `mainspring/control`
- `mainspring/gateway`
- `mainspring/gateway/browser-safety`
- `mainspring/gateway/server`

Use the local gateway when you need clients, workspaces, agents, provider profiles, budgets, cron, marketplace, deployments, or console snapshots.

When `createLocalMainspringGateway` receives a `runLog` host, the HTTP server also
exposes explicit RunLog routes:

- `POST /runlog/runs/start`
- `GET /runlog/runs/:runId/events`
- `POST /runlog/approvals/:approvalId/resolve`

The default `/runs/start` route uses the RunLog host when the gateway is configured
with one, while gateways without a RunLog host remain mailbox-compatible. The route
keeps the compact compatibility dispatch DTO; RunLog-aware clients can use the
explicit `/runlog/...` routes for full projection data.
