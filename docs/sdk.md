# SDK

Use the SDK when embedding Mainspring in a local app, test harness, or product wrapper.

## Minimal Run

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

## Approvals

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

## Resumed Runs

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

- `mainspring`
- `mainspring/sdk`
- `mainspring/contracts`
- `mainspring/protocol`
- `mainspring/protocol/node`
- `mainspring/control`
- `mainspring/gateway`
- `mainspring/gateway/server`

Use the local gateway when you need clients, workspaces, agents, provider profiles, budgets, cron, marketplace, deployments, or console snapshots.
