export { ContextCodec } from './ContextCodec.js'
export type { ContextCodecOptions, EncodeContextBlocksInput } from './ContextCodec.js'
export { ContextPromptCompiler } from './ContextPromptCompiler.js'
export type {
  CompileContextPromptInput,
  ContextPromptCompilerOptions,
} from './ContextPromptCompiler.js'
export {
  DEFAULT_VISION_MODEL_PROFILES,
  TEXT_ONLY_VISION_MODEL_PROFILE,
  imageCostForResizeRule,
  selectVisionModelProfile,
} from './ModelProfiles.js'
export {
  compileContextModelSpec,
  compileFrontierContextModelSpec,
  providerModelSpecFromOpenRouterModel,
} from './ModelSpecCompiler.js'
export type { CompileContextModelSpecInput } from './ModelSpecCompiler.js'
export {
  FilesystemRecoverableContextStore,
  InMemoryRecoverableContextStore,
  contextByteLength,
  hashContextBytes,
} from './RecoverableContextStore.js'
export { ContextLensAssembler, ContextBudgetExceededError } from './ContextAssembly.js'
export type {
  AssembleContextInput,
  ContextAssembly,
  ContextCandidate,
  ContextCandidateSource,
  ContextDecision,
  ContextDecisionAction,
  ContextDecisionReason,
  ContextDecisionTelemetry,
  ContextLensAssemblerOptions,
  ContextSensitivity,
  ContextSource,
  ContextSourceInput,
} from './ContextAssembly.js'
export { extractPrecisionFacts, factsheetText, rankPrecisionFacts } from './PrecisionFacts.js'
export { createContextRehydrateTool } from './ContextRehydrateTool.js'
export type {
  ContextRehydrateAuditEvent,
  ContextRehydrateToolOptions,
} from './ContextRehydrateTool.js'
export {
  serializeContextPromptForProvider,
} from './ContextProviderPayload.js'
export type {
  ContextProviderPayload,
  ContextProviderPayloadKind,
  SerializedContextImage,
  SerializeContextPromptOptions,
} from './ContextProviderPayload.js'
export {
  planContextRehydration,
} from './RehydratePolicy.js'
export type {
  RehydrateDecision,
  RehydrateIntent,
  RehydratePolicyInput,
  RehydrateUrgency,
} from './RehydratePolicy.js'
export { InMemoryContextUsageLedger } from './ContextUsageLedger.js'
export type {
  ContextUsageLedgerEntry,
  ContextUsageLedgerSnapshot,
  ContextUsageObservation,
} from './ContextUsageLedger.js'
export { ContextRendererRegistry, createDeterministicSvgContextRenderer } from './ContextRenderer.js'
export type {
  ContextRasterRenderer,
  ContextRenderArtifact,
  ContextRenderRequest,
} from './ContextRenderer.js'
export {
  renderContextPromptImages,
  serializeRenderedContextPromptForProvider,
} from './RenderedContextPrompt.js'
export type {
  RenderedContextPromptImage,
  RenderedContextProviderBundle,
} from './RenderedContextPrompt.js'
export { analyzeContextBudget, rankContextBudgetDowngrades } from './ContextBudgetPlanner.js'
export type {
  ContextBudgetFinding,
  ContextBudgetLimits,
  ContextBudgetReport,
} from './ContextBudgetPlanner.js'
export { planContextPromptCache } from './ContextCachePolicy.js'
export type {
  ContextCacheDecision,
  ContextCacheDecisionKind,
  ContextCachePlan,
} from './ContextCachePolicy.js'
export { fetchProviderModelSpec } from './ProviderModelMetadata.js'
export type { FetchProviderModelSpecOptions } from './ProviderModelMetadata.js'
export { reconcileOpenRouterRoutedModel } from './OpenRouterReconciliation.js'
export type { OpenRouterRoutedModelReconciliation } from './OpenRouterReconciliation.js'
export { buildContextSpanIndex } from './ContextSpanIndex.js'
export type {
  BuildContextSpanIndexOptions,
  ContextLineSpanAnchor,
  ContextSpanIndex,
} from './ContextSpanIndex.js'
export {
  createSyntheticContextEvalCorpus,
  runContextCalibrationTournament,
  runContextOcrCheck,
} from './ContextCalibration.js'
export type {
  ContextCalibrationCandidateScore,
  ContextCalibrationResult,
  ContextFontCandidate,
  ContextLayoutCandidate,
  ContextOcrCheckResult,
  ContextOcrProbe,
  SyntheticContextEvalCase,
} from './ContextCalibration.js'
export { inspectCompiledContext } from './ContextInspector.js'
export type {
  ContextInspectionReport,
  ContextInspectionRow,
} from './ContextInspector.js'
export {
  reviewContextBlockSecurity,
  sanitizeFactsForTrustBoundary,
} from './ContextSecurity.js'
export type { ContextSecurityReview } from './ContextSecurity.js'
export { recommendContextPlannerAdjustments } from './LearnedContextPlanner.js'
export type { LearnedContextPlannerRecommendation } from './LearnedContextPlanner.js'
export type {
  ContextBlock,
  ContextBlockKind,
  ContextBlockRisk,
  ContextCodecPlan,
  ContextEncodedRunEventPayload,
  ContextEncoding,
  ContextImageDetail,
  ContextImageLevel,
  ContextImageProjection,
  ContextPromptPart,
  ContextProviderId,
  ContextRehydrateSpan,
  ContextTokenizer,
  CompiledContextModelSpec,
  CompiledContextPrompt,
  Curve,
  EncodedContextBlock,
  PrecisionFact,
  PrecisionFactKind,
  ProviderImageTokenization,
  ProviderModelSpec,
  RecoverableContextRecord,
  RecoverableContextStore,
  RehydratedContext,
  ResizeRule,
  VisionModelProfile,
} from './types.js'
