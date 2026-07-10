import { createHash } from 'node:crypto'
import type { ProviderMessage, QueryInput } from '../providers/types.js'
import { compileContextModelSpec } from './ModelSpecCompiler.js'
import { reviewContextBlockSecurity } from './ContextSecurity.js'
import type {
  CompiledContextModelSpec,
  ContextBlock,
  ProviderModelSpec,
  RecoverableContextStore,
} from './types.js'

export type ContextCandidateSource =
  | 'system'
  | 'agent'
  | 'user'
  | 'working_memory'
  | 'long_term_memory'
  | 'conversation_summary'
  | 'run_summary'
  | 'workspace'
  | 'artifact'
  | 'page'
  | 'file'
  | 'tool_result'
  | 'archive'

export type ContextSensitivity = 'public' | 'workspace' | 'sensitive' | 'secret' | 'tainted'

export type ContextDecisionAction =
  | 'included_exact'
  | 'included_summary'
  | 'rehydrate_stub'
  | 'dropped'

export type ContextDecisionReason =
  | 'required'
  | 'selected'
  | 'summarized_for_budget'
  | 'archived_for_budget'
  | 'budget'
  | 'duplicate'
  | 'secret_boundary'
  | 'tainted_boundary'
  | 'invalid_candidate'

export interface ContextCandidate {
  candidateId: string
  source: ContextCandidateSource
  content: string | Uint8Array
  label?: string
  priority?: number
  recency?: number
  relevance?: number
  required?: boolean
  exactRetention?: boolean
  compressionEligible?: boolean
  sensitivity?: ContextSensitivity
  createdAt?: string
  provenance?: {
    sourceId?: string
    runId?: string
    eventId?: string
    workspaceId?: string
    contentHash?: string
  }
}

export interface ContextDecision {
  candidateId: string
  source: ContextCandidateSource
  action: ContextDecisionAction
  reason: ContextDecisionReason
  originalTokens: number
  finalTokens: number
  contentHash: string
  recoverableId?: string
}

export interface ContextDecisionTelemetry {
  version: 1
  assemblyId: string
  modelId: string
  providerId: string
  contextWindowTokens: number
  reservedOutputTokens: number
  fixedOverheadTokens: number
  estimatedInputTokens: number
  availableContextTokens: number
  decisions: ContextDecision[]
}

export interface ContextAssembly {
  assemblyId: string
  model: CompiledContextModelSpec
  queryInput: QueryInput
  decisions: ContextDecision[]
  telemetry: ContextDecisionTelemetry
  estimatedInputTokens: number
  availableContextTokens: number
  reservedOutputTokens: number
}

export interface ContextSourceInput {
  query: QueryInput
  model: CompiledContextModelSpec
  contextWindowTokens: number
}

/** A context source must be deterministic for equivalent durable inputs. */
export interface ContextSource {
  sourceId: string
  collect(input: ContextSourceInput): readonly ContextCandidate[] | Promise<readonly ContextCandidate[]>
}

export interface ContextLensAssemblerOptions {
  sources?: readonly ContextSource[]
  recoverableStore?: RecoverableContextStore
  defaultContextWindowTokens?: number
  defaultReservedOutputTokens?: number
  fixedOverheadTokens?: number
  maxCandidates?: number
}

export interface AssembleContextInput {
  query: QueryInput
  candidates?: readonly ContextCandidate[]
  modelSpec?: ProviderModelSpec | CompiledContextModelSpec
  contextWindowTokens?: number
  reservedOutputTokens?: number
}

export class ContextBudgetExceededError extends Error {
  readonly code = 'context_required_material_exceeds_budget'

  constructor(input: { candidateId?: string; availableTokens: number; requiredTokens: number }) {
    super(
      input.candidateId
        ? `Required context candidate ${input.candidateId} exceeds the available model context budget.`
        : 'Required query material exceeds the available model context budget.',
    )
    this.name = 'ContextBudgetExceededError'
    this.candidateId = input.candidateId
    this.availableTokens = input.availableTokens
    this.requiredTokens = input.requiredTokens
  }

  readonly candidateId?: string
  readonly availableTokens: number
  readonly requiredTokens: number
}

function estimateTextTokens(value: string): number {
  if (!value) return 0
  return Math.max(1, Math.ceil(Buffer.byteLength(value, 'utf8') / 4))
}

function textForContent(content: string | Uint8Array): string {
  if (typeof content === 'string') return content
  const sample = content.slice(0, Math.min(content.byteLength, 512))
  const hasBinary = Array.from(sample).some((byte) => byte === 0 || (byte < 7 || (byte > 13 && byte < 32)))
  return hasBinary
    ? `[binary context: ${content.byteLength} bytes]`
    : Buffer.from(content).toString('utf8')
}

function contentHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function messagesText(messages: readonly ProviderMessage[] | undefined): string {
  return (messages ?? [])
    .map((message) => {
      if (message.role === 'assistant') {
        return `${message.content ?? ''}${message.toolCalls ? JSON.stringify(message.toolCalls) : ''}`
      }
      return message.content
    })
    .join('\n')
}

function toolTokens(query: QueryInput): number {
  return estimateTextTokens(JSON.stringify(query.tools ?? []))
}

function normalizedNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function compareCandidates(left: ContextCandidate, right: ContextCandidate): number {
  const byPriority = normalizedNumber(right.priority) - normalizedNumber(left.priority)
  if (byPriority !== 0) return byPriority
  const byRelevance = normalizedNumber(right.relevance) - normalizedNumber(left.relevance)
  if (byRelevance !== 0) return byRelevance
  const byRecency = normalizedNumber(right.recency) - normalizedNumber(left.recency)
  if (byRecency !== 0) return byRecency
  const byCandidateId = left.candidateId.localeCompare(right.candidateId)
  if (byCandidateId !== 0) return byCandidateId
  return contentHash(left.content).localeCompare(contentHash(right.content))
}

function candidateBlock(candidate: ContextCandidate): ContextBlock {
  return {
    blockId: candidate.candidateId,
    kind: candidate.source === 'system' || candidate.source === 'agent'
      ? 'system_prompt'
      : candidate.source === 'user'
        ? 'user_intent'
        : candidate.source === 'file'
          ? 'file'
          : candidate.source === 'tool_result'
            ? 'tool_result'
            : candidate.source === 'page' || candidate.source === 'artifact'
              ? 'docs'
              : 'background',
    content: candidate.content,
    ...(candidate.sensitivity === 'tainted' ? { risk: 'tainted' as const } : {}),
    ...(candidate.exactRetention ? { exactSensitive: true } : {}),
  }
}

function deterministicSummary(value: string, targetTokens: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const maxChars = Math.max(48, Math.floor(targetTokens * 4))
  if (normalized.length <= maxChars) return normalized
  const headLength = Math.max(24, Math.floor((maxChars - 3) * 0.7))
  const tailLength = Math.max(16, maxChars - headLength - 3)
  return `${normalized.slice(0, headLength).trimEnd()} ... ${normalized.slice(-tailLength).trimStart()}`
}

function renderedCandidate(candidate: ContextCandidate, value: string): string {
  const label = candidate.label?.trim() || candidate.source.replace(/_/g, ' ')
  return `[Mainspring ${label}]\n${value}`
}

function stubFor(candidate: ContextCandidate, recoverableId: string): string {
  const label = candidate.label?.trim() || candidate.source.replace(/_/g, ' ')
  return `[Archived ${label}; recoverableId=${recoverableId}. Use context.rehydrate before exact claims.]`
}

function isUsableCandidate(candidate: ContextCandidate): boolean {
  return Boolean(candidate.candidateId.trim()) && candidate.content !== undefined && candidate.content !== null
}

function decisionHash(input: {
  modelId: string
  query: QueryInput
  decisions: readonly ContextDecision[]
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      modelId: input.modelId,
      promptHash: contentHash(input.query.prompt),
      decisions: input.decisions.map((decision) => ({
        candidateId: decision.candidateId,
        action: decision.action,
        reason: decision.reason,
        contentHash: decision.contentHash,
        recoverableId: decision.recoverableId,
      })),
    }))
    .digest('hex')
    .slice(0, 32)
}

export class ContextLensAssembler {
  private readonly sources: ContextSource[]
  private readonly defaultContextWindowTokens: number
  private readonly defaultReservedOutputTokens: number
  private readonly fixedOverheadTokens: number
  private readonly maxCandidates: number

  constructor(private readonly options: ContextLensAssemblerOptions = {}) {
    this.sources = [...(options.sources ?? [])].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    this.defaultContextWindowTokens = options.defaultContextWindowTokens ?? 4_096
    this.defaultReservedOutputTokens = options.defaultReservedOutputTokens ?? 1_024
    this.fixedOverheadTokens = options.fixedOverheadTokens ?? 64
    this.maxCandidates = options.maxCandidates ?? 128
  }

