import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EchoProvider } from '../providers/EchoProvider.js'
import { createRunLogRunner, hasConfiguredRuntimeProviderCredential, resolveRunLogRunnerConfig } from './RunLogRunner.js'

describe('RunLogRunner', () => {
  it('uses durable RunLog paths and EchoProvider only when no credential is configured', () => {
    const config = resolveRunLogRunnerConfig({ cwd: '/workspace', pid: 42, env: {} })

    expect(config).toMatchObject({
      rootPath: path.resolve('/workspace/.mainspring/runlog'),
      dbPath: path.resolve('/workspace/.mainspring/runlog/runlog.sqlite'),
      workspaceRoot: path.resolve('/workspace/.mainspring/runlog/workspaces'),
      workerId: 'runner_42',
      providerId: 'echo',
      modelId: 'echo/default',
      usingEchoFallback: true,
    })
    expect(hasConfiguredRuntimeProviderCredential({})).toBe(false)
  })

  it('keeps configured provider selections and creates a stoppable RunLog worker runtime', async () => {
    const rootPath = path.join(process.cwd(), '.mainspring-test-runlog-runner')
    const runner = createRunLogRunner({
      cwd: process.cwd(),
      env: {
        MAINSPRING_RUNLOG_ROOT: rootPath,
        MAINSPRING_RUNLOG_DB: path.join(rootPath, 'runlog.sqlite'),
        MAINSPRING_RUNLOG_WORKSPACE_ROOT: path.join(rootPath, 'workspaces'),
        MAINSPRING_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      },
      provider: new EchoProvider(),
    })
    try {
      expect(runner.config).toMatchObject({ providerId: 'openai', usingEchoFallback: false })
      runner.start()
      await runner.stop()
    } finally {
      runner.close()
      fs.rmSync(rootPath, { recursive: true, force: true })
    }
  })
})
