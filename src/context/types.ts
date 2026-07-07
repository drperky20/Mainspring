export type ContextEncoding =
  | { kind: 'text'; reason: 'exact' | 'recent' | 'policy' }
  | { kind: 'image'; level: 'readable' | 'dense' | 'ultra-dense'; recoverableId: string }
  | { kind: 'image+factsheet'; recoverableId: string; facts: PrecisionFact[] }
  | { kind: 'summary+rehydrate'; summary: string; recoverableId: string }

export type ContextImageLevel = 'readable' | 'dense' | 'ultra-dense'
export type ContextImageDetail = 'low' | 'medium' | 'high' | 'ultra_high' | 'original' | 'auto'
export type ContextTokenizer = 'anthropic-v5' | 'o200k' | 'gemini' | 'grok' | 'custom'
export type ContextProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'openrouter'
  | 'custom'

export type PrecisionFactKind =
  | 'path'
  | 'hash'
  | 'id'
  | 'version'
  | 'count'
  | 'command'
  | 'symbol'

export interface PrecisionFact {
  kind: PrecisionFactKind
  value: string
  label?: string
  confidence: number
}

export interface CurvePoint {
  x: number
  y: number
}

export interface Curve {
  name: string
  points: CurvePoint[]
}

export type ResizeRule =
  | {
      kind: 'anthropic-patches'
      patchSize: number
      maxLongEdge: number
      maxVisualTokens: number
    }
  | {
      kind: 'openai-patches'
      patchSize: number
      patchBudget: number
      maxLongEdge?: number
      multiplier: number
    }
  | {
      kind: 'openai-tiles'
      tileSize: number
      maxSquare: number
      shortSide: number
      baseTokens: number
      tileTokens: number
      lowDetailTokens: number
    }
  | {
      kind: 'gemini-tiles'
      smallImageMaxEdge: number
      smallImageTokens: number
      tileSize: number
      tileTokens: number
    }
  | {
      kind: 'gemini-media-resolution'
      unspecifiedTokens: number
      lowTokens: number
      mediumTokens: number
      highTokens: number
      ultraHighTokens?: number
    }
  | {
      kind: 'fixed-detail'
      lowTokens: number
      highTokens: number
      originalTokens?: number
      autoTokens?: number
      note?: string
    }
  | { kind: 'none' }

export type ProviderImageTokenization =
  | ResizeRule
  | {
      kind: 'declared'
      lowTokens?: number
      mediumTokens?: number
      highTokens?: number
      originalTokens?: number
      autoTokens?: number
      fallbackTokens: number
      note?: string
    }

export interface ProviderModelSpec {
  providerId: ContextProviderId | string
  modelId: string
  aliases?: string[]
  inputModalities?: Array<'text' | 'image' | 'audio' | 'video' | 'pdf'>
  outputModalities?: Array<'text' | 'image' | 'audio' | 'video'>
  tokenizer?: ContextTokenizer
  contextWindowTokens?: number
  maxImages?: number
  supportsPromptCache?: boolean
  cacheWriteRate?: number
  cacheReadRate?: number
  imageTokenization?: ProviderImageTokenization
  promptStyle?:
    | 'openai-responses'
    | 'openai-chat'
    | 'anthropic-messages'
    | 'gemini-interactions'
    | 'xai-chat'
    | 'text'
    | 'custom'
  metadata?: Record<string, unknown>
}

export interface CompiledContextModelSpec {
  providerId: string
  modelId: string
  profile: VisionModelProfile
  hasVision: boolean
  promptStyle: NonNullable<ProviderModelSpec['promptStyle']>
  source: 'provider-spec' | 'frontier-preset' | 'inferred' | 'text-failover'
  warnings: string[]
  contextWindowTokens?: number
}

export interface VisionModelProfile {
  id: string
  idPattern: string
  tokenizer: ContextTokenizer
  imageCost(width: number, height: number, detail?: ContextImageDetail): number
  resizeRule: ResizeRule
  maxImages: number
  supportsPromptCache: boolean
  cacheWriteRate: number
  cacheReadRate: number
  metadata?: Record<string, unknown>
  calibration: {
    exactByCellSize: Curve
    gistByDensity: Curve
    confabulationRisk: Curve
  }
}

