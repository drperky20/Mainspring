import { z } from 'zod'

export const StartRunRequestSchema = z.object({
  sessionId: z.string().min(1),
  input: z.string().min(1),
  mode: z.literal('chat').default('chat'),
  allowedTools: z.array(z.string().min(1)).default([]),
  workspaceId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  providerProfileId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  runtimeProfile: z.enum(['core', 'core-browser', 'core-browser-memory']).optional(),
})

export const ResolveApprovalRequestSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  reason: z.string().trim().min(1).optional(),
  response: z.unknown().optional(),
})

export type StartRunRequest = z.infer<typeof StartRunRequestSchema>
export type ResolveApprovalRequest = z.infer<typeof ResolveApprovalRequestSchema>
