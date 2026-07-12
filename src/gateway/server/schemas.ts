import { z } from 'zod'
import {
  MainspringRuntimeProfileIdSchema,
  RunIntentModeSchema,
} from '#protocol'

const OptionalTrimmedString = z.string().optional().transform((value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
})

const HostedGatewayRoleSchema = z.enum(['admin', 'operator', 'viewer'])

export const CreateHostedAuthUserRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().trim().min(8),
  role: HostedGatewayRoleSchema,
})

export const UpdateHostedAuthUserRequestSchema = z
  .object({
    password: z.string().trim().min(8).optional(),
    role: HostedGatewayRoleSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine(
    (value) => value.password !== undefined || value.role !== undefined || value.status !== undefined,
    { message: 'At least one hosted auth user field must be provided.' },
  )

export const StartRunRequestSchema = z.object({
  sessionId: z.string().min(1),
  input: z.string().min(1),
  mode: RunIntentModeSchema.default('chat'),
  allowedTools: z.array(z.string().min(1)).default([]),
  allowBudgetWarning: z.boolean().optional(),
  computerId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  providerProfileId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  runtimeProfile: MainspringRuntimeProfileIdSchema.optional(),
})

export const RetryRunRequestSchema = z.object({
  allowBudgetWarning: z.boolean().optional(),
}).strict()

export const ResolveApprovalRequestSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  reason: z.string().trim().min(1).optional(),
  response: z.unknown().optional(),
})

export const CreateClientRequestSchema = z.object({
  name: z.string().trim().min(1),
  workspaceRoot: OptionalTrimmedString,
  workspaceName: OptionalTrimmedString,
  contact: OptionalTrimmedString,
  billingLabel: OptionalTrimmedString,
})

export const CreateWorkspaceRequestSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  workspaceRoot: z.string().trim().min(1),
})

export const UpdateClientRequestSchema = z
  .object({
    name: OptionalTrimmedString,
    status: z.enum(['active', 'archived']).optional(),
    contact: OptionalTrimmedString,
    billingLabel: OptionalTrimmedString,
    workspaceId: OptionalTrimmedString,
    workspaceName: OptionalTrimmedString,
    workspaceRoot: OptionalTrimmedString,
    workspaceStatus: z.enum(['active', 'archived']).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.status !== undefined ||
      value.contact !== undefined ||
      value.billingLabel !== undefined ||
      value.workspaceId !== undefined ||
      value.workspaceName !== undefined ||
      value.workspaceRoot !== undefined ||
      value.workspaceStatus !== undefined,
    { message: 'At least one client field must be provided.' },
  )

export const CreateAgentRequestSchema = z.object({
  workspaceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: OptionalTrimmedString,
  defaultModelId: OptionalTrimmedString,
  instructions: OptionalTrimmedString,
  outcome: OptionalTrimmedString,
  voice: OptionalTrimmedString,
  approvalMode: OptionalTrimmedString,
  modelLabel: OptionalTrimmedString,
  skills: z.record(z.string(), z.boolean()).optional(),
})

export const CreateProviderProfileRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  secretRef: OptionalTrimmedString,
  secretValue: OptionalTrimmedString,
  defaultModelId: OptionalTrimmedString,
}).refine(
  (value) => value.secretRef !== undefined || value.secretValue !== undefined,
  { message: 'Provider profile secret ref or managed secret value is required.' },
)

