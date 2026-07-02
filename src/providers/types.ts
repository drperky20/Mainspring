import type {
  ProviderUsage,
  RuntimeSecretRef,
  RuntimeSecretRefKind,
  ToolManifest,
} from '#protocol'

export interface ProviderToolDefinition {
  manifest: ToolManifest
}

export interface ProviderMessageToolCall {
  id: string
  name: string
  arguments?: string
}

export type ProviderMessage =
  | {
      role: 'system' | 'user'
      content: string
    }
  | {
      role: 'assistant'
      content?: string | null
      toolCalls?: ProviderMessageToolCall[]
    }
  | {
      role: 'tool'
      content: string
      toolCallId?: string
      name?: string
    }

export type ProviderToolChoice = 'auto' | { type: 'function'; name: string }

export interface QueryInput {
  prompt: string
  sessionId?: string
  resumeAt?: string
  cwd: string
  systemPrompt?: string
  env?: Record<string, string | undefined>
  additionalDirectories?: string[]
  model?: string
  effort?: string
  providerId?: string
  credentialRef?: RuntimeSecretRef
  resolveCredential?: RuntimeSecretResolver
  messages?: ProviderMessage[]
  tools?: ProviderToolDefinition[]
  toolChoice?: ProviderToolChoice
}

export interface AgentProvider {
  query(input: QueryInput): AgentQuery
}

export interface AgentQuery {
  push(message: string): void
  end(): void
  events: AsyncIterable<ProviderEvent>
  abort(): void
}

export type ProviderEvent =
  | {
      type: 'init'
      providerSessionId: string
      provider?: string
      modelId?: string
      modelFamily?: string
      providerTransport?: string
      /**
       * Deprecated event mirror for callers that still read sessionId.
       */
      sessionId?: string
    }
  | { type: 'result'; text: string | null }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; input?: unknown; toolCallId?: string }
  | { type: 'tool_result'; name: string; output?: unknown; toolCallId?: string }
  | { type: 'error'; message: string; retryable: boolean; classification?: string }
  | { type: 'progress'; message: string }
  | { type: 'usage'; usage: ProviderUsage; providerSessionId?: string }

export type RuntimeCredentialRef = RuntimeSecretRef
export type RuntimeCredentialRefKind = RuntimeSecretRefKind
export type RuntimeSecretResolver = (ref: RuntimeSecretRef) => string | undefined

export interface RuntimeProviderClient {
  query(input: QueryInput): AgentQuery
}
