import type {
  ContextBlock,
  ContextBlockKind,
  ContextCodecPlan,
  ContextEncodedRunEventPayload,
  ContextEncoding,
  ContextImageDetail,
  ContextImageLevel,
  ContextImageProjection,
  EncodedContextBlock,
  PrecisionFact,
  RecoverableContextStore,
  VisionModelProfile,
} from './types.js'
import {
  InMemoryRecoverableContextStore,
  contextByteLength,
} from './RecoverableContextStore.js'
import { factsheetText, extractPrecisionFacts } from './PrecisionFacts.js'
import {
  DEFAULT_VISION_MODEL_PROFILES,
  selectVisionModelProfile,
} from './ModelProfiles.js'

export interface ContextCodecOptions {
  store?: RecoverableContextStore
  profiles?: readonly VisionModelProfile[]
  imageWidth?: number
  imageHeight?: number
  imageDetail?: ContextImageDetail
  minSavingsTokens?: number
  minSavingsRatio?: number
  maxFacts?: number
  maxImagePagesPerBlock?: number
  imagePageTextChars?: number
}

export interface EncodeContextBlocksInput {
  modelId?: string
  profile?: VisionModelProfile
  blocks: readonly ContextBlock[]
}

const EXACT_KINDS = new Set<ContextBlockKind>([
  'user_intent',
  'system_prompt',
  'tool_args',
  'file_before_edit',
  'policy',
  'approval',
  'patch',
])

const DENSE_KINDS = new Set<ContextBlockKind>(['tool_result', 'log', 'search', 'docs'])

function textFromContent(content: string | Uint8Array): string {
  if (content instanceof Uint8Array && isProbablyBinary(content)) {
    return `[binary context ${content.byteLength} bytes]`
  }
  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8')
}

function isProbablyBinary(content: string | Uint8Array): boolean {
  if (typeof content === 'string') return false
  if (content.byteLength === 0) return false
  const sample = content.slice(0, Math.min(content.byteLength, 512))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1
  }
  return suspicious / sample.byteLength > 0.08
}

function mediaTypeForBlock(block: ContextBlock): string | undefined {
  const mediaType = block.metadata?.mediaType
  return typeof mediaType === 'string' && mediaType.trim() ? mediaType.trim() : undefined
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4))
}

function summaryFor(block: ContextBlock, facts: readonly PrecisionFact[], maxLength = 360): string {
  const text = textFromContent(block.content).replace(/\s+/g, ' ').trim()
  const firstLine = text.slice(0, maxLength)
  const factHint = facts.length > 0 ? ` Facts: ${facts.slice(0, 8).map((fact) => fact.value).join(', ')}` : ''
  const label = block.label ? `${block.label}: ` : ''
  return `${label}${firstLine}${text.length > maxLength ? '...' : ''}${factHint}`.trim()
}

function textEncodingReason(block: ContextBlock): 'exact' | 'recent' | 'policy' {
  if (block.kind === 'policy' || block.kind === 'approval' || block.risk === 'policy') return 'policy'
  if (block.recent) return 'recent'
  return 'exact'
}

function shouldStayText(block: ContextBlock): boolean {
  return (
    block.recent === true ||
    block.exactSensitive === true ||
    EXACT_KINDS.has(block.kind) ||
    block.risk === 'exact' ||
    block.risk === 'secret' ||
    block.risk === 'policy'
  )
}

function shouldForceSummary(block: ContextBlock): boolean {
  return block.risk === 'tainted' || isProbablyBinary(block.content)
}

function imageLevelFor(block: ContextBlock): ContextImageLevel {
  if (block.risk === 'background' || block.kind === 'background') return 'ultra-dense'
  if (block.risk === 'semi-exact') return 'readable'
  if (DENSE_KINDS.has(block.kind) || block.risk === 'gist') return 'dense'
  return 'readable'
}

function charsPerTokenForLevel(level: ContextImageLevel): number {
  if (level === 'readable') return 12
  if (level === 'dense') return 22
  return 36
}

