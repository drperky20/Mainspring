import { createHash } from 'node:crypto'
import type { RunContextPack } from '#protocol'
import { summarizeContextBudget, type ContextBudgetInput } from './ContextBudget.js'
import { createContextCompressionPlan } from './ContextCompressionPlan.js'

export interface BuildContextPackInput extends ContextBudgetInput {}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function buildRunContextPack(input: BuildContextPackInput): RunContextPack {
  const historyMessages = input.historyMessages ?? []
  const systemPrompt = input.systemPrompt ?? ''
  const budget = summarizeContextBudget(input)
  const plan = createContextCompressionPlan(input)
  const latestMessageHash = hashText(input.latestMessage)
  const systemPromptHash = systemPrompt ? hashText(systemPrompt) : undefined
  const contentHash = hashText(
    JSON.stringify({
      latestMessage: input.latestMessage,
      historyMessages,
      systemPrompt,
      toolCount: budget.toolCount,
      estimatedTokens: budget.estimatedTokens,
    }),
  )

  const packBase = {
    version: 1 as const,
    strategy: 'latest-message-inline-session-memory' as const,
    contentHash,
    latestMessageHash,
    ...(systemPromptHash ? { systemPromptHash } : {}),
    messageCount: budget.messageCount,
    recentMessageCount: budget.recentMessageCount,
    latestMessageBytes: budget.latestMessageBytes,
    historyBytes: budget.historyBytes,
    systemPromptBytes: budget.systemPromptBytes,
    toolCount: budget.toolCount,
    estimatedTokens: budget.estimatedTokens,
    summaryBytes: 0,
    summaryStrategy: plan.summaryStrategy,
    delivery: {
      latestMessage: 'inline' as const,
      history: historyMessages.length > 0 ? ('session-memory' as const) : ('none' as const),
      systemPrompt: systemPrompt ? ('inline' as const) : ('none' as const),
      files: 'manifest-refs' as const,
    },
  }

  const packBytes = Buffer.byteLength(JSON.stringify(packBase), 'utf8')
  return {
    ...packBase,
    packBytes,
  }
}
