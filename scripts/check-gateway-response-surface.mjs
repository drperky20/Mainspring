import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalGatewayServer,
  createLocalMainspringGateway,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
  EchoProvider,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const body = await response.json()
  assert(response.ok, `${init?.method ?? 'GET'} ${url} failed: ${JSON.stringify(body)}`)
  return body
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function assertNoBrowserLeak(label, value, extraForbidden = []) {
  const serialized = JSON.stringify(value)
  const forbidden = [
    'secretRef',
    'secretValue',
    'workspaceRoot',
    'sessionPath',
    'mailboxPath',
    'sessionsRoot',
    'gatewayToken',
    'artifactPath',
    'filePath',
    'databasePath',
    'dbPath',
    'OPENROUTER_API_KEY',
    'browser-surface-secret-sentinel',
    'E:/Mainspring/browser-surface-hidden',
    'C:\\\\browser-surface-hidden',
    '/srv/browser-surface-hidden',
    ...extraForbidden,
  ]
  for (const needle of forbidden) {
    assert(!serialized.includes(needle), `${label} leaked ${needle}: ${serialized}`)
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-surface-check-'))
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: new EchoProvider(),
    pollIntervalMs: 10,
  })
  const gateway = createLocalMainspringGateway({
    runtime,
    appState,
    marketplace: { repoRoot: process.cwd() },
  })
  const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

  await runtime.start()
  try {
    const started = await server.start()
    const health = await requestJson(`${started.url}/health`)
    assert(health.health?.ok === true, 'health response did not report ok=true')
    assertNoBrowserLeak('health response', health, [root.replaceAll('\\', '\\\\')])

    const clientWorkspaceRoot = path.join(root, 'workspace-client')
    const createdClient = await requestJson(`${started.url}/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Browser Surface Client workspaceRoot=E:/Mainspring/browser-surface-hidden',
        workspaceName: 'Browser Surface Workspace filePath=/srv/browser-surface-hidden/workspace.md',
        workspaceRoot: clientWorkspaceRoot,
      }),
    })
    assertNoBrowserLeak('client create response', createdClient, [root.replaceAll('\\', '\\\\')])
    assert(createdClient.client?.name?.includes('[redacted]'), 'client create response did not redact client name')
    assert(createdClient.workspace?.name?.includes('[redacted]'), 'client create response did not redact workspace name')

    const sessionId = createdClient.session.sessionId
    const workspaceId = createdClient.workspace.workspaceId

    const unsafeArtifactAccess = await fetch(`${started.url}/auth/browser-access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'artifact',
        artifactId: `artifact filePath=${path.join(root, 'browser-surface-hidden-artifact.txt')}`,
      }),
    })
    const unsafeArtifactAccessBody = await unsafeArtifactAccess.json()
    assert(unsafeArtifactAccess.status === 404, 'unsafe artifact identifier did not fail validation')
    assertNoBrowserLeak('unsafe artifact access error response', unsafeArtifactAccessBody, [
      root.replaceAll('\\', '\\\\'),
      'browser-surface-hidden-artifact.txt',
    ])

    const memoryPath = path.join(clientWorkspaceRoot, '.mainspring', 'memory.jsonl')
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
    fs.writeFileSync(memoryPath, `${JSON.stringify({
      entryId: 'memory_browser_surface',
      workspaceRoot: clientWorkspaceRoot,
      scope: 'workspace',
      text: 'Remember workspaceRoot=E:/Mainspring/browser-surface-hidden-memory filePath=/srv/browser-surface-hidden/memory.md',
      tags: ['browser-surface', 'artifactPath=C:/browser-surface-hidden/memory.md'],
      createdAt: '2026-07-10T00:00:00.000Z',
      metadata: { internalMemorySource: 'browser-surface-memory-private-sentinel' },
    })}\n`)
    const memoryHistory = await requestJson(
      `${started.url}/memory-history?workspaceId=${encodeURIComponent(workspaceId)}&limit=1`,
    )
    assert(
      memoryHistory.entries?.[0]?.entryId?.startsWith('memory_')
        && memoryHistory.entries?.[0]?.entryId !== 'memory_browser_surface',
      'memory history did not expose an opaque workspace memory row ID',
    )
    assert(memoryHistory.entries?.[0]?.metadata === undefined, 'memory history exposed memory metadata')
    assert(memoryHistory.entries?.[0]?.workspaceRoot === undefined, 'memory history exposed workspace root')
    assertNoBrowserLeak('memory history response', memoryHistory, [
      root.replaceAll('\\', '\\\\'),
      'browser-surface-memory-private-sentinel',
    ])

    const snapshot = await requestJson(`${started.url}/snapshot`)
    assert(snapshot.counts?.clients >= 1, 'snapshot response did not include client counts')
    assertNoBrowserLeak('snapshot response', snapshot, [root.replaceAll('\\', '\\\\')])

    const artifactPath = path.join(root, 'artifact-output', 'browser-surface-artifact.md')
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
    fs.writeFileSync(artifactPath, '# browser-safe artifact content\n')
    appState.artifacts.create({
      artifactId: 'artifact_browser_surface',
      runId: 'run_browser_surface_artifact',
      sessionId,
      workspaceId,
      kind: 'report artifactPath=C:/browser-surface-hidden/kind.md',
      label:
        'Browser Surface Artifact workspaceRoot=E:/Mainspring/browser-surface-hidden artifactPath=C:/browser-surface-hidden/report.md filePath=/srv/browser-surface-hidden/report.md',
      path: artifactPath,
      mediaType: 'text/markdown',
    })
    const artifactSnapshot = await requestJson(`${started.url}/snapshot`)
    const artifactSummary = artifactSnapshot.artifacts?.find(
      (artifact) => artifact.artifactId === 'artifact_browser_surface',
    )
    assert(artifactSummary, 'snapshot did not include browser surface artifact summary')
    assert(artifactSummary.label?.includes('[redacted]'), 'artifact snapshot label was not redacted')
    assert(artifactSummary.kind?.includes('[redacted]'), 'artifact snapshot kind was not redacted')
    assertNoBrowserLeak('artifact snapshot response', artifactSnapshot, [root.replaceAll('\\', '\\\\')])

    const artifactHistory = await requestJson(`${started.url}/artifact-history?limit=1`)
    assert(
      artifactHistory.artifacts?.[0]?.artifactId === 'artifact_browser_surface',
      'artifact history did not include artifact row',
    )
    assert(artifactHistory.artifacts?.[0]?.path === undefined, 'artifact history exposed artifact path')
    assert(artifactHistory.artifacts?.[0]?.metadata === undefined, 'artifact history exposed artifact metadata')
    assertNoBrowserLeak('artifact history response', artifactHistory, [root.replaceAll('\\', '\\\\')])

    const artifactAccess = await requestJson(`${started.url}/auth/browser-access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'artifact', artifactId: 'artifact_browser_surface' }),
    })
    const artifactResponse = await fetch(artifactAccess.url)
    const artifactContentDisposition = artifactResponse.headers.get('content-disposition') ?? ''
    const artifactContent = await artifactResponse.text()
    assert(artifactResponse.ok, `artifact browser access failed: ${artifactResponse.status}`)
    assert(artifactContent.includes('# browser-safe artifact content'), 'artifact content was not served')
    assert(
      artifactContentDisposition.includes('redacted'),
      `artifact content-disposition did not include redacted label: ${artifactContentDisposition}`,
    )
    for (const needle of [
      'workspaceRoot',
      'artifactPath',
      'filePath',
      'E:/Mainspring/browser-surface-hidden',
      'C:/browser-surface-hidden',
      '/srv/browser-surface-hidden',
    ]) {
      assert(
        !artifactContentDisposition.includes(needle),
        `artifact content-disposition leaked ${needle}: ${artifactContentDisposition}`,
      )
    }

    const sessions = await requestJson(`${started.url}/sessions`)
    assert(
      sessions.sessions?.some((session) => session.sessionId === sessionId),
      'sessions response did not include the created session',
    )
    assertNoBrowserLeak('sessions response', sessions, [root.replaceAll('\\', '\\\\')])

    const providerProfile = await requestJson(`${started.url}/provider-profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'openrouter',
        label: 'Browser Surface Provider workspaceRoot=E:/Mainspring/browser-surface-hidden-provider-label',
        secretValue: 'browser-surface-secret-sentinel',
        defaultModelId: 'openrouter/free filePath=/srv/browser-surface-hidden/provider-model.txt',
      }),
    })
    assert(
      providerProfile.providerProfile?.credentialState === 'configured',
      'provider profile response did not include configured credentialState',
    )
    assert(providerProfile.providerProfile?.secretRef === undefined, 'provider profile response exposed secretRef')
    assert(
      providerProfile.providerProfile?.label?.includes('[redacted]'),
      'provider profile response did not redact browser-unsafe label markers',
    )
    assert(
      providerProfile.providerProfile?.defaultModelId?.includes('[redacted]'),
      'provider profile response did not redact browser-unsafe default model markers',
    )
    assertNoBrowserLeak('provider profile create response', providerProfile, [root.replaceAll('\\', '\\\\')])

    const createdAgent = await requestJson(`${started.url}/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        name: 'Browser Surface Agent',
        instructions:
          'Use local files. workspaceRoot=E:/Mainspring/browser-surface-hidden filePath=/srv/browser-surface-hidden/agent.md',
        outcome: 'Summarize databasePath=/var/lib/mainspring/gateway.sqlite safely.',
        voice: 'Plain artifactPath=C:/browser-surface-hidden/agent.md',
        modelLabel: 'OpenRouter dbPath=/tmp/mainspring/agent.sqlite',
        skills: { 'File tools': true },
      }),
    })
    assert(createdAgent.agent?.agentId, 'agent create response did not include agent id')
    assert(createdAgent.agent?.instructions?.includes('[redacted]'), 'agent create response did not redact instructions')
    assertNoBrowserLeak('agent create response', createdAgent, [root.replaceAll('\\', '\\\\')])

    const cronStatus = await requestJson(`${started.url}/cron/status`)
    assert(typeof cronStatus.cron?.enabled === 'boolean', 'cron status did not include enabled flag')
    assertNoBrowserLeak('cron status response', cronStatus, [root.replaceAll('\\', '\\\\')])

    const budgetStatus = await requestJson(`${started.url}/budgets/status`)
    assert(Array.isArray(budgetStatus.budgetStatus?.evaluations), 'budget status did not include evaluations')
    assertNoBrowserLeak('budget status response', budgetStatus, [root.replaceAll('\\', '\\\\')])

    const createdBudget = await requestJson(`${started.url}/budgets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scopeType: 'workspace',
        scopeId: workspaceId,
        label: 'Browser budget workspaceRoot=E:/Mainspring/browser-surface-hidden',
        maxEstimatedCostUsd: 25,
        warnAtUsd: 20,
      }),
    })
    assert(createdBudget.budget?.label?.includes('[redacted]'), 'budget create response did not redact label')
    assertNoBrowserLeak('budget create response', createdBudget, [root.replaceAll('\\', '\\\\')])

    const usageStatus = await requestJson(`${started.url}/usage/status`)
    assert(usageStatus.usageStatus?.total?.scopeType === 'total', 'usage status did not include total rollup')
    assertNoBrowserLeak('usage status response', usageStatus, [root.replaceAll('\\', '\\\\')])

    appState.usageLedger.create({
      entryId: 'usage_browser_surface',
      runId: 'run_browser_surface_usage',
      sessionId,
      workspaceId,
      providerId: 'openrouter workspaceRoot=E:/Mainspring/browser-surface-hidden-provider',
      modelId: 'openrouter/free filePath=/srv/browser-surface-hidden/model.txt',
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      estimatedCostUsd: 0.001,
      metadata: { internalUsageSource: 'browser-surface-usage-private-sentinel' },
    })
    const usageHistory = await requestJson(`${started.url}/usage-history?limit=1`)
    assert(usageHistory.entries?.[0]?.entryId === 'usage_browser_surface', 'usage history did not include ledger entry')
    assert(usageHistory.entries?.[0]?.metadata === undefined, 'usage history exposed ledger metadata')
    assertNoBrowserLeak('usage history response', usageHistory, [
      root.replaceAll('\\', '\\\\'),
      'browser-surface-usage-private-sentinel',
    ])

    appState.auditEvents.create({
      eventId: 'audit_browser_surface',
      category: 'gateway artifactPath=C:/browser-surface-hidden/audit-category.json',
      action: 'client.updated workspaceRoot=E:/Mainspring/browser-surface-hidden-audit',
      actor: 'operator filePath=/srv/browser-surface-hidden/audit-actor.txt',
      targetType: 'client',
      targetId: 'client_browser_surface_audit',
      runId: 'run_browser_surface_audit',
      sessionId,
      metadata: { internalAuditContext: 'browser-surface-audit-private-sentinel' },
    })
    const auditHistory = await requestJson(`${started.url}/audit-history?limit=1`)
    assert(auditHistory.events?.[0]?.eventId === 'audit_browser_surface', 'audit history did not include audit event')
    assert(auditHistory.events?.[0]?.metadata === undefined, 'audit history exposed event metadata')
    assertNoBrowserLeak('audit history response', auditHistory, [
      root.replaceAll('\\', '\\\\'),
      'browser-surface-audit-private-sentinel',
    ])

    const cellStatus = await requestJson(`${started.url}/cells/status`)
    assert(typeof cellStatus.cellStatus?.enabled === 'boolean', 'cell status did not include enabled flag')
    assertNoBrowserLeak('cell status response', cellStatus, [root.replaceAll('\\', '\\\\')])

    const deploymentTarget = await requestJson(`${started.url}/deployment-targets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        label: 'Browser surface VPS remoteRoot=/srv/browser-surface-hidden-label',
        kind: 'vps',
        config: {
          sshHost: 'deploy.example.invalid',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/browser-surface-hidden',
          serviceName: 'mainspring-browser-surface',
          envFilePath: '/etc/browser-surface-hidden/mainspring.env',
          caddyConfigPath: '/etc/caddy/browser-surface-hidden.conf',
        },
      }),
    })
    assert(deploymentTarget.deploymentTarget?.targetId, 'deployment target response did not include target id')
    assert(
      deploymentTarget.deploymentTarget?.label?.includes('[redacted]'),
      'deployment target response did not redact browser-unsafe label markers',
    )
    assertNoBrowserLeak('deployment target response', deploymentTarget, [
      root.replaceAll('\\', '\\\\'),
      'remoteRoot',
      'envFilePath',
      'caddyConfigPath',
      '/etc/browser-surface-hidden',
    ])

    const deploymentPlan = await requestJson(
      `${started.url}/deployment-targets/${encodeURIComponent(deploymentTarget.deploymentTarget.targetId)}/plan`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'deploy' }),
      },
    )
    assert(deploymentPlan.deploymentPlan?.steps?.[0]?.commandPreview, 'deployment plan did not include commandPreview')
    assert(deploymentPlan.deploymentPlan.steps[0].command === undefined, 'deployment plan exposed raw command')
    assertNoBrowserLeak('deployment plan response', deploymentPlan, [
      root.replaceAll('\\', '\\\\'),
      'remoteRoot',
      'envFilePath',
      'caddyConfigPath',
      '/etc/browser-surface-hidden',
    ])

    const marketplaceTemplates = await requestJson(`${started.url}/marketplace/templates`)
    assert(
      marketplaceTemplates.templates?.some((template) => template.templateId === 'coding-agent'),
      'marketplace templates response did not include coding-agent',
    )
    const marketplaceTemplatesSerialized = JSON.stringify(marketplaceTemplates)
    assert(!marketplaceTemplatesSerialized.includes('defaults'), 'marketplace templates exposed defaults')
    assert(!marketplaceTemplatesSerialized.includes('seedFiles'), 'marketplace templates exposed seedFiles')
    assert(!marketplaceTemplatesSerialized.includes('exampleDir'), 'marketplace templates exposed exampleDir')
    assertNoBrowserLeak('marketplace templates response', marketplaceTemplates, [
      root.replaceAll('\\', '\\\\'),
      'workspaceRoot',
      'secretRef',
    ])

    const startedRun = await requestJson(`${started.url}/runs/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        workspaceId,
        input:
          'Do the browser surface check. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/browser-surface-hidden artifactPath=C:/browser-surface-hidden/artifact.md filePath=/srv/browser-surface-hidden/file.md databasePath=/var/lib/mainspring/gateway.sqlite dbPath=/tmp/mainspring/gateway.sqlite secretValue=browser-surface-secret-sentinel',
        mode: 'chat',
        allowedTools: [],
      }),
    })
    assert(startedRun.run?.runId, 'run start response did not include a run id')
    assert(startedRun.run?.input === undefined, 'run start response exposed raw input')
    assertNoBrowserLeak('run start response', startedRun)
    await waitFor(async () => {
      const runs = await requestJson(`${started.url}/runs?sessionId=${encodeURIComponent(sessionId)}`)
      return runs.runs?.find((run) => run.runId === startedRun.run.runId && run.status === 'completed')
    }, 'browser surface run completion')
    const runEvents = await requestJson(
      `${started.url}/runs/${encodeURIComponent(startedRun.run.runId)}/events?sessionId=${encodeURIComponent(sessionId)}&limit=100`,
    )
    assert(runEvents.events?.length > 0, 'run events response was empty')
    assertNoBrowserLeak('run events response', runEvents)

    const cronSchedule = await requestJson(`${started.url}/cron`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        workspaceId,
        label: 'Browser surface schedule workspaceRoot=E:/Mainspring/browser-surface-hidden-label',
        prompt:
          'Run later. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/Mainspring/browser-surface-hidden artifactPath=C:/browser-surface-hidden/cron.md filePath=/srv/browser-surface-hidden/cron.md databasePath=/var/lib/mainspring/gateway.sqlite dbPath=/tmp/mainspring/gateway.sqlite secretValue=browser-surface-secret-sentinel',
        cronExpr: '15 10 * * 1',
        allowedTools: ['file.read filePath=/srv/browser-surface-hidden/tool.txt'],
        enabled: false,
      }),
    })
    assert(
      cronSchedule.cronSchedule?.label?.includes('[redacted]'),
      'cron create did not redact browser-unsafe schedule label markers',
    )
    assert(
      cronSchedule.cronSchedule?.allowedTools?.[0]?.includes('[redacted]'),
      'cron create did not redact browser-unsafe allowed tool markers',
    )
    assert(cronSchedule.cronSchedule?.promptPreview, 'cron create did not return promptPreview')
    assert(cronSchedule.cronSchedule?.prompt === undefined, 'cron create exposed raw prompt')
    assertNoBrowserLeak('cron create response', cronSchedule)

    const cronRun = await requestJson(
      `${started.url}/cron/${encodeURIComponent(cronSchedule.cronSchedule.scheduleId)}/run-now`,
      { method: 'POST' },
    )
    assert(cronRun.run?.runId, 'cron run-now response did not include a run id')
    assert(cronRun.run?.input === undefined, 'cron run-now response exposed raw input')
    assertNoBrowserLeak('cron run-now response', cronRun)

    const marketplaceInstall = await requestJson(
      `${started.url}/marketplace/templates/${encodeURIComponent('coding-agent')}/install`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceRoot: path.join(root, 'marketplace-install'),
          clientName: 'Browser Surface Marketplace Client',
        }),
      },
    )
    assert(marketplaceInstall.template?.provenance === 'repo-examples', 'marketplace provenance missing')
    assert(marketplaceInstall.agent?.metadata === undefined, 'marketplace install exposed raw agent metadata')
    assert(marketplaceInstall.workspace?.root === undefined, 'marketplace install exposed workspace root')
    assertNoBrowserLeak('marketplace install response', marketplaceInstall, [root.replaceAll('\\', '\\\\')])

    console.log('MAINSPRING_GATEWAY_RESPONSE_SURFACE_CHECK_OK')
  } finally {
    await server.stop()
    await runtime.stop()
    appState.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await main()
