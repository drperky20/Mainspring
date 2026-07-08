import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'

export const PROCESS_EXECUTION_BACKENDS = ['host', 'wsl', 'docker'] as const

export type BuiltinProcessExecutionBackend = (typeof PROCESS_EXECUTION_BACKENDS)[number]
export type ProcessExecutionBackend = string
export type ProcessExecutionBackendPreference = ProcessExecutionBackend | 'auto'

export interface ExecutionBackendStatus {
  key: ProcessExecutionBackend
  label: string
  available: boolean
  unsafe: boolean
  capabilities: ExecutionBackendCapabilities
  reason?: string
}

export interface ExecutionBackendCapabilities {
  isolationKind: 'host-process' | 'wsl-distro' | 'docker-container'
  isolationStrength: 'none' | 'userland-boundary' | 'container-boundary'
  securityBoundary: 'none' | 'distro-process' | 'container-process'
  networkPolicy: 'host-inherited' | 'container-network-disabled'
  workspaceMapping: 'host-path' | 'wsl-mount' | 'docker-bind-mount'
  supportsShell: boolean
  supportsTerminal: boolean
  supportsFileMutation: boolean
  requiresApproval: boolean
  unsafeFallback: boolean
  verificationCommand: {
    command: string
    args: string[]
  }
  limits: string[]
}

export interface ExecutionBackendCapabilitySummary {
  isolationKind: ExecutionBackendCapabilities['isolationKind']
  isolationStrength: ExecutionBackendCapabilities['isolationStrength']
  securityBoundary: ExecutionBackendCapabilities['securityBoundary']
  networkPolicy: ExecutionBackendCapabilities['networkPolicy']
  workspaceMapping: ExecutionBackendCapabilities['workspaceMapping']
  requiresApproval: boolean
  unsafeFallback: boolean
  limits: string[]
}

export interface ExecutionBackendInventory {
  defaultBackend: ProcessExecutionBackend
  backends: ExecutionBackendStatus[]
}

export interface ResolvedExecutionBackend {
  key: ProcessExecutionBackend
  label: string
  unsafe: boolean
  capabilities: ExecutionBackendCapabilities
  spawnSpec?: (input: ExecutionBackendSpawnSpecInput) => ExecutionBackendSpawnSpec
}

export interface ResolveExecutionBackendOptions {
  preferredBackend?: ProcessExecutionBackendPreference
  probe?: () => ExecutionBackendInventory
  registry?: ExecutionBackendRegistry
}

export interface ExecutionBackendSpawnSpecInput {
  command: string
  cwd: string
  workspaceRoot: string
  env: NodeJS.ProcessEnv
  dockerImage?: string
}

export type ExecutionBackendSpawnSpec = [string, string[], SpawnOptions]

export interface ExecutionBackendAdapter {
  key: ProcessExecutionBackend
  label(platform: NodeJS.Platform): string
  inspect(platform: NodeJS.Platform): ExecutionBackendStatus
  capabilities(platform: NodeJS.Platform): ExecutionBackendCapabilities
  spawnSpec(input: ExecutionBackendSpawnSpecInput): ExecutionBackendSpawnSpec
}

const BACKEND_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/

export function assertSafeExecutionBackendId(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > 128 || !BACKEND_ID_PATTERN.test(trimmed)) {
    throw new Error('Execution backend id must use only letters, numbers, dot, underscore, colon, or dash.')
  }
  return trimmed
}

export class ExecutionBackendRegistry {
  private readonly adapters = new Map<string, ExecutionBackendAdapter>()

  register(adapter: ExecutionBackendAdapter): this {
    const key = assertSafeExecutionBackendId(adapter.key)
    this.adapters.set(key, { ...adapter, key })
    return this
  }

  get(key: string): ExecutionBackendAdapter | undefined {
    return this.adapters.get(assertSafeExecutionBackendId(key))
  }

  keys(): string[] {
    return [...this.adapters.keys()]
  }

  inspect(platform: NodeJS.Platform = process.platform): ExecutionBackendInventory {
    const backends = this.keys().map((key) => this.adapters.get(key)!.inspect(platform))
    return {
      defaultBackend: this.adapters.has('host') ? 'host' : backends[0]?.key ?? 'host',
      backends,
    }
  }