function dimensionsFor(input: {
  level: ContextImageLevel
  width: number
  height: number
}): { width: number; height: number } {
  if (input.level === 'readable') {
    return { width: Math.min(input.width, 1200), height: Math.min(input.height, 900) }
  }
  if (input.level === 'dense') {
    return { width: input.width, height: input.height }
  }
  return { width: input.width, height: Math.min(1800, Math.max(input.height, 1400)) }
}

function lineLimitForLevel(level: ContextImageLevel): number {
  if (level === 'readable') return 42
  if (level === 'dense') return 64
  return 96
}

function fontSizeForLevel(level: ContextImageLevel): number {
  if (level === 'readable') return 18
  if (level === 'dense') return 13
  return 9
}

function linesPerPageFor(input: { level: ContextImageLevel; height: number }): number {
  return Math.max(1, Math.floor((input.height - 72) / (fontSizeForLevel(input.level) * 1.35)))
}

function wrappedLineCount(text: string, columns: number): number {
  return text.split(/\r?\n/).reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / Math.max(1, columns)))
  }, 0)
}

function canaryFor(block: ContextBlock, recoverableId: string): string {
  return `MSCTX:${block.blockId}:${recoverableId.slice(0, 18)}`
}

function projectionBytesFor(input: {
  encoding: ContextEncoding
  facts: readonly PrecisionFact[]
}): number {
  if (input.encoding.kind === 'text') return 0
  if (input.encoding.kind === 'image+factsheet') {
    return Buffer.byteLength(factsheetText(input.facts), 'utf8')
  }
  if (input.encoding.kind === 'summary+rehydrate') {
    return Buffer.byteLength(input.encoding.summary, 'utf8')
  }
  return 0
}

export class ContextCodec {
  private readonly store: RecoverableContextStore
  private readonly profiles: readonly VisionModelProfile[]
  private readonly imageWidth: number
  private readonly imageHeight: number
  private readonly imageDetail: ContextImageDetail
  private readonly minSavingsTokens: number
  private readonly minSavingsRatio: number
  private readonly maxFacts: number
  private readonly maxImagePagesPerBlock: number
  private readonly imagePageTextChars: number

  constructor(options: ContextCodecOptions = {}) {
    this.store = options.store ?? new InMemoryRecoverableContextStore()
    this.profiles = options.profiles ?? DEFAULT_VISION_MODEL_PROFILES
    this.imageWidth = options.imageWidth ?? 1568
    this.imageHeight = options.imageHeight ?? 728
    this.imageDetail = options.imageDetail ?? 'high'
    this.minSavingsTokens = options.minSavingsTokens ?? 64
    this.minSavingsRatio = options.minSavingsRatio ?? 0.05
    this.maxFacts = options.maxFacts ?? 32
    this.maxImagePagesPerBlock = options.maxImagePagesPerBlock ?? 4
    this.imagePageTextChars = options.imagePageTextChars ?? 18_000
  }

  encodeBlocks(input: EncodeContextBlocksInput): ContextCodecPlan {
    const profile = input.profile ?? selectVisionModelProfile(input.modelId, this.profiles)
    const modelId = input.modelId ?? profile.id
    let remainingImages = profile.maxImages
    const blocks = input.blocks.map((block) => {
      const encoded = this.encodeBlock({
        block,
        modelId,
        profile,
        forceSummary: remainingImages <= 0,
        imageSlotsRemaining: remainingImages,
      })
      remainingImages -= encoded.imagePages?.length ?? (encoded.image ? 1 : 0)
      return encoded
    })
    const totals = blocks.reduce(
      (summary, block) => ({
        canonicalBytes: summary.canonicalBytes + block.canonicalBytes,
        estimatedTextTokens: summary.estimatedTextTokens + block.estimatedTextTokens,
        estimatedVisualTokens: summary.estimatedVisualTokens + (block.estimatedVisualTokens ?? 0),
        estimatedSavingsTokens: summary.estimatedSavingsTokens + block.estimatedSavingsTokens,
        recoverableBlocks: summary.recoverableBlocks + (block.recoverableId ? 1 : 0),
      }),
      {
        canonicalBytes: 0,
        estimatedTextTokens: 0,
        estimatedVisualTokens: 0,
        estimatedSavingsTokens: 0,
        recoverableBlocks: 0,
      },
    )

    return {
      codecVersion: 1,
      modelId,
      profile,
      blocks,
      totals,
    }
  }

