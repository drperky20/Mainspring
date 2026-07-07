import type {
  CompiledContextModelSpec,
  ContextProviderId,
  ProviderImageTokenization,
  ProviderModelSpec,
  ResizeRule,
  VisionModelProfile,
} from './types.js'
import {
  DEFAULT_VISION_MODEL_PROFILES,
  TEXT_ONLY_VISION_MODEL_PROFILE,
  imageCostForResizeRule,
  selectVisionModelProfile,
} from './ModelProfiles.js'

const PROVIDER_PROMPT_STYLE: Record<string, NonNullable<ProviderModelSpec['promptStyle']>> = {
  openai: 'openai-responses',
  anthropic: 'anthropic-messages',
  google: 'gemini-interactions',
  xai: 'xai-chat',
  openrouter: 'openai-chat',
  custom: 'custom',
}

export type CompileContextModelSpecInput =
  | ProviderModelSpec
  | {
      providerId?: string
      modelId?: string
      spec?: ProviderModelSpec
    }

function normalizeProviderModelSpec(input: CompileContextModelSpecInput): ProviderModelSpec {
  const wrapped = input as {
    providerId?: string
    modelId?: string
    spec?: ProviderModelSpec
  }
  if (wrapped.spec) return wrapped.spec
  const candidate = input as Partial<ProviderModelSpec>
  return {
    ...candidate,
    providerId: candidate.providerId ?? wrapped.providerId ?? 'custom',
    modelId: candidate.modelId ?? wrapped.modelId ?? 'unknown',
  }
}

function normalizedProviderId(providerId: string | undefined): ContextProviderId | string {
  const normalized = providerId?.trim().toLowerCase() ?? 'custom'
  if (normalized === 'google-gemini' || normalized === 'gemini') return 'google'
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic'
  if (normalized === 'xai' || normalized === 'grok') return 'xai'
  if (normalized === 'openai' || normalized === 'codex') return 'openai'
  if (normalized === 'openrouter') return 'openrouter'
  return normalized || 'custom'
}

function upstreamModelIdForOpenRouter(modelId: string): string {
  const trimmed = modelId.trim()
  const withoutPrefix = trimmed.replace(/^openrouter[:/]/i, '')
  const providerIndex = withoutPrefix.indexOf('/')
  if (providerIndex < 0) return withoutPrefix
  return withoutPrefix.slice(providerIndex + 1)
}

function inferredProviderFromModelId(providerId: string, modelId: string): string {
  const normalized = modelId.toLowerCase()
  if (providerId === 'openrouter') {
    if (normalized.includes('anthropic/') || normalized.includes('claude')) return 'anthropic'
    if (normalized.includes('openai/') || normalized.includes('gpt') || normalized.includes('codex')) return 'openai'
    if (normalized.includes('google/') || normalized.includes('gemini')) return 'google'
    if (normalized.includes('x-ai/') || normalized.includes('xai/') || normalized.includes('grok')) return 'xai'
  }
  if (normalized.includes('claude')) return 'anthropic'
  if (normalized.includes('gemini')) return 'google'
  if (normalized.includes('grok')) return 'xai'
  if (normalized.includes('gpt') || normalized.includes('codex')) return 'openai'
  return providerId
}

function imageTokenizationToResizeRule(tokenization: ProviderImageTokenization): ResizeRule {
  if (tokenization.kind === 'declared') {
    return {
      kind: 'fixed-detail',
      lowTokens: tokenization.lowTokens ?? tokenization.fallbackTokens,
      highTokens: tokenization.highTokens ?? tokenization.fallbackTokens,
      originalTokens: tokenization.originalTokens,
      autoTokens: tokenization.autoTokens ?? tokenization.highTokens ?? tokenization.fallbackTokens,
      note: tokenization.note,
    }
  }
  return tokenization
}

