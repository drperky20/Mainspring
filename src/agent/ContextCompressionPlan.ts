import {
  DEFAULT_CONTEXT_MAX_TOKENS,
  summarizeContextBudget,
  type ContextBudgetInput,
  type ContextBudgetSummary,
} from './ContextBudget.js'

export interface ContextCompressionPlan {
  required: boolean
  reason: 'within_budget' | 'over_budget'
  estimatedTokens: number
  maxTokens: number
  overflowTokens: number
  protectedHeadMessages: number
  protectedTailMessages: number
  summaryStrategy: 'metadata-only'
  targetRecentMessages: number
}

export function createContextCompressionPlan(
  input: ContextBudgetInput,
): ContextCompressionPlan {
  const budget: ContextBudgetSummary = summarizeContextBudget({
    ...input,
    maxTokens: input.maxTokens ?? DEFAULT_CONTEXT_MAX_TOKENS,
  })
  return {
    required: budget.compressionNeeded,
    reason: budget.compressionNeeded ? 'over_budget' : 'within_budget',
    estimatedTokens: budget.estimatedTokens,
    maxTokens: budget.maxTokens,
    overflowTokens: Math.max(0, budget.estimatedTokens - budget.maxTokens),
    protectedHeadMessages: budget.protectedHeadMessages,
    protectedTailMessages: budget.protectedTailMessages,
    summaryStrategy: 'metadata-only',
    targetRecentMessages: budget.protectedHeadMessages + budget.protectedTailMessages + 1,
  }
}
