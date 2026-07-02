import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayDeploymentRunRecord,
  LocalGatewayDeploymentTargetRecord,
} from './AppStateStore.js'

export type LocalGatewayDeploymentOperation = 'deploy' | 'rollback' | 'destroy'

export interface LocalGatewayDeploymentPlanStep {
  phase: 'local' | 'remote'
  label: string
  command: string
}

export interface LocalGatewayDeploymentPlan {
  operation: LocalGatewayDeploymentOperation
  targetId: string
  targetLabel: string
  targetKind: LocalGatewayDeploymentTargetRecord['kind']
  summary: string
  prerequisites: string[]
  warnings: string[]
  steps: LocalGatewayDeploymentPlanStep[]
  releaseId?: string
  rollbackReleaseId?: string
}

export interface LocalGatewayDeploymentExecutionResult {
  deploymentRun: LocalGatewayDeploymentRunRecord
  plan: LocalGatewayDeploymentPlan
  execution: {
    ok: boolean
    exitCode: number
    startedAt: string
    completedAt: string
    detail: string
  }
}

export interface LocalGatewayDeploymentDependencies {
  repoRoot?: string
  commandRunner?: LocalGatewayDeploymentCommandRunner
}

export interface LocalGatewayDeploymentCommandRunner {
  run(input: {
    command: string
    args: string[]
    cwd?: string
  }): {
    status: number
    stdout: string
    stderr: string
    error?: Error
  }
}

const OptionalTrimmedString = z.string().optional().transform((value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
})

const VpsDeploymentConfigSchema = z.object({
  sshHost: z.string().trim().min(1),
  sshUser: z.string().trim().min(1),
  sshPort: z.union([z.number().int().min(1).max(65535), z.string().trim().min(1)]).optional().transform((value) => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }),
  remoteRoot: z.string().trim().min(1),
  serviceName: z.string().trim().min(1).regex(/^[A-Za-z0-9._-]+$/),
  envFilePath: OptionalTrimmedString,
  domain: OptionalTrimmedString,
  caddyConfigPath: OptionalTrimmedString,
})

interface VpsDeploymentConfig {
  sshHost: string
  sshUser: string
  sshPort?: number
  remoteRoot: string
  serviceName: string
  envFilePath: string
  domain?: string
  caddyConfigPath?: string
}

const defaultCommandRunner: LocalGatewayDeploymentCommandRunner = {
  run: ({ command, args, cwd }) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      ...(result.error instanceof Error ? { error: result.error } : {}),
    }
  },
}

export function planLocalGatewayDeployment(input: {
  appState: LocalGatewayAppStateStore
  targetId: string
  operation: LocalGatewayDeploymentOperation
}): LocalGatewayDeploymentPlan {
  const target = requireDeploymentTarget(input.appState, input.targetId)
  if (target.kind !== 'vps') {
    throw new Error(`Deployment planning is not implemented for target kind: ${target.kind}`)
  }
  const config = parseVpsDeploymentConfig(target)
  switch (input.operation) {
    case 'deploy':
      return buildDeployPlan(target, config)
    case 'rollback':
      return buildRollbackPlan(input.appState, target, config)
    case 'destroy':
      return buildDestroyPlan(target, config)
  }
}

