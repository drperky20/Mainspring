import type { ProviderMessage } from '../providers/types.js'

export interface ProviderMessageHistoryRepairSummary {
  orphanToolResultsDropped: number
  consecutiveUserMerges: number
  malformedToolArgumentsRepaired: number
}

export interface ProviderMessageHistoryRepairResult {
  messages: ProviderMessage[]
  repairs: ProviderMessageHistoryRepairSummary
}

const REPAIRED_TOOL_ARGUMENTS_MARKER =
  '[Historical tool-call arguments were repaired before replay. Original arguments were malformed or blank.]'

function sanitizeToolCallArguments(
  argumentsValue: string | undefined,
): { value: string | undefined; repaired: boolean } {
  if (argumentsValue === undefined) return { value: undefined, repaired: false }
  if (!argumentsValue.trim()) return { value: '{}', repaired: true }
  try {
    JSON.parse(argumentsValue)
    return { value: argumentsValue, repaired: false }
  } catch {
    return { value: '{}', repaired: true }
  }
}

function cloneMessage(message: ProviderMessage): ProviderMessage {
  if (message.role === 'assistant') {
    return {
      ...message,
      ...(message.toolCalls
        ? {
            toolCalls: message.toolCalls.map((toolCall) => ({ ...toolCall })),
          }
        : {}),
    }
  }
  return { ...message }
}

export function repairProviderMessageHistory(
  messages: ProviderMessage[],
): ProviderMessageHistoryRepairResult {
  if (messages.length === 0) {
    return {
      messages: [],
      repairs: { orphanToolResultsDropped: 0, consecutiveUserMerges: 0, malformedToolArgumentsRepaired: 0 },
    }
  }

  let orphanToolResultsDropped = 0
  let consecutiveUserMerges = 0
  let malformedToolArgumentsRepaired = 0
  const filtered: ProviderMessage[] = []
  let knownToolCallIds = new Set<string>()
  let repairedToolCallIds = new Set<string>()

  for (const originalMessage of messages) {
    const message = cloneMessage(originalMessage)
    if (message.role === 'assistant') {
      repairedToolCallIds = new Set<string>()
      if (message.toolCalls) {
        message.toolCalls = message.toolCalls.map((toolCall) => {
          const sanitized = sanitizeToolCallArguments(toolCall.arguments)
          if (sanitized.repaired) {
            malformedToolArgumentsRepaired += 1
            if (toolCall.id.trim()) repairedToolCallIds.add(toolCall.id)
          }
          return {
            ...toolCall,
            ...(sanitized.value === undefined ? {} : { arguments: sanitized.value }),
          }
        })
      }
      knownToolCallIds = new Set((message.toolCalls ?? []).map((toolCall) => toolCall.id).filter(Boolean))
      filtered.push(message)
      continue
    }
    if (message.role === 'tool') {
      const toolCallId = message.toolCallId?.trim()
      if (toolCallId && knownToolCallIds.has(toolCallId)) {
        if (repairedToolCallIds.has(toolCallId)) {
          message.content = message.content.startsWith(REPAIRED_TOOL_ARGUMENTS_MARKER)
            ? message.content
            : `${REPAIRED_TOOL_ARGUMENTS_MARKER}\n${message.content}`
        }
        filtered.push(message)
      } else {
        orphanToolResultsDropped += 1
      }
      continue
    }
    if (message.role === 'user') {
      knownToolCallIds = new Set()
    }
    filtered.push(message)
  }

  const merged: ProviderMessage[] = []
  for (const message of filtered) {
    const previous = merged.at(-1)
    if (previous?.role === 'user' && message.role === 'user') {
      previous.content =
        previous.content && message.content
          ? `${previous.content}\n\n${message.content}`
          : previous.content || message.content
      consecutiveUserMerges += 1
      continue
    }
    merged.push(message)
  }

  return {
    messages: merged,
    repairs: {
      orphanToolResultsDropped,
      consecutiveUserMerges,
      malformedToolArgumentsRepaired,
    },
  }
}

export { REPAIRED_TOOL_ARGUMENTS_MARKER }
