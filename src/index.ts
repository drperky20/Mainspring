export const MAINSPRING_RUNTIME_IDENTITY = {
  productName: 'Mainspring',
  owner: 'Mainspring OSS',
  implementation: 'typescript-agentic-runtime',
  transport: 'mailbox',
} as const

export type MainspringRuntimeIdentity = typeof MAINSPRING_RUNTIME_IDENTITY

export * from './contracts/index.js'
export * from './sdk/index.js'
export * from './gateway/index.js'
export * as MainspringCore from './core/index.js'
export * as MainspringAdapters from './adapters/index.js'
export * as MainspringCapabilities from './capabilities/index.js'
export * as MainspringRunLogHost from './hosts/runlog/index.js'
export * as MainspringCompat from './compat/index.js'
export * as MainspringProtocol from './protocol/index.js'
export * as MainspringControl from './control/index.js'

export { resolveSessionMailboxPaths } from '#protocol'
export type { SessionMailboxPaths } from '#protocol'

export { MainspringMailbox } from './mailbox/SqliteMailbox.js'
export type { InboundMessage, MailboxAckStatus } from './mailbox/SqliteMailbox.js'
export { AttachmentStore } from './mailbox/AttachmentStore.js'
export type {
  AttachmentDirection,
  AttachmentStoreOptions,
  AttachmentWriteInput,
  StoredAttachmentMetadata,
} from './mailbox/AttachmentStore.js'
export {
  applyMailboxSchema,
  applyEventsMailboxSchema,
  applyInboundMailboxSchema,
  applyOutboundMailboxSchema,
} from './mailbox/MailboxSchema.js'
export {
  createMailboxMessageId,
  mailboxNowIso,
  openMailboxDb,
} from './mailbox/SqliteMailboxStore.js'

export { EchoProvider } from './providers/EchoProvider.js'
export { MockProvider } from './providers/MockProvider.js'
export { ProviderRegistry, createDefaultProviderRegistry } from './providers/ProviderRegistry.js'
export type {
  DefaultProviderRegistryOptions,
  ProviderRegistration,
  ProviderResolveInput,
} from './providers/ProviderRegistry.js'
export { OpenRouterProvider } from './providers/OpenRouterProvider.js'
export { OpenAIProvider as OpenAICompatibleProvider } from './providers/OpenAIProvider.js'
export { OpenRouterChatCompletionsClient } from './providers/HttpProviderClient.js'
export type { FetchRuntimeProviderClientOptions } from './providers/HttpProviderClient.js'
export { ProviderShell, assertSafeProviderOptions } from './providers/ProviderShell.js'
export type { ProviderShellConfig } from './providers/ProviderShell.js'
export type {
  AgentProvider,
  AgentQuery,
  ProviderEvent,
  QueryInput,
  RuntimeCredentialRef,
  RuntimeCredentialRefKind,
  RuntimeProviderClient,
} from './providers/types.js'