  async assemble(input: AssembleContextInput): Promise<ContextAssembly> {
    const model = this.resolveModel(input)
    const contextWindowTokens = this.contextWindow(input, model)
    const reservedOutputTokens = this.reservedOutput(input, contextWindowTokens)
    const baseTokens = this.baseQueryTokens(input.query)
    const availableContextTokens = contextWindowTokens - reservedOutputTokens - this.fixedOverheadTokens
    if (availableContextTokens <= 0 || baseTokens > availableContextTokens) {
      throw new ContextBudgetExceededError({
        availableTokens: Math.max(0, availableContextTokens),
        requiredTokens: baseTokens,
      })
    }

    const candidates = await this.collectCandidates({
      input,
      model,
      contextWindowTokens,
    })
    const decisions: ContextDecision[] = this.baseDecisions(input.query)
    const selected: string[] = []
    let usedTokens = baseTokens
    const selectedHeaderTokens = estimateTextTokens('[Mainspring selected context]')
    let selectedHeaderAdded = false
    const seenContent = new Set<string>()
    const seenCandidateIds = new Set<string>()

    const select = (candidate: ContextCandidate, action: ContextDecisionAction, reason: ContextDecisionReason, value: string, recoverableId?: string) => {
      const rendered = renderedCandidate(candidate, value)
      const finalTokens = estimateTextTokens(rendered)
      selected.push(rendered)
      if (!selectedHeaderAdded) {
        usedTokens += selectedHeaderTokens
        selectedHeaderAdded = true
      }
      usedTokens += finalTokens
      decisions.push({
        candidateId: candidate.candidateId,
        source: candidate.source,
        action,
        reason,
        originalTokens: estimateTextTokens(textForContent(candidate.content)),
        finalTokens,
        contentHash: contentHash(candidate.content),
        ...(recoverableId ? { recoverableId } : {}),
      })
    }

    for (const candidate of candidates) {
      const sourceText = textForContent(candidate.content)
      const hash = contentHash(candidate.content)
      const originalTokens = estimateTextTokens(sourceText)
      if (!isUsableCandidate(candidate)) {
        decisions.push({
          candidateId: candidate.candidateId || 'invalid',
          source: candidate.source,
          action: 'dropped',
          reason: 'invalid_candidate',
          originalTokens,
          finalTokens: 0,
          contentHash: hash,
        })
        continue
      }
      if (seenCandidateIds.has(candidate.candidateId)) {
        decisions.push({
          candidateId: candidate.candidateId,
          source: candidate.source,
          action: 'dropped',
          reason: 'duplicate',
          originalTokens,
          finalTokens: 0,
          contentHash: hash,
        })
        continue
      }
      seenCandidateIds.add(candidate.candidateId)
      if (seenContent.has(hash)) {
        decisions.push({
          candidateId: candidate.candidateId,
          source: candidate.source,
          action: 'dropped',
          reason: 'duplicate',
          originalTokens,
          finalTokens: 0,
          contentHash: hash,
        })
        continue
      }
      seenContent.add(hash)

      const review = reviewContextBlockSecurity(candidateBlock(candidate))
      const secret = candidate.sensitivity === 'secret' || review.reasons.includes('credential-like-text')
      const tainted = candidate.sensitivity === 'tainted' || review.tainted
      if (secret || tainted) {
        const reason = secret ? 'secret_boundary' : 'tainted_boundary'
        if (candidate.required || candidate.exactRetention) {
          throw new ContextBudgetExceededError({
            candidateId: candidate.candidateId,
            availableTokens: Math.max(0, availableContextTokens - usedTokens),
            requiredTokens: originalTokens,
          })
        }
        decisions.push({
          candidateId: candidate.candidateId,
          source: candidate.source,
          action: 'dropped',
          reason,
          originalTokens,
          finalTokens: 0,
          contentHash: hash,
        })
        continue
      }

      const exact = renderedCandidate(candidate, sourceText)
      const exactTokens = estimateTextTokens(exact)
      const remaining = availableContextTokens - usedTokens - (selectedHeaderAdded ? 0 : selectedHeaderTokens)
      if (candidate.required || candidate.exactRetention) {
        if (exactTokens > remaining) {
          throw new ContextBudgetExceededError({
            candidateId: candidate.candidateId,
            availableTokens: Math.max(0, remaining),
            requiredTokens: exactTokens,
          })
        }
        select(candidate, 'included_exact', 'required', sourceText)
        continue
      }
      if (exactTokens <= remaining) {
        select(candidate, 'included_exact', 'selected', sourceText)
        continue
      }

      const recoverable = candidate.compressionEligible === false || !this.options.recoverableStore
        ? undefined
        : this.options.recoverableStore.put({
            blockId: candidate.candidateId,
            sourceKind: candidateBlock(candidate).kind,
            content: candidate.content,
            metadata: {
              source: candidate.source,
              contentHash: hash,
            },
          })
      if (candidate.compressionEligible !== false && remaining > 0) {
        const summary = deterministicSummary(sourceText, Math.min(remaining, 256))
        const summaryTokens = estimateTextTokens(renderedCandidate(candidate, summary))
        if (summaryTokens <= remaining) {
          select(candidate, 'included_summary', 'summarized_for_budget', summary, recoverable?.recoverableId)
          continue
        }
      }
      if (recoverable) {
        const stub = stubFor(candidate, recoverable.recoverableId)
        const stubTokens = estimateTextTokens(renderedCandidate(candidate, stub))
        if (stubTokens <= remaining) {
          select(candidate, 'rehydrate_stub', 'archived_for_budget', stub, recoverable.recoverableId)
          continue
        }
      }
      decisions.push({
        candidateId: candidate.candidateId,
        source: candidate.source,
        action: 'dropped',
        reason: 'budget',
        originalTokens,
        finalTokens: 0,
        contentHash: hash,
        ...(recoverable ? { recoverableId: recoverable.recoverableId } : {}),
      })
    }

    const contextText = selected.length > 0
      ? ['[Mainspring selected context]', ...selected].join('\n\n')
      : ''
    const queryInput: QueryInput = {
      ...input.query,
      ...(contextText
        ? {
            messages: [
              { role: 'user', content: contextText },
              ...(input.query.messages ?? []),
            ],
          }
        : {}),
    }
    const assemblyId = decisionHash({ modelId: model.modelId, query: input.query, decisions })
    const telemetry: ContextDecisionTelemetry = {
      version: 1,
      assemblyId,
      modelId: model.modelId,
      providerId: model.providerId,
      contextWindowTokens,
      reservedOutputTokens,
      fixedOverheadTokens: this.fixedOverheadTokens,
      estimatedInputTokens: usedTokens,
      availableContextTokens,
      decisions,
    }
    return {
      assemblyId,
      model,
      queryInput,
      decisions,
      telemetry,
      estimatedInputTokens: usedTokens,
      availableContextTokens,
      reservedOutputTokens,
    }
  }

