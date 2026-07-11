import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSqliteLocalGatewayAppStateStore,
  type CreateLocalGatewayCronScheduleInput,
  type LocalGatewayAppStateStore,
  type LocalGatewayCronScheduleRecord,
  type UpdateLocalGatewayCronScheduleInput,
} from './AppStateStore.js'
import { GatewayCronControl, type LocalGatewayCronGrantPreview } from './GatewayCronControl.js'

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

function previewGrant(schedule: LocalGatewayCronScheduleRecord): LocalGatewayCronGrantPreview {
  const metadata = schedule.metadata as { cronGrant?: unknown } | undefined
  const grantPresent = Boolean(metadata?.cronGrant)
  return {
    scheduleId: schedule.scheduleId,
    sessionId: schedule.sessionId,
    agentId: 'agent_cron_control',
    cronMode: grantPresent ? 'allowlist' : 'deny',
    headless: true,
    grantRequired: true,
    grantPresent,
    scheduleKey: `${schedule.cronExpr}|${schedule.timezone}`,
    allowedTools: [...schedule.allowedTools],
    decision: {
      decisionId: 'dr_cron_control_preview',
      state: grantPresent ? 'allow' : 'deny',
      reasons: grantPresent ? [] : ['headless cron grant is missing'],
      permissionCategories: ['cron', 'headless', 'side-effecting'],
      inputHash: 'input-hash',
      manifestHash: 'manifest-hash',
      policyHash: 'policy-hash',
    },
  }
}

describe('GatewayCronControl', () => {
  it('records hash-only trusted authority before cron schedule and grant mutations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-cron-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const persistedCreate = appState.cronSchedules.create
    const persistedUpdate = appState.cronSchedules.update
    let createSawAuthorization = false
    let updateSawAuthorization = false
    let grantSawAuthorization = false
    const controlState = {
      ...appState,
      cronSchedules: {
        ...appState.cronSchedules,
        create: (input: CreateLocalGatewayCronScheduleInput) => {
          createSawAuthorization = appState.auditEvents.list({ category: 'cron' }).some((event) => (
            event.action === 'schedule.created.authorized'
          ))
          return persistedCreate(input)
        },
        update: (input: UpdateLocalGatewayCronScheduleInput) => {
          const events = appState.auditEvents.list({ category: 'cron' })
          if (input.metadata) {
            grantSawAuthorization = events.some((event) => event.action === 'schedule.grant.created.authorized')
          } else {
            updateSawAuthorization = events.some((event) => event.action === 'schedule.updated.authorized')
          }
          return persistedUpdate(input)
        },
      },
    } as unknown as LocalGatewayAppStateStore
    const control = new GatewayCronControl({
      appState: controlState,
      now: () => new Date('2026-07-10T12:00:00.000Z'),
      grantIntervalMs: () => 0,
      validateSchedule: () => undefined,
      computeNextRunAt: () => '2026-07-10T13:00:00.000Z',
      prepareGrant: () => ({
        agentId: 'agent_cron_control',
        allowedTools: ['file.write'],
        scheduleKey: '0 * * * *|utc',
        metadata: { headless: true, cronScheduleKey: '0 * * * *|utc' },
      }),
      previewGrant: (schedule) => previewGrant(schedule),
    })
    const secretPrompt = 'Send report using secretRef=env:CRON_CONTROL_TEST_SECRET.'

    try {
      const schedule = control.create({
        sessionId: 'session_cron_control',
        label: 'Hourly report',
        prompt: secretPrompt,
        cronExpr: '0 * * * *',
        timezone: 'utc',
        allowedTools: ['file.write'],
        actor: 'hosted:operator_cron:admin',
      })
      expect(createSawAuthorization).toBe(true)
      expect(schedule.nextRunAt).toBe('2026-07-10T13:00:00.000Z')

      const updated = control.update({
        scheduleId: schedule.scheduleId,
        label: 'Hourly report v2',
        actor: 'hosted:operator_cron:admin',
      })
      expect(updateSawAuthorization).toBe(true)
      expect(updated.label).toBe('Hourly report v2')

      const granted = control.createGrant({
        scheduleId: schedule.scheduleId,
        expiresInMs: 60_000,
        maxExecutionCount: 1,
        actor: 'hosted:operator_cron:admin',
      })
      expect(grantSawAuthorization).toBe(true)
      expect(granted).toMatchObject({ scheduleId: schedule.scheduleId, grantPresent: true })

      const triggerAuthorization = control.authorizeTrigger({
        scheduleId: schedule.scheduleId,
        trigger: 'manual',
        nextRunAt: '2026-07-10T13:00:00.000Z',
        actor: 'hosted:operator_cron:admin',
      })
      control.recordTriggerOutcome({
        authorization: triggerAuthorization,
        runId: 'run_cron_control',
        nextRunAt: '2026-07-10T13:00:00.000Z',
      })

      control.delete(schedule.scheduleId, 'hosted:operator_cron:admin')
      expect(appState.cronSchedules.get(schedule.scheduleId)).toBeNull()

      const events = appState.auditEvents.list({ category: 'cron' })
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'schedule.created.authorized',
          actor: 'hosted:operator_cron:admin',
          targetId: schedule.scheduleId,
          metadata: {
            decisionRecord: expect.objectContaining({
              surface: 'cron',
              operation: 'cron.schedule.write',
              state: 'allow',
              inputHash: expect.any(String),
              metadata: expect.objectContaining({ mutation: 'create', scheduleHash: expect.any(String) }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'schedule.grant.created.authorized',
          actor: 'hosted:operator_cron:admin',
          targetId: schedule.scheduleId,
          metadata: {
            decisionRecord: expect.objectContaining({
              surface: 'cron',
              operation: 'cron.grant.create',
              state: 'allow',
              metadata: expect.objectContaining({ grantHash: expect.any(String) }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'schedule.deleted.authorized',
          actor: 'hosted:operator_cron:admin',
          targetId: schedule.scheduleId,
        }),
        expect.objectContaining({
          action: 'schedule.run-now.authorized',
          actor: 'hosted:operator_cron:admin',
          targetId: schedule.scheduleId,
          metadata: {
            decisionRecord: expect.objectContaining({
              surface: 'cron',
              operation: 'cron.trigger',
              metadata: expect.objectContaining({
                scheduleHash: expect.any(String),
                trigger: 'manual',
              }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'schedule.run-now',
          actor: 'hosted:operator_cron:admin',
          targetId: schedule.scheduleId,
          runId: 'run_cron_control',
          metadata: expect.objectContaining({
            triggerDecisionId: triggerAuthorization.decision.decisionId,
          }),
        }),
      ]))
      expect(JSON.stringify(events)).not.toContain(secretPrompt)
      expect(JSON.stringify(events)).not.toContain('CRON_CONTROL_TEST_SECRET')
    } finally {
      appState.close()
    }
  })
})
