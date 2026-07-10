import fs from 'node:fs'
import path from 'node:path'
import { EchoProvider } from '../providers/EchoProvider.js'
import type { AgentProvider } from '../providers/types.js'
import { createRunLogMainspring, type RunLogMainspring } from '../sdk/RunLogMainspring.js'
import {
  createRuntimeProviderFromEnv,
  type RuntimeProviderSelection,
} from './RuntimeProviderConfig.js'

export const DEFAULT_RUNLOG_ROOT = '.mainspring/runlog'
export const DEFAULT_RUNLOG_AGENT_ID = 'local-runlog-agent'

export interface RunLogRunnerConfig {
  rootPath: string
  dbPath: string
  workspaceRoot: string
  workerId: string
  providerId: string
  modelId?: string
  credentialRef?: string
  usingEchoFallback: boolean
}

export interface RunLogRunner {
  config: RunLogRunnerConfig
  runtime: RunLogMainspring
  start(): void
  stop(): Promise<void>
  close(): void
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function hasConfiguredRuntimeProviderCredential(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const credentialRef = clean(env.MAINSPRING_CREDENTIAL_REF)
  if (credentialRef?.startsWith('env:')) {
    return Boolean(clean(env[credentialRef.slice('env:'.length)]))
  }
  if (credentialRef) return false

  const providerId = clean(env.MAINSPRING_PROVIDER)?.toLowerCase() ?? 'openrouter'
  if (providerId === 'codex') {
    if (clean(env.CODEX_ACCESS_TOKEN)) return true
    const codexHome = clean(env.CODEX_HOME)
    return Boolean(codexHome && fs.existsSync(path.join(codexHome, 'auth.json')))
  }
  const envKey = providerId === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'
  return Boolean(clean(env[envKey]))
}

export function resolveRunLogRunnerConfig(input: {
  env?: Record<string, string | undefined>
  cwd?: string
  pid?: number
  providerSelection?: RuntimeProviderSelection
} = {}): RunLogRunnerConfig {
  const env = input.env ?? process.env
  const cwd = input.cwd ?? process.cwd()
  const rootPath = path.resolve(cwd, clean(env.MAINSPRING_RUNLOG_ROOT) ?? DEFAULT_RUNLOG_ROOT)
  const dbPath = path.resolve(
    cwd,
    clean(env.MAINSPRING_RUNLOG_DB) ?? path.join(rootPath, 'runlog.sqlite'),
  )
  const workspaceRoot = path.resolve(
    cwd,
    clean(env.MAINSPRING_RUNLOG_WORKSPACE_ROOT) ?? path.join(rootPath, 'workspaces'),
  )
  const providerSelection = input.providerSelection ?? createRuntimeProviderFromEnv(env)
  const usingEchoFallback = !hasConfiguredRuntimeProviderCredential(env)
  return {
    rootPath,
    dbPath,
    workspaceRoot,
    workerId: clean(env.MAINSPRING_RUNLOG_WORKER_ID) ?? `runner_${input.pid ?? process.pid}`,
    providerId: usingEchoFallback ? 'echo' : providerSelection.providerId,
    ...(usingEchoFallback
      ? { modelId: 'echo/default' }
      : providerSelection.modelId
        ? { modelId: providerSelection.modelId }
        : {}),
    ...(!usingEchoFallback && providerSelection.credentialRef
      ? { credentialRef: providerSelection.credentialRef }
      : {}),
    usingEchoFallback,
  }
}

export function createRunLogRunner(input: {
  env?: Record<string, string | undefined>
  cwd?: string
  pid?: number
  providerSelection?: RuntimeProviderSelection
  provider?: AgentProvider
} = {}): RunLogRunner {
  const env = input.env ?? process.env
  const selection = input.providerSelection ?? createRuntimeProviderFromEnv(env)
  const config = resolveRunLogRunnerConfig({
    env,
    cwd: input.cwd,
    pid: input.pid,
    providerSelection: selection,
  })
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true, mode: 0o700 })
  fs.mkdirSync(config.workspaceRoot, { recursive: true, mode: 0o700 })
  const provider = input.provider ?? (config.usingEchoFallback ? new EchoProvider() : selection.provider)
  const runtime = createRunLogMainspring({
    rootPath: config.rootPath,
    dbPath: config.dbPath,
    workspaceRoot: config.workspaceRoot,
    provider,
    defaultProviderId: config.providerId,
    agent: {
      agentId: DEFAULT_RUNLOG_AGENT_ID,
      instructions: 'You are a concise Mainspring local RunLog agent.',
      providerId: config.providerId,
      ...(config.modelId ? { modelId: config.modelId } : {}),
      capabilities: ['provider', 'tools', 'shell', 'files', 'browser', 'memory', 'workspace'],
    },
    approvalReceiptKey: clean(env.MAINSPRING_RUNLOG_APPROVAL_KEY),
    approvalReceiptKeyMode:
      clean(env.MAINSPRING_RUNLOG_APPROVAL_KEY_MODE) === 'configured' ? 'configured' : 'local-dev',
    secretResolver: (ref) => (ref.kind === 'env' ? env[ref.key] : undefined),
    workerId: config.workerId,
  })
  return {
    config,
    runtime,
    start: () => runtime.startWorker(),
    stop: async () => await runtime.stopWorker(),
    close: () => runtime.close(),
  }
}
