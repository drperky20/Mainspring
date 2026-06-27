import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { sanitizeRuntimeResponse } from '#protocol'
import { builtinManifest, inputRecord, positiveInt, type RuntimeTool } from './ToolRegistry.js'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024
const MAX_OUTPUT_BYTES = 128 * 1024
const MAX_COMMAND_LENGTH = 8_000
const SAFE_ENV_KEYS = new Set([
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

type ShellExecResult = {
  command: string
  cwd: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  stdout: string
  stderr: string
  truncated: boolean
}

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
  if (chunk.byteLength <= remaining)
    return { value: current + chunk.toString('utf8'), truncated: false }
  return { value: current + chunk.subarray(0, remaining).toString('utf8'), truncated: true }
}

async function runShellCommand(input: {
  command: string
  cwd: string
  timeoutMs: number
  maxOutputBytes: number
}): Promise<ShellExecResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let truncated = false
    let settled = false
    let timedOut = false

    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      windowsHide: true,
      env: buildShellEnv(),
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, input.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      const appended = appendCapped(stdout, chunk, input.maxOutputBytes)
      stdout = appended.value
      truncated = truncated || appended.truncated
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const appended = appendCapped(stderr, chunk, input.maxOutputBytes)
      stderr = appended.value
      truncated = truncated || appended.truncated
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (exitCode, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        command: input.command,
        cwd: 'workspace',
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr,
        truncated,
      })
    })
  })
}

export interface ShellToolOptions {
  timeoutMs?: number
  maxOutputBytes?: number
}

export function createShellTool(options: ShellToolOptions = {}): RuntimeTool {
  return {
    manifest: builtinManifest({
      key: 'shell.exec',
      name: 'Shell Command',
      description: 'Requests execution of a shell command through an approved runtime adapter.',
      permissions: { shell: true, filesystem: 'workspace-write' },
      approval: { required: true },
      toolType: 'shell',
    }),
    execute: async ({ input, workspaceRoot }) => {
      const record = inputRecord(input, 'Shell tool input must be an object.')
      const result = await runShellCommand({
        command: inputCommand(input),
        cwd: fs.realpathSync.native(workspaceRoot),
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
      return sanitizeRuntimeResponse(result)
    },
  }
}
