import type { EncodedContextBlock } from './types.js'

export type RehydrateIntent =
  | 'quote'
  | 'edit'
  | 'hash-compare'
  | 'path-sensitive'
  | 'approval'
  | 'security'
  | 'answer'
  | 'browse'

export type RehydrateUrgency = 'none' | 'recommended' | 'required'

export interface RehydrateDecision {
  blockId: string
  recoverableId: string
  urgency: RehydrateUrgency
  reasons: string[]
}

export interface RehydratePolicyInput {
  intent: RehydrateIntent
  blocks: readonly EncodedContextBlock[]
  question?: string
}

const EXACT_INTENTS = new Set<RehydrateIntent>([
  'quote',
  'edit',
  'hash-compare',
  'path-sensitive',
  'approval',
  'security',
])

const EXACT_QUESTION_PATTERN =
  /\b(quote|exact|verbatim|hash|sha|checksum|diff|patch|edit|line\s+\d+|path|filename|secret|approval|permission|security|vulnerability)\b/i

function hasPrecisionFacts(block: EncodedContextBlock): boolean {
  return block.facts.some((fact) =>
    ['path', 'hash', 'id', 'version', 'command'].includes(fact.kind),
  )
}

function decisionForBlock(input: {
  intent: RehydrateIntent
  questionExact: boolean
  block: EncodedContextBlock
}): RehydrateDecision {
  const reasons: string[] = []
  let urgency: RehydrateUrgency = 'none'

  if (input.block.encoding.kind === 'text') {
    return {
      blockId: input.block.blockId,
      recoverableId: input.block.recoverableId,
      urgency,
      reasons,
    }
  }

  if (EXACT_INTENTS.has(input.intent)) {
    urgency = 'required'
    reasons.push(`intent:${input.intent}`)
  }

  if (input.questionExact) {
    urgency = 'required'
    reasons.push('question-demands-exactness')
  }

  if (input.block.encoding.kind === 'image' || input.block.encoding.kind === 'image+factsheet') {
    if (input.block.image?.level === 'ultra-dense') {
      urgency = urgency === 'required' ? urgency : 'recommended'
      reasons.push('ultra-dense-image-is-background-only')
    }
    if (hasPrecisionFacts(input.block)) {
      urgency = urgency === 'required' ? urgency : 'recommended'
      reasons.push('compressed-block-has-precision-facts')
    }
    if ((input.block.image?.visualTokens ?? 0) > 0) {
      reasons.push('visual-text-is-lossy')
    }
  }

  if (input.block.encoding.kind === 'summary+rehydrate') {
    urgency = urgency === 'required' ? urgency : 'recommended'
    reasons.push('summary-is-not-source-text')
  }

  return {
    blockId: input.block.blockId,
    recoverableId: input.block.recoverableId,
    urgency,
    reasons: [...new Set(reasons)],
  }
}

export function planContextRehydration(input: RehydratePolicyInput): RehydrateDecision[] {
  const questionExact = input.question ? EXACT_QUESTION_PATTERN.test(input.question) : false
  return input.blocks
    .map((block) => decisionForBlock({ intent: input.intent, questionExact, block }))
    .filter((decision) => decision.urgency !== 'none')
}