  encodeBlock(input: {
    block: ContextBlock
    modelId?: string
    profile?: VisionModelProfile
    forceSummary?: boolean
    imageSlotsRemaining?: number
  }): EncodedContextBlock {
    const profile = input.profile ?? selectVisionModelProfile(input.modelId, this.profiles)
    const modelId = input.modelId ?? profile.id
    const text = textFromContent(input.block.content)
    const canonicalBytes = contextByteLength(input.block.content)
    const estimatedText = estimateTextTokens(text)
    const record = this.store.put({
      blockId: input.block.blockId,
      sourceKind: input.block.kind,
      content: input.block.content,
      mediaType: mediaTypeForBlock(input.block),
      metadata: input.block.metadata,
    })
    const facts = extractPrecisionFacts(text, this.maxFacts)

    if (shouldStayText(input.block)) {
      return this.buildEncodedBlock({
        block: input.block,
        encoding: { kind: 'text', reason: textEncodingReason(input.block) },
        facts,
        profile,
        modelId,
        recoverableId: record.recoverableId,
        canonicalBytes,
        sourceSha256: record.sha256,
        estimatedTextTokens: estimatedText,
        estimatedVisualTokens: undefined,
        image: undefined,
      })
    }

    if (profile.maxImages <= 0 || input.forceSummary || shouldForceSummary(input.block)) {
      return this.buildEncodedBlock({
        block: input.block,
        encoding: {
          kind: 'summary+rehydrate',
          summary: summaryFor(input.block, facts),
          recoverableId: record.recoverableId,
        },
        facts,
        profile,
        modelId,
        recoverableId: record.recoverableId,
        canonicalBytes,
        sourceSha256: record.sha256,
        estimatedTextTokens: estimatedText,
        estimatedVisualTokens: undefined,
        image: undefined,
      })
    }

    const level = imageLevelFor(input.block)
    const dimensions = dimensionsFor({
      level,
      width: this.imageWidth,
      height: this.imageHeight,
    })
    const maxColumns = lineLimitForLevel(level)
    const linesPerPage = linesPerPageFor({ level, height: dimensions.height })
    const totalWrappedLines = wrappedLineCount(text, maxColumns)
    const pageCount = Math.max(
      1,
      Math.min(
        this.maxImagePagesPerBlock,
        input.imageSlotsRemaining ?? 1,
        Math.ceil(totalWrappedLines / linesPerPage),
      ),
    )
    const visualTokens = profile.imageCost(dimensions.width, dimensions.height, this.imageDetail)
    const factsTokens = estimateTextTokens(factsheetText(facts))
    const projectedTokens = visualTokens * pageCount + factsTokens
    const savingsTokens = Math.max(0, estimatedText - projectedTokens)
    const enoughSavings =
      savingsTokens >= this.minSavingsTokens ||
      savingsTokens / Math.max(estimatedText, 1) >= this.minSavingsRatio

    if (!Number.isFinite(visualTokens) || !enoughSavings) {
      return this.buildEncodedBlock({
        block: input.block,
        encoding: {
          kind: 'summary+rehydrate',
          summary: summaryFor(input.block, facts),
          recoverableId: record.recoverableId,
        },
        facts,
        profile,
        modelId,
        recoverableId: record.recoverableId,
        canonicalBytes,
        sourceSha256: record.sha256,
        estimatedTextTokens: estimatedText,
        estimatedVisualTokens: undefined,
        image: undefined,
      })
    }

    const imagePages: ContextImageProjection[] = Array.from({ length: pageCount }, (_, index) => ({
      level,
      width: dimensions.width,
      height: dimensions.height,
      detail: this.imageDetail,
      visualTokens,
      renderer: 'external-rasterizer',
      canary: `${canaryFor(input.block, record.recoverableId)}:p${index + 1}/${pageCount}`,
      charsPerVisualToken: Math.round(charsPerTokenForLevel(level) * 10) / 10,
      pageNumber: index + 1,
      pageCount,
      startLine: index * linesPerPage + 1,
      endLine: Math.min(totalWrappedLines, (index + 1) * linesPerPage),
    }))
    const image = imagePages[0]
    const encoding: ContextEncoding =
      facts.length > 0 && level !== 'ultra-dense'
        ? { kind: 'image+factsheet', recoverableId: record.recoverableId, facts }
        : { kind: 'image', level, recoverableId: record.recoverableId }

    return this.buildEncodedBlock({
      block: input.block,
      encoding,
      facts,
      profile,
      modelId,
      recoverableId: record.recoverableId,
      canonicalBytes,
      sourceSha256: record.sha256,
      estimatedTextTokens: estimatedText,
      estimatedVisualTokens: visualTokens * pageCount,
      image,
      imagePages,
    })
  }