  resolve(
    preferredBackend: ProcessExecutionBackendPreference = 'auto',
    platform: NodeJS.Platform = process.platform,
  ): ResolvedExecutionBackend {
    const key = preferredBackend === 'auto'
      ? (this.adapters.has('host') ? 'host' : this.keys()[0])
      : assertSafeExecutionBackendId(preferredBackend)
    if (!key) throw new Error('No execution backend is registered.')
    const adapter = this.adapters.get(key)
    if (!adapter) throw new Error(`Unknown execution backend: ${key}`)
    const status = adapter.inspect(platform)
    if (!status.available) {
      throw new Error(
        `Execution backend "${key}" is unavailable: ${status.reason ?? 'unknown reason'}`,
      )
    }
    return {
      key: status.key,
      label: status.label,
      unsafe: status.unsafe,
      capabilities: status.capabilities,
      spawnSpec: adapter.spawnSpec,
    }
  }
}

let defaultExecutionBackendRegistry: ExecutionBackendRegistry | null = null

export function createDefaultExecutionBackendRegistry(): ExecutionBackendRegistry {
  return new ExecutionBackendRegistry()
    .register(hostExecutionBackendAdapter)
    .register(wslExecutionBackendAdapter)
    .register(dockerExecutionBackendAdapter)
}

export function getDefaultExecutionBackendRegistry(): ExecutionBackendRegistry {
  defaultExecutionBackendRegistry ??= createDefaultExecutionBackendRegistry()
  return defaultExecutionBackendRegistry
}

export function parseExecutionBackendPreference(
  value: unknown,
): ProcessExecutionBackendPreference | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'auto') return normalized
  return assertSafeExecutionBackendId(normalized)
}

export function backendPreferenceFromComputerId(
  computerId: string | undefined,
): ProcessExecutionBackendPreference | undefined {
  const normalized = computerId?.trim().toLowerCase()
  if (!normalized) return undefined
  if (
    normalized === 'computer_local'
    || normalized === 'computer_host'
    || normalized === 'computer_process_dev'
    || normalized === 'host'
    || normalized === 'process-dev'
  ) {
    return 'host'
  }
  if (normalized === 'computer_wsl' || normalized === 'wsl') {
    return 'wsl'
  }
  if (normalized === 'computer_docker' || normalized === 'docker') {
    return 'docker'
  }
  return undefined
}

export function inspectExecutionBackends(
  platform: NodeJS.Platform = process.platform,
): ExecutionBackendInventory {
  return getDefaultExecutionBackendRegistry().inspect(platform)
}

export function resolveExecutionBackend(
  options: ResolveExecutionBackendOptions = {},
): ResolvedExecutionBackend {
  const preferredBackend = options.preferredBackend ?? 'auto'
  const registry = options.registry ?? getDefaultExecutionBackendRegistry()
  if (!options.probe) return registry.resolve(preferredBackend, process.platform)

  const probe = options.probe
  const inventory = probe()
  const preferredKey =
    preferredBackend === 'auto' ? inventory.defaultBackend : assertSafeExecutionBackendId(preferredBackend)
  const status = inventory.backends.find((backend) => backend.key === preferredKey)
  if (!status) {
    throw new Error(
      preferredBackend === 'auto'
        ? `Default execution backend unavailable: ${inventory.defaultBackend}.`
        : `Unknown execution backend: ${preferredKey}`,
    )
  }
  if (!status.available) {
    throw new Error(
      `Execution backend "${preferredKey}" is unavailable: ${status.reason ?? 'unknown reason'}`,
    )
  }
  const adapter = registry.get(status.key)
  return {
    key: status.key,
    label: status.label,
    unsafe: status.unsafe,
    capabilities: status.capabilities,
    ...(adapter ? { spawnSpec: adapter.spawnSpec } : {}),
  }
}

