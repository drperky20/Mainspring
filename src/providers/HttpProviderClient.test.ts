import { REPAIRED_TOOL_ARGUMENTS_MARKER } from '../agent/ProviderMessageHistory.js'
import { describe, expect, it } from 'vitest'
import { OpenAIResponsesClient, OpenRouterChatCompletionsClient } from './HttpProviderClient.js'
import type { AgentQuery, ProviderEvent } from './types.js'

async function collectEvents(query: AgentQuery): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = []
  for await (const event of query.events) {
    events.push(event)
  }
  return events
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const openRouterAuth = {
  env: { OPENROUTER_API_KEY: 'sk-or-secret' },
  credentialRef: { kind: 'env' as const, key: 'OPENROUTER_API_KEY' },
}
const openRouter = (
  fetchImpl: typeof fetch,
  options: Partial<ConstructorParameters<typeof OpenRouterChatCompletionsClient>[0]> = {},
) =>
  new OpenRouterChatCompletionsClient({
    fetchImpl,
    baseUrl: 'https://openrouter.test/api/v1/',
    ...options,
  })
const openAI = (
  fetchImpl: typeof fetch,
  options: Partial<ConstructorParameters<typeof OpenAIResponsesClient>[0]> = {},
) =>
  new OpenAIResponsesClient({
    fetchImpl,
    baseUrl: 'https://openai.test/v1/',
    ...options,
  })
const requestBody = (requests: Array<{ init?: RequestInit }>, index = 0) =>
  JSON.parse(String(requests[index]?.init?.body)) as Record<string, unknown>

const tool = (
  key: string,
  toolType: string,
  permissions: Record<string, unknown>,
  approval: Record<string, unknown> = {},
) => ({
  manifest: {
    key,
    name: key,
    description: key,
    version: '1.0.0',
    source: 'built-in' as const,
    permissions,
    approval,
    toolType,
  },
})

