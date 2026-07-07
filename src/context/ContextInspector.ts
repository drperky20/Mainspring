import type { CompiledContextPrompt } from './types.js'

export interface ContextInspectionRow {
  blockId: string
  encodingKind: string
  recoverableId: string
  facts: number
  imagePages: number
  estimatedTextTokens: number
  estimatedVisualTokens: number
  estimatedSavingsTokens: number
}

export interface ContextInspectionReport {
  modelId: string
  profileId: string
  rows: ContextInspectionRow[]
  totals: CompiledContextPrompt['stats']
}

export function inspectCompiledContext(compiled: CompiledContextPrompt): ContextInspectionReport {
  return {
    modelId: compiled.model.modelId,
    profileId: compiled.model.profile.id,
    rows: compiled.plan.blocks.map((block) => ({
      blockId: block.blockId,
      encodingKind: block.encoding.kind,
      recoverableId: block.recoverableId,
      facts: block.facts.length,
      imagePages: block.imagePages?.length ?? (block.image ? 1 : 0),
      estimatedTextTokens: block.estimatedTextTokens,
      estimatedVisualTokens: block.estimatedVisualTokens ?? 0,
      estimatedSavingsTokens: block.estimatedSavingsTokens,
    })),
    totals: compiled.stats,
  }
}
