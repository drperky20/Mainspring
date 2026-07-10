#!/usr/bin/env node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRunLogRunner } from './RunLogRunner.js'

function printHelp(): void {
  console.log(`Mainspring RunLog runtime

Usage:
  mainspring-runlog

Environment:
  MAINSPRING_RUNLOG_ROOT=.mainspring/runlog
  MAINSPRING_RUNLOG_DB=.mainspring/runlog/runlog.sqlite
  MAINSPRING_RUNLOG_WORKSPACE_ROOT=.mainspring/runlog/workspaces
  MAINSPRING_RUNLOG_WORKER_ID=
  MAINSPRING_RUNLOG_APPROVAL_KEY=
  MAINSPRING_RUNLOG_APPROVAL_KEY_MODE=local-dev
  MAINSPRING_PROVIDER=openrouter|openai|codex
  MAINSPRING_MODEL=
  MAINSPRING_CREDENTIAL_REF=env:OPENROUTER_API_KEY

Without a configured provider credential the runtime uses EchoProvider for local
bring-up. The legacy mailbox runner remains available as mainspring-runtime-compat.`)
}

export async function runRunLogMain(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp()
    return
  }

  const runner = createRunLogRunner()
  runner.start()
  console.log(
    JSON.stringify({
      event: 'mainspring.started',
      mode: 'runlog',
      rootPath: runner.config.rootPath,
      dbPath: runner.config.dbPath,
      workspaceRoot: runner.config.workspaceRoot,
      workerId: runner.config.workerId,
      provider: runner.config.providerId,
      model: runner.config.modelId,
      fallbackReason: runner.config.usingEchoFallback
        ? 'No configured provider credential; using EchoProvider for local bring-up.'
        : undefined,
    }),
  )

  await new Promise<void>((resolve) => {
    const keepAlive = setInterval(() => undefined, 2_147_483_647)
    let stopping = false
    const stop = (): void => {
      if (stopping) return
      stopping = true
      clearInterval(keepAlive)
      void runner.stop().finally(() => {
        runner.close()
        console.log(JSON.stringify({ event: 'mainspring.stopped', mode: 'runlog' }))
        resolve()
      })
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

if (isDirectCliEntry()) {
  void runRunLogMain().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'mainspring.fatal',
        mode: 'runlog',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    process.exitCode = 1
  })
}

function isDirectCliEntry(): boolean {
  return process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
    : false
}
