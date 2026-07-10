import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createMainspringRuntimeId } from '#protocol'
import {
  resolveExecutionBackend,
  shellSingleQuote,
  summarizeExecutionBackendCapabilities,
  toWslPath,
  type ExecutionBackendCapabilitySummary,
  type ExecutionBackendSpawnSpec,
  type ProcessExecutionBackend,
  type ProcessExecutionBackendPreference,
  type ResolvedExecutionBackend,
  type ResolveExecutionBackendOptions,
} from './ExecutionBackend.js'

export const DEFAULT_TIMEOUT_MS = 15_000
export const MAX_TIMEOUT_MS = 60_000
export const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024
export const MAX_OUTPUT_BYTES = 128 * 1024
export const MAX_COMMAND_LENGTH = 8_000
export const DEFAULT_DOCKER_CELL_IMAGE = 'node:22-alpine'

const SAFE_ENV_KEYS = new Set([
  'APPDATA',
  'CI',
  'COMSPEC',
  'ComSpec',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATHEXT',
  'PATH',
  'Path',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'SHELL',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
  'windir',
])
const SECRET_ENV_KEY_PATTERN =
  /(ANTHROPIC|AWS_|AZURE_|MAINSPRING|GEMINI|GOOGLE_API|KEY|OPENAI|OPENROUTER|PASSWORD|SECRET|TOKEN)/i

export interface ProcessStartInput {
  runId: string
  workspaceRoot: string
  command: string
  cwd?: string
  backend?: ProcessExecutionBackendPreference
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface ProcessSnapshot {
  sessionId: string
  runId: string
  command: string
  cwd: string
  startedAt: string
  completedAt?: string
  backend: ProcessExecutionBackend
  backendLabel: string
  backendUnsafe: boolean
  backendCapabilities: ExecutionBackendCapabilitySummary
  executionCell: {
    cellKey: string
    label: string
    backend: ProcessExecutionBackend
    backendLabel: string
    backendUnsafe: boolean
    backendCapabilities: ExecutionBackendCapabilitySummary
  }
  executionLease: {
    leaseId: string
    cellKey: string
    status: 'active' | 'released'
    acquiredAt: string
    releasedAt?: string
  }
  status: 'running' | 'completed' | 'failed' | 'terminated' | 'timed_out'
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  stdout: string
  stderr: string
  truncated: boolean
  pid?: number
}

interface ProcessRecord {
  sessionId: string
  runId: string
  command: string
  cwd: string
  startedAt: string
  completedAt?: string
  backend: ResolvedExecutionBackend
  child: ChildProcess
  timeoutMs: number
  maxOutputBytes: number
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
  status: ProcessSnapshot['status']
  exitCode: number | null
  signal: NodeJS.Signals | null
  completion: Promise<ProcessSnapshot>
}

function buildShellEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NO_COLOR: '1' }
  for (const key of SAFE_ENV_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value && !SECRET_ENV_KEY_PATTERN.test(key)) {
      env[key] = value
    }
  }
  return env
}

function appendCapped(
  current: string,
  chunk: Buffer,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const currentBytes = Buffer.byteLength(current)
  if (currentBytes >= maxBytes) return { value: current, truncated: true }
  const remaining = maxBytes - currentBytes
  if (chunk.byteLength <= remaining) {
    return { value: current + chunk.toString('utf8'), truncated: false }
  }
  return {
    value: current + chunk.subarray(0, remaining).toString('utf8'),
    truncated: true,
  }
}

function ensureCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) throw new Error('Terminal input.command must be a non-empty string.')
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    throw new Error(`Terminal input.command must be ${MAX_COMMAND_LENGTH} characters or fewer.`)
  }
  return trimmed
}

function boundedPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback
}

function ensureContainedCwd(workspaceRoot: string, cwd?: string): string {
  const root = fs.realpathSync.native(workspaceRoot)
  const resolved = cwd ? path.resolve(root, cwd) : root
  const containedCandidate = fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved
  const relative = path.relative(root, containedCandidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Terminal working directory must stay inside the workspace root.')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Terminal working directory does not exist: ${cwd ?? '.'}`)
  }
  const real = fs.realpathSync.native(resolved)
  const realRelative = path.relative(root, real)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('Terminal working directory must stay inside the workspace root.')
  }
  return real
}