export { MainspringPollLoop, formatInboundPrompt } from './runner/PollLoop.js'
export type { PollLoopResult } from './runner/PollLoop.js'
export { RuntimeKernel, formatRuntimeInboundPrompt } from './runner/RuntimeKernel.js'
export type {
  RuntimeKernelOptions,
  RuntimeKernelResult,
  RunUntilIdleOptions,
} from './runner/RuntimeKernel.js'
export { SessionRuntimeSupervisor } from './runner/SessionRuntimeSupervisor.js'
export type {
  SessionRuntimeSupervisorKernelInput,
  SessionRuntimeSupervisorOptions,
  SessionRuntimeSupervisorResult,
} from './runner/SessionRuntimeSupervisor.js'
export { createRuntimeProviderFromEnv } from './runner/RuntimeProviderConfig.js'
export type { RuntimeProviderId, RuntimeProviderSelection } from './runner/RuntimeProviderConfig.js'
export { ContinuationStore } from './runner/ContinuationStore.js'
export { CancellationController } from './runner/CancellationController.js'
export { createMainspringRuntimeTools } from './runner/RuntimeTools.js'
export {
  IterationBudget,
  TurnRetryState,
  buildTurnContext,
  classifyToolResult,
  deterministicToolCallId,
  finalizeTurn,
  projectProviderEvent,
} from './agent/TurnLifecycle.js'
export { AgentRunLoop } from './agent/AgentRunLoop.js'
export type { AgentRunLoopOptions, AgentRunLoopSummary } from './agent/AgentRunLoop.js'
export {
  DEFAULT_CONTEXT_MAX_TOKENS,
  DEFAULT_PROTECTED_HEAD_MESSAGES,
  DEFAULT_PROTECTED_TAIL_MESSAGES,
  estimateTextTokens,
  summarizeContextBudget,
} from './agent/ContextBudget.js'
export type { ContextBudgetInput, ContextBudgetSummary } from './agent/ContextBudget.js'
export { createContextCompressionPlan } from './agent/ContextCompressionPlan.js'
export type { ContextCompressionPlan } from './agent/ContextCompressionPlan.js'
export { buildRunContextPack } from './agent/ContextPack.js'
export { buildWorkspaceContext } from './agent/WorkspaceContext.js'
export type {
  WorkspaceContextOptions,
  WorkspaceContextSummary,
  WorkspaceEntrySummary,
} from './agent/WorkspaceContext.js'
export { buildSubdirectoryHints } from './agent/SubdirectoryHints.js'
export type { SubdirectoryHint, SubdirectoryHintsOptions } from './agent/SubdirectoryHints.js'
export { buildCodingContext } from './agent/CodingContext.js'
export type { CodingContextOptions, CodingContextSummary } from './agent/CodingContext.js'
export { createMemoryContext } from './memory/MemoryContext.js'
export type { MemoryContext, MemoryContextOptions } from './memory/MemoryContext.js'
export { MemoryProvider } from './memory/MemoryProvider.js'
export type { MemoryProviderOptions } from './memory/MemoryProvider.js'
export { createJsonlMemoryStore, JsonlMemoryStore, listStoredMemoryEntries } from './memory/MemoryStore.js'
export type {
  ListMemoryInput,
  MemoryRecord,
  MemoryScope,
  MemoryStore,
  WriteMemoryInput,
} from './memory/MemoryStore.js'
export {
  describeModelPricingCatalog,
  defaultModelPricingCatalog,
  loadModelPricingCatalogFile,
  lookupModelPricing,
  modelPricingCatalogFromEnv,
  modelPricingCatalogPathFromEnv,
  modelPricingCatalogSourceLabel,
  parseModelPricingCatalog,
} from './usage/ModelPricing.js'
export type {
  DescribeModelPricingCatalogOptions,
  LoadModelPricingCatalogOptions,
  LookupModelPricingOptions,
  ModelPricing,
  ModelPricingCatalogStatus,
} from './usage/ModelPricing.js'
export { estimateUsageCost } from './usage/UsageAccounting.js'
export type { EstimateUsageCostOptions, UsageCostEstimate } from './usage/UsageAccounting.js'
export { summarizeUsageLedger } from './usage/UsageLedger.js'
export type { UsageLedgerEntryLike, UsageLedgerSummary } from './usage/UsageLedger.js'
export type {
  ProjectedTurnEvent,
  ToolResultClassification,
  TurnContext,
  TurnContextInput,
  TurnExitReason,
  TurnFailureInput,
} from './agent/TurnLifecycle.js'

export { approvalRequestedEvent, buildApprovalRequest } from './policy/ApprovalPolicy.js'
export type { BuildApprovalRequestInput, RuntimeApprovalRequest } from './policy/ApprovalPolicy.js'
export {
  assertApprovalReceipt,
  createApprovalReceipt,
  hashApprovalInput,
} from './policy/ApprovalReceipt.js'
export type { ApprovalReceipt } from './policy/ApprovalReceipt.js'
export {
  createDecisionRecord,
  decisionStateForPolicyDecision,
  decisionSurfaceForManifest,
} from './policy/DecisionRecord.js'
export type {
  DecisionRecord,
  DecisionRecordState,
  DecisionRecordSurface,
} from './policy/DecisionRecord.js'
export { RuntimePolicyGuard } from './policy/PolicyGuard.js'
export type {
  PolicyDecision,
  PolicyDecisionInput,
  PolicyOperation,
  RuntimePolicyDefaults,
} from './policy/PolicyGuard.js'

export { ToolRegistry } from './tools/ToolRegistry.js'
export type {
  RuntimeTool,
  RuntimeToolContext,
  ToolExecutionInput,
  ToolExecutionResult,
  ToolRegistryOptions,
} from './tools/ToolRegistry.js'
export { createFileReadTool, createFileTools, createFileWriteTool } from './tools/FileTools.js'
export { createShellTool } from './tools/ShellTool.js'
export {
  backendPreferenceFromComputerId,
  backendSummaryLine,
  inspectExecutionBackends,
  parseExecutionBackendPreference,
  resolveExecutionBackend,
} from './tools/ExecutionBackend.js'
export type {
  ExecutionBackendInventory,
  ExecutionBackendStatus,
  ProcessExecutionBackend,
  ProcessExecutionBackendPreference,
  ResolvedExecutionBackend,
} from './tools/ExecutionBackend.js'
export {
  createBrowserOpenTool,
  createBrowserScreenshotTool,
  createBrowserTool,
  createBrowserTools,
} from './tools/BrowserTool.js'
export type { BrowserRuntimeAdapter, BrowserToolOptions } from './tools/BrowserTool.js'
export {
  createMainspringDiagnosticsTool,
  createMainspringEventTailTool,
  createMainspringTools,
} from './tools/MainspringTools.js'
export {
  createMemoryReadTool,
  createMemoryTool,
  createMemoryTools,
  createMemoryWriteTool,
} from './tools/MemoryTool.js'
export {
  createSkillInstallTool,
  createSkillTools,
  createSkillUpdateTool,
} from './tools/SkillTools.js'
export { createWebFetchTool, createWebSearchTool, createWebTools } from './tools/WebTools.js'
export { SkillRegistry } from './skills/SkillRegistry.js'
export type { SkillInstallResult, SkillRegistryOptions } from './skills/SkillRegistry.js'
