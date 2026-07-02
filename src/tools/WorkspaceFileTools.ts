import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { summarizeWorkspaceEntry, type WorkspaceFileState } from './FileState.js'
import { resolveWorkspacePath } from './PathSecurity.js'
import {
  boundedPositiveInt,
  capBuffer,
  DEFAULT_FILE_READ_MAX_BYTES,
  MAX_FILE_READ_MAX_BYTES,
} from './ToolOutputLimits.js'
import { DEFAULT_DOCKER_CELL_IMAGE } from './ProcessRegistry.js'
import {
  resolveExecutionBackend,
  shellSingleQuote,
  summarizeExecutionBackendCapabilities,
  toWslPath,
  type ExecutionBackendCapabilitySummary,
  type ProcessExecutionBackend,
  type ProcessExecutionBackendPreference,
  type ResolvedExecutionBackend,
  type ResolveExecutionBackendOptions,
} from './ExecutionBackend.js'

export class FileToolError extends Error {
  constructor(
    readonly code:
      | 'file_not_found'
      | 'file_is_directory'
      | 'file_is_binary'
      | 'path_escape'
      | 'invalid_input',
    message: string,
  ) {
    super(message)
    this.name = 'FileToolError'
  }
}

export interface WorkspaceReadResult {
  path: string
  binary: boolean
  encoding: 'utf8' | null
  bytes: number
  truncated: boolean
  extension: string | null
  lineCount: number | null
  text?: string
}

export interface WorkspaceWriteResult {
  path: string
  bytes: number
  created: boolean
  backend?: ProcessExecutionBackend
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ExecutionBackendCapabilitySummary
}

export interface WorkspaceAppendResult extends WorkspaceWriteResult {
  appendedBytes: number
}

export interface WorkspaceMkdirResult {
  path: string
  created: boolean
  backend?: ProcessExecutionBackend
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ExecutionBackendCapabilitySummary
}

export interface WorkspaceMoveResult {
  fromPath: string
  toPath: string
  createdParentDirectories: boolean
  backend?: ProcessExecutionBackend
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ExecutionBackendCapabilitySummary
}

export interface WorkspaceDeleteResult {
  path: string
  deleted: boolean
  entryType: 'file' | 'directory'
  recursive: boolean
  backend?: ProcessExecutionBackend
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ExecutionBackendCapabilitySummary
}

export interface WorkspacePatchOperation {
  find: string
  replace: string
  all?: boolean
}

export interface WorkspacePatchResult {
  path: string
  replacements: number
  bytes: number
  backend?: ProcessExecutionBackend
  backendLabel?: string
  backendUnsafe?: boolean
  backendCapabilities?: ExecutionBackendCapabilitySummary
}

export interface WorkspaceMutationBackendOptions {
  preferredBackend?: ProcessExecutionBackendPreference
  resolveBackend?: (options: ResolveExecutionBackendOptions) => ResolvedExecutionBackend
  executorForBackend?: (backend: ResolvedExecutionBackend) => WorkspaceMutationExecutor | null
}

export interface WorkspaceMutationExecutor {
  write(input: { absolutePath: string; text: string }): void
  append(input: { absolutePath: string; text: string }): void
  mkdir(input: { absolutePath: string }): void
  move(input: { fromAbsolutePath: string; toAbsolutePath: string }): void
  delete(input: { absolutePath: string; entryType: 'file' | 'directory'; recursive: boolean }): void
}

function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function fileTarget(workspaceRoot: string, candidatePath: string) {
  try {
    return resolveWorkspacePath(workspaceRoot, candidatePath)
  } catch (error) {
    throw new FileToolError('path_escape', ensureError(error).message)
  }
}

function fileText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return JSON.stringify(value ?? '')
}

function withBackendMetadata<T extends Record<string, unknown>>(
  value: T,
  backend: ResolvedExecutionBackend,
): T & {
  backend: ProcessExecutionBackend
  backendLabel: string
  backendUnsafe: boolean
  backendCapabilities: ExecutionBackendCapabilitySummary
} {
  return {
    ...value,
    backend: backend.key,
    backendLabel: backend.label,
    backendUnsafe: backend.unsafe,
    backendCapabilities: summarizeExecutionBackendCapabilities(backend.capabilities),
  }
}

