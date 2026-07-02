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

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-marketplace-check-'))
  let appState
  let runtime
  let server
  try {
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    const installRoot = path.join(root, 'installed-template')
    appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    runtime = createMainspring({
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
    server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

    await runtime.start()
    const started = await server.start()

    const templates = await requestJson(`${started.url}/marketplace/templates`)
    assert(
      templates.templates?.some(
        (template) =>
          template.templateId === 'coding-agent'
          && template.trusted === true
          && template.provenance === 'repo-examples',
      ),
      'trusted coding-agent template was not listed through HTTP',
    )

    const installed = await requestJson(
      `${started.url}/marketplace/templates/${encodeURIComponent('coding-agent')}/install`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceRoot: installRoot }),
      },
    )

    assert(installed.template?.templateId === 'coding-agent', 'install response used the wrong template')
    assert(installed.client?.name === 'Coding Client', 'install did not create the default client')
    assert(installed.workspace?.workspaceId, 'install did not return a workspace id')
    assert(installed.workspace?.root === undefined, 'install response exposed the workspace root')
    assert(installed.agent?.name === 'Coding Agent', 'install did not create the default agent')
    assert(
      installed.template?.provenance === 'repo-examples',
      'install response did not preserve trusted template provenance',
    )
    assert(
      installed.template?.allowedTools?.includes('shell.exec'),
      'install response did not preserve allowed tool provenance',
    )
    assert(
      installed.agent?.metadata === undefined,
      'install response exposed raw agent metadata',
    )
    assert(
      installed.installedFiles?.join('|') === 'agent.config.json|policy.md|README.md|template-overview.md',
      `unexpected installed files: ${JSON.stringify(installed.installedFiles)}`,
    )
    assert(fs.existsSync(path.join(installRoot, 'agent.config.json')), 'agent config was not seeded')
    assert(fs.existsSync(path.join(installRoot, 'policy.md')), 'policy was not seeded')
    assert(fs.existsSync(path.join(installRoot, 'README.md')), 'workspace README was not seeded')
    assert(!fs.existsSync(path.join(installRoot, 'run.mjs')), 'marketplace install copied an executable example script')

    const clients = appState.clients.list()
    const workspaces = appState.workspaces.list()
    const agents = appState.agents.list()
    assert(clients.length === 1, `expected one client, got ${clients.length}`)
    assert(workspaces.length === 1, `expected one workspace, got ${workspaces.length}`)
    assert(workspaces[0].root === path.resolve(installRoot), 'install did not create the target workspace')
    assert(agents.length === 1, `expected one agent, got ${agents.length}`)
    assert(
      agents[0].metadata?.templateProvenance === 'repo-examples',
      'stored agent metadata did not preserve trusted template provenance',
    )
    assert(
      appState.auditEvents.list({ category: 'marketplace' }).some(
        (event) =>
          event.action === 'template.installed'
          && event.targetType === 'template'
          && event.targetId === 'coding-agent',
      ),
      'marketplace install audit event was not persisted',
    )

    const badRepoRoot = path.join(root, 'bad-repo')
    const badExampleRoot = path.join(badRepoRoot, 'examples', 'bad-template')
    fs.mkdirSync(badExampleRoot, { recursive: true })
    fs.writeFileSync(
      path.join(badRepoRoot, 'examples', 'templates.json'),
      JSON.stringify([
        {
          templateId: 'bad-template',
          label: 'Bad Template',
          description: 'Should fail because it tries to seed executable code.',
          exampleDir: 'bad-template',
          seedFiles: [{ source: 'run.mjs', destination: 'run.mjs' }],
          defaults: {
            clientName: 'Bad Client',
            workspaceName: 'Bad Workspace',
            agentName: 'Bad Agent',
            outcome: 'None',
            voice: 'None',
            instructions: 'None',
          },
        },
      ]),
    )
    fs.writeFileSync(
      path.join(badExampleRoot, 'agent.config.json'),
      JSON.stringify({ allowedTools: [] }),
    )
    fs.writeFileSync(path.join(badExampleRoot, 'run.mjs'), 'console.log("should not copy")')

    const badGateway = createLocalMainspringGateway({
      runtime,
      appState,
      marketplace: { repoRoot: badRepoRoot },
    })
    let rejectedExecutableTemplate = false
    try {
      badGateway.marketplace.listTemplates()
    } catch (error) {
      rejectedExecutableTemplate = error instanceof Error
        && error.message.includes('Unsafe template file extension')
    }
    assert(rejectedExecutableTemplate, 'marketplace catalog did not reject executable seed files')

    console.log('MAINSPRING_MARKETPLACE_CHECK_OK')
  } finally {
    if (server) await server.stop()
    if (runtime) await runtime.stop()
    appState?.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await main()