function relativeCwd(workspaceRoot: string, cwd: string): string {
  const relative = path.relative(workspaceRoot, cwd)
  return relative && !relative.startsWith('..') ? relative.replace(/\\/g, '/') : 'workspace'
}

function containedExistingRelativePath(
  rootPath: string,
  candidatePath: string,
  errorMessage: string,
): string {
  const root = fs.realpathSync.native(rootPath)
  const candidate = fs.realpathSync.native(candidatePath)
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(errorMessage)
  }
  return relative.replace(/\\/g, '/')
}

function executionCellKey(workspaceRoot: string, backend: ProcessExecutionBackend): string {
  const digest = createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 12)
  return `cell_exec_${backend}_${digest}`
}

function executionLeaseId(sessionId: string): string {
  return `lease_exec_${sessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export class ProcessRegistry {
  private readonly processes = new Map<string, ProcessRecord>()

  constructor(
    private readonly options: {
      resolveBackend?: (options: ResolveExecutionBackendOptions) => ResolvedExecutionBackend
    } = {},
  ) {}

  start(input: ProcessStartInput): { sessionId: string; snapshot: ProcessSnapshot } {
    const workspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const command = ensureCommand(input.command)
    const cwd = ensureContainedCwd(workspaceRoot, input.cwd)
    const backend =
      this.options.resolveBackend?.({ preferredBackend: input.backend })
      ?? resolveExecutionBackend({ preferredBackend: input.backend })
    const timeoutMs = boundedPositiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
    const maxOutputBytes = boundedPositiveInt(
      input.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
    )
    const sessionId = createMainspringRuntimeId('terminal')
    const startedAt = new Date().toISOString()
    const child = spawn(...processSpawnSpecForBackend({ backend, command, cwd, workspaceRoot }))

    let resolveCompletion: (snapshot: ProcessSnapshot) => void = () => {}
    const completion = new Promise<ProcessSnapshot>((resolve) => {
      resolveCompletion = resolve
    })

    const record: ProcessRecord = {
      sessionId,
      runId: input.runId,
      command,
      cwd,
      startedAt,
      backend,
      child,
      timeoutMs,
      maxOutputBytes,
      stdout: '',
      stderr: '',
      truncated: false,
      timedOut: false,
      status: 'running',
      exitCode: null,
      signal: null,
      completion,
    }

    const timer = setTimeout(() => {
      record.timedOut = true
      record.status = 'timed_out'
      record.completedAt = new Date().toISOString()
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      const appended = appendCapped(record.stdout, chunk, maxOutputBytes)
      record.stdout = appended.value
      record.truncated = record.truncated || appended.truncated
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const appended = appendCapped(record.stderr, chunk, maxOutputBytes)
      record.stderr = appended.value
      record.truncated = record.truncated || appended.truncated
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      record.status = 'failed'
      record.completedAt = new Date().toISOString()
      record.stderr = `${record.stderr}${record.stderr ? '\n' : ''}${String(error)}`
      resolveCompletion(this.snapshot(record, workspaceRoot))
    })
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      record.exitCode = exitCode
      record.signal = signal
      record.completedAt ??= new Date().toISOString()
      if (record.status === 'terminated' || record.status === 'timed_out') {
        resolveCompletion(this.snapshot(record, workspaceRoot))
        return
      }
      record.status = exitCode === 0 ? 'completed' : 'failed'
      resolveCompletion(this.snapshot(record, workspaceRoot))
    })

    this.processes.set(sessionId, record)
    return { sessionId, snapshot: this.snapshot(record, workspaceRoot) }
  }

  get(runId: string, sessionId: string, workspaceRoot: string): ProcessSnapshot {
    const record = this.requireProcess(runId, sessionId)
    return this.snapshot(record, fs.realpathSync.native(workspaceRoot))
  }

  async waitForExit(runId: string, sessionId: string, workspaceRoot: string): Promise<ProcessSnapshot> {
    const record = this.requireProcess(runId, sessionId)
    await record.completion
    return this.snapshot(record, fs.realpathSync.native(workspaceRoot))
  }

  terminate(runId: string, sessionId: string, workspaceRoot: string): ProcessSnapshot {
    const record = this.requireProcess(runId, sessionId)
    if (record.status === 'running') {
      record.status = 'terminated'
      record.completedAt = new Date().toISOString()
      record.child.kill()
    }
    return this.snapshot(record, fs.realpathSync.native(workspaceRoot))
  }

  private requireProcess(runId: string, sessionId: string): ProcessRecord {
    const record = this.processes.get(sessionId)
    if (!record || record.runId !== runId) {
      throw new Error(`Unknown terminal session: ${sessionId}`)
    }
    return record
  }

  private snapshot(record: ProcessRecord, workspaceRoot: string): ProcessSnapshot {
    const cellKey = executionCellKey(workspaceRoot, record.backend.key)
    const leaseId = executionLeaseId(record.sessionId)
    const leaseStatus = record.status === 'running' ? 'active' : 'released'
    return {
      sessionId: record.sessionId,
      runId: record.runId,
      command: record.command,
      cwd: relativeCwd(workspaceRoot, record.cwd),
      startedAt: record.startedAt,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      backend: record.backend.key,
      backendLabel: record.backend.label,
      backendUnsafe: record.backend.unsafe,
      backendCapabilities: summarizeExecutionBackendCapabilities(record.backend.capabilities),
      executionCell: {
        cellKey,
        label: record.backend.label,
        backend: record.backend.key,
        backendLabel: record.backend.label,
        backendUnsafe: record.backend.unsafe,
        backendCapabilities: summarizeExecutionBackendCapabilities(record.backend.capabilities),
      },
      executionLease: {
        leaseId,
        cellKey,
        status: leaseStatus,
        acquiredAt: record.startedAt,
        ...(record.completedAt ? { releasedAt: record.completedAt } : {}),
      },
      status: record.status,
      exitCode: record.exitCode,
      signal: record.signal,
      timedOut: record.timedOut,
      stdout: record.stdout,
      stderr: record.stderr,
      truncated: record.truncated,
      ...(typeof record.child.pid === 'number' ? { pid: record.child.pid } : {}),
    }
  }
}

export function processSpawnSpecForBackend(input: {
  backend: ResolvedExecutionBackend
  command: string
  cwd: string
  workspaceRoot: string
}): ExecutionBackendSpawnSpec {
  const env = buildShellEnv()
  if (input.backend.spawnSpec) {
    return input.backend.spawnSpec({
      command: input.command,
      cwd: input.cwd,
      workspaceRoot: input.workspaceRoot,
      env,
      dockerImage: process.env.MAINSPRING_DOCKER_CELL_IMAGE || DEFAULT_DOCKER_CELL_IMAGE,
    })
  }
  if (input.backend.key === 'wsl') {
    const script = `cd ${shellSingleQuote(toWslPath(input.cwd))} && ${input.command}`
    return [
      'wsl.exe',
      ['bash', '-lc', script],
      {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env,
      },
    ]
  }
  if (input.backend.key === 'docker') {
    const workspaceRoot = fs.realpathSync.native(input.workspaceRoot)
    const relative = containedExistingRelativePath(
      workspaceRoot,
      input.cwd,
      'Docker process cwd must stay inside the workspace root.',
    )
    const containerCwd = relative ? `/workspace/${relative}` : '/workspace'
    const image = process.env.MAINSPRING_DOCKER_CELL_IMAGE || DEFAULT_DOCKER_CELL_IMAGE
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
        image,
        'sh',
        '-lc',
        input.command,
      ],
      {
        cwd: input.cwd,
        shell: false,
        windowsHide: true,
        env,
      },
    ]
  }
  return [
    input.command,
    [],
    {
      cwd: input.cwd,
      shell: true,
      windowsHide: true,
      env,
    },
  ]
}

let defaultProcessRegistry: ProcessRegistry | null = null

export function getDefaultProcessRegistry(): ProcessRegistry {
  defaultProcessRegistry ??= new ProcessRegistry()
  return defaultProcessRegistry
}
