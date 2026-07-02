import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalMainspringGateway,
  createLocalGatewayServer,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
  EchoProvider,
} from '../dist/index.js'

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function createCommandRunner(log) {
  return {
    run(input) {
      log.push(input)
      if (input.args.length === 0) {
        return { status: 0, stdout: `${input.command}\n`, stderr: '' }
      }
      if (input.command === 'npm' && input.args[0] === 'pack') {
        const outputIndex = input.args.indexOf('--pack-destination')
        const outputDir = outputIndex >= 0 ? input.args[outputIndex + 1] : input.cwd
        const tarballName = 'mainspring-0.1.0.tgz'
        const tarballPath = path.join(outputDir, tarballName)
        fs.mkdirSync(outputDir, { recursive: true })
        fs.writeFileSync(tarballPath, 'fake tarball', 'utf8')
        return {
          status: 0,
          stdout: JSON.stringify([{ filename: tarballName }]),
          stderr: '',
        }
      }
      return { status: 0, stdout: 'ok', stderr: '' }
    },
  }
}

async function main() {
  const root = makeTempRoot('mainspring-deploy-check-')
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
  const commandLog = []
  const gateway = createLocalMainspringGateway({
    runtime,
    appState,
    deployments: {
      repoRoot: process.cwd(),
      commandRunner: createCommandRunner(commandLog),
    },
  })
  const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

  await runtime.start()
  let started
  try {
    started = await server.start()
    const client = appState.clients.create({ clientId: 'client_deploy', name: 'Northline Dental' })
    const workspace = appState.workspaces.create({
      workspaceId: 'workspace_deploy',
      clientId: client.clientId,
      name: 'Northline Workspace',
      root: path.join(root, 'workspaces', 'northline'),
    })

    const target = gateway.deployments.createTarget({
      workspaceId: workspace.workspaceId,
      label: 'Northline staging VPS',
      kind: 'vps',
      metadata: {
        sshHost: 'deploy.example.com',
        sshUser: 'ubuntu',
        remoteRoot: '/srv/mainspring',
        serviceName: 'mainspring-northline',
        envFilePath: '/etc/mainspring/northline.env',
      },
    })

    const httpTargetResponse = await fetch(`${started.url}/deployment-targets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspace.workspaceId,
        label: 'Northline HTTP staging VPS',
        kind: 'vps',
        config: {
          sshHost: 'deploy-http.example.com',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/mainspring-http',
          serviceName: 'mainspring-http-northline',
          envFilePath: '/etc/mainspring/http-northline.env',
        },
      }),
    })
    if (httpTargetResponse.status !== 201) {
      throw new Error(`Deployment HTTP target create failed with ${httpTargetResponse.status}: ${await httpTargetResponse.text()}`)
    }
    const httpTarget = await httpTargetResponse.json()
    const serializedHttpTarget = JSON.stringify(httpTarget)
    if (
      !httpTarget?.deploymentTarget?.targetId ||
      httpTarget.deploymentTarget.executionMode !== 'vps-ssh' ||
      serializedHttpTarget.includes('/srv/mainspring-http') ||
      serializedHttpTarget.includes('/etc/mainspring') ||
      serializedHttpTarget.includes('secretRef') ||
      serializedHttpTarget.includes('workspaceRoot')
    ) {
      throw new Error(`Deployment HTTP target response was not browser-safe: ${serializedHttpTarget}`)
    }

    const plan = gateway.deployments.plan({
      targetId: target.targetId,
      operation: 'deploy',
    })
    if (!plan.releaseId || plan.steps.length < 4) {
      throw new Error('Deployment plan did not produce release metadata and steps.')
    }

    let guardFailed = false
    try {
      gateway.deployments.execute({
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'nope',
      })
    } catch (error) {
      guardFailed = String(error).includes('confirm="deploy"')
    }
    if (!guardFailed) {
      throw new Error('Deployment confirmation guard did not fail closed.')
    }

    const result = gateway.deployments.execute({
      targetId: target.targetId,
      operation: 'deploy',
      confirm: 'deploy',
    })
    if (!result.execution.ok || result.deploymentRun.status !== 'succeeded') {
      throw new Error('Deployment execute path did not succeed with the injected runner.')
    }
    if (!commandLog.some((entry) => entry.command === 'npm' && entry.args.includes('pack'))) {
      throw new Error('Deployment check did not exercise npm pack command generation.')
    }
    if (!commandLog.some((entry) => entry.command === 'ssh')) {
      throw new Error('Deployment check did not exercise ssh command generation.')
    }
    if (!commandLog.some((entry) => entry.command === 'scp')) {
      throw new Error('Deployment check did not exercise scp command generation.')
    }

    const unsupportedTarget = gateway.deployments.createTarget({
      workspaceId: workspace.workspaceId,
      label: 'Northline local placeholder',
      kind: 'local',
      metadata: { note: 'local deployment is not implemented' },
    })
    let unsupportedFailedClosed = false
    try {
      gateway.deployments.plan({
        targetId: unsupportedTarget.targetId,
        operation: 'deploy',
      })
    } catch (error) {
      unsupportedFailedClosed = String(error).includes('not implemented for target kind: local')
    }
    if (!unsupportedFailedClosed) {
      throw new Error('Deployment check did not prove unsupported target kinds fail closed.')
    }
    const unsupportedRuns = appState.deploymentRuns.list({ targetId: unsupportedTarget.targetId })
    if (unsupportedRuns.length !== 0) {
      throw new Error('Unsupported deployment target created deployment run records.')
    }

    console.log('MAINSPRING_DEPLOY_CHECK_OK')
  } finally {
    await server.stop()
    await runtime.stop()
    appState.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await main()