export function toWslPath(inputPath: string): string {
  const resolved = path.resolve(inputPath)
  const drive = path.parse(resolved).root.slice(0, 1).toLowerCase()
  if (!/^[a-z]$/.test(drive)) {
    throw new Error(`Cannot map path into WSL: ${resolved}`)
  }
  const relative = resolved.slice(2).replace(/\\/g, '/')
  return `/mnt/${drive}${relative}`
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function backendSummaryLine(status: ExecutionBackendStatus): string {
  const safety = status.unsafe ? 'unsafe-host' : 'isolated-capable'
  const availability = status.available ? 'available' : 'unavailable'
  return `${status.key}: ${availability} (${safety}; ${status.capabilities.isolationStrength}; ${status.capabilities.networkPolicy})${status.reason ? ` - ${status.reason}` : ''}`
}

export function currentPlatformLabel(): string {
  return `${os.platform()} ${os.release()}`
}

function isContainerizedRuntime(): boolean {
  return process.env.MAINSPRING_CONTAINERIZED === '1' || fs.existsSync('/.dockerenv')
}

export function summarizeExecutionBackendCapabilities(
  capabilities: ExecutionBackendCapabilities,
): ExecutionBackendCapabilitySummary {
  return {
    isolationKind: capabilities.isolationKind,
    isolationStrength: capabilities.isolationStrength,
    securityBoundary: capabilities.securityBoundary,
    networkPolicy: capabilities.networkPolicy,
    workspaceMapping: capabilities.workspaceMapping,
    requiresApproval: capabilities.requiresApproval,
    unsafeFallback: capabilities.unsafeFallback,
    limits: [...capabilities.limits],
  }
}

function inspectWslBackend(platform: NodeJS.Platform): ExecutionBackendStatus {
  if (platform !== 'win32') {
    return {
      key: 'wsl',
      label: 'WSL bash',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('wsl', platform),
      reason: 'WSL execution is only available from a Windows host.',
    }
  }
  const probe = spawnSync('wsl.exe', ['bash', '-lc', 'printf MAINSPRING_WSL_OK'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
  if (probe.error) {
    return {
      key: 'wsl',
      label: 'WSL bash',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('wsl', platform),
      reason: compactReason(probe.error.message),
    }
  }
  if (probe.status !== 0 || !probe.stdout.includes('MAINSPRING_WSL_OK')) {
    return {
      key: 'wsl',
      label: 'WSL bash',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('wsl', platform),
      reason:
        compactReason(probe.stderr)
        || compactReason(probe.stdout)
        || `wsl.exe exited with code ${probe.status ?? 'unknown'}.`,
    }
  }
  return {
    key: 'wsl',
    label: 'WSL bash',
    available: true,
    unsafe: false,
    capabilities: executionBackendCapabilities('wsl', platform),
  }
}

function inspectDockerBackend(platform: NodeJS.Platform = process.platform): ExecutionBackendStatus {
  const probe = spawnSync('docker', ['info', '--format', '{{.OSType}}'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 2_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
  if (probe.error) {
    return {
      key: 'docker',
      label: 'Docker Linux container',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('docker', platform),
      reason: compactReason(probe.error.message),
    }
  }
  if (probe.status !== 0) {
    return {
      key: 'docker',
      label: 'Docker Linux container',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('docker', platform),
      reason:
        compactReason(probe.stderr)
        || compactReason(probe.stdout)
        || `docker info exited with code ${probe.status ?? 'unknown'}.`,
    }
  }
  const osType = compactReason(probe.stdout)?.toLowerCase()
  if (osType !== 'linux') {
    return {
      key: 'docker',
      label: 'Docker Linux container',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('docker', platform),
      reason: `Docker is reachable but is not using Linux containers: ${osType ?? 'unknown'}.`,
    }
  }
  return {
    key: 'docker',
    label: 'Docker Linux container',
    available: true,
    unsafe: false,
    capabilities: executionBackendCapabilities('docker', platform),
  }
}

function builtinExecutionBackendCapabilities(
  backend: ProcessExecutionBackend,
  platform: NodeJS.Platform = process.platform,
): ExecutionBackendCapabilities {
  if (backend === 'wsl') {
    return {
      isolationKind: 'wsl-distro',
      isolationStrength: 'userland-boundary',
      securityBoundary: 'distro-process',
      networkPolicy: 'host-inherited',
      workspaceMapping: 'wsl-mount',
      supportsShell: true,
      supportsTerminal: true,
      supportsFileMutation: true,
      requiresApproval: true,
      unsafeFallback: false,
      verificationCommand: {
        command: 'wsl.exe',
        args: ['bash', '-lc', 'printf MAINSPRING_WSL_OK'],
      },
      limits: [
        platform === 'win32'
          ? 'Available only when WSL is installed and a distro can execute bash.'
          : 'Unavailable outside a Windows host.',
        'Does not disable network access.',
        'Maps the workspace through /mnt/<drive>; it is not a VM isolation guarantee.',
      ],
    }
  }
  if (backend === 'docker') {
    return {
      isolationKind: 'docker-container',
      isolationStrength: 'container-boundary',
      securityBoundary: 'container-process',
      networkPolicy: 'container-network-disabled',
      workspaceMapping: 'docker-bind-mount',
      supportsShell: true,
      supportsTerminal: true,
      supportsFileMutation: true,
      requiresApproval: true,
      unsafeFallback: false,
      verificationCommand: {
        command: 'docker',
        args: ['info', '--format', '{{.OSType}}'],
      },
      limits: [
        'Requires a reachable Docker Engine using Linux containers.',
        'Mounts the workspace read/write at /workspace.',
        'Drops Linux capabilities, sets no-new-privileges, disables container networking, and limits PIDs, but is not a VM.',
      ],
    }
  }
  if (backend !== 'host') {
    throw new Error(`Unknown execution backend: ${assertSafeExecutionBackendId(backend)}`)
  }
  if (isContainerizedRuntime()) {
    return {
      isolationKind: 'docker-container',
      isolationStrength: 'container-boundary',
      securityBoundary: 'container-process',
      networkPolicy: 'host-inherited',
      workspaceMapping: 'host-path',
      supportsShell: true,
      supportsTerminal: true,
      supportsFileMutation: true,
      requiresApproval: true,
      unsafeFallback: false,
      verificationCommand: {
        command: 'sh',
        args: ['-lc', 'test -f /.dockerenv || test "$MAINSPRING_CONTAINERIZED" = "1"'],
      },
      limits: [
        'Execution runs inside the Mainspring gateway container.',
        'Network access follows the gateway container network policy.',
        'Workspace paths are container paths, not bare-metal host paths.',
      ],
    }
  }
  return {
    isolationKind: 'host-process',
    isolationStrength: 'none',
    securityBoundary: 'none',
    networkPolicy: 'host-inherited',
    workspaceMapping: 'host-path',
    supportsShell: true,
    supportsTerminal: true,
    supportsFileMutation: true,
    requiresApproval: true,
    unsafeFallback: true,
    verificationCommand: {
      command: platform === 'win32' ? 'cmd.exe' : 'sh',
      args: platform === 'win32' ? ['/c', 'ver'] : ['-lc', 'uname -a'],
    },
    limits: [
      'Host execution is not sandboxed.',
      'Network, filesystem, and process access inherit the host user context.',
      'Approval gating reduces accidental execution but is not containment.',
    ],
  }
}

export function executionBackendCapabilities(
  backend: ProcessExecutionBackend,
  platform: NodeJS.Platform = process.platform,
): ExecutionBackendCapabilities {
  const key = assertSafeExecutionBackendId(backend)
  if (key === 'host' || key === 'wsl' || key === 'docker') {
    return builtinExecutionBackendCapabilities(key, platform)
  }
  const adapter = getDefaultExecutionBackendRegistry().get(key)
  if (!adapter) throw new Error(`Unknown execution backend: ${key}`)
  return adapter.capabilities(platform)
}

const hostExecutionBackendAdapter: ExecutionBackendAdapter = {
  key: 'host',
  label: (platform) =>
    isContainerizedRuntime()
      ? 'Gateway container shell'
      : platform === 'win32' ? 'Host shell (Windows)' : `Host shell (${platform})`,
  inspect: (platform) => ({
    key: 'host',
    label: isContainerizedRuntime()
      ? 'Gateway container shell'
      : platform === 'win32' ? 'Host shell (Windows)' : `Host shell (${platform})`,
    available: true,
    unsafe: !isContainerizedRuntime(),
    capabilities: builtinExecutionBackendCapabilities('host', platform),
    reason: isContainerizedRuntime()
      ? 'Process execution is confined to the running Mainspring gateway container.'
      : 'Host process execution is available but not isolated.',
  }),
  capabilities: (platform) => builtinExecutionBackendCapabilities('host', platform),
  spawnSpec: (input) => [
    input.command,
    [],
    {
      cwd: input.cwd,
      shell: true,
      windowsHide: true,
      env: input.env,
    },
  ],
}

const wslExecutionBackendAdapter: ExecutionBackendAdapter = {
  key: 'wsl',
  label: () => 'WSL bash',
  inspect: inspectWslBackend,
  capabilities: (platform) => builtinExecutionBackendCapabilities('wsl', platform),
  spawnSpec: (input) => {
    const script = `cd ${shellSingleQuote(toWslPath(input.cwd))} && ${input.command}`
    return [
      'wsl.exe',
      ['bash', '-lc', script],
      {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env: input.env,
      },
    ]
  },
}

const dockerExecutionBackendAdapter: ExecutionBackendAdapter = {
  key: 'docker',
  label: () => 'Docker Linux container',
  inspect: inspectDockerBackend,
  capabilities: (platform) => builtinExecutionBackendCapabilities('docker', platform),
  spawnSpec: (input) => {
    const workspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const relative = path.relative(workspaceRoot, input.cwd).replace(/\\/g, '/')
    const containerCwd = relative && !relative.startsWith('..') ? `/workspace/${relative}` : '/workspace'
    return [
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--security-opt',
        'no-new-privileges',
        '--cap-drop',
        'ALL',
        '--pids-limit',
        '256',
        '-v',
        `${workspaceRoot}:/workspace`,
        '-w',
        containerCwd,
        input.dockerImage ?? 'node:22-alpine',
        'sh',
        '-lc',
        input.command,
      ],
      {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env: input.env,
      },
    ]
  },
}

function compactReason(value: string): string | undefined {
  const normalized = value.replace(/\0/g, '').replace(/\s+/g, ' ').trim()
  return normalized || undefined
}