function tokenizerForProvider(providerId: string, modelId: string): VisionModelProfile['tokenizer'] {
  if (providerId === 'anthropic') return 'anthropic-v5'
  if (providerId === 'openai' || modelId.toLowerCase().includes('gpt')) return 'o200k'
  if (providerId === 'google') return 'gemini'
  if (providerId === 'xai') return 'grok'
  return 'custom'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : []
}

function modalityArray(value: unknown): ProviderModelSpec['inputModalities'] {
  const allowed = new Set(['text', 'image', 'audio', 'video', 'pdf', 'file'])
  return stringArray(value)
    .map((entry) => (entry === 'file' ? 'pdf' : entry))
    .filter((entry): entry is NonNullable<ProviderModelSpec['inputModalities']>[number] =>
      allowed.has(entry),
    )
}

function outputModalityArray(value: unknown): ProviderModelSpec['outputModalities'] {
  const allowed = new Set(['text', 'image', 'audio', 'video'])
  return stringArray(value).filter(
    (entry): entry is NonNullable<ProviderModelSpec['outputModalities']>[number] =>
      allowed.has(entry),
  )
}

function mapTokenizer(value: unknown, providerId: string, modelId: string): VisionModelProfile['tokenizer'] {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized.includes('claude') || normalized.includes('anthropic')) return 'anthropic-v5'
  if (normalized.includes('o200k') || normalized.includes('openai')) return 'o200k'
  if (normalized.includes('gemini') || normalized.includes('google')) return 'gemini'
  if (normalized.includes('grok') || normalized.includes('xai')) return 'grok'
  return tokenizerForProvider(providerId, modelId)
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function providerModelSpecFromOpenRouterModel(model: unknown): ProviderModelSpec {
  if (!isRecord(model)) throw new Error('OpenRouter model metadata must be an object.')
  const modelId = typeof model.id === 'string' && model.id.trim() ? model.id.trim() : ''
  if (!modelId) throw new Error('OpenRouter model metadata requires an id.')
  const architecture = isRecord(model.architecture) ? model.architecture : {}
  const pricing = isRecord(model.pricing) ? model.pricing : {}
  const topProvider = isRecord(model.top_provider) ? model.top_provider : {}
  const inputModalities = modalityArray(architecture.input_modalities)
  const outputModalities = outputModalityArray(architecture.output_modalities)
  const contextWindowTokens =
    numberValue(topProvider.context_length) ?? numberValue(model.context_length)

  return {
    providerId: 'openrouter',
    modelId,
    ...(inputModalities && inputModalities.length > 0 ? { inputModalities } : {}),
    ...(outputModalities && outputModalities.length > 0 ? { outputModalities } : {}),
    tokenizer: mapTokenizer(architecture.tokenizer, 'openrouter', modelId),
    ...(contextWindowTokens ? { contextWindowTokens } : {}),
    supportsPromptCache: Boolean(
      typeof pricing.input_cache_read === 'string' || typeof pricing.input_cache_write === 'string',
    ),
    promptStyle: 'openai-chat',
    metadata: {
      source: 'openrouter-models-api',
      ...(typeof model.name === 'string' ? { name: model.name } : {}),
      ...(typeof model.canonical_slug === 'string' ? { canonicalSlug: model.canonical_slug } : {}),
      pricing,
      topProvider,
    },
  }
}