export function executeLocalGatewayDeployment(input: {
  appState: LocalGatewayAppStateStore
  targetId: string
  operation: LocalGatewayDeploymentOperation
  confirm: string
  dependencies?: LocalGatewayDeploymentDependencies
}): LocalGatewayDeploymentExecutionResult {
  const normalizedConfirm = input.confirm.trim().toLowerCase()
  if (normalizedConfirm !== input.operation) {
    throw new Error(`Deployment execution requires confirm="${input.operation}".`)
  }

  const plan = planLocalGatewayDeployment({
    appState: input.appState,
    targetId: input.targetId,
    operation: input.operation,
  })
  const target = requireDeploymentTarget(input.appState, input.targetId)
  const config = parseVpsDeploymentConfig(target)
  const runner = input.dependencies?.commandRunner ?? defaultCommandRunner
  const repoRoot = path.resolve(input.dependencies?.repoRoot ?? process.cwd())
  const startedAt = new Date().toISOString()
  const deploymentRunId = `deployment_run_${Date.now().toString(36)}`

  let deploymentRun = input.appState.deploymentRuns.upsert({
    deploymentRunId,
    targetId: target.targetId,
    status: 'running',
    metadata: {
      operation: input.operation,
      planSummary: plan.summary,
      ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
      ...(plan.rollbackReleaseId ? { rollbackReleaseId: plan.rollbackReleaseId } : {}),
    },
  })

  try {
    switch (input.operation) {
      case 'deploy':
        executeDeploy({ runner, repoRoot, config, releaseId: plan.releaseId! })
        break
      case 'rollback':
        executeRollback({ runner, config, rollbackReleaseId: plan.rollbackReleaseId! })
        break
      case 'destroy':
        executeDestroy({ runner, config })
        break
    }
    deploymentRun = input.appState.deploymentRuns.upsert({
      deploymentRunId,
      targetId: target.targetId,
      status: 'succeeded',
      metadata: {
        operation: input.operation,
        planSummary: plan.summary,
        completedAt: new Date().toISOString(),
        ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
        ...(plan.rollbackReleaseId ? { rollbackReleaseId: plan.rollbackReleaseId } : {}),
      },
    })
    return {
      deploymentRun,
      plan,
      execution: {
        ok: true,
        exitCode: 0,
        startedAt,
        completedAt: deploymentRun.updatedAt,
        detail:
          input.operation === 'deploy'
            ? `Deployment completed for ${target.label}.`
            : input.operation === 'rollback'
              ? `Rollback completed for ${target.label}.`
              : `Destroy completed for ${target.label}.`,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment execution failed.'
    deploymentRun = input.appState.deploymentRuns.upsert({
      deploymentRunId,
      targetId: target.targetId,
      status: 'failed',
      metadata: {
        operation: input.operation,
        planSummary: plan.summary,
        error: message,
        ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
        ...(plan.rollbackReleaseId ? { rollbackReleaseId: plan.rollbackReleaseId } : {}),
      },
    })
    return {
      deploymentRun,
      plan,
      execution: {
        ok: false,
        exitCode: 1,
        startedAt,
        completedAt: deploymentRun.updatedAt,
        detail: message,
      },
    }
  }
}

function buildDeployPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: VpsDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const releaseId = `release-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
  const tarballPath = `${config.remoteRoot}/releases/${releaseId}.tgz`
  const releaseDir = `${config.remoteRoot}/releases/${releaseId}`
  const currentDir = `${config.remoteRoot}/current`
  return {
    operation: 'deploy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Package the current repo, upload it to ${config.sshUser}@${config.sshHost}, install runtime deps, and restart ${config.serviceName}.`,
    releaseId,
    prerequisites: [
      'Local host must have npm, ssh, and scp available on PATH.',
      `Remote host ${config.sshHost} must have Node.js, npm, systemd, and passwordless sudo for service updates.`,
      `Remote env file ${config.envFilePath} must exist with provider and MAINSPRING_* settings before first start.`,
      ...(config.domain ? ['Remote host should also have Caddy installed when domain routing is requested.'] : []),
    ],
    warnings: [
      'This operation executes remote commands over SSH.',
      'Provider secrets are not copied by this flow; it expects the remote env file to be managed separately.',
    ],
    steps: [
      {
        phase: 'local',
        label: 'Pack current package',
        command: 'npm pack --json --pack-destination <temp-dir>',
      },
      {
        phase: 'remote',
        label: 'Prepare remote directories',
        command: `ssh ${sshAuthority(config)} "mkdir -p ${shellQuote(config.remoteRoot)}/releases ${shellQuote(config.remoteRoot)}/shared"`,
      },
      {
        phase: 'local',
        label: 'Upload package tarball',
        command: `scp ${portFragment(config)}<tarball> ${scpAuthority(config)}:${shellQuote(tarballPath)}`,
      },
      {
        phase: 'remote',
        label: 'Install release and restart service',
        command: `ssh ${sshAuthority(config)} "bash -lc 'tar -xzf ${shellQuote(tarballPath)} -C ${shellQuote(releaseDir)} && cd ${shellQuote(`${releaseDir}/package`)} && npm install --omit=dev && ln -sfn ${shellQuote(`${releaseDir}/package`)} ${shellQuote(currentDir)} && sudo -n systemctl daemon-reload && sudo -n systemctl restart ${shellQuote(config.serviceName)}'"`,
      },
      ...(config.domain
        ? [{
            phase: 'remote' as const,
            label: 'Reload Caddy',
            command: `ssh ${sshAuthority(config)} "sudo -n systemctl reload caddy"`,
          }]
        : []),
    ],
  }
}

