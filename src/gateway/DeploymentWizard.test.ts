import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import {
  executeLocalGatewayDeployment,
  planLocalGatewayDeployment,
  type DeploymentDriver,
  type LocalGatewayDeploymentCommandRunner,
} from './DeploymentWizard.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

describe('DeploymentWizard', () => {
  it('builds a deploy plan for an active VPS target', () => {
    const root = makeTempRoot('mainspring-deploy-plan-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      const target = appState.deploymentTargets.create({
        workspaceId: 'workspace_1',
        label: 'Northline VPS',
        kind: 'vps',
        metadata: {
          sshHost: 'deploy.example.com',
          sshUser: 'ubuntu',
          sshPort: 2222,
          remoteRoot: '/srv/mainspring',
          serviceName: 'mainspring-northline',
          envFilePath: '/etc/mainspring/northline.env',
          domain: 'ops.example.com',
        },
      })

      const plan = planLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
      })

      expect(plan).toMatchObject({
        operation: 'deploy',
        targetId: target.targetId,
        targetLabel: 'Northline VPS',
        targetKind: 'vps',
      })
      expect(plan.releaseId).toMatch(/^release-\d{14}$/)
      expect(plan.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'local', label: 'Pack current package' }),
          expect.objectContaining({ phase: 'remote', label: 'Install release and restart service' }),
        ]),
      )
      expect(plan.prerequisites.join(' ')).toContain('passwordless sudo')
    } finally {
      appState.close()
    }
  })

  it('requires successful deploy history before rollback planning', () => {
    const root = makeTempRoot('mainspring-deploy-rollback-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline VPS',
        kind: 'vps',
        metadata: {
          sshHost: 'deploy.example.com',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/mainspring',
          serviceName: 'mainspring-northline',
        },
      })

      expect(() =>
        planLocalGatewayDeployment({
          appState,
          targetId: target.targetId,
          operation: 'rollback',
        }),
      ).toThrow('Rollback requires at least two successful deployments')

      appState.deploymentRuns.upsert({
        deploymentRunId: 'deployment_run_1',
        targetId: target.targetId,
        status: 'succeeded',
        metadata: { operation: 'deploy', releaseId: 'release-a' },
      })
      appState.deploymentRuns.upsert({
        deploymentRunId: 'deployment_run_2',
        targetId: target.targetId,
        status: 'succeeded',
        metadata: { operation: 'deploy', releaseId: 'release-b' },
      })

      const plan = planLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'rollback',
      })

      expect(plan.rollbackReleaseId).toBe('release-a')
      expect(plan.summary).toContain('Point mainspring-northline back to release-a')
    } finally {
      appState.close()
    }
  })

  it('fails closed for target kinds without a registered deployment driver', () => {
    const root = makeTempRoot('mainspring-deploy-unsupported-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline custom placeholder',
        kind: 'fly',
        metadata: { note: 'not a registered deployment backend' },
      })

      expect(() =>
        planLocalGatewayDeployment({
          appState,
          targetId: target.targetId,
          operation: 'deploy',
        }),
      ).toThrow('Unknown deployment target kind: fly')
      expect(appState.deploymentRuns.list({ targetId: target.targetId })).toEqual([])
    } finally {
      appState.close()
    }
  })

  it('executes a deploy flow through the injected command runner and persists release metadata', () => {
    const root = makeTempRoot('mainspring-deploy-execute-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const commandLog: Array<{ command: string; args: string[]; cwd?: string }> = []
    const runner: LocalGatewayDeploymentCommandRunner = {
      run: ({ command, args, cwd }) => {
        commandLog.push({ command, args, cwd })
        if (command === 'npm' && args.length === 0) {
          return { status: 0, stdout: '', stderr: '' }
        }
        if (command === 'ssh' && args.length === 0) {
          return { status: 0, stdout: '', stderr: '' }
        }
        if (command === 'scp' && args.length === 0) {
          return { status: 0, stdout: '', stderr: '' }
        }
        if (command === 'npm' && args[0] === 'pack') {
          return {
            status: 0,
            stdout: JSON.stringify([{ filename: 'mainspring-0.1.0.tgz' }]),
            stderr: '',
          }
        }
        return { status: 0, stdout: '', stderr: '' }
      },
    }
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline VPS',
        kind: 'vps',
        metadata: {
          sshHost: 'deploy.example.com',
          sshUser: 'ubuntu',
          remoteRoot: '/srv/mainspring',
          serviceName: 'mainspring-northline',
          envFilePath: '/etc/mainspring/northline.env',
        },
      })

      const result = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: {
          repoRoot: root,
          commandRunner: runner,
        },
      })

      expect(result.execution.ok).toBe(true)
      expect(result.plan.releaseId).toMatch(/^release-\d{14}$/)
      expect(result.deploymentRun.status).toBe('succeeded')
      expect(result.deploymentRun.metadata).toMatchObject({
        operation: 'deploy',
        releaseId: result.plan.releaseId,
      })
      expect(commandLog.map((entry) => entry.command)).toEqual(
        expect.arrayContaining(['npm', 'ssh', 'scp']),
      )
      expect(commandLog.some((entry) => entry.command === 'npm' && entry.args[0] === 'pack')).toBe(true)
    } finally {
      appState.close()
    }
  })

  it('executes local deployment and destroy through the local driver', () => {
    const root = makeTempRoot('mainspring-local-deploy-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const deployRoot = path.join(root, 'local-target')
    const commandLog: Array<{ command: string; args: string[]; cwd?: string }> = []
    const runner: LocalGatewayDeploymentCommandRunner = {
      run: ({ command, args, cwd }) => {
        commandLog.push({ command, args, cwd })
        if (command === 'npm' && args.length === 0) return { status: 0, stdout: '', stderr: '' }
        if (command === 'npm' && args[0] === 'pack') {
          return {
            status: 0,
            stdout: JSON.stringify([{ filename: 'mainspring-0.1.0.tgz' }]),
            stderr: '',
          }
        }
        return { status: 0, stdout: '', stderr: '' }
      },
    }
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline local',
        kind: 'local',
        metadata: { root: deployRoot, allowDestroy: true },
      })

      const deploy = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: { repoRoot: root, commandRunner: runner },
      })

      expect(deploy.execution.ok).toBe(true)
      expect(deploy.deploymentRun.status).toBe('succeeded')
      expect(fs.existsSync(path.join(deployRoot, 'current-release.json'))).toBe(true)
      expect(commandLog.some((entry) => entry.command === 'npm' && entry.args[0] === 'pack')).toBe(true)

      const destroy = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'destroy',
        confirm: 'destroy',
        dependencies: { repoRoot: root, commandRunner: runner },
      })
      expect(destroy.execution.ok).toBe(true)
      expect(fs.existsSync(deployRoot)).toBe(false)
    } finally {
      appState.close()
    }
  })

  it('executes container deployment through the container driver', () => {
    const root = makeTempRoot('mainspring-container-deploy-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const commandLog: Array<{ command: string; args: string[]; cwd?: string }> = []
    const runner: LocalGatewayDeploymentCommandRunner = {
      run: ({ command, args, cwd }) => {
        commandLog.push({ command, args, cwd })
        return { status: 0, stdout: '', stderr: '' }
      },
    }
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline container',
        kind: 'container',
        metadata: {
          image: 'mainspring/northline',
          containerName: 'mainspring-northline',
          runArgs: ['--network', 'none'],
        },
      })

      const result = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: { repoRoot: root, commandRunner: runner },
      })

      expect(result.execution.ok).toBe(true)
      expect(result.plan.releaseId).toMatch(/^release-\d{14}$/)
      expect(commandLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ command: 'docker', args: [] }),
          expect.objectContaining({ command: 'docker', args: expect.arrayContaining(['build', '-t']) }),
          expect.objectContaining({ command: 'docker', args: expect.arrayContaining(['run', '-d', '--name', 'mainspring-northline']) }),
        ]),
      )
    } finally {
      appState.close()
    }
  })

  it('accepts custom deployment drivers only when explicitly registered', () => {
    const root = makeTempRoot('mainspring-custom-deploy-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    const customDriver: DeploymentDriver = {
      kind: 'static-site',
      executionMode: 'static-site-copy',
      plan: ({ target, operation }) => ({
        operation,
        targetId: target.targetId,
        targetLabel: target.label,
        targetKind: target.kind,
        summary: 'Copy static files to a registered custom target.',
        prerequisites: [],
        warnings: [],
        steps: [{ phase: 'local', label: 'Copy site', command: 'copy-site' }],
        ...(operation === 'deploy' ? { releaseId: 'release-custom' } : {}),
      }),
      execute: ({ runner }) => {
        const result = runner.run({ command: 'copy-site', args: [] })
        if (result.status !== 0) throw new Error('copy-site failed')
      },
    }
    const runner: LocalGatewayDeploymentCommandRunner = {
      run: () => ({ status: 0, stdout: '', stderr: '' }),
    }
    try {
      const target = appState.deploymentTargets.create({
        label: 'Static site',
        kind: 'static-site',
      })
      expect(() =>
        planLocalGatewayDeployment({
          appState,
          targetId: target.targetId,
          operation: 'deploy',
        }),
      ).toThrow('Unknown deployment target kind: static-site')

      const result = executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        dependencies: { commandRunner: runner, drivers: [customDriver] },
      })
      expect(result.execution.ok).toBe(true)
      expect(result.plan.targetKind).toBe('static-site')
      expect(result.plan.releaseId).toBe('release-custom')
    } finally {
      appState.close()
    }
  })
})
