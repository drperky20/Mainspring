import { z } from 'zod'

function createRuntimeUuid(): string {
  const runtimeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  const uuid = runtimeCrypto?.randomUUID?.()
  if (uuid) return uuid

  const randomHex = (length: number): string => {
    let value = ''
    while (value.length < length) {
      value += Math.floor(Math.random() * 0x100000000)
        .toString(16)
        .padStart(8, '0')
    }
    return value.slice(0, length)
  }
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`
}

function joinRuntimePath(...segments: string[]): string {
  const joined = segments.filter(Boolean).join('/').replace(/\\/g, '/')
  const normalized = joined.replace(/\/+/g, '/')
  return joined.startsWith('/') && !normalized.startsWith('/') ? `/${normalized}` : normalized
}

function runtimeBasename(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function runtimeExtname(value: string): string {
  const basename = runtimeBasename(value)
  const index = basename.lastIndexOf('.')
  return index > 0 ? basename.slice(index) : ''
}

export const currentIsoTimestamp = (): string => new Date().toISOString()

export const createMainspringRuntimeId = (prefix: string): string =>
  `${prefix}_${createRuntimeUuid()}`

export const createMailboxMessageId = createMainspringRuntimeId

export const MAINSPRING_APP_PROVIDER_ID = 'openrouter'
export const MAINSPRING_APP_MODEL_ID = 'openrouter/free'
export const MAINSPRING_ALLOWED_PROVIDER_IDS = [MAINSPRING_APP_PROVIDER_ID] as const
export const MAINSPRING_ALLOWED_MODEL_IDS = [MAINSPRING_APP_MODEL_ID] as const
export const MAINSPRING_APP_CREDENTIAL_REF = 'env:OPENROUTER_API_KEY'
export const MAINSPRING_APP_OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY'
export const MAINSPRING_AGENT_ID_HEADER = 'x-mainspring-agent-id'
export const MAINSPRING_SESSION_ID_HEADER = 'x-mainspring-session-id'
export const MAINSPRING_SESSION_KEY_HEADER = 'x-mainspring-session-key'

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function parseJsonRecordOrNull(
  value: string | null | undefined,
): Record<string, unknown> | null {
  return asRecord(parseJsonValue<unknown>(value, null))
}

export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  return parseJsonRecordOrNull(value) ?? {}
}

export function jsonRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  return record ?? (typeof value === 'string' ? parseJsonRecordOrNull(value) : null)
}

function parseOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

const SENSITIVE_KEY_PATTERN =
  /(api[-_]?key(?:[-_]?ref)?|apikey(?:ref)?|authorization|gateway[-_]?token(?:[-_]?ref)?|gatewaytoken(?:ref)?|access[-_]?token(?:[-_]?ref)?|accesstoken(?:ref)?|refresh[-_]?token(?:[-_]?ref)?|refreshtoken(?:ref)?|secret(?:[-_]?ref)?|token(?:[-_]?ref)?|key[-_]?ref|password|credential|private[-_]?key(?:[-_]?ref)?|privatekey(?:ref)?|cookie)$/i

const SECRET_TEXT_PATTERN =
  /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+|\b([A-Za-z0-9_]*(?:gateway[-_]?token|gatewaytoken|api[-_]?key|apikey|authorization|secret|token|password|credential|private[-_]?key|privatekey)[A-Za-z0-9_]*)(\s*[:=]\s*)([^\s,;}]+)/gi

const WHITESPACE_SECRET_TEXT_PATTERN =
  /\b((?:api[-_]?key|apikey|token|secret|password|credential)\s+)[^\s'",}]+/gi

const PROVIDER_KEY_PATTERN = /\bsk(?:-ant)?-[A-Za-z0-9_-]{6,}\b/g
const DEFAULT_REDACTION_MARKER = '[redacted]'

export type RuntimeRedactionOptions = {
  marker?: string
}

const redactionMarker = (options?: RuntimeRedactionOptions): string =>
  options?.marker ?? DEFAULT_REDACTION_MARKER

export function redactRuntimeSensitiveText(
  value: string,
  options?: RuntimeRedactionOptions,
): string {
  const marker = redactionMarker(options)
  return value
    .replace(SECRET_TEXT_PATTERN, (_match, bearerPrefix, key, sep) => {
      if (bearerPrefix) return `${bearerPrefix}${marker}`
      return `${key}${sep}${marker}`
    })
    .replace(WHITESPACE_SECRET_TEXT_PATTERN, `$1${marker}`)
    .replace(PROVIDER_KEY_PATTERN, marker)
}

export function sanitizeRuntimeResponse(
  value: unknown,
  options?: RuntimeRedactionOptions,
): unknown {
  if (typeof value === 'string') {
    return redactRuntimeSensitiveText(value, options)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRuntimeResponse(entry, options))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? redactionMarker(options)
        : sanitizeRuntimeResponse(entry, options),
    ]),
  )
}

export const redactRuntimeSecrets = (value: unknown): unknown =>
  sanitizeRuntimeResponse(value, { marker: '[REDACTED]' })

export function sanitizeRuntimeUrl(value: string, options?: RuntimeRedactionOptions): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, redactionMarker(options))
      }
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return redactRuntimeSensitiveText(value, options)
  }
}

export const normalizeRuntimeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '')

export function normalizeRuntimeWebSocketUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:'
    return url.toString()
  } catch {
    return value
  }
}

export const runtimeErrorMessage = (error: unknown, fallback: string): string =>
  redactRuntimeSensitiveText(error instanceof Error ? error.message : fallback)

export const BUILTIN_MAINSPRING_RUNTIME_PROFILE_IDS = [
  'core',
  'core-browser',
  'core-browser-memory',
] as const

export const MainspringRuntimeProfileSchema = z.enum(BUILTIN_MAINSPRING_RUNTIME_PROFILE_IDS)

export const MainspringRuntimeProfileIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/)

export type BuiltinMainspringRuntimeProfile = z.infer<typeof MainspringRuntimeProfileSchema>
export type MainspringRuntimeProfile = string

export const DEFAULT_MAINSPRING_RUNTIME_PROFILE =
  'core-browser-memory' satisfies MainspringRuntimeProfile

export const DEFAULT_MAINSPRING_COMPUTER_DISPLAY_NAME = 'My Mainspring Computer'

export const DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF = 'mainspring-computer:local'
export const DEFAULT_MAINSPRING_RUNTIME_GATEWAY_PORT = 8642

export const resolveMainspringComputerImageRef = (
  env: Record<string, string | undefined>,
  fallback = DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF,
): string => env.MAINSPRING_COMPUTER_IMAGE?.trim() || fallback

export const normalizeMainspringComputerResourceId = (computerId: string): string =>
  sanitizeMailboxPathSegment(computerId, 'computerId')

export const mainspringComputerContainerName = (computerId: string): string =>
  `mainspring-computer-${normalizeMainspringComputerResourceId(computerId)}`

export function mainspringComputerIdFromRuntimeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const value = metadata?.mainspringComputerId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export type MainspringComputerVolumeKind = 'state' | 'workspaces' | 'sessions' | 'artifacts'

export function mainspringComputerVolumeRef(kind: MainspringComputerVolumeKind, computerId: string): string {
  return `mainspring-computer-${kind}-${normalizeMainspringComputerResourceId(computerId)}`
}

export function mainspringComputerBrowserProfileRef(computerId: string): string {
  return `mainspring-computer-browser-${normalizeMainspringComputerResourceId(computerId)}`
}

export type MainspringComputerStorageRefs = {
  stateVolumeRef: string
  workspaceVolumeRef: string
  sessionsVolumeRef: string
  artifactVolumeRef: string
  browserProfileRef: string
}

export function mainspringComputerStorageRefs(computerId: string): MainspringComputerStorageRefs {
  return {
    stateVolumeRef: mainspringComputerVolumeRef('state', computerId),
    workspaceVolumeRef: mainspringComputerVolumeRef('workspaces', computerId),
    sessionsVolumeRef: mainspringComputerVolumeRef('sessions', computerId),
    artifactVolumeRef: mainspringComputerVolumeRef('artifacts', computerId),
    browserProfileRef: mainspringComputerBrowserProfileRef(computerId),
  }
}

export const MAINSPRING_COMPUTER_RUNTIME_CELL_BACKING_ADAPTER = 'runtime-cell'

export function mainspringComputerRuntimeCellMetadata(
  runtimeCellId: string | null | undefined,
): Record<string, unknown> {
  return {
    runtimeCellId: runtimeCellId ?? null,
    runtimeBackingAdapter: MAINSPRING_COMPUTER_RUNTIME_CELL_BACKING_ADAPTER,
  }
}

export type RuntimeCellVolumeKind = 'state' | 'workspace'

export const DEFAULT_RUNTIME_CELL_IMAGE_REF = DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF
export const SHARED_RUNTIME_CELL_CONTAINER_NAME = 'mainspring-runtime'

export function runtimeCellContainerName(runtimeCellId: string): string {
  return `mainspring-runtime-${runtimeCellId}`
}

export type RuntimeCellRuntimeNameOptions = {
  shared?: boolean
  sharedContainerName?: string
}

export function runtimeCellRuntimeContainerName(
  runtimeCellId: string,
  options: RuntimeCellRuntimeNameOptions = {},
): string {
  return options.shared
    ? options.sharedContainerName?.trim() || SHARED_RUNTIME_CELL_CONTAINER_NAME
    : runtimeCellContainerName(runtimeCellId)
}

export type RuntimeCellInternalGatewayUrlOptions = RuntimeCellRuntimeNameOptions & {
  port?: number
}

export function runtimeCellInternalGatewayUrl(
  runtimeCellId: string,
  options: RuntimeCellInternalGatewayUrlOptions = {},
): string {
  const port = options.port ?? DEFAULT_MAINSPRING_RUNTIME_GATEWAY_PORT
  return `http://${runtimeCellRuntimeContainerName(runtimeCellId, options)}:${port}`
}

