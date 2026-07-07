import type { ContextImageDetail, Curve, ResizeRule, VisionModelProfile } from './types.js'

function curve(name: string, points: Array<[number, number]>): Curve {
  return {
    name,
    points: points.map(([x, y]) => ({ x, y })),
  }
}

const DEFAULT_CALIBRATION: VisionModelProfile['calibration'] = {
  exactByCellSize: curve('uncalibrated-exact-by-cell-size', [
    [8, 0.25],
    [12, 0.55],
    [16, 0.78],
    [20, 0.88],
  ]),
  gistByDensity: curve('uncalibrated-gist-by-density', [
    [0.25, 0.92],
    [0.5, 0.82],
    [0.75, 0.68],
    [1, 0.5],
  ]),
  confabulationRisk: curve('uncalibrated-confabulation-risk', [
    [0.25, 0.05],
    [0.5, 0.12],
    [0.75, 0.24],
    [1, 0.42],
  ]),
}

function fitLongEdge(width: number, height: number, maxLongEdge: number): [number, number] {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return [width, height]
  const scale = maxLongEdge / longEdge
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))]
}

function anthropicPatchCost(width: number, height: number, rule: Extract<ResizeRule, { kind: 'anthropic-patches' }>): number {
  let [resizedWidth, resizedHeight] = fitLongEdge(width, height, rule.maxLongEdge)
  let tokens = Math.ceil(resizedWidth / rule.patchSize) * Math.ceil(resizedHeight / rule.patchSize)
  if (tokens <= rule.maxVisualTokens) return tokens

  const scale = Math.sqrt(rule.maxVisualTokens / tokens)
  resizedWidth = Math.max(1, Math.floor(resizedWidth * scale))
  resizedHeight = Math.max(1, Math.floor(resizedHeight * scale))
  tokens = Math.ceil(resizedWidth / rule.patchSize) * Math.ceil(resizedHeight / rule.patchSize)
  while (tokens > rule.maxVisualTokens && resizedWidth > 1 && resizedHeight > 1) {
    resizedWidth -= 1
    resizedHeight -= 1
    tokens = Math.ceil(resizedWidth / rule.patchSize) * Math.ceil(resizedHeight / rule.patchSize)
  }
  return tokens
}

function openAiPatchCost(width: number, height: number, rule: Extract<ResizeRule, { kind: 'openai-patches' }>): number {
  const [longEdgeWidth, longEdgeHeight] = rule.maxLongEdge
    ? fitLongEdge(width, height, rule.maxLongEdge)
    : [width, height]
  const originalPatchCount =
    Math.ceil(longEdgeWidth / rule.patchSize) * Math.ceil(longEdgeHeight / rule.patchSize)
  if (originalPatchCount <= rule.patchBudget) {
    return Math.ceil(originalPatchCount * rule.multiplier)
  }

  const shrinkFactor = Math.sqrt(
    (rule.patchSize * rule.patchSize * rule.patchBudget) / (longEdgeWidth * longEdgeHeight),
  )
  const widthAtScale = longEdgeWidth * shrinkFactor
  const heightAtScale = longEdgeHeight * shrinkFactor
  const adjustedShrinkFactor =
    shrinkFactor *
    Math.min(
      Math.floor(widthAtScale / rule.patchSize) / (widthAtScale / rule.patchSize),
      Math.floor(heightAtScale / rule.patchSize) / (heightAtScale / rule.patchSize),
    )
  const resizedWidth = Math.max(1, Math.floor(longEdgeWidth * adjustedShrinkFactor))
  const resizedHeight = Math.max(1, Math.floor(longEdgeHeight * adjustedShrinkFactor))
  const resizedPatchCount =
    Math.ceil(resizedWidth / rule.patchSize) * Math.ceil(resizedHeight / rule.patchSize)
  return Math.ceil(Math.min(resizedPatchCount, rule.patchBudget) * rule.multiplier)
}

function openAiTileCost(
  width: number,
  height: number,
  detail: ContextImageDetail | undefined,
  rule: Extract<ResizeRule, { kind: 'openai-tiles' }>,
): number {
  if (detail === 'low') return rule.lowDetailTokens
  let [resizedWidth, resizedHeight] = fitLongEdge(width, height, rule.maxSquare)
  const shortSide = Math.min(resizedWidth, resizedHeight)
  if (shortSide > 0 && shortSide !== rule.shortSide) {
    const scale = rule.shortSide / shortSide
    resizedWidth = Math.max(1, Math.ceil(resizedWidth * scale))
    resizedHeight = Math.max(1, Math.ceil(resizedHeight * scale))
  }
  const tiles = Math.ceil(resizedWidth / rule.tileSize) * Math.ceil(resizedHeight / rule.tileSize)
  return rule.baseTokens + tiles * rule.tileTokens
}

