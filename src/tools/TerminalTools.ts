import { sanitizeRuntimeResponse } from '#protocol'
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  getDefaultProcessRegistry,
  MAX_OUTPUT_BYTES,
  MAX_TIMEOUT_MS,
  type ProcessRegistry,
} from './ProcessRegistry.js'
import {
  backendPreferenceFromComputerId,
  parseExecutionBackendPreference,
  type ProcessExecutionBackendPreference,
} from './ExecutionBackend.js'
import { createReadTerminalTool } from './ReadTerminalTool.js'
import {
  builtinManifest,
  inputRecord,
  positiveInt,
  type RuntimeTool,
} from './ToolRegistry.js'

function terminalInput(input: unknown): {
  command: string
  cwd?: string
  backend?: ProcessExecutionBackendPreference
  timeoutMs: number
  maxOutputBytes: number
} {
  const record = inputRecord(input, 'Terminal input must be an object.')
  if (typeof record.command !== 'string' || !record.command.trim()) {
    throw new Error('Terminal input.command must be a non-empty string.')
  }
  return {
    command: record.command.trim(),
    ...(typeof record.cwd === 'string' && record.cwd.trim() ? { cwd: record.cwd.trim() } : {}),
    ...(parseExecutionBackendPreference(record.backend)
      ? { backend: parseExecutionBackendPreference(record.backend) }
      : {}),
    timeoutMs: positiveInt(record.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxOutputBytes: positiveInt(
      record.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
    ),
  }
}

function sessionIdInput(input: unknown, label: string): string {
  const sessionId = inputRecord(input, `${label} input must be an object.`).sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error(`${label} input.sessionId must be a non-empty string.`)
  }
  return sessionId.trim()
}

export interface TerminalToolOptions {
  backend?: ProcessExecutionBackendPreference
  processRegistry?: ProcessRegistry
}

export function createTerminalTools(options: TerminalToolOptions = {}): RuntimeTool[] {
  const registry = options.processRegistry ?? getDefaultProcessRegistry()
  return [
    {
      manifest: builtinManifest({
        key: 'terminal.start',
        name: 'Start Terminal Session',
        description:
          'Starts an approved host terminal session inside the workspace. Host process execution is not a sandbox.',
        permissions: { shell: true, filesystem: 'workspace-write' },
        approval: { required: true },
        toolType: 'shell',
      }),
      execute: (context) =>
        sanitizeRuntimeResponse(
          registry.start({
            runId: context.runId,
            workspaceRoot: context.workspaceRoot,
            backend: options.backend ?? backendPreferenceFromComputerId(context.computerId),
            ...terminalInput(context.input),
          }).snapshot,
        ),
    },
    createReadTerminalTool(registry),
    {
      manifest: builtinManifest({
        key: 'terminal.terminate',
        name: 'Terminate Terminal Session',
        description: 'Terminates a previously started terminal session for the current run.',
        permissions: { shell: true, filesystem: 'workspace-write' },
        approval: { required: false },
        toolType: 'shell',
      }),
      execute: ({ input, runId, workspaceRoot }) =>
        sanitizeRuntimeResponse(
          registry.terminate(
            runId,
            sessionIdInput(input, 'Terminal terminate'),
            workspaceRoot,
          ),
        ),
    },
  ]
}