  rehydrate(recoverableId: string, span?: Parameters<RecoverableContextStore['rehydrate']>[1]) {
    return this.store.rehydrate(recoverableId, span)
  }

  private buildEncodedBlock(input: {
    block: ContextBlock
    encoding: ContextEncoding
    facts: PrecisionFact[]
    profile: VisionModelProfile
    modelId: string
    recoverableId: string
    canonicalBytes: number
    sourceSha256: string
    estimatedTextTokens: number
    estimatedVisualTokens?: number
    image?: ContextImageProjection
    imagePages?: ContextImageProjection[]
  }): EncodedContextBlock {
    const projectionBytes = projectionBytesFor({
      encoding: input.encoding,
      facts: input.facts,
    })
    const projectedTokens =
      input.encoding.kind === 'text'
        ? input.estimatedTextTokens
        : (input.estimatedVisualTokens ?? 0) + estimateTextTokens(factsheetText(input.facts))
    const estimatedSavingsTokens = Math.max(0, input.estimatedTextTokens - projectedTokens)
    const eventPayload: ContextEncodedRunEventPayload = {
      codecVersion: 1,
      blockId: input.block.blockId,
      sourceKind: input.block.kind,
      ...(input.block.label ? { label: input.block.label } : {}),
      modelId: input.modelId,
      profileId: input.profile.id,
      encoding: input.encoding,
      recoverableId: input.recoverableId,
      sourceSha256: input.sourceSha256,
      canonicalBytes: input.canonicalBytes,
      estimatedTextTokens: input.estimatedTextTokens,
      ...(input.estimatedVisualTokens !== undefined
        ? { estimatedVisualTokens: input.estimatedVisualTokens }
        : {}),
      estimatedSavingsTokens,
      ...(input.encoding.kind === 'image+factsheet' ? { facts: input.facts } : {}),
      ...(input.image ? { image: input.image } : {}),
      ...(input.imagePages && input.imagePages.length > 1 ? { imagePages: input.imagePages } : {}),
    }

    return {
      blockId: input.block.blockId,
      encoding: input.encoding,
      recoverableId: input.recoverableId,
      facts: input.facts,
      profile: input.profile,
      canonicalBytes: input.canonicalBytes,
      sourceSha256: input.sourceSha256,
      estimatedTextTokens: input.estimatedTextTokens,
      ...(input.estimatedVisualTokens !== undefined
        ? { estimatedVisualTokens: input.estimatedVisualTokens }
        : {}),
      estimatedSavingsTokens,
      projectionBytes,
      ...(input.image ? { image: input.image } : {}),
      ...(input.imagePages ? { imagePages: input.imagePages } : {}),
      eventPayload,
    }
  }
}