function geminiTileCost(width: number, height: number, rule: Extract<ResizeRule, { kind: 'gemini-tiles' }>): number {
  if (width <= rule.smallImageMaxEdge && height <= rule.smallImageMaxEdge) {
    return rule.smallImageTokens
  }
  const cropUnit = Math.max(1, Math.floor(Math.min(width, height) / 1.5))
  const tiles = Math.ceil(width / cropUnit) * Math.ceil(height / cropUnit)
  return Math.max(1, tiles) * rule.tileTokens
}

function geminiMediaResolutionCost(
  detail: ContextImageDetail | undefined,
  rule: Extract<ResizeRule, { kind: 'gemini-media-resolution' }>,
): number {
  if (detail === 'low') return rule.lowTokens
  if (detail === 'medium') return rule.mediumTokens
  if (detail === 'high') return rule.highTokens
  if (detail === 'ultra_high') return rule.ultraHighTokens ?? rule.highTokens
  return rule.unspecifiedTokens
}

function fixedDetailCost(
  detail: ContextImageDetail | undefined,
  rule: Extract<ResizeRule, { kind: 'fixed-detail' }>,
): number {
  if (detail === 'low') return rule.lowTokens
  if (detail === 'original') return rule.originalTokens ?? rule.highTokens
  if (detail === 'auto') return rule.autoTokens ?? rule.highTokens
  return rule.highTokens
}

export function imageCostForResizeRule(
  rule: ResizeRule,
  width: number,
  height: number,
  detail?: ContextImageDetail,
): number {
  if (rule.kind === 'anthropic-patches') {
    return anthropicPatchCost(width, height, rule)
  }
  if (rule.kind === 'openai-patches') {
    if (detail === 'low') return openAiPatchCost(512, 512, rule)
    return openAiPatchCost(width, height, rule)
  }
  if (rule.kind === 'openai-tiles') {
    return openAiTileCost(width, height, detail, rule)
  }
  if (rule.kind === 'gemini-tiles') {
    return geminiTileCost(width, height, rule)
  }
  if (rule.kind === 'gemini-media-resolution') {
    return geminiMediaResolutionCost(detail, rule)
  }
  if (rule.kind === 'fixed-detail') {
    return fixedDetailCost(detail, rule)
  }
  return Number.POSITIVE_INFINITY
}

function profile(input: {
  id: string
  idPattern: string
  tokenizer: VisionModelProfile['tokenizer']
  resizeRule: ResizeRule
  maxImages: number
  supportsPromptCache: boolean
  cacheWriteRate?: number
  cacheReadRate?: number
  metadata?: Record<string, unknown>
}): VisionModelProfile {
  return {
    id: input.id,
    idPattern: input.idPattern,
    tokenizer: input.tokenizer,
    resizeRule: input.resizeRule,
    maxImages: input.maxImages,
    supportsPromptCache: input.supportsPromptCache,
    cacheWriteRate: input.cacheWriteRate ?? 1,
    cacheReadRate: input.cacheReadRate ?? 1,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    calibration: DEFAULT_CALIBRATION,
    imageCost: (width, height, detail) =>
      imageCostForResizeRule(input.resizeRule, width, height, detail),
  }
}

