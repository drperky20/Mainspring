import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import { redactRuntimeSensitiveText } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayDeploymentRunRecord,
  LocalGatewayDeploymentTargetRecord,
} from './AppStateStore.js'
import { kubernetesDeploymentDriver } from './KubernetesDeploymentDriver.js'

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
  drivers?: DeploymentDriverRegistry | readonly DeploymentDriver[]
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

export interface LocalGatewayDeploymentTargetSupport {
  executionSupported: boolean
  executionMode: string
  executionUnavailableReason?: string
}

export interface DeploymentDriverPlanInput {
  appState: LocalGatewayAppStateStore
  target: LocalGatewayDeploymentTargetRecord
  operation: LocalGatewayDeploymentOperation
  repoRoot: string
}

export interface DeploymentDriverExecuteInput extends DeploymentDriverPlanInput {
  plan: LocalGatewayDeploymentPlan
  runner: LocalGatewayDeploymentCommandRunner
}

export interface DeploymentDriver {
  kind: string
  executionMode: string
  support?(target: LocalGatewayDeploymentTargetRecord): LocalGatewayDeploymentTargetSupport
  validateTarget?(target: LocalGatewayDeploymentTargetRecord): void
  plan(input: DeploymentDriverPlanInput): LocalGatewayDeploymentPlan
  execute(input: DeploymentDriverExecuteInput): void
}

const DEPLOYMENT_KIND_PATTERN = /^[A-Za-z0-9_.:-]+$/

export function assertSafeDeploymentTargetKind(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > 128 || !DEPLOYMENT_KIND_PATTERN.test(trimmed)) {
    throw new Error('Deployment target kind must use only letters, numbers, dot, underscore, colon, or dash.')
  }
  return trimmed
}

export class DeploymentDriverRegistry {
  private readonly drivers = new Map<string, DeploymentDriver>()

  register(driver: DeploymentDriver): this {
    const kind = assertSafeDeploymentTargetKind(driver.kind)
    this.drivers.set(kind, { ...driver, kind })
    return this
  }

  get(kind: string): DeploymentDriver | undefined {
    return this.drivers.get(assertSafeDeploymentTargetKind(kind))
  }

  require(kind: string): DeploymentDriver {
    const safeKind = assertSafeDeploymentTargetKind(kind)
    const driver = this.drivers.get(safeKind)
    if (!driver) throw new Error(`Unknown deployment target kind: ${safeKind}`)
    return driver
  }

  targetSupport(target: LocalGatewayDeploymentTargetRecord): LocalGatewayDeploymentTargetSupport {
    const safeKind = assertSafeDeploymentTargetKind(target.kind)
    const driver = this.drivers.get(safeKind)
    if (!driver) {
      return {
        executionSupported: false,
        executionMode: 'metadata-only',
        executionUnavailableReason: `No deployment driver is registered for target kind: ${safeKind}.`,
      }
    }
    return driver.support?.(target) ?? {
      executionSupported: true,
      executionMode: driver.executionMode,
    }
  }

  validateTarget(target: LocalGatewayDeploymentTargetRecord): void {
    const driver = this.require(target.kind)
    driver.validateTarget?.(target)
  }

  kinds(): string[] {
    return [...this.drivers.keys()]
  }
}

let defaultDeploymentDriverRegistry: DeploymentDriverRegistry | null = null

export function createDefaultDeploymentDriverRegistry(
  extraDrivers: readonly DeploymentDriver[] = [],
): DeploymentDriverRegistry {
  const registry = new DeploymentDriverRegistry()
    .register(vpsSshDeploymentDriver)
    .register(localDeploymentDriver)
    .register(containerDeploymentDriver)
    .register(kubernetesDeploymentDriver)
  for (const driver of extraDrivers) registry.register(driver)
  return registry
}

export function getDefaultDeploymentDriverRegistry(): DeploymentDriverRegistry {
  defaultDeploymentDriverRegistry ??= createDefaultDeploymentDriverRegistry()
  return defaultDeploymentDriverRegistry
}

export function createDeploymentDriverRegistry(
  drivers?: DeploymentDriverRegistry | readonly DeploymentDriver[],
): DeploymentDriverRegistry {
  if (drivers instanceof DeploymentDriverRegistry) return drivers
  return createDefaultDeploymentDriverRegistry(drivers ?? [])
}

