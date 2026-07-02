import {
  MAINSPRING_APP_MODEL_ID,
  sanitizeRuntimeResponse,
  type ProviderRateLimitBucket,
  type ProviderRateLimitState,
  type ToolManifest,
  type ProviderUsage,
} from '#protocol'
import { repairProviderMessageHistory } from '../agent/ProviderMessageHistory.js'
import type {
  AgentQuery,
  ProviderEvent,
  ProviderMessage,
  ProviderToolChoice,
  ProviderToolDefinition,
  QueryInput,
  RuntimeProviderClient,
} from './types.js'

export interface FetchRuntimeProviderClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  defaultModel?: string
  requestTimeoutMs?: number
  httpReferer?: string
  appTitle?: string
  responsesMode?: 'standard' | 'codex-proxy'
}

type JsonRecord = Record<string, unknown>
type OpenAIInputMessage = {
  role: 'user' | 'assistant'
  content: Array<{ type: 'input_text'; text: string }>
}
type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenRouterToolCall[]
  tool_call_id?: string
  name?: string
}
type OpenRouterTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: JsonRecord
  }
}
type OpenRouterToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments?: string
  }
}
const MAX_OPENROUTER_TOOL_ROUNDS = 4

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, '')
}

function normalizeRequestTimeoutMs(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 120_000
}

function normalizeOpenRouterSessionId(value: string | undefined): string | undefined {
  const sessionId = value?.trim()
  if (!sessionId) return undefined
  return sessionId.slice(0, 256)
}

function resolvedModelId(input: QueryInput, fallback: string): string {
  return input.model ?? fallback
}

function bareModelSlug(modelId: string): string {
  const trimmed = modelId.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.includes('/')) return trimmed.slice(trimmed.lastIndexOf('/') + 1)
  if (trimmed.includes(':')) {
    const [prefix, suffix] = trimmed.split(':', 2)
    if (/^(openai|openrouter|anthropic|google|gemini|deepseek|xai|grok)$/i.test(prefix.trim())) {
      return suffix.trim()
    }
  }
  return trimmed
}

function resolvedModelFamily(modelId: string): string | undefined {
  const bare = bareModelSlug(modelId).toLowerCase()
  if (!bare || bare === 'free') return undefined
  if (bare.startsWith('gpt-5')) return 'gpt-5'
  if (bare.startsWith('gpt-4.1')) return 'gpt-4.1'
  if (bare.startsWith('gpt-4')) return 'gpt-4'
  if (bare.startsWith('claude')) return 'claude'
  if (bare.startsWith('gemini')) return 'gemini'
  if (bare.startsWith('deepseek')) return 'deepseek'
  if (bare.startsWith('qwen')) return 'qwen'
  if (bare.startsWith('llama')) return 'llama'
  if (bare.startsWith('grok')) return 'grok'
  return undefined
}

function openAIProviderTransport(mode: 'standard' | 'codex-proxy'): string {
  return mode === 'codex-proxy' ? 'openai-responses-codex-proxy' : 'openai-responses'
}

function openRouterProviderTransport(): string {
  return 'openrouter-chat-completions'
}

function attributedUsage(
  usage: ProviderUsage,
  input: {
    provider: string
    modelId: string
    modelFamily?: string
    providerTransport: string
  },
): ProviderUsage {
  return {
    ...usage,
    provider: input.provider,
    modelId: input.modelId,
    providerTransport: input.providerTransport,
    ...(input.modelFamily ? { modelFamily: input.modelFamily } : {}),
  }
}