function profileFromSpec(input: {
  spec: ProviderModelSpec
  providerId: string
  inferredProviderId: string
  modelId: string
  rule: ResizeRule
  warnings: string[]
}): VisionModelProfile {
  const tokenizer = input.spec.tokenizer ?? tokenizerForProvider(input.inferredProviderId, input.modelId)
  return {
    id: `${input.providerId}:${input.modelId}`,
    idPattern: `^${input.modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    tokenizer,
    resizeRule: input.rule,
    maxImages: input.spec.maxImages ?? (input.rule.kind === 'none' ? 0 : 20),
    supportsPromptCache: input.spec.supportsPromptCache ?? false,
    cacheWriteRate: input.spec.cacheWriteRate ?? 1,
    cacheReadRate: input.spec.cacheReadRate ?? 1,
    metadata: {
      providerId: input.providerId,
      inferredProviderId: input.inferredProviderId,
      aliases: input.spec.aliases ?? [],
      warnings: input.warnings,
      ...(input.spec.metadata ?? {}),
    },
    calibration: {
      exactByCellSize: {
        name: 'provider-spec-exact-by-cell-size',
        points: [
          { x: 8, y: 0.2 },
          { x: 12, y: 0.55 },
          { x: 16, y: 0.78 },
          { x: 20, y: 0.88 },
        ],
      },
      gistByDensity: {
        name: 'provider-spec-gist-by-density',
        points: [
          { x: 0.25, y: 0.9 },
          { x: 0.5, y: 0.8 },
          { x: 0.75, y: 0.65 },
          { x: 1, y: 0.45 },
        ],
      },
      confabulationRisk: {
        name: 'provider-spec-confabulation-risk',
        points: [
          { x: 0.25, y: 0.08 },
          { x: 0.5, y: 0.16 },
          { x: 0.75, y: 0.28 },
          { x: 1, y: 0.45 },
        ],
      },
    },
    imageCost: (width, height, detail) => imageCostForResizeRule(input.rule, width, height, detail),
  }
}

function providerPreset(providerId: string, modelId: string): VisionModelProfile {
  const routedModelId = providerId === 'openrouter' ? upstreamModelIdForOpenRouter(modelId) : modelId
  return selectVisionModelProfile(routedModelId, DEFAULT_VISION_MODEL_PROFILES)
}

function hasVision(input: {
  spec?: ProviderModelSpec
  profile: VisionModelProfile
}): boolean {
  return input.profile.maxImages > 0 && input.profile.resizeRule.kind !== 'none'
}

export function compileContextModelSpec(
  input: CompileContextModelSpecInput,
): CompiledContextModelSpec {
  const spec = normalizeProviderModelSpec(input)
  const providerId = normalizedProviderId(spec.providerId)
  const modelId = spec.modelId.trim() || 'unknown'
  const inferredProviderId = inferredProviderFromModelId(providerId, modelId)
  const warnings: string[] = []
  let profile: VisionModelProfile
  let source: CompiledContextModelSpec['source'] = 'provider-spec'

  if (spec.imageTokenization) {
    profile = profileFromSpec({
      spec,
      providerId,
      inferredProviderId,
      modelId,
      rule: imageTokenizationToResizeRule(spec.imageTokenization),
      warnings,
    })
  } else {
    profile = providerPreset(providerId, modelId)
    source = profile === TEXT_ONLY_VISION_MODEL_PROFILE ? 'text-failover' : 'frontier-preset'
  }

  if (profile === TEXT_ONLY_VISION_MODEL_PROFILE && spec.inputModalities?.includes('image')) {
    warnings.push(
      `Model ${modelId} declares image input but no image tokenization spec was supplied; using text failover.`,
    )
  }
  if (providerId === 'xai' && profile.id === 'xai-grok-frontier-declared') {
    warnings.push(
      'xAI documents image prompts and image-token billing but not a public exact image-token formula; using conservative declared defaults.',
    )
  }
  if (providerId === 'openrouter') {
    warnings.push(`OpenRouter routing profile inferred from upstream model id ${upstreamModelIdForOpenRouter(modelId)}.`)
  }

  const vision = hasVision({ spec, profile })
  if (!vision) {
    profile = TEXT_ONLY_VISION_MODEL_PROFILE
    source = 'text-failover'
  }

  return {
    providerId,
    modelId,
    profile,
    hasVision: vision,
    promptStyle: spec.promptStyle ?? PROVIDER_PROMPT_STYLE[providerId] ?? 'custom',
    source,
    warnings,
    ...(spec.contextWindowTokens ? { contextWindowTokens: spec.contextWindowTokens } : {}),
  }
}

export function compileFrontierContextModelSpec(input: {
  providerId: string
  modelId: string
}): CompiledContextModelSpec {
  return compileContextModelSpec(input)
}