export function deploymentTargetSupport(
  target: LocalGatewayDeploymentTargetRecord,
  drivers?: DeploymentDriverRegistry | readonly DeploymentDriver[],
): LocalGatewayDeploymentTargetSupport {
  return createDeploymentDriverRegistry(drivers).targetSupport(target)
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

const LocalDeploymentConfigSchema = z.object({
  root: OptionalTrimmedString,
  postDeployCommand: OptionalTrimmedString,
  allowDestroy: z.boolean().optional(),
})

interface LocalDeploymentConfig {
  root: string
  postDeployCommand?: string
  allowDestroy: boolean
}

const ContainerDeploymentConfigSchema = z.object({
  image: OptionalTrimmedString,
  containerName: OptionalTrimmedString,
  dockerfile: OptionalTrimmedString,
  runArgs: z.array(z.string().trim().min(1)).optional(),
})

interface ContainerDeploymentConfig {
  image: string
  containerName: string
  dockerfile?: string
  runArgs: string[]
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
  dependencies?: LocalGatewayDeploymentDependencies
}): LocalGatewayDeploymentPlan {
  const target = requireDeploymentTarget(input.appState, input.targetId)
  const repoRoot = path.resolve(input.dependencies?.repoRoot ?? process.cwd())
  const drivers = createDeploymentDriverRegistry(input.dependencies?.drivers)
  const driver = drivers.require(target.kind)
  driver.validateTarget?.(target)
  return driver.plan({
    appState: input.appState,
    target,
    operation: input.operation,
    repoRoot,
  })
}

