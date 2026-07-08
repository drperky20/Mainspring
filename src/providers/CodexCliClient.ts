import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createMainspringRuntimeId } from '#protocol'
import type { AgentQuery, ProviderEvent, QueryInput, RuntimeProviderClient } from './types.js'

interface CodexCliClientOptions {
  command?: string
  defaultModel?: string
  timeoutMs?: number
  extraArgs?: string[]
}

type CodexJsonEvent = {
  type?: string
  item?: {
    type?: string
    text?: string
    name?: string
    input?: unknown
    output?: unknown
    call_id?: string
  }
  usage?: unknown
  thread_id?: string
  message?: string
}

export class CodexCliClient implements RuntimeProviderClient {
  private readonly command: string
  private readonly defaultModel: string
  private readonly timeoutMs: number
  private readonly extraArgs: string[]

  constructor(options: CodexCliClientOptions = {}) {
    this.command = options.command ?? 'codex'
    this.defaultModel = options.defaultModel ?? 'codex-auto'
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000
    this.extraArgs = options.extraArgs ?? []
  }

  query(input: QueryInput): AgentQuery {
    const controller = new AbortController()
    const processRef: { current?: ChildProcess } = {}
    return {
      push() {},
      end() {},
      abort() {
        controller.abort()
        processRef.current?.kill('SIGTERM')
      },
      events: this.createEvents(input, controller, processRef),
    }
  }

  private async *createEvents(
    input: QueryInput,
    controller: AbortController,
    processRef: { current?: ChildProcess },
  ): AsyncIterable<ProviderEvent> {
    const modelId = input.model ?? this.defaultModel
    const providerSessionId = input.resumeAt ?? `codex:${input.sessionId ?? createMainspringRuntimeId('codex')}`
    yield {
      type: 'init',
      provider: input.providerId ?? 'codex',
      providerSessionId,
      modelId,
      providerTransport: 'codex-cli-jsonl',
    }

    const prompt = buildCodexPrompt(input)
    const modelArgs = modelId === 'codex-auto' || modelId === 'codex-cli' ? [] : ['-m', modelId]
    const args = [
      '-a',
      'never',
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--ignore-user-config',
      '--ignore-rules',
      '-C',
      input.cwd,
      ...modelArgs,
      ...this.extraArgs,
      prompt,
    ]

    const child = spawn(this.command, args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    })
    processRef.current = child
    child.on('error', () => {
      // AbortController cancellation emits an AbortError on ChildProcess.
      // The async stream below reports the aborted provider event.
    })

    const timer = setTimeout(() => {
      controller.abort()
      child.kill('SIGTERM')
    }, this.timeoutMs)
    const stderr: string[] = []
    const stdout = createInterface({ input: child.stdout })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr.push(chunk)
      if (stderr.join('').length > 8_000) stderr.splice(0, stderr.length - 8)
    })

    let finalText = ''
    let sawEvent = false
    try {
      for await (const line of stdout) {
        const parsed = parseCodexJsonLine(line)
        if (!parsed) continue
        sawEvent = true
        if (parsed.type === 'thread.started' && parsed.thread_id) {
          yield {
            type: 'init',
            provider: input.providerId ?? 'codex',
            providerSessionId: parsed.thread_id,
            modelId,
            providerTransport: 'codex-cli-jsonl',
          }
          continue
        }
        const event = codexEventToProviderEvent(parsed)
        if (!event) continue
        if (event.type === 'delta') finalText += event.text
        if (event.type === 'result') finalText = event.text ?? finalText
        yield event
      }
      const exitCode = await waitForExit(child)
      if (exitCode !== 0) {
        yield {
          type: 'error',
          message: codexFailureMessage(exitCode, stderr),
          retryable: false,
          classification: 'codex_cli_failed',
        }
        return
      }
      if (!sawEvent) {
        yield {
          type: 'error',
          message: 'Codex CLI produced no JSON events.',
          retryable: false,
          classification: 'codex_cli_no_events',
        }
        return
      }
      if (finalText) yield { type: 'result', text: finalText }
    } catch (error) {
      if (controller.signal.aborted) {
        yield {
          type: 'error',
          message: 'Codex CLI run was aborted.',
          retryable: true,
          classification: 'codex_cli_aborted',
        }
        return
      }
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        classification: 'codex_cli_failed',
      }
    } finally {
      clearTimeout(timer)
      stdout.close()
    }
  }
}

function buildCodexPrompt(input: QueryInput): string {
  const sections = [
    input.systemPrompt ? `System prompt:\n${input.systemPrompt}` : '',
    input.messages?.length ? `Conversation replay:\n${JSON.stringify(input.messages)}` : '',
    input.tools?.length ? `Available Mainspring tools:\n${JSON.stringify(input.tools.map((tool) => tool.manifest))}` : '',
    `Task:\n${input.prompt}`,
  ].filter(Boolean)
  return sections.join('\n\n')
}

function parseCodexJsonLine(line: string): CodexJsonEvent | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    return JSON.parse(trimmed) as CodexJsonEvent
  } catch {
    return undefined
  }
}

function codexEventToProviderEvent(event: CodexJsonEvent): ProviderEvent | undefined {
  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    return { type: 'delta', text: event.item.text ?? '' }
  }
  if (event.type === 'turn.completed' && event.usage) {
    return {
      type: 'progress',
      message: `Codex completed with usage ${JSON.stringify(event.usage)}.`,
    }
  }
  if (event.type === 'error') {
    return {
      type: 'error',
      message: event.message ?? 'Codex CLI reported an error.',
      retryable: false,
      classification: 'codex_cli_error',
    }
  }
  return undefined
}

async function waitForExit(child: ChildProcess): Promise<number | null> {
  return await new Promise((resolve) => {
    child.once('exit', (code) => resolve(code))
  })
}

function codexFailureMessage(exitCode: number | null, stderr: string[]): string {
  const tail = stderr.join('').trim().split(/\r?\n/).slice(-8).join('\n')
  return `Codex CLI exited with code ${exitCode ?? 'unknown'}${tail ? `: ${tail}` : '.'}`
}