export const DEFAULT_VISION_MODEL_PROFILES: VisionModelProfile[] = [
  profile({
    id: 'anthropic-high-resolution',
    idPattern: 'claude-(fable-5|mythos-5|opus-4\\.8|opus-4\\.7|sonnet-5)',
    tokenizer: 'anthropic-v5',
    resizeRule: {
      kind: 'anthropic-patches',
      patchSize: 28,
      maxLongEdge: 2576,
      maxVisualTokens: 4784,
    },
    maxImages: 100,
    supportsPromptCache: true,
  }),
  profile({
    id: 'anthropic-standard',
    idPattern: 'claude|anthropic',
    tokenizer: 'anthropic-v5',
    resizeRule: {
      kind: 'anthropic-patches',
      patchSize: 28,
      maxLongEdge: 1568,
      maxVisualTokens: 1568,
    },
    maxImages: 100,
    supportsPromptCache: true,
  }),
  profile({
    id: 'openai-gpt-5-tile',
    idPattern: '^(gpt-5|gpt-5-chat-latest)$',
    tokenizer: 'o200k',
    resizeRule: {
      kind: 'openai-tiles',
      tileSize: 512,
      maxSquare: 2048,
      shortSide: 768,
      baseTokens: 70,
      tileTokens: 140,
      lowDetailTokens: 70,
    },
    maxImages: 1500,
    supportsPromptCache: true,
  }),
  profile({
    id: 'openai-codex-patch',
    idPattern: 'gpt-5\\.[1234]-codex|gpt-5(?:\\.\\d+)?-codex|gpt-5-codex-mini|codex',
    tokenizer: 'o200k',
    resizeRule: {
      kind: 'openai-patches',
      patchSize: 32,
      patchBudget: 1536,
      maxLongEdge: 2048,
      multiplier: 1.62,
    },
    maxImages: 1500,
    supportsPromptCache: true,
  }),
  profile({
    id: 'openai-gpt-5.5-patch',
    idPattern: 'gpt-5\\.5',
    tokenizer: 'o200k',
    resizeRule: {
      kind: 'openai-patches',
      patchSize: 32,
      patchBudget: 10_000,
      maxLongEdge: 6000,
      multiplier: 1,
    },
    maxImages: 1500,
    supportsPromptCache: true,
  }),
  profile({
    id: 'openai-patch-mini',
    idPattern: 'gpt-5\\.4-mini|gpt-5-mini|gpt-4\\.1-mini|o4-mini',
    tokenizer: 'o200k',
    resizeRule: {
      kind: 'openai-patches',
      patchSize: 32,
      patchBudget: 1536,
      maxLongEdge: 2048,
      multiplier: 1.62,
    },
    maxImages: 1500,
    supportsPromptCache: true,
  }),
  profile({
    id: 'openai-4o-4.1-tile',
    idPattern: 'gpt-4o|gpt-4\\.1|gpt-4\\.5|o1|o3|computer-use-preview',
    tokenizer: 'o200k',
    resizeRule: {
      kind: 'openai-tiles',
      tileSize: 512,
      maxSquare: 2048,
      shortSide: 768,
      baseTokens: 85,
      tileTokens: 170,
      lowDetailTokens: 85,
    },
    maxImages: 1500,
    supportsPromptCache: true,
  }),
  profile({
    id: 'google-gemini-3-media-resolution',
    idPattern: 'gemini-3|gemini-3\\.5',
    tokenizer: 'gemini',
    resizeRule: {
      kind: 'gemini-media-resolution',
      unspecifiedTokens: 1120,
      lowTokens: 280,
      mediumTokens: 560,
      highTokens: 1120,
      ultraHighTokens: 2240,
    },
    maxImages: 3600,
    supportsPromptCache: true,
  }),
  profile({
    id: 'google-gemini-tiles',
    idPattern: 'gemini',
    tokenizer: 'gemini',
    resizeRule: {
      kind: 'gemini-tiles',
      smallImageMaxEdge: 384,
      smallImageTokens: 258,
      tileSize: 768,
      tileTokens: 258,
    },
    maxImages: 3600,
    supportsPromptCache: true,
  }),
  profile({
    id: 'xai-grok-frontier-declared',
    idPattern: 'grok-4\\.3|grok-latest|grok-build',
    tokenizer: 'grok',
    resizeRule: {
      kind: 'fixed-detail',
      lowTokens: 280,
      highTokens: 1120,
      autoTokens: 1120,
      note: 'xAI documents image prompts and image-token billing, but not a public image-token formula; these are conservative declared defaults.',
    },
    maxImages: 16,
    supportsPromptCache: true,
    cacheReadRate: 0.16,
    metadata: {
      confidence: 'declared-default',
      source: 'xai-docs-without-public-token-formula',
    },
  }),
  profile({
    id: 'meta-llama-vision-declared',
    idPattern: 'llama.*vision|llama-.*scout|llama-.*maverick',
    tokenizer: 'custom',
    resizeRule: {
      kind: 'fixed-detail',
      lowTokens: 280,
      highTokens: 1120,
      autoTokens: 1120,
      note: 'Conservative default for Llama-family vision models when provider-specific image token math is unavailable.',
    },
    maxImages: 16,
    supportsPromptCache: false,
    metadata: { confidence: 'declared-default', family: 'llama-vision' },
  }),
  profile({
    id: 'qwen-vision-declared',
    idPattern: 'qwen.*(?:vl|vision)',
    tokenizer: 'custom',
    resizeRule: {
      kind: 'fixed-detail',
      lowTokens: 280,
      highTokens: 1120,
      autoTokens: 1120,
      note: 'Conservative default for Qwen vision models when provider-specific image token math is unavailable.',
    },
    maxImages: 16,
    supportsPromptCache: false,
    metadata: { confidence: 'declared-default', family: 'qwen-vision' },
  }),
  profile({
    id: 'mistral-vision-declared',
    idPattern: 'mistral.*(?:vision|pixtral)|pixtral',
    tokenizer: 'custom',
    resizeRule: {
      kind: 'fixed-detail',
      lowTokens: 280,
      highTokens: 1120,
      autoTokens: 1120,
      note: 'Conservative default for Mistral/Pixtral vision models when provider-specific image token math is unavailable.',
    },
    maxImages: 16,
    supportsPromptCache: false,
    metadata: { confidence: 'declared-default', family: 'mistral-vision' },
  }),
]

export const TEXT_ONLY_VISION_MODEL_PROFILE: VisionModelProfile = profile({
  id: 'text-only',
  idPattern: '.*',
  tokenizer: 'custom',
  resizeRule: { kind: 'none' },
  maxImages: 0,
  supportsPromptCache: false,
})

export function selectVisionModelProfile(
  modelId: string | undefined,
  profiles: readonly VisionModelProfile[] = DEFAULT_VISION_MODEL_PROFILES,
): VisionModelProfile {
  const normalized = modelId?.trim() ?? ''
  for (const candidate of profiles) {
    if (new RegExp(candidate.idPattern, 'i').test(normalized)) return candidate
  }
  return TEXT_ONLY_VISION_MODEL_PROFILE
}