function buildRollbackPlan(
  appState: LocalGatewayAppStateStore,
  target: LocalGatewayDeploymentTargetRecord,
  config: VpsDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const succeededDeployments = appState.deploymentRuns
    .list({ targetId: target.targetId, status: 'succeeded' })
    .filter((run) => run.metadata && typeof run.metadata.releaseId === 'string')
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || right.deploymentRunId.localeCompare(left.deploymentRunId),
    )
  const uniqueReleaseIds = [...new Set(succeededDeployments.map((run) => String(run.metadata!.releaseId)))]
  if (uniqueReleaseIds.length < 2) {
    throw new Error(`Rollback requires at least two successful deployments for target ${target.targetId}.`)
  }
  const rollbackReleaseId = uniqueReleaseIds[1]
  return {
    operation: 'rollback',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Point ${config.serviceName} back to ${rollbackReleaseId} and restart the service.`,
    rollbackReleaseId,
    prerequisites: [
      'At least two successful deployment releases must exist for this target.',
      `Remote host ${config.sshHost} must be reachable over SSH with passwordless sudo.`,
    ],
    warnings: ['Rollback switches the active release symlink and restarts the remote service.'],
    steps: [
      {
        phase: 'remote',
        label: 'Switch current symlink',
        command: `ssh ${sshAuthority(config)} "ln -sfn ${shellQuote(`${config.remoteRoot}/releases/${rollbackReleaseId}/package`)} ${shellQuote(`${config.remoteRoot}/current`)}"`,
      },
      {
        phase: 'remote',
        label: 'Restart systemd service',
        command: `ssh ${sshAuthority(config)} "sudo -n systemctl restart ${shellQuote(config.serviceName)}"`,
      },
    ],
  }
}

function buildDestroyPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: VpsDeploymentConfig,
): LocalGatewayDeploymentPlan {
  return {
    operation: 'destroy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Disable ${config.serviceName}, remove its remote files under ${config.remoteRoot}, and optionally remove Caddy routing.`,
    prerequisites: [
      `Remote host ${config.sshHost} must be reachable over SSH with passwordless sudo.`,
    ],
    warnings: [
      'Destroy removes the remote deployment root recursively.',
      'The remote env file is left in place unless it lives under the deployment root.',
    ],
    steps: [
      {
        phase: 'remote',
        label: 'Disable service',
        command: `ssh ${sshAuthority(config)} "sudo -n systemctl disable --now ${shellQuote(config.serviceName)} || true"`,
      },
      {
        phase: 'remote',
        label: 'Remove service and deployment root',
        command: `ssh ${sshAuthority(config)} "sudo -n rm -f /etc/systemd/system/${shellQuote(`${config.serviceName}.service`)} && sudo -n rm -rf ${shellQuote(config.remoteRoot)}"`,
      },
      ...(config.domain || config.caddyConfigPath
        ? [{
            phase: 'remote' as const,
            label: 'Remove Caddy route',
            command: `ssh ${sshAuthority(config)} "sudo -n rm -f ${shellQuote(config.caddyConfigPath ?? `/etc/caddy/${config.serviceName}.conf`)} && sudo -n systemctl reload caddy"`,
          }]
        : []),
    ],
  }
}

