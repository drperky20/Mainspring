import fs from 'node:fs'
import path from 'node:path'
import { EchoProvider } from '../../providers/EchoProvider.js'
import { createRuntimeProviderFromEnv } from '../../runner/RuntimeProviderConfig.js'
import { createMainspring } from '../../sdk/Mainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from '../index.js'
import { createLocalGatewayServer } from './createLocalGatewayServer.js'

function printHelp(): void {
  console.log(`Mainspring local gateway dev server

Usage:
  pnpm gateway:dev

Environment:
  MAINSPRING_GATEWAY_HOST=127.0.0.1
  MAINSPRING_GATEWAY_PORT=8787
  MAINSPRING_SESSIONS_ROOT=.mainspring/sessions
  MAINSPRING_WORKSPACE_ROOT=.mainspring/workspaces
  MAINSPRING_GATEWAY_APP_DB=.mainspring/gateway-app.sqlite

Provider:
  - Uses env-backed runtime provider when available
  - Falls back to EchoProvider for local bring-up without paid keys
`)
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp()
    return
  }

  const host = process.env.MAINSPRING_GATEWAY_HOST?.trim() || '127.0.0.1'
  const port = Number.parseInt(process.env.MAINSPRING_GATEWAY_PORT?.trim() || '8787', 10)
  const sessionsRoot = path.resolve(process.env.MAINSPRING_SESSIONS_ROOT || '.mainspring/sessions')
  const workspaceRoot = path.resolve(process.env.MAINSPRING_WORKSPACE_ROOT || '.mainspring/workspaces')
  const appDbPath = path.resolve(process.env.MAINSPRING_GATEWAY_APP_DB || '.mainspring/gateway-app.sqlite')
  fs.mkdirSync(path.dirname(appDbPath), { recursive: true })
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })

  const envProviderSelection = createRuntimeProviderFromEnv(process.env)
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: envProviderSelection?.provider ?? new EchoProvider(),
    ...(envProviderSelection?.modelId ? { modelId: envProviderSelection.modelId } : {}),
    pollIntervalMs: 100,
  })
  const appState = createSqliteLocalGatewayAppStateStore({ dbPath: appDbPath })
  await runtime.start()
  bootstrapGatewayAppState({
    runtime,
    appState,
    workspaceRoot,
    providerId: envProviderSelection?.providerId ?? 'echo',
    defaultModelId: envProviderSelection?.modelId ?? 'echo/default',
    secretRef:
      envProviderSelection?.providerId === 'openrouter'
        ? 'env:OPENROUTER_API_KEY'
        : envProviderSelection?.providerId === 'openai'
          ? 'env:OPENAI_API_KEY'
          : 'builtin:echo',
  })
  const gateway = createLocalMainspringGateway({ runtime, appState })
  const server = createLocalGatewayServer({ gateway, host, port })
  const started = await server.start()

  console.log(`Mainspring local gateway dev server listening on ${started.url}`)

  const shutdown = async () => {
    await server.stop()
    appState.close()
    await runtime.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

function bootstrapGatewayAppState(input: {
  runtime: ReturnType<typeof createMainspring>
  appState: ReturnType<typeof createSqliteLocalGatewayAppStateStore>
  workspaceRoot: string
  providerId: string
  defaultModelId: string
  secretRef: string
}): void {
  if (input.appState.clients.list().length === 0) {
    const client = input.appState.clients.create({ name: 'Northline Dental' })
    const workspace = input.appState.workspaces.create({
      clientId: client.clientId,
      name: 'Northline Workspace',
      root: path.join(input.workspaceRoot, 'northline'),
    })
    input.appState.agents.create({
      workspaceId: workspace.workspaceId,
      name: 'Front desk assistant',
      version: '1.0.0',
      defaultModelId: input.defaultModelId,
    })
  }
  if (input.appState.providerProfiles.list().length === 0) {
    input.appState.providerProfiles.create({
      providerId: input.providerId,
      label: input.providerId === 'echo' ? 'Echo Provider' : input.providerId.toUpperCase(),
      secretRef: input.secretRef,
      defaultModelId: input.defaultModelId,
    })
  }
  if (input.runtime.sessions.list().length === 0) {
    input.runtime.sessions.create({
      sessionId: 'gateway-dev-session',
      workspace: { root: path.join(input.workspaceRoot, 'northline') },
    })
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