export function resolveRuntimeCellImageRef(
  env: Record<string, string | undefined>,
  fallback = DEFAULT_RUNTIME_CELL_IMAGE_REF,
): string {
  return resolveMainspringComputerImageRef(env, fallback)
}

export function runtimeCellVolumeRef(
  kind: RuntimeCellVolumeKind,
  runtimeCellId?: string | null,
): string {
  const base = `mainspring-runtime-${kind}`
  return runtimeCellId ? `${base}-${runtimeCellId}` : base
}

export function runtimeCellScopedVolumeRef(
  kind: RuntimeCellVolumeKind,
  runtimeCellId: string,
  options: { shared?: boolean } = {},
): string {
  return options.shared ? runtimeCellVolumeRef(kind) : runtimeCellVolumeRef(kind, runtimeCellId)
}

export type MainspringRuntimeProfileInfo = {
  description: string
  includes: string[]
  excludes: string[]
}

export interface MainspringRuntimeProfileRegistration extends MainspringRuntimeProfileInfo {
  profileId: string
}

const CORE_PROFILE_INCLUDES = [
  'gateway',
  'agents',
  'sessions',
  'cron',
  'config',
  'routing',
  'plugin-sdk',
  'selected-providers',
]
const RICH_APP_EXCLUDES = ['voice', 'media', 'mobile-apps', 'desktop-apps']

export const MAINSPRING_RUNTIME_PROFILES: Record<
  BuiltinMainspringRuntimeProfile,
  MainspringRuntimeProfileInfo
> = {
  core: {
    description:
      'Smallest Mainspring runtime: mailbox, agent turns, policy, routing, tools, and selected providers.',
    includes: CORE_PROFILE_INCLUDES,
    excludes: ['browser', 'memory', ...RICH_APP_EXCLUDES],
  },
  'core-browser': {
    description: 'Default Mainspring runtime: core runtime plus browser automation.',
    includes: [...CORE_PROFILE_INCLUDES, 'browser'],
    excludes: ['memory', ...RICH_APP_EXCLUDES],
  },
  'core-browser-memory': {
    description: 'Default Mainspring runtime: browser agents with persistent memory enabled.',
    includes: [...CORE_PROFILE_INCLUDES, 'browser', 'memory'],
    excludes: [...RICH_APP_EXCLUDES, 'long-tail-providers'],
  },
}

export function isMainspringRuntimeProfile(value: unknown): value is MainspringRuntimeProfile {
  return MainspringRuntimeProfileSchema.safeParse(value).success
}

export function isSafeMainspringRuntimeProfileId(value: unknown): value is MainspringRuntimeProfile {
  return MainspringRuntimeProfileIdSchema.safeParse(value).success
}

export function normalizeMainspringRuntimeProfile(
  value: unknown,
  fallback: MainspringRuntimeProfile = DEFAULT_MAINSPRING_RUNTIME_PROFILE,
): MainspringRuntimeProfile {
  return parseOr(MainspringRuntimeProfileSchema, value, fallback)
}

export function mainspringRuntimeProfileIncludesBrowser(
  profile: MainspringRuntimeProfile,
): boolean {
  const info = MAINSPRING_RUNTIME_PROFILES[profile as BuiltinMainspringRuntimeProfile]
  return Boolean(info?.includes.includes('browser'))
}

export function mainspringRuntimeProfileIncludesMemory(
  profile: MainspringRuntimeProfile,
): boolean {
  const info = MAINSPRING_RUNTIME_PROFILES[profile as BuiltinMainspringRuntimeProfile]
  return Boolean(info?.includes.includes('memory'))
}

export function mainspringRuntimeProfileFromOptions(
  options: {
    allowBrowser?: boolean | null
    allowMemory?: boolean | null
    runtimeProfile?: unknown
  } = {},
  fallback: MainspringRuntimeProfile = 'core',
): MainspringRuntimeProfile {
  if (options.runtimeProfile !== undefined && options.runtimeProfile !== null) {
    return normalizeMainspringRuntimeProfile(options.runtimeProfile, fallback)
  }
  if (options.allowMemory) return 'core-browser-memory'
  if (options.allowBrowser) return 'core-browser'
  return fallback
}

export const RunIntentModeSchema = z.enum(['chat', 'task', 'automation-test', 'agent-test'])
export type RunIntentMode = z.infer<typeof RunIntentModeSchema>
export const ApprovalPolicySchema = z.enum(['ask-first', 'balanced', 'autonomous'])

export const RunIntentAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
})

export const RunContextPackSchema = z
  .object({
    version: z.literal(1),
    strategy: z.literal('latest-message-inline-session-memory'),
    contentHash: z.string().min(1),
    latestMessageHash: z.string().min(1).optional(),
    systemPromptHash: z.string().min(1).optional(),
    messageCount: z.number().int().nonnegative(),
    recentMessageCount: z.number().int().nonnegative(),
    latestMessageBytes: z.number().int().nonnegative(),
    historyBytes: z.number().int().nonnegative(),
    systemPromptBytes: z.number().int().nonnegative(),
    toolCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    packBytes: z.number().int().nonnegative(),
    summaryBytes: z.number().int().nonnegative(),
    summaryStrategy: z.literal('metadata-only'),
    delivery: z
      .object({
        latestMessage: z.literal('inline'),
        history: z.enum(['session-memory', 'none']),
        systemPrompt: z.enum(['inline', 'none']),
        files: z.literal('manifest-refs'),
      })
      .strict(),
  })
  .strict()

export type RunContextPack = z.infer<typeof RunContextPackSchema>

