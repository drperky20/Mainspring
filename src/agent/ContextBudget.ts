export interface ContextBudgetInput {
  latestMessage: string
  historyMessages?: string[]
  systemPrompt?: string
  toolCount?: number
  maxTokens?: number
  protectedHeadMessages?: number
  protectedTailMessages?: number
}

export interface ContextBudgetSummary {
  messageCount: number
  recentMessageCount: number
  latestMessageBytes: number
  historyBytes: number
  systemPromptBytes: number
  toolCount: number
  estimatedTokens: number
  maxTokens: number
  protectedHeadMessages: number
  protectedTailMessages: number
  compressionNeeded: boolean
}

export const DEFAULT_CONTEXT_MAX_TOKENS = 4_000
export const DEFAULT_PROTECTED_HEAD_MESSAGES = 1
export const DEFAULT_PROTECTED_TAIL_MESSAGES = 4

export function estimateTextTokens(value: string): number {
  if (!value) return 0
  return Math.max(1, Math.ceil(Buffer.byteLength(value, 'utf8') / 4))
}

export function summarizeContextBudget(input: ContextBudgetInput): ContextBudgetSummary {
  const historyMessages = input.historyMessages ?? []
  const latestMessageBytes = Buffer.byteLength(input.latestMessage, 'utf8')
  const historyBytes = historyMessages.reduce(
    (total, message) => total + Buffer.byteLength(message, 'utf8'),
    0,
  )
  const systemPromptBytes = Buffer.byteLength(input.systemPrompt ?? '', 'utf8')
  const toolCount = Math.max(0, Math.floor(input.toolCount ?? 0))
  const estimatedTokens =
    estimateTextTokens(input.latestMessage) +
    historyMessages.reduce((total, message) => total + estimateTextTokens(message), 0) +
    estimateTextTokens(input.systemPrompt ?? '') +
    toolCount * 32

  const maxTokens = Math.max(256, Math.floor(input.maxTokens ?? DEFAULT_CONTEXT_MAX_TOKENS))
  const protectedHeadMessages = Math.max(
    0,
    Math.floor(input.protectedHeadMessages ?? DEFAULT_PROTECTED_HEAD_MESSAGES),
  )
  const protectedTailMessages = Math.max(
    0,
    Math.floor(input.protectedTailMessages ?? DEFAULT_PROTECTED_TAIL_MESSAGES),
  )

  return {
    messageCount: historyMessages.length + 1,
    recentMessageCount: Math.min(historyMessages.length + 1, protectedTailMessages + 1),
    latestMessageBytes,
    historyBytes,
    systemPromptBytes,
    toolCount,
    estimatedTokens,
    maxTokens,
    protectedHeadMessages,
    protectedTailMessages,
    compressionNeeded: estimatedTokens > maxTokens,
  }
}
