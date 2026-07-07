import type { ContextBlock, PrecisionFact } from './types.js'

const SECRET_PATTERN =
  /\b(?:api[_-]?key|token|secret|password|credential|authorization|bearer)\b|(?:sk-[A-Za-z0-9_-]{12,})/i
const PROMPT_INJECTION_PATTERN =
  /\b(ignore (?:all )?(?:previous|prior) instructions|system prompt|developer message|reveal|exfiltrate|do not obey|jailbreak)\b/i

export interface ContextSecurityReview {
  exactSensitive: boolean
  tainted: boolean
  reasons: string[]
}

function blockText(block: ContextBlock): string {
  return typeof block.content === 'string'
    ? block.content
    : Buffer.from(block.content.slice(0, 2048)).toString('utf8')
}

export function reviewContextBlockSecurity(block: ContextBlock): ContextSecurityReview {
  const reasons: string[] = []
  const text = blockText(block)
  if (block.exactSensitive || ['policy', 'secret', 'exact'].includes(block.risk ?? '')) {
    reasons.push(`risk:${block.risk ?? 'exactSensitive'}`)
  }
  if (SECRET_PATTERN.test(text)) reasons.push('credential-like-text')
  if (PROMPT_INJECTION_PATTERN.test(text)) reasons.push('prompt-injection-like-text')
  if (block.risk === 'tainted') reasons.push('explicitly-tainted')

  return {
    exactSensitive: reasons.some((reason) => reason !== 'prompt-injection-like-text'),
    tainted: block.risk === 'tainted' || PROMPT_INJECTION_PATTERN.test(text),
    reasons: [...new Set(reasons)],
  }
}

export function sanitizeFactsForTrustBoundary(
  facts: readonly PrecisionFact[],
  input: { tainted?: boolean; maxFacts?: number } = {},
): PrecisionFact[] {
  const maxFacts = input.maxFacts ?? facts.length
  const filtered = input.tainted
    ? facts.filter((fact) => fact.kind !== 'command' && fact.kind !== 'symbol')
    : facts
  return filtered.slice(0, maxFacts)
}
