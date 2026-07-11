import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSqliteLocalGatewayAppStateStore,
  type CreateLocalGatewayBudgetInput,
  type LocalGatewayAppStateStore,
  type UpdateLocalGatewayBudgetInput,
} from './AppStateStore.js'
import { GatewayBudgetControl } from './GatewayBudgetControl.js'

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
        !(error instanceof Error)
        || !('code' in error)
        || (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error
      }
      if (attempt === 4) return
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

describe('GatewayBudgetControl', () => {
  it('rejects malformed direct control input before it can create durable authority evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-budget-control-invalid-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const control = new GatewayBudgetControl({
      appState,
      validateScope: () => undefined,
    })

    try {
      expect(() => control.create({
        scopeType: 'invalid' as 'workspace',
        scopeId: 'workspace_budget_control',
        label: 'Invalid scope',
        maxEstimatedCostUsd: 20,
      })).toThrow('Budget scope type must be client, workspace, or agent.')
      expect(() => control.recordRunDecision({
        sessionId: '  ',
        runBinding: {},
        evaluations: [{
          budgetId: 'budget_missing',
          scopeType: 'workspace',
          scopeId: 'workspace_budget_control',
          status: 'warn',
          usedEstimatedCostUsd: 1,
          remainingEstimatedCostUsd: 19,
          usageEntryCount: 1,
          pricedUsageEntryCount: 1,
          unpricedUsageEntryCount: 0,
        }],
        acknowledged: false,
      })).toThrow('budget session id is required.')
      expect(appState.auditEvents.list({ category: 'billing' })).toEqual([])
    } finally {
      appState.close()
    }
  })

  it('records hash-only authority before budget mutation, warning acknowledgement, and hard block', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-budget-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const persistedCreate = appState.budgets.create
    const persistedUpdate = appState.budgets.update
    let createSawAuthorization = false
    let updateSawAuthorization = false
    const controlState = {
      ...appState,
      budgets: {
        ...appState.budgets,
        create: (input: CreateLocalGatewayBudgetInput) => {
          createSawAuthorization = appState.auditEvents.list({ category: 'billing' }).some((event) => (
            event.action === 'budget.created.authorized'
          ))
          return persistedCreate(input)
        },
        update: (input: UpdateLocalGatewayBudgetInput) => {
          updateSawAuthorization = appState.auditEvents.list({ category: 'billing' }).some((event) => (
            event.action === 'budget.updated.authorized'
          ))
          return persistedUpdate(input)
        },
      },
    } as unknown as LocalGatewayAppStateStore
    const control = new GatewayBudgetControl({
      appState: controlState,
      validateScope: (scopeType, scopeId) => {
        expect(scopeType).toBe('workspace')
        expect(scopeId).toBe('workspace_budget_control')
      },
    })
    const secretLabel = 'Budget secretRef=env:BUDGET_CONTROL_TEST_SECRET'
    const secretRunInput = 'Run with secretRef=env:BUDGET_CONTROL_TEST_SECRET'

    try {
      const budget = control.create({
        scopeType: 'workspace',
        scopeId: 'workspace_budget_control',
        label: secretLabel,
        maxEstimatedCostUsd: 20,
        warnAtUsd: 15,
        actor: 'hosted:operator_budget:admin',
      })
      expect(createSawAuthorization).toBe(true)

      const updated = control.update({
        budgetId: budget.budgetId,
        label: 'Approved budget limit',
        maxEstimatedCostUsd: 25,
        warnAtUsd: 18,
        actor: 'hosted:operator_budget:admin',
      })
      expect(updateSawAuthorization).toBe(true)
      expect(updated).toMatchObject({ maxEstimatedCostUsd: 25, warnAtUsd: 18 })

      const required = control.recordRunDecision({
        sessionId: 'session_budget_control',
        actor: 'hosted:operator_budget:admin',
        runBinding: { input: secretRunInput, allowedTools: ['file.write'] },
        evaluations: [{
          budgetId: budget.budgetId,
          scopeType: budget.scopeType,
          scopeId: budget.scopeId,
          status: 'warn',
          usedEstimatedCostUsd: 18,
          remainingEstimatedCostUsd: 7,
          usageEntryCount: 2,
          pricedUsageEntryCount: 2,
          unpricedUsageEntryCount: 0,
        }],
        acknowledged: false,
      })
      expect(required).toMatchObject({
        surface: 'budget',
        operation: 'budget.warning.acknowledge',
        state: 'requires_approval',
      })

      const acknowledged = control.recordRunDecision({
        sessionId: 'session_budget_control',
        actor: 'hosted:operator_budget:admin',
        runBinding: { input: secretRunInput, allowedTools: ['file.write'] },
        evaluations: [{
          budgetId: budget.budgetId,
          scopeType: budget.scopeType,
          scopeId: budget.scopeId,
          status: 'warn',
          usedEstimatedCostUsd: 18,
          remainingEstimatedCostUsd: 7,
          usageEntryCount: 2,
          pricedUsageEntryCount: 2,
          unpricedUsageEntryCount: 0,
        }],
        acknowledged: true,
      })
      expect(acknowledged).toMatchObject({ state: 'allow', approved: true })

      const blocked = control.recordRunDecision({
        sessionId: 'session_budget_control',
        actor: 'hosted:operator_budget:admin',
        runBinding: { input: secretRunInput, allowedTools: ['file.write'] },
        evaluations: [{
          budgetId: budget.budgetId,
          scopeType: budget.scopeType,
          scopeId: budget.scopeId,
          status: 'blocked',
          usedEstimatedCostUsd: 26,
          remainingEstimatedCostUsd: -1,
          usageEntryCount: 3,
          pricedUsageEntryCount: 3,
          unpricedUsageEntryCount: 0,
        }],
        acknowledged: true,
      })
      expect(blocked).toMatchObject({
        operation: 'budget.run.block',
        state: 'hard_block',
        approved: false,
        hardBlocked: true,
      })

      control.delete(budget.budgetId, 'hosted:operator_budget:admin')
      expect(appState.budgets.get(budget.budgetId)).toBeNull()

      const events = appState.auditEvents.list({ category: 'billing' })
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'budget.created.authorized',
          actor: 'hosted:operator_budget:admin',
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              surface: 'budget',
              operation: 'budget.write',
              state: 'allow',
              metadata: expect.objectContaining({ mutation: 'create', budgetHash: expect.any(String) }),
            }),
          }),
        }),
        expect.objectContaining({
          action: 'budget.warning_ack_required',
          actor: 'hosted:operator_budget:admin',
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              operation: 'budget.warning.acknowledge',
              state: 'requires_approval',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'budget.warning.acknowledged',
          actor: 'hosted:operator_budget:admin',
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({ state: 'allow' }),
          }),
        }),
        expect.objectContaining({
          action: 'budget.blocked',
          actor: 'hosted:operator_budget:admin',
          metadata: expect.objectContaining({
            decisionRecord: expect.objectContaining({
              operation: 'budget.run.block',
              state: 'hard_block',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'budget.deleted.authorized',
          actor: 'hosted:operator_budget:admin',
        }),
      ]))
      expect(JSON.stringify(events)).not.toContain(secretLabel)
      expect(JSON.stringify(events)).not.toContain(secretRunInput)
      expect(JSON.stringify(events)).not.toContain('BUDGET_CONTROL_TEST_SECRET')
    } finally {
      appState.close()
    }
  })
})
