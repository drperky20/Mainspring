import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteLocalGatewayAppStateStore } from './AppStateStore.js'
import {
  executeLocalGatewayDeployment,
  planLocalGatewayDeployment,
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

  it('fails closed for target kinds without a real deployment executor', () => {
    const root = makeTempRoot('mainspring-deploy-unsupported-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway.sqlite'),
    })
    try {
      const target = appState.deploymentTargets.create({
        label: 'Northline local placeholder',
        kind: 'local',
        metadata: { note: 'not a real deployment backend' },
      })

      expect(() =>
        planLocalGatewayDeployment({
          appState,
          targetId: target.targetId,
          operation: 'deploy',
        }),
      ).toThrow('Deployment planning is not implemented for target kind: local')
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
})
