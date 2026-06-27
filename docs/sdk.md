# SDK

The SDK is embedded in the `mainspring` package. It runs the local runtime loop, stores sessions and events through the SQLite mailbox, and exposes approvals, monitoring, and run streams.

```ts
import { EchoProvider, createMainspring } from 'mainspring'

const mainspring = createMainspring({
  sessionsRoot: '.mainspring/sessions',
  workspaceRoot: '.mainspring/workspace',
  provider: new EchoProvider(),
  pollIntervalMs: 25,
})

await mainspring.start()

const session = mainspring.sessions.create({
  metadata: { client: 'demo-client' },
})

const run = session.runs.start({
  input: 'Draft a refund reply for this customer.',
  allowedTools: [],
  mode: 'chat',
})

for await (const event of run.events()) {
  console.log(event.type, event.payload)
}

await mainspring.stop()
```

## Approvals

Dangerous tools can pause for approval. The SDK exposes pending approvals from the event journal:

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

## Public API

New integrations should import:

- `createMainspring`
- `Mainspring`
- `MAINSPRING_RUNTIME_IDENTITY`
- `RuntimeKernel`
- `ToolRegistry`
- `RuntimePolicyGuard`
- `createFileTools`
- `createShellTool`
- `createWebTools`
- `createMemoryTools`

The SDK is the recommended local embedding surface. Hosted products can use the same contracts from `mainspring/protocol` and `mainspring/control` when they run Mainspring inside remote sandboxes or workers.
