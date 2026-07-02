import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalGatewayServer,
  createLocalMainspringGateway,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
  EchoProvider,
  MainspringMailbox,
} from '../dist/index.js'

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

async function main() {
  const root = makeTempRoot('mainspring-cron-check-')
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  const tickNow = new Date('2026-06-30T14:00:00.000Z')
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: new EchoProvider(),
    pollIntervalMs: 10,
  })
  const gateway = createLocalMainspringGateway({
    runtime,
    appState,
    cron: {
      enabled: false,
      now: () => tickNow,
    },
  })
  const server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

  await runtime.start()
  let started
  try {
    started = await server.start()
    const session = runtime.sessions.create({
      sessionId: 'cron-check-session',
      workspace: { root: workspaceRoot },
    })
    appState.cronSchedules.create({
      scheduleId: 'schedule_check',
      sessionId: session.record.sessionId,
      label: 'Due schedule',
      prompt: 'Run from scheduler.',
      cronExpr: '0 * * * *',
      enabled: true,
      nextRunAt: '2026-06-30T13:00:00.000Z',
    })

    await gateway.cron.tick()

    const mailbox = MainspringMailbox.fromSessionPath(session.record.sessionPath)
    const [pending] = mailbox.readPending(1)
    if (!pending?.dispatch.success) {
      throw new Error(`Expected scheduled dispatch, got ${pending?.dispatch.error?.message ?? 'none'}.`)
    }
    if (pending.dispatch.data.intent.message !== 'Run from scheduler.') {
      throw new Error(`Unexpected cron prompt: ${pending.dispatch.data.intent.message}`)
    }

    const schedule = appState.cronSchedules.get('schedule_check')
    if (!schedule?.lastRunAt || schedule.lastRunAt !== tickNow.toISOString()) {
      throw new Error('Cron tick did not persist lastRunAt.')
    }
    if (schedule.nextRunAt !== '2026-06-30T15:00:00.000Z') {
      throw new Error(`Unexpected nextRunAt: ${schedule.nextRunAt ?? 'missing'}`)
    }

    const createResponse = await fetch(`${started.url}/cron`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.record.sessionId,
        label: 'Manual schedule',
        prompt: 'Run from manual cron action. secretRef=env:OPENROUTER_API_KEY workspaceRoot=E:/hidden',
        cronExpr: '30 * * * *',
        enabled: false,
      }),
    })
    if (createResponse.status !== 201) {
      throw new Error(`Cron HTTP create failed with ${createResponse.status}: ${await createResponse.text()}`)
    }
    const created = await createResponse.json()
    const manualScheduleId = created?.cronSchedule?.scheduleId
    if (typeof manualScheduleId !== 'string' || !manualScheduleId) {
      throw new Error('Cron HTTP create did not return a schedule id.')
    }
    const serializedCreated = JSON.stringify(created)
    if (
      typeof created?.cronSchedule?.promptPreview !== 'string' ||
      'prompt' in (created?.cronSchedule ?? {}) ||
      serializedCreated.includes('secretRef') ||
      serializedCreated.includes('OPENROUTER_API_KEY') ||
      serializedCreated.includes('workspaceRoot') ||
      serializedCreated.includes('E:/hidden')
    ) {
      throw new Error(`Cron HTTP create response was not browser-safe: ${serializedCreated}`)
    }

    const runResponse = await fetch(`${started.url}/cron/${encodeURIComponent(manualScheduleId)}/run-now`, {
      method: 'POST',
    })
    if (runResponse.status !== 202) {
      throw new Error(`Cron HTTP run-now failed with ${runResponse.status}: ${await runResponse.text()}`)
    }
    const runNow = await runResponse.json()
    const runId = runNow?.run?.runId
    if (typeof runId !== 'string' || !runId) {
      throw new Error('Cron HTTP run-now did not return a run id.')
    }

    const manualSchedule = appState.cronSchedules.get(manualScheduleId)
    if (!manualSchedule?.lastRunAt || manualSchedule.lastRunAt !== tickNow.toISOString()) {
      throw new Error('Cron HTTP run-now did not persist lastRunAt.')
    }
    const manualRun = appState.runs.get(runId)
    if (
      !manualRun ||
      manualRun.sessionId !== session.record.sessionId ||
      manualRun.metadata?.scheduleId !== manualScheduleId ||
      manualRun.metadata?.trigger !== 'manual'
    ) {
      throw new Error('Cron HTTP run-now did not persist manual run metadata.')
    }
    const runNowAudit = appState.auditEvents
      .list({ category: 'cron' })
      .find((event) => event.action === 'schedule.run-now' && event.targetId === manualScheduleId && event.runId === runId)
    if (!runNowAudit) {
      throw new Error('Cron HTTP run-now did not persist a schedule.run-now audit event.')
    }

    console.log('MAINSPRING_CRON_CHECK_OK')
  } finally {
    await server.stop()
    await runtime.stop()
    appState.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await main()