function timeoutSignal(
  parent: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error(`Provider request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  )
  const abort = () => controller.abort(parent.reason)
  if (parent.aborted) abort()
  else parent.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout)
      parent.removeEventListener('abort', abort)
    },
  }
}

function providerErrorMessage(prefix: string, responseBody: unknown): string {
  const sanitized = sanitizeRuntimeResponse(responseBody)
  const message =
    asString(asRecord(asRecord(sanitized).error).message) ??
    asString(asRecord(sanitized).message) ??
    JSON.stringify(sanitized)
  return `${prefix}: ${message}`
}

function resolveProviderCredential(input: QueryInput): string {
  const ref = input.credentialRef
  if (!ref) {
    throw new Error('Provider credential ref is required.')
  }
  if (ref.kind === 'env') {
    const value = input.env?.[ref.key] ?? process.env[ref.key]
    if (!value?.trim()) {
      throw new Error(`Provider credential env ${ref.key} is not configured.`)
    }
    return value
  }

  const resolved = input.resolveCredential?.(ref)
  if (!resolved?.trim()) {
    throw new Error(`Provider credential ref kind ${ref.kind} could not be resolved in-process.`)
  }
  return resolved
}

function oneShotQuery(
  events: () => AsyncIterable<ProviderEvent>,
  abort: () => void,
): AgentQuery {
  return {
    push() {},
    end() {},
    abort,
    events: events(),
  }
}

function createPushQueue(): {
  push: (message: string) => void
  next: () => Promise<string>
  abort: () => void
} {
  const messages: string[] = []
  const waiters: Array<(message: string) => void> = []
  let aborted = false

  return {
    push(message) {
      const waiter = waiters.shift()
      if (waiter) {
        waiter(message)
        return
      }
      messages.push(message)
    },
    next() {
      const message = messages.shift()
      if (message !== undefined) return Promise.resolve(message)
      if (aborted) return Promise.reject(new Error('Provider query aborted.'))
      return new Promise((resolve, reject) => {
        waiters.push(resolve)
        if (aborted) {
          waiters.pop()
          reject(new Error('Provider query aborted.'))
        }
      })
    },
    abort() {
      aborted = true
      while (waiters.length > 0) {
        const waiter = waiters.shift()
        if (waiter) waiter('__ABORTED__')
      }
    },
  }
}


export class OpenAIResponsesClient implements RuntimeProviderClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly defaultModel: string
  private readonly responsesMode: 'standard' | 'codex-proxy'

  constructor(options: FetchRuntimeProviderClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://api.openai.com/v1')
    this.defaultModel = options.defaultModel ?? 'gpt-4.1-mini'
    this.responsesMode = options.responsesMode ?? 'standard'
  }

  query(input: QueryInput): AgentQuery {
    const controller = new AbortController()
    const request = this.createResponse(input, controller.signal)
    const modelId = resolvedModelId(input, this.defaultModel)
    const modelFamily = resolvedModelFamily(modelId)
    const providerTransport = openAIProviderTransport(this.responsesMode)
    return oneShotQuery(
      async function* () {
        yield {
          type: 'init',
          provider: input.providerId ?? 'openai',
          providerSessionId: input.resumeAt ?? `openai:${input.sessionId ?? 'session'}`,
          modelId,
          ...(modelFamily ? { modelFamily } : {}),
          providerTransport,
        }
        try {
          const { text, usage, responseId } = await request
          if (responseId) {
            yield {
              type: 'init',
              provider: input.providerId ?? 'openai',
              providerSessionId: responseId,
              modelId,
              ...(modelFamily ? { modelFamily } : {}),
              providerTransport,
            }
          }
          yield { type: 'delta', text }
          yield { type: 'result', text }
          if (usage) {
            yield {
              type: 'usage',
              usage: attributedUsage(usage, {
                provider: input.providerId ?? 'openai',
                modelId,
                modelFamily,
                providerTransport,
              }),
              ...(responseId ? { providerSessionId: responseId } : {}),
            }
          }
        } catch (error) {
          yield {
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
            classification: 'provider_request_failed',
          }
        }
      },
      () => controller.abort(),
    )
  }

  private async createResponse(
    input: QueryInput,
    signal: AbortSignal,
  ): Promise<{ text: string; responseId?: string; usage?: ProviderUsage }> {
    const apiKey = resolveProviderCredential(input)
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(this.createResponsePayload(input)),
    })

    if (this.responsesMode === 'codex-proxy') {
      const textBody = await response.text().catch(() => '')
      if (!response.ok) {
        throw new Error(
          providerErrorMessage(`OpenAI request failed (${response.status})`, parseMaybeJson(textBody)),
        )
      }
      return extractOpenAISseResponse(textBody, response.headers)
    }

    const body = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) {
      throw new Error(providerErrorMessage(`OpenAI request failed (${response.status})`, body))
    }

    const record = asRecord(body)
    return {
      responseId: asString(record.id),
      text: extractOpenAIText(record),
      usage: parseOpenAIUsage(record.usage, response.headers),
    }
  }

  private createResponsePayload(input: QueryInput): JsonRecord {
    const replayMessages = createOpenAIInputMessages(input)
    const common: JsonRecord = {
      model: input.model ?? this.defaultModel,
      ...(input.systemPrompt ? { instructions: input.systemPrompt } : {}),
      ...(input.resumeAt ? { previous_response_id: input.resumeAt } : {}),
    }

    if (this.responsesMode === 'codex-proxy') {
      return {
        ...common,
        instructions: input.systemPrompt ?? 'Answer clearly.',
        input: replayMessages,
        store: false,
        stream: true,
      }
    }

    return { ...common, input: replayMessages }
  }
}

export class OpenRouterChatCompletionsClient implements RuntimeProviderClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly defaultModel: string
  private readonly requestTimeoutMs: number
  private readonly httpReferer?: string
  private readonly appTitle?: string

  constructor(options: FetchRuntimeProviderClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://openrouter.ai/api/v1')
    this.defaultModel = options.defaultModel ?? MAINSPRING_APP_MODEL_ID
    this.requestTimeoutMs = normalizeRequestTimeoutMs(options.requestTimeoutMs)
    this.httpReferer = asString(options.httpReferer)
    this.appTitle = asString(options.appTitle)
  }

  query(input: QueryInput): AgentQuery {
    const controller = new AbortController()
    const queue = createPushQueue()
    const events = this.runChatCompletionLoop(input, controller.signal, queue.next)
    const modelId = resolvedModelId(input, this.defaultModel)
    const modelFamily = resolvedModelFamily(modelId)
    const providerTransport = openRouterProviderTransport()
    return {
      push: queue.push,
      end() {},
      abort: () => {
        queue.abort()
        controller.abort()
      },
      events: (async function* () {
        yield {
          type: 'init',
          provider: input.providerId ?? 'openrouter',
          providerSessionId: input.resumeAt ?? `openrouter:${input.sessionId ?? 'session'}`,
          modelId,
          ...(modelFamily ? { modelFamily } : {}),
          providerTransport,
        }
        try {
          for await (const event of events) yield event
        } catch (error) {
          yield {
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
            classification: 'provider_request_failed',
          }
        }
      })(),
    }
  }

  private async *runChatCompletionLoop(
    input: QueryInput,
    signal: AbortSignal,
    nextToolResult: () => Promise<string>,
  ): AsyncIterable<ProviderEvent> {
    const toolMapping = buildOpenRouterToolMapping(input.tools)
    const messages = createOpenRouterMessages(input)
    const modelId = resolvedModelId(input, this.defaultModel)
    const modelFamily = resolvedModelFamily(modelId)
    const providerTransport = openRouterProviderTransport()
    let completion = await this.createChatCompletion(input, signal, messages, toolMapping.tools)

    for (let round = 0; round <= MAX_OPENROUTER_TOOL_ROUNDS; round += 1) {
      if (completion.completionId) {
        yield {
          type: 'init',
          provider: input.providerId ?? 'openrouter',
          providerSessionId: completion.completionId,
          modelId,
          ...(modelFamily ? { modelFamily } : {}),
          providerTransport,
        }
      }

      if (completion.toolCalls.length === 0) {
        if (!completion.text.trim() && round > 0) {
          yield {
            type: 'error',
            message: 'OpenRouter returned no final assistant text after local tool result.',
            retryable: true,
            classification: 'provider_empty_tool_final',
          }
          if (completion.usage) {
            yield {
              type: 'usage',
              usage: attributedUsage(completion.usage, {
                provider: input.providerId ?? 'openrouter',
                modelId,
                modelFamily,
                providerTransport,
              }),
              ...(completion.completionId
                ? { providerSessionId: completion.completionId }
                : {}),
            }
          }
          return
        }
        yield* emitOpenRouterText({
          provider: input.providerId ?? 'openrouter',
          modelId,
          modelFamily,
          providerTransport,
          ...completion,
        })
        return
      }

      if (round === MAX_OPENROUTER_TOOL_ROUNDS) {
        yield {
          type: 'error',
          message: `OpenRouter exceeded ${MAX_OPENROUTER_TOOL_ROUNDS} local tool rounds.`,
          retryable: true,
          classification: 'provider_tool_round_limit',
        }
        if (completion.usage) {
          yield {
            type: 'usage',
            usage: attributedUsage(completion.usage, {
              provider: input.providerId ?? 'openrouter',
              modelId,
              modelFamily,
              providerTransport,
            }),
            ...(completion.completionId ? { providerSessionId: completion.completionId } : {}),
          }
        }
        return
      }

      messages.push({
        role: 'assistant',
        content: completion.text || null,
        tool_calls: completion.toolCalls,
      })
      for (const toolCall of completion.toolCalls) {
        const localName =
          toolMapping.remoteToLocal.get(toolCall.function.name) ?? toolCall.function.name
        const inputPayload = parseToolArguments(toolCall.function.arguments)
        yield { type: 'tool_call', name: localName, input: inputPayload, toolCallId: toolCall.id }
        const toolResult = parseToolResult(await nextToolResult())
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(toolResult),
        })
      }

      completion = await this.createChatCompletion(
        { ...input, toolChoice: 'auto' },
        signal,
        messages,
        toolMapping.tools,
      )
    }
  }

  private async createChatCompletion(
    input: QueryInput,
    signal: AbortSignal,
    messages: ChatMessage[],
    tools: OpenRouterTool[],
  ): Promise<{
    text: string
    completionId?: string
    usage?: ProviderUsage
    toolCalls: OpenRouterToolCall[]
  }> {
    const apiKey = resolveProviderCredential(input)
    const toolChoice = openRouterToolChoice(input.toolChoice)
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }
    const httpReferer = asString(input.env?.OPENROUTER_HTTP_REFERER) ?? this.httpReferer
    const appTitle = asString(input.env?.OPENROUTER_APP_TITLE) ?? this.appTitle
    if (httpReferer) headers['HTTP-Referer'] = httpReferer
    if (appTitle) headers['X-OpenRouter-Title'] = appTitle

    const sessionId = normalizeOpenRouterSessionId(input.sessionId)
    const requestSignal = timeoutSignal(signal, this.requestTimeoutMs)
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: requestSignal.signal,
      headers,
      body: JSON.stringify({
        model: input.model ?? this.defaultModel,
        ...(sessionId ? { session_id: sessionId } : {}),
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: toolChoice, parallel_tool_calls: false } : {}),
      }),
    }).finally(requestSignal.dispose)
    const body = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) {
      throw new Error(providerErrorMessage(`OpenRouter request failed (${response.status})`, body))
    }

    const record = asRecord(body)
    return {
      completionId: asString(record.id),
      text: extractOpenRouterText(record),
      usage: parseChatCompletionUsage(record.usage, response.headers, input.providerId ?? 'openrouter'),
      toolCalls: extractOpenRouterToolCalls(record),
    }
  }
}

function* emitOpenRouterText(input: {
  provider: string
  modelId: string
  modelFamily?: string
  providerTransport: string
  text: string
  usage?: ProviderUsage
  completionId?: string
}): Iterable<ProviderEvent> {
  yield { type: 'delta', text: input.text }
  yield { type: 'result', text: input.text }
  if (input.usage) {
    yield {
      type: 'usage',
      usage: attributedUsage(input.usage, {
        provider: input.provider,
        modelId: input.modelId,
        modelFamily: input.modelFamily,
        providerTransport: input.providerTransport,
      }),
      ...(input.completionId ? { providerSessionId: input.completionId } : {}),
    }
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function extractOpenAIText(record: JsonRecord): string {
  const outputText = asString(record.output_text)
  if (outputText) return outputText
  return asArray(record.output)
    .flatMap((item) => asArray(asRecord(item).content))
    .map((item) => asString(asRecord(item).text))
    .filter(Boolean)
    .join('')
}

function extractOpenAISseResponse(
  textBody: string,
  headers?: Headers,
): { text: string; responseId?: string; usage?: ProviderUsage } {
  let responseId: string | undefined
  let usage: ProviderUsage | undefined = headers ? parseOpenAIUsage(undefined, headers) : undefined
  const textParts: string[] = []
  for (const line of textBody.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    const event = asRecord(parseMaybeJson(data))
    responseId = asString(event.response_id) ?? asString(asRecord(event.response).id) ?? responseId
    usage = parseOpenAIUsage(asRecord(event.response).usage, headers) ?? usage
    const delta = asString(event.delta) ?? asString(event.text) ?? asString(event.output_text)
    if (delta) textParts.push(delta)
    const itemText = asString(asRecord(event.item).text)
    if (itemText) textParts.push(itemText)
  }
  return { text: textParts.join(''), responseId, usage }
}

function providerRateLimitBucket(headers: Headers, resource: 'requests' | 'tokens', suffix = ''):
  | ProviderRateLimitBucket
  | undefined {
  const tag = `${resource}${suffix}`
  const limit = numberHeader(headers, `x-ratelimit-limit-${tag}`)
  const remaining = numberHeader(headers, `x-ratelimit-remaining-${tag}`)
  const resetSeconds = numberHeader(headers, `x-ratelimit-reset-${tag}`)
  if (limit === undefined && remaining === undefined && resetSeconds === undefined) return undefined
  return {
    ...(limit !== undefined ? { limit: Math.max(0, Math.trunc(limit)) } : {}),
    ...(remaining !== undefined ? { remaining: Math.max(0, Math.trunc(remaining)) } : {}),
    ...(resetSeconds !== undefined ? { resetSeconds: Math.max(0, resetSeconds) } : {}),
  }
}

function parseProviderRateLimit(headers: Headers, provider: string): ProviderRateLimitState | undefined {
  const requestsMinute = providerRateLimitBucket(headers, 'requests')
  const requestsHour = providerRateLimitBucket(headers, 'requests', '-1h')
  const tokensMinute = providerRateLimitBucket(headers, 'tokens')
  const tokensHour = providerRateLimitBucket(headers, 'tokens', '-1h')
  if (!requestsMinute && !requestsHour && !tokensMinute && !tokensHour) return undefined
  return {
    provider,
    capturedAt: new Date().toISOString(),
    ...(requestsMinute ? { requestsMinute } : {}),
    ...(requestsHour ? { requestsHour } : {}),
    ...(tokensMinute ? { tokensMinute } : {}),
    ...(tokensHour ? { tokensHour } : {}),
  }
}

function parseOpenAIUsage(value: unknown, headers?: Headers): ProviderUsage | undefined {
  const usage = asRecord(value)
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens)
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens)
  const totalTokens = Number(usage.total_tokens)
  const inputDetails = asRecord(usage.input_tokens_details ?? usage.prompt_tokens_details)
  const outputDetails = asRecord(usage.output_tokens_details ?? usage.completion_tokens_details)
  const cacheReadTokens = Number(
    inputDetails.cached_tokens ?? usage.cache_read_input_tokens,
  )
  const cacheWriteTokens = Number(
    inputDetails.cache_creation_tokens ??
      inputDetails.cache_write_tokens ??
      usage.cache_creation_input_tokens,
  )
  const reasoningTokens = Number(
    outputDetails.reasoning_tokens ?? usage.reasoning_tokens,
  )
  const rateLimit = headers ? parseProviderRateLimit(headers, 'openai') : undefined
  if (
    ![
      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens,
    ].some(Number.isFinite)
    && !rateLimit
  ) {
    return undefined
  }
  return {
    ...(Number.isFinite(inputTokens) ? { inputTokens } : {}),
    ...(Number.isFinite(outputTokens) ? { outputTokens } : {}),
    ...(Number.isFinite(totalTokens) ? { totalTokens } : {}),
    ...(Number.isFinite(cacheReadTokens) ? { cacheReadTokens } : {}),
    ...(Number.isFinite(cacheWriteTokens) ? { cacheWriteTokens } : {}),
    ...(Number.isFinite(reasoningTokens) ? { reasoningTokens } : {}),
    ...(rateLimit ? { rateLimit } : {}),
  }
}

function createReplayMessages(input: QueryInput): ProviderMessage[] {
  const history: ProviderMessage[] = [...(input.messages ?? [])]
  if (input.prompt.trim()) {
    history.push({ role: 'user', content: input.prompt })
  }
  return repairProviderMessageHistory(history).messages
}

function providerMessageText(message: ProviderMessage): string {
  if (message.role === 'assistant') {
    const parts: string[] = []
    if (message.content?.trim()) parts.push(message.content)
    for (const toolCall of message.toolCalls ?? []) {
      const args = toolCall.arguments?.trim() ? toolCall.arguments : '{}'
      parts.push(`[assistant tool call ${toolCall.name} id=${toolCall.id} args=${args}]`)
    }
    return parts.join('\n')
  }
  if (message.role === 'tool') {
    return `[tool result ${message.name ?? 'tool'} id=${message.toolCallId ?? 'unknown'}]\n${message.content}`
  }
  return message.content
}

function createOpenAIInputMessages(input: QueryInput): OpenAIInputMessage[] {
  return createReplayMessages(input)
    .filter((message): message is Exclude<ProviderMessage, { role: 'system' }> => message.role !== 'system')
    .map<OpenAIInputMessage>((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'input_text', text: providerMessageText(message) }],
    }))
    .filter((message) => message.content[0]?.text.trim())
}

function createOpenRouterMessages(input: QueryInput): ChatMessage[] {
  const repaired = { messages: createReplayMessages(input) }
  return [
    ...(input.systemPrompt ? [{ role: 'system' as const, content: input.systemPrompt }] : []),
    ...repaired.messages.map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant' as const,
          content: message.content ?? null,
          ...(message.toolCalls
            ? {
                tool_calls: message.toolCalls.map((toolCall) => ({
                  id: toolCall.id,
                  type: 'function' as const,
                  function: {
                    name: toolFunctionName(toolCall.name),
                    ...(toolCall.arguments ? { arguments: toolCall.arguments } : {}),
                  },
                })),
              }
            : {}),
        }
      }
      if (message.role === 'tool') {
        return {
          role: 'tool' as const,
          content: message.content,
          ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
          ...(message.name ? { name: toolFunctionName(message.name) } : {}),
        }
      }
      return {
        role: message.role,
        content: message.content,
      }
    }),
  ]
}

function toolFunctionName(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '_')
  return /^[A-Za-z_]/.test(safe) ? safe : `tool_${safe}`
}

function openRouterToolChoice(choice: ProviderToolChoice | undefined): unknown {
  if (!choice || choice === 'auto') return 'auto'
  return {
    type: 'function',
    function: { name: toolFunctionName(choice.name) },
  }
}

function toolParametersForManifest(manifest: ToolManifest): JsonRecord {
  if (manifest.key === 'file.read') {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative file path to read.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'shell.exec') {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to request approval for.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'browser.open') {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open in the managed browser runtime.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'browser.snapshot') {
    return {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['aria', 'text'],
          description: 'Optional browser snapshot format for text-first page state.',
        },
        task: {
          type: 'string',
          description: 'Optional short task hint for snapshot extraction.',
        },
      },
      additionalProperties: false,
    }
  }
  if (manifest.key === 'browser.click') {
    return {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Compact browser element ref such as @e5.',
        },
        task: {
          type: 'string',
          description: 'Optional short task hint for the click step.',
        },
      },
      required: ['ref'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'browser.type') {
    return {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Compact browser element ref such as @e5.',
        },
        text: {
          type: 'string',
          description: 'Text to enter into the referenced browser element.',
        },
        submit: {
          type: 'boolean',
          description: 'Whether to submit after typing.',
        },
        task: {
          type: 'string',
          description: 'Optional short task hint for the typing step.',
        },
      },
      required: ['ref', 'text'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'browser.screenshot') {
    return {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full page instead of the viewport.',
        },
        artifactLabel: {
          type: 'string',
          description: 'Optional short label for the screenshot artifact.',
        },
      },
      additionalProperties: false,
    }
  }
  if (
    manifest.key === 'mainspring.agent.events.tail' ||
    manifest.key === 'mainspring.agent.events.tail'
  ) {
    return {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Optional maximum number of recent events to return.',
        },
      },
      additionalProperties: false,
    }
  }
  if (manifest.key === 'web.fetch') {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public http or https URL to fetch.',
        },
        maxBytes: {
          type: 'number',
          description: 'Optional byte cap for the fetched response body.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'web.search') {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for public web results.',
        },
        maxResults: {
          type: 'number',
          description: 'Optional number of search results to return, capped by runtime policy.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'memory.read') {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional memory search query.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of memory entries to return.',
        },
      },
      additionalProperties: false,
    }
  }
  if (manifest.key === 'memory.write') {
    return {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Memory text to persist.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional memory tags.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    }
  }
  if (manifest.key === 'skills.install' || manifest.key === 'skills.update') {
    return {
      type: 'object',
      properties: {
        manifest: {
          type: 'object',
          description: 'Approved Mainspring skill manifest to install or update.',
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            version: { type: 'string' },
            source: { type: 'string', enum: ['built-in', 'uploaded', 'registry', 'git'] },
            entrypoint: { type: 'string' },
            instructionsPath: { type: 'string' },
            permissions: {
              type: 'object',
              properties: {
                shell: { type: 'boolean' },
                browser: { type: 'boolean' },
                network: { type: 'string', enum: ['none', 'limited', 'open'] },
                filesystem: { type: 'string', enum: ['read', 'workspace-write', 'computer-write'] },
                secrets: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: false,
            },
            approval: {
              type: 'object',
              properties: {
                required: { type: 'boolean' },
                dangerousPatterns: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: false,
            },
          },
          required: ['key', 'name', 'description', 'version', 'source', 'permissions', 'approval'],
          additionalProperties: false,
        },
      },
      required: ['manifest'],
      additionalProperties: false,
    }
  }
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  }
}

function buildOpenRouterToolMapping(tools: ProviderToolDefinition[] | undefined): {
  tools: OpenRouterTool[]
  remoteToLocal: Map<string, string>
} {
  const remoteToLocal = new Map<string, string>()
  const openRouterTools = (tools ?? []).map(({ manifest }) => {
    const remoteName = toolFunctionName(manifest.key)
    remoteToLocal.set(remoteName, manifest.key)
    return {
      type: 'function' as const,
      function: {
        name: remoteName,
        description: `${manifest.description} Use this for local Mainspring tool ${manifest.key}.`,
        parameters: toolParametersForManifest(manifest),
      },
    }
  })
  return { tools: openRouterTools, remoteToLocal }
}

function parseToolArguments(value: string | undefined): unknown {
  if (!value?.trim()) return {}
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { raw: value }
  }
}

function parseToolResult(value: string): unknown {
  if (value === '__ABORTED__') throw new Error('Provider query aborted.')
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { output: value }
  }
}

function extractOpenRouterText(record: JsonRecord): string {
  return asArray(record.choices)
    .map((choice) => asString(asRecord(asRecord(choice).message).content))
    .filter(Boolean)
    .join('')
}

function extractOpenRouterToolCalls(record: JsonRecord): OpenRouterToolCall[] {
  return asArray(record.choices)
    .flatMap((choice) => asArray(asRecord(asRecord(choice).message).tool_calls))
    .map((toolCall) => {
      const record = asRecord(toolCall)
      const func = asRecord(record.function)
      const id = asString(record.id) ?? createFallbackToolCallId(asString(func.name) ?? 'tool')
      return {
        id,
        type: 'function' as const,
        function: {
          name: asString(func.name) ?? 'tool',
          arguments: typeof func.arguments === 'string' ? func.arguments : undefined,
        },
      }
    })
    .filter((toolCall) => toolCall.function.name !== 'tool')
}

function createFallbackToolCallId(name: string): string {
  return `call_${toolFunctionName(name)}`
}

function numberField(record: JsonRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function numberHeader(headers: Headers, key: string): number | undefined {
  const raw = headers.get(key)
  if (!raw?.trim()) return undefined
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : undefined
}

function parseChatCompletionUsage(
  value: unknown,
  headers?: Headers,
  provider = 'openrouter',
): ProviderUsage | undefined {
  const usage = asRecord(value)
  const inputTokens = numberField(usage, 'prompt_tokens')
  const outputTokens = numberField(usage, 'completion_tokens')
  const totalTokens = numberField(usage, 'total_tokens')
  const promptDetails = asRecord(usage.prompt_tokens_details)
  const completionDetails = asRecord(usage.completion_tokens_details)
  const outputDetails = asRecord(usage.output_tokens_details)
  const cacheReadTokens =
    numberField(promptDetails, 'cached_tokens') ?? numberField(usage, 'cache_read_input_tokens')
  const cacheWriteTokens =
    numberField(promptDetails, 'cache_write_tokens') ??
    numberField(promptDetails, 'cache_creation_tokens') ??
    numberField(usage, 'cache_creation_input_tokens')
  const reasoningTokens =
    numberField(completionDetails, 'reasoning_tokens') ??
    numberField(outputDetails, 'reasoning_tokens') ??
    numberField(usage, 'reasoning_tokens')
  const rateLimit = headers ? parseProviderRateLimit(headers, provider) : undefined
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined &&
    reasoningTokens === undefined &&
    !rateLimit
  ) {
    return undefined
  }
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(rateLimit ? { rateLimit } : {}),
  }
}
