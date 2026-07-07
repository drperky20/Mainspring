import type { CompiledContextPrompt, EncodedContextBlock } from './types.js'

export interface ContextBudgetLimits {
  maxImages?: number
  maxVisualTokens?: number
  maxEstimatedPromptTokens?: number
}

export interface ContextBudgetFinding {
  severity: 'info' | 'warning' | 'blocked'
  code: string
  message: string
  blockId?: string
}

export interface ContextBudgetReport {
  withinBudget: boolean
  imageParts: number
  estimatedVisualTokens: number
  estimatedPromptTokens: number
  findings: ContextBudgetFinding[]
}

function imageBlocks(blocks: readonly EncodedContextBlock[]): EncodedContextBlock[] {
  return blocks.filter((block) => Boolean(block.image))
}

export function analyzeContextBudget(
  compiled: CompiledContextPrompt,
  limits: ContextBudgetLimits = {},
): ContextBudgetReport {
  const maxImages = limits.maxImages ?? compiled.model.profile.maxImages
  const maxEstimatedPromptTokens =
    limits.maxEstimatedPromptTokens ?? compiled.model.contextWindowTokens
  const imagePartCount = compiled.stats.imageParts
  const estimatedVisualTokens = compiled.stats.estimatedVisualTokens
  const estimatedPromptTokens =
    compiled.stats.estimatedTextTokens + compiled.stats.estimatedVisualTokens
  const findings: ContextBudgetFinding[] = []

  if (imagePartCount > maxImages) {
    findings.push({
      severity: 'blocked',
      code: 'context-images-over-limit',
      message: `Compiled prompt has ${imagePartCount} image parts but model allows ${maxImages}.`,
    })
  }

  if (
    limits.maxVisualTokens !== undefined &&
    estimatedVisualTokens > limits.maxVisualTokens
  ) {
    findings.push({
      severity: 'blocked',
      code: 'context-visual-tokens-over-limit',
      message: `Compiled prompt estimates ${estimatedVisualTokens} visual tokens but limit is ${limits.maxVisualTokens}.`,
    })
  }

  if (
    maxEstimatedPromptTokens !== undefined &&
    estimatedPromptTokens > maxEstimatedPromptTokens
  ) {
    findings.push({
      severity: 'blocked',
      code: 'context-prompt-tokens-over-limit',
      message: `Compiled prompt estimates ${estimatedPromptTokens} prompt tokens but limit is ${maxEstimatedPromptTokens}.`,
    })
  }

  for (const block of imageBlocks(compiled.plan.blocks)) {
    if (block.image?.level === 'ultra-dense') {
      findings.push({
        severity: 'warning',
        code: 'context-ultra-dense-is-background-only',
        message: 'Ultra-dense projections should only be used as background memory.',
        blockId: block.blockId,
      })
    }
  }

  return {
    withinBudget: findings.every((finding) => finding.severity !== 'blocked'),
    imageParts: imagePartCount,
    estimatedVisualTokens,
    estimatedPromptTokens,
    findings,
  }
}

export function rankContextBudgetDowngrades(
  compiled: CompiledContextPrompt,
): Array<{
  blockId: string
  recoverableId: string
  reason: string
  estimatedSavingsTokens: number
}> {
  return imageBlocks(compiled.plan.blocks)
    .map((block) => ({
      blockId: block.blockId,
      recoverableId: block.recoverableId,
      reason:
        block.image?.level === 'ultra-dense'
          ? 'background-only image can degrade first'
          : 'lossy image projection can degrade to summary+rehydrate',
      estimatedSavingsTokens: block.estimatedSavingsTokens,
    }))
    .sort((a, b) => a.estimatedSavingsTokens - b.estimatedSavingsTokens)
}
