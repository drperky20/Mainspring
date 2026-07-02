import { sanitizeRuntimeResponse } from '#protocol'
import { builtinManifest, inputRecord, type RuntimeTool } from './ToolRegistry.js'
import {
  backendPreferenceFromComputerId,
  parseExecutionBackendPreference,
  type ProcessExecutionBackendPreference,
  type ResolvedExecutionBackend,
  type ResolveExecutionBackendOptions,
} from './ExecutionBackend.js'
import {
  appendWorkspaceFile,
  deleteWorkspaceEntry,
  fileReadMaxBytes,
  mkdirWorkspacePath,
  moveWorkspaceEntry,
  patchWorkspaceFile,
  readWorkspaceFile,
  statWorkspaceEntry,
  writeWorkspaceFile,
  type WorkspaceMutationExecutor,
} from './WorkspaceFileTools.js'

function inputPath(input: unknown, label = 'File tool'): string {
  const value = inputRecord(input, `${label} input must be an object.`).path
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} input.path must be a non-empty string.`)
  }
  return value.trim()
}

function mutationBackendPreference(
  record: Record<string, unknown>,
  computerId: string | undefined,
  fallbackBackend: ProcessExecutionBackendPreference | undefined,
): ProcessExecutionBackendPreference | undefined {
  return (
    parseExecutionBackendPreference(record.backend)
    ?? fallbackBackend
    ?? backendPreferenceFromComputerId(computerId)
  )
}

export interface FileToolOptions {
  mutationBackend?: ProcessExecutionBackendPreference
  resolveMutationBackend?: (options: ResolveExecutionBackendOptions) => ResolvedExecutionBackend
  mutationExecutorForBackend?: (backend: ResolvedExecutionBackend) => WorkspaceMutationExecutor | null
}

export function createFileReadTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.read',
      name: 'Read File',
      description: 'Reads a file from the current Mainspring workspace.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot }) => {
      const record = inputRecord(input, 'File read input must be an object.')
      return sanitizeRuntimeResponse(
        readWorkspaceFile(workspaceRoot, inputPath(input, 'File read'), fileReadMaxBytes(record.maxBytes)),
      )
    },
  }
}

export function createFileStatTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.stat',
      name: 'File State',
      description: 'Returns a safe summary of a file or directory inside the current Mainspring workspace.',
      permissions: { filesystem: 'read' },
      approval: {},
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot }) =>
      sanitizeRuntimeResponse(statWorkspaceEntry(workspaceRoot, inputPath(input, 'File stat'))),
  }
}

export function createFileWriteTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.write',
      name: 'Write File',
      description: 'Writes a file into the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) => {
      const record = inputRecord(input, 'Tool input must be an object.')
      return sanitizeRuntimeResponse(
        writeWorkspaceFile(workspaceRoot, inputPath(input, 'File write'), record.data, {
          preferredBackend: mutationBackendPreference(record, computerId, options.mutationBackend),
          resolveBackend: options.resolveMutationBackend,
          executorForBackend: options.mutationExecutorForBackend,
        }),
      )
    },
  }
}

export function createFileAppendTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.append',
      name: 'Append File',
      description: 'Appends text to a file inside the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) => {
      const record = inputRecord(input, 'File append input must be an object.')
      return sanitizeRuntimeResponse(
        appendWorkspaceFile(workspaceRoot, inputPath(input, 'File append'), record.data, {
          preferredBackend: mutationBackendPreference(record, computerId, options.mutationBackend),
          resolveBackend: options.resolveMutationBackend,
          executorForBackend: options.mutationExecutorForBackend,
        }),
      )
    },
  }
}

export function createFileMkdirTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.mkdir',
      name: 'Create Directory',
      description: 'Creates a directory inside the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) =>
      sanitizeRuntimeResponse(
        mkdirWorkspacePath(workspaceRoot, inputPath(input, 'File mkdir'), {
          preferredBackend: mutationBackendPreference(
            inputRecord(input, 'File mkdir input must be an object.'),
            computerId,
            options.mutationBackend,
          ),
          resolveBackend: options.resolveMutationBackend,
          executorForBackend: options.mutationExecutorForBackend,
        }),
      ),
  }
}

export function createFileMoveTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.move',
      name: 'Move File',
      description: 'Moves or renames a file or directory inside the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) => {
      const record = inputRecord(input, 'File move input must be an object.')
      const fromPath = record.fromPath
      const toPath = record.toPath
      if (typeof fromPath !== 'string' || !fromPath.trim()) {
        throw new Error('File move input.fromPath must be a non-empty string.')
      }
      if (typeof toPath !== 'string' || !toPath.trim()) {
        throw new Error('File move input.toPath must be a non-empty string.')
      }
      return sanitizeRuntimeResponse(
        moveWorkspaceEntry(workspaceRoot, fromPath.trim(), toPath.trim(), {
          preferredBackend: mutationBackendPreference(record, computerId, options.mutationBackend),
          resolveBackend: options.resolveMutationBackend,
          executorForBackend: options.mutationExecutorForBackend,
        }),
      )
    },
  }
}

export function createFileDeleteTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.delete',
      name: 'Delete File',
      description: 'Deletes a file or directory inside the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) => {
      const record = inputRecord(input, 'File delete input must be an object.')
      return sanitizeRuntimeResponse(
        deleteWorkspaceEntry(
          workspaceRoot,
          inputPath(input, 'File delete'),
          record.recursive === true,
          {
            preferredBackend: mutationBackendPreference(
              record,
              computerId,
              options.mutationBackend,
            ),
            resolveBackend: options.resolveMutationBackend,
            executorForBackend: options.mutationExecutorForBackend,
          },
        ),
      )
    },
  }
}

export function createFilePatchTool(options: FileToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.patch',
      name: 'Patch File',
      description:
        'Applies approved text replacements to a file inside the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot, computerId }) => {
      const record = inputRecord(input, 'File patch input must be an object.')
      if (!Array.isArray(record.operations)) {
        throw new Error('File patch input.operations must be an array.')
      }
      const operations = record.operations.map((value, index) => {
        const operation = inputRecord(value, `File patch operation ${index} must be an object.`)
        if (typeof operation.find !== 'string' || operation.find.length === 0) {
          throw new Error(`File patch operation ${index} find must be a non-empty string.`)
        }
        if (typeof operation.replace !== 'string') {
          throw new Error(`File patch operation ${index} replace must be a string.`)
        }
        return {
          find: operation.find,
          replace: operation.replace,
          ...(operation.all === true ? { all: true } : {}),
        }
      })
      return sanitizeRuntimeResponse(
        patchWorkspaceFile(workspaceRoot, inputPath(input, 'File patch'), operations, {
          preferredBackend: mutationBackendPreference(record, computerId, options.mutationBackend),
          resolveBackend: options.resolveMutationBackend,
          executorForBackend: options.mutationExecutorForBackend,
        }),
      )
    },
  }
}

export function createFileTools(options: FileToolOptions = {}): RuntimeTool[] {
  return [
    createFileReadTool(),
    createFileStatTool(),
    createFileWriteTool(options),
    createFileAppendTool(options),
    createFileMkdirTool(options),
    createFileMoveTool(options),
    createFileDeleteTool(options),
    createFilePatchTool(options),
  ]
}
