import { sanitizeRuntimeResponse } from '#protocol'
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  getDefaultProcessRegistry,
  MAX_COMMAND_LENGTH,
  MAX_OUTPUT_BYTES,
  MAX_TIMEOUT_MS,
  type ProcessRegistry,
} from './ProcessRegistry.js'
import {
  backendPreferenceFromComputerId,
  parseExecutionBackendPreference,
  type ProcessExecutionBackendPreference,
} from './ExecutionBackend.js'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

function inputCommand(input: unknown): string {
  const command = inputRecord(input, 'Shell tool input must be an object.').command
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('Shell exec input.command must be a non-empty string.')
  }
  const trimmed = command.trim()
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    throw new Error(`Shell exec input.command must be ${MAX_COMMAND_LENGTH} characters or fewer.`)
  }
  return trimmed
}

export interface ShellToolOptions {
  timeoutMs?: number
  maxOutputBytes?: number
  backend?: ProcessExecutionBackendPreference
  processRegistry?: ProcessRegistry
}

export function createShellTool(options: ShellToolOptions = {}): RuntimeTool {
  const registry = options.processRegistry ?? getDefaultProcessRegistry()
  return {
    manifest: builtinManifest({
      key: 'shell.exec',
      name: 'Shell Command',
      description:
        'Requests execution of a shell command through an approved host runtime adapter. Host process execution is not a sandbox.',
      permissions: { shell: true, filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'shell',
    }),
    execute: async (context) => {
      const { input, runId, workspaceRoot } = context
      const record = inputRecord(input, 'Shell tool input must be an object.')
      const started = registry.start({
        runId,
        workspaceRoot,
        command: inputCommand(input),
        ...(typeof record.cwd === 'string' && record.cwd.trim() ? { cwd: record.cwd.trim() } : {}),
        backend:
          parseExecutionBackendPreference(record.backend)
          ?? options.backend
          ?? backendPreferenceFromComputerId(context.computerId),
        timeoutMs: positiveInt(
          record.timeoutMs,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          MAX_TIMEOUT_MS,
        ),
        maxOutputBytes: positiveInt(
          record.maxOutputBytes,
          options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
          MAX_OUTPUT_BYTES,
        ),
      })
      const result = await registry.waitForExit(runId, started.sessionId, workspaceRoot)
      return sanitizeRuntimeResponse(result)
    },
  }
}
