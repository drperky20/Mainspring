import fs from 'node:fs'
import path from 'node:path'
import { EchoProvider } from '../../providers/EchoProvider.js'
import {
  createRuntimeProviderFromEnv,
  type RuntimeProviderSelection,
} from '../../runner/RuntimeProviderConfig.js'
import { createMainspring } from '../../sdk/Mainspring.js'
import { createRunLogMainspring } from '../../sdk/RunLogMainspring.js'
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
  MAINSPRING_RUNLOG_ROOT=.mainspring/runlog
  MAINSPRING_RUNLOG_DB=.mainspring/runlog/runlog.sqlite
  MAINSPRING_RUNLOG_WORKSPACE_ROOT=.mainspring/runlog/workspaces
  MAINSPRING_RUNLOG_APPROVAL_KEY=
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
  const runLogRoot = path.resolve(process.env.MAINSPRING_RUNLOG_ROOT || '.mainspring/runlog')
  const runLogDbPath = path.resolve(
    process.env.MAINSPRING_RUNLOG_DB || path.join(runLogRoot, 'runlog.sqlite'),
  )
  const runLogWorkspaceRoot = path.resolve(
    process.env.MAINSPRING_RUNLOG_WORKSPACE_ROOT || path.join(runLogRoot, 'workspaces'),
  )
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
  fs.mkdirSync(path.dirname(runLogDbPath), { recursive: true })
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(runLogWorkspaceRoot, { recursive: true })

  const envProviderSelection = resolveDevRuntimeProvider(process.env)
  const provider = envProviderSelection?.provider ?? new EchoProvider()
  const providerId = envProviderSelection?.providerId ?? 'echo'
  const modelId = envProviderSelection?.modelId ?? 'echo/default'
  const appState = createSqliteLocalGatewayAppStateStore({
    dbPath: appDbPath,
    managedSecretKeyPath,
    managedSecretKeyStorageMode,
    managedSecretCredentialName,
  })
  const runtime = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider,
    ...(envProviderSelection?.modelId ? { modelId: envProviderSelection.modelId } : {}),
    secretResolver: (ref) =>
      ref.kind === 'env'
        ? process.env[ref.key]
        : appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
    pollIntervalMs: 100,
  })
  const runLog = createRunLogMainspring({
    rootPath: runLogRoot,
    dbPath: runLogDbPath,
    workspaceRoot: runLogWorkspaceRoot,
    provider,
    defaultProviderId: providerId,
    agent: {
      agentId: 'gateway-dev-runlog-agent',
      instructions: 'You are a concise Mainspring RunLog gateway agent.',
      providerId,
      modelId,
      capabilities: ['provider'],
    },
    approvalReceiptKey: process.env.MAINSPRING_RUNLOG_APPROVAL_KEY,
    secretResolver: (ref) =>
      ref.kind === 'env'
        ? process.env[ref.key]
        : appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
    workerId: 'gateway-dev',
  })
  await runtime.start()
  bootstrapGatewayAppState({
    runtime,
    appState,
    workspaceRoot,
    providerId,
    defaultModelId: modelId,
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
    runLog,
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
    runLog.close()
    appState.close()
    await runtime.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

function resolveDevRuntimeProvider(
  env: Record<string, string | undefined>,
): RuntimeProviderSelection | undefined {
  return hasConfiguredProviderCredential(env) ? createRuntimeProviderFromEnv(env) : undefined
}

function hasConfiguredProviderCredential(env: Record<string, string | undefined>): boolean {
  const credentialRef = env.MAINSPRING_CREDENTIAL_REF?.trim()
  if (credentialRef?.startsWith('env:')) {
    return Boolean(env[credentialRef.slice('env:'.length)]?.trim())
  }
  if (credentialRef) return false
  const providerId = env.MAINSPRING_PROVIDER?.trim().toLowerCase() === 'openai' ? 'openai' : 'openrouter'
  const envKey = providerId === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'
  return Boolean(env[envKey]?.trim())
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
