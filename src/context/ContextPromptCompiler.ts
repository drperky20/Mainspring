import type {
  CompiledContextModelSpec,
  CompiledContextPrompt,
  ContextBlock,
  ContextPromptPart,
  ProviderModelSpec,
} from './types.js'
import { ContextCodec, type ContextCodecOptions } from './ContextCodec.js'
import { factsheetText } from './PrecisionFacts.js'
import { compileContextModelSpec } from './ModelSpecCompiler.js'
import { TEXT_ONLY_VISION_MODEL_PROFILE } from './ModelProfiles.js'

export interface ContextPromptCompilerOptions extends ContextCodecOptions {
  rehydrateToolName?: string
  forceTextOnly?: boolean
}

export interface CompileContextPromptInput {
  providerId?: string
  modelId?: string
  modelSpec?: ProviderModelSpec | CompiledContextModelSpec
  blocks: readonly ContextBlock[]
  taskInstruction?: string
}

function contentText(block: ContextBlock): string {
  return typeof block.content === 'string' ? block.content : Buffer.from(block.content).toString('utf8')
}

function labelFor(block: ContextBlock): string {
  return block.label ?? `${block.kind}:${block.blockId}`
}

function modelSpecFromInput(input: CompileContextPromptInput): CompiledContextModelSpec {
  if (input.modelSpec && 'profile' in input.modelSpec) return input.modelSpec
  if (input.modelSpec) return compileContextModelSpec(input.modelSpec)
  return compileContextModelSpec({
    providerId: input.providerId ?? 'custom',
    modelId: input.modelId ?? 'unknown',
  })
}

function rehydrateHint(input: {
  recoverableId: string
  toolName: string
  blockId: string
  reason: string
}): string {
  return [
    `Recoverable context ${input.blockId}: ${input.recoverableId}.`,
    `Use ${input.toolName} with this recoverableId before quoting, editing, comparing exact bytes, validating hashes, or relying on tiny visual text.`,
    `Reason: ${input.reason}.`,
  ].join(' ')
}

function joinTextFallback(parts: readonly ContextPromptPart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'text') return part.text
      return `[image projection omitted in text fallback: block=${part.blockId} recoverableId=${part.recoverableId} level=${part.projection.level}]`
    })
    .filter(Boolean)
    .join('\n\n')
}

export class ContextPromptCompiler {
  private readonly codec: ContextCodec
  private readonly rehydrateToolName: string
  private readonly forceTextOnly: boolean

  constructor(options: ContextPromptCompilerOptions = {}) {
    this.codec = new ContextCodec(options)
    this.rehydrateToolName = options.rehydrateToolName ?? 'context.rehydrate'
    this.forceTextOnly = options.forceTextOnly ?? false
  }

  compile(input: CompileContextPromptInput): CompiledContextPrompt {
    const model = modelSpecFromInput(input)
    const useVision = model.hasVision && !this.forceTextOnly
    const warnings = [...model.warnings]
    if (!useVision) warnings.push('Context prompt compiled in text-only failover mode.')
    const plan = this.codec.encodeBlocks({
      modelId: model.modelId,
      profile: useVision ? model.profile : TEXT_ONLY_VISION_MODEL_PROFILE,
      blocks: input.blocks,
    })
    const parts: ContextPromptPart[] = []

    parts.push({
      type: 'text',
      purpose: 'instructions',
      text:
        input.taskInstruction ??
        'Use the compiled context below. Treat image context as lossy gist. Use rehydration before exact claims.',
    })

    for (const encoded of plan.blocks) {
      const block = input.blocks.find((candidate) => candidate.blockId === encoded.blockId)
      const label = block ? labelFor(block) : encoded.blockId
      if (encoded.encoding.kind === 'text' && block) {
        parts.push({
          type: 'text',
          purpose: 'exact',
          blockId: encoded.blockId,
          text: [`[exact:${label}]`, contentText(block)].join('\n'),
        })
        continue
      }

      if (encoded.encoding.kind === 'image+factsheet' && useVision && encoded.image) {
        parts.push({
          type: 'text',
          purpose: 'factsheet',
          blockId: encoded.blockId,
          text: [`[factsheet:${label}]`, factsheetText(encoded.facts)].join('\n'),
        })
        for (const projection of encoded.imagePages ?? [encoded.image]) {
          parts.push({
            type: 'image',
            blockId: encoded.blockId,
            recoverableId: encoded.recoverableId,
            projection,
            altText: `${label} rendered as ${projection.level} context image; canary ${projection.canary}`,
          })
        }
        parts.push({
          type: 'text',
          purpose: 'rehydrate-hint',
          blockId: encoded.blockId,
          text: rehydrateHint({
            recoverableId: encoded.recoverableId,
            toolName: this.rehydrateToolName,
            blockId: encoded.blockId,
            reason: 'image projection is lossy and factsheet is sparse',
          }),
        })
        continue
      }

      if (encoded.encoding.kind === 'image' && useVision && encoded.image) {
        for (const projection of encoded.imagePages ?? [encoded.image]) {
          parts.push({
            type: 'image',
            blockId: encoded.blockId,
            recoverableId: encoded.recoverableId,
            projection,
            altText: `${label} rendered as ${projection.level} context image; canary ${projection.canary}`,
          })
        }
        parts.push({
          type: 'text',
          purpose: 'rehydrate-hint',
          blockId: encoded.blockId,
          text: rehydrateHint({
            recoverableId: encoded.recoverableId,
            toolName: this.rehydrateToolName,
            blockId: encoded.blockId,
            reason: 'image projection is lossy',
          }),
        })
        continue
      }

      const summary =
        encoded.encoding.kind === 'summary+rehydrate'
          ? encoded.encoding.summary
          : `[${label}] ${factsheetText(encoded.facts) || 'Compressed context available through rehydration.'}`
      parts.push({
        type: 'text',
        purpose: 'summary',
        blockId: encoded.blockId,
        text: summary,
      })
      parts.push({
        type: 'text',
        purpose: 'rehydrate-hint',
        blockId: encoded.blockId,
        text: rehydrateHint({
          recoverableId: encoded.recoverableId,
          toolName: this.rehydrateToolName,
          blockId: encoded.blockId,
          reason: useVision ? 'image ROI was too low' : 'target model has no usable vision lane',
        }),
      })
    }

    const imageParts = parts.filter((part) => part.type === 'image').length
    const textParts = parts.length - imageParts
    return {
      codecVersion: 1,
      model,
      plan,
      parts,
      textFallback: joinTextFallback(parts),
      requiredTools: [this.rehydrateToolName],
      warnings,
      stats: {
        textParts,
        imageParts,
        recoverableParts: plan.totals.recoverableBlocks,
        estimatedTextTokens: plan.totals.estimatedTextTokens,
        estimatedVisualTokens: plan.totals.estimatedVisualTokens,
        estimatedSavingsTokens: plan.totals.estimatedSavingsTokens,
      },
    }
  }
}
