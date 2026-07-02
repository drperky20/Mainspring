import { sanitizeRuntimeResponse } from '#protocol'
import { builtinManifest, inputRecord, type RuntimeTool } from './ToolRegistry.js'
import type { ProcessRegistry } from './ProcessRegistry.js'

function sessionIdInput(input: unknown): string {
  const sessionId = inputRecord(input, 'Terminal read input must be an object.').sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Terminal read input.sessionId must be a non-empty string.')
  }
  return sessionId.trim()
}

export function createReadTerminalTool(registry: ProcessRegistry): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'terminal.read',
      name: 'Read Terminal Session',
      description: 'Reads buffered stdout and stderr from a previously started terminal session.',
      permissions: { shell: true, filesystem: 'workspace-write' },
      approval: { required: false },
      toolType: 'shell',
    }),
    execute: ({ input, runId, workspaceRoot }) =>
      sanitizeRuntimeResponse(registry.get(runId, sessionIdInput(input), workspaceRoot)),
  }
}