export const UpdateAgentRequestSchema = z
  .object({
    name: OptionalTrimmedString,
    version: OptionalTrimmedString,
    defaultModelId: OptionalTrimmedString,
    instructions: OptionalTrimmedString,
    outcome: OptionalTrimmedString,
    voice: OptionalTrimmedString,
    approvalMode: OptionalTrimmedString,
    modelLabel: OptionalTrimmedString,
    skills: z.record(z.string(), z.boolean()).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.version !== undefined ||
      value.defaultModelId !== undefined ||
      value.instructions !== undefined ||
      value.outcome !== undefined ||
      value.voice !== undefined ||
      value.approvalMode !== undefined ||
      value.modelLabel !== undefined ||
      value.skills !== undefined,
    { message: 'At least one agent field must be provided.' },
  )

export const UpdateProviderProfileRequestSchema = z
  .object({
    providerId: OptionalTrimmedString,
    label: OptionalTrimmedString,
    secretRef: OptionalTrimmedString,
    secretValue: OptionalTrimmedString,
    defaultModelId: OptionalTrimmedString,
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine(
    (value) =>
      value.providerId !== undefined ||
      value.label !== undefined ||
      value.secretRef !== undefined ||
      value.secretValue !== undefined ||
      value.defaultModelId !== undefined ||
      value.status !== undefined,
    { message: 'At least one provider profile field must be provided.' },
  )

export const CreateCronScheduleRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  workspaceId: OptionalTrimmedString,
  agentId: OptionalTrimmedString,
  providerProfileId: OptionalTrimmedString,
  computerId: OptionalTrimmedString,
  label: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  cronExpr: z.string().trim().min(1),
  timezone: z.enum(['local', 'utc']).optional(),
  allowedTools: z.array(z.string().trim().min(1)).default([]),
  runtimeProfile: MainspringRuntimeProfileIdSchema.optional(),
  enabled: z.boolean().optional(),
})

export const CreateBudgetRequestSchema = z.object({
  scopeType: z.enum(['client', 'workspace', 'agent']),
  scopeId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  maxEstimatedCostUsd: z.number().finite().min(0),
  warnAtUsd: z.number().finite().min(0).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).refine(
  (value) => value.warnAtUsd === undefined || value.warnAtUsd <= value.maxEstimatedCostUsd,
  { message: 'Budget warn threshold must be less than or equal to the max estimated cost.' },
)

const DeploymentTargetKindSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/)

const DeploymentTargetConfigSchema = z.record(z.string(), z.unknown())

export const CreateDeploymentTargetRequestSchema = z.object({
  workspaceId: OptionalTrimmedString,
  label: z.string().trim().min(1),
  kind: DeploymentTargetKindSchema,
  config: DeploymentTargetConfigSchema.optional(),
})

export const UpdateDeploymentTargetRequestSchema = z.object({
  workspaceId: OptionalTrimmedString,
  label: OptionalTrimmedString,
  kind: DeploymentTargetKindSchema.optional(),
  status: z.enum(['active', 'archived']).optional(),
  config: DeploymentTargetConfigSchema.optional(),
}).refine(
  (value) =>
    value.workspaceId !== undefined ||
    value.label !== undefined ||
    value.kind !== undefined ||
    value.status !== undefined ||
    value.config !== undefined,
  { message: 'At least one deployment target field must be provided.' },
)

export const DeploymentPlanRequestSchema = z.object({
  operation: z.enum(['deploy', 'rollback', 'destroy']),
})

export const ExecuteDeploymentRequestSchema = z.object({
  operation: z.enum(['deploy', 'rollback', 'destroy']),
  confirm: z.string().trim().min(1),
})

export const InstallMarketplaceTemplateRequestSchema = z.object({
  workspaceRoot: z.string().trim().min(1),
  clientName: OptionalTrimmedString,
  workspaceName: OptionalTrimmedString,
  agentName: OptionalTrimmedString,
})

export const UpdateCronScheduleRequestSchema = z
  .object({
    sessionId: OptionalTrimmedString,
    workspaceId: OptionalTrimmedString,
    agentId: OptionalTrimmedString,
    providerProfileId: OptionalTrimmedString,
    computerId: OptionalTrimmedString,
    label: OptionalTrimmedString,
    prompt: OptionalTrimmedString,
    cronExpr: OptionalTrimmedString,
    timezone: z.enum(['local', 'utc']).optional(),
    allowedTools: z.array(z.string().trim().min(1)).optional(),
    runtimeProfile: MainspringRuntimeProfileIdSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.sessionId !== undefined ||
      value.workspaceId !== undefined ||
      value.agentId !== undefined ||
      value.providerProfileId !== undefined ||
      value.computerId !== undefined ||
      value.label !== undefined ||
      value.prompt !== undefined ||
      value.cronExpr !== undefined ||
      value.timezone !== undefined ||
      value.allowedTools !== undefined ||
      value.runtimeProfile !== undefined ||
      value.enabled !== undefined,
    { message: 'At least one cron schedule field must be provided.' },
  )

export const CreateCronGrantRequestSchema = z.object({
  expiresAt: OptionalTrimmedString,
  expiresInMs: z.number().int().positive().optional(),
  maxExecutionCount: z.number().int().positive().optional(),
  actor: OptionalTrimmedString,
}).refine(
  (value) => value.expiresAt === undefined || Number.isFinite(Date.parse(value.expiresAt)),
  { message: 'Cron grant expiration must be a valid timestamp.' },
)

export const ProvenanceReviewDecisionRequestSchema = z.object({
  workspaceId: z.string().trim().min(1),
  decision: z.enum(['approved', 'rejected']),
  reviewer: OptionalTrimmedString,
  reason: OptionalTrimmedString,
})

export const ApplyProvenanceReviewRequestSchema = z.object({
  workspaceId: z.string().trim().min(1),
  reviewer: OptionalTrimmedString,
})

const MemoryHistoryWorkspaceIdSchema = z.string().trim().min(1).max(160)
const MemoryMutationReasonSchema = z.string().trim().max(500).optional().transform((value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
})

export const CorrectMemoryEntryRequestSchema = z.object({
  workspaceId: MemoryHistoryWorkspaceIdSchema,
  text: z.string().trim().min(1).max(8_000),
  reason: MemoryMutationReasonSchema,
}).strict()

export const DeleteMemoryEntryRequestSchema = z.object({
  workspaceId: MemoryHistoryWorkspaceIdSchema,
  reason: MemoryMutationReasonSchema,
}).strict()

export const UpdateBudgetRequestSchema = z
  .object({
    label: OptionalTrimmedString,
    maxEstimatedCostUsd: z.number().finite().min(0).optional(),
    warnAtUsd: z.number().finite().min(0).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine(
    (value) =>
      value.label !== undefined ||
      value.maxEstimatedCostUsd !== undefined ||
      value.warnAtUsd !== undefined ||
      value.status !== undefined,
    { message: 'At least one budget field must be provided.' },
  )

export type StartRunRequest = z.infer<typeof StartRunRequestSchema>
export type RetryRunRequest = z.infer<typeof RetryRunRequestSchema>
export type CreateHostedAuthUserRequest = z.infer<typeof CreateHostedAuthUserRequestSchema>
export type UpdateHostedAuthUserRequest = z.infer<typeof UpdateHostedAuthUserRequestSchema>
export type ResolveApprovalRequest = z.infer<typeof ResolveApprovalRequestSchema>
export type CreateClientRequest = z.infer<typeof CreateClientRequestSchema>
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>
export type UpdateClientRequest = z.infer<typeof UpdateClientRequestSchema>
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>
export type CreateProviderProfileRequest = z.infer<typeof CreateProviderProfileRequestSchema>
export type UpdateProviderProfileRequest = z.infer<typeof UpdateProviderProfileRequestSchema>
export type CreateCronScheduleRequest = z.infer<typeof CreateCronScheduleRequestSchema>
export type UpdateCronScheduleRequest = z.infer<typeof UpdateCronScheduleRequestSchema>
export type CreateCronGrantRequest = z.infer<typeof CreateCronGrantRequestSchema>
export type ProvenanceReviewDecisionRequest = z.infer<typeof ProvenanceReviewDecisionRequestSchema>
export type ApplyProvenanceReviewRequest = z.infer<typeof ApplyProvenanceReviewRequestSchema>
export type CorrectMemoryEntryRequest = z.infer<typeof CorrectMemoryEntryRequestSchema>
export type DeleteMemoryEntryRequest = z.infer<typeof DeleteMemoryEntryRequestSchema>
export type CreateBudgetRequest = z.infer<typeof CreateBudgetRequestSchema>
export type UpdateBudgetRequest = z.infer<typeof UpdateBudgetRequestSchema>
export type CreateDeploymentTargetRequest = z.infer<typeof CreateDeploymentTargetRequestSchema>
export type UpdateDeploymentTargetRequest = z.infer<typeof UpdateDeploymentTargetRequestSchema>
export type DeploymentPlanRequest = z.infer<typeof DeploymentPlanRequestSchema>
export type ExecuteDeploymentRequest = z.infer<typeof ExecuteDeploymentRequestSchema>
export type InstallMarketplaceTemplateRequest = z.infer<typeof InstallMarketplaceTemplateRequestSchema>