export const RunIntentSchema = z.object({
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  message: z.string(),
  systemPrompt: z.string().min(1).optional(),
  sessionKey: z.string().min(1).optional(),
  mode: RunIntentModeSchema,
  attachments: z.array(RunIntentAttachmentSchema).optional(),
  approvalPolicy: ApprovalPolicySchema,
  runtimeOptions: z
    .object({
      browser: z.boolean().optional(),
      memory: z.boolean().optional(),
      tools: z.array(z.string().min(1)).optional(),
      providerId: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_.:-]+$/)
        .optional(),
      credentialRef: z
        .string()
        .trim()
        .min(1)
        .max(256)
        .regex(/^(env|provider-profile|managed):[A-Za-z0-9_.-]+$/)
        .optional(),
      modelId: z
        .string()
        .trim()
        .min(1)
        .max(256)
        .regex(/^[A-Za-z0-9_.:/-]+$/)
        .optional(),
    })
    .optional(),
  clientContext: z
    .object({
      route: z.string().min(1),
      lane: z.enum(['home', 'platform']),
      contextPack: RunContextPackSchema.optional(),
    })
    .optional(),
})

export type RunIntent = z.infer<typeof RunIntentSchema>

export const RuntimePolicySchema = z.object({
  approvalPolicy: ApprovalPolicySchema,
  allowBrowser: z.boolean().default(false),
  allowMemory: z.boolean().default(false),
  allowedTools: z.array(z.string()).default([]),
  budget: z
    .object({
      status: z.enum(['ok', 'warn', 'blocked']),
      scopeType: z.enum(['client', 'workspace', 'agent', 'run']).optional(),
      scopeId: z.string().min(1).optional(),
      budgetId: z.string().min(1).optional(),
      label: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
      estimatedCostUsd: z.number().finite().nonnegative().optional(),
      remainingEstimatedCostUsd: z.number().finite().optional(),
      requireApproval: z.boolean().default(false),
      enforceUsageLimit: z.boolean().default(false),
      costSensitiveTools: z
        .object({
          mode: z.enum(['allow', 'approval', 'block']).default('allow'),
          reason: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
  redaction: z.enum(['strict', 'balanced']).default('strict'),
})

export type RuntimePolicy = z.infer<typeof RuntimePolicySchema>

export const GatewayRunDispatchSchema = z.object({
  runId: z.string().min(1),
  ownerId: z.string().min(1),
  computerId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  sessionKey: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(512).optional(),
  runtimeProfile: MainspringRuntimeProfileIdSchema.default(DEFAULT_MAINSPRING_RUNTIME_PROFILE),
  intent: RunIntentSchema,
  policy: RuntimePolicySchema,
  trace: z.object({
    requestId: z.string().min(1),
    source: z.enum(['console', 'schedule', 'api', 'test']),
  }),
})

export type GatewayRunDispatch = z.infer<typeof GatewayRunDispatchSchema>

export const GatewayAcceptedRunSchema = z
  .object({
    status: z.literal('accepted'),
    runId: z.string().min(1),
    computerId: z.string().min(1),
    sessionKey: z.string().min(1),
    mailboxSessionId: z.string().min(1),
    /**
     * Deprecated response mirror for callers that still read sessionId.
     */
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
  })
  .refine((value) => value.sessionId === value.mailboxSessionId, {
    message: 'sessionId must match mailboxSessionId.',
    path: ['sessionId'],
  })

export type GatewayAcceptedRun = z.infer<typeof GatewayAcceptedRunSchema>

export function buildGatewayAcceptedMailboxResponse(input: {
  runId: string
  computerId: string
  sessionKey: string
  mailboxSessionId: string
  messageId: string
}): GatewayAcceptedRun {
  return GatewayAcceptedRunSchema.parse({
    status: 'accepted',
    runId: input.runId,
    computerId: input.computerId,
    sessionKey: input.sessionKey,
    mailboxSessionId: input.mailboxSessionId,
    sessionId: input.mailboxSessionId,
    messageId: input.messageId,
  })
}

export const GatewayAcceptedCancelSchema = GatewayAcceptedRunSchema

export type GatewayAcceptedCancel = GatewayAcceptedRun

export const ApprovalDecisionSchema = z.enum(['approved', 'denied'])

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

const APPROVAL_DECISION_ALIASES: Record<string, ApprovalDecision> = {
  approved: 'approved',
  approve: 'approved',
  allow: 'approved',
  denied: 'denied',
  deny: 'denied',
  rejected: 'denied',
  reject: 'denied',
}

export const MainspringApprovalKindSchema = z.enum(['exec', 'plugin'])

export type MainspringApprovalKind = z.infer<typeof MainspringApprovalKindSchema>

export function coerceApprovalDecision(value: unknown): ApprovalDecision | null {
  if (typeof value === 'boolean') return value ? 'approved' : 'denied'
  return typeof value === 'string'
    ? (APPROVAL_DECISION_ALIASES[value.trim().toLowerCase()] ?? null)
    : null
}

export const GatewayApprovalResolutionSchema = z.object({
  runId: z.string().min(1),
  computerId: z.string().min(1),
  sessionKey: z.string().min(1),
  mailboxSessionId: z.string().min(1).optional(),
  approvalId: z.string().min(1),
  decision: ApprovalDecisionSchema,
  reason: z.string().optional(),
  response: z.unknown().optional(),
  idempotencyKey: z.string().trim().min(1).max(512).optional(),
})

export type GatewayApprovalResolution = z.infer<typeof GatewayApprovalResolutionSchema>

export const RunCancelInboundContentSchema = z.object({
  type: z.literal('run_cancel'),
  runId: z.string().min(1),
  reason: z.string().optional(),
})

export type RunCancelInboundContent = z.infer<typeof RunCancelInboundContentSchema>

export function buildRunCancelInboundContent(input: {
  runId: string
  reason?: string
}): RunCancelInboundContent {
  return RunCancelInboundContentSchema.parse({
    type: 'run_cancel',
    runId: input.runId,
    reason: input.reason ?? 'cancelled by control plane',
  })
}

export const ApprovalResponseInboundContentSchema = z.object({
  type: z.literal('approval_response'),
  runId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: ApprovalDecisionSchema,
  reason: z.string().optional(),
  response: z.unknown().optional(),
})

export type ApprovalResponseInboundContent = z.infer<typeof ApprovalResponseInboundContentSchema>

export function buildApprovalResponseInboundContent(
  input: GatewayApprovalResolution,
): ApprovalResponseInboundContent {
  const parsed = GatewayApprovalResolutionSchema.parse(input)
  return ApprovalResponseInboundContentSchema.parse({
    type: 'approval_response',
    runId: parsed.runId,
    approvalId: parsed.approvalId,
    decision: parsed.decision,
    reason: parsed.reason,
    response: parsed.response,
  })
}

export const GatewayAcceptedApprovalResponseSchema = GatewayAcceptedRunSchema

export type GatewayAcceptedApprovalResponse = GatewayAcceptedRun

export const GatewayRunRouteSchema = z.object({
  computerId: z.string().min(1),
  sessionKey: z.string().min(1),
  mailboxSessionId: z.string().min(1).optional(),
})

export type GatewayRunRoute = z.infer<typeof GatewayRunRouteSchema>

export const MainspringComputerStatusSchema = z.enum([
  'stopped',
  'starting',
  'running',
  'idle',
  'stopping',
  'error',
])

export type MainspringComputerStatus = z.infer<typeof MainspringComputerStatusSchema>

export const DEFAULT_MAINSPRING_COMPUTER_STATUS = 'stopped' satisfies MainspringComputerStatus

export function normalizeMainspringComputerStatus(
  value: unknown,
  fallback: MainspringComputerStatus = DEFAULT_MAINSPRING_COMPUTER_STATUS,
): MainspringComputerStatus {
  return parseOr(MainspringComputerStatusSchema, value, fallback)
}

export const MainspringComputerDesiredStateSchema = z.enum(['stopped', 'running', 'suspended'])

export type MainspringComputerDesiredState = z.infer<typeof MainspringComputerDesiredStateSchema>

export const DEFAULT_MAINSPRING_COMPUTER_DESIRED_STATE = 'stopped' satisfies MainspringComputerDesiredState

export function normalizeMainspringComputerDesiredState(
  value: unknown,
  fallback: MainspringComputerDesiredState = DEFAULT_MAINSPRING_COMPUTER_DESIRED_STATE,
): MainspringComputerDesiredState {
  return parseOr(MainspringComputerDesiredStateSchema, value, fallback)
}

export const MainspringComputerSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  defaultAgentId: z.string().min(1).nullable().optional(),
  currentWorkspaceId: z.string().min(1).nullable().optional(),
  runtimeCellId: z.string().min(1).nullable().optional(),
  displayName: z.string().min(1),
  status: MainspringComputerStatusSchema,
  desiredState: MainspringComputerDesiredStateSchema,
  runtimeProfile: MainspringRuntimeProfileIdSchema,
  imageRef: z.string().min(1),
  stateVolumeRef: z.string().nullable().optional(),
  workspaceVolumeRef: z.string().nullable().optional(),
  sessionsVolumeRef: z.string().nullable().optional(),
  artifactVolumeRef: z.string().nullable().optional(),
  browserProfileRef: z.string().nullable().optional(),
  lastWakeAt: z.string().nullable().optional(),
  lastActivityAt: z.string().nullable().optional(),
  idleDeadlineAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type MainspringComputer = z.infer<typeof MainspringComputerSchema>

export function buildMainspringComputer(input: {
  id: string
  ownerId: string
  defaultAgentId?: string | null
  currentWorkspaceId?: string | null
  runtimeCellId?: string | null
  displayName?: string | null
  status?: unknown
  desiredState?: unknown
  runtimeProfile?: unknown
  imageRef?: string | null
  stateVolumeRef?: string | null
  workspaceVolumeRef?: string | null
  sessionsVolumeRef?: string | null
  artifactVolumeRef?: string | null
  browserProfileRef?: string | null
  lastWakeAt?: string | null
  lastActivityAt?: string | null
  idleDeadlineAt?: string | null
  lastError?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
}): MainspringComputer {
  const now = currentIsoTimestamp()
  return MainspringComputerSchema.parse({
    id: input.id,
    ownerId: input.ownerId,
    defaultAgentId: input.defaultAgentId ?? null,
    currentWorkspaceId: input.currentWorkspaceId ?? null,
    runtimeCellId: input.runtimeCellId ?? null,
    displayName: input.displayName?.trim() || DEFAULT_MAINSPRING_COMPUTER_DISPLAY_NAME,
    status: normalizeMainspringComputerStatus(input.status),
    desiredState: normalizeMainspringComputerDesiredState(input.desiredState),
    runtimeProfile: normalizeMainspringRuntimeProfile(input.runtimeProfile),
    imageRef: input.imageRef?.trim() || DEFAULT_MAINSPRING_COMPUTER_IMAGE_REF,
    stateVolumeRef: input.stateVolumeRef ?? null,
    workspaceVolumeRef: input.workspaceVolumeRef ?? null,
    sessionsVolumeRef: input.sessionsVolumeRef ?? null,
    artifactVolumeRef: input.artifactVolumeRef ?? null,
    browserProfileRef: input.browserProfileRef ?? null,
    lastWakeAt: input.lastWakeAt ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
    idleDeadlineAt: input.idleDeadlineAt ?? null,
    lastError: input.lastError ?? null,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  })
}

export const MainspringComputerSessionSchema = z.object({
  id: z.string().min(1),
  computerId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  sessionKey: z.string().min(1),
  mailboxSessionId: z.string().min(1).nullable().optional(),
  mailboxPath: z.string().min(1),
  status: z.enum(['active', 'idle', 'closed', 'error']),
  providerSessionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type MainspringComputerSession = z.infer<typeof MainspringComputerSessionSchema>

export const InboundMailboxKindSchema = z.enum([
  'chat',
  'task',
  'system',
  'approval_response',
  'file_uploaded',
  'skill_installed',
  'tool_installed',
  'run_cancel',
])

export const OutboundMailboxKindSchema = z.enum([
  'assistant_message',
  'system_action',
  'approval_request',
  'file_result',
  'artifact',
  'schedule_request',
  'agent_to_agent',
])

export const MailboxStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])

export type MailboxStatus = z.infer<typeof MailboxStatusSchema>

export type MailboxAckStatus = Exclude<MailboxStatus, 'pending'>

const MbId = z.string().min(1)
const MbText = z.string()
const MbNullableText = z.string().nullable().optional()
const SqlBitSchema = z.union([z.literal(0), z.literal(1)])
const MailboxRowCore = { id: MbId, timestamp: MbText, content: MbText } as const
const MailboxSessionCore = { ...MailboxRowCore, sessionId: MbId } as const
const MailboxSqlSessionCore = { ...MailboxRowCore, session_id: MbId } as const

export const InboundMailboxRowSchema = z.object({
  ...MailboxSessionCore,
  runId: MbId,
  kind: InboundMailboxKindSchema,
  status: MailboxStatusSchema.default('pending'),
  statusChanged: MbNullableText,
  processAfter: MbNullableText,
  recurrence: MbNullableText,
  tries: z.number().int().nonnegative().default(0),
  trigger: SqlBitSchema.default(1),
})

export type InboundMailboxRow = z.infer<typeof InboundMailboxRowSchema>

export const OutboundMailboxRowSchema = z.object({
  ...MailboxSessionCore,
  runId: MbId.nullable().optional(),
  inReplyTo: MbNullableText,
  delivered: z.boolean().default(false),
  deliverAfter: MbNullableText,
  kind: OutboundMailboxKindSchema,
})

export type OutboundMailboxRow = z.infer<typeof OutboundMailboxRowSchema>

export const OutboundMailboxSqlRowSchema = z.object({
  ...MailboxSqlSessionCore,
  run_id: MbId.nullable().optional(),
  in_reply_to: MbNullableText,
  delivered: SqlBitSchema.default(0),
  deliver_after: MbNullableText,
  kind: OutboundMailboxKindSchema,
})

export type OutboundMailboxSqlRow = z.infer<typeof OutboundMailboxSqlRowSchema>

export function outboundMailboxRowFromSql(row: unknown): OutboundMailboxRow {
  const parsed = OutboundMailboxSqlRowSchema.parse(row)
  return OutboundMailboxRowSchema.parse({
    id: parsed.id,
    runId: parsed.run_id,
    sessionId: parsed.session_id,
    inReplyTo: parsed.in_reply_to,
    timestamp: parsed.timestamp,
    delivered: parsed.delivered === 1,
    deliverAfter: parsed.deliver_after,
    kind: parsed.kind,
    content: parsed.content,
  })
}

export const EventMailboxRowSchema = z.object({
  seq: z.number().int().positive(),
  runId: MbId,
  sessionId: MbId,
  type: MbId,
  timestamp: MbText,
  payload: MbText,
})

export type EventMailboxRow = z.infer<typeof EventMailboxRowSchema>

export const InboundMailboxSqlRowSchema = z.object({
  ...MailboxSqlSessionCore,
  run_id: MbId,
  kind: InboundMailboxKindSchema,
  status: MailboxStatusSchema.default('pending'),
  status_changed: MbNullableText,
  process_after: MbNullableText,
  recurrence: MbNullableText,
  tries: z.number().int().nonnegative().default(0),
  trigger: SqlBitSchema.default(1),
})

export type InboundMailboxSqlRow = z.infer<typeof InboundMailboxSqlRowSchema>

export function inboundMailboxRowFromSql(row: unknown): InboundMailboxRow {
  const parsed = InboundMailboxSqlRowSchema.parse(row)
  return InboundMailboxRowSchema.parse({
    id: parsed.id,
    runId: parsed.run_id,
    sessionId: parsed.session_id,
    kind: parsed.kind,
    timestamp: parsed.timestamp,
    status: parsed.status,
    statusChanged: parsed.status_changed,
    processAfter: parsed.process_after,
    recurrence: parsed.recurrence,
    tries: parsed.tries,
    trigger: parsed.trigger,
    content: parsed.content,
  })
}

export const EventMailboxSqlRowSchema = z.object({
  seq: z.number().int().positive(),
  run_id: MbId,
  session_id: MbId,
  type: MbId,
  timestamp: MbText,
  payload: MbText,
})

export type EventMailboxSqlRow = z.infer<typeof EventMailboxSqlRowSchema>

export function eventMailboxRowFromSql(row: unknown): EventMailboxRow {
  const parsed = EventMailboxSqlRowSchema.parse(row)
  return EventMailboxRowSchema.parse({
    seq: parsed.seq,
    runId: parsed.run_id,
    sessionId: parsed.session_id,
    type: parsed.type,
    timestamp: parsed.timestamp,
    payload: parsed.payload,
  })
}

export const INBOUND_MAILBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS messages_in (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  status_changed TEXT,
  process_after TEXT,
  recurrence TEXT,
  tries INTEGER DEFAULT 0,
  trigger INTEGER DEFAULT 1,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_in_run ON messages_in(run_id);
CREATE INDEX IF NOT EXISTS idx_messages_in_status ON messages_in(status, process_after);
`

export const OUTBOUND_MAILBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS messages_out (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  session_id TEXT NOT NULL,
  in_reply_to TEXT,
  timestamp TEXT NOT NULL,
  delivered INTEGER DEFAULT 0,
  deliver_after TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_out_run ON messages_out(run_id);
CREATE INDEX IF NOT EXISTS idx_messages_out_delivery ON messages_out(delivered, deliver_after);

CREATE TABLE IF NOT EXISTS processing_ack (
  message_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  status_changed TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_processing_ack_status ON processing_ack(status, status_changed);

CREATE TABLE IF NOT EXISTS session_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS container_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_tool TEXT,
  tool_declared_timeout_ms INTEGER,
  tool_started_at TEXT,
  updated_at TEXT NOT NULL
);
`

export const EVENTS_MAILBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events_out (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_out_run_seq ON events_out(run_id, seq);
`

export const MAILBOX_FILENAMES = {
  inbound: 'inbound.db',
  outbound: 'outbound.db',
  events: 'events.db',
  heartbeat: '.heartbeat',
  inbox: 'inbox',
  outbox: 'outbox',
} as const

export const MAILBOX_STORE_OWNERS = {
  inbound: 'host',
  inbox: 'host',
  outbound: 'runner',
  events: 'runner',
  heartbeat: 'runner',
  outbox: 'runner',
} as const

export type MailboxStoreName = keyof typeof MAILBOX_STORE_OWNERS
export type MailboxStoreOwner = (typeof MAILBOX_STORE_OWNERS)[MailboxStoreName]

export function mailboxStoreOwner(name: MailboxStoreName): MailboxStoreOwner {
  return MAILBOX_STORE_OWNERS[name]
}

export function isHostOwnedMailboxStore(name: MailboxStoreName): boolean {
  return mailboxStoreOwner(name) === 'host'
}

export function isRunnerOwnedMailboxStore(name: MailboxStoreName): boolean {
  return mailboxStoreOwner(name) === 'runner'
}

export function assertMailboxStoreOwner(
  name: MailboxStoreName,
  owner: MailboxStoreOwner,
): MailboxStoreName {
  const actual = mailboxStoreOwner(name)
  if (actual !== owner) {
    throw new Error(`Mailbox store "${name}" is ${actual}-owned, not ${owner}-owned.`)
  }
  return name
}

export const DEFAULT_MAINSPRING_COMPUTER_ROOT = '/computer'
export const DEFAULT_MAINSPRING_SESSIONS_ROOT = '/sessions'
export const DEFAULT_MAINSPRING_WORKSPACE_ROOT = '/workspaces/default'

export interface SessionMailboxPaths {
  sessionPath: string
  inboundDbPath: string
  outboundDbPath: string
  eventsDbPath: string
  heartbeatPath: string
  inboxPath: string
  outboxPath: string
}

export interface ComputerSessionMailboxPaths extends SessionMailboxPaths {
  computerRoot: string
  sessionsRoot: string
}

export function resolveComputerSessionsRoot(computerRoot: string): string {
  return joinRuntimePath(computerRoot, 'sessions')
}

export function sanitizeMailboxPathSegment(value: string, label = 'path segment'): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error(`${label} must be a non-empty path segment.`)
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error(`${label} does not contain a safe path segment.`)
  }

  return sanitized
}

export function mailboxSessionIdFromSessionKey(sessionKey: string): string {
  return sanitizeMailboxPathSegment(sessionKey, 'sessionKey')
}

export function normalizeMailboxSessionId(mailboxSessionId: string): string {
  return sanitizeMailboxPathSegment(mailboxSessionId, 'mailboxSessionId')
}

export function sanitizeRuntimeFilename(value: string, fallback = 'artifact'): string {
  const basename = runtimeBasename(value).trim()
  const extension = runtimeExtname(basename)
  const stem = extension ? basename.slice(0, -extension.length) : basename
  const safeStem = sanitizeRuntimeFilenamePart(stem).replace(/^\.+/, '')
  const safeExtension = extension ? sanitizeRuntimeFilenamePart(extension.slice(1)) : ''
  const sanitized = safeStem && safeExtension ? `${safeStem}.${safeExtension}` : safeStem
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : fallback
}

function sanitizeRuntimeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

const RUNTIME_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
}

export function inferRuntimeMimeType(filename: string): string {
  const ext = runtimeExtname(sanitizeRuntimeFilename(filename)).toLowerCase()
  return RUNTIME_MIME_TYPES[ext] ?? 'application/octet-stream'
}

export function isRuntimeImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/')
}

export function inferRuntimeArtifactKind(filename: string): 'image' | 'file' {
  return isRuntimeImageMimeType(inferRuntimeMimeType(filename)) ? 'image' : 'file'
}

export function runtimeArtifactTypeLabel(filename: string): string {
  const extension = runtimeExtname(sanitizeRuntimeFilename(filename)).slice(1).trim()
  return extension ? extension.toUpperCase() : 'File'
}

function containsRuntimeSecretMaterial(value: unknown): boolean {
  if (typeof value === 'string') {
    return redactRuntimeSensitiveText(value) !== value
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsRuntimeSecretMaterial(entry))
  }

  if (!value || typeof value !== 'object') {
    return false
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, entry]) => SENSITIVE_KEY_PATTERN.test(key) || containsRuntimeSecretMaterial(entry),
  )
}

export const RuntimeSecretRefKindSchema = z.enum(['env', 'provider-profile', 'managed'])

export type RuntimeSecretRefKind = z.infer<typeof RuntimeSecretRefKindSchema>

export const RuntimeSecretRefSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (!/^(env|provider-profile|managed):[A-Za-z0-9_.-]+$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Runtime secret references must be opaque env:, provider-profile:, or managed: refs.',
      })
      return
    }

    if (redactRuntimeSensitiveText(value) !== value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Runtime secret references must not contain raw secret material.',
      })
    }
  })
  .transform((value) => {
    const separator = value.indexOf(':')
    return {
      kind: value.slice(0, separator) as RuntimeSecretRefKind,
      key: value.slice(separator + 1),
    }
  })

export type RuntimeSecretRef = z.infer<typeof RuntimeSecretRefSchema>

export const ProviderRateLimitBucketSchema = z
  .object({
    limit: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().optional(),
    resetSeconds: z.number().nonnegative().optional(),
  })
  .strict()

export type ProviderRateLimitBucket = z.infer<typeof ProviderRateLimitBucketSchema>

export const ProviderRateLimitStateSchema = z
  .object({
    provider: z.string().min(1).optional(),
    capturedAt: z.string().optional(),
    requestsMinute: ProviderRateLimitBucketSchema.optional(),
    requestsHour: ProviderRateLimitBucketSchema.optional(),
    tokensMinute: ProviderRateLimitBucketSchema.optional(),
    tokensHour: ProviderRateLimitBucketSchema.optional(),
  })
  .strict()

export type ProviderRateLimitState = z.infer<typeof ProviderRateLimitStateSchema>

export const ProviderUsageSchema = z
  .object({
    provider: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    modelFamily: z.string().min(1).optional(),
    providerTransport: z.string().min(1).optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    rateLimit: ProviderRateLimitStateSchema.optional(),
  })
  .strict()

export type ProviderUsage = z.infer<typeof ProviderUsageSchema>

const ProviderEventBaseSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('init'),
      provider: z.string().min(1).optional(),
      providerSessionId: z.string().min(1),
      modelId: z.string().min(1).optional(),
      modelFamily: z.string().min(1).optional(),
      providerTransport: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal('result'), text: z.string().nullable() }).strict(),
  z.object({ type: z.literal('delta'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('tool_call'),
      toolCallId: z.string().min(1).optional(),
      name: z.string().min(1),
      input: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool_result'),
      toolCallId: z.string().min(1).optional(),
      name: z.string().min(1),
      output: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      message: z.string(),
      retryable: z.boolean(),
      classification: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal('progress'), message: z.string() }).strict(),
  z
    .object({
      type: z.literal('usage'),
      usage: ProviderUsageSchema,
      providerSessionId: z.string().min(1).optional(),
    })
    .strict(),
])

export const ProviderEventSchema = ProviderEventBaseSchema.superRefine((value, ctx) => {
  if (!containsRuntimeSecretMaterial(value)) return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Provider events must not contain raw runtime secret material.',
  })
})

export type ProviderEvent = z.infer<typeof ProviderEventSchema>

export const ArtifactRecordSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    kind: z.enum(['file', 'image', 'text', 'json', 'log', 'trace', 'snapshot', 'artifact']),
    filename: z
      .string()
      .min(1)
      .transform((value) => sanitizeRuntimeFilename(value)),
    contentType: z.string().min(1).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    createdAt: z.string(),
    metadata: z
      .unknown()
      .optional()
      .transform((value) => sanitizeRuntimeResponse(value)),
  })
  .strict()

export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>

export const MemoryEventSchema = z
  .object({
    type: z.literal('memory.event'),
    runId: z.string().min(1),
    action: z.string().min(1),
    memoryId: z.string().min(1).optional(),
    metadata: z
      .unknown()
      .optional()
      .transform((value) => sanitizeRuntimeResponse(value)),
  })
  .strict()

export type MemoryEvent = z.infer<typeof MemoryEventSchema>

export const BrowserEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('browser.event'),
      runId: z.string().min(1),
      event: z.string().min(1),
      url: z
        .string()
        .min(1)
        .optional()
        .transform((value) => (value ? sanitizeRuntimeUrl(value) : value)),
      payload: z
        .unknown()
        .optional()
        .transform((value) => sanitizeRuntimeResponse(value)),
    })
    .strict(),
  z
    .object({
      type: z.literal('browser.screenshot'),
      runId: z.string().min(1),
      artifactId: z.string().min(1),
      url: z
        .string()
        .min(1)
        .optional()
        .transform((value) => (value ? sanitizeRuntimeUrl(value) : value)),
    })
    .strict(),
])

export type BrowserEvent = z.infer<typeof BrowserEventSchema>

export function resolveSessionMailboxPaths(sessionPath: string): SessionMailboxPaths {
  return {
    sessionPath,
    inboundDbPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.inbound),
    outboundDbPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.outbound),
    eventsDbPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.events),
    heartbeatPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.heartbeat),
    inboxPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.inbox),
    outboxPath: joinRuntimePath(sessionPath, MAILBOX_FILENAMES.outbox),
  }
}

export function resolveComputerSessionMailboxPaths(
  computerRoot: string,
  sessionId: string,
): ComputerSessionMailboxPaths {
  const sessionsRoot = resolveComputerSessionsRoot(computerRoot)
  const safeSessionId = sanitizeMailboxPathSegment(sessionId, 'sessionId')
  return {
    computerRoot,
    sessionsRoot,
    ...resolveSessionMailboxPaths(joinRuntimePath(sessionsRoot, safeSessionId)),
  }
}

export function resolveDefaultComputerSessionMailboxPaths(
  sessionId: string,
): ComputerSessionMailboxPaths {
  return resolveComputerSessionMailboxPaths(DEFAULT_MAINSPRING_COMPUTER_ROOT, sessionId)
}

export const MainspringNativeEventTypeSchema = z.enum([
  'assistant.text.delta',
  'assistant.text.done',
  'tool.call',
  'tool.result',
  'mainspring.run.status',
  'mainspring.assistant.delta',
  'mainspring.tool.call',
  'mainspring.tool.result',
  'mainspring.ui.flow',
  'mainspring.browser.event',
  'mainspring.browser.screenshot',
  'mainspring.file.change',
  'mainspring.approval.requested',
  'mainspring.approval.resolved',
  'mainspring.log',
  'mainspring.usage',
  'browser.event',
  'browser.screenshot',
  'approval.requested',
  'approval.resolved',
  'file.change',
  'run.status',
  'ui.flow',
  'log',
  'error',
])

export type MainspringNativeEventType = z.infer<typeof MainspringNativeEventTypeSchema>

export const MainspringEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.status'),
    runId: z.string().min(1),
    status: z.string().min(1),
    phase: z.string().optional(),
  }),
  z.object({
    type: z.literal('assistant.text.delta'),
    runId: z.string().min(1),
    text: z.string(),
  }),
  z.object({
    type: z.literal('assistant.text.done'),
    runId: z.string().min(1),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool.call'),
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    input: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('tool.update'),
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    message: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('tool.result'),
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    output: z.unknown().optional(),
    status: z.string().min(1),
  }),
  z.object({
    type: z.literal('browser.event'),
    runId: z.string().min(1),
    event: z.string().min(1),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('browser.screenshot'),
    runId: z.string().min(1),
    artifactId: z.string().optional(),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal('file.change'),
    runId: z.string().min(1),
    path: z.string().min(1),
    action: z.string().min(1),
  }),
  z.object({
    type: z.literal('approval.requested'),
    runId: z.string().min(1),
    approval: z.unknown(),
  }),
  z.object({
    type: z.literal('approval.resolved'),
    runId: z.string().min(1),
    approval: z.unknown(),
  }),
  z.object({
    type: z.literal('artifact.created'),
    runId: z.string().min(1),
    artifactId: z.string().min(1),
    kind: z.string().min(1),
  }),
  z.object({
    type: z.literal('memory.event'),
    runId: z.string().min(1),
    action: z.string().min(1),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('skill.event'),
    runId: z.string().min(1).optional(),
    skillKey: z.string().min(1),
    action: z.string().min(1),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('log'),
    runId: z.string().min(1).optional(),
    level: z.string().min(1),
    message: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('usage'),
    runId: z.string().min(1),
    usage: z.unknown(),
    providerSessionId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('error'),
    runId: z.string().min(1).optional(),
    message: z.string(),
    retryable: z.boolean().optional(),
  }),
])

export type MainspringEvent = z.infer<typeof MainspringEventSchema>

export const RunStreamFrameSchema = z.object({
  seq: z.number().int().nonnegative(),
  cursor: z.string().min(1),
  runId: z.string().min(1),
  event: MainspringEventSchema,
  createdAt: z.string(),
})

export type RunStreamFrame = z.infer<typeof RunStreamFrameSchema>

function textFromOutboundMailboxContent(content: string): string {
  const parsed = jsonRecord(content)
  if (typeof parsed?.text === 'string') return parsed.text
  if (typeof parsed?.message === 'string') return parsed.message
  if (typeof parsed?.content === 'string') return parsed.content
  return content
}

export function mainspringEventFromOutboundMailboxRow(input: {
  runId: string
  message: OutboundMailboxRow
}): MainspringEvent | null {
  if (input.message.kind === 'assistant_message') {
    return MainspringEventSchema.parse({
      type: 'assistant.text.done',
      runId: input.runId,
      text: textFromOutboundMailboxContent(input.message.content),
    })
  }

  if (input.message.kind === 'artifact' || input.message.kind === 'file_result') {
    const parsed = jsonRecord(input.message.content)
    const artifactId =
      typeof parsed?.artifactId === 'string'
        ? parsed.artifactId
        : typeof parsed?.id === 'string'
          ? parsed.id
          : input.message.id
    const kind =
      typeof parsed?.kind === 'string'
        ? parsed.kind
        : input.message.kind === 'file_result'
          ? 'file'
          : 'artifact'

    return MainspringEventSchema.parse({
      type: 'artifact.created',
      runId: input.runId,
      artifactId,
      kind,
    })
  }

  return null
}

export function mainspringEventFromMailboxSqlRow(row: unknown): MainspringEvent {
  const parsed = EventMailboxSqlRowSchema.parse(row)
  const payload = parseJsonValue<unknown>(parsed.payload, parsed.payload)
  const payloadRecord = asRecord(payload)
  return MainspringEventSchema.parse(
    payloadRecord && 'type' in payloadRecord
      ? payloadRecord
      : { type: parsed.type, runId: parsed.run_id, payload },
  )
}

export function runStreamFrameFromMailboxSqlRow(row: unknown): RunStreamFrame {
  const parsed = EventMailboxSqlRowSchema.parse(row)
  return RunStreamFrameSchema.parse({
    seq: parsed.seq,
    cursor: `events:${parsed.seq}`,
    runId: parsed.run_id,
    event: mainspringEventFromMailboxSqlRow(parsed),
    createdAt: parsed.timestamp,
  })
}

export const GatewayRunFramesResponseSchema = z.object({
  runId: z.string().min(1),
  frames: z.array(RunStreamFrameSchema),
})

export type GatewayRunFramesResponse = z.infer<typeof GatewayRunFramesResponseSchema>

export const GatewayRunOutboundResponseSchema = z.object({
  runId: z.string().min(1),
  messages: z.array(OutboundMailboxRowSchema),
})

export type GatewayRunOutboundResponse = z.infer<typeof GatewayRunOutboundResponseSchema>

export const MainspringControlMethodSchema = z.enum([
  'agents.upsert',
  'agents.create',
  'agents.delete',
  'agents.files.get',
  'agents.files.list',
  'agents.files.delete',
  'agents.files.set',
  'agents.list',
  'agents.update',
  'approvals.decide',
  'approvals.list',
  'browser.events',
  'browser.request',
  'browser.screenshot',
  'browser.status',
  'mainspring.runtime.describe',
  'mainspring.runtime.health',
  'mainspring.runtime.profile',
  'mainspring.agent.projection.get',
  'mainspring.agent.projection.apply',
  'mainspring.agent.events.subscribe',
  'mainspring.agent.events.tail',
  'mainspring.browser.status',
  'mainspring.browser.events',
  'mainspring.cost.usage',
  'mainspring.diagnostics.overview',
  'cron.add',
  'cron.upsert',
  'cron.create',
  'cron.delete',
  'cron.list',
  'cron.remove',
  'cron.run',
  'cron.runNow',
  'cron.status',
  'cron.update',
  'logs.tail',
  'models.status',
  'models.list',
  'plugins.list',
  'providers.list',
  'providers.status',
  'secrets.refs',
  'sessions.cancel',
  'sessions.create',
  'sessions.history',
  'sessions.list',
  'sessions.send',
  'sessions.status',
  'sessions.stream',
  'skills.install',
  'skills.list',
  'skills.search',
  'skills.detail',
  'skills.status',
  'skills.update',
  'tools.catalog',
  'tools.effective',
])

export type MainspringControlMethod = z.infer<typeof MainspringControlMethodSchema>

export const GatewayComputerStatusSchema = z.enum(['stopped', 'running', 'suspended'])

export type GatewayComputerStatus = z.infer<typeof GatewayComputerStatusSchema>

export const GatewayComputerLifecycleActionSchema = z.enum(['wake', 'suspend'])

export type GatewayComputerLifecycleAction = z.infer<typeof GatewayComputerLifecycleActionSchema>

export function gatewayComputerStatusForLifecycleAction(
  action: GatewayComputerLifecycleAction,
): Extract<GatewayComputerStatus, 'running' | 'suspended'> {
  return action === 'wake' ? 'running' : 'suspended'
}

export function mainspringComputerDesiredStateForGatewayLifecycleAction(
  action: GatewayComputerLifecycleAction,
): Extract<MainspringComputerDesiredState, 'running' | 'suspended'> {
  return action === 'wake' ? 'running' : 'suspended'
}

export const GatewayComputerCommandResultSchema = z.object({
  id: z.string().min(1),
  status: GatewayComputerStatusSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export type GatewayComputerCommandResult = z.infer<typeof GatewayComputerCommandResultSchema>

export function buildGatewayComputerCommandResult(input: {
  id: string
  status: GatewayComputerStatus
  createdAt?: string
  updatedAt?: string
}): GatewayComputerCommandResult {
  return GatewayComputerCommandResultSchema.parse(input)
}

export const GatewayComputerHealthSessionStateSchema = z.enum(['healthy', 'stale', 'missing'])

export type GatewayComputerHealthSessionState = z.infer<
  typeof GatewayComputerHealthSessionStateSchema
>

export const GatewayComputerHealthSessionSchema = z.object({
  sessionId: z.string().min(1),
  state: GatewayComputerHealthSessionStateSchema,
  lastHeartbeatAt: z.string().nullable(),
  ageMs: z.number().nonnegative().nullable(),
  processingAcks: z.number().int().nonnegative().optional(),
  staleProcessingAcks: z.number().int().nonnegative().optional(),
  oldestProcessingAckAgeMs: z.number().nonnegative().nullable().optional(),
})

export type GatewayComputerHealthSession = z.infer<typeof GatewayComputerHealthSessionSchema>

export const GatewayComputerRuntimeStateSchema = z.enum([
  'missing',
  'idle',
  'healthy',
  'stale',
  'pending-heartbeat',
  'stuck-processing',
])

export type GatewayComputerRuntimeState = z.infer<typeof GatewayComputerRuntimeStateSchema>

export const GatewayComputerHealthSchema = z.object({
  ok: z.boolean(),
  computerId: z.string().min(1),
  status: z.string().min(1),
  runtimeState: GatewayComputerRuntimeStateSchema.optional(),
  checkedAt: z.string(),
  sessionCount: z.number().int().nonnegative().optional(),
  staleSessions: z.number().int().nonnegative().optional(),
  missingHeartbeats: z.number().int().nonnegative().optional(),
  processingAcks: z.number().int().nonnegative().optional(),
  staleProcessingAcks: z.number().int().nonnegative().optional(),
  oldestProcessingAckAgeMs: z.number().nonnegative().nullable().optional(),
  sessions: z.array(GatewayComputerHealthSessionSchema).optional(),
})

export type GatewayComputerHealth = z.infer<typeof GatewayComputerHealthSchema>

export const InstallSourceSchema = z.enum(['built-in', 'uploaded', 'registry', 'git'])
export const NetworkPermissionSchema = z.enum(['none', 'limited', 'open'])
export const FilesystemPermissionSchema = z.enum(['read', 'workspace-write', 'computer-write'])

export const CapabilityManifestPermissionsSchema = z.object({
  shell: z.boolean().optional(),
  browser: z.boolean().optional(),
  network: NetworkPermissionSchema.optional(),
  filesystem: FilesystemPermissionSchema.optional(),
  secrets: z.array(z.string()).optional(),
})

export const CapabilityApprovalSchema = z.object({
  required: z.boolean().optional(),
  dangerousPatterns: z.array(z.string()).optional(),
})

export const ProvenanceTaintLabelSchema = z.enum([
  'trusted-local',
  'runtime-generated',
  'operator-reviewed',
  'third-party',
  'untrusted-input',
  'high-capability',
  'prompt-injection-suspect',
  'secret-reference',
  'policy-mutation-suspect',
  'remote-code-suspect',
])

export const ProvenanceTrustMetadataSchema = z.object({
  source: z.string().min(1),
  labels: z.array(ProvenanceTaintLabelSchema),
  scannerVersion: z.number().int().positive(),
  contentHash: z.string().min(1),
  scanStatus: z.enum(['pass', 'review', 'block']),
  findings: z.array(z.string()),
  reviewed: z.boolean().optional(),
  reviewId: z.string().optional(),
})

export type ProvenanceTaintLabel = z.infer<typeof ProvenanceTaintLabelSchema>
export type ProvenanceTrustMetadata = z.infer<typeof ProvenanceTrustMetadataSchema>

export const SkillManifestSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  source: InstallSourceSchema,
  entrypoint: z.string().optional(),
  instructionsPath: z.string().optional(),
  permissions: CapabilityManifestPermissionsSchema,
  approval: CapabilityApprovalSchema,
  provenance: ProvenanceTrustMetadataSchema.optional(),
})

export type SkillManifest = z.infer<typeof SkillManifestSchema>

export const ToolManifestSchema = SkillManifestSchema.extend({
  toolType: z.enum(['mcp', 'builtin', 'shell', 'browser', 'file', 'memory', 'web']).default('mcp'),
})

export type ToolManifest = z.infer<typeof ToolManifestSchema>

const UserCapabilityInstallBaseSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  computerId: z.string().min(1),
  source: InstallSourceSchema,
  version: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  installedAt: z.string(),
  updatedAt: z.string(),
})

export const UserSkillInstallSchema = UserCapabilityInstallBaseSchema.extend({
  skillKey: z.string().min(1),
  manifest: SkillManifestSchema,
})

export type UserSkillInstall = z.infer<typeof UserSkillInstallSchema>

export const UserToolInstallSchema = UserCapabilityInstallBaseSchema.extend({
  toolKey: z.string().min(1),
  manifest: ToolManifestSchema,
})

export type UserToolInstall = z.infer<typeof UserToolInstallSchema>

export const ProviderStatusSchema = z.object({
  provider: z.string().min(1),
  enabled: z.boolean(),
  authenticated: z.boolean().optional(),
  modelIds: z.array(z.string()).optional(),
  status: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

export const RuntimeDiagnosticSchema = z.object({
  computerId: z.string().min(1),
  status: MainspringComputerStatusSchema,
  health: z.record(z.string(), z.unknown()).optional(),
  lastHeartbeatAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
})

export type RuntimeDiagnostic = z.infer<typeof RuntimeDiagnosticSchema>

export const DangerousConfigPatchKeys = [
  'gateway.controlUi.dangerouslyDisableDeviceAuth',
  'gateway.controlUi.allowInsecureAuth',
  'gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback',
  'gateway.remote.url',
  'hooks.gmail.allowUnsafeExternalContent',
  'tools.exec.applyPatch.workspaceOnly',
  'tools.fs.workspaceOnly',
] as const

export type DangerousConfigPatchKey = (typeof DangerousConfigPatchKeys)[number]

export const MainspringCapabilityDecisionSchema = z.enum([
  'keep',
  'adapt',
  'wrap',
  'rewrite',
  'defer',
  'trim',
  'forbid',
])

export type MainspringCapabilityDecision = z.infer<typeof MainspringCapabilityDecisionSchema>

export const MainspringHealthSchema = z.object({
  status: z.string(),
  healthy: z.boolean().optional(),
  refreshedAt: z.string().optional(),
  version: z.string().optional(),
  sessionCount: z.number().int().nonnegative().optional(),
  processingAcks: z.number().int().nonnegative().optional(),
  staleProcessingAcks: z.number().int().nonnegative().optional(),
  oldestProcessingAckAgeMs: z.number().nonnegative().nullable().optional(),
})

export type MainspringHealth = z.infer<typeof MainspringHealthSchema>

export const MainspringRuntimeSnapshotSchema = z.object({
  health: MainspringHealthSchema.optional(),
  ready: MainspringHealthSchema.optional(),
  browser: z.record(z.string(), z.unknown()).optional(),
  models: z.record(z.string(), z.unknown()).optional(),
  plugins: z.array(z.record(z.string(), z.unknown())).optional(),
  skills: z.array(z.record(z.string(), z.unknown())).optional(),
  profile: MainspringRuntimeProfileIdSchema.optional(),
})

export type MainspringRuntimeSnapshot = z.infer<typeof MainspringRuntimeSnapshotSchema>

export const MainspringDiagnosticIssueSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string().optional(),
  message: z.string(),
  source: z.string().optional(),
})

export type MainspringDiagnosticIssue = z.infer<typeof MainspringDiagnosticIssueSchema>

export const MainspringRuntimeDiagnosticStatusSchema = z.enum([
  'healthy',
  'degraded',
  'unavailable',
])

export type MainspringRuntimeDiagnosticStatus = z.infer<
  typeof MainspringRuntimeDiagnosticStatusSchema
>

export const MainspringRuntimeDiagnosticsSchema = z.object({
  status: MainspringRuntimeDiagnosticStatusSchema,
  profile: MainspringRuntimeProfileIdSchema.optional(),
  checkedAt: z.string(),
  health: MainspringHealthSchema.optional(),
  ready: MainspringHealthSchema.optional(),
  issues: z.array(MainspringDiagnosticIssueSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type MainspringRuntimeDiagnostics = z.infer<typeof MainspringRuntimeDiagnosticsSchema>

export const MainspringConfigPatchBodySchema = z
  .object({
    patch: z.record(z.string().min(1), z.unknown()),
  })
  .strict()

export type MainspringConfigPatchBody = z.infer<typeof MainspringConfigPatchBodySchema>

const DangerousConfigPatchKeySet = new Set<string>(DangerousConfigPatchKeys)
const PrototypePollutionConfigKeySet = new Set(['__proto__', 'constructor', 'prototype'])

const SECRET_CONFIG_KEY_PATTERN =
  /(^|[._-])(api[-_]?key|authorization|credential|credentials|gateway[-_]?token|access[-_]?token|refresh[-_]?token|secret|token|password|private[-_]?key)($|[._-])/i

const UNSAFE_RUNTIME_CONFIG_KEY_PATTERN =
  /(^|[._-])(dangerously|allow[-_]?insecure|disable[-_]?.*auth|workspace[-_]?only|raw[-_]?gateway|cdp[-_]?url|cdp[-_]?endpoint|browser[-_]?cdp)($|[._-])/i

function isPlainConfigObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function collectMainspringConfigPatchKeyPaths(
  patch: Record<string, unknown>,
  prefix = '',
): string[] {
  const keys: string[] = []

  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key
    keys.push(path)
    if (isPlainConfigObject(value)) {
      keys.push(...collectMainspringConfigPatchKeyPaths(value, path))
    }
  }

  return keys
}

export function isDangerousMainspringConfigKey(key: string): boolean {
  const normalized = key.trim()
  const pathSegments = normalized.split('.').map((segment) => segment.trim())
  return (
    DangerousConfigPatchKeySet.has(normalized) ||
    pathSegments.some((segment) => PrototypePollutionConfigKeySet.has(segment)) ||
    SECRET_CONFIG_KEY_PATTERN.test(normalized) ||
    UNSAFE_RUNTIME_CONFIG_KEY_PATTERN.test(normalized)
  )
}

export function getUnsafeMainspringConfigKeys(patch: Record<string, unknown>): string[] {
  return collectMainspringConfigPatchKeyPaths(patch).filter(isDangerousMainspringConfigKey)
}

export function assertSafeMainspringConfigPatch(input: unknown): MainspringConfigPatchBody {
  const parsed = MainspringConfigPatchBodySchema.parse(input)
  const unsafeKeys = getUnsafeMainspringConfigKeys(parsed.patch)
  if (unsafeKeys.length > 0) {
    throw new Error(`Unsafe Mainspring config patch keys: ${unsafeKeys.join(', ')}`)
  }
  return parsed
}

export function assertSafeMainspringRuntimeProfile(profile: string): MainspringRuntimeProfile {
  return MainspringRuntimeProfileIdSchema.parse(profile)
}
