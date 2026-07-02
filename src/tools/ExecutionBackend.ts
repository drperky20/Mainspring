import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const PROCESS_EXECUTION_BACKENDS = ['host', 'wsl', 'docker'] as const

export type ProcessExecutionBackend = (typeof PROCESS_EXECUTION_BACKENDS)[number]
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
}

export interface ResolveExecutionBackendOptions {
  preferredBackend?: ProcessExecutionBackendPreference
  probe?: () => ExecutionBackendInventory
}

export function parseExecutionBackendPreference(
  value: unknown,
): ProcessExecutionBackendPreference | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (
    normalized === 'auto'
    || normalized === 'host'
    || normalized === 'wsl'
    || normalized === 'docker'
  ) {
    return normalized
  }
  throw new Error('Execution backend must be one of: auto, host, wsl, docker.')
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
  const host: ExecutionBackendStatus = {
    key: 'host',
    label: platform === 'win32' ? 'Host shell (Windows)' : `Host shell (${platform})`,
    available: true,
    unsafe: true,
    capabilities: executionBackendCapabilities('host', platform),
    reason: 'Host process execution is available but not isolated.',
  }
  const wsl = inspectWslBackend(platform)
  const docker = inspectDockerBackend()
  return {
    defaultBackend: 'host',
    backends: [host, wsl, docker],
  }
}

export function resolveExecutionBackend(
  options: ResolveExecutionBackendOptions = {},
): ResolvedExecutionBackend {
  const preferredBackend = options.preferredBackend ?? 'auto'
  if (!options.probe && preferredBackend === 'auto') {
    return {
      key: 'host',
      label: process.platform === 'win32' ? 'Host shell (Windows)' : `Host shell (${process.platform})`,
      unsafe: true,
      capabilities: executionBackendCapabilities('host', process.platform),
    }
  }
  if (!options.probe && preferredBackend !== 'auto') {
    const status =
      preferredBackend === 'host'
        ? {
            key: 'host' as const,
            label:
              process.platform === 'win32'
                ? 'Host shell (Windows)'
                : `Host shell (${process.platform})`,
            available: true,
            unsafe: true,
            capabilities: executionBackendCapabilities('host', process.platform),
            reason: 'Host process execution is available but not isolated.',
          }
        : preferredBackend === 'wsl'
          ? inspectWslBackend(process.platform)
          : inspectDockerBackend()
    if (!status.available) {
      throw new Error(
        `Execution backend "${preferredBackend}" is unavailable: ${status.reason ?? 'unknown reason'}`,
      )
    }
    return {
      key: status.key,
      label: status.label,
      unsafe: status.unsafe,
      capabilities: status.capabilities,
    }
  }

  const probe = options.probe
  if (!probe) throw new Error('Execution backend probe is required for this resolution path.')
  const inventory = probe()
  if (preferredBackend === 'auto') {
    const defaultStatus = inventory.backends.find(
      (backend) => backend.key === inventory.defaultBackend,
    )
    if (!defaultStatus?.available) {
      throw new Error(`Default execution backend unavailable: ${inventory.defaultBackend}.`)
    }
    return {
      key: defaultStatus.key,
      label: defaultStatus.label,
      unsafe: defaultStatus.unsafe,
      capabilities: defaultStatus.capabilities,
    }
  }
  const status = inventory.backends.find((backend) => backend.key === preferredBackend)
  if (!status) {
    throw new Error(`Unknown execution backend: ${preferredBackend}`)
  }
  if (!status.available) {
    throw new Error(
      `Execution backend "${preferredBackend}" is unavailable: ${status.reason ?? 'unknown reason'}`,
    )
  }
  return {
    key: status.key,
    label: status.label,
    unsafe: status.unsafe,
    capabilities: status.capabilities,
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

function inspectDockerBackend(): ExecutionBackendStatus {
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
      capabilities: executionBackendCapabilities('docker', process.platform),
      reason: compactReason(probe.error.message),
    }
  }
  if (probe.status !== 0) {
    return {
      key: 'docker',
      label: 'Docker Linux container',
      available: false,
      unsafe: false,
      capabilities: executionBackendCapabilities('docker', process.platform),
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
      capabilities: executionBackendCapabilities('docker', process.platform),
      reason: `Docker is reachable but is not using Linux containers: ${osType ?? 'unknown'}.`,
    }
  }
  return {
    key: 'docker',
    label: 'Docker Linux container',
    available: true,
    unsafe: false,
    capabilities: executionBackendCapabilities('docker', process.platform),
  }
}

export function executionBackendCapabilities(
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

function compactReason(value: string): string | undefined {
  const normalized = value.replace(/\0/g, '').replace(/\s+/g, ' ').trim()
  return normalized || undefined
}
