#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'
import { RuntimeKernel } from './RuntimeKernel.js'
import { createShellTool } from '../tools/ShellTool.js'
import { createRuntimeProviderFromEnv } from './RuntimeProviderConfig.js'
import { ChannelBridge } from './ChannelBridge.js'
import { SessionRuntimeSupervisor } from './SessionRuntimeSupervisor.js'
import { resolveSessionWorkspaceRoot } from './SessionWorkspace.js'
import { createMainspringRuntimeTools } from './RuntimeTools.js'

const DEFAULT_SESSIONS_ROOT = '/sessions'
const DEFAULT_WORKSPACE_ROOT = '/workspaces/default'
const DEFAULT_POLL_INTERVAL_MS = 1_000

function readExplicitSessionPath(): string | null {
  const sessionPath = process.env.MAINSPRING_SESSION_PATH ?? process.argv[2]
  return sessionPath ? path.resolve(sessionPath) : null
}

function readSessionsRoot(): string {
  return path.resolve(
    process.env.MAINSPRING_SESSIONS_ROOT ?? DEFAULT_SESSIONS_ROOT,
  )
}

function readWorkspaceRoot(): string {
  return path.resolve(
    process.env.MAINSPRING_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT,
  )
}

function readPollIntervalMs(): number {
  const raw = process.env.MAINSPRING_POLL_INTERVAL_MS
  if (!raw) return DEFAULT_POLL_INTERVAL_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MS
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createRuntimeTools() {
  return [...createMainspringRuntimeTools(), createShellTool()]
}

async function main(): Promise<void> {
  const explicitSessionPath = readExplicitSessionPath()
  const sessionsRoot = readSessionsRoot()
  const workspaceRoot = readWorkspaceRoot()
  const providerSelection = createRuntimeProviderFromEnv(process.env)
  const pollIntervalMs = readPollIntervalMs()
  let running = true

  const stop = (): void => {
    running = false
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  if (explicitSessionPath) {
    const mailbox = MainspringMailbox.fromSessionPath(explicitSessionPath)
    const sessionWorkspaceRoot = resolveSessionWorkspaceRoot({
      sessionId: path.basename(mailbox.paths.sessionPath),
      sessionPath: mailbox.paths.sessionPath,
      defaultWorkspaceRoot: workspaceRoot,
    })
    fs.mkdirSync(sessionWorkspaceRoot, { recursive: true })
    const kernel = new RuntimeKernel({
      mailbox,
      provider: providerSelection.provider,
      cwd: sessionWorkspaceRoot,
      env: process.env,
      tools: createRuntimeTools(),
    })

    console.log(
      JSON.stringify({
        event: 'mainspring.started',
        mode: 'single-session',
        sessionPath: explicitSessionPath,
        workspaceRoot: sessionWorkspaceRoot,
        pollIntervalMs,
        provider: providerSelection.providerId,
        model: providerSelection.modelId,
        fallbackReason: providerSelection.fallbackReason,
      }),
    )
    mailbox.touchHeartbeat()

    while (running) {
      try {
        const result = await kernel.runOnce()
        if (result.processed === 0) {
          mailbox.touchHeartbeat()
          await sleep(pollIntervalMs)
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'mainspring.loop_error',
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        mailbox.touchHeartbeat()
        await sleep(pollIntervalMs)
      }
    }

    await kernel.waitForActiveQueries()
    mailbox.touchHeartbeat()
    console.log(JSON.stringify({ event: 'mainspring.stopped', sessionPath: explicitSessionPath }))
    return
  }

  // Control-channel transport (flag-gated coexistence with the mailbox):
  // when MAINSPRING_CHANNEL_URL is set, the bridge dials the control plane,
  // writes dispatch/cancel/approval rows into the local mailbox journal, and
  // streams sequenced TurnEvents back up with replay on reconnect.
  let channelBridge: ChannelBridge | null = null
  const channelUrl = process.env.MAINSPRING_CHANNEL_URL?.trim()
  const channelToken = (
    process.env.MAINSPRING_CHANNEL_TOKEN ?? process.env.MAINSPRING_INTERNAL_TOKEN
  )?.trim()
  if (channelUrl && channelToken) {
    channelBridge = new ChannelBridge({
      channelUrl,
      token: channelToken,
      sessionsRoot,
    })
    channelBridge.start()
    console.log(JSON.stringify({ event: 'mainspring.channel.enabled', sessionsRoot }))
  }

  const supervisor = new SessionRuntimeSupervisor({
    sessionsRoot,
    createKernel: ({ mailbox, sessionId, sessionPath }) => {
      const sessionWorkspaceRoot = resolveSessionWorkspaceRoot({
        sessionId,
        sessionPath,
        defaultWorkspaceRoot: workspaceRoot,
      })
      fs.mkdirSync(sessionWorkspaceRoot, { recursive: true })
      return new RuntimeKernel({
        mailbox,
        provider: providerSelection.provider,
        cwd: sessionWorkspaceRoot,
        env: process.env,
        tools: createRuntimeTools(),
      })
    },
  })

  console.log(
    JSON.stringify({
      event: 'mainspring.started',
      mode: 'multi-session',
      sessionsRoot,
      workspaceRoot,
      pollIntervalMs,
      provider: providerSelection.providerId,
      model: providerSelection.modelId,
      fallbackReason: providerSelection.fallbackReason,
    }),
  )
  supervisor.touchIdleHeartbeat()

  while (running) {
    try {
      const result = await supervisor.runOnceAll()
      if (result.processed === 0) {
        await sleep(pollIntervalMs)
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'mainspring.loop_error',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      supervisor.touchIdleHeartbeat()
      await sleep(pollIntervalMs)
    }
  }

  await supervisor.waitForActiveQueries()
  channelBridge?.stop()
  supervisor.touchIdleHeartbeat()
  console.log(JSON.stringify({ event: 'mainspring.stopped', sessionsRoot }))
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'mainspring.fatal',
      message: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
})
