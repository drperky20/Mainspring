import type { PrecisionFact, PrecisionFactKind } from './types.js'

const WINDOWS_PATH_PATTERN = /\b(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]+/g
const POSIX_PATH_PATTERN = /(?:^|[\s"'(])((?:\.{1,2}\/|\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){1,})(?=$|[\s"',)])/g
const HASH_PATTERN = /\b[a-fA-F0-9]{7,64}\b/g
const ID_PATTERN = /\b(?:[A-Z][A-Z0-9]+-\d+|[a-z]+_[A-Za-z0-9_-]{6,}|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})\b/g
const VERSION_PATTERN = /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9_.-]+)?\b/g
const COUNT_PATTERN = /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:bytes?|tokens?|files?|tests?|errors?|warnings?|ms|s|KB|MB|GB)\b/gi
const SYMBOL_PATTERN = /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){1,}\b/g
const COMMAND_PATTERN =
  /\b((?:pnpm|npm|yarn|node|git|rg|grep|python|python3|powershell|pwsh|cmd|curl|docker)\b[^\r\n]{0,180})/gi

function normalizeValue(value: string): string {
  return value.trim().replace(/[),.;:]+$/, '')
}

function pushFact(
  facts: PrecisionFact[],
  seen: Set<string>,
  kind: PrecisionFactKind,
  value: string,
  confidence: number,
  label?: string,
): void {
  const normalized = normalizeValue(value)
  if (!normalized || normalized.length > 240) return
  const key = `${kind}:${normalized.toLowerCase()}`
  if (seen.has(key)) return
  seen.add(key)
  facts.push({
    kind,
    value: normalized,
    confidence,
    ...(label ? { label } : {}),
  })
}

function collectMatches(
  facts: PrecisionFact[],
  seen: Set<string>,
  text: string,
  pattern: RegExp,
  kind: PrecisionFactKind,
  confidence: number,
  label?: string,
  group = 0,
): void {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const value = match[group] ?? match[0]
    pushFact(facts, seen, kind, value, confidence, label)
    if (facts.length >= 64) return
  }
}

const FACT_KIND_WEIGHT: Record<PrecisionFactKind, number> = {
  hash: 1,
  path: 0.96,
  command: 0.92,
  id: 0.88,
  version: 0.72,
  count: 0.5,
  symbol: 0.35,
}

function valueScore(fact: PrecisionFact): number {
  let score = FACT_KIND_WEIGHT[fact.kind] * fact.confidence
  if (/[\\/]/.test(fact.value)) score += 0.08
  if (/\b(?:pnpm|npm|node|git|docker|powershell|pwsh)\b/i.test(fact.value)) score += 0.08
  if (fact.value.length >= 24) score += 0.03
  return score
}

export function rankPrecisionFacts(facts: readonly PrecisionFact[]): PrecisionFact[] {
  return facts
    .map((fact, index) => ({ fact, index, score: valueScore(fact) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.fact)
}

export function extractPrecisionFacts(text: string, maxFacts = 32): PrecisionFact[] {
  const facts: PrecisionFact[] = []
  const seen = new Set<string>()

  collectMatches(facts, seen, text, WINDOWS_PATH_PATTERN, 'path', 0.96, 'path')
  collectMatches(facts, seen, text, POSIX_PATH_PATTERN, 'path', 0.88, 'path', 1)
  collectMatches(facts, seen, text, HASH_PATTERN, 'hash', 0.94, 'hash')
  collectMatches(facts, seen, text, ID_PATTERN, 'id', 0.88, 'id')
  collectMatches(facts, seen, text, VERSION_PATTERN, 'version', 0.82, 'version')
  collectMatches(facts, seen, text, COMMAND_PATTERN, 'command', 0.9, 'command', 1)
  collectMatches(facts, seen, text, COUNT_PATTERN, 'count', 0.78, 'count')
  collectMatches(facts, seen, text, SYMBOL_PATTERN, 'symbol', 0.65, 'symbol')

  return rankPrecisionFacts(facts).slice(0, Math.max(0, maxFacts))
}

export function factsheetText(facts: readonly PrecisionFact[]): string {
  if (facts.length === 0) return ''
  return facts.map((fact) => `${fact.kind}: ${fact.value}`).join('\n')
}