describe('HTTP provider clients', () => {
  it('sends replay-normalized message arrays to standard OpenAI Responses requests', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openAI(async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse(
        {
          id: 'resp_123',
          output_text: 'hello from openai',
          usage: {
            input_tokens: 3,
            output_tokens: 4,
            total_tokens: 7,
            input_tokens_details: { cached_tokens: 2, cache_creation_tokens: 1 },
            output_tokens_details: { reasoning_tokens: 6 },
          },
        },
        200,
        {
          'x-ratelimit-limit-requests': '60',
          'x-ratelimit-remaining-requests': '59',
          'x-ratelimit-reset-requests': '42',
          'x-ratelimit-limit-tokens': '120000',
          'x-ratelimit-remaining-tokens': '118000',
          'x-ratelimit-reset-tokens': '18',
        },
      )
    })

    const events = await collectEvents(
      client.query({
        prompt: 'continue',
        cwd: '/workspace',
        systemPrompt: 'be precise',
        env: { OPENAI_API_KEY: 'sk-openai-secret' },
        credentialRef: { kind: 'env', key: 'OPENAI_API_KEY' },
        messages: [
          { role: 'user', content: 'first' },
          {
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'call_1', name: 'file.read', arguments: '{"path":"notes.txt"}' }],
          },
          { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1', name: 'file.read' },
        ],
      }),
    )

    expect(requests[0]?.url).toBe('https://openai.test/v1/responses')
    expect(requestBody(requests)).toMatchObject({
      model: 'gpt-4.1-mini',
      instructions: 'be precise',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'first' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'input_text',
              text: '[assistant tool call file.read id=call_1 args={"path":"notes.txt"}]',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '[tool result file.read id=call_1]\n{"ok":true}',
            },
          ],
        },
        { role: 'user', content: [{ type: 'input_text', text: 'continue' }] },
      ],
    })
    expect(events[0]).toEqual({
      type: 'init',
      provider: 'openai',
      providerSessionId: 'openai:session',
      modelId: 'gpt-4.1-mini',
      modelFamily: 'gpt-4.1',
      providerTransport: 'openai-responses',
    })
    expect(events[1]).toEqual({
      type: 'init',
      provider: 'openai',
      providerSessionId: 'resp_123',
      modelId: 'gpt-4.1-mini',
      modelFamily: 'gpt-4.1',
      providerTransport: 'openai-responses',
    })
    expect(events.at(-1)).toEqual({
      type: 'usage',
      providerSessionId: 'resp_123',
      usage: {
        provider: 'openai',
        modelId: 'gpt-4.1-mini',
        modelFamily: 'gpt-4.1',
        providerTransport: 'openai-responses',
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: 7,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        reasoningTokens: 6,
        rateLimit: {
          provider: 'openai',
          capturedAt: expect.any(String),
          requestsMinute: { limit: 60, remaining: 59, resetSeconds: 42 },
          tokensMinute: { limit: 120000, remaining: 118000, resetSeconds: 18 },
        },
      },
    })
  })

  it('sends replay-normalized message arrays to codex-proxy OpenAI Responses requests', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openAI(
      async (url, init) => {
        requests.push({ url: String(url), init })
        return new Response(
          [
            'data: {"response_id":"resp_proxy_1","delta":"hello "}',
            'data: {"response_id":"resp_proxy_1","delta":"proxy"}',
            'data: {"response":{"usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}}',
            'data: [DONE]',
          ].join('\n'),
          {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
              'x-ratelimit-limit-requests': '120',
              'x-ratelimit-remaining-requests': '117',
              'x-ratelimit-reset-requests': '21',
            },
          },
        )
      },
      { responsesMode: 'codex-proxy' },
    )

    const events = await collectEvents(
      client.query({
        prompt: 'resume',
        cwd: '/workspace',
        env: { OPENAI_API_KEY: 'sk-openai-secret' },
        credentialRef: { kind: 'env', key: 'OPENAI_API_KEY' },
        messages: [{ role: 'user', content: 'seed' }],
      }),
    )

    expect(requestBody(requests)).toMatchObject({
      store: false,
      stream: true,
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'seed\n\nresume' }] },
      ],
    })
    expect(events[0]).toEqual({
      type: 'init',
      provider: 'openai',
      providerSessionId: 'openai:session',
      modelId: 'gpt-4.1-mini',
      modelFamily: 'gpt-4.1',
      providerTransport: 'openai-responses-codex-proxy',
    })
    expect(events[1]).toEqual({
      type: 'init',
      provider: 'openai',
      providerSessionId: 'resp_proxy_1',
      modelId: 'gpt-4.1-mini',
      modelFamily: 'gpt-4.1',
      providerTransport: 'openai-responses-codex-proxy',
    })
    expect(events.at(-1)).toEqual({
      type: 'usage',
      providerSessionId: 'resp_proxy_1',
      usage: {
        provider: 'openai',
        modelId: 'gpt-4.1-mini',
        modelFamily: 'gpt-4.1',
        providerTransport: 'openai-responses-codex-proxy',
        inputTokens: 5,
        outputTokens: 2,
        totalTokens: 7,
        rateLimit: {
          provider: 'openai',
          capturedAt: expect.any(String),
          requestsMinute: { limit: 120, remaining: 117, resetSeconds: 21 },
        },
      },
    })
  })

  it('calls OpenRouter Chat Completions with env credential refs and attribution headers', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse(
        {
          id: 'gen_123',
          choices: [{ message: { role: 'assistant', content: 'hello from openrouter' } }],
          usage: {
            prompt_tokens: 7,
            completion_tokens: 8,
            total_tokens: 15,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 2,
            completion_tokens_details: { reasoning_tokens: 4 },
          },
        },
        200,
        {
          'x-ratelimit-limit-requests': '300',
          'x-ratelimit-remaining-requests': '298',
          'x-ratelimit-reset-requests': '11',
          'x-ratelimit-limit-tokens-1h': '900000',
          'x-ratelimit-remaining-tokens-1h': '880000',
          'x-ratelimit-reset-tokens-1h': '1800',
        },
      )
    })

    const events = await collectEvents(
      client.query({
        prompt: 'hello',
        cwd: '/workspace',
        sessionId: 'runtime-session-123',
        systemPrompt: 'be brief',
        ...openRouterAuth,
        env: {
          OPENROUTER_API_KEY: 'sk-or-secret',
          OPENROUTER_HTTP_REFERER: 'http://localhost:3000',
          OPENROUTER_APP_TITLE: 'Mainspring',
        },
      }),
    )

    expect(requests[0]?.url).toBe('https://openrouter.test/api/v1/chat/completions')
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: 'Bearer sk-or-secret',
      'HTTP-Referer': 'http://localhost:3000',
      'X-OpenRouter-Title': 'Mainspring',
    })
    expect(requestBody(requests)).toMatchObject({
      model: 'openrouter/free',
      session_id: 'runtime-session-123',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
    })
    expect(events).toEqual([
      {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'openrouter:runtime-session-123',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
      },
      {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'gen_123',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
      },
      { type: 'delta', text: 'hello from openrouter' },
      { type: 'result', text: 'hello from openrouter' },
      {
        type: 'usage',
        providerSessionId: 'gen_123',
        usage: {
          provider: 'openrouter',
          modelId: 'openrouter/free',
          providerTransport: 'openrouter-chat-completions',
          inputTokens: 7,
          outputTokens: 8,
          totalTokens: 15,
          cacheReadTokens: 3,
          cacheWriteTokens: 2,
          reasoningTokens: 4,
          rateLimit: {
            provider: 'openrouter',
            capturedAt: expect.any(String),
            requestsMinute: { limit: 300, remaining: 298, resetSeconds: 11 },
            tokensHour: { limit: 900000, remaining: 880000, resetSeconds: 1800 },
          },
        },
      },
    ])
  })

  it('emits a narrow model-family hint when the resolved OpenRouter model slug is obvious', async () => {
    const client = openRouter(async () =>
      jsonResponse({
        id: 'gen_family_1',
        choices: [{ message: { role: 'assistant', content: 'family hint ok' } }],
      }),
    )

    const events = await collectEvents(
      client.query({
        prompt: 'hello',
        cwd: '/workspace',
        model: 'anthropic/claude-sonnet-4',
        ...openRouterAuth,
      }),
    )

    expect(events[0]).toEqual({
      type: 'init',
      provider: 'openrouter',
      providerSessionId: 'openrouter:session',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
    })
    expect(events[1]).toEqual({
      type: 'init',
      provider: 'openrouter',
      providerSessionId: 'gen_family_1',
      modelId: 'anthropic/claude-sonnet-4',
      modelFamily: 'claude',
      providerTransport: 'openrouter-chat-completions',
    })
  })

  it('loops OpenRouter tool calls through pushed local tool results', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      if (requests.length === 1) {
        return jsonResponse({
          id: 'gen_tool_1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'file_read',
                      arguments: JSON.stringify({ path: 'notes/input.txt' }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }
      return jsonResponse({
        id: 'gen_tool_2',
        choices: [{ message: { role: 'assistant', content: 'CLAW_PARITY_FILE_OK payload' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
    })

    const query = client.query({
      prompt: 'read a file',
      cwd: '/workspace',
      ...openRouterAuth,
      toolChoice: { type: 'function', name: 'file.read' },
      tools: [tool('file.read', 'file', { filesystem: 'read' })],
    })

    const events: ProviderEvent[] = []
    for await (const event of query.events) {
      events.push(event)
      if (event.type === 'tool_call') {
        query.push(
          JSON.stringify({
            type: 'tool_result',
            name: event.name,
            status: 'completed',
            output: { text: 'payload' },
          }),
        )
      }
    }

    expect(requests).toHaveLength(2)
    expect(requestBody(requests)).toMatchObject({
      model: 'openrouter/free',
      tools: [
        {
          type: 'function',
          function: {
            name: 'file_read',
            parameters: {
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'file_read' },
      },
      parallel_tool_calls: false,
    })
    expect(requestBody(requests, 1)).toMatchObject({
      messages: [
        { role: 'user', content: 'read a file' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: JSON.stringify({ path: 'notes/input.txt' }),
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'file_read',
        },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'file_read' },
        },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: false,
    })
    expect(events).toEqual([
      {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'openrouter:session',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
      },
      {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'gen_tool_1',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
      },
      {
        type: 'tool_call',
        name: 'file.read',
        input: { path: 'notes/input.txt' },
        toolCallId: 'call_1',
      },
      {
        type: 'init',
        provider: 'openrouter',
        providerSessionId: 'gen_tool_2',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
      },
      { type: 'delta', text: 'CLAW_PARITY_FILE_OK payload' },
      { type: 'result', text: 'CLAW_PARITY_FILE_OK payload' },
      {
        type: 'usage',
        providerSessionId: 'gen_tool_2',
        usage: {
          provider: 'openrouter',
          modelId: 'openrouter/free',
          providerTransport: 'openrouter-chat-completions',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      },
    ])
  })

  it('repairs malformed OpenRouter message history before provider submission', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse({
        id: 'gen_repaired_history',
        choices: [{ message: { role: 'assistant', content: 'history repaired' } }],
      })
    })

    await collectEvents(
      client.query({
        prompt: 'latest ask',
        cwd: '/workspace',
        systemPrompt: 'be careful',
        ...openRouterAuth,
        messages: [
          { role: 'user', content: 'first' },
          { role: 'user', content: 'second' },
          {
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'call_1', name: 'file.read', arguments: '{"path":"notes.txt"}' }],
          },
          { role: 'tool', content: '{"orphan":true}', toolCallId: 'missing', name: 'file.read' },
          { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1', name: 'file.read' },
          { role: 'user', content: 'follow up seed' },
        ],
      }),
    )

    expect(requestBody(requests)).toMatchObject({
      model: 'openrouter/free',
      messages: [
        { role: 'system', content: 'be careful' },
        { role: 'user', content: 'first\n\nsecond' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: '{"path":"notes.txt"}',
              },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', name: 'file_read', content: '{"ok":true}' },
        { role: 'user', content: 'follow up seed\n\nlatest ask' },
      ],
    })
  })

  it('sanitizes malformed historical tool-call arguments before OpenRouter replay', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse({
        id: 'gen_repaired_arguments',
        choices: [{ message: { role: 'assistant', content: 'arguments repaired' } }],
      })
    })

    await collectEvents(
      client.query({
        prompt: 'continue',
        cwd: '/workspace',
        ...openRouterAuth,
        messages: [
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              { id: 'call_blank', name: 'file.read', arguments: '' },
              { id: 'call_bad', name: 'file.read', arguments: '{"path":' },
              { id: 'call_ok', name: 'file.read', arguments: '{"path":"notes.txt"}' },
            ],
          },
          { role: 'tool', content: '{"blank":true}', toolCallId: 'call_blank', name: 'file.read' },
          { role: 'tool', content: '{"bad":true}', toolCallId: 'call_bad', name: 'file.read' },
          { role: 'tool', content: '{"ok":true}', toolCallId: 'call_ok', name: 'file.read' },
        ],
      }),
    )

    expect(requestBody(requests)).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_blank',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: '{}',
              },
            },
            {
              id: 'call_bad',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: '{}',
              },
            },
            {
              id: 'call_ok',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: '{"path":"notes.txt"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_blank',
          name: 'file_read',
          content: `${REPAIRED_TOOL_ARGUMENTS_MARKER}\n{"blank":true}`,
        },
        {
          role: 'tool',
          tool_call_id: 'call_bad',
          name: 'file_read',
          content: `${REPAIRED_TOOL_ARGUMENTS_MARKER}\n{"bad":true}`,
        },
        { role: 'tool', tool_call_id: 'call_ok', name: 'file_read', content: '{"ok":true}' },
        { role: 'user', content: 'continue' },
      ],
    })
  })

  it('allows bounded repeated OpenRouter tool rounds before final text', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      if (requests.length === 1) {
        return jsonResponse({
          id: 'gen_round_1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_read_1',
                    type: 'function',
                    function: {
                      name: 'file_read',
                      arguments: JSON.stringify({ path: 'first.txt' }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }
      if (requests.length === 2) {
        return jsonResponse({
          id: 'gen_round_2',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_read_2',
                    type: 'function',
                    function: {
                      name: 'file_read',
                      arguments: JSON.stringify({ path: 'second.txt' }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }
      return jsonResponse({
        id: 'gen_round_3',
        choices: [{ message: { role: 'assistant', content: 'used both files' } }],
      })
    })

    const query = client.query({
      prompt: 'read two files',
      cwd: '/workspace',
      ...openRouterAuth,
      tools: [tool('file.read', 'file', { filesystem: 'read' })],
    })

    const toolCalls: Array<{ name: string; input?: unknown }> = []
    const events: ProviderEvent[] = []
    for await (const event of query.events) {
      events.push(event)
      if (event.type === 'tool_call') {
        toolCalls.push({ name: event.name, input: event.input })
        query.push(
          JSON.stringify({
            type: 'tool_result',
            name: event.name,
            status: 'completed',
            output: { text: `payload:${toolCalls.length}` },
          }),
        )
      }
    }

    expect(requests).toHaveLength(3)
    expect(toolCalls).toEqual([
      { name: 'file.read', input: { path: 'first.txt' } },
      { name: 'file.read', input: { path: 'second.txt' } },
    ])
    expect(requestBody(requests, 2)).toMatchObject({
      messages: [
        { role: 'user', content: 'read two files' },
        expect.objectContaining({ role: 'assistant', tool_calls: [expect.any(Object)] }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call_read_1' }),
        expect.objectContaining({ role: 'assistant', tool_calls: [expect.any(Object)] }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call_read_2' }),
      ],
      tools: [
        expect.objectContaining({ function: expect.objectContaining({ name: 'file_read' }) }),
      ],
    })
    expect(events).toContainEqual({ type: 'result', text: 'used both files' })
  })

  it('advertises native web tools with URL/query-bound OpenRouter parameters', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = openRouter(async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse({
        id: 'gen_web_tool',
        choices: [{ message: { role: 'assistant', content: 'ready' } }],
      })
    })

    await collectEvents(
      client.query({
        prompt: 'fetch a page',
        cwd: '/workspace',
        ...openRouterAuth,
        tools: [
          tool('mainspring.agent.events.tail', 'builtin', { filesystem: 'read' }),
          tool('browser.snapshot', 'browser', { browser: true }),
          tool('browser.click', 'browser', { browser: true }),
          tool('browser.type', 'browser', { browser: true }),
          tool('browser.screenshot', 'browser', { browser: true }),
          tool('memory.write', 'memory', { filesystem: 'workspace-write' }, { required: true }),
          tool('web.search', 'web', { network: 'limited' }),
          tool('web.fetch', 'web', { network: 'limited' }),
          tool('skills.install', 'builtin', { filesystem: 'workspace-write' }, { required: true }),
        ],
      }),
    )

    expect(requestBody(requests)).toMatchObject({
      tools: [
        {
          type: 'function',
          function: {
            name: 'mainspring_agent_events_tail',
            parameters: {
              properties: {
                limit: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'browser_snapshot',
            parameters: {
              properties: {
                format: { type: 'string', enum: ['aria', 'text'] },
                task: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'browser_click',
            parameters: {
              properties: {
                ref: { type: 'string' },
                task: { type: 'string' },
              },
              required: ['ref'],
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'browser_type',
            parameters: {
              properties: {
                ref: { type: 'string' },
                text: { type: 'string' },
                submit: { type: 'boolean' },
                task: { type: 'string' },
              },
              required: ['ref', 'text'],
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'browser_screenshot',
            parameters: {
              properties: {
                fullPage: { type: 'boolean' },
                artifactLabel: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'memory_write',
            parameters: {
              properties: {
                text: { type: 'string' },
                tags: { type: 'array' },
              },
              required: ['text'],
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'web_search',
            parameters: {
              properties: {
                query: { type: 'string' },
                maxResults: { type: 'number' },
              },
              required: ['query'],
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'web_fetch',
            parameters: {
              properties: {
                url: { type: 'string' },
                maxBytes: { type: 'number' },
              },
              required: ['url'],
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'skills_install',
            parameters: {
              properties: {
                manifest: {
                  type: 'object',
                  required: [
                    'key',
                    'name',
                    'description',
                    'version',
                    'source',
                    'permissions',
                    'approval',
                  ],
                  additionalProperties: false,
                },
              },
              required: ['manifest'],
              additionalProperties: false,
            },
          },
        },
      ],
    })
  })

  it('reports an OpenRouter error when the post-tool final answer is empty', async () => {
    let requestCount = 0
    const client = openRouter(async () => {
      requestCount += 1
      if (requestCount === 1) {
        return jsonResponse({
          id: 'gen_tool_empty_1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'file_read',
                      arguments: JSON.stringify({ path: 'notes/input.txt' }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }
      return jsonResponse({
        id: 'gen_tool_empty_2',
        choices: [{ message: { role: 'assistant', content: '' } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      })
    })

    const query = client.query({
      prompt: 'read a file',
      cwd: '/workspace',
      ...openRouterAuth,
      toolChoice: { type: 'function', name: 'file.read' },
      tools: [tool('file.read', 'file', { filesystem: 'read' })],
    })

    const events: ProviderEvent[] = []
    for await (const event of query.events) {
      events.push(event)
      if (event.type === 'tool_call') {
        query.push(
          JSON.stringify({
            type: 'tool_result',
            name: event.name,
            status: 'completed',
            output: { text: 'payload' },
          }),
        )
      }
    }

    expect(events).toContainEqual({
      type: 'error',
      message: 'OpenRouter returned no final assistant text after local tool result.',
      retryable: true,
      classification: 'provider_empty_tool_final',
    })
    expect(events).toContainEqual({
      type: 'usage',
      providerSessionId: 'gen_tool_empty_2',
      usage: {
        provider: 'openrouter',
        modelId: 'openrouter/free',
        providerTransport: 'openrouter-chat-completions',
        inputTokens: 10,
        outputTokens: 0,
        totalTokens: 10,
      },
    })
  })

  it('times out hung OpenRouter requests with a sanitized provider error', async () => {
    const client = openRouter(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        }),
      { requestTimeoutMs: 5 },
    )

    const events = await collectEvents(
      client.query({
        prompt: 'hello',
        cwd: '/workspace',
        ...openRouterAuth,
      }),
    )

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: 'Provider request timed out after 5ms.',
      classification: 'provider_request_failed',
    })
  })

  it('redacts provider error bodies and rejects unresolved non-env secret refs', async () => {
    const client = openRouter(async () =>
      jsonResponse({ error: { message: 'bad apiKey=sk-secret-value' } }, 401),
    )

    const failedEvents = await collectEvents(
      client.query({
        prompt: 'hello',
        cwd: '/workspace',
        env: { OPENROUTER_API_KEY: 'sk-secret-value' },
        credentialRef: { kind: 'env', key: 'OPENROUTER_API_KEY' },
      }),
    )
    expect(failedEvents.at(-1)).toMatchObject({
      type: 'error',
      message: 'OpenRouter request failed (401): bad apiKey=[redacted]',
    })

    const unresolvedEvents = await collectEvents(
      client.query({
        prompt: 'hello',
        cwd: '/workspace',
        credentialRef: { kind: 'managed', key: 'openrouter-default' },
      }),
    )
    expect(unresolvedEvents.at(-1)).toMatchObject({
      type: 'error',
      message: 'Provider credential ref kind managed cannot be resolved in-process.',
    })
  })
})
