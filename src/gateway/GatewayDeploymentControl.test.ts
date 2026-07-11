import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord } from '../policy/DecisionRecord.js'
import {
  createSqliteLocalGatewayAppStateStore,
  type CreateLocalGatewayDeploymentTargetInput,
  type LocalGatewayAppStateStore,
  type UpdateLocalGatewayDeploymentTargetInput,
} from './AppStateStore.js'
import { consoleDeploymentRun, consoleDeploymentTarget } from './ConsoleSnapshotAdapter.js'
import {
  DeploymentDriverRegistry,
  executeLocalGatewayDeployment,
  type DeploymentDriver,
} from './DeploymentWizard.js'
import { GatewayDeploymentControl } from './GatewayDeploymentControl.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    removeTempRoot(root)
  }
  tempRoots.length = 0
})

function removeTempRoot(root: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

describe('GatewayDeploymentControl', () => {
  it('persists deployment configuration and execution decisions before a driver runs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-deployment-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const persistedCreateTarget = appState.deploymentTargets.create
    const persistedUpdateTarget = appState.deploymentTargets.update
    let createSawAuthorization = false
    let updateSawAuthorization = false
    const controlState = {
      ...appState,
      deploymentTargets: {
        ...appState.deploymentTargets,
        create: (input: CreateLocalGatewayDeploymentTargetInput) => {
          createSawAuthorization = appState.auditEvents.list({ category: 'deployment' }).some((event) => (
            event.action === 'target.created.authorized'
          ))
          return persistedCreateTarget(input)
        },
        update: (input: UpdateLocalGatewayDeploymentTargetInput) => {
          updateSawAuthorization = appState.auditEvents.list({ category: 'deployment' }).some((event) => (
            event.action === 'target.updated.authorized'
          ))
          return persistedUpdateTarget(input)
        },
      },
    } as unknown as LocalGatewayAppStateStore
    const actor = 'hosted:deployment-control:admin'
    let driverObservedAuthorization = false
    let driverCalls = 0
    const driver: DeploymentDriver = {
      kind: 'test',
      executionMode: 'test-driver',
      plan: ({ target, operation }) => ({
        operation,
        targetId: target.targetId,
        targetLabel: target.label,
        targetKind: target.kind,
        summary: `Plan ${operation} for ${target.label}.`,
        prerequisites: [],
        warnings: [],
        steps: [],
      }),
      execute: ({ appState: source, operation, target }) => {
        driverCalls += 1
        const authorization = source.auditEvents.list({ category: 'deployment' }).find((event) => (
          event.action === `run.${operation}.authorized` && event.targetId === target.targetId
        ))
        const running = source.deploymentRuns.list({ targetId: target.targetId, status: 'running' })[0]
        const authorizationDecision = recordValue(recordValue(authorization?.metadata)?.decisionRecord)
        const runningDecision = recordValue(recordValue(running?.metadata)?.decisionRecord)
        driverObservedAuthorization = authorizationDecision?.operation === 'deployment.execute'
          && runningDecision?.decisionId === authorizationDecision.decisionId
          && authorization?.actor === actor
      },
    }
    const drivers = new DeploymentDriverRegistry().register(driver)
    const control = new GatewayDeploymentControl({
      appState: controlState,
      repoRoot: root,
      drivers,
    })

    try {
      const target = control.createTarget({
        label: 'Test deployment target',
        kind: 'test',
        metadata: { privateConfigLabel: 'do-not-copy-into-audit-input' },
        actor,
      })
      expect(createSawAuthorization).toBe(true)
      expect(target.metadata).toMatchObject({
        deploymentDriver: {
          executionSupported: true,
          executionMode: 'test-driver',
        },
        decisionRecord: {
          operation: 'deployment.target.write',
          state: 'allow',
          inputHash: expect.any(String),
        },
      })

      expect(() => control.execute({
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'not-deploy',
      })).toThrow('Deployment execution requires confirm="deploy".')
      expect(appState.auditEvents.list({ category: 'deployment' }).map((event) => event.action)).not.toContain(
        'run.deploy.authorized',
      )

      const updated = control.updateTarget({
        targetId: target.targetId,
        label: 'Updated deployment target',
        metadata: { privateConfigLabel: 'changed-without-leaking-into-audit-input' },
        actor,
      })
      expect(updateSawAuthorization).toBe(true)
      expect(updated.metadata).toMatchObject({
        decisionRecord: {
          operation: 'deployment.target.write',
          state: 'allow',
          metadata: expect.objectContaining({ mutation: 'update' }),
        },
      })

      const result = control.execute({
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        actor,
      })
      expect(result.execution.ok).toBe(true)
      expect(driverObservedAuthorization).toBe(true)

      const deploymentEvents = appState.auditEvents.list({ category: 'deployment' })
      const authorizedIndex = deploymentEvents.findIndex((event) => event.action === 'run.deploy.authorized')
      const completedIndex = deploymentEvents.findIndex((event) => event.action === 'run.deploy.succeeded')
      expect(authorizedIndex).toBeGreaterThanOrEqual(0)
      expect(completedIndex).toBeGreaterThan(authorizedIndex)
      const authorization = deploymentEvents[authorizedIndex]
      expect(authorization).toMatchObject({
        actor,
        targetId: target.targetId,
        metadata: {
          decisionRecord: {
            operation: 'deployment.execute',
            state: 'allow',
            inputHash: expect.any(String),
            metadata: expect.objectContaining({
              operation: 'deploy',
              executionMode: 'test-driver',
              targetHash: expect.any(String),
              planHash: expect.any(String),
            }),
          },
        },
      })
      expect(deploymentEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'target.created.authorized',
          actor,
          targetId: target.targetId,
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              operation: 'deployment.target.write',
              state: 'allow',
              metadata: expect.objectContaining({
                mutation: 'create',
                targetHash: expect.any(String),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          action: 'target.updated.authorized',
          actor,
          targetId: target.targetId,
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              operation: 'deployment.target.write',
              state: 'allow',
              metadata: expect.objectContaining({
                mutation: 'update',
                targetHash: expect.any(String),
                previousTargetHash: expect.any(String),
              }),
            }),
          }),
        }),
      ]))
      expect(JSON.stringify(deploymentEvents)).not.toContain('do-not-copy-into-audit-input')
      expect(JSON.stringify(deploymentEvents)).not.toContain('changed-without-leaking-into-audit-input')
      const browserDeployment = {
        target: consoleDeploymentTarget(updated),
        run: consoleDeploymentRun(result.deploymentRun),
      }
      expect(JSON.stringify(browserDeployment)).not.toContain('decisionRecord')
      expect(JSON.stringify(browserDeployment)).not.toContain('changed-without-leaking-into-audit-input')

      const preflight = control.plan({ targetId: target.targetId, operation: 'deploy' })
      const mismatchedPlanHash = hashApprovalInput({
        ...preflight,
        summary: `${preflight.summary} altered after authorization.`,
      })
      const mismatchedAuthorization = createHostDecisionRecord({
        runId: 'gateway-control-plane',
        surface: 'deployment',
        operation: 'deployment.execute',
        targetKey: target.targetId,
        state: 'allow',
        reasons: ['Test mismatched preflight authorization.'],
        permissionCategories: ['deployment', 'side-effecting', 'operator-control-plane'],
        input: {
          targetId: target.targetId,
          operation: 'deploy',
          targetKind: target.kind,
          targetHash: hashApprovalInput(updated),
          planHash: mismatchedPlanHash,
        },
        metadata: {
          operation: 'deploy',
          targetKind: target.kind,
          targetHash: hashApprovalInput(updated),
          planHash: mismatchedPlanHash,
        },
      })
      const callsBeforeMismatch = driverCalls
      expect(() => executeLocalGatewayDeployment({
        appState,
        targetId: target.targetId,
        operation: 'deploy',
        confirm: 'deploy',
        authorization: mismatchedAuthorization,
        plan: preflight,
        dependencies: { repoRoot: root, drivers },
      })).toThrow('Deployment execution authorization does not match the confirmed target.')
      expect(driverCalls).toBe(callsBeforeMismatch)
    } finally {
      appState.close()
    }
  })
})