function hostMutationExecutor(): WorkspaceMutationExecutor {
  return {
    write({ absolutePath, text }) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.writeFileSync(absolutePath, text)
    },
    append({ absolutePath, text }) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.appendFileSync(absolutePath, text)
    },
    mkdir({ absolutePath }) {
      fs.mkdirSync(absolutePath, { recursive: true })
    },
    move({ fromAbsolutePath, toAbsolutePath }) {
      fs.mkdirSync(path.dirname(toAbsolutePath), { recursive: true })
      fs.renameSync(fromAbsolutePath, toAbsolutePath)
    },
    delete({ absolutePath, entryType, recursive }) {
      fs.rmSync(absolutePath, {
        recursive: entryType === 'directory' ? recursive : false,
        force: false,
      })
    },
  }
}

function runWslWorkspaceCommand(input: {
  workspaceRoot: string
  script: string
}): void {
  execFileSync(
    'wsl.exe',
    ['bash', '-lc', `cd ${shellSingleQuote(toWslPath(input.workspaceRoot))} && ${input.script}`],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    },
  )
}

function wslMutationExecutor(workspaceRoot: string): WorkspaceMutationExecutor {
  return {
    write({ absolutePath, text }) {
      const encoded = Buffer.from(text, 'utf8').toString('base64')
      const wslPath = toWslPath(absolutePath)
      const wslParent = toWslPath(path.dirname(absolutePath))
      runWslWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(wslParent)} && printf %s ${shellSingleQuote(encoded)} | base64 -d > ${shellSingleQuote(wslPath)}`,
      })
    },
    append({ absolutePath, text }) {
      const encoded = Buffer.from(text, 'utf8').toString('base64')
      const wslPath = toWslPath(absolutePath)
      const wslParent = toWslPath(path.dirname(absolutePath))
      runWslWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(wslParent)} && printf %s ${shellSingleQuote(encoded)} | base64 -d >> ${shellSingleQuote(wslPath)}`,
      })
    },
    mkdir({ absolutePath }) {
      runWslWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(toWslPath(absolutePath))}`,
      })
    },
    move({ fromAbsolutePath, toAbsolutePath }) {
      runWslWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(toWslPath(path.dirname(toAbsolutePath)))} && mv ${shellSingleQuote(toWslPath(fromAbsolutePath))} ${shellSingleQuote(toWslPath(toAbsolutePath))}`,
      })
    },
    delete({ absolutePath, entryType, recursive }) {
      const wslPath = toWslPath(absolutePath)
      const script =
        entryType === 'directory' && !recursive
          ? `rmdir ${shellSingleQuote(wslPath)}`
          : `rm ${entryType === 'directory' ? '-rf' : '-f'} ${shellSingleQuote(wslPath)}`
      runWslWorkspaceCommand({ workspaceRoot, script })
    },
  }
}

function runDockerWorkspaceCommand(input: {
  workspaceRoot: string
  script: string
}): void {
  execFileSync(
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
      `${fs.realpathSync.native(input.workspaceRoot)}:/workspace`,
      '-w',
      '/workspace',
      process.env.MAINSPRING_DOCKER_CELL_IMAGE || DEFAULT_DOCKER_CELL_IMAGE,
      'sh',
      '-lc',
      input.script,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    },
  )
}

