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

function createCommandRunner(log, kubernetesManifests) {
  return {
    run(input) {
      log.push(input)
      const manifestIndex = input.command === 'kubectl' ? input.args.indexOf('-f') : -1
      if (manifestIndex >= 0) {
        kubernetesManifests.push(JSON.parse(fs.readFileSync(input.args[manifestIndex + 1], 'utf8')))
      }
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
      if (input.command === 'kubectl' && input.args.includes('secret')) {
        return {
          status: 0,
          stdout: 'MAINSPRING_GATEWAY_BOOTSTRAP_USERNAME\nMAINSPRING_GATEWAY_BOOTSTRAP_PASSWORD\nMAINSPRING_RUNLOG_APPROVAL_KEY\nMAINSPRING_PROVIDER\nMAINSPRING_MODEL\nOPENROUTER_API_KEY\n',
          stderr: '',
        }
      }
      if (input.command === 'kubectl' && input.args.includes('config')) {
        return { status: 0, stdout: 'https://kubernetes.example.com', stderr: '' }
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
  const kubernetesManifests = []
  const gateway = createLocalMainspringGateway({
    runtime,
    appState,
    deployments: {
      repoRoot: process.cwd(),
      commandRunner: createCommandRunner(commandLog, kubernetesManifests),
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

    const localTarget = gateway.deployments.createTarget({
      workspaceId: workspace.workspaceId,
      label: 'Northline local deployment',
      kind: 'local',
      metadata: { root: path.join(root, 'local-deployment'), allowDestroy: true },
    })
    const localPlan = gateway.deployments.plan({
      targetId: localTarget.targetId,
      operation: 'deploy',
    })
    if (localPlan.targetKind !== 'local' || localPlan.steps.length < 2) {
      throw new Error('Deployment check did not produce a local deployment plan.')
    }
    const localResult = gateway.deployments.execute({
      targetId: localTarget.targetId,
      operation: 'deploy',
      confirm: 'deploy',
    })
    if (!localResult.execution.ok || localResult.deploymentRun.status !== 'succeeded') {
      throw new Error('Local deployment driver did not succeed with the injected runner.')
    }
    if (!fs.existsSync(path.join(root, 'local-deployment', 'current-release.json'))) {
      throw new Error('Local deployment driver did not write the current release marker.')
    }

    const containerTarget = gateway.deployments.createTarget({
      workspaceId: workspace.workspaceId,
      label: 'Northline container deployment',
      kind: 'container',
      metadata: {
        image: 'mainspring/northline',
        containerName: 'mainspring-northline-check',
        runArgs: ['--network', 'none'],
      },
    })
    const containerResult = gateway.deployments.execute({
      targetId: containerTarget.targetId,
      operation: 'deploy',
      confirm: 'deploy',
    })
    if (!containerResult.execution.ok || containerResult.deploymentRun.status !== 'succeeded') {
      throw new Error('Container deployment driver did not succeed with the injected runner.')
    }
    if (!commandLog.some((entry) => entry.command === 'docker' && entry.args.includes('build'))) {
      throw new Error('Deployment check did not exercise docker build command generation.')
    }
    if (!commandLog.some((entry) => entry.command === 'docker' && entry.args.includes('run'))) {
      throw new Error('Deployment check did not exercise docker run command generation.')
    }

    const kubernetesTarget = gateway.deployments.createTarget({
      workspaceId: workspace.workspaceId,
      label: 'Northline Kubernetes gateway',
      kind: 'kubernetes',
      metadata: {
        context: 'northline-prod',
        expectedClusterServer: 'https://kubernetes.example.com',
        namespace: 'mainspring',
        deploymentName: 'mainspring-gateway',
        imageRepository: 'registry.example.com/northline/mainspring-gateway',
        secretName: 'mainspring-gateway-secrets',
        storageClaimName: 'mainspring-gateway-data',
        allowDestroy: true,
      },
    })
    const kubernetesResult = gateway.deployments.execute({
      targetId: kubernetesTarget.targetId,
      operation: 'deploy',
      confirm: 'deploy',
    })
    if (!kubernetesResult.execution.ok || kubernetesResult.deploymentRun.status !== 'succeeded') {
      throw new Error('Kubernetes deployment driver did not succeed with the injected runner.')
    }
    if (!commandLog.some((entry) => entry.command === 'kubectl' && entry.args.includes('apply'))) {
      throw new Error('Deployment check did not exercise kubectl server-side apply.')
    }
    if (!commandLog.some((entry) => entry.command === 'kubectl' && entry.args.includes('rollout'))) {
      throw new Error('Deployment check did not exercise kubectl rollout status.')
    }
    const kubernetesManifest = kubernetesManifests[0]
    const kubernetesDeployment = kubernetesManifest?.items?.find((item) => item.kind === 'Deployment')
    if (
      kubernetesDeployment?.spec?.replicas !== 1
      || kubernetesDeployment?.spec?.template?.spec?.automountServiceAccountToken !== false
      || kubernetesDeployment?.spec?.template?.spec?.securityContext?.runAsNonRoot !== true
      || kubernetesDeployment?.spec?.template?.spec?.containers?.[0]?.securityContext?.readOnlyRootFilesystem !== true
    ) {
      throw new Error('Generated Kubernetes manifest omitted required workload hardening.')
    }
    const serializedKubernetesManifest = JSON.stringify(kubernetesManifest)
    if (serializedKubernetesManifest.includes('MAINSPRING_RUNLOG_APPROVAL_KEY":"')) {
      throw new Error('Generated Kubernetes manifest embedded approval key material.')
    }
    const kubernetesDestroy = gateway.deployments.execute({
      targetId: kubernetesTarget.targetId,
      operation: 'destroy',
      confirm: 'destroy',
    })
    if (!kubernetesDestroy.execution.ok) throw new Error('Kubernetes destroy did not succeed.')
    const deleteCommand = commandLog.find((entry) => entry.command === 'kubectl' && entry.args.includes('delete'))
    if (!deleteCommand || deleteCommand.args.some((arg) => arg.startsWith('pvc/') || arg.startsWith('secret/'))) {
      throw new Error('Kubernetes destroy did not preserve PVC and Secret resources.')
    }

    let unsupportedFailedClosed = false
    try {
      gateway.deployments.createTarget({
        workspaceId: workspace.workspaceId,
        label: 'Northline unregistered deployment',
        kind: 'fly',
      })
    } catch (error) {
      unsupportedFailedClosed = String(error).includes('Unknown deployment target kind: fly')
    }
    if (!unsupportedFailedClosed) {
      throw new Error('Deployment check did not prove unregistered target kinds fail closed.')
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