export function executeLocalGatewayDeployment(input: {
  appState: LocalGatewayAppStateStore
  targetId: string
  operation: LocalGatewayDeploymentOperation
  confirm: string
  /**
   * The public gateway supplies this before invoking the driver. The internal
   * fallback still records a bound decision for focused driver callers.
   */
  authorization?: DecisionRecord
  /** A preflight plan must be bound to the same target and operation. */
  plan?: LocalGatewayDeploymentPlan
  dependencies?: LocalGatewayDeploymentDependencies
}): LocalGatewayDeploymentExecutionResult {
  const normalizedConfirm = input.confirm.trim().toLowerCase()
  if (normalizedConfirm !== input.operation) {
    throw new Error(`Deployment execution requires confirm="${input.operation}".`)
  }

  const drivers = createDeploymentDriverRegistry(input.dependencies?.drivers)
  const target = requireDeploymentTarget(input.appState, input.targetId)
  const driver = drivers.require(target.kind)
  driver.validateTarget?.(target)
  const repoRoot = path.resolve(input.dependencies?.repoRoot ?? process.cwd())
  const plan = input.plan ?? driver.plan({
    appState: input.appState,
    target,
    operation: input.operation,
    repoRoot,
  })
  assertDeploymentPlan({ plan, target, operation: input.operation })
  const runner = input.dependencies?.commandRunner ?? defaultCommandRunner
  const startedAt = new Date().toISOString()
  const deploymentRunId = `deployment_run_${Date.now().toString(36)}`
  const planHash = hashApprovalInput(plan)
  const targetHash = hashApprovalInput(target)
  const authorization = input.authorization ?? createHostDecisionRecord({
    runId: deploymentRunId,
    surface: 'deployment',
    operation: 'deployment.execute',
    targetKey: target.targetId,
    state: 'allow',
    reasons: ['Deployment execution received an exact local confirmation.'],
    permissionCategories: ['deployment', 'side-effecting', 'operator-control-plane'],
    input: {
      targetId: target.targetId,
      operation: input.operation,
      targetKind: target.kind,
      targetHash,
      planHash,
    },
    metadata: { operation: input.operation, targetKind: target.kind, targetHash, planHash },
  })
  assertDeploymentAuthorization({ authorization, target, operation: input.operation, plan })

  let deploymentRun = input.appState.deploymentRuns.upsert({
    deploymentRunId,
    targetId: target.targetId,
    status: 'running',
    metadata: {
      operation: input.operation,
      planSummary: plan.summary,
      decisionRecord: authorization,
      ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
      ...(plan.rollbackReleaseId ? { rollbackReleaseId: plan.rollbackReleaseId } : {}),
    },
  })

  try {
    driver.execute({
      appState: input.appState,
      target,
      operation: input.operation,
      repoRoot,
      runner,
      plan,
    })
    deploymentRun = input.appState.deploymentRuns.upsert({
      deploymentRunId,
      targetId: target.targetId,
      status: 'succeeded',
      metadata: {
        operation: input.operation,
        planSummary: plan.summary,
        decisionRecord: authorization,
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
    const message = redactRuntimeSensitiveText(
      error instanceof Error ? error.message : 'Deployment execution failed.',
    )
    deploymentRun = input.appState.deploymentRuns.upsert({
      deploymentRunId,
      targetId: target.targetId,
      status: 'failed',
      metadata: {
        operation: input.operation,
        planSummary: plan.summary,
        decisionRecord: authorization,
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

function assertDeploymentAuthorization(input: {
  authorization: DecisionRecord
  target: LocalGatewayDeploymentTargetRecord
  operation: LocalGatewayDeploymentOperation
  plan: LocalGatewayDeploymentPlan
}): void {
  const { authorization, target, operation, plan } = input
  const planHash = hashApprovalInput(plan)
  const targetHash = hashApprovalInput(target)
  const expectedInputHash = hashApprovalInput({
    targetId: target.targetId,
    operation,
    targetKind: target.kind,
    targetHash,
    planHash,
  })
  if (
    authorization.surface !== 'deployment'
    || authorization.operation !== 'deployment.execute'
    || authorization.targetKey !== target.targetId
    || authorization.state !== 'allow'
    || !authorization.approved
    || authorization.inputHash !== expectedInputHash
    || authorization.metadata?.targetHash !== targetHash
    || authorization.metadata?.planHash !== planHash
  ) {
    throw new Error('Deployment execution authorization does not match the confirmed target.')
  }
  if (authorization.metadata?.operation !== operation) {
    throw new Error('Deployment execution authorization does not match the requested operation.')
  }
}

function assertDeploymentPlan(input: {
  plan: LocalGatewayDeploymentPlan
  target: LocalGatewayDeploymentTargetRecord
  operation: LocalGatewayDeploymentOperation
}): void {
  if (
    input.plan.targetId !== input.target.targetId
    || input.plan.targetKind !== input.target.kind
    || input.plan.operation !== input.operation
  ) {
    throw new Error('Deployment preflight plan does not match the requested target and operation.')
  }
}

const vpsSshDeploymentDriver: DeploymentDriver = {
  kind: 'vps',
  executionMode: 'vps-ssh',
  validateTarget: (target) => {
    parseVpsDeploymentConfig(target)
  },
  plan: ({ appState, target, operation }) => {
    const config = parseVpsDeploymentConfig(target)
    switch (operation) {
      case 'deploy':
        return buildDeployPlan(target, config)
      case 'rollback':
        return buildRollbackPlan(appState, target, config)
      case 'destroy':
        return buildDestroyPlan(target, config)
    }
  },
  execute: ({ runner, repoRoot, target, operation, plan }) => {
    const config = parseVpsDeploymentConfig(target)
    switch (operation) {
      case 'deploy':
        executeDeploy({ runner, repoRoot, config, releaseId: plan.releaseId! })
        return
      case 'rollback':
        executeRollback({ runner, config, rollbackReleaseId: plan.rollbackReleaseId! })
        return
      case 'destroy':
        executeDestroy({ runner, config })
    }
  },
}

const localDeploymentDriver: DeploymentDriver = {
  kind: 'local',
  executionMode: 'local-filesystem',
  validateTarget: (target) => {
    parseLocalDeploymentConfig(target, process.cwd())
  },
  plan: ({ appState, target, operation, repoRoot }) => {
    const config = parseLocalDeploymentConfig(target, repoRoot)
    switch (operation) {
      case 'deploy':
        return buildLocalDeployPlan(target, config)
      case 'rollback':
        return buildLocalRollbackPlan(appState, target, config)
      case 'destroy':
        return buildLocalDestroyPlan(target, config)
    }
  },
  execute: ({ appState, runner, repoRoot, target, operation, plan }) => {
    const config = parseLocalDeploymentConfig(target, repoRoot)
    switch (operation) {
      case 'deploy':
        executeLocalDeploy({ runner, repoRoot, config, releaseId: plan.releaseId! })
        return
      case 'rollback':
        executeLocalRollback({ appState, target, config, rollbackReleaseId: plan.rollbackReleaseId! })
        return
      case 'destroy':
        executeLocalDestroy({ repoRoot, config })
    }
  },
}

const containerDeploymentDriver: DeploymentDriver = {
  kind: 'container',
  executionMode: 'docker-container',
  validateTarget: (target) => {
    parseContainerDeploymentConfig(target)
  },
  plan: ({ appState, target, operation }) => {
    const config = parseContainerDeploymentConfig(target)
    switch (operation) {
      case 'deploy':
        return buildContainerDeployPlan(target, config)
      case 'rollback':
        return buildContainerRollbackPlan(appState, target, config)
      case 'destroy':
        return buildContainerDestroyPlan(target, config)
    }
  },
  execute: ({ appState, runner, repoRoot, target, operation, plan }) => {
    const config = parseContainerDeploymentConfig(target)
    switch (operation) {
      case 'deploy':
        executeContainerDeploy({ runner, repoRoot, config, releaseId: plan.releaseId! })
        return
      case 'rollback':
        executeContainerRollback({ appState, runner, target, config, rollbackReleaseId: plan.rollbackReleaseId! })
        return
      case 'destroy':
        executeContainerDestroy({ runner, config })
    }
  },
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

function buildLocalDeployPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: LocalDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const releaseId = `release-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
  return {
    operation: 'deploy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Package the current repo and write a local release artifact under ${config.root}.`,
    releaseId,
    prerequisites: ['Local host must have npm available on PATH.'],
    warnings: [
      'Local deployment writes files on the host filesystem.',
      'This driver records a release artifact; it does not create an OS service.',
    ],
    steps: [
      {
        phase: 'local',
        label: 'Pack current package',
        command: 'npm pack --json --pack-destination <temp-dir>',
      },
      {
        phase: 'local',
        label: 'Write local release artifact',
        command: `copy <tarball> ${shellQuote(path.join(config.root, 'releases', `${releaseId}.tgz`))}`,
      },
      ...(config.postDeployCommand
        ? [{
            phase: 'local' as const,
            label: 'Run post-deploy command',
            command: config.postDeployCommand,
          }]
        : []),
    ],
  }
}

function buildLocalRollbackPlan(
  appState: LocalGatewayAppStateStore,
  target: LocalGatewayDeploymentTargetRecord,
  config: LocalDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const rollbackReleaseId = rollbackReleaseIdForTarget(appState, target)
  return {
    operation: 'rollback',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Point the local deployment marker back to ${rollbackReleaseId}.`,
    rollbackReleaseId,
    prerequisites: ['At least two successful deployment releases must exist for this target.'],
    warnings: ['Rollback updates the current local release marker only.'],
    steps: [
      {
        phase: 'local',
        label: 'Update current release marker',
        command: `write ${shellQuote(path.join(config.root, 'current-release.json'))}`,
      },
    ],
  }
}

function buildLocalDestroyPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: LocalDeploymentConfig,
): LocalGatewayDeploymentPlan {
  return {
    operation: 'destroy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Remove local deployment artifacts under ${config.root}.`,
    prerequisites: ['Deployment root must be a safe local artifact directory.'],
    warnings: ['Destroy removes the local deployment artifact root recursively.'],
    steps: [
      {
        phase: 'local',
        label: 'Remove local deployment root',
        command: `rm -rf ${shellQuote(config.root)}`,
      },
    ],
  }
}

function buildContainerDeployPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: ContainerDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const releaseId = `release-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
  const releaseImage = `${config.image}:${releaseId}`
  return {
    operation: 'deploy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Build Docker image ${releaseImage} and run it as ${config.containerName}.`,
    releaseId,
    prerequisites: ['Local host must have Docker available on PATH.'],
    warnings: ['Container deployment uses the local Docker Engine and does not create a remote host.'],
    steps: [
      {
        phase: 'local',
        label: 'Build release image',
        command: `docker build -t ${releaseImage} .`,
      },
      {
        phase: 'local',
        label: 'Replace running container',
        command: `docker rm -f ${config.containerName} || true && docker run -d --name ${config.containerName} ${releaseImage}`,
      },
    ],
  }
}

function buildContainerRollbackPlan(
  appState: LocalGatewayAppStateStore,
  target: LocalGatewayDeploymentTargetRecord,
  config: ContainerDeploymentConfig,
): LocalGatewayDeploymentPlan {
  const rollbackReleaseId = rollbackReleaseIdForTarget(appState, target)
  const rollbackImage = `${config.image}:${rollbackReleaseId}`
  return {
    operation: 'rollback',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Restart ${config.containerName} from Docker image ${rollbackImage}.`,
    rollbackReleaseId,
    prerequisites: ['Rollback image must still exist in the local Docker Engine.'],
    warnings: ['Rollback replaces the running container.'],
    steps: [
      {
        phase: 'local',
        label: 'Replace running container with previous image',
        command: `docker rm -f ${config.containerName} || true && docker run -d --name ${config.containerName} ${rollbackImage}`,
      },
    ],
  }
}

function buildContainerDestroyPlan(
  target: LocalGatewayDeploymentTargetRecord,
  config: ContainerDeploymentConfig,
): LocalGatewayDeploymentPlan {
  return {
    operation: 'destroy',
    targetId: target.targetId,
    targetLabel: target.label,
    targetKind: target.kind,
    summary: `Remove Docker container ${config.containerName}.`,
    prerequisites: ['Local host must have Docker available on PATH.'],
    warnings: ['Destroy removes the running container but leaves images intact.'],
    steps: [
      {
        phase: 'local',
        label: 'Remove container',
        command: `docker rm -f ${config.containerName}`,
      },
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

function executeLocalDeploy(input: {
  runner: LocalGatewayDeploymentCommandRunner
  repoRoot: string
  config: LocalDeploymentConfig
  releaseId: string
}): void {
  assertLocalCommand(input.runner, 'npm')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-local-deploy-'))
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
    const releasesRoot = path.join(input.config.root, 'releases')
    fs.mkdirSync(releasesRoot, { recursive: true })
    const releaseTarball = path.join(releasesRoot, `${input.releaseId}.tgz`)
    if (fs.existsSync(localTarball)) {
      fs.copyFileSync(localTarball, releaseTarball)
    } else {
      fs.writeFileSync(releaseTarball, packResult.stdout, 'utf8')
    }
    writeLocalCurrentRelease(input.config.root, input.releaseId, releaseTarball)
    if (input.config.postDeployCommand) {
      const result = input.runner.run({
        command: process.platform === 'win32' ? 'cmd.exe' : 'sh',
        args: process.platform === 'win32'
          ? ['/c', input.config.postDeployCommand]
          : ['-lc', input.config.postDeployCommand],
        cwd: input.config.root,
      })
      if (result.status !== 0) {
        throw new Error(`post-deploy command failed: ${stderrPreview(result.stderr || result.stdout)}`)
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function executeLocalRollback(input: {
  appState: LocalGatewayAppStateStore
  target: LocalGatewayDeploymentTargetRecord
  config: LocalDeploymentConfig
  rollbackReleaseId: string
}): void {
  const releaseTarball = path.join(input.config.root, 'releases', `${input.rollbackReleaseId}.tgz`)
  writeLocalCurrentRelease(input.config.root, input.rollbackReleaseId, releaseTarball)
  rollbackReleaseIdForTarget(input.appState, input.target)
}

function executeLocalDestroy(input: {
  repoRoot: string
  config: LocalDeploymentConfig
}): void {
  assertSafeLocalDestroyRoot(input.config.root, input.repoRoot, input.config.allowDestroy)
  fs.rmSync(input.config.root, { recursive: true, force: true })
}

function executeContainerDeploy(input: {
  runner: LocalGatewayDeploymentCommandRunner
  repoRoot: string
  config: ContainerDeploymentConfig
  releaseId: string
}): void {
  assertLocalCommand(input.runner, 'docker')
  const releaseImage = `${input.config.image}:${input.releaseId}`
  const buildArgs = ['build', '-t', releaseImage]
  if (input.config.dockerfile) buildArgs.push('-f', input.config.dockerfile)
  buildArgs.push('.')
  runCommand(input.runner, {
    command: 'docker',
    args: buildArgs,
    cwd: input.repoRoot,
    failurePrefix: 'docker build failed',
  })
  input.runner.run({ command: 'docker', args: ['rm', '-f', input.config.containerName] })
  runCommand(input.runner, {
    command: 'docker',
    args: ['run', '-d', '--name', input.config.containerName, ...input.config.runArgs, releaseImage],
    failurePrefix: 'docker run failed',
  })
}

function executeContainerRollback(input: {
  appState: LocalGatewayAppStateStore
  runner: LocalGatewayDeploymentCommandRunner
  target: LocalGatewayDeploymentTargetRecord
  config: ContainerDeploymentConfig
  rollbackReleaseId: string
}): void {
  rollbackReleaseIdForTarget(input.appState, input.target)
  const rollbackImage = `${input.config.image}:${input.rollbackReleaseId}`
  assertLocalCommand(input.runner, 'docker')
  input.runner.run({ command: 'docker', args: ['rm', '-f', input.config.containerName] })
  runCommand(input.runner, {
    command: 'docker',
    args: ['run', '-d', '--name', input.config.containerName, ...input.config.runArgs, rollbackImage],
    failurePrefix: 'docker rollback failed',
  })
}

function executeContainerDestroy(input: {
  runner: LocalGatewayDeploymentCommandRunner
  config: ContainerDeploymentConfig
}): void {
  assertLocalCommand(input.runner, 'docker')
  runCommand(input.runner, {
    command: 'docker',
    args: ['rm', '-f', input.config.containerName],
    failurePrefix: 'docker destroy failed',
  })
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

function parseLocalDeploymentConfig(
  target: LocalGatewayDeploymentTargetRecord,
  repoRoot: string,
): LocalDeploymentConfig {
  const parsed = LocalDeploymentConfigSchema.safeParse(target.metadata ?? {})
  if (!parsed.success) {
    throw new Error(`Deployment target ${target.targetId} has invalid local deployment config.`)
  }
  return {
    root: path.resolve(parsed.data.root ?? path.join(repoRoot, '.mainspring-deployments', target.targetId)),
    ...(parsed.data.postDeployCommand ? { postDeployCommand: parsed.data.postDeployCommand } : {}),
    allowDestroy: parsed.data.allowDestroy === true,
  }
}

function parseContainerDeploymentConfig(
  target: LocalGatewayDeploymentTargetRecord,
): ContainerDeploymentConfig {
  const parsed = ContainerDeploymentConfigSchema.safeParse(target.metadata ?? {})
  if (!parsed.success) {
    throw new Error(`Deployment target ${target.targetId} has invalid container deployment config.`)
  }
  const baseName = sanitizeDockerName(target.targetId)
  return {
    image: parsed.data.image ?? `mainspring-${baseName}`,
    containerName: parsed.data.containerName ?? `mainspring-${baseName}`,
    ...(parsed.data.dockerfile ? { dockerfile: parsed.data.dockerfile } : {}),
    runArgs: parsed.data.runArgs ?? [],
  }
}

function rollbackReleaseIdForTarget(
  appState: LocalGatewayAppStateStore,
  target: LocalGatewayDeploymentTargetRecord,
): string {
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
  return uniqueReleaseIds[1]
}

function writeLocalCurrentRelease(root: string, releaseId: string, tarballPath: string): void {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(
    path.join(root, 'current-release.json'),
    `${JSON.stringify({
      releaseId,
      tarballPath,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  )
}

function assertSafeLocalDestroyRoot(root: string, repoRoot: string, allowDestroy: boolean): void {
  const resolvedRoot = path.resolve(root)
  const resolvedRepo = path.resolve(repoRoot)
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error('Local deployment destroy refused to remove a filesystem root.')
  }
  const defaultDeployRoot = path.join(resolvedRepo, '.mainspring-deployments')
  const relativeToDefaultRoot = path.relative(defaultDeployRoot, resolvedRoot)
  const underDefaultRoot =
    relativeToDefaultRoot !== ''
    && !relativeToDefaultRoot.startsWith('..')
    && !path.isAbsolute(relativeToDefaultRoot)
  if (!allowDestroy && !underDefaultRoot) {
    throw new Error('Local deployment destroy requires allowDestroy=true outside the default deployment root.')
  }
}

function runCommand(
  runner: LocalGatewayDeploymentCommandRunner,
  input: {
    command: string
    args: string[]
    cwd?: string
    failurePrefix: string
  },
): void {
  const result = runner.run({
    command: input.command,
    args: input.args,
    ...(input.cwd ? { cwd: input.cwd } : {}),
  })
  if (result.status !== 0) {
    throw new Error(`${input.failurePrefix}: ${stderrPreview(result.stderr || result.stdout)}`)
  }
}

function sanitizeDockerName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'deployment'
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