function dockerRelativePath(workspaceRoot: string, absolutePath: string): string {
  const relative = path.relative(fs.realpathSync.native(workspaceRoot), path.resolve(absolutePath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Docker workspace mutation path must stay inside the workspace root.')
  }
  return relative.replace(/\\/g, '/')
}

function dockerMutationExecutor(workspaceRoot: string): WorkspaceMutationExecutor {
  return {
    write({ absolutePath, text }) {
      const encoded = Buffer.from(text, 'utf8').toString('base64')
      const relativePath = dockerRelativePath(workspaceRoot, absolutePath)
      runDockerWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(path.posix.dirname(relativePath))} && printf %s ${shellSingleQuote(encoded)} | base64 -d > ${shellSingleQuote(relativePath)}`,
      })
    },
    append({ absolutePath, text }) {
      const encoded = Buffer.from(text, 'utf8').toString('base64')
      const relativePath = dockerRelativePath(workspaceRoot, absolutePath)
      runDockerWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(path.posix.dirname(relativePath))} && printf %s ${shellSingleQuote(encoded)} | base64 -d >> ${shellSingleQuote(relativePath)}`,
      })
    },
    mkdir({ absolutePath }) {
      runDockerWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(dockerRelativePath(workspaceRoot, absolutePath))}`,
      })
    },
    move({ fromAbsolutePath, toAbsolutePath }) {
      const toPath = dockerRelativePath(workspaceRoot, toAbsolutePath)
      runDockerWorkspaceCommand({
        workspaceRoot,
        script: `mkdir -p ${shellSingleQuote(path.posix.dirname(toPath))} && mv ${shellSingleQuote(dockerRelativePath(workspaceRoot, fromAbsolutePath))} ${shellSingleQuote(toPath)}`,
      })
    },
    delete({ absolutePath, entryType, recursive }) {
      const relativePath = dockerRelativePath(workspaceRoot, absolutePath)
      const script =
        entryType === 'directory' && !recursive
          ? `rmdir ${shellSingleQuote(relativePath)}`
          : `rm ${entryType === 'directory' ? '-rf' : '-f'} ${shellSingleQuote(relativePath)}`
      runDockerWorkspaceCommand({ workspaceRoot, script })
    },
  }
}

function resolveMutationExecutor(
  workspaceRoot: string,
  options: WorkspaceMutationBackendOptions | undefined,
): { backend: ResolvedExecutionBackend; executor: WorkspaceMutationExecutor } {
  const backend =
    options?.resolveBackend?.({ preferredBackend: options?.preferredBackend ?? 'auto' })
    ?? resolveExecutionBackend({ preferredBackend: options?.preferredBackend ?? 'auto' })
  const executor =
    options?.executorForBackend?.(backend)
    ?? (backend.key === 'wsl'
      ? wslMutationExecutor(workspaceRoot)
      : backend.key === 'docker'
        ? dockerMutationExecutor(workspaceRoot)
        : hostMutationExecutor())
  if (!executor) {
    throw new Error(`No workspace mutation executor is configured for backend ${backend.key}.`)
  }
  return { backend, executor }
}

export function fileReadMaxBytes(input: unknown): number {
  return boundedPositiveInt(input, DEFAULT_FILE_READ_MAX_BYTES, MAX_FILE_READ_MAX_BYTES)
}

export function readWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  maxBytes = DEFAULT_FILE_READ_MAX_BYTES,
): WorkspaceReadResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  if (!fs.existsSync(target.absolutePath)) {
    throw new FileToolError('file_not_found', `Workspace file does not exist: ${target.relativePath}`)
  }

  const stats = fs.statSync(target.absolutePath)
  if (stats.isDirectory()) {
    throw new FileToolError(
      'file_is_directory',
      `Workspace file path is a directory: ${target.relativePath}`,
    )
  }

  const raw = fs.readFileSync(target.absolutePath)
  const summary = summarizeWorkspaceEntry(target.relativePath, target.absolutePath)
  const capped = capBuffer(raw, maxBytes)
  if (summary.binary) {
    return {
      path: target.relativePath,
      binary: true,
      encoding: null,
      bytes: raw.byteLength,
      truncated: capped.truncated,
      extension: summary.extension,
      lineCount: null,
    }
  }

  const text = capped.buffer.toString('utf8')
  return {
    path: target.relativePath,
    binary: false,
    encoding: 'utf8',
    bytes: raw.byteLength,
    truncated: capped.truncated,
    extension: summary.extension,
    lineCount: text.length > 0 ? text.split(/\r?\n/).length : 0,
    text,
  }
}

export function writeWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  data: unknown,
  options?: WorkspaceMutationBackendOptions,
): WorkspaceWriteResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  const created = !fs.existsSync(target.absolutePath)
  const text = fileText(data)
  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.write({ absolutePath: target.absolutePath, text })
  return withBackendMetadata({
    path: target.relativePath,
    bytes: Buffer.byteLength(text),
    created,
  }, backend)
}

export function appendWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  data: unknown,
  options?: WorkspaceMutationBackendOptions,
): WorkspaceAppendResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  const created = !fs.existsSync(target.absolutePath)
  const text = fileText(data)
  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.append({ absolutePath: target.absolutePath, text })
  const bytes = Buffer.byteLength(fs.readFileSync(target.absolutePath))
  return withBackendMetadata({
    path: target.relativePath,
    bytes,
    appendedBytes: Buffer.byteLength(text),
    created,
  }, backend)
}

export function mkdirWorkspacePath(
  workspaceRoot: string,
  candidatePath: string,
  options?: WorkspaceMutationBackendOptions,
): WorkspaceMkdirResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  const created = !fs.existsSync(target.absolutePath)
  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.mkdir({ absolutePath: target.absolutePath })
  return withBackendMetadata({
    path: target.relativePath,
    created,
  }, backend)
}

export function statWorkspaceEntry(
  workspaceRoot: string,
  candidatePath: string,
): WorkspaceFileState {
  const target = fileTarget(workspaceRoot, candidatePath)
  return summarizeWorkspaceEntry(target.relativePath, target.absolutePath)
}

export function moveWorkspaceEntry(
  workspaceRoot: string,
  fromCandidatePath: string,
  toCandidatePath: string,
  options?: WorkspaceMutationBackendOptions,
): WorkspaceMoveResult {
  const fromTarget = fileTarget(workspaceRoot, fromCandidatePath)
  const toTarget = fileTarget(workspaceRoot, toCandidatePath)
  if (!fs.existsSync(fromTarget.absolutePath)) {
    throw new FileToolError(
      'file_not_found',
      `Workspace entry does not exist: ${fromTarget.relativePath}`,
    )
  }

  const parentDirectory = path.dirname(toTarget.absolutePath)
  const createdParentDirectories = !fs.existsSync(parentDirectory)
  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.move({
    fromAbsolutePath: fromTarget.absolutePath,
    toAbsolutePath: toTarget.absolutePath,
  })
  return withBackendMetadata({
    fromPath: fromTarget.relativePath,
    toPath: toTarget.relativePath,
    createdParentDirectories,
  }, backend)
}

export function deleteWorkspaceEntry(
  workspaceRoot: string,
  candidatePath: string,
  recursive = false,
  options?: WorkspaceMutationBackendOptions,
): WorkspaceDeleteResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  if (!fs.existsSync(target.absolutePath)) {
    throw new FileToolError(
      'file_not_found',
      `Workspace entry does not exist: ${target.relativePath}`,
    )
  }

  const stats = fs.statSync(target.absolutePath)
  const entryType: WorkspaceDeleteResult['entryType'] = stats.isDirectory()
    ? 'directory'
    : 'file'
  if (entryType === 'directory' && !recursive) {
    const entries = fs.readdirSync(target.absolutePath)
    if (entries.length > 0) {
      throw new FileToolError(
        'invalid_input',
        `Workspace directory is not empty: ${target.relativePath}. Set recursive=true to delete it.`,
      )
    }
  }

  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.delete({
    absolutePath: target.absolutePath,
    entryType,
    recursive,
  })
  return withBackendMetadata({
    path: target.relativePath,
    deleted: true,
    entryType,
    recursive,
  }, backend)
}

export function patchWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  operations: readonly WorkspacePatchOperation[],
  options?: WorkspaceMutationBackendOptions,
): WorkspacePatchResult {
  const target = fileTarget(workspaceRoot, candidatePath)
  if (!fs.existsSync(target.absolutePath)) {
    throw new FileToolError(
      'file_not_found',
      `Workspace file does not exist: ${target.relativePath}`,
    )
  }

  const summary = summarizeWorkspaceEntry(target.relativePath, target.absolutePath)
  if (summary.entryType === 'directory') {
    throw new FileToolError(
      'file_is_directory',
      `Workspace file path is a directory: ${target.relativePath}`,
    )
  }
  if (summary.binary) {
    throw new FileToolError(
      'file_is_binary',
      `Workspace file appears to be binary: ${target.relativePath}`,
    )
  }
  if (operations.length === 0) {
    throw new FileToolError('invalid_input', 'Workspace patch operations must not be empty.')
  }

  let text = fs.readFileSync(target.absolutePath, 'utf8')
  let replacements = 0
  for (const operation of operations) {
    if (!operation.find) {
      throw new FileToolError('invalid_input', 'Workspace patch find text must be non-empty.')
    }
    if (operation.all) {
      const parts = text.split(operation.find)
      const matches = parts.length - 1
      if (matches === 0) {
        throw new FileToolError(
          'invalid_input',
          `Workspace patch text not found in ${target.relativePath}: ${operation.find}`,
        )
      }
      text = parts.join(operation.replace)
      replacements += matches
      continue
    }

    const firstIndex = text.indexOf(operation.find)
    if (firstIndex < 0) {
      throw new FileToolError(
        'invalid_input',
        `Workspace patch text not found in ${target.relativePath}: ${operation.find}`,
      )
    }
    text =
      text.slice(0, firstIndex) +
      operation.replace +
      text.slice(firstIndex + operation.find.length)
    replacements += 1
  }

  const { backend, executor } = resolveMutationExecutor(workspaceRoot, options)
  executor.write({ absolutePath: target.absolutePath, text })
  return withBackendMetadata({
    path: target.relativePath,
    replacements,
    bytes: Buffer.byteLength(text),
  }, backend)
}