function executeDeploy(input: {
  runner: LocalGatewayDeploymentCommandRunner
  repoRoot: string
  config: VpsDeploymentConfig
  releaseId: string
}): void {
  assertLocalCommand(input.runner, 'npm')
  assertLocalCommand(input.runner, 'ssh')
  assertLocalCommand(input.runner, 'scp')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-deploy-'))
  try {
    const packResult = input.runner.run({
      command: 'npm',
      args: ['pack', '--json', '--pack-destination', tempRoot],
      cwd: input.repoRoot,
    })
    if (packResult.status !== 0) {
      throw new Error(`npm pack failed: ${stderrPreview(packResult.stderr)}`)
    }
    const packPayload = JSON.parse(packResult.stdout) as Array<{ filename?: string }>
    const tarballName = packPayload[0]?.filename
    if (!tarballName) throw new Error('npm pack did not report a tarball filename.')
    const localTarball = path.join(tempRoot, tarballName)
    const remoteTarball = `${input.config.remoteRoot}/releases/${input.releaseId}.tgz`
    const remoteReleaseDir = `${input.config.remoteRoot}/releases/${input.releaseId}`
    const remoteCurrentDir = `${input.config.remoteRoot}/current`

    runSsh(input.runner, input.config, [
      'set -euo pipefail',
      'command -v node >/dev/null 2>&1',
      'command -v npm >/dev/null 2>&1',
      'command -v systemctl >/dev/null 2>&1',
      'sudo -n true',
      `mkdir -p ${shellQuote(`${input.config.remoteRoot}/releases`)}`,
      `mkdir -p ${shellQuote(`${input.config.remoteRoot}/shared`)}`,
    ].join(' && '), 'remote preflight failed')

    const scpResult = input.runner.run({
      command: 'scp',
      args: [
        ...scpPortArgs(input.config),
        localTarball,
        `${scpAuthority(input.config)}:${remoteTarball}`,
      ],
    })
    if (scpResult.status !== 0) {
      throw new Error(`scp upload failed: ${stderrPreview(scpResult.stderr)}`)
    }

    const systemdUnit = [
      '[Unit]',
      `Description=Mainspring ${input.config.serviceName}`,
      'After=network-online.target',
      'Wants=network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `EnvironmentFile=${input.config.envFilePath}`,
      `WorkingDirectory=${remoteCurrentDir}`,
      `ExecStart=/usr/bin/env node ${remoteCurrentDir}/dist/runner/main.js`,
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      '',
    ].join('\n')
    const remoteCommands = [
      'set -euo pipefail',
      `rm -rf ${shellQuote(remoteReleaseDir)}`,
      `mkdir -p ${shellQuote(remoteReleaseDir)}`,
      `tar -xzf ${shellQuote(remoteTarball)} -C ${shellQuote(remoteReleaseDir)}`,
      `cd ${shellQuote(`${remoteReleaseDir}/package`)}`,
      'npm install --omit=dev',
      `ln -sfn ${shellQuote(`${remoteReleaseDir}/package`)} ${shellQuote(remoteCurrentDir)}`,
      `cat <<'EOF' | sudo -n tee /etc/systemd/system/${input.config.serviceName}.service >/dev/null`,
      systemdUnit,
      'EOF',
      'sudo -n systemctl daemon-reload',
      `sudo -n systemctl enable --now ${shellQuote(input.config.serviceName)}`,
    ]
    if (input.config.domain) {
      const caddyPath = input.config.caddyConfigPath ?? `/etc/caddy/${input.config.serviceName}.conf`
      const caddyConfig = [
        `${input.config.domain} {`,
        `  reverse_proxy 127.0.0.1:3000`,
        '}',
        '',
      ].join('\n')
      remoteCommands.push(
        'command -v caddy >/dev/null 2>&1',
        `cat <<'EOF' | sudo -n tee ${shellQuote(caddyPath)} >/dev/null`,
        caddyConfig,
        'EOF',
        'sudo -n systemctl reload caddy',
      )
    }
    runSsh(input.runner, input.config, remoteCommands.join('\n'), 'remote deploy failed')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function executeRollback(input: {
  runner: LocalGatewayDeploymentCommandRunner
  config: VpsDeploymentConfig
  rollbackReleaseId: string
}): void {
  assertLocalCommand(input.runner, 'ssh')
  runSsh(
    input.runner,
    input.config,
    [
      'set -euo pipefail',
      `ln -sfn ${shellQuote(`${input.config.remoteRoot}/releases/${input.rollbackReleaseId}/package`)} ${shellQuote(`${input.config.remoteRoot}/current`)}`,
      `sudo -n systemctl restart ${shellQuote(input.config.serviceName)}`,
    ].join('\n'),
    'remote rollback failed',
  )
}

function executeDestroy(input: {
  runner: LocalGatewayDeploymentCommandRunner
  config: VpsDeploymentConfig
}): void {
  assertLocalCommand(input.runner, 'ssh')
  const commands = [
    'set -euo pipefail',
    `sudo -n systemctl disable --now ${shellQuote(input.config.serviceName)} || true`,
    `sudo -n rm -f /etc/systemd/system/${shellQuote(`${input.config.serviceName}.service`)}`,
    'sudo -n systemctl daemon-reload',
    `sudo -n rm -rf ${shellQuote(input.config.remoteRoot)}`,
  ]
  if (input.config.domain || input.config.caddyConfigPath) {
    commands.push(
      `sudo -n rm -f ${shellQuote(input.config.caddyConfigPath ?? `/etc/caddy/${input.config.serviceName}.conf`)}`,
      'sudo -n systemctl reload caddy || true',
    )
  }
  runSsh(input.runner, input.config, commands.join('\n'), 'remote destroy failed')
}

function runSsh(
  runner: LocalGatewayDeploymentCommandRunner,
  config: VpsDeploymentConfig,
  script: string,
  failurePrefix: string,
): void {
  const result = runner.run({
    command: 'ssh',
    args: [
      ...sshPortArgs(config),
      `${config.sshUser}@${config.sshHost}`,
      'bash',
      '-lc',
      script,
    ],
  })
  if (result.status !== 0) {
    throw new Error(`${failurePrefix}: ${stderrPreview(result.stderr || result.stdout)}`)
  }
}

function assertLocalCommand(
  runner: LocalGatewayDeploymentCommandRunner,
  command: string,
): void {
  const result = runner.run({ command, args: [] })
  if (result.error || unavailableCommandOutput(result)) {
    throw new Error(`Required local command is unavailable: ${command}`)
  }
}

function unavailableCommandOutput(result: {
  status: number
  stdout: string
  stderr: string
  error?: Error
}): boolean {
  if (result.error) return true
  const stderr = `${result.stderr}\n${result.stdout}`
  return /not recognized|no such file|not found/i.test(stderr)
}

function requireDeploymentTarget(
  appState: LocalGatewayAppStateStore,
  targetId: string,
): LocalGatewayDeploymentTargetRecord {
  const target = appState.deploymentTargets.get(targetId)
  if (!target) throw new Error(`Unknown deployment target: ${targetId}`)
  if (target.status !== 'active') {
    throw new Error(`Deployment target ${targetId} is not active.`)
  }
  return target
}

function parseVpsDeploymentConfig(target: LocalGatewayDeploymentTargetRecord): VpsDeploymentConfig {
  const parsed = VpsDeploymentConfigSchema.safeParse(target.metadata ?? {})
  if (!parsed.success) {
    throw new Error(`Deployment target ${target.targetId} is missing required VPS config.`)
  }
  return {
    ...parsed.data,
    envFilePath:
      parsed.data.envFilePath ?? `/etc/mainspring/${parsed.data.serviceName}.env`,
  }
}

function stderrPreview(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 280) || 'no stderr output'
}

function sshAuthority(config: VpsDeploymentConfig): string {
  return `${config.sshUser}@${config.sshHost}${config.sshPort ? ` -p ${config.sshPort}` : ''}`
}

function scpAuthority(config: VpsDeploymentConfig): string {
  return `${config.sshUser}@${config.sshHost}`
}

function sshPortArgs(config: VpsDeploymentConfig): string[] {
  return config.sshPort ? ['-p', String(config.sshPort)] : []
}

function scpPortArgs(config: VpsDeploymentConfig): string[] {
  return config.sshPort ? ['-P', String(config.sshPort)] : []
}

function portFragment(config: VpsDeploymentConfig): string {
  return config.sshPort ? `-P ${config.sshPort} ` : ''
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
