import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createApprovalReceipt,
  createLocalGatewayServer,
  createFileReadTool,
  createLocalMainspringGateway,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
  createShellTool,
  EchoProvider,
  MainspringMailbox,
  RuntimePolicyGuard,
  ToolRegistry,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function approvalFor(input) {
  return createApprovalReceipt({
    approvalId: 'ap_budget_check_1',
    runId: 'run_budget_check',
    targetKey: 'shell.exec',
    toolInput: input,
  })
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-budget-policy-check-'))

try {
  fs.writeFileSync(path.join(root, 'notes.txt'), 'BUDGET_READ_OK')
  const events = []
  const registry = new ToolRegistry({
    runId: 'run_budget_check',
    sessionId: 'session_budget_check',
    workspaceRoot: root,
    policy: RuntimePolicyGuard.defaultPolicy({
      approvalPolicy: 'balanced',
      allowedTools: ['file.read', 'shell.exec'],
      budget: {
        status: 'warn',
        budgetId: 'budget_check_warn',
        label: 'Budget check',
        costSensitiveTools: {
          mode: 'approval',
          reason: 'Budget check requires review for cost-sensitive tools',
        },
      },
    }),
    emitEvent: (event) => events.push(event),
  })
  registry.register(createFileReadTool())
  registry.register(createShellTool())

  const read = await registry.execute({ key: 'file.read', input: { path: 'notes.txt' } })
  assert(read.status === 'completed', `expected file.read completion, got ${read.status}`)
  assert(read.output?.text === 'BUDGET_READ_OK', 'file.read did not return expected workspace content')

  const shellInput = {
    command: 'node -e "process.stdout.write(\'SHOULD_WAIT_FOR_BUDGET_APPROVAL\')"',
    maxOutputBytes: 1024,
    timeoutMs: 5_000,
  }
  const approval = await registry.execute({ key: 'shell.exec', input: shellInput })
  assert(approval.status === 'approval_required', `expected shell approval, got ${approval.status}`)
  assert(
    approval.approval.reasons.includes('Budget check requires review for cost-sensitive tools'),
    'approval did not include budget review reason',
  )
  assert(events.some((event) => event.type === 'approval.requested'), 'approval event was not emitted')

  const blockingRegistry = new ToolRegistry({
    runId: 'run_budget_check',
    sessionId: 'session_budget_check',
    workspaceRoot: root,
    policy: RuntimePolicyGuard.defaultPolicy({
      approvalPolicy: 'balanced',
      allowedTools: ['shell.exec'],
      budget: {
        status: 'warn',
        budgetId: 'budget_check_block',
        label: 'Budget check',
        costSensitiveTools: {
          mode: 'block',
          reason: 'Budget check blocks cost-sensitive tools',
        },
      },
    }),
  })
  blockingRegistry.register(createShellTool())
  const blocked = await blockingRegistry.execute({
    key: 'shell.exec',
    input: shellInput,
    approvalReceipt: approvalFor(shellInput),
  })
  assert(blocked.status === 'policy_blocked', `expected budget block, got ${blocked.status}`)
  assert(
    blocked.reasons.includes('Budget check blocks cost-sensitive tools'),
    'blocked result did not include budget block reason',
  )

  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  const mainspring = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: new EchoProvider(),
    pollIntervalMs: 10,
  })
  try {
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })
    let started
    const client = appState.clients.create({ clientId: 'client_budget_check', name: 'Budget Check Client' })
    const workspace = appState.workspaces.create({
      workspaceId: 'workspace_budget_check',
      clientId: client.clientId,
      name: 'Budget Check Workspace',
      root: workspaceRoot,
    })
    const session = mainspring.sessions.create({
      sessionId: 'session_budget_unpriced_check',
      workspace: { root: workspaceRoot },
      metadata: {
        clientId: client.clientId,
        workspaceId: workspace.workspaceId,
      },
    })
    const budget = gateway.budgets.create({
      scopeType: 'workspace',
      scopeId: workspace.workspaceId,
      label: 'Budget check workspace budget',
      maxEstimatedCostUsd: 1,
      warnAtUsd: 0.5,
    })
    appState.runs.upsert({
      runId: 'run_budget_unpriced_prior',
      sessionId: session.record.sessionId,
      workspaceId: workspace.workspaceId,
    })
    appState.usageLedger.create({
      entryId: 'usage_budget_unpriced_prior',
      runId: 'run_budget_unpriced_prior',
      sessionId: session.record.sessionId,
      workspaceId: workspace.workspaceId,
    })

    try {
      started = await server.start()
      const httpBudgetResponse = await fetch(`${started.url}/budgets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scopeType: 'workspace',
          scopeId: workspace.workspaceId,
          label: 'Budget check HTTP budget',
          maxEstimatedCostUsd: 2,
          warnAtUsd: 1,
        }),
      })
      if (httpBudgetResponse.status !== 201) {
        throw new Error(`Budget HTTP create failed with ${httpBudgetResponse.status}: ${await httpBudgetResponse.text()}`)
      }
      const httpBudget = await httpBudgetResponse.json()
      const serializedHttpBudget = JSON.stringify(httpBudget)
      if (
        !httpBudget?.budget?.budgetId ||
        serializedHttpBudget.includes('secretRef') ||
        serializedHttpBudget.includes('workspaceRoot') ||
        serializedHttpBudget.includes('"metadata"') ||
        serializedHttpBudget.includes('"root"')
      ) {
        throw new Error(`Budget HTTP create response was not browser-safe: ${serializedHttpBudget}`)
      }
    } finally {
      await server.stop()
    }

    const evaluation = gateway.budgets.status().evaluations.find((entry) => entry.budgetId === budget.budgetId)
    assert(evaluation?.budgetId === budget.budgetId, 'budget status did not include the workspace budget')
    assert(evaluation.status === 'warn', `expected unpriced budget warning, got ${evaluation.status}`)
    assert(evaluation.estimateCoverage === 'incomplete', 'unpriced budget did not report incomplete estimate coverage')
    assert(evaluation.unpricedUsageEntryCount === 1, 'unpriced budget did not count the unpriced usage row')
    assert(evaluation.usedEstimatedCostUsd === 0, 'unpriced budget invented an estimated dollar value')

    let unacknowledgedBlocked = false
    try {
      gateway.runs.start({
        sessionId: session.record.sessionId,
        input: 'Start without acknowledging unpriced budget usage.',
        mode: 'chat',
        allowedTools: ['file.read'],
        workspaceId: workspace.workspaceId,
      })
    } catch (error) {
      unacknowledgedBlocked = error instanceof Error
        && error.message.includes('Run requires budget warning acknowledgement')
    }
    assert(unacknowledgedBlocked, 'unpriced budget warning did not require acknowledgement before enqueue')

    const run = gateway.runs.start({
      sessionId: session.record.sessionId,
      input: 'Start after acknowledging unpriced budget usage.',
      mode: 'chat',
      allowedTools: ['file.read'],
      workspaceId: workspace.workspaceId,
      allowBudgetWarning: true,
    })
    const pending = MainspringMailbox.fromSessionPath(session.record.sessionPath).readPending(10)
    const dispatch = pending.find((message) => message.runId === run.runId)?.dispatch
    assert(dispatch?.success, 'acknowledged unpriced budget run was not enqueued through the mailbox')
    assert(
      dispatch.data.policy.budget?.costSensitiveTools?.reason.includes('unpriced usage'),
      'mailbox budget policy did not preserve the unpriced usage review reason',
    )
  } finally {
    appState.close()
    await mainspring.stop()
  }

  console.log('MAINSPRING_BUDGET_POLICY_CHECK_OK')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
