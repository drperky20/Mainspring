import fs from 'node:fs'
import path from 'node:path'
import { assertPathContained } from '#protocol/node'
import { builtinManifest, inputRecord, type RuntimeTool } from './ToolRegistry.js'

function inputPath(input: unknown): string {
  const value = inputRecord(input, 'Tool input must be an object.').path
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('File tool input.path must be a non-empty string.')
  }
  return value
}

function containedWorkspacePath(
  workspaceRoot: string,
  candidatePath: string,
): {
  absolutePath: string
  relativePath: string
} {
  const resolvedWorkspaceRoot = fs.realpathSync.native(workspaceRoot)
  const candidate = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(resolvedWorkspaceRoot, candidatePath)
  const absolutePath = assertPathContained(resolvedWorkspaceRoot, candidate)
  return {
    absolutePath,
    relativePath: path.relative(resolvedWorkspaceRoot, absolutePath).replace(/\\/g, '/'),
  }
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
      const target = containedWorkspacePath(workspaceRoot, inputPath(input))
      return {
        path: target.relativePath,
        text: fs.readFileSync(target.absolutePath, 'utf8'),
      }
    },
  }
}

export function createFileWriteTool(): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'file.write',
      name: 'Write File',
      description: 'Writes a file into the current Mainspring workspace.',
      permissions: { filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'file',
    }),
    execute: ({ input, workspaceRoot }) => {
      const record = inputRecord(input, 'Tool input must be an object.')
      const data = record.data
      const text =
        typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data ?? '')
      const target = containedWorkspacePath(workspaceRoot, inputPath(input))
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
      fs.writeFileSync(target.absolutePath, text)
      return {
        path: target.relativePath,
        bytes: Buffer.byteLength(text),
      }
    },
  }
}

export function createFileTools(): RuntimeTool[] {
  return [createFileReadTool(), createFileWriteTool()]
}