  private resolveModel(input: AssembleContextInput): CompiledContextModelSpec {
    if (input.modelSpec && 'profile' in input.modelSpec) return input.modelSpec
    if (input.modelSpec) return compileContextModelSpec(input.modelSpec)
    return compileContextModelSpec({
      providerId: input.query.providerId ?? 'custom',
      modelId: input.query.model ?? 'unknown',
    })
  }

  private contextWindow(input: AssembleContextInput, model: CompiledContextModelSpec): number {
    const value = input.contextWindowTokens ?? model.contextWindowTokens ?? this.defaultContextWindowTokens
    return Math.max(512, Math.floor(value))
  }

  private reservedOutput(input: AssembleContextInput, contextWindowTokens: number): number {
    const requested = input.reservedOutputTokens ?? this.defaultReservedOutputTokens
    return Math.min(Math.max(128, Math.floor(requested)), Math.floor(contextWindowTokens / 2))
  }

  private baseQueryTokens(query: QueryInput): number {
    return estimateTextTokens(query.prompt)
      + estimateTextTokens(query.systemPrompt ?? '')
      + estimateTextTokens(messagesText(query.messages))
      + toolTokens(query)
  }

  /**
   * The system prompt and current prompt already occupy their native provider
   * lanes. Record them as exact retained material without duplicating them in
   * the supplemental context message.
   */
  private baseDecisions(query: QueryInput): ContextDecision[] {
    const decisions: ContextDecision[] = []
    if (query.systemPrompt?.trim()) {
      decisions.push({
        candidateId: 'base:agent-instructions',
        source: 'agent',
        action: 'included_exact',
        reason: 'required',
        originalTokens: estimateTextTokens(query.systemPrompt),
        finalTokens: estimateTextTokens(query.systemPrompt),
        contentHash: contentHash(query.systemPrompt),
      })
    }
    if (query.prompt.trim()) {
      decisions.push({
        candidateId: 'base:current-input',
        source: 'user',
        action: 'included_exact',
        reason: 'required',
        originalTokens: estimateTextTokens(query.prompt),
        finalTokens: estimateTextTokens(query.prompt),
        contentHash: contentHash(query.prompt),
      })
    }
    return decisions
  }

  private async collectCandidates(input: {
    input: AssembleContextInput
    model: CompiledContextModelSpec
    contextWindowTokens: number
  }): Promise<ContextCandidate[]> {
    const candidates = [...(input.input.candidates ?? [])]
    for (const source of this.sources) {
      const collected = await source.collect({
        query: input.input.query,
        model: input.model,
        contextWindowTokens: input.contextWindowTokens,
      })
      candidates.push(...collected)
    }
    return candidates
      .slice(0, this.maxCandidates)
      .sort(compareCandidates)
  }
}
