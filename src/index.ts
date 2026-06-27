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
