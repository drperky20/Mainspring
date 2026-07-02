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

export const defaultLocalGatewayDevHost = '127.0.0.1'
export const defaultLocalGatewayDevPort = 8787
export const defaultLocalGatewayCellLeaseTtlMs = 6 * 60 * 60 * 1_000

export function isAllowedLocalGatewayDevHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

export function resolveLocalGatewayDevHost(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed && isAllowedLocalGatewayDevHost(trimmed) ? trimmed : defaultLocalGatewayDevHost
}

export function resolveLocalGatewayDevPort(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() || String(defaultLocalGatewayDevPort), 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : defaultLocalGatewayDevPort
}

export function resolveLocalGatewayCellLeaseTtlMs(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() || String(defaultLocalGatewayCellLeaseTtlMs), 10)
  return Number.isInteger(parsed) && parsed >= 1_000
    ? parsed
    : defaultLocalGatewayCellLeaseTtlMs
}

export function resolveLocalGatewayCellCapacity(value: string | undefined): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined
}

function printHelp(): void {
  console.log(`Mainspring local gateway dev server

Usage:
  pnpm gateway:dev

Environment:
  MAINSPRING_GATEWAY_HOST=${defaultLocalGatewayDevHost}
  MAINSPRING_GATEWAY_PORT=${defaultLocalGatewayDevPort}
  MAINSPRING_SESSIONS_ROOT=.mainspring/sessions
  MAINSPRING_WORKSPACE_ROOT=.mainspring/workspaces
  MAINSPRING_GATEWAY_APP_DB=.mainspring/gateway-app.sqlite
  MAINSPRING_GATEWAY_MANAGED_SECRET_KEY=.mainspring/gateway-app.sqlite.managed-key
  MAINSPRING_GATEWAY_MANAGED_SECRET_STORE=auto
  MAINSPRING_GATEWAY_MANAGED_SECRET_CREDENTIAL_NAME=
  MAINSPRING_GATEWAY_CRON_ENABLED=1
  MAINSPRING_GATEWAY_CRON_POLL_MS=30000
  MAINSPRING_GATEWAY_CELL_LEASE_TTL_MS=${defaultLocalGatewayCellLeaseTtlMs}
  MAINSPRING_GATEWAY_CELL_MAX_ACTIVE_LEASES_PER_CELL=

Host binding:
  - Only localhost / 127.0.0.1 / ::1 are accepted
  - Invalid or remote host overrides fail closed to 127.0.0.1

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

  const host = resolveLocalGatewayDevHost(process.env.MAINSPRING_GATEWAY_HOST)
  const port = resolveLocalGatewayDevPort(process.env.MAINSPRING_GATEWAY_PORT)
  const sessionsRoot = path.resolve(process.env.MAINSPRING_SESSIONS_ROOT || '.mainspring/sessions')
  const workspaceRoot = path.resolve(process.env.MAINSPRING_WORKSPACE_ROOT || '.mainspring/workspaces')
  const appDbPath = path.resolve(process.env.MAINSPRING_GATEWAY_APP_DB || '.mainspring/gateway-app.sqlite')
  const managedSecretKeyPath = path.resolve(
    process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_KEY || `${appDbPath}.managed-key`,
  )
  const managedSecretKeyStorageMode = process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_STORE === 'file'
    || process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_STORE === 'credential-manager'
    || process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_STORE === 'auto'
    ? process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_STORE
    : 'auto'
  const managedSecretCredentialName =
    process.env.MAINSPRING_GATEWAY_MANAGED_SECRET_CREDENTIAL_NAME?.trim() || undefined
  const cronEnabled = process.env.MAINSPRING_GATEWAY_CRON_ENABLED !== '0'
  const cronPollIntervalMs = Number.parseInt(
    process.env.MAINSPRING_GATEWAY_CRON_POLL_MS || '30000',
    10,
  )
  const cellLeaseTtlMs = resolveLocalGatewayCellLeaseTtlMs(
    process.env.MAINSPRING_GATEWAY_CELL_LEASE_TTL_MS,
  )
  const maxActiveLeasesPerCell = resolveLocalGatewayCellCapacity(
    process.env.MAINSPRING_GATEWAY_CELL_MAX_ACTIVE_LEASES_PER_CELL,
  )
  fs.mkdirSync(path.dirname(appDbPath), { recursive: true })
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })

  const envProviderSelection = createRuntimeProviderFromEnv(process.env)
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: appDbPath,
    managedSecretKeyPath,
    managedSecretKeyStorageMode,
    managedSecretCredentialName,
  })
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider: envProviderSelection?.provider ?? new EchoProvider(),
    ...(envProviderSelection?.modelId ? { modelId: envProviderSelection.modelId } : {}),
    secretResolver: (ref) =>
      ref.kind === 'env'
        ? process.env[ref.key]
        : appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
    pollIntervalMs: 100,
  })
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
          : 'managed:echo-provider',
  })
  const gateway = createLocalMainspringGateway({
    runtime,
    appState,
    cron: {
      enabled: cronEnabled,
      pollIntervalMs:
        Number.isInteger(cronPollIntervalMs) && cronPollIntervalMs > 0
          ? cronPollIntervalMs
          : 30_000,
    },
    cells: {
      leaseTtlMs: cellLeaseTtlMs,
      ...(typeof maxActiveLeasesPerCell === 'number'
        ? { maxActiveLeasesPerCell }
        : {}),
    },
  })
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