export type ContextBlockKind =
  | 'user_intent'
  | 'system_prompt'
  | 'tool_args'
  | 'tool_result'
  | 'run_history'
  | 'memory'
  | 'file'
  | 'file_before_edit'
  | 'policy'
  | 'approval'
  | 'patch'
  | 'log'
  | 'search'
  | 'docs'
  | 'background'

export type ContextBlockRisk =
  | 'exact'
  | 'semi-exact'
  | 'gist'
  | 'background'
  | 'policy'
  | 'secret'
  | 'tainted'

export interface ContextBlock {
  blockId: string
  kind: ContextBlockKind
  content: string | Uint8Array
  label?: string
  recent?: boolean
  exactSensitive?: boolean
  risk?: ContextBlockRisk
  createdAt?: string
  sequence?: number
  metadata?: Record<string, unknown>
}

export interface RecoverableContextRecord {
  recoverableId: string
  blockId: string
  sourceKind: ContextBlockKind
  sha256: string
  bytes: Uint8Array
  byteLength: number
  mediaType: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface ContextRehydrateSpan {
  startByte?: number
  endByte?: number
  startLine?: number
  endLine?: number
  maxBytes?: number
}

export interface RehydratedContext {
  recoverableId: string
  sha256: string
  byteLength: number
  returnedBytes: number
  truncated: boolean
  mediaType: string
  text?: string
  base64?: string
}

export interface RecoverableContextStore {
  put(input: {
    blockId: string
    sourceKind: ContextBlockKind
    content: string | Uint8Array
    mediaType?: string
    metadata?: Record<string, unknown>
  }): RecoverableContextRecord
  get(recoverableId: string): RecoverableContextRecord | null
  rehydrate(recoverableId: string, span?: ContextRehydrateSpan): RehydratedContext
}

export interface ContextImageProjection {
  level: ContextImageLevel
  width: number
  height: number
  detail: ContextImageDetail
  visualTokens: number
  renderer: 'external-rasterizer'
  canary: string
  charsPerVisualToken: number
  pageNumber?: number
  pageCount?: number
  startLine?: number
  endLine?: number
}

export interface EncodedContextBlock {
  blockId: string
  encoding: ContextEncoding
  recoverableId: string
  facts: PrecisionFact[]
  profile: VisionModelProfile
  canonicalBytes: number
  sourceSha256: string
  estimatedTextTokens: number
  estimatedVisualTokens?: number
  estimatedSavingsTokens: number
  projectionBytes: number
  image?: ContextImageProjection
  imagePages?: ContextImageProjection[]
  eventPayload: ContextEncodedRunEventPayload
}

export interface ContextCodecPlan {
  codecVersion: 1
  modelId: string
  profile: VisionModelProfile
  blocks: EncodedContextBlock[]
  totals: {
    canonicalBytes: number
    estimatedTextTokens: number
    estimatedVisualTokens: number
    estimatedSavingsTokens: number
    recoverableBlocks: number
  }
}

export interface ContextEncodedRunEventPayload {
  codecVersion: 1
  blockId: string
  sourceKind: ContextBlockKind
  label?: string
  modelId: string
  profileId: string
  encoding: ContextEncoding
  recoverableId: string
  sourceSha256: string
  canonicalBytes: number
  estimatedTextTokens: number
  estimatedVisualTokens?: number
  estimatedSavingsTokens: number
  facts?: PrecisionFact[]
  image?: ContextImageProjection
  imagePages?: ContextImageProjection[]
}

export type ContextPromptPart =
  | {
      type: 'text'
      text: string
      purpose: 'instructions' | 'exact' | 'factsheet' | 'summary' | 'rehydrate-hint'
      blockId?: string
    }
  | {
      type: 'image'
      blockId: string
      recoverableId: string
      projection: ContextImageProjection
      altText: string
    }

export interface CompiledContextPrompt {
  codecVersion: 1
  model: CompiledContextModelSpec
  plan: ContextCodecPlan
  parts: ContextPromptPart[]
  textFallback: string
  requiredTools: string[]
  warnings: string[]
  stats: {
    textParts: number
    imageParts: number
    recoverableParts: number
    estimatedTextTokens: number
    estimatedVisualTokens: number
    estimatedSavingsTokens: number
  }
}
